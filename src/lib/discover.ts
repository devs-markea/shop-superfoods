// ---------------------------------------------------------------------------
// El pase de "Descubre": la categoria que viaja del pie a la portada.
//
// Los rotulos del pie enlazan a la portada —donde vive el filtro— y la categoria
// elegida viaja POR FUERA de la URL, en sessionStorage, para que la direccion
// siga siendo `/mamayaya` a secas. Es la contrapartida elegida: el filtro no se puede
// compartir por enlace, y en cambio la barra de direcciones no acumula
// parametros de una eleccion que dura un momento.
//
// DE UN SOLO USO. La portada lo lee y lo retira en el mismo gesto. No es una
// preferencia del comprador —eso seria una cookie, como el borrador del pedido—
// sino la continuacion de un click: si sobreviviera, quien un dia pulso "Bebidas"
// abriria la tienda otro dia filtrada sin haber pedido nada. Por lo mismo es
// sessionStorage y no localStorage: el pase es de esta pestana y de este momento.
//
// EL LECTOR NO ESTA AQUI, y no por descuido. Vive como script inline y bloqueante
// al final de la rejilla de la portada (ver src/pages/index.astro) porque tiene
// que marcar el chip y ocultar las celdas ANTES del primer pintado: un modulo
// diferido llega cuando la rejilla entera puede estar ya en pantalla, y el filtro
// se veria como un salto. Un script inline no puede importar, asi que recibe esta
// clave por `define:vars` en lugar de repetirla escrita a mano.
// ---------------------------------------------------------------------------

/** Clave del pase. Misma familia que las cookies de la tienda: `sf_*`. */
export const DISCOVER_KEY = 'sf_discover';

/**
 * Deja escrita la categoria que se acaba de pulsar en el pie.
 *
 * Sincrono a proposito: corre dentro del click, justo antes de que el navegador
 * se lleve la pagina, que es lo que hace que no haya carrera con la navegacion.
 *
 * sessionStorage puede lanzar —modo privado, almacenamiento bloqueado— y no pasa
 * nada: sin pase el enlace sigue llevando a la portada sin filtrar, que es
 * exactamente lo que hace "Menu completo" ahi al lado.
 */
export function rememberCategory(category: string): void {
  try {
    window.sessionStorage.setItem(DISCOVER_KEY, category);
  } catch {
    // Sin almacenamiento no hay filtro, pero el enlace navega igual.
  }
}
