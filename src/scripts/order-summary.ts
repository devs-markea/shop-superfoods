// Vista de pedido: cantidades, borrado de lineas y totales.
//
// Ningun importe se calcula aqui. Cada cambio va a /api/cart/items/{fila} y la
// API devuelve el carrito completo ya recalculado; la pagina se limita a
// repintar con lo que llega. Multiplicar en cliente daria totales que
// contradicen al servidor en cuanto una linea tenga promocion: tanto los
// descuentos por porcentaje como el "compra y lleva" dependen de las unidades.
//
// Y no se parchea linea a linea, se sustituye la LISTA ENTERA. Un grupo de
// "compra y lleva" se forma con todas las unidades del mismo platillo del
// carrito, asi que cambiar una cantidad puede rehacer los grupos, mover
// unidades entre lineas y alterar el descuento de lineas que nadie toco. El
// marcado lo pone el mismo renderizador que uso el servidor (src/lib/cart-view).
//
// El umbral de envio gratis si es de este front —la API no tiene regla de
// envio todavia— y viaja en data-threshold.
//
// Con cada respuesta se repintan tres sitios, porque en desktop los tres estan a
// la vista a la vez y decir el mismo importe de tres formas distintas es peor que
// no decirlo: la lista, la tarjeta de resumen —donde el envio se vuelve a
// resolver, que cruzar el umbral lo convierte en "Gratis"— y el chip del pedido
// de la barra de arriba.

import { formatPrice } from '../lib/price';
import {
  cartChipLabel,
  imageResolver,
  renderLines,
  type CartLinesView,
} from '../lib/cart-view';
import { paintCartSummary } from '../lib/cart-summary';
import { hasSharedLocation, patchDraft, readDraft } from '../lib/checkout-draft';
import { freeShippingLabel, resolveShipping, type FreeShippingRule } from '../lib/shipping';

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

interface CartView extends CartLinesView {
  subtotal: number;
  discountTotal: number;
  total: number;
  /** Suma de cantidades, no de lineas: la cifra del chip de la barra. */
  itemsCount: number;
}

const summary = document.querySelector<HTMLElement>('[data-order-summary]');

if (summary) {
  const threshold = Number.parseFloat(summary.dataset.threshold ?? '') || 0;
  const resolveImage = imageResolver(summary.dataset.assetBase ?? '');

  const list = summary.querySelector<HTMLElement>('[data-order-list]');
  const empty = summary.querySelector<HTMLElement>('[data-empty]');
  const errorSlot = summary.querySelector<HTMLElement>('[data-cart-error]');
  const totalOutput = document.querySelector<HTMLElement>('[data-order-total]');
  const progressEl = summary.querySelector<HTMLElement>('[data-shipping-progress]');
  const progressBar = progressEl?.querySelector<HTMLElement>('.progress-bar');
  // El rotulo de la barra de avance ("Estas a $X de obtener envio gratis"), que no
  // es el importe del envio de la tarjeta: ese lo escribe shippingLabel().
  const progressLabel = summary.querySelector<HTMLElement>('[data-shipping-label]');
  const totals = summary.querySelector<HTMLElement>('[data-order-totals]');
  const subtotalOutput = summary.querySelector<HTMLElement>('[data-order-subtotal]');
  const discountOutput = summary.querySelector<HTMLElement>('[data-order-discount]');

  // El chip del pedido de la barra de desktop. Esta es la unica pantalla donde el
  // carrito se edita con la barra a la vista: sin esto, el chip se quedaria en el
  // importe con el que se cargo la pagina, contradiciendo a la tarjeta.
  const chip = document.querySelector<HTMLElement>('[data-cart-chip]');
  const chipTotal = document.querySelector<HTMLElement>('[data-cart-chip-total]');
  const chipCount = document.querySelector<HTMLElement>('[data-cart-chip-count]');

  // La regla del negocio, para volver a resolver el envio en cada cambio: cruzar
  // el umbral con un "+" convierte el importe en "Gratis" sin recargar. El modo lo
  // pinta el servidor y el umbral es el mismo de la barra de avance.
  const freeShipping: FreeShippingRule = {
    mode:
      summary.dataset.freeShipping === 'always'
        ? 'always'
        : summary.dataset.freeShipping === 'threshold'
          ? 'threshold'
          : 'none',
    threshold: threshold || null,
  };

  // El modo de entrega y la distancia medida no cambian en esta pantalla —se
  // eligen en el listado y en /datos—, asi que el borrador se lee una vez.
  const draft = readDraft();

  // Sin ubicacion compartida no hay envio que ensenar, aunque la cookie recuerde
  // un importe: es la misma regla con la que el servidor acaba de pintar esta
  // tarjeta (hasSharedLocation), y las dos tienen que decir lo mismo o el envio
  // cambiaria solo al mover una cantidad.
  const quote = hasSharedLocation(draft) ? draft.shipping : null;

  const setError = (message: string | null): void => {
    if (!errorSlot) return;
    errorSlot.textContent = message ?? '';
    errorSlot.hidden = message === null;
  };

  const render = (cart: CartView): void => {
    if (list) list.innerHTML = renderLines(cart, resolveImage);

    if (totalOutput) totalOutput.textContent = `Pedido ${formatPrice(cart.total)}`;

    if (threshold > 0 && progressEl && progressBar) {
      const progress = Math.min(100, Math.round((cart.total / threshold) * 100));
      progressBar.style.width = `${progress}%`;
      progressEl.setAttribute('aria-valuenow', String(progress));
    }

    // Solo cambia el texto: el dorado del label no depende del estado. La copia es
    // la misma que pinto el servidor (src/lib/shipping.ts).
    if (progressLabel) {
      progressLabel.textContent = freeShippingLabel(Math.max(0, threshold - cart.total));
    }

    // Un cambio de cantidad puede estrenar o deshacer un descuento —cerrar un
    // 2x1, o romperlo—, asi que el bloque aparece y desaparece con el.
    totals?.classList.toggle('d-none', cart.discountTotal <= 0);
    if (subtotalOutput) subtotalOutput.textContent = formatPrice(cart.subtotal);
    if (discountOutput) discountOutput.textContent = `− ${formatPrice(cart.discountTotal)}`;

    // La tarjeta de resumen de desktop. El envio se vuelve a resolver entero, no
    // se arrastra el de la carga: el umbral del envio gratis se mide contra el
    // total, y este acaba de cambiar. Es la misma funcion que uso el servidor
    // (src/lib/shipping.ts), asi que el repintado no puede llegar a otro importe
    // que el primer pintado.
    paintCartSummary(summary, {
      subtotal: cart.subtotal,
      discount: cart.discountTotal,
      products: cart.total,
      shipping: resolveShipping({
        pickup: draft.deliveryType === 'pickup',
        quote,
        products: cart.total,
        freeShipping,
      }),
    });

    if (chipTotal) chipTotal.textContent = formatPrice(cart.total);

    if (chipCount) {
      chipCount.textContent = String(cart.itemsCount);
      chipCount.hidden = cart.itemsCount <= 0;
    }

    chip?.setAttribute('aria-label', cartChipLabel(cart.total, cart.itemsCount));

    const hasLines = cart.lines.length > 0;
    list?.classList.toggle('d-none', !hasLines);
    empty?.classList.toggle('d-none', hasLines);
  };

  /**
   * Lanza la operacion y repinta con la respuesta.
   *
   * La lista entera queda bloqueada mientras tanto, no solo la linea pulsada:
   * dos pulsaciones seguidas mandarian dos cantidades calculadas sobre el mismo
   * valor de partida, y ademas la respuesta puede cambiar cualquier otra linea
   * del mismo platillo.
   */
  const mutate = async (path: string, init: RequestInit): Promise<void> => {
    if (list?.hasAttribute('data-busy')) return;

    setError(null);
    list?.setAttribute('data-busy', '');

    try {
      const response = await fetch(path, {
        ...init,
        headers: { Accept: 'application/json', ...init.headers },
      });
      const body = (await response.json().catch(() => null)) as
        | { data?: CartView; message?: string }
        | null;

      if (!response.ok || !body?.data) {
        setError(body?.message ?? 'No pudimos actualizar tu pedido.');
        return;
      }

      // El pedido se quedo vacio: recargar deja coherentes tambien la barra de
      // accion y el aviso, que los pinta el servidor.
      if (body.data.lines.length === 0) {
        window.location.reload();
        return;
      }

      render(body.data);
    } catch {
      setError('No pudimos actualizar tu pedido. Revisa tu conexion.');
    } finally {
      list?.removeAttribute('data-busy');
    }
  };

  const lineEndpoint = (itemId: string) => `/api/cart/items/${encodeURIComponent(itemId)}`;

  /** Manda la cantidad nueva de la fila. Con 0, la API la elimina. */
  const setQuantity = (itemId: string, quantity: number): Promise<void> =>
    quantity <= 0
      ? mutate(lineEndpoint(itemId), { method: 'DELETE' })
      : mutate(lineEndpoint(itemId), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity }),
        });

  summary.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Los controles cuelgan de la FILA, que es lo que el PATCH sabe cambiar.
    // En un grupo de "compra y lleva" hay un solo control y la fila que lleva
    // es la ultima que entro: el acordeon de arriba solo desglosa unidades.
    const row = target.closest<HTMLElement>('[data-row]');
    if (!row) return;

    const itemId = row.dataset.lineId;
    if (!itemId) return;

    // La cantidad de la FILA, no la que se ve. Cuando parte de la fila esta
    // dentro de un grupo son distintas, y sumar sobre lo visible bajaria el
    // pedido al pulsar "+": la fila lleva 3 unidades y la linea ensena 1.
    const rowQuantity = Number.parseInt(row.dataset.rowQuantity ?? '', 10) || 0;
    const lineQuantity = Number.parseInt(row.dataset.lineQuantity ?? '', 10) || 0;

    const step = target.closest<HTMLElement>('[data-step]');
    if (step) {
      const delta = Number.parseInt(step.dataset.step ?? '', 10) || 0;
      void setQuantity(itemId, rowQuantity + delta);
      return;
    }

    if (target.closest('[data-remove-line]')) {
      // Quita lo que esta linea representa: la fila entera cuando es toda suya
      // —tambien en un grupo, donde se lleva la ultima que entro—, y solo las
      // unidades sueltas cuando el resto ya esta en una promocion.
      void setQuantity(itemId, rowQuantity - lineQuantity);
    }
  });

  // "Continuar" es un enlace, no un submit; esto solo cubre un Enter en el
  // campo de comentarios.
  summary.closest('form')?.addEventListener('submit', (event) => {
    event.preventDefault();
  });
}
