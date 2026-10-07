// Los indices de la portada: la columna lateral de desktop (components/MenuSidebar.astro),
// y en movil las tabs (components/CategoryNav.astro) y la hoja de categorias
// (components/MenuSheet.astro). Listan las mismas secciones, y se mueven juntos.
//
// Tres trabajos:
//
//   marcar   la entrada de la seccion que se esta mirando, segun se scrollea.
//   saltar   al pulsar una entrada, hasta su seccion. Sin tocar la URL: el
//            `href="#..."` es para quien no tiene JavaScript; con el, cada pulsacion
//            dejaria un paso mas en el boton de atras.
//   llegar   con el pase de "Descubre" (ver src/lib/discover.ts): al abrir la portada
//            desde el pie de otra pantalla, o al pulsar el pie en esta, baja hasta la
//            seccion de esa categoria.
//
// Cada indice se declara con `data-menu-nav`, que lleva la clase de su entrada
// marcada, y sus entradas con `data-menu-link`, el id de su seccion. Lo que scrollea
// por dentro cuando las entradas no caben, con `data-menu-nav-scroll`.
//
// Un indice con `data-menu-nav-autohide` —las tabs— solo se ve dentro de una
// categoria: arriba del todo y en los destacados lleva puesta la clase de ese
// atributo, que lo esconde.
//
// Mientras el buscador de desktop tiene texto las secciones no estan
// (src/scripts/menu-search.ts): la marca se queda quieta, y saltar a una seccion vacia
// antes el buscador.

import { DISCOVER_EVENT, takeCategory } from '../lib/discover.ts';
import { closeSheet } from '../lib/sheet-close.ts';

/**
 * Donde esta la linea de lectura, como fraccion de lo que lo pegado arriba deja a la
 * vista: la seccion marcada es la ultima cuyo borde de arriba ya la cruzo. A un tercio,
 * el titulo de una seccion pasa a mandar en cuanto se lee, sin esperar a que llegue
 * arriba del todo; y queda muy por debajo del scroll-margin de .menu-section, asi que
 * la seccion a la que se acaba de saltar siempre la ha cruzado.
 */
const READING_LINE = 1 / 3;

/** Lo que tiene que estar quieta la pagina para dar por terminado un salto. */
const SETTLE_MS = 150;

/**
 * Lo que va anclado arriba y tapa lo que pasa por debajo: la barra de cada pantalla y,
 * en movil, la de pedido y las tabs que cuelgan de ella. La linea de lectura se mide
 * desde lo mas bajo de lo que se vea.
 *
 * De las tabs cuenta la barra que se desliza y no su marco: escondidas, la barra esta
 * subida detras de la de pedido y su borde de abajo es el de aquella.
 */
const STICKY = '.navbar, .navbar-desktop, .order-bar, .category-tabs__bar';

/**
 * Si el elemento esta anclado ahora mismo. La barra de pedido solo lo esta en movil: en
 * desktop es un bloque mas de la portada, y su borde no tapa nada.
 */
const pinned = (element: Element) =>
  !element.matches('.order-bar') || window.getComputedStyle(element).position === 'sticky';

interface Nav {
  root: HTMLElement;
  activeClass: string;
  /** La clase que lo esconde, o null si se ve siempre. */
  hiddenClass: string | null;
  scroller: HTMLElement;
  /** Entrada por id de seccion. */
  links: Map<string, HTMLAnchorElement>;
}

/** Si el elemento se ve: el indice de la otra pantalla es `display: none`. */
const visible = (element: Element) => element.getClientRects().length > 0;

function initMenuNav(sections: HTMLElement[], navs: Nav[]): void {
  const first = sections[0];
  if (!first) return;

  const stickies = [...document.querySelectorAll<HTMLElement>(STICKY)];

  // El buscador y lo que marca mientras busca. `data-searching` va en el contenedor de
  // las secciones; con el puesto, las secciones no miden nada y la linea de lectura
  // las daria todas por cruzadas.
  const search = document.querySelector<HTMLInputElement>('[data-menu-search]');
  const searching = () => Boolean(document.querySelector('[data-searching]'));

  let current = first;

  // Cada indice llega del servidor con su primera entrada marcada, y esa no es siempre
  // la de la primera seccion: las tabs no llevan destacados. Se ajusta aqui, antes de
  // que mark() empiece a contar con que la marcada es la de `current`.
  for (const nav of navs) {
    for (const [id, link] of nav.links) {
      const active = id === current.id;

      link.classList.toggle(nav.activeClass, active);
      if (active) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  }

  // Mientras dura un salto la marca no se recalcula: ya esta en la entrada pulsada, y
  // el scroll suave pasaria por todas las de en medio. Tampoco al llegar, porque una
  // seccion corta al final de la pagina no puede subir hasta la linea de lectura y la
  // marca volveria a la de antes. Se recalcula con el siguiente scroll del comprador.
  let jumping = false;
  let settleTimer = 0;

  function settle(): void {
    window.clearTimeout(settleTimer);
    settleTimer = window.setTimeout(() => {
      jumping = false;
    }, SETTLE_MS);
  }

  // La entrada marcada, siempre a la vista dentro de su indice, que scrollea solo
  // cuando no caben: en vertical la columna, en horizontal las tabs. A mano y no con
  // scrollIntoView, que tambien moveria la pagina.
  function reveal(nav: Nav, link: HTMLElement): void {
    const { scroller } = nav;
    if (!visible(scroller)) return;

    const bounds = scroller.getBoundingClientRect();
    const box = link.getBoundingClientRect();

    if (box.top < bounds.top) scroller.scrollTop -= bounds.top - box.top;
    else if (box.bottom > bounds.bottom) scroller.scrollTop += box.bottom - bounds.bottom;

    // En horizontal se respeta el scroll-padding de la pista, para que la tab no quede
    // pegada al borde de la pantalla.
    const padding = parseFloat(window.getComputedStyle(scroller).scrollPaddingInlineStart) || 0;

    if (box.left < bounds.left + padding) {
      scroller.scrollLeft -= bounds.left + padding - box.left;
    } else if (box.right > bounds.right - padding) {
      scroller.scrollLeft += box.right - (bounds.right - padding);
    }
  }

  function mark(section: HTMLElement): void {
    if (section === current) return;

    for (const nav of navs) {
      const previous = nav.links.get(current.id);
      const next = nav.links.get(section.id);

      previous?.classList.remove(nav.activeClass);
      previous?.removeAttribute('aria-current');
      next?.classList.add(nav.activeClass);
      next?.setAttribute('aria-current', 'true');

      if (next) reveal(nav, next);
    }

    current = section;
  }

  // Los indices que se esconden: dentro de una categoria se ven, y en los destacados o
  // antes de llegar a ninguna seccion, no.
  function autohide(inCategory: boolean): void {
    for (const nav of navs) {
      if (nav.hiddenClass) nav.root.classList.toggle(nav.hiddenClass, !inCategory);
    }
  }

  const featured = (section: HTMLElement) => section.hasAttribute('data-menu-featured');

  function spy(): void {
    if (jumping || searching()) return;

    const top = Math.max(
      0,
      ...stickies
        .filter((element) => visible(element) && pinned(element))
        .map((element) => element.getBoundingClientRect().bottom),
    );
    const line = top + (window.innerHeight - top) * READING_LINE;

    // Al fondo de la pagina las ultimas secciones pueden no llegar nunca a la linea:
    // ahi manda la ultima que asoma.
    const atBottom =
      window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;

    let next = first;
    // Si alguna seccion llego ya a la linea. Arriba del todo ninguna: la marca se queda
    // en la primera, pero todavia no se esta en ella.
    let reached = false;

    for (const section of sections) {
      const edge = section.getBoundingClientRect().top;

      if (edge <= line || (atBottom && edge < window.innerHeight)) {
        next = section;
        reached = true;
      }
    }

    mark(next);
    autohide(reached && !featured(next));
  }

  // Sin `behavior` decide el CSS —suave, salvo con movimiento reducido—.
  function jump(section: HTMLElement, behavior?: ScrollBehavior): void {
    // Sin secciones no hay a donde saltar: se vacia el buscador, que las devuelve en el
    // acto —el `input` lo atiende menu-search.ts antes de que esto siga—.
    if (search?.value) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }

    mark(section);
    autohide(!featured(section));
    jumping = true;
    settle();
    section.scrollIntoView({ block: 'start', behavior });
  }

  let frame = 0;

  function schedule(): void {
    if (jumping) {
      settle();
      return;
    }

    if (frame) return;

    frame = window.requestAnimationFrame(() => {
      frame = 0;
      spy();
    });
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);

  for (const nav of document.querySelectorAll<HTMLElement>('[data-menu-nav]')) {
    nav.addEventListener('click', (event) => {
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest<HTMLElement>('[data-menu-link]');
      const section = sections.find((item) => item.id === link?.dataset.menuLink);
      if (!section) return;

      event.preventDefault();

      // El indice de la hoja de movil: primero se cierra, y despues se baja. Al
      // cerrarse, el dialogo devuelve el foco al boton que la abrio; hecho al reves,
      // ese foco podria mover la pagina despues del salto.
      //
      // Donde closeSheet tiene que esperar a la salida para cerrar (Firefox, ver
      // src/lib/sheet-close.ts) el foco vuelve con el salto ya en marcha. Comprobado
      // alli con un salto largo: no lo tuerce, llega al mismo sitio.
      const sheet = link?.closest('dialog');
      if (sheet) closeSheet(sheet);
      jump(section);
    });
  }

  // Al abrir una hoja, su entrada marcada tiene que estar a la vista: mientras estuvo
  // cerrada no se pudo traer, porque no media nada. Un fotograma despues del click,
  // cuando src/scripts/sheet.ts ya la abrio.
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-sheet]')) return;

    window.requestAnimationFrame(() => {
      for (const nav of navs) {
        const link = nav.links.get(current.id);
        if (link) reveal(nav, link);
      }
    });
  });

  // La seccion de una categoria, por su id. Se compara el valor en lugar de componer un
  // selector, por si un id trajera comillas.
  const sectionFor = (category: string) =>
    sections.find((section) => section.dataset.category === category);

  // El pie de esta misma pantalla (src/scripts/footer-discover.ts).
  document.addEventListener(DISCOVER_EVENT, (event) => {
    const section = sectionFor(String((event as CustomEvent).detail ?? ''));
    if (section) jump(section);
  });

  // Al llegar del pie de otra pantalla. Sin animar: es la pagina que se pidio, no un
  // recorrido por ella.
  const pending = takeCategory();
  const arrival = pending ? sectionFor(pending) : undefined;

  if (arrival) jump(arrival, 'instant');
  else spy();
}

const sections = [...document.querySelectorAll<HTMLElement>('[data-menu-section]')];

const navs: Nav[] = [...document.querySelectorAll<HTMLElement>('[data-menu-nav]')].map((root) => ({
  root,
  activeClass: root.dataset.menuNav ?? '',
  hiddenClass: root.dataset.menuNavAutohide ?? null,
  scroller: root.querySelector<HTMLElement>('[data-menu-nav-scroll]') ?? root,
  links: new Map(
    [...root.querySelectorAll<HTMLAnchorElement>('[data-menu-link]')].map((link) => [
      link.dataset.menuLink ?? '',
      link,
    ]),
  ),
}));

initMenuNav(sections, navs);
