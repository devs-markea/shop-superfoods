// Vista de resumen de pago: la propina recalcula el total.
//
// El importe de los productos llega por data-products, asi que este script no
// importa el catalogo ni el carrito.
//
// Pendiente: el importe libre de "Otro" (no viene en la spec) y el envio real
// del pedido por WhatsApp.

import { formatPrice } from '../lib/price';

const form = document.querySelector<HTMLFormElement>('[data-payment-form]');

if (form) {
  const products = Number.parseFloat(form.dataset.products ?? '') || 0;
  const output = form.querySelector<HTMLElement>('[data-summary-total]');

  const recalculate = (): void => {
    const selected = form.querySelector<HTMLInputElement>('[data-tip]:checked');
    const tip = Number.parseFloat(selected?.value ?? '') || 0;
    if (output) output.textContent = formatPrice(products + tip);
  };

  form.addEventListener('change', recalculate);
  recalculate();

  // Sin backend todavia: evita que el boton recargue la pagina.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
  });
}
