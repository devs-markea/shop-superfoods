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

// Lo mismo, pero para el chip que ya llega marcado sin que nadie haya pulsado
// nada: lo hace el pase de "Descubre" (ver src/lib/discover.ts), que marca el chip
// antes de pintar y por tanto sin evento `change` que el escuchador de arriba
// pueda recoger. Un chip marcado fuera de cuadro deja la rejilla filtrada sin
// nada que diga por quien.
//
// A mano y no con scrollIntoView: aqui se corre al cargar, y esa llamada tambien
// puede desplazar la pagina en vertical para acercar el carrusel. Esto mueve solo
// la pista, que es lo unico que hay que corregir. Es la regla de `inline:
// 'nearest'` —acercar el borde que se salio, y nada mas— con las medidas en
// pantalla, que no dependen de quien sea el `offsetParent` de la etiqueta.
//
// A partir de lg no hace nada: los chips se reparten en varias lineas y el
// carrusel deja de tener scroll (ver components/_category-nav.scss).
function revealChecked(track: HTMLElement): void {
  const checked = track.querySelector<HTMLInputElement>('input[name="category"]:checked');
  if (!checked) return;

  const label = track.querySelector<HTMLElement>(`label[for="${checked.id}"]`);
  if (!label) return;

  const bounds = track.getBoundingClientRect();
  const chip = label.getBoundingClientRect();

  if (chip.left < bounds.left) track.scrollLeft -= bounds.left - chip.left;
  else if (chip.right > bounds.right) track.scrollLeft += chip.right - bounds.right;
}

for (const track of document.querySelectorAll<HTMLElement>('[data-carousel]')) {
  initDragScroll(track);
  initScrollIntoView(track);
  revealChecked(track);
}
