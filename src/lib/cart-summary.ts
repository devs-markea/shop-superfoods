// ---------------------------------------------------------------------------
// Repintado de la tarjeta de resumen (<CartSummary>).
//
// La tarjeta la pinta el servidor con los importes de la peticion, y despues la
// mueven dos pantallas por motivos distintos:
//
//   /mamayaya/carrito  cambia una cantidad, y con ella el subtotal, los descuentos y —si
//             se cruza el umbral— el envio
//   /mamayaya/datos    se comparte la ubicacion (llega la cotizacion, y el envio deja de
//             estar "Por cotizar") o se cambia el modo de entrega, que quita y
//             pone la fila del envio entera
//   /mamayaya/pago     se cambia la propina, que es la ultima cifra que se suma al total
//
// Las dos escriben en los mismos huecos, asi que quien los conoce es este modulo
// y no cada script: con la escritura repetida, un cambio en el marcado de la
// tarjeta se arreglaria en una pantalla y se rompería en la otra.
//
// Solo el DOM: los importes llegan calculados y el envio, resuelto. Es un ayudante
// de navegador, como src/lib/delivery-switch.ts.
// ---------------------------------------------------------------------------

import { formatPrice } from './price';
import { shippingLabel, type ShippingResult } from './shipping';

export interface CartSummaryAmounts {
  /** Importe de los productos ANTES de descuentos. */
  subtotal: number;
  /** Lo que descuentan las promociones. Con 0, la fila se retira. */
  discount: number;
  /** Lo que cuestan los productos ya descontados. */
  products: number;
  shipping: ShippingResult;
  /** Propina elegida. Con 0, la fila se retira. Solo la hay en /mamayaya/pago. */
  tip?: number;
}

/**
 * Escribe los importes en la tarjeta que haya dentro de `root`. Sin tarjeta
 * —movil, o una pantalla que no la monta— no hace nada.
 */
export function paintCartSummary(root: ParentNode, amounts: CartSummaryAmounts): void {
  const card = root.querySelector<HTMLElement>('[data-cart-summary]');
  if (!card) return;

  const { subtotal, discount, products, shipping, tip = 0 } = amounts;

  const subtotalOutput = card.querySelector<HTMLElement>('[data-cart-subtotal]');
  if (subtotalOutput) subtotalOutput.textContent = formatPrice(subtotal);

  card
    .querySelector<HTMLElement>('[data-cart-discount-row]')
    ?.classList.toggle('d-none', discount <= 0);

  const discountOutput = card.querySelector<HTMLElement>('[data-cart-discount]');
  if (discountOutput) discountOutput.textContent = `− ${formatPrice(discount)}`;

  // Al recoger no hay envio del que hablar y la fila se retira entera.
  card
    .querySelector<HTMLElement>('[data-cart-shipping-row]')
    ?.classList.toggle('d-none', shipping.state === 'none');

  const shippingOutput = card.querySelector<HTMLElement>('[data-cart-shipping]');

  if (shippingOutput) {
    shippingOutput.dataset.state = shipping.state;
    shippingOutput.textContent = shippingLabel(shipping);
  }

  card.querySelector<HTMLElement>('[data-cart-tip-row]')?.classList.toggle('d-none', tip <= 0);

  const tipOutput = card.querySelector<HTMLElement>('[data-cart-tip]');
  if (tipOutput) tipOutput.textContent = formatPrice(tip);

  const totalOutput = card.querySelector<HTMLElement>('[data-cart-total]');
  if (totalOutput) totalOutput.textContent = formatPrice(products + shipping.cost + tip);
}
