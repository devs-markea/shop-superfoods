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
  const output = form.querySelector<HTMLElement>('[data-summary-total]');
  const error = form.querySelector<HTMLElement>('[data-checkout-error]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  const selectedTip = (): number => {
    const selected = form.querySelector<HTMLInputElement>('[data-tip]:checked');
    return Number.parseFloat(selected?.value ?? '') || 0;
  };

  const recalculate = (): void => {
    if (output) output.textContent = formatPrice(products + selectedTip());
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
    if (button) button.disabled = true;

    const outcome = await confirmDraft(method);

    if (!outcome.ok) {
      showError(outcome.message);
      if (button) button.disabled = false;
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
