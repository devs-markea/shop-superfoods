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
// El estado es de cada foto y no de la pantalla: una foto `lazy` que todavia no se
// pidio —la de una tarjeta de mas abajo, o la de un destacado fuera de la pista—
// sigue con su esqueleto hasta que llega, sin que nadie tenga que encenderlo.

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
