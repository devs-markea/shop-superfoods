// Acuse del pedido. Dos comportamientos, los dos de Mercado Pago.
//
// El resto de la pantalla lo decide el servidor: ver src/lib/confirmation.ts.

import { startPayment } from '../lib/checkout';

// --- Reintentar el cobro -------------------------------------------------
//
// Abre un cobro NUEVO sobre el MISMO pedido y manda al comprador a la pasarela.
// No se vuelve a llamar al checkout: tras el primer cierre el carrito esta vacio,
// asi que un checkout nuevo responderia "Tu carrito esta vacio" -y si por la fecha
// todavia recordara la clave de idempotencia, devolveria el pedido viejo sin cobrar
// nada-.
//
// La pantalla solo pinta este boton cuando reintentar tiene sentido: con el cobro
// sin arrancar, o con un rechazo que la API marca como `retryable`.
const form = document.querySelector<HTMLFormElement>('[data-retry-form]');
const order = form?.dataset.order;

if (form && order) {
  const error = form.querySelector<HTMLElement>('[data-checkout-error]');

  // Dos botones y no uno: el de la barra de movil y el que la releva en desktop.
  // Solo uno se ve a la vez —lo decide el breakpoint— pero desde aqui no se sabe
  // cual, asi que se apagan los dos.
  const buttons = form.querySelectorAll<HTMLButtonElement>('button[type="submit"]');

  const setBusy = (busy: boolean): void => {
    buttons.forEach((button) => {
      button.disabled = busy;
    });
  };

  const showError = (message: string | null): void => {
    if (!error) return;
    error.textContent = message ?? '';
    error.hidden = !message;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    showError(null);
    setBusy(true);

    const attempt = await startPayment(order);

    if (!attempt.ok) {
      showError(attempt.message);
      setBusy(false);
      return;
    }

    // Los botones no se vuelven a habilitar: lo que sigue es salir de la tienda.
    window.location.assign(attempt.redirectUrl);
  });
}

// --- Esperar al webhook --------------------------------------------------
//
// Cuando el comprador vuelve de la pasarela, el pago puede tardar unos segundos en
// acreditarse: la verdad la pone el webhook de Mercado Pago, no la vuelta del
// navegador. La pantalla lo dice y ofrece "Actualizar", pero pedirle que pulse para
// ver si ya pago es pedirle trabajo por un dato que va a llegar solo.
//
// Asi que se recarga sola unas pocas veces y se para. No es un sondeo: si a los
// tres intentos el pago sigue sin acreditarse, algo tarda de verdad y seguir
// recargando solo gasta bateria y hace parpadear la pantalla. El boton sigue ahi.
const AWAIT_KEY = 'sf_awaiting_payment';
const MAX_RELOADS = 3;
const DELAY = 5000;

/** sessionStorage puede lanzar (modo privado, cookies bloqueadas): no pasa nada. */
function counter(): { read: () => number; write: (value: number) => void; clear: () => void } {
  return {
    read: () => {
      try {
        return Number.parseInt(window.sessionStorage.getItem(AWAIT_KEY) ?? '', 10) || 0;
      } catch {
        return MAX_RELOADS;
      }
    },
    write: (value) => {
      try {
        window.sessionStorage.setItem(AWAIT_KEY, String(value));
      } catch {
        /* sin contador no hay recarga automatica, y la pantalla sigue sirviendo */
      }
    },
    clear: () => {
      try {
        window.sessionStorage.removeItem(AWAIT_KEY);
      } catch {
        /* idem */
      }
    },
  };
}

const awaiting = document.querySelector('[data-awaiting-payment]');
const reloads = counter();

if (!awaiting) {
  // El pago ya se resolvio -en un sentido o en otro-, asi que la cuenta de la
  // espera anterior no vale para la siguiente compra.
  reloads.clear();
} else {
  const done = reloads.read();

  if (done < MAX_RELOADS) {
    reloads.write(done + 1);
    window.setTimeout(() => window.location.reload(), DELAY);
  }
}
