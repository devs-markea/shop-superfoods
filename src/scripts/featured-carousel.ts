// Block: menu-section — la lista horizontal de destacados.
//
// Dos carruseles con el mismo marcado, uno por pantalla:
//
//   desktop  la pista es un scroll nativo: rueda, trackpad, arrastre con raton
//            —src/lib/drag-scroll.ts— y las dos flechas de la cabecera, que avanzan o
//            retroceden una pantalla de tarjetas. El snap de la pista
//            (components/MenuSection.astro) deja la primera de cada pantalla alineada
//            con la rejilla de debajo.
//   movil    Swiper: se desliza con el dedo, con puntos debajo. Se monta al entrar en
//            movil y se desmonta al salir, y entonces la pista vuelve a ser la de
//            desktop tal cual —Swiper limpia lo que puso—.
//
// Las flechas llegan apagadas del servidor y aqui se encienden segun lo que quede por
// ver a cada lado: en un extremo, la de ese lado no lleva a ningun sitio.

import Swiper from 'swiper';
import { Pagination } from 'swiper/modules';
import { DESKTOP_QUERY } from '../lib/breakpoints.ts';
import { initDragScroll } from '../lib/drag-scroll.ts';

/** Holgura de los extremos: el scroll puede quedarse a una fraccion de pixel. */
const EDGE = 1;

/**
 * Lo que el carrusel de movil reparte, en px: el aire a cada lado —el gutter de la
 * pagina, que el contenedor se come al sangrar— y el hueco entre tarjetas. El ancho de
 * cada tarjeta lo pone el CSS (`slidesPerView: 'auto'`).
 */
const MOBILE_GUTTER = 20;
const MOBILE_GAP = 16;

const desktop = window.matchMedia(DESKTOP_QUERY);

/** Las flechas de desktop sobre la pista de scroll nativo. */
function initArrows(track: HTMLElement, section: HTMLElement | null): void {
  const prev = section?.querySelector<HTMLButtonElement>('[data-carousel-prev]');
  const next = section?.querySelector<HTMLButtonElement>('[data-carousel-next]');

  function update(): void {
    const max = track.scrollWidth - track.clientWidth;

    if (prev) prev.disabled = track.scrollLeft <= EDGE;
    if (next) next.disabled = track.scrollLeft >= max - EDGE;
  }

  // Una pantalla: lo que se ve de la pista sin su relleno —que es el sitio de la
  // sombra, no de las tarjetas— mas un hueco. Sin `behavior` decide el CSS.
  function page(direction: 1 | -1): void {
    const style = window.getComputedStyle(track);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const gap = parseFloat(style.columnGap) || 0;

    track.scrollBy({ left: direction * (track.clientWidth - padding + gap) });
  }

  prev?.addEventListener('click', () => page(-1));
  next?.addEventListener('click', () => page(1));

  track.addEventListener('scroll', update, { passive: true });

  // El ancho de la pista cambia con la ventana, y con el, si sobran tarjetas.
  new ResizeObserver(update).observe(track);

  update();
}

function initCarousel(carousel: HTMLElement): void {
  const track = carousel.querySelector<HTMLElement>('[data-featured-track]');
  if (!track) return;

  const section = carousel.closest<HTMLElement>('[data-menu-section]');
  const dots = section?.querySelector<HTMLElement>('[data-featured-dots]') ?? null;

  // El arrastre con raton es de desktop: en movil lo hace Swiper, y los dos a la vez
  // moverian la pista dos veces.
  initDragScroll(track, 'menu-section__track--dragging', () => desktop.matches);
  initArrows(track, section);

  let swiper: Swiper | null = null;

  function sync(): void {
    if (desktop.matches) {
      swiper?.destroy(true, true);
      swiper = null;
      // Los puntos que pinto: con el carrusel desmontado no señalan nada.
      dots?.replaceChildren();
      return;
    }

    if (swiper) return;

    swiper = new Swiper(carousel, {
      modules: [Pagination],
      // Las clases del marcado, no las de Swiper: asi su hoja de estilos —que no se
      // carga— no hace falta, y nada suyo alcanza al resto de la portada.
      wrapperClass: 'menu-section__track',
      slideClass: 'menu-section__item',
      slidesPerView: 'auto',
      spaceBetween: MOBILE_GAP,
      slidesOffsetBefore: MOBILE_GUTTER,
      slidesOffsetAfter: MOBILE_GUTTER,
      speed: 500,
      // Con todas las tarjetas a la vista —una sola— no hay nada que deslizar, y los
      // puntos se esconden (`swiper-pagination-lock`, ver MenuSection.astro).
      watchOverflow: true,
      pagination: dots ? { el: dots, clickable: true } : false,
    });
  }

  sync();
  desktop.addEventListener('change', sync);
}

for (const carousel of document.querySelectorAll<HTMLElement>('[data-featured-carousel]')) {
  initCarousel(carousel);
}
