// Vista de pago por transferencia: confirmar el pedido.
//
// El boton de copiar la CLABE lo resuelve scripts/copy-button.ts, que la pagina
// importa aparte.
//
// "Confirmar pedido" es el punto en el que el pedido se crea de verdad, con el
// carrito de la sesion y los datos que vienen del borrador. Nace en "Por
// confirmar" y SIN folio: el comprador paga antes de que el pedido llegue al
// panel, y el folio se asigna cuando la tienda da el comprobante por bueno.

import { confirmDraft } from '../lib/checkout-draft';

const form = document.querySelector<HTMLFormElement>('[data-transfer-form]');

if (form) {
  const error = form.querySelector<HTMLElement>('[data-checkout-error]');
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');

  const showError = (message: string | null): void => {
    if (!error) return;
    error.textContent = message ?? '';
    error.hidden = !message;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    showError(null);
    if (button) button.disabled = true;

    const outcome = await confirmDraft('bank_transfer');

    if (!outcome.ok) {
      showError(outcome.message);
      if (button) button.disabled = false;
      return;
    }

    window.location.assign('/pedido-recibido');
  });
}
