// Block: menu-search — el buscador de la portada de desktop.
//
// Busca en los platillos que ya estan en la pagina: el catalogo llega entero en una
// respuesta, asi que no hay nada que pedir. Cada platillo de una categoria trae su
// texto ya normalizado en `data-search` (components/MenuSection.astro), y aqui se
// compara con lo escrito normalizado igual (src/lib/search.ts).
//
// Mientras hay texto, la portada cambia sus secciones por una sola lista: marca el
// contenedor con `data-searching` y cada platillo que no coincide con
// `data-search-miss`, y el CSS de MenuSection.astro hace el resto. Al vaciar el campo
// se retiran las dos marcas y las secciones vuelven tal cual estaban.
//
// ⌘K o Ctrl+K lleva al campo desde cualquier parte de la pagina; Escape lo vacia.

import { DESKTOP_QUERY } from '../lib/breakpoints.ts';
import { matchesSearch, normalizeSearch } from '../lib/search.ts';

const MISS = 'data-search-miss';
const SEARCHING = 'data-searching';

const desktop = window.matchMedia(DESKTOP_QUERY);

const plural = (count: number) => (count === 1 ? 'platillo' : 'platillos');

function initMenuSearch(input: HTMLInputElement, list: HTMLElement): void {
  const items = list.querySelectorAll<HTMLElement>('[data-search]');
  const results = document.querySelector<HTMLElement>('[data-search-results]');
  const summary = document.querySelector<HTMLElement>('[data-search-summary]');
  const status = document.querySelector<HTMLElement>('[data-search-status]');

  function apply(): void {
    const query = normalizeSearch(input.value);

    if (!query) {
      list.removeAttribute(SEARCHING);
      for (const item of items) item.removeAttribute(MISS);
      if (results) results.hidden = true;
      if (status) status.textContent = '';
      return;
    }

    let count = 0;

    for (const item of items) {
      const hit = matchesSearch(item.dataset.search ?? '', query);
      item.toggleAttribute(MISS, !hit);
      if (hit) count += 1;
    }

    list.setAttribute(SEARCHING, '');

    // Lo escrito tal cual, no normalizado: es lo que el comprador reconoce.
    const text = input.value.trim();
    const line =
      count > 0
        ? `${count} ${plural(count)} para «${text}»`
        : `Ningún platillo coincide con «${text}»`;

    if (results) results.hidden = false;
    if (summary) summary.textContent = line;
    if (status) status.textContent = line;
  }

  input.addEventListener('input', apply);

  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !input.value) return;

    input.value = '';
    apply();
  });

  // El atajo. Solo con el buscador a la vista: en movil no existe, y robarle el Ctrl+K
  // al navegador para enfocar un campo oculto seria romperlo para nada.
  document.addEventListener('keydown', (event) => {
    if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
    if (!desktop.matches) return;

    event.preventDefault();
    input.focus();
    input.select();
  });

  // El navegador puede devolver el texto al volver atras a la pagina: se aplica.
  if (input.value) apply();
}

const input = document.querySelector<HTMLInputElement>('[data-menu-search]');
const list = document.querySelector<HTMLElement>('[data-product-list]');

if (input && list) initMenuSearch(input, list);
