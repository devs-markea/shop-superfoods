// Block: footer — "Descubre" lleva a la portada, a la seccion de su categoria.
//
// Dos caminos, porque el pie se pinta en las nueve pantallas y en una de ellas las
// secciones ya estan cargadas:
//
//   fuera de la portada  se deja el pase escrito y se deja navegar. Lo recoge
//                        src/scripts/menu-nav.ts al arrancar la portada.
//   en la portada        no hay a donde ir: se pide a menu-nav.ts que baje a la
//                        seccion de esa categoria. Recargar para llegar a lo que ya
//                        esta en la pagina seria un viaje al servidor por nada.
//
// En el primer camino el evento no se toca: ni preventDefault ni navegacion a
// mano. El enlace es un <a href="/mamayaya"> de verdad, asi que se puede abrir en otra
// pestana o seguir con el JavaScript caido, y entonces la portada sale entera.
//
// En movil no llega a correr: el pie es `display: none` bajo md (ver
// components/Footer.astro), asi que sus enlaces no se pueden pulsar.
//
// LO IMPORTA CADA PANTALLA QUE MONTE EL PIE —las nueve— igual que copy-button en
// /mamayaya/recibido. No se cargo desde un <script> dentro de Footer.astro, que habria sido
// un solo sitio: con este proyecto en servidor y sin paginas prerenderizadas,
// Astro registra el script del componente en el manifiesto pero no emite su
// bundle, y el pie se queda sin comportamiento con un 404 que nada avisa. Si se
// anade una decima pantalla con pie, el import va con ella.

import { DISCOVER_EVENT, rememberCategory } from '../lib/discover.ts';

/** La portada, la unica pantalla que tiene secciones de categoria. */
const HOME = '/mamayaya';

/**
 * Si la portada tiene la seccion de esta categoria: la que lleva su id.
 *
 * Se compara el valor en lugar de componer un selector: el id es un numero hoy, pero
 * nada obliga a que lo siga siendo, y metido en un `[data-category="..."]` cualquier
 * comilla lo romperia.
 */
function hasSection(category: string): boolean {
  for (const section of document.querySelectorAll<HTMLElement>('[data-menu-section]')) {
    if (section.dataset.category === category) return true;
  }

  return false;
}

// Delegado en la lista y no un listener por enlace: son tres rotulos que el
// servidor pinta una vez, pero asi da igual cuantas categorias publique la tienda.
const links = document.querySelector<HTMLElement>('[data-discover]');

links?.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const category = target.closest<HTMLElement>('[data-discover-category]')?.dataset
    .discoverCategory;

  // "Menu completo" tambien esta en esta lista y no lleva el atributo: es la
  // portada entera, sin pase que dejar.
  if (!category) return;

  if (window.location.pathname === HOME) {
    // La categoria ya no esta en la portada —despublicada desde que se pinto este
    // pie—: no se intercepta nada y el enlace recarga la portada, que es la que
    // sabe lo que hay publicado ahora mismo.
    if (!hasSection(category)) return;

    event.preventDefault();
    document.dispatchEvent(new CustomEvent(DISCOVER_EVENT, { detail: category }));
    return;
  }

  rememberCategory(category);
});
