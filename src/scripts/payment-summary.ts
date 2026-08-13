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
// Pendiente: el importe libre de "Otro" (no viene en la spec) y la redireccion a
// la pasarela de Mercado Pago, que no forma parte de las cuatro APIs.

import { formatPrice } from '../lib/price';
import { paintCartSummary } from '../lib/cart-summary';
import { shippingFromState } from '../lib/shipping';
import { toPaymentMethod, type PaymentMethod } from '../lib/checkout';
import { confirmDraft, patchDraft } from '../lib/checkout-draft';

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

  const selectedTip = (): number => {
    const selected = form.querySelector<HTMLInputElement>('[data-tip]:checked');
    return Number.parseFloat(selected?.value ?? '') || 0;
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
