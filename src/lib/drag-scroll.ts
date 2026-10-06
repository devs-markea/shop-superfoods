// Arrastre con raton/lapiz para una pista que scrollea en horizontal.
// En touch se deja el scroll nativo del navegador.
//
// Lo usa la lista horizontal de destacados (src/scripts/featured-carousel.ts).
// Solo navegador.

const DRAG_THRESHOLD = 4; // px antes de considerarlo arrastre

/**
 * @param draggingClass La que se pone mientras se arrastra: es la que apaga el snap
 *                      y el scroll suave, que pelearian con el raton.
 * @param isEnabled     Si el arrastre manda ahora mismo. Se pregunta en cada
 *                      pulsacion: la pista de los destacados la mueve Swiper en movil.
 */
export function initDragScroll(
  track: HTMLElement,
  draggingClass: string,
  isEnabled: () => boolean = () => true,
): void {
  let isDown = false;
  let startX = 0;
  let startScroll = 0;
  let distance = 0;

  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0 || !isEnabled()) return;
    isDown = true;
    distance = 0;
    startX = event.clientX;
    startScroll = track.scrollLeft;
  });

  track.addEventListener('pointermove', (event) => {
    if (!isDown) return;

    const delta = event.clientX - startX;
    distance = Math.max(distance, Math.abs(delta));
    if (distance < DRAG_THRESHOLD) return;

    if (!track.hasPointerCapture(event.pointerId)) {
      track.setPointerCapture(event.pointerId);
      track.classList.add(draggingClass);
    }

    track.scrollLeft = startScroll - delta;
    event.preventDefault();
  });

  function stop(event: PointerEvent): void {
    if (!isDown) return;
    isDown = false;
    track.classList.remove(draggingClass);
    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
  }

  track.addEventListener('pointerup', stop);
  track.addEventListener('pointercancel', stop);
  track.addEventListener('lostpointercapture', stop);

  // Un arrastre no debe activar lo que quedo bajo el cursor: el chip, o el enlace y el
  // "+" de la tarjeta.
  track.addEventListener(
    'click',
    (event) => {
      if (distance > DRAG_THRESHOLD) {
        event.preventDefault();
        event.stopPropagation();
        distance = 0;
      }
    },
    true,
  );

  // Evita el fantasma de arrastre nativo sobre texto/imagenes
  track.addEventListener('dragstart', (event) => event.preventDefault());
}
