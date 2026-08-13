// ---------------------------------------------------------------------------
// El envio, tal y como lo cuenta la tienda.
//
// Aqui NO se calcula ningun precio. El importe, los kilometros, la ciudad y el
// aviso los decide el backend y llegan por `/api/shipping/quote`; este modulo
// solo los valida, los guarda en una forma que el borrador pueda llevar hasta el
// pago, y decide cual de los cuatro estados se pinta.
//
// Lo unico que sigue resolviendose aqui es el ENVIO GRATIS, y por un motivo: se
// gana cruzando un importe del carrito, que es un dato que el navegador ya tiene.
// Resolverlo aqui deja que la tarjeta pase a "Gratis" en el mismo momento en que
// se pulsa el "+", sin ir y volver del servidor. Es la misma regla que aplica el
// backend al cotizar, asi que las dos respuestas coinciden.
//
// Isomorfico a proposito, como src/lib/checkout.ts: no importa nada de
// `astro:env`, asi que vale igual en el frontmatter de una pagina y en un
// <script> de cliente. Los dos lo necesitan —el servidor pinta el resumen y el
// navegador lo repinta al cambiar una cantidad— y el estado no puede salir de dos
// sitios distintos.
//
// Ver `feature/medicion-de-distancia-en-backend.md` en la documentacion.
// ---------------------------------------------------------------------------

import { formatPrice } from './price';

/**
 * Lo que el backend contesto sobre el envio a un punto.
 *
 * Es lo que viaja en el borrador entre /datos y el cierre: se pide UNA VEZ, al
 * compartir la ubicacion, y de ahi en adelante solo se lee. Si se pierde —la
 * cookie dura dos horas— se vuelve a pedir a la API, que la recuerda mientras
 * dure la sesion del carrito.
 *
 * Guarda el punto para poder comprobar que la cotizacion sigue siendo la de la
 * ubicacion que el pedido lleva ahora: compartir otra la invalida.
 */
export interface ShippingQuote {
  /**
   * Importe en MXN, o `null` cuando no se pudo cotizar —el punto no es
   * enrutable, el proveedor de rutas no contesto, o no hay tarifa configurada—.
   * Sin importe, la tienda dice "Por cotizar", que es lo que decia antes de que
   * hubiera medicion.
   */
  cost: number | null;
  /** Kilometros por carretera, para rotularlos junto al importe. */
  km: number | null;
  /**
   * El punto cotizado, cuando se sabe cual fue.
   *
   * Al cotizar lo sabe la tienda —acaba de preguntar por el— pero al RECUPERAR
   * una cotizacion no: la respuesta de la API no incluye las coordenadas, asi que
   * llega en null. Sin punto no se puede comprobar que la cotizacion siga siendo
   * la de la ubicacion del pedido, y entonces se acepta lo que diga la sesion:
   * es de esa sesion y es lo unico que hay.
   */
  lat: number | null;
  lng: number | null;
  /** Referencia de la cotizacion, para que el pedido pueda auditarla. */
  quoteId: string;
  /** Si la tienda entrega ahi. */
  serviceable: boolean;
  /** Si el negocio lo regala en este pedido. */
  free: boolean;
  /**
   * El aviso de la API, ya escrito para el comprador ("...esta en Playa del
   * Carmen. Entregamos a domicilio en Cancun..."). Vacio cuando no hay nada que
   * decir. Se muestra tal cual: quien lo redacta es quien conoce la regla.
   */
  notice: string;
}

/**
 * Aviso de reserva por si el backend marca un punto como fuera de zona y no
 * manda texto. No inventa nada que la API no diga —solo dice donde entrega la
 * tienda— y evita que el comprador se quede sin explicacion.
 */
export const AREA_NOTICE_FALLBACK =
  'Entregamos a domicilio en Cancun, Quintana Roo. El costo de envio de tu pedido se confirmara al finalizarlo.';

/**
 * Cotizacion valida, o null.
 *
 * Dos entradas pasan por aqui y ninguna es de fiar: la respuesta de la API y la
 * cookie del borrador, que escribe el navegador. Un importe negativo, un texto
 * donde va un numero o un objeto a medias se descartan enteros, y entonces el
 * envio vuelve a "Por cotizar".
 *
 * El importe se guarda tal cual lo dio la API. Es solo para MOSTRARLO: lo que se
 * cobra lo calcula el backend al cerrar el pedido, asi que una cookie manipulada
 * solo cambia lo que el comprador se ensena a si mismo.
 */
export function parseQuote(value: unknown): ShippingQuote | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Partial<ShippingQuote>;

  const number = (input: unknown): number | null =>
    typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : null;

  const coordinate = (input: unknown): number | null =>
    typeof input === 'number' && Number.isFinite(input) ? input : null;

  // Los kilometros llegan del proveedor de rutas con toda su precision de coma
  // flotante (3.3999999999999999…). Se recortan al decimal con el que se rotulan:
  // asi la cookie no engorda con veinte decimales que nadie va a leer.
  const km = number(raw.km);

  return {
    cost: number(raw.cost),
    km: km === null ? null : Math.round(km * 10) / 10,
    lat: coordinate(raw.lat),
    lng: coordinate(raw.lng),
    quoteId: typeof raw.quoteId === 'string' ? raw.quoteId : '',
    // Solo un `false` explicito deja un punto fuera de zona: ante una cotizacion
    // a medias, lo que no se sabe no avisa de nada.
    serviceable: raw.serviceable !== false,
    free: raw.free === true,
    notice: typeof raw.notice === 'string' ? raw.notice : '',
  };
}

/**
 * Como llega la cotizacion en el cuerpo de `/api/shipping/quote`.
 *
 * Las claves sin valor viajan en `null` en lugar de desaparecer, al reves que el
 * resto del contrato: aqui no se comprueba presencia, se leen los dos booleanos.
 */
export interface ShippingQuoteResponse {
  quoteId?: string;
  serviceable?: boolean;
  quotable?: boolean;
  distanceKm?: number | null;
  cost?: number | null;
  free?: boolean;
  message?: string | null;
}

/**
 * De la respuesta de la API a la cotizacion que guarda la tienda.
 *
 * El punto lo pone quien pregunto, porque la respuesta no lo trae: al cotizar la
 * tienda sabe por cual punto pregunto, y al recuperar una cotizacion no. Ver
 * `lat`/`lng` en ShippingQuote.
 */
export function quoteFromResponse(
  data: ShippingQuoteResponse | null | undefined,
  asked?: { lat: number; lng: number },
): ShippingQuote | null {
  if (!data) return null;

  const serviceable = data.serviceable !== false;

  return parseQuote({
    cost: data.cost,
    km: data.distanceKm,
    lat: asked?.lat ?? null,
    lng: asked?.lng ?? null,
    quoteId: data.quoteId,
    serviceable,
    free: data.free === true,
    // Solo se rotula el aviso cuando hay algo que avisar: un mensaje de la API en
    // una cotizacion normal no tendria donde ponerse.
    notice: serviceable ? '' : (data.message ?? '') || AREA_NOTICE_FALLBACK,
  });
}

/**
 * Si la cotizacion contradice a ESTE punto.
 *
 * Se pregunta al reves —"¿es de otro sitio?"— porque el caso a evitar es
 * quedarse con el importe de una ubicacion anterior. Una cotizacion sin punto no
 * contradice nada: es la que recupero la API para esta sesion, y no hay con que
 * desmentirla.
 *
 * Cinco decimales es alrededor de un metro: el mismo redondeo con el que se
 * rotula la ubicacion.
 */
export function otherSpot(quote: ShippingQuote, lat: number, lng: number): boolean {
  if (quote.lat === null || quote.lng === null) return false;

  return quote.lat.toFixed(5) !== lat.toFixed(5) || quote.lng.toFixed(5) !== lng.toFixed(5);
}

/** Un par de coordenadas, con separador flexible. */
const PAIR = String.raw`(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)`;

/**
 * Las formas en las que un punto puede llegar escrito. Se prueban en orden y gana
 * la primera que de un par valido.
 *
 * Son las que produce Google Maps al compartir o al copiar de la barra de
 * direcciones, mas el par pelado que sale de "copiar coordenadas" en el mapa.
 */
const COORD_PATTERNS = [
  // El que escribe la tienda, y el de "compartir" de Maps.
  new RegExp(String.raw`[?&](?:q|query|ll|daddr|center|destination)=${PAIR}`, 'i'),
  // El centro del mapa en la URL: /maps/@21.16,-86.82,17z
  new RegExp(String.raw`@${PAIR}`),
  // El punto exacto del lugar, dentro del `data=` de una ficha de Maps.
  /!3d(-?\d{1,3}(?:\.\d+)?)!4d(-?\d{1,3}(?:\.\d+)?)/,
  // Pegado a pelo: "21.164693, -86.823638"
  new RegExp(String.raw`^\s*${PAIR}\s*$`),
];

/**
 * El punto que haya dentro de un texto: un enlace de Google Maps de cualquiera de
 * sus formas, o unas coordenadas pegadas a mano.
 *
 * Devuelve null si no hay ninguno reconocible o si cae fuera del planeta. El
 * (0, 0) tambien se descarta: es el resultado tipico de un campo a medio pegar, y
 * esta en el Atlantico.
 */
export function parseCoords(text: string | undefined | null): { lat: number; lng: number } | null {
  const input = (text ?? '').trim();
  if (!input) return null;

  for (const pattern of COORD_PATTERNS) {
    const match = pattern.exec(input);
    if (!match) continue;

    const lat = Number.parseFloat(match[1]);
    const lng = Number.parseFloat(match[2]);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    if (lat === 0 && lng === 0) continue;

    return { lat, lng };
  }

  return null;
}

/**
 * Si el texto es un enlace corto de Maps (`maps.app.goo.gl`).
 *
 * Esos no llevan las coordenadas dentro: hay que seguir la redireccion para
 * saber a donde apuntan, y eso el navegador no lo puede hacer contra otro
 * dominio. Se reconocen aparte para poder decir que hay que abrirlos y copiar el
 * enlace largo, en lugar de un "no lo entendemos" que no ayuda a nadie.
 */
export function isShortMapsLink(text: string | undefined | null): boolean {
  return /\b(?:maps\.app\.goo\.gl|goo\.gl\/maps)\b/i.test(text ?? '');
}

/**
 * El punto de un enlace de Maps de los que escribe la tienda
 * (`https://www.google.com/maps?q=21.16,-86.82`).
 *
 * Sirve para recuperar el punto cuando se vuelve a /datos: la ubicacion viaja en
 * el borrador como enlace, que es lo que espera la API del pedido, y de ahi salen
 * otra vez las coordenadas.
 */
export function coordsFromMapsUrl(url: string | undefined | null): { lat: number; lng: number } | null {
  return parseCoords(url);
}

/**
 * Regla de envio gratis del negocio. Es la de `delivery.freeShipping` de
 * GET /api/store; se declara aqui con su forma para que este modulo no tenga que
 * importar src/lib/store-config.ts, que es solo de servidor.
 */
export interface FreeShippingRule {
  mode: 'none' | 'always' | 'threshold';
  threshold: number | null;
}

/**
 * El envio de una pantalla, en los cuatro estados en los que puede estar. Se
 * resuelve una vez en el servidor y lo consumen el resumen y el total.
 *
 *   none    al recoger: no hay envio del que hablar
 *   free    el negocio lo regala
 *   quoted  la API contesto con un importe
 *   pending no hay importe que ensenar todavia: "Por cotizar"
 */
export type ShippingResult =
  | { state: 'none'; cost: 0 }
  | { state: 'free'; cost: 0 }
  | { state: 'pending'; cost: 0 }
  | { state: 'quoted'; cost: number; km: number | null };

/**
 * Que envio se ensena en esta compra.
 *
 * El orden de las respuestas no es casual:
 *
 *   1. Al recoger no hay envio. No se cotiza, no se cobra y no se pinta.
 *   2. Fuera de la ciudad no hay envio que prometer: ni tarifa ni regalo. Va
 *      ANTES del envio gratis a proposito —ver abajo—.
 *   3. El envio gratis manda sobre el importe: el carrito ya se lo prometio al
 *      comprador con la barra de avance, y cobrarlo aqui seria desdecirse en la
 *      ultima pantalla.
 *   4. Con importe, el importe.
 *   5. Sin el, "Por cotizar": es lo que la tienda decia antes de que hubiera
 *      medicion, y sigue siendo verdad cuando nadie comparte su ubicacion.
 */
export function resolveShipping(options: {
  pickup: boolean;
  quote: ShippingQuote | null;
  /** Importe de los productos, para el umbral del envio gratis. */
  products: number;
  freeShipping?: FreeShippingRule | null;
}): ShippingResult {
  const { pickup, quote, products, freeShipping } = options;

  if (pickup) return { state: 'none', cost: 0 };

  // Un carrito que cruza el umbral con la ubicacion en otra ciudad no puede
  // rotular "Gratis": prometeria una entrega que la tienda no hace, y ademas
  // contradiria al aviso que esa misma pantalla acaba de dar.
  if (quote && !quote.serviceable) return { state: 'pending', cost: 0 };

  if (quote?.free) return { state: 'free', cost: 0 };

  if (freeShipping?.mode === 'always') return { state: 'free', cost: 0 };

  if (
    freeShipping?.mode === 'threshold' &&
    freeShipping.threshold !== null &&
    freeShipping.threshold > 0 &&
    products >= freeShipping.threshold
  ) {
    return { state: 'free', cost: 0 };
  }

  if (quote?.cost === null || quote?.cost === undefined) return { state: 'pending', cost: 0 };

  return { state: 'quoted', cost: quote.cost, km: quote.km };
}

/**
 * La respuesta de envio que la pantalla dejo escrita en el marcado.
 *
 * En /pago el envio ya no se mueve —se resolvio en el servidor y ahi se queda,
 * porque lo unico que cambia es la propina—, pero el navegador tiene que repintar
 * la tarjeta de resumen y necesita ese mismo estado. Viaja en dos atributos, que
 * es lo que el DOM sabe llevar: el estado y el importe.
 *
 * No se recuperan los kilometros: los rotula <PaymentSummary> con lo que pinto el
 * servidor, y la tarjeta no los ensena.
 */
export function shippingFromState(state: string | undefined, cost: number): ShippingResult {
  if (state === 'none') return { state: 'none', cost: 0 };
  if (state === 'free') return { state: 'free', cost: 0 };
  if (state === 'quoted') return { state: 'quoted', cost, km: null };

  return { state: 'pending', cost: 0 };
}

/**
 * Como se rotula el envio en un resumen. Es una sola frase por estado y vive
 * aqui, junto a los estados, porque la escriben dos sitios: el servidor cuando
 * pinta la tarjeta del carrito y el navegador cuando la repinta al cambiar una
 * cantidad. Escrita dos veces, un dia diria "Gratis" en el primer pintado y
 * "$0.00" en el segundo.
 *
 * `none` no tiene rotulo: al recoger la fila del envio no se pinta.
 */
export function shippingLabel(shipping: ShippingResult): string {
  if (shipping.state === 'free') return 'Gratis';
  if (shipping.state === 'pending') return 'Por cotizar';

  return formatPrice(shipping.cost);
}

/**
 * Lo que dice la barra de avance hacia el envio gratis: lo que falta, o que ya
 * esta conseguido.
 *
 * No hay tercer estado para el pedido vacio: ahi la barra no se pinta. El envio
 * gratis se gana llegando a un importe, y cualquier frase delante de un carrito
 * sin nada —"agrega un platillo y…"— promete por una unidad lo que depende del
 * total.
 *
 * Misma razon que shippingLabel() para vivir aqui: la escriben el servidor al
 * pintar la barra y el navegador al repintarla con cada cambio de cantidad.
 */
export function freeShippingLabel(remaining: number): string {
  if (remaining <= 0) return '¡Ya tienes envio gratis! \u{1F389}';

  return `Estas a ${formatPrice(remaining)} de obtener envio gratis \u{1F389}`;
}

const kmFormatter = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

/** "8.4 km". La distancia se rotula junto al importe, para que se pueda cuadrar. */
export function formatKm(km: number): string {
  return `${kmFormatter.format(km)} km`;
}
