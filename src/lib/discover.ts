// ---------------------------------------------------------------------------
// El pase de "Descubre": la categoria que viaja del pie a la portada.
//
// Los rotulos del pie enlazan a la portada y la categoria elegida viaja POR FUERA de
// la URL, en sessionStorage, para que la direccion siga siendo `/mamayaya` a secas. Es
// la contrapartida elegida: el destino no se puede compartir por enlace, y en cambio
// la barra de direcciones no acumula parametros de una eleccion que dura un momento.
//
// Al llegar, la portada baja hasta la seccion de esa categoria, en movil y en desktop:
// lo hace src/scripts/menu-nav.ts, que es quien recorre las secciones.
//
// DE UN SOLO USO. La portada lo lee y lo retira en el mismo gesto. No es una
// preferencia del comprador —eso seria una cookie, como el borrador del pedido—
// sino la continuacion de un click: si sobreviviera, quien un dia pulso "Bebidas"
// abriria la tienda otro dia en esa seccion sin haber pedido nada. Por lo mismo es
// sessionStorage y no localStorage: el pase es de esta pestana y de este momento.
//
// LO QUE VIAJA ES EL ID DE LA CATEGORIA, no su nombre: es el de la seccion de la
// portada (`data-category`), y no cambia si el panel la renombra entre el click y la
// llegada.
// ---------------------------------------------------------------------------

/** Clave del pase. Misma familia que las cookies de la tienda: `sf_*`. */
const DISCOVER_KEY = 'sf_discover';

/**
 * El evento con el que el pie pide bajar a una categoria cuando ya se esta en la
 * portada: ahi no hay pase que dejar ni a donde navegar. Lleva el id en `detail`, y lo
 * atiende src/scripts/menu-nav.ts.
 */
export const DISCOVER_EVENT = 'sf:discover';

/**
 * Deja escrita la categoria que se acaba de pulsar en el pie: su id.
 *
 * Sincrono a proposito: corre dentro del click, justo antes de que el navegador
 * se lleve la pagina, que es lo que hace que no haya carrera con la navegacion.
 *
 * sessionStorage puede lanzar —modo privado, almacenamiento bloqueado— y no pasa
 * nada: sin pase el enlace sigue llevando a la portada, arriba del todo, que es
 * exactamente lo que hace "Menu completo" ahi al lado.
 */
export function rememberCategory(category: string): void {
  try {
    window.sessionStorage.setItem(DISCOVER_KEY, category);
  } catch {
    // Sin almacenamiento no hay pase, pero el enlace navega igual.
  }
}

/**
 * El pase que dejo el pie, retirado al leerlo, sirva o no: la categoria pudo
 * despublicarse entre el click y la llegada. `null` si no hay ninguno.
 */
export function takeCategory(): string | null {
  try {
    const category = window.sessionStorage.getItem(DISCOVER_KEY);
    if (category) window.sessionStorage.removeItem(DISCOVER_KEY);

    return category;
  } catch {
    return null;
  }
}
