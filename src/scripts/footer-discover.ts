// Block: footer — "Descubre" lleva a la portada con su categoria ya filtrada.
//
// Dos caminos, porque el pie se pinta en las nueve pantallas y en una de ellas el
// filtro ya esta cargado:
//
//   fuera de la portada  se deja el pase escrito y se deja navegar. Lo recoge el
//                        script inline de la portada, antes del primer pintado.
//   en la portada        no hay a donde ir: se marca el chip y se sube. Recargar
//                        para filtrar lo que ya esta en la pagina seria un viaje
//                        al servidor por nada, y con la rejilla mas corta el
//                        navegador dejaria al comprador donde estaba —en el pie—
//                        mirando un cambio que ocurrio arriba.
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

import { rememberCategory } from '../lib/discover.ts';

/** La portada, la unica pantalla que tiene chips de categoria. */
const HOME = '/mamayaya';

/**
 * El chip de la portada que corresponde a esta categoria.
 *
 * Se compara `value` en lugar de componer un selector porque el nombre de la
 * categoria lo escribe el panel: puede traer comillas, acentos o espacios, y
 * ninguno de los tres tiene por que sobrevivir metido en un
 * `input[value="..."]`.
 */
function chipFor(category: string): HTMLInputElement | null {
  for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="category"]')) {
    if (radio.value === category) return radio;
  }

  return null;
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
    const chip = chipFor(category);

    // La categoria ya no esta en la barra —renombrada o despublicada desde que se
    // pinto este pie—: no se intercepta nada y el enlace recarga la portada, que
    // es la que sabe lo que hay publicado ahora mismo.
    if (!chip) return;

    event.preventDefault();
    chip.checked = true;

    // El trabajo lo hacen los de siempre: category-filter.ts oculta las celdas y
    // category-nav.ts trae el chip a cuadro. Los dos escuchan `change`, y marcar
    // un radio desde codigo no lo emite por su cuenta.
    chip.dispatchEvent(new Event('change', { bubbles: true }));

    // Arriba, como si se llegara de otra pantalla. Sin `behavior`: asi lo decide
    // el CSS, y con ello el bloque de `prefers-reduced-motion` de styles/base.css.
    window.scrollTo({ top: 0 });
    return;
  }

  rememberCategory(category);
});
