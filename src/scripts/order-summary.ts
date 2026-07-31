// Vista de pedido: cantidades, borrado de lineas y totales.
//
// Ningun importe se calcula aqui. Cada cambio va a /api/cart/items/{linea} y la
// API devuelve el carrito completo ya recalculado; la pagina se limita a
// repintar con lo que llega. Multiplicar en cliente daria totales que
// contradicen al servidor en cuanto una linea tenga promocion: tanto los
// descuentos por porcentaje como el "compra y lleva" dependen de las unidades.
//
// El umbral de envio gratis si es de este front —la API no tiene regla de
// envio todavia— y viaja en data-threshold.

import { formatPrice } from '../lib/price';
import { patchDraft } from '../lib/checkout-draft';

// Los comentarios se guardan al salir del campo, no al enviar: "Continuar" es un
// enlace y no hay submit donde recogerlos.
//
// PENDIENTE: el checkout no tiene campo para ellos (§6 del contrato), asi que hoy
// solo dejan de perderse por el camino. En cuanto la API acepte notas, se anaden
// en toCheckoutRequest() y viajan sin tocar esta pantalla.
const commentsField = document.querySelector<HTMLTextAreaElement>('[name="comments"]');

commentsField?.addEventListener('change', () => {
  patchDraft({ comments: commentsField.value.trim() });
});

interface CartLine {
  id: string;
  quantity: number;
  lineTotal: number;
}

interface CartView {
  items: CartLine[];
  total: number;
}

const summary = document.querySelector<HTMLElement>('[data-order-summary]');

if (summary) {
  const threshold = Number.parseFloat(summary.dataset.threshold ?? '') || 0;
  const list = summary.querySelector<HTMLElement>('[data-order-list]');
  const empty = summary.querySelector<HTMLElement>('[data-empty]');
  const errorSlot = summary.querySelector<HTMLElement>('[data-cart-error]');
  const totalOutput = document.querySelector<HTMLElement>('[data-order-total]');
  const progressEl = summary.querySelector<HTMLElement>('[data-shipping-progress]');
  const progressBar = progressEl?.querySelector<HTMLElement>('.progress-bar');
  const shippingLabel = summary.querySelector<HTMLElement>('[data-shipping-label]');

  const setError = (message: string | null): void => {
    if (!errorSlot) return;
    errorSlot.textContent = message ?? '';
    errorSlot.hidden = message === null;
  };

  const render = (cart: CartView): void => {
    const byId = new Map(cart.items.map((item) => [item.id, item]));

    for (const line of summary.querySelectorAll<HTMLElement>('[data-line]')) {
      const item = byId.get(line.dataset.lineId ?? '');

      // La API ya no devuelve la linea: PATCH con 0 la elimina, y una
      // configuracion fusionada puede colapsar dos lineas en una.
      if (!item) {
        line.remove();
        continue;
      }

      const quantity = line.querySelector<HTMLElement>('[data-quantity]');
      if (quantity) quantity.textContent = String(item.quantity);

      const subtotal = line.querySelector<HTMLElement>('[data-line-subtotal]');
      if (subtotal) subtotal.textContent = formatPrice(item.lineTotal);

      // No se puede bajar de 1: para eliminar esta el boton de borrar.
      const minus = line.querySelector<HTMLButtonElement>('[data-step="-1"]');
      if (minus) minus.disabled = item.quantity <= 1;

      line.removeAttribute('data-busy');
    }

    if (totalOutput) totalOutput.textContent = `Pedido ${formatPrice(cart.total)}`;

    if (threshold > 0 && progressEl && progressBar) {
      const progress = Math.min(100, Math.round((cart.total / threshold) * 100));
      progressBar.style.width = `${progress}%`;
      progressEl.setAttribute('aria-valuenow', String(progress));
    }

    // Solo cambia el texto: el dorado del label no depende del estado.
    if (shippingLabel) {
      const remaining = Math.max(0, threshold - cart.total);
      shippingLabel.textContent =
        remaining === 0
          ? '¡Ya tienes envio gratis! \u{1F389}'
          : `Estas a ${formatPrice(remaining)} de obtener envio gratis \u{1F389}`;
    }

    const hasLines = summary.querySelectorAll('[data-line]').length > 0;
    list?.classList.toggle('d-none', !hasLines);
    empty?.classList.toggle('d-none', hasLines);
  };

  /**
   * Lanza la operacion y repinta con la respuesta. La linea queda marcada como
   * ocupada mientras tanto: dos pulsaciones seguidas al "+" mandarian dos
   * cantidades calculadas sobre el mismo valor de partida.
   */
  const mutate = async (line: HTMLElement, path: string, init: RequestInit): Promise<void> => {
    if (line.hasAttribute('data-busy')) return;

    setError(null);
    line.setAttribute('data-busy', '');

    try {
      const response = await fetch(path, {
        ...init,
        headers: { Accept: 'application/json', ...init.headers },
      });
      const body = (await response.json().catch(() => null)) as
        | { data?: CartView; message?: string }
        | null;

      if (!response.ok || !body?.data) {
        line.removeAttribute('data-busy');
        setError(body?.message ?? 'No pudimos actualizar tu pedido.');
        return;
      }

      // El pedido se quedo vacio: recargar deja coherentes tambien la barra de
      // accion y el aviso, que los pinta el servidor.
      if (body.data.items.length === 0) {
        window.location.reload();
        return;
      }

      render(body.data);
    } catch {
      line.removeAttribute('data-busy');
      setError('No pudimos actualizar tu pedido. Revisa tu conexion.');
    }
  };

  const lineEndpoint = (line: HTMLElement) =>
    `/api/cart/items/${encodeURIComponent(line.dataset.lineId ?? '')}`;

  summary.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const step = target.closest<HTMLElement>('[data-step]');
    if (step) {
      const line = step.closest<HTMLElement>('[data-line]');
      const value = line?.querySelector<HTMLElement>('[data-quantity]');
      if (!line || !value) return;

      const delta = Number.parseInt(step.dataset.step ?? '', 10) || 0;
      const quantity = Math.max(1, (Number.parseInt(value.textContent ?? '', 10) || 1) + delta);

      void mutate(line, lineEndpoint(line), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      });
      return;
    }

    if (target.closest('[data-remove-line]')) {
      const line = target.closest<HTMLElement>('[data-line]');
      if (line) void mutate(line, lineEndpoint(line), { method: 'DELETE' });
    }
  });

  // "Continuar" es un enlace, no un submit; esto solo cubre un Enter en el
  // campo de comentarios.
  summary.closest('form')?.addEventListener('submit', (event) => {
    event.preventDefault();
  });
}
