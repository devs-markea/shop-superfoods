// Pantallas que confirman el pedido: transferencia y efectivo.
//
// "Confirmar pedido" es el punto en el que el pedido se crea de verdad, con el
// carrito de la sesion y los datos que vienen del borrador. El pedido nace "Por
// confirmar" y SIN folio: el cobro ocurre fuera de la tienda —una transferencia que
// alguien tiene que revisar, o unos billetes en el local— y el folio se asigna
// cuando la tienda lo da por bueno.
//
// Las dos pantallas comparten este script porque lo que cambia entre ellas es lo
// que se lee antes de confirmar —una cuenta bancaria o como se entrega el dinero—,
// no lo que se hace: el mismo POST con el mismo borrador. El metodo y la pantalla siguiente
// llegan del marcado, que es donde ya se distinguen.
//
// El boton de copiar la CLABE lo resuelve scripts/copy-button.ts, que la pantalla
// de transferencia importa aparte.

import { PAYMENT_LABEL, type PaymentMethod } from '../lib/checkout';
import { DELIVERY_SCREEN, confirmDraft } from '../lib/checkout-draft';

const form = document.querySelector<HTMLFormElement>('[data-confirm-form]');
const method = form?.dataset.method as PaymentMethod | undefined;

// Sin metodo declarado no se cierra nada: crear un pedido con uno inventado seria
// peor que no crearlo, porque el cobro quedaria esperando por el canal equivocado.
if (form && method && method in PAYMENT_LABEL) {
  const next = form.dataset.next ?? '/mamayaya/recibido';

  // El envio no se manda desde aqui: la API lo recalcula al cerrar el pedido y lo
  // devuelve en `shippingTotal`, ya sumado al total. Lo unico que viaja es la
  // referencia de la cotizacion, y de eso se encarga toCheckoutRequest().
  const error = form.querySelector<HTMLElement>('[data-checkout-error]');

  // Son DOS: el de la barra del fondo en movil y el de la tarjeta de resumen en
  // desktop. Solo uno se ve a la vez, pero los dos envian este formulario, asi que
  // el cierre del pedido los bloquea a los dos.
  const buttons = form.querySelectorAll<HTMLButtonElement>('button[type="submit"]');

  const showError = (message: string | null): void => {
    if (!error) return;
    error.textContent = message ?? '';
    error.hidden = !message;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    showError(null);
    for (const button of buttons) button.disabled = true;

    const outcome = await confirmDraft(method);

    if (!outcome.ok) {
      // Al borrador le falta algo de la entrega, y esta pantalla no tiene esos
      // campos: la cuenta bancaria o el aviso del efectivo, el detalle del pedido
      // y un boton. Escribir aqui "falta tu nombre, la colonia y la calle" deja al
      // comprador leyendo lo que le falta sin nada que pulsar para arreglarlo, asi
      // que se le lleva al formulario que lo pide.
      //
      // Los botones no se vuelven a habilitar, igual que al confirmar: lo que
      // sigue es salir de la pantalla.
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

    window.location.assign(next);
  });
}
