// Hojas modales de la barra superior (horario, ubicacion).
//
// Delegacion en document: sirve para cualquier [data-sheet] de la pagina y no hay
// que registrar nada al anadir una hoja nueva.
//
// Todo lo demas —fondo, foco atrapado, resto de la pagina inerte— lo pone
// `showModal()` del <dialog> nativo. Aqui solo estan abrir, cerrar y el cierre al
// pulsar fuera, que es lo unico que el elemento no trae hecho.
//
// Se cierra siempre por closeSheet (src/lib/sheet-close.ts), que es quien le da la
// salida a la hoja donde el navegador no sabe darsela.

import { closeSheet } from '../lib/sheet-close.ts';

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const opener = target.closest<HTMLElement>('[data-sheet]');

  if (opener) {
    const sheet = document.getElementById(opener.dataset.sheet ?? '');
    if (sheet instanceof HTMLDialogElement) sheet.showModal();
    return;
  }

  const closer = target.closest('[data-sheet-close]');
  if (closer) {
    const sheet = closer.closest('dialog');
    if (sheet) closeSheet(sheet);
    return;
  }

  // Pulsar fuera. El <dialog> ocupa solo la hoja, asi que un click cuyo objetivo
  // ES el dialogo cayo en su fondo: dentro, el objetivo siempre es un hijo.
  //
  // Salvo en las hojas marcadas como persistentes, donde hay trabajo que perder:
  // en el mapa de la ubicacion, un toque de mas fuera de la hoja tiraba el punto
  // recien buscado. Ahi se sale por la X o con Escape —a proposito, las dos son
  // deliberadas—, y no por rozar el fondo. Ver components/Sheet.astro.
  if (target instanceof HTMLDialogElement && target.dataset.sheetPersistent === undefined) {
    closeSheet(target);
  }
});

// Escape. El <dialog> se cerraria solo, y por su cuenta: sin pasar por closeSheet, y
// por tanto sin salida donde depende de el. Se le quita el cierre y se hace aqui.
//
// El navegador solo avisa con `cancel` si hubo un gesto del usuario desde que se
// abrio la hoja —aqui siempre: se abren con un toque—; abierta desde un script,
// Escape la cierra sin pasar por aqui.
//
// En captura, porque `cancel` no burbujea hasta document.
document.addEventListener(
  'cancel',
  (event) => {
    if (!(event.target instanceof HTMLDialogElement)) return;

    event.preventDefault();
    closeSheet(event.target);
  },
  true,
);
