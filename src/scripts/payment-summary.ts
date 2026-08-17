// Vista de resumen de pago: la propina recalcula el total, y el metodo de pago
// decide como se cierra el pedido.
//
// El importe de los productos llega por data-products, asi que este script no
// importa el catalogo ni el carrito.
//
// Aqui se parte el flujo:
//
//   - transferencia: el pedido NO se crea todavia. Primero hay que ver la cuenta
//     y confirmar que se pago, asi que solo se guarda la eleccion y se avanza.
//   - efectivo:      igual, pero lo que hay que ver antes es como se paga. Vale
//     para los dos modos de entrega —al repartidor o en el local—, y al recoger es
//     ademas el unico metodo.
//   - mercado_pago:  no hay pantalla intermedia. El pedido se cierra aqui mismo y
//     la siguiente pantalla ya es el acuse.
//
// Pendiente: la redireccion a la pasarela de Mercado Pago, que no forma parte de
// las cuatro APIs.

import { formatPrice } from '../lib/price';
import { paintCartSummary } from '../lib/cart-summary';
import { shippingFromState } from '../lib/shipping';
import { toPaymentMethod, type PaymentMethod } from '../lib/checkout';
import { DELIVERY_SCREEN, confirmDraft, patchDraft } from '../lib/checkout-draft';
import { parseTipAmount } from '../lib/tips';

// Metodos que confirman en su propia pantalla, y cual. El pedido se cierra alli:
// lo que cambia entre las dos es lo que hay que leer antes de confirmar —una cuenta
// bancaria o como se entrega el dinero—, no lo que se manda.
const CONFIRM_SCREEN: Partial<Record<PaymentMethod, string>> = {
  bank_transfer: '/pago/transferencia',
  efectivo: '/pago/efectivo',
};

const form = document.querySelector<HTMLFormElement>('[data-payment-form]');

if (form) {
  const products = Number.parseFloat(form.dataset.products ?? '') || 0;

  // El envio ya viene resuelto del servidor: la tarifa, la distancia medida en
  // /datos y el envio gratis se aplicaron alli (ver src/lib/shipping.ts). Aqui
  // solo es un sumando mas del total, que la propina vuelve a mover.
  const shipping = Number.parseFloat(form.dataset.shipping ?? '') || 0;
  const output = form.querySelector<HTMLElement>('[data-summary-total]');
  const error = form.querySelector<HTMLElement>('[data-checkout-error]');

  // Son DOS: el de la barra del fondo en movil y el de la tarjeta de resumen en
  // desktop. Solo uno se ve a la vez, pero los dos envian este formulario, asi que
  // el cierre del pedido los bloquea a los dos.
  const buttons = form.querySelectorAll<HTMLButtonElement>('button[type="submit"]');

  // El envio no se mueve en esta pantalla —se resolvio en el servidor—, pero la
  // tarjeta se repinta entera con cada propina y necesita su estado: llega en el
  // marcado, junto al importe.
  const shippingResult = shippingFromState(form.dataset.shippingState, shipping);

  const amount = (name: string): number => Number.parseFloat(form.dataset[name] ?? '') || 0;

  // La propina es SIEMPRE la del radio marcado, tambien cuando se escribio a
  // mano: "Otro" lleva el importe libre en su `value`, no un 0 fijo. Asi el
  // total, el borrador y el checkout leen todos el mismo sitio, y el campo del
  // importe libre no es un caso aparte para nadie mas que para el bloque de
  // abajo, que es quien lo mantiene al dia.
  const selectedTip = (): number => {
    const selected = form.querySelector<HTMLInputElement>('[data-tip]:checked');
    return parseTipAmount(selected?.value) ?? 0;
  };

  const recalculate = (): void => {
    const tip = selectedTip();

    if (output) output.textContent = formatPrice(products + shipping + tip);

    // La misma cuenta en la tarjeta de desktop, que ademas desglosa la propina.
    paintCartSummary(form, {
      subtotal: amount('subtotal'),
      discount: amount('discount'),
      products,
      shipping: shippingResult,
      tip,
    });
  };

  const showError = (message: string | null): void => {
    if (!error) return;
    error.textContent = message ?? '';
    error.hidden = !message;
  };

  form.addEventListener('change', recalculate);
  recalculate();

  // --- El importe libre de "Otro" ----------------------------------------
  //
  // Dos elementos y un solo dato: lo que se teclea en el campo se copia al
  // `value` del radio, que es de donde lo lee todo lo demas. El campo no tiene
  // `name` y no viaja en el formulario; es un teclado para el radio.
  //
  // El panel se abre y se cierra solo, con CSS (ver components/_tip.scss). Aqui
  // no se toca: lo unico que hace falta de este lado es el valor.
  const customOption = form.querySelector<HTMLInputElement>('[data-tip-custom]');
  const customAmount = form.querySelector<HTMLInputElement>('[data-tip-amount]');
  const customLabel = form.querySelector<HTMLElement>('[data-tip-custom-label]');

  if (customOption && customAmount) {
    customAmount.addEventListener('input', () => {
      // Solo digitos, y sin ceros a la izquierda: la propina es un entero en
      // pesos. El `maxlength` del campo pone el techo, asi que lo que se puede
      // teclear es exactamente lo que parseTipAmount() acepta.
      //
      // Lo que haya tras una coma o un punto se descarta ENTERO en vez de
      // limpiarse: pegar "12.50" y quedarse con sus digitos daria 1250, cien
      // veces la propina que se queria dejar. Cortando por el separador da 12,
      // que se queda corto —y quedarse corto en un cobro se corrige mirando; el
      // 1250 se descubre en el estado de cuenta—.
      const digits = customAmount.value
        .split(/[.,]/)[0]
        .replace(/\D/g, '')
        .replace(/^0+(?=\d)/, '');

      // Solo si cambio: reescribir el valor en cada pulsacion mandaria el cursor
      // al final y no se podria corregir un digito del medio.
      if (digits !== customAmount.value) customAmount.value = digits;

      customOption.value = digits;

      // Escribir es elegir. Si se llega al campo con otro importe marcado —por
      // el tabulador, o volviendo sobre lo escrito— la eleccion pasa a ser esta,
      // que si no el total no cuadraria con lo que se esta viendo.
      customOption.checked = true;

      // Ninguno de los dos cambios de arriba dispara `change`, asi que la cuenta
      // se rehace desde aqui.
      recalculate();
    });

    // Elegir "Otro" con el dedo o el raton deja el cursor donde hay que
    // escribir, sin tener que buscar el campo. Pero SOLO asi:
    //
    // Los importes son un grupo de radios, y dentro de un grupo las flechas
    // mueven Y eligen. Si el foco saltara tambien entonces, recorrer los
    // importes con el teclado terminaria siempre dentro del campo de texto y
    // habria que salir con Mayus+Tab para seguir mirando: se sale, pero nadie
    // espera que mirar la ultima opcion le meta en un formulario.
    //
    // De ahi la marca del puntero. Se pone al pulsar sobre el rotulo —que es lo
    // que se toca, porque el radio esta oculto— y se levanta con cualquier tecla,
    // para que una pulsacion vieja no acabe robando el foco de una eleccion
    // hecha con flechas mucho despues.
    let byPointer = false;

    customLabel?.addEventListener('pointerdown', () => {
      byPointer = true;
    });

    form.addEventListener('keydown', () => {
      byPointer = false;
    });

    customOption.addEventListener('change', () => {
      if (!customOption.checked || !byPointer) return;
      byPointer = false;

      // El panel se abre con CSS, y hasta que el navegador rehaga los estilos el
      // campo sigue en `visibility: hidden`, que no se puede enfocar. Leer una
      // medida fuerza ese recalculo aqui mismo. Sigue siendo el mismo gesto del
      // usuario —nada de esperar a un frame—, que es lo que hace que el teclado
      // del movil se abra en lugar de quedarse esperando otro toque.
      void customAmount.offsetWidth;
      customAmount.focus();
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const method = toPaymentMethod(
      form.querySelector<HTMLInputElement>('[name="payment_method"]:checked')?.value,
    );

    if (!method) {
      showError('Elige un metodo de pago.');
      return;
    }

    // La propina es de esta pantalla: se guarda en cualquiera de los dos caminos.
    patchDraft({ tip: selectedTip(), paymentMethod: method });

    const screen = CONFIRM_SCREEN[method];

    if (screen) {
      window.location.assign(screen);
      return;
    }

    showError(null);
    for (const button of buttons) button.disabled = true;

    // El envio no viaja como importe: la API lo recalcula al cerrar y lo devuelve
    // dentro del total del pedido. Ver toCheckoutRequest().
    const outcome = await confirmDraft(method);

    if (!outcome.ok) {
      // Al borrador le falta algo de la entrega, y esta pantalla no lo pide: aqui
      // se elige propina y metodo. El aviso nombraria campos que no estan a la
      // vista, asi que se le lleva al formulario que los tiene.
      //
      // Los botones no se vuelven a habilitar, igual que al salir a la pasarela:
      // lo que sigue es dejar esta pantalla.
      if (outcome.incomplete) {
        window.location.assign(DELIVERY_SCREEN);
        return;
      }

      // Lo demas si es de aqui —la API rechazo el pedido, o no hubo red— y se
      // queda escrito donde se pulso.
      showError(outcome.message);
      for (const button of buttons) button.disabled = false;
      return;
    }

    // La tienda no habla con Mercado Pago —no tiene ni debe tener sus
    // credenciales—: el backend crea la preferencia y devuelve a donde mandar al
    // comprador en la propia respuesta del checkout.
    //
    // Sin URL no se redirige, que seria navegar a null: la pasarela no respondio o
    // no esta configurada. El pedido EXISTE y no se pierde, asi que se va al acuse,
    // que ofrece pagarlo desde alli. Ver src/lib/confirmation.ts.
    const gateway = outcome.order.payment?.redirectUrl;

    window.location.assign(gateway || '/confirmado');
  });
}
