// Block: category-nav — arrastre con raton/lapiz.
// En touch se deja el scroll nativo del navegador.
// Portado de shared/js/main.js; la seleccion del chip ya no se maneja aqui,
// la resuelven los radios .btn-check.

const DRAG_THRESHOLD = 4; // px antes de considerarlo arrastre

function initDragScroll(track: HTMLElement): void {
  let isDown = false;
  let startX = 0;
  let startScroll = 0;
  let distance = 0;

  track.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
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
      track.classList.add('category-nav--dragging');
    }

    track.scrollLeft = startScroll - delta;
    event.preventDefault();
  });

  function stop(event: PointerEvent): void {
    if (!isDown) return;
    isDown = false;
    track.classList.remove('category-nav--dragging');
    if (track.hasPointerCapture(event.pointerId)) {
      track.releasePointerCapture(event.pointerId);
    }
  }

  track.addEventListener('pointerup', stop);
  track.addEventListener('pointercancel', stop);
  track.addEventListener('lostpointercapture', stop);

  // Un arrastre no debe activar el chip que quedo bajo el cursor
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

// Deja visible el chip elegido si estaba fuera de cuadro
function initScrollIntoView(track: HTMLElement): void {
  track.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) return;

    const label = track.querySelector<HTMLElement>(`label[for="${input.id}"]`);
    label?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
}

for (const track of document.querySelectorAll<HTMLElement>('[data-carousel]')) {
  initDragScroll(track);
  initScrollIntoView(track);
}
