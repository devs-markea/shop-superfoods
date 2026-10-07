// Cerrar una hoja (components/Sheet.astro) dejandole hacer su salida.
//
// La salida esta escrita en CSS, y cuelga de que `display` sepa esperar al final de la
// transicion (`allow-discrete`). Firefox entiende la palabra pero no la aplica a
// `display`: al cerrar el <dialog> lo apaga en el primer fotograma, y la hoja
// desaparece de golpe en lugar de bajar.
//
// Ahi la salida se hace con la hoja todavia ABIERTA: se le pone `data-sheet-closing`,
// que en el CSS es la posicion y la curva de cerrada, y se cierra de verdad cuando el
// recorrido termina. Abierta sigue en la capa superior y con su velo, asi que se ve
// igual que donde el navegador lo hace solo.
//
// Solo en movil. `data-sheet-closing` describe la salida de la hoja que baja; la
// ventana centrada de desktop tiene otra —encoge y se apaga— y se cierra como siempre.

import { DESKTOP_QUERY } from './breakpoints.ts';

const desktop = window.matchMedia(DESKTOP_QUERY);

let holds: boolean | undefined;

/**
 * Si el navegador sostiene `display` mientras dura una transicion. No hay
 * `CSS.supports` que lo diga —la sintaxis la aceptan todos—, asi que se le pregunta
 * haciendolo, y una sola vez.
 */
function holdsDisplay(): boolean {
  if (holds !== undefined) return holds;

  const probe = document.createElement('div');
  probe.style.transition = 'display 1s allow-discrete';
  document.body.append(probe);

  // Leer el estilo lo fija: sin un valor de partida no hay transicion que empezar.
  void window.getComputedStyle(probe).display;
  probe.style.display = 'none';
  holds = window.getComputedStyle(probe).display !== 'none';

  probe.remove();
  return holds;
}

/** Cierra la hoja. Si ya se esta cerrando, no hace nada. */
export function closeSheet(dialog: HTMLDialogElement): void {
  if (!dialog.open || dialog.dataset.sheetClosing !== undefined) return;

  if (desktop.matches || holdsDisplay()) {
    dialog.close();
    return;
  }

  dialog.dataset.sheetClosing = '';

  // Las transiciones que el atributo acaba de poner en marcha. Sin ninguna —la hoja ya
  // estaba abajo, o no hay movimiento que hacer— no se espera a nada.
  const exits = dialog.getAnimations().map((animation) => animation.finished);

  // allSettled y no all: una transicion que se corta rechaza su promesa, y la hoja
  // tiene que acabar cerrada igual.
  void Promise.allSettled(exits).then(() => {
    dialog.close();
    delete dialog.dataset.sheetClosing;
  });
}
