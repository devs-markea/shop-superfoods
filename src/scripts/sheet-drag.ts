// Hojas que se cierran arrastrandolas hacia abajo: las que llevan un `[data-sheet-drag]`
// —el tirador— dentro de su <dialog>. Hoy, la hoja de categorias de movil
// (components/MenuSheet.astro).
//
// Mientras se arrastra, la hoja sigue al dedo y nada mas: se le quitan las
// transiciones para que no vaya por detras. Al soltar se le devuelven, y las del CSS
// de .sheet (components/Sheet.astro) hacen el resto desde donde quedo:
//
//   cerrar     si se bajo mas de una cuarta parte de su alto, o si se solto con
//              impulso hacia abajo —un tiron corto y rapido tambien es "cierra"—. La
//              salida de .sheet la lleva el resto del camino.
//   volver     si no. La entrada de .sheet la sube otra vez a su sitio.
//
// Solo hacia abajo: hacia arriba la hoja ya esta donde tiene que estar.

/** Lo que hay que bajarla, como fraccion de su alto, para que se cierre al soltar. */
const CLOSE_RATIO = 0.25;

/** Velocidad hacia abajo, en px/ms, a partir de la cual soltar es cerrar. */
const FLICK = 0.5;

function initSheetDrag(handle: HTMLElement, dialog: HTMLDialogElement): void {
  let pointer: number | null = null;
  let startY = 0;
  let offset = 0;
  let lastY = 0;
  let lastTime = 0;
  let velocity = 0;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;

    pointer = event.pointerId;
    startY = lastY = event.clientY;
    lastTime = event.timeStamp;
    offset = 0;
    velocity = 0;

    handle.setPointerCapture(event.pointerId);
    dialog.style.transition = 'none';
  });

  handle.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointer) return;

    offset = Math.max(0, event.clientY - startY);

    const elapsed = event.timeStamp - lastTime;
    if (elapsed > 0) velocity = (event.clientY - lastY) / elapsed;

    lastY = event.clientY;
    lastTime = event.timeStamp;

    dialog.style.translate = `0 ${offset}px`;
  });

  function release(event: PointerEvent): void {
    if (event.pointerId !== pointer) return;
    pointer = null;

    // Las dos a la vez: la hoja parte de donde la dejo el dedo y va a donde mande el
    // CSS —abajo del todo si se cierra, a su sitio si no— con la transicion de ese
    // estado.
    dialog.style.transition = '';
    dialog.style.translate = '';

    if (offset > dialog.offsetHeight * CLOSE_RATIO || velocity > FLICK) dialog.close();
  }

  handle.addEventListener('pointerup', release);
  handle.addEventListener('pointercancel', release);
}

for (const handle of document.querySelectorAll<HTMLElement>('[data-sheet-drag]')) {
  const dialog = handle.closest('dialog');
  if (dialog) initSheetDrag(handle, dialog);
}
