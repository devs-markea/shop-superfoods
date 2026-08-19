// Block: skeleton — la foto que llega retira su relleno.
//
// El esqueleto lo pinta el servidor y lo quita esto, asi que el estado de partida
// es "cargando" y no hace falta que nadie lo encienda: si el script tardara, lo
// que se ve mientras tanto es justo lo que toca.
//
// `load` y `error` no burbujean, pero SI se recogen en la fase de captura, que es
// lo que permite un solo par de escuchadores en document en lugar de dos por cada
// foto de la rejilla. Se atiende tambien `error`: una foto que no existe ya no va a
// llegar, y dejarla latiendo prometeria una imagen para siempre.
//
// Sirve a las dos esperas con el mismo mecanismo, porque el estado es de cada foto
// y no de la pantalla: la carga inicial, y la foto que empieza a descargarse
// cuando un filtro devuelve su celda a la rejilla. Esa segunda no necesita nada
// mas —su caja nunca perdio el esqueleto, porque su imagen nunca cargo—.
//
// Lo que este script NO hace es el esqueleto del cambio de categoria: ahi no hay
// descarga que esperar y el relleno se pone y se quita por tiempo. Eso vive en
// src/scripts/category-filter.ts, y los dos conviven sin pisarse —el suyo gana
// mientras dura, y si al soltarlo la foto todavia no ha llegado, esta clase sigue
// puesta y el relleno continua—.

/** La clase que pinta el relleno. Ver styles/components/ProductCard.astro. */
const SKELETON = 'skeleton';

function clear(target: EventTarget | null): void {
  if (!(target instanceof HTMLImageElement)) return;

  target.closest('[data-skeleton]')?.classList.remove(SKELETON);
}

document.addEventListener('load', (event) => clear(event.target), true);
document.addEventListener('error', (event) => clear(event.target), true);

// Las que ya estaban listas antes de que esto arrancara. Este modulo es diferido,
// asi que la primera foto —la unica en `eager`— y cualquiera que venga de la cache
// pueden haber disparado su `load` cuando aqui no habia nadie escuchando.
// `complete` es lo unico que las distingue, y cubre igual a la que fallo.
for (const box of document.querySelectorAll<HTMLElement>('[data-skeleton]')) {
  if (box.querySelector('img')?.complete) box.classList.remove(SKELETON);
}
