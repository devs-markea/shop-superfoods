// Vista de pedido: cantidades, borrado de lineas y totales.
//
// Todos los importes se recalculan desde el DOM (precio unitario x cantidad),
// nunca se leen de un texto ya formateado. El umbral de envio gratis llega por
// data-threshold, asi que este script no importa el catalogo.
//
// Pendiente: persistir los cambios. Hoy solo viven en la pagina.

import { formatPrice } from '../lib/price';

const summary = document.querySelector<HTMLElement>('[data-order-summary]');

if (summary) {
  const threshold = Number.parseFloat(summary.dataset.threshold ?? '') || 0;
  const list = summary.querySelector<HTMLElement>('[data-order-list]');
  const empty = summary.querySelector<HTMLElement>('[data-empty]');
  const totalOutput = document.querySelector<HTMLElement>('[data-order-total]');
  const progressEl = summary.querySelector<HTMLElement>('[data-shipping-progress]');
  const progressBar = progressEl?.querySelector<HTMLElement>('.progress-bar');
  const shippingLabel = summary.querySelector<HTMLElement>('[data-shipping-label]');

  const recalculate = (): void => {
    let total = 0;

    for (const line of summary.querySelectorAll<HTMLElement>('[data-line]')) {
      const unitPrice = Number.parseFloat(line.dataset.unitPrice ?? '') || 0;
      const quantityEl = line.querySelector<HTMLElement>('[data-quantity]');
      const quantity = Number.parseInt(quantityEl?.textContent ?? '', 10) || 0;
      const subtotal = unitPrice * quantity;
      total += subtotal;

      const subtotalEl = line.querySelector<HTMLElement>('[data-line-subtotal]');
      if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal);

      // No se puede bajar de 1: para eliminar esta el boton de borrar.
      const minus = line.querySelector<HTMLButtonElement>('[data-step="-1"]');
      if (minus) minus.disabled = quantity <= 1;
    }

    if (totalOutput) totalOutput.textContent = `Pedido ${formatPrice(total)}`;

    if (threshold > 0 && progressEl && progressBar) {
      const progress = Math.min(100, Math.round((total / threshold) * 100));
      progressBar.style.width = `${progress}%`;
      progressEl.setAttribute('aria-valuenow', String(progress));
    }

    // Solo cambia el texto: el dorado del label no depende del estado.
    if (shippingLabel) {
      const remaining = Math.max(0, threshold - total);
      shippingLabel.textContent =
        remaining === 0
          ? '¡Ya tienes envio gratis! \u{1F389}'
          : `Estas a ${formatPrice(remaining)} de obtener envio gratis \u{1F389}`;
    }

    const hasLines = summary.querySelectorAll('[data-line]').length > 0;
    list?.classList.toggle('d-none', !hasLines);
    empty?.classList.toggle('d-none', hasLines);
  };

  summary.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const stepButton = target.closest<HTMLElement>('[data-step]');
    if (stepButton) {
      const line = stepButton.closest<HTMLElement>('[data-line]');
      const quantityEl = line?.querySelector<HTMLElement>('[data-quantity]');
      if (!quantityEl) return;

      const step = Number.parseInt(stepButton.dataset.step ?? '', 10) || 0;
      const current = Number.parseInt(quantityEl.textContent ?? '', 10) || 1;
      quantityEl.textContent = String(Math.max(1, current + step));
      recalculate();
      return;
    }

    if (target.closest('[data-remove-line]')) {
      target.closest<HTMLElement>('[data-line]')?.remove();
      recalculate();
    }
  });

  // Sin backend todavia: evita que "Continuar" recargue la pagina.
  summary.closest('form')?.addEventListener('submit', (event) => {
    event.preventDefault();
  });

  recalculate();
}
