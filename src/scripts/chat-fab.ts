// ---------------------------------------------------------------------------
// El boton del chat se puede arrastrar (components/ChatFab.astro).
//
// Se mueve con el dedo, el raton o el lapiz a cualquier punto de la pantalla, sin
// salirse de ella. Un toque sigue siendo un toque: solo cuenta como arrastre
// cuando el puntero se ha desplazado DRAG_THRESHOLD, y entonces el clic que llega
// al soltar no abre WhatsApp.
//
// TRES DECISIONES
//
// Cada pantalla empieza con el boton en su sitio. El arrastre no se guarda en
// ningun lado, como no se guarda la X de la burbuja: lo pidio el negocio, que
// quiere el boton donde lo coloca el CSS al entrar en cada pagina.
//
// Al empezar a arrastrar se cierra la burbuja, igual que con su X. Si viajara con
// el boton, el boton no podria acercarse al borde izquierdo: la burbuja se
// saldria de la pantalla.
//
// Se mueve con un `translate` sobre .chat-fab y no tocando `right`/`bottom`. Asi el
// sitio de partida lo sigue decidiendo el CSS —y el script del componente, que lo
// sube encima del aviso de tienda cerrada—, y el arrastre es solo un
// desplazamiento sobre el.
// ---------------------------------------------------------------------------

// px antes de considerarlo arrastre. Mas que los 4 de drag-scroll.ts porque aqui
// tambien se arrastra con el dedo, que tiembla mas que el raton al tocar.
const DRAG_THRESHOLD = 6;

// Aire minimo entre el boton y el borde de la pantalla.
const EDGE = 8;

const chat = document.querySelector<HTMLElement>('.chat-fab');
const button = chat?.querySelector<HTMLAnchorElement>('.chat-fab__button');
const callout = chat?.querySelector<HTMLElement>('.chat-fab__callout');

if (chat && button) initDrag(chat, button, callout ?? null);

function initDrag(chat: HTMLElement, button: HTMLAnchorElement, callout: HTMLElement | null): void {
  let pointer: number | null = null;
  let moved = false;
  let startX = 0;
  let startY = 0;
  let baseX = 0;
  let baseY = 0;
  // El desplazamiento actual sobre el sitio de partida.
  let x = 0;
  let y = 0;

  // Coloca el boton a (nx, ny) del sitio de partida, sin dejar que se salga de la
  // pantalla. El ancho y el alto son los del documento y no los de la ventana:
  // en desktop la barra de scroll no es pantalla.
  function place(nx: number, ny: number): void {
    const rect = button.getBoundingClientRect();
    const left = rect.left - x;
    const top = rect.top - y;
    const { clientWidth, clientHeight } = document.documentElement;

    x = clamp(nx, EDGE - left, clientWidth - EDGE - rect.width - left);
    y = clamp(ny, EDGE - top, clientHeight - EDGE - rect.height - top);
    chat.style.transform = `translate(${x}px, ${y}px)`;
  }

  // El puntero se ata al boton desde que se pulsa, y no al pasar el umbral: un
  // raton rapido entrega su primer movimiento ya fuera del circulo, y sin atarlo
  // ese movimiento se lo llevaria lo que hubiera debajo. Con el dedo el navegador
  // ya lo ata solo. El clic de un toque sigue llegando al boton.
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    pointer = event.pointerId;
    moved = false;
    startX = event.clientX;
    startY = event.clientY;
    baseX = x;
    baseY = y;
    button.setPointerCapture(event.pointerId);
  });

  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (!moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      moved = true;
      chat.classList.add('chat-fab--dragging');
      if (callout) callout.hidden = true;
    }

    place(baseX + dx, baseY + dy);
    event.preventDefault();
  });

  function release(event: PointerEvent): void {
    if (event.pointerId !== pointer) return;
    pointer = null;
    chat.classList.remove('chat-fab--dragging');
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  }

  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);

  // Soltar despues de arrastrar no es pedir el chat: el clic que llega se anula.
  button.addEventListener(
    'click',
    (event) => {
      if (!moved) return;
      event.preventDefault();
      event.stopPropagation();
      moved = false;
    },
    true,
  );

  // Sin el fantasma de arrastre nativo: un enlace se arrastra como URL.
  button.addEventListener('dragstart', (event) => event.preventDefault());

  // Si la pantalla cambia —girar el movil, estrechar la ventana— el boton vuelve a
  // caber dentro.
  window.addEventListener('resize', () => {
    if (x !== 0 || y !== 0) place(x, y);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
