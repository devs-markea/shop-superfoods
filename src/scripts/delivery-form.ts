// Vista de datos de entrega.
//
// Reune la mitad del pedido que el carrito no tiene —modo de entrega, cliente y
// direccion— y la deja en el borrador para que sobreviva a las pantallas de pago.
// Nada de esto viaja en la URL: ver src/lib/checkout-draft.ts.
//
// El modo de entrega es lo primero que se decide porque manda sobre el resto del
// flujo: a domicilio hay que decir donde entregar y hay tres formas de pagar; al
// recoger no hay direccion que dar y el efectivo es la unica.
//
// Pendiente: precargar el formulario con GET /api/customer cuando la sesion ya
// haya cerrado un pedido ("¿enviamos a la misma direccion?").

// Solo esta pantalla usa dropdown, asi que su JS (y Popper) se importa aqui y
// no en scripts/bootstrap.ts: el listado no paga por lo que no usa.
// Declarado en vite.optimizeDeps.include, como el resto del JS de Bootstrap.
import 'bootstrap/js/dist/dropdown.js';

import { paintCartSummary } from '../lib/cart-summary';
import { throttleMessage } from '../lib/throttle';
import {
  draftGaps,
  hasSharedLocation,
  listGaps,
  patchDraft,
  phoneDigits,
  readDraft,
} from '../lib/checkout-draft';
import { bindDeliverySwitch, checkedDeliveryType } from '../lib/delivery-switch';
import { mountLocationMap } from '../lib/location-map';
import { createMapPicker } from '../lib/map-picker';
import {
  coordsFromMapsUrl,
  otherSpot,
  quoteFromResponse,
  resolveShipping,
  type FreeShippingRule,
  type ShippingQuote,
  type ShippingQuoteResponse,
} from '../lib/shipping';
import type { CheckoutCustomer, DeliveryType } from '../lib/checkout';

const form = document.querySelector<HTMLFormElement>('[data-delivery-form]');

if (form) {
  const value = (name: string): string =>
    form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value.trim() ??
    '';

  // --- Avisos ---
  // El aviso escrito de lo que falta por rellenar, y el de la zona de reparto,
  // que es otra cosa: no frena el pedido, solo cuenta que la tienda entrega en
  // Cancun y que ese envio se cotiza al final.
  const error = form.querySelector<HTMLElement>('[data-delivery-error]');
  const areaNotice = form.querySelector<HTMLElement>('[data-area-notice]');
  const areaNoticeText = form.querySelector<HTMLElement>('[data-area-notice-text]');

  // Modo de pruebas del servidor. Con el puesto no se avisa de nada, ni siquiera
  // de un aviso que se hubiera guardado antes de encenderlo.
  const testMode = form.dataset.testMode !== undefined;

  const showError = (message: string | null): void => {
    if (!error) return;
    error.textContent = message ?? '';
    error.hidden = !message;
  };

  /**
   * Pone o quita el aviso de zona. El servidor ya lo dejo pintado con lo que
   * recordaba el borrador; esto lo actualiza cuando llega un veredicto nuevo.
   *
   * No hace falta esconderlo al pasar a "Para recoger": vive dentro del bloque de
   * direccion, que el switch oculta entero.
   */
  const showAreaNotice = (message: string | null): void => {
    if (!areaNotice) return;
    if (areaNoticeText && message) areaNoticeText.textContent = message;
    areaNotice.hidden = !message;
  };

  // --- El candado de continuar ---
  // Continuar solo se enciende cuando el formulario esta listo para salir de
  // aqui: los campos OBLIGATORIOS rellenos, el telefono utilizable y —a
  // domicilio— el punto en el mapa. Los opcionales no cuentan: entre calles y
  // referencias ayudan a encontrar el portal, pero el pedido sale sin ellos.
  //
  // La ubicacion cuenta como uno mas. La direccion escrita nombra la casa, pero
  // el punto es lo que mide el envio y lo que lleva al repartidor hasta el
  // portal: ninguna sustituye a la otra. Ver draftGaps() en
  // src/lib/checkout-draft.ts, que vuelve a pedir las dos al cerrar el pedido.
  //
  // Los dos "Continuar" —el de la barra del fondo en movil y el de la tarjeta de
  // resumen en desktop— se apagan mientras falte algo, pero SIGUEN siendo
  // pulsables a proposito: un `disabled` real no emite click, y entonces no
  // habria forma de contar QUE falta. Pulsarlos lleva al mismo sitio que antes,
  // al envio, que es quien reparte los avisos. Es la misma mecanica del boton de
  // la ficha de producto (ver setBlocked() en src/scripts/order-form.ts).
  const submitButtons = form.querySelectorAll<HTMLButtonElement>('button[type="submit"]');

  /**
   * Si falta el punto en el mapa. Al recoger no hay ninguno que pedir.
   *
   * Da igual por cual de los caminos salga —el mapa en linea, el de la hoja o el
   * respaldo del dispositivo—: los tres acaban en el mismo input oculto, y ese es
   * el unico que se mira aqui.
   */
  const locationMissing = (): boolean =>
    checkedDeliveryType(form) === 'delivery' && !value('locationUrl');

  /**
   * Si el formulario podria salir tal y como esta.
   *
   * Son las MISMAS tres preguntas que hace el envio, en el mismo orden, para que
   * el boton encendido y el envio no puedan contradecirse: encendido significa
   * "esto avanza", y apagado, "pulsalo y te digo que falta".
   *
   * `checkValidity()` cubre los obligatorios y solo los obligatorios: los dos
   * campos opcionales de la direccion no llevan `required`, y los de la direccion
   * dejan de llevarlo al pasar a "Para recoger" (ver el switch, mas abajo).
   */
  const canContinue = (): boolean =>
    form.checkValidity() && phoneDigits(value('phone')).length >= 10 && !locationMissing();

  /** Enciende o apaga los dos "Continuar". */
  const syncContinue = (): void => {
    const blocked = !canContinue();
    for (const button of submitButtons) button.setAttribute('aria-disabled', String(blocked));
  };

  // Lo que puede cambiar la respuesta: escribir en un campo y elegir en el switch.
  // `input` cubre el tecleo —`change` en un campo de texto no llega hasta salir de
  // el, y el boton se quedaria apagado con todo relleno—; el resto de momentos los
  // avisa quien los provoca: el switch, elegir ubicacion y quitarla.
  form.addEventListener('input', syncContinue);
  form.addEventListener('change', syncContinue);

  const saved = readDraft();

  /**
   * La cotizacion de la ubicacion compartida: importe, kilometros, si se entrega
   * ahi y el aviso si no. Se declara aqui arriba —antes que todo lo que la usa—
   * porque la tarjeta de resumen la lee desde el primer momento, y el switch de
   * entrega la consulta ya al arrancar.
   *
   * Sin ubicacion en el borrador se arranca sin ella, aunque la cookie recuerde
   * un importe: es la misma regla con la que el servidor acaba de pintar la
   * tarjeta (hasSharedLocation), y las dos tienen que decir lo mismo o el envio
   * cambiaria solo al arrancar el JavaScript.
   */
  let quote: ShippingQuote | null = hasSharedLocation(saved) ? saved.shipping : null;

  // --- Tarjeta de resumen (desktop) ---
  // La misma tarjeta de /mamayaya/carrito, con la cuenta del pedido. Aqui los importes de
  // los productos no se mueven —eso es del carrito—, pero el envio si, y por dos
  // caminos: compartir una ubicacion lo mide, y el switch de entrega lo quita
  // entero. Las dos cosas pasan en esta pantalla, asi que la tarjeta se vuelve a
  // resolver con la MISMA funcion que uso el servidor (src/lib/shipping.ts) en
  // lugar de arrastrar el importe con el que se cargo la pagina.
  const amount = (name: string): number => Number.parseFloat(form.dataset[name] ?? '') || 0;

  const products = amount('products');
  const threshold = amount('threshold');

  const freeShipping: FreeShippingRule = {
    mode:
      form.dataset.freeShipping === 'always'
        ? 'always'
        : form.dataset.freeShipping === 'threshold'
          ? 'threshold'
          : 'none',
    threshold: threshold || null,
  };

  const repaintSummary = (): void => {
    paintCartSummary(form, {
      subtotal: amount('subtotal'),
      discount: amount('discount'),
      products,
      shipping: resolveShipping({
        pickup: checkedDeliveryType(form) === 'pickup',
        quote,
        products,
        freeShipping,
      }),
    });
  };

  // --- Selector de codigo de pais ---
  const toggle = form.querySelector<HTMLElement>('[data-country-toggle]');
  const codeOutput = form.querySelector<HTMLElement>('[data-country-code]');
  const hiddenValue = form.querySelector<HTMLInputElement>('[data-country-value]');

  for (const option of form.querySelectorAll<HTMLElement>('[data-country-option]')) {
    option.addEventListener('click', () => {
      const dialCode = option.dataset.dialCode;
      if (!dialCode || !toggle || !codeOutput || !hiddenValue) return;

      codeOutput.textContent = dialCode;
      hiddenValue.value = dialCode;

      // La bandera se clona de la opcion elegida: asi el SVG se define una sola
      // vez, en el marcado, y el script no tiene que conocer los trazados.
      const source = option.querySelector('svg');
      const target = toggle.querySelector('svg');
      if (source && target) {
        const clone = source.cloneNode(true) as SVGElement;
        clone.setAttribute('class', 'country-select__flag');
        target.replaceWith(clone);
      }

      for (const other of form.querySelectorAll('[data-country-option]')) {
        other.classList.toggle('active', other === option);
        other.setAttribute('aria-current', String(other === option));
      }
    });
  }

  // --- Modo de entrega ---
  // El switch decide la mitad de esta pantalla:
  //
  //   a domicilio  hay que decir donde entregar -> ubicacion y direccion, con los
  //                tres campos de la direccion obligatorios
  //   para recoger el pedido se recoge en el local -> el bloque entero desaparece,
  //                y con el la obligacion
  //
  // Se oculta y no solo se deja opcional: un campo visible es un campo que alguien
  // va a rellenar, y una direccion de entrega en un pedido que nadie va a llevar
  // solo puede confundir a quien lo prepara.
  //
  // Es el mismo switch del listado y la misma eleccion: al llegar aqui ya viene
  // marcada, y cambiarla aqui la guarda —esta pantalla es la que manda, pero
  // volver al menu no puede ensenar un modo distinto del que se acaba de elegir—.
  // De eso se encarga bindDeliverySwitch, que ademas repone el modo guardado
  // cuando la pestana vuelve a la vista y cae al defecto si ya caduco.
  const addressBlock = form.querySelector<HTMLElement>('[data-address-block]');
  const addressNames = ['neighborhood', 'street', 'number'];

  bindDeliverySwitch(form, (type: DeliveryType) => {
    const home = type === 'delivery';

    if (addressBlock) addressBlock.hidden = !home;

    // Un campo oculto y obligatorio bloquea el envio sin poder mostrar su globo:
    // el navegador no sabe donde ponerlo.
    for (const name of addressNames) {
      const field = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (field) field.required = home;
    }

    // Al recoger no hay envio del que hablar y su fila se retira de la tarjeta.
    // Va aqui dentro y no en un listener propio para cubrir los tres momentos que
    // avisan —arranque, eleccion y vuelta atras—: al reponer el modo guardado los
    // radios no emiten `change`.
    repaintSummary();

    // Y el candado se recalcula con el modo, que cambia las dos mitades de la
    // pregunta: al recoger no hay punto que pedir y los tres campos de la
    // direccion dejan de ser obligatorios.
    syncContinue();
  });

  // --- Ubicacion ---
  const shareButton = form.querySelector<HTMLButtonElement>('[data-share-location]');
  const locationUrl = form.querySelector<HTMLInputElement>('[data-location-url]');
  const selected = form.querySelector<HTMLElement>('[data-location-selected]');
  const locationLabel = form.querySelector<HTMLElement>('[data-location-label]');
  const locationLink = form.querySelector<HTMLAnchorElement>('[data-location-link]');
  const clearButton = form.querySelector<HTMLButtonElement>('[data-location-clear]');

  // La ubicacion no sustituye a la direccion escrita: la precisa, y a domicilio
  // se piden las dos. Elegirla se ve aqui y en los dos "Continuar", que es lo que
  // abre el candado.
  const showLocation = (url: string, label: string): void => {
    if (locationUrl) locationUrl.value = url;
    if (locationLabel) locationLabel.textContent = label;
    if (locationLink) locationLink.href = url;
    if (selected) selected.hidden = false;

    syncContinue();
  };

  /**
   * Ensena la ubicacion Y la guarda, que es lo que hace que sobreviva a la
   * pantalla.
   *
   * Se guarda AL COMPARTIRLA, no al continuar. El punto y su cotizacion son un
   * solo dato: guardar el importe y dejar el punto en un input suelto hacia que
   * una recarga se quedara con el envio de una ubicacion que el formulario ya no
   * ensenaba —y que el pedido, que sale sin ella, tampoco iba a llevar—.
   */
  const saveLocation = (url: string, label: string): void => {
    showLocation(url, label);
    patchDraft({ customer: { locationUrl: url }, locationLabel: label });
  };

  const clearLocation = (): void => {
    if (locationUrl) locationUrl.value = '';
    if (selected) selected.hidden = true;
    // Sin punto no hay cotizacion: era de esa ubicacion, y guardarla dejaria
    // rotulando el envio de una direccion que ya no es la del pedido. Con ella se
    // va el aviso, que tambien era de ese punto: quien quita una ubicacion de otra
    // ciudad vuelve a estar como quien no comparte ninguna, con la direccion
    // escrita que esta pantalla no puede comprobar.
    //
    // Se van las dos del borrador, no solo de la pantalla: quitarla solo aqui la
    // dejaba guardada, y bastaba con recargar para que volviera —y con ella el
    // importe, recuperado de la sesion—.
    quote = null;
    patchDraft({ shipping: null, locationLabel: '', customer: { locationUrl: '' } });
    showAreaNotice(null);

    // Y el envio vuelve a "Por cotizar", que es lo que era antes de compartirla.
    repaintSummary();

    // Con el punto se va tambien el permiso para seguir: quitar la ubicacion deja
    // el pedido como estaba al entrar, sin saber a donde va.
    syncContinue();
  };

  clearButton?.addEventListener('click', clearLocation);

  /**
   * Si la ubicacion escribe la direccion. APAGADO por ahora.
   *
   * Se queda todo montado —el buscador sigue pidiendo la direccion de la
   * sugerencia, que viaja gratis en la misma consulta, y la cotizacion sigue
   * devolviendo la suya— y lo unico que hace este interruptor es no tocar los
   * campos. Ponerlo en `true` lo devuelve entero, sin nada mas que cambiar.
   */
  const FILL_ADDRESS_FROM_LOCATION = false;

  /** Escribe un campo. Sin texto no hace nada: no se vacia lo que ya hubiera. */
  const writeField = (name: string, text: string | undefined): void => {
    const field = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (field && text) field.value = text;
  };

  /**
   * La direccion de un punto, en los campos que la admiten: colonia y calle.
   *
   * PISA lo que hubiera escrito. La direccion escrita y la ubicacion son la misma
   * casa contada de dos maneras, asi que mover el punto y dejar la calle anterior
   * es mandar el pedido a dos sitios; manda el punto, que es el que el comprador
   * acaba de confirmar viendolo en el mapa.
   *
   * Lo que NO hace es vaciar: si de la ubicacion nueva no sale colonia —no toda
   * direccion la trae—, se queda la que estuviera en lugar de borrarla.
   *
   * El NUMERO no entra, venga de donde venga. Google lo devuelve del portal que
   * indexo, y en Cancun eso acaba siendo el numero de al lado, el de la manzana o
   * ninguno; ademas es el unico dato de la direccion que el comprador tiene
   * delante sin discusion —y el que distingue su casa de la del vecino—. Se
   * escribe a mano, con el interior si lo hay.
   */
  const fillAddress = (address: { neighborhood?: string; street?: string } | null): void => {
    if (!FILL_ADDRESS_FROM_LOCATION) return;

    writeField('neighborhood', address?.neighborhood);
    writeField('street', address?.street);
  };

  // --- La ubicacion compartida ---
  // Todo lo que se sabe del punto sale de una sola peticion: cuanto cuesta llegar,
  // si la tienda entrega ahi y como se escribe esa direccion. Lo mide y lo decide
  // el BACKEND —aqui no se calcula ningun precio—; esta pantalla solo pregunta,
  // guarda la respuesta y la pinta.
  //
  // Se pregunta UNA VEZ por punto: hay ubicacion y todavia no hay respuesta para
  // ella. Cada consulta gasta cuota de un tercero allí arriba, y ni la distancia
  // ni la ciudad de un punto cambian al pasar de pantalla o al volver atras.
  //
  // Ver `feature/medicion-de-distancia-en-backend.md` en la documentacion.

  /** La direccion del punto, en los campos que pide este formulario. */
  interface PlaceAddress {
    label?: string;
    neighborhood?: string;
    street?: string;
    exteriorNumber?: string;
  }

  interface Quoted {
    quote: ShippingQuote | null;
    address: PlaceAddress | null;
  }

  // `quote` —la cotizacion de este punto— se declara mas arriba: la tarjeta de
  // resumen y el switch la leen antes de llegar hasta aqui.

  /** La direccion del ultimo punto, para no volver a pedirla si se repite. */
  let lastAddress: PlaceAddress | null = null;

  /** Consulta en vuelo, para que "Continuar" no adelante a la respuesta. */
  let pending: Promise<Quoted | null> | null = null;

  // Numero de la ultima cotizacion pedida. Compartir un punto y cambiarlo enseguida
  // deja dos peticiones en el aire, y la primera puede contestar la ultima: sin
  // este contador, la respuesta del punto viejo pisaria a la del nuevo.
  let latest = 0;

  const askQuote = (lat: number, lng: number): Promise<Quoted | null> => {
    // De este punto ya se sabe todo: no se vuelve a preguntar. Una cotizacion sin
    // punto —la que recupero el servidor de la API, que no devuelve coordenadas—
    // no cuenta como sabida: hay que preguntar por esta.
    if (quote && quote.lat !== null && !otherSpot(quote, lat, lng)) {
      return Promise.resolve({ quote, address: lastAddress });
    }

    const ticket = ++latest;

    pending = (async () => {
      try {
        // La direccion escrita hasta este momento viaja con el punto: es lo que
        // le permite al backend resolver la zona de tarifa cuando el nombre de la
        // colonia la delata y las coordenadas no.
        const response = await fetch('/api/shipping/quote', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            deliveryType: 'delivery',
            location: { lat, lng },
            address: {
              neighborhood: value('neighborhood'),
              street: value('street'),
              exteriorNumber: value('number'),
              crossStreets: value('cross_streets'),
              references: value('references'),
            },
          }),
        });

        if (!response.ok) {
          // El 429 SE DICE. Cotizar tiene dos techos —el de ritmo de la API y el de cuota del
          // proveedor de rutas— y los dos se alcanzan compartiendo la ubicacion muchas veces
          // seguidas, que es un gesto deliberado. Callarlo dejaria el envio en "Por cotizar"
          // sin explicacion, y el comprador volveria a intentarlo: exactamente lo contrario de
          // lo que hay que hacer. El pedido sigue en pie igual.
          const throttled = throttleMessage(response);

          if (throttled) {
            showError(throttled);
            return null;
          }

          // 404 es el estado normal mientras la API no publique el endpoint: no
          // hay cotizacion, el envio se queda "Por cotizar" y el pedido sigue.
          // Cualquier otro estado si merece quedar anotado.
          if (response.status !== 404) {
            console.error('[envio] la API rechazo la cotizacion', response.status);
          }
          return null;
        }

        const body = (await response.json()) as {
          data?: (ShippingQuoteResponse & { address?: PlaceAddress | null }) | null;
        };

        // Llego tarde: por el camino se compartio otro punto, y esta respuesta ya
        // no es la del pedido.
        if (latest !== ticket) return null;

        const address = body.data?.address ?? null;
        lastAddress = address;

        quote = quoteFromResponse(body.data, { lat, lng });

        // Se guarda al llegar, sin esperar a "Continuar": si el comprador sale de
        // la pantalla y vuelve, la cotizacion sigue puesta y no se gasta otra
        // peticion.
        patchDraft({ shipping: quote });

        // El aviso de zona lo escribe el backend. Vacio significa que no hay nada
        // que decir, y entonces se retira el que hubiera de una ubicacion
        // anterior: dejarlo puesto seria hablar de una direccion que ya no es.
        showAreaNotice(testMode ? null : quote?.notice || null);

        // Y la tarjeta se repinta con lo que sea que haya contestado: un importe,
        // "Gratis" si el negocio lo regala, o "Por cotizar" si no se pudo.
        repaintSummary();

        return { quote, address };
      } catch {
        // Sin red no hay cotizacion, y no es culpa del comprador: el envio se
        // queda por cotizar y el pedido puede seguir.
        return null;
      } finally {
        // Solo se da por terminada la espera si esta seguia siendo la medicion
        // buena: la de un punto ya descartado no puede desbloquear "Continuar".
        if (latest === ticket) pending = null;
      }
    })();

    return pending;
  };

  /**
   * Toma el punto que se acepto en el mapa, lo rotula y lo cotiza.
   */
  const useLocation = async (lat: number, lng: number): Promise<void> => {
    // El formato que entiende cualquier cliente de Maps, y el que espera la API
    // en `customer.locationUrl`.
    const url = `https://www.google.com/maps?q=${lat},${lng}`;

    // El punto ya esta elegido, asi que se rotula —y se guarda— sin esperar a
    // nadie. Lo que falta —la direccion escrita— llega en la misma respuesta que
    // el importe y sustituye a este texto en cuanto la API contesta.
    saveLocation(url, 'Ubicacion elegida');
    showError(null);

    const address = (await askQuote(lat, lng))?.address;

    // Por el camino se puede haber elegido otro punto —la consulta tarda, y la
    // hoja se puede volver a abrir—: el rotulo que llega tarde no puede pisar al
    // que la pantalla ensena ahora, y menos guardarlo. Es la misma cautela que
    // askQuote() tiene con su contador, aqui contra la ubicacion vigente.
    if (locationUrl && locationUrl.value !== url) return;

    // Sin direccion resuelta, las coordenadas: se lee peor, pero deja comprobar
    // el punto, y lo que viaja al pedido es el enlace de Maps.
    saveLocation(url, address?.label || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);

    // Y la direccion que resolvio el backend pasa a los campos escritos, si eso
    // esta encendido: hoy no lo esta. Ver fillAddress().
    fillAddress(address ?? null);
  };

  // --- Elegir la ubicacion en el mapa ---
  //
  // El punto lo SENALA el comprador, en un mapa dentro de la hoja: se mueve el
  // mapa hasta el domicilio y se acepta. Ya no lo elige el navegador.
  //
  // El cambio no es de estilo. Pedirle la posicion al navegador devuelve un GPS
  // solo cuando hay sensor y permiso; en un escritorio, o con el sensor apagado,
  // lo que contesta se deduce de la IP del proveedor y puede caer en otra ciudad.
  // De ahi salian pedidos con el envio medido contra un punto donde no vive
  // nadie, y el comprador no tenia como enterarse: nunca vio el punto.
  //
  // Con el mapa lo ve antes de aceptarlo. El GPS sigue estando, pero degradado a
  // lo que sabe hacer bien: mover la camara. Ver src/lib/map-picker.ts.
  const picker = createMapPicker((lat, lng) => void useLocation(lat, lng));

  shareButton?.addEventListener('click', () => {
    // El mapa abre donde ya se eligio, si se eligio: volver a la hoja para
    // corregir el portal no puede empezar por buscar la ciudad otra vez.
    picker?.open(coordsFromMapsUrl(locationUrl?.value));
  });

  // La ubicacion elegida sobrevive a la pantalla: viaja en el borrador como
  // enlace de Maps, que es lo que espera la API. Al volver aqui —desde el pago o
  // con el boton atras— se repone, para no tener que pedirla otra vez y para que
  // el enlace siga en el pedido.
  const savedSpot = coordsFromMapsUrl(saved.customer.locationUrl);

  if (savedSpot && locationUrl && !locationUrl.value) {
    showLocation(saved.customer.locationUrl ?? '', saved.locationLabel || 'Ubicacion elegida');
  }

  // Hay ubicacion y todavia no hay cotizacion: se pide ahora. Pasa cuando se
  // continuo antes de que llegara la anterior, y cuando el borrador se perdio y
  // el servidor tampoco pudo recuperarla de la API.
  if (savedSpot && !quote) void askQuote(savedSpot.lat, savedSpot.lng);

  // --- El mapa, sin hoja ---
  // Si Google responde, el mapa no vive en una hoja: se pinta aqui mismo, en el
  // hueco del boton, y el punto se confirma con el boton verde de su cabecera.
  // El boton —y con el la hoja de arriba— queda para cuando Google NO responde.
  // Ver src/lib/location-map.ts, que es quien decide cual de los dos se ve.
  //
  // Lo que sale de los dos caminos es lo mismo, un punto, y lo recibe la misma
  // funcion: aqui no hay dos maneras de guardar una ubicacion.
  //
  // Se monta cuando hay a donde entregar. Al recoger, el bloque de direccion
  // esta oculto entero: Google mediria un hueco de cero y pintaria un mapa gris,
  // ademas de gastar la descarga del SDK en un pedido que no lleva direccion. Si
  // el switch cambia de idea, se monta entonces.
  const startLocationMap = (): void => {
    if (checkedDeliveryType(form) !== 'delivery') return;

    form.removeEventListener('change', startLocationMap);

    void mountLocationMap({
      // Abre donde ya se eligio, si se eligio: volver a esta pantalla no puede
      // empezar por buscar la ciudad otra vez.
      start: coordsFromMapsUrl(locationUrl?.value),
      onConfirm: (lat, lng) => void useLocation(lat, lng),
      onCancel: () => clearLocation(),
      // Buscar una direccion en el mapa ya dice la colonia y la calle, sin
      // esperar a confirmar el punto ni a que conteste la cotizacion. Queda
      // conectado, pero hoy no escribe nada: ver fillAddress().
      onAddress: (hint) => fillAddress(hint),
    });
  };

  form.addEventListener('change', startLocationMap);
  startLocationMap();

  // --- Continuar ---
  // Sigue siendo un submit, no un enlace, para que los campos required se
  // validen antes de avanzar.
  //
  // Son DOS: el de la barra del fondo en movil y el de la tarjeta de resumen en
  // desktop. Solo uno se ve a la vez, pero los dos existen en el marcado y los dos
  // envian este formulario, asi que la espera de la medicion los bloquea a los dos
  // —igual que el candado de la ubicacion, que es donde se buscan—.

  /** Lo que se espera como mucho a una cotizacion en vuelo, en milisegundos. */
  const QUOTE_TIMEOUT = 4000;

  /**
   * Guarda la cotizacion definitiva y avanza al pago.
   *
   * Puede haber una en vuelo —compartir la ubicacion y pulsar "Continuar"
   * seguido—, y avanzar sin ella dejaria el envio "Por cotizar" teniendo el
   * punto. Asi que se espera, pero con limite: la compra no puede quedarse parada
   * porque un tercero tarde en responder.
   *
   * Se guarda solo si es DE ESTA ubicacion. Compartir un punto nuevo y continuar
   * antes de que conteste dejaria pegado el importe del anterior, que es rotular
   * el envio de otra direccion.
   */
  const goToPayment = async (home: boolean, url: string): Promise<void> => {
    for (const button of submitButtons) button.disabled = true;

    if (home && pending) {
      await Promise.race([
        pending,
        new Promise((resolve) => window.setTimeout(resolve, QUOTE_TIMEOUT)),
      ]);
    }

    const spot = home ? coordsFromMapsUrl(url) : null;

    // Se conserva salvo que contradiga a la ubicacion actual. Una cotizacion sin
    // punto no contradice nada —es la que la API guarda para esta sesion— y se
    // queda; una de otro punto se descarta, que es rotular otra direccion.
    patchDraft({
      shipping: spot && quote && !otherSpot(quote, spot.lat, spot.lng) ? quote : null,
    });

    window.location.assign('/mamayaya/pago');
  };

  // Volver atras desde el pago puede reutilizar el documento tal cual quedo
  // (bfcache), y quedo con los dos "Continuar" apagados DE VERDAD: los apaga
  // goToPayment() para que no se envie dos veces el mismo formulario. Al volver
  // ya no hay envio en curso, asi que se devuelven; si no, la pantalla se
  // quedaria sin forma de seguir.
  //
  // El candado de la ubicacion no se toca aqui: ese es el aria-disabled, y lo
  // repone bindDeliverySwitch al reponer el modo en este mismo momento.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    for (const button of submitButtons) button.disabled = false;
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();

      // Ademas de los globos del navegador, el aviso queda escrito en la
      // pantalla: los globos se cierran al primer toque.
      showError('Completa los campos marcados para continuar.');
      return;
    }

    // A domicilio, sin punto no se sigue. Es lo que ya dice el boton apagado,
    // ahora escrito: sigue emitiendo click justamente para poder contarlo, y de
    // paso la pantalla se va hasta el mapa, que es donde se arregla.
    if (locationMissing()) {
      showError('Elige tu ubicacion en el mapa para continuar.');

      // El foco primero y el desplazamiento despues, como en la ficha de
      // producto: lo que importa es dejar el cursor donde se elige, no la
      // animacion. El primer boton a la vista del bloque es el que manda en cada
      // camino: el verde del mapa en linea, o el que abre la hoja sin el.
      const locationBlock = form.querySelector<HTMLElement>('[data-location]');

      locationBlock
        ?.querySelector<HTMLElement>('button:not([hidden]):not(:disabled)')
        ?.focus({ preventScroll: true });

      locationBlock?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // El telefono es la llave con la que el ERP identifica al cliente, asi que no
    // basta con que este relleno: uno ilegible metia a compradores distintos en el
    // mismo registro. La API lo rechaza con este mismo mensaje.
    if (phoneDigits(value('phone')).length < 10) {
      showError('Escribe un telefono valido, con 10 digitos.');
      return;
    }

    // Telefono en formato internacional. El ejemplo del contrato lo trae
    // nacional ("9981234567"), pero el campo acepta el +52 (comprobado contra
    // staging) y el selector de pais existe para algo.
    //
    // OJO: el ERP identifica al cliente POR TELEFONO. Si el panel guarda los
    // numeros en nacional, el mismo comprador saldria dos veces. Conviene
    // confirmar con backend cual de las dos formas es la canonica.

    // Al recoger solo viaja el contacto: la direccion no se pidio, y lo que quede
    // escrito en los campos ocultos es de una eleccion anterior. Lo que el
    // borrador siga recordando lo descarta toCheckoutRequest() al cerrar.
    //
    // El modo se lee del switch, no de lo que se guardo al tocarlo: es lo que el
    // comprador tiene delante al pulsar "Continuar".
    const mode = checkedDeliveryType(form);
    const home = mode === 'delivery';

    const customer: CheckoutCustomer = {
      name: value('name'),
      phone: `${value('country_code')}${value('phone')}`.trim(),
      ...(home
        ? {
            neighborhood: value('neighborhood'),
            street: value('street'),
            exteriorNumber: value('number'),
            crossStreets: value('cross_streets'),
            addressReferences: value('references'),
            locationUrl: value('locationUrl'),
          }
        : {}),
    };

    const draft = patchDraft({
      deliveryType: mode,
      customer,
      locationLabel: home ? (locationLabel?.textContent?.trim() ?? '') : '',
    });

    // Ultima red: si algo obligatorio sigue vacio, la API responderia 422 dos
    // pantallas mas adelante, cuando ya no hay donde arreglarlo.
    const gaps = draftGaps(draft);

    if (gaps.length > 0) {
      showError(`Falta ${listGaps(gaps)}.`);
      return;
    }

    showError(null);

    // Falta guardar la distancia, que puede seguir midiendose: por eso el ultimo
    // paso es asincrono y la navegacion vive ahi dentro.
    void goToPayment(home, customer.locationUrl ?? '');
  });
}
