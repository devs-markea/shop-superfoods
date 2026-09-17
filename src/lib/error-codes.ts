// ---------------------------------------------------------------------------
// El codigo que acompaña a cada aviso de fallo.
//
// PARA QUE SIRVE. Tres averias que no se parecen en nada —el 502 del hosting, el 202 del
// captcha del 2026-09-17 y un silencio de la red— ensenan al comprador EL MISMO TEXTO. Quien
// lo reporta solo puede decir "no me carga el menu", y el diagnostico empieza de cero cada
// vez. Con el codigo, una captura de pantalla dice que fallo y donde, y el mismo codigo va en
// el log del servidor: se busca literal y se cae en la peticion.
//
// NO ES PARA EL COMPRADOR, y por eso no se le explica ni se le pide nada: quien lo necesite
// lo tiene, y quien no, lo ignora. El texto de arriba sigue siendo lo que se lee.
//
// ES ISOMORFICO, como src/lib/throttle.ts: no importa `astro:env` ni el cliente de la API,
// asi que vale igual en el frontmatter de una pagina y dentro de un <script>. Por eso el
// error se lee "a tientas" (`status`, `timedOut`) en lugar de importar ApiError: importarlo
// arrastraria `astro:env/server` a los bundles del navegador.
//
// EL CATALOGO COMPLETO —que codigo sale en cada pantalla y con que texto— vive fuera del
// repositorio, en `SuperFoods/feature/codigos-de-error-visibles.md`. Antes de estrenar un
// codigo nuevo se anade su fila alli: es lo que evita que dos pantallas acaben usando el
// mismo para cosas distintas.
// ---------------------------------------------------------------------------

/**
 * La pantalla donde se vio el fallo. Una letra, porque el codigo se lee en voz alta por
 * telefono y se teclea en un buscador de logs.
 */
export const ERROR_AREAS = {
  /** Menu: la portada. */
  menu: 'M',
  /** Detalle: la ficha del platillo. */
  detail: 'D',
  /** Carrito. */
  cart: 'C',
  /** Envio: la cotizacion de /mamayaya/datos. */
  shipping: 'E',
  /** Pago: las tres pantallas de pago, el cierre del pedido y el cobro. */
  payment: 'P',
  /** Recibido y confirmado: el acuse y la relectura del pedido. */
  receipt: 'R',
} as const;

export type ErrorArea = (typeof ERROR_AREAS)[keyof typeof ERROR_AREAS];

/** Lo que se pone cuando no hubo respuesta que leer. */
const NO_RESPONSE = 'NET';

/** Lo que se pone cuando la API acepto y se callo hasta agotar el plazo. */
const TIMED_OUT = 'TMO';

/**
 * Lo que se emite cuando el fallo no trae nada reconocible.
 *
 * Existe para que esta funcion NUNCA lance ni devuelva vacio: un aviso con un codigo raro
 * sigue sirviendo —dice la pantalla y que fue algo inesperado—, y uno sin codigo no sirve de
 * nada. Si aparece en produccion, es una rama que falta contemplar.
 */
const UNKNOWN = 'ERR';

/** `SF-M202`, `SF-DNET`. */
function compose(area: ErrorArea, cause: string): string {
  return `SF-${area}${cause}`;
}

/** El codigo de una respuesta que llego con su status: `SF-C429`, `SF-P409`. */
export function statusCode(area: ErrorArea, status: number): string {
  return Number.isInteger(status) && status > 0
    ? compose(area, String(status))
    : compose(area, NO_RESPONSE);
}

/**
 * El codigo de un fallo al leer desde el servidor.
 *
 * Lee el error a tientas en lugar de comprobar `instanceof ApiError` (ver la cabecera): de
 * ahi salen el `status` —0 cuando la API no llego a contestar— y `timedOut`, que distingue
 * el silencio hasta agotar el plazo de la conexion que no se abrio. Son dos averias
 * distintas y se buscan distinto.
 */
export function errorCode(area: ErrorArea, error: unknown): string {
  const failure = error as { status?: unknown; timedOut?: unknown } | null;

  if (typeof failure?.status === 'number' && failure.status > 0) {
    return statusCode(area, failure.status);
  }

  if (typeof failure?.status === 'number') {
    return compose(area, failure.timedOut === true ? TIMED_OUT : NO_RESPONSE);
  }

  return compose(area, UNKNOWN);
}

/** El codigo de un fetch del navegador que ni siquiera llego a responder. */
export function offlineCode(area: ErrorArea): string {
  return compose(area, NO_RESPONSE);
}

/**
 * El codigo pegado al final de un mensaje de una linea.
 *
 * Es para los avisos de formulario, donde una segunda linea desplazaria el campo de debajo.
 * Los avisos que tienen sitio lo pintan aparte, con su propia linea: ver RetryNotice.astro.
 */
export function withCode(message: string, code: string): string {
  return `${message} · ${codeLabel(code)}`;
}

/** Como se escribe SIEMPRE, aqui y en el aviso: "Codigo SF-M202". */
export function codeLabel(code: string): string {
  return `Codigo ${code}`;
}
