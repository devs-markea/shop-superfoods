// Block: product-hero — la foto de la variante elegida.
//
// La ficha se abre SIEMPRE con la foto del platillo, aunque la variante marcada de
// entrada tenga la suya. A partir de ahi la cabecera sigue a la variante elegida:
//
//   variante con foto   se ve la suya
//   variante sin foto   se ve la del platillo
//
// Es la regla del contrato —`variant.image ?? product.image`— y no depende de la red:
// si se pulsan dos variantes seguidas, gana la ultima aunque la primera tarde mas en
// bajar.
//
// Solo hay cabecera si el platillo tiene foto (ver pages/mamayaya/[slug].astro). Sin
// ella este script no hace nada: las fotos de las variantes no abren un hueco que la
// ficha decidio no tener.
//
// EL CAMBIO: DESVANECIMIENTO
//
// La foto de antes se apaga y la nueva se enciende en su sitio, sin movimiento, en
// 340ms. Hasta que la nueva esta descargada no pasa nada —se sigue viendo la que
// habia—. Lo que se pinta esta en components/ProductHero.astro.
//
// LA REDESCARGA, SOLO SI FALLA
//
// La foto nueva se descarga fuera de la pantalla y no entra hasta que esta lista. Si
// la descarga falla se reintenta con espera creciente —y esperando a recuperar la
// conexion, si se perdio—; si se agotan los intentos, se queda la que habia. Cada
// reintento lleva un parametro en la URL para que el navegador no conteste con el fallo
// que pueda tener guardado: la primera peticion va limpia, y la cache de la foto buena
// sigue sirviendo.
//
// La foto del platillo pasa por lo mismo si falla al abrir la ficha.

/**
 * Lo que dura el cambio: los 100ms de espera y los 240 de entrada de
 * .product-hero__image--incoming, que es la que termina ultima. Aqui es solo el
 * respaldo por si `animationend` no llega —una pestana en segundo plano, por ejemplo—.
 */
const REVEAL_MS = 340;

/** Las esperas antes de cada reintento: tres, y en unos siete segundos se da por perdida. */
const RETRY_DELAYS = [1000, 2000, 4000];

const REVEAL = 'product-hero--reveal';
const INCOMING = 'product-hero__image--incoming';
const OUTGOING = 'product-hero__image--outgoing';
const FAILED = 'product-hero__image--failed';

/** Los radios del selector de variantes. Ver components/OptionGroup.astro. */
const VARIANT_GROUP = '[data-option-group][data-kind="variant"]';

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Sin red no tiene sentido gastar un intento: se espera a que vuelva. */
function whenOnline(): Promise<void> {
  if (navigator.onLine) return Promise.resolve();
  return new Promise((resolve) => window.addEventListener('online', () => resolve(), { once: true }));
}

/** La URL del reintento: la misma foto con una marca que la saca de la cache. */
function retryUrl(src: string, attempt: number): string {
  const url = new URL(src, window.location.href);
  url.searchParams.set('reintento', String(attempt));
  return url.href;
}

function fetchImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

/**
 * Descarga la foto con sus reintentos y la devuelve ya decodificada, o null si se
 * agotaron. `from` es el intento por el que se empieza: 1 para una foto que ya fallo
 * una vez. `alive` corta la cuenta en cuanto otra eleccion deja esta descarga sin
 * proposito.
 */
async function download(
  src: string,
  from: number,
  alive: () => boolean,
): Promise<HTMLImageElement | null> {
  for (let attempt = from; attempt <= RETRY_DELAYS.length; attempt++) {
    if (attempt > 0) {
      await wait(RETRY_DELAYS[attempt - 1] ?? 0);
      await whenOnline();
      if (!alive()) return null;
    }

    const image = await fetchImage(attempt === 0 ? src : retryUrl(src, attempt));
    if (!alive()) return null;

    if (image) {
      // Decodificada antes de entrar: si no, la aparicion arrancaria con un fotograma
      // vacio y la foto saldria de golpe a mitad de la animacion.
      await image.decode().catch(() => {});
      return image;
    }
  }

  return null;
}

function initProductHero(hero: HTMLElement): void {
  const images = () => [...hero.querySelectorAll<HTMLImageElement>('[data-hero-image]')];
  const first = images()[0];
  if (!first) return;

  // La del platillo, que es a la que vuelve una variante sin foto.
  const mainSrc = first.getAttribute('src') ?? '';
  const mainAlt = first.alt;

  // La foto que tiene que acabar en pantalla y la que ya esta. Se comparan por la URL
  // que manda la API, sin la marca de los reintentos.
  let target: string | null = mainSrc;
  let shown: string | null = mainSrc;

  // Cada eleccion saca su numero; la descarga que vuelve con uno viejo ya no entra.
  let ticket = 0;

  // El cierre del cambio en curso, mientras lo hay.
  let finishReveal: (() => void) | null = null;

  function reveal(image: HTMLImageElement, src: string, alt: string): void {
    // Un cambio a medias se da por terminado: la que estaba entrando pasa a ser la que
    // sale, y tiene que salir desde su sitio y no desde la mitad del camino.
    finishReveal?.();

    // La que se esta viendo sale; la que no llego a cargar —oculta— sale igual.
    for (const old of images()) old.classList.add(OUTGOING);

    image.className = `product-hero__image ${INCOMING}`;
    image.alt = alt;
    image.dataset.heroImage = '';

    // Detras de la ultima foto y no al final del bloque: el control de volver va
    // despues en el marcado, y asi se sigue pintando encima.
    images().at(-1)?.after(image);
    hero.classList.add(REVEAL);

    shown = src;

    const settle = () => {
      // Ya lo cerro un cambio posterior, o el otro de los dos avisos.
      if (finishReveal !== settle) return;
      finishReveal = null;

      for (const old of images()) {
        if (old === image) break;
        old.remove();
      }
      image.classList.remove(INCOMING);
      hero.classList.remove(REVEAL);
    };
    finishReveal = settle;

    image.addEventListener('animationend', settle, { once: true });
    window.setTimeout(settle, REVEAL_MS + 100);
  }

  async function show(src: string, alt: string, from = 0): Promise<void> {
    target = src;
    const mine = ++ticket;

    const image = await download(src, from, () => mine === ticket);
    if (mine !== ticket) return;

    if (image) {
      reveal(image, src, alt);
      return;
    }

    // Agotada: se queda la que hay, y volver a elegir esa variante lo intenta de nuevo.
    target = shown;
  }

  // El selector de variantes vive en el formulario, que es hermano de la cabecera.
  const page = hero.closest('main') ?? document;

  function choose(input: HTMLInputElement): void {
    if (!input.checked || !input.closest(VARIANT_GROUP)) return;

    // La variante sin foto no trae el atributo, y entonces le toca la del platillo.
    const own = input.dataset.imageSrc;
    const src = own ?? mainSrc;
    if (src === target) return;

    void show(src, own ? (input.dataset.imageAlt ?? '') : mainAlt);
  }

  page.addEventListener('change', (event) => {
    if (event.target instanceof HTMLInputElement) choose(event.target);
  });

  // La foto del platillo que no llego. Se oculta para dejar ver el degradado, y se
  // reintenta solo si sigue siendo la que toca: si entretanto se eligio una variante
  // con foto, reintentar esta la volveria a tapar.
  const recover = () => {
    first.classList.add(FAILED);
    if (shown === mainSrc) shown = null;
    if (target === mainSrc) void show(mainSrc, mainAlt, 1);
  };

  // Puede haber fallado antes de que este modulo, que es diferido, empezara a
  // escuchar. `complete` sin medida natural es justo eso.
  if (first.complete && first.naturalWidth === 0) recover();
  else first.addEventListener('error', recover, { once: true });

  // Al volver a la ficha con "Atras", el navegador puede devolver marcada la variante
  // que se habia elegido. La cabecera la acompana, como si se acabara de pulsar.
  const restored = page.querySelector<HTMLInputElement>(`${VARIANT_GROUP} input:checked`);
  if (restored && !restored.defaultChecked) choose(restored);
}

for (const hero of document.querySelectorAll<HTMLElement>('[data-product-hero]')) {
  initProductHero(hero);
}
