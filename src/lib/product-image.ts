// ---------------------------------------------------------------------------
// La foto del platillo: si la hay.
//
// Un platillo puede no tener ninguna, y entonces NO SE PINTA CAJA. La tarjeta,
// la linea del pedido y el detalle del pago corren su contenido hacia la
// izquierda, y la ficha se queda en una sola columna centrada. Reservar el hueco
// para un relleno gris no dice nada del platillo: a 80, 70 y 56 es un icono
// ilegible que no se distingue de una foto que fallo, y en la ficha de desktop
// ocupaba 520x480 de pantalla para decir "sin imagen".
//
// Este modulo es ISOMORFICO —no importa nada de astro:env— porque la misma
// pregunta la hacen el servidor (tarjetas, ficha y detalle del pago) y el
// navegador (src/lib/cart-view.ts, que repinta el pedido con cada cambio de
// cantidad). Las dos tienen que responder lo mismo, o una linea sin foto saldria
// con caja al cargar la pagina y sin ella al pulsar "+".
// ---------------------------------------------------------------------------

/**
 * El relleno que la API sirve hoy por los platillos sin foto: un SVG gris con un
 * icono y la palabra "Sin imagen".
 *
 * Cuenta como "sin foto", porque es la misma ausencia dicha con una URL. Se
 * reconoce aqui —y no se confia solo en que el campo llegue vacio— para que el
 * hueco se cierre tambien mientras el backend siga mandandolo. Cuando deje de
 * hacerlo, esta constante se retira y no hay que tocar nada mas: lo que decide
 * de verdad es hasImage().
 */
export const PLACEHOLDER_IMAGE_PATH = '/images/placeholder-dish.svg';

/**
 * Si el platillo trae foto propia que pintar.
 *
 * Cubre las cuatro formas en que puede no traerla —el campo ausente, `null`, la
 * cadena vacia y el relleno de arriba—, y por eso se pregunta por aqui en lugar
 * de leer `image.url` a pelo: el contrato dice que el campo viene siempre, pero
 * de eso responde la API, y un `undefined` no dejaba un hueco sino una pantalla
 * de error —tanto assetUrl() como escape() trabajan sobre la cadena—.
 */
export function hasImage<T extends { url?: string | null }>(
  image: T | null | undefined,
): image is T & { url: string } {
  const url = image?.url;
  if (typeof url !== 'string') return false;

  // Sin query ni fragmento: el relleno puede llegar con una version detras.
  const path = url.trim().split(/[?#]/)[0] ?? '';

  return path !== '' && !path.endsWith(PLACEHOLDER_IMAGE_PATH);
}
