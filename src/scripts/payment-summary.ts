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
//   - mercado_pago:  no hay pantalla intermedia. El pedido se cierra aqui mismo y
//     la siguiente pantalla ya es el acuse.
//
// Pendiente: el importe libre de "Otro" (no viene en la spec) y la redireccion a
// la pasarela de Mercado Pago, que no forma parte de las cuatro APIs.

import { formatPrice } from '../lib/price';
import { toPaymentMethod } from '../lib/checkout';
import { confirmDraft, patchDraft } from '../lib/checkout-draft';

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

    if (method === 'bank_transfer') {
      window.location.assign('/pago-por-transferencia');
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

    window.location.assign('/pedido-confirmado');
  });
}
