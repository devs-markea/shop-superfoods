// ---------------------------------------------------------------------------
// El 429 de la API, escrito para el comprador.
//
// La API limita cuantas peticiones acepta de cada sesion de carrito: sesenta por minuto en el
// carrito, seis en el cierre y el cobro. Son techos que un comprador normal no roza —cada
// llamada nace de un gesto suyo— pero que un boton que se dispara solo, una pestana olvidada
// reintentando o alguien probando cosas si alcanzan.
//
// ESTE MODULO ES ISOMORFICO: no importa nada de `astro:env`, asi que vale igual en el servidor
// y dentro de un <script> de la pagina. Es donde tiene que estar, porque el 429 puede aparecer
// en las cuatro pantallas que hablan con la API.
//
// POR QUE NO SE REENVIA EL `message` DE LA API TAL CUAL: es la regla de esta tienda desde antes
// (ver readError en checkout.ts y showApiErrors en order-form.ts). Un `message` puede venir en
// ingles o con el detalle de una excepcion si el fallo fue de forma, asi que solo se muestran
// los textos que esta tienda controla. Lo que si se aprovecha de la respuesta es `Retry-After`,
// que es un numero y no un texto: con el se puede decir cuanto falta en lugar de invitar a
// reintentar a ciegas.
// ---------------------------------------------------------------------------

/** Lo que se dice cuando no sabemos cuanto hay que esperar. */
const GENERIC = 'Estas yendo muy rapido. Espera un momento y vuelve a intentarlo.';

/**
 * Segundos que faltan segun la respuesta, o `null` si no lo dice.
 *
 * `Retry-After` puede venir tambien como fecha HTTP por especificacion, pero Laravel siempre
 * manda segundos: por eso solo se interpreta esa forma, y cualquier otra cae en `null` y se
 * responde el texto generico, que sigue siendo cierto.
 */
export function retryAfterSeconds(response: Response): number | null {
  const raw = response.headers.get('Retry-After');
  if (!raw) return null;

  const seconds = Number.parseInt(raw, 10);

  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

/** "un momento" / "15 segundos" / "2 minutos": la espera, dicha como se dice. */
function humanize(seconds: number): string {
  if (seconds < 10) return 'un momento';
  if (seconds < 60) return `${seconds} segundos`;

  const minutes = Math.ceil(seconds / 60);

  return minutes === 1 ? 'un minuto' : `${minutes} minutos`;
}

/** Si la API rechazo la peticion por ritmo. */
export function isThrottled(response: Response): boolean {
  return response.status === 429;
}

/**
 * El aviso que se le ensena al comprador ante un 429.
 *
 * Devuelve `null` cuando la respuesta no es un 429, para poder encadenarlo con el manejo de
 * errores que ya tiene cada pantalla sin envolverlo en un `if`.
 */
export function throttleMessage(response: Response): string | null {
  if (!isThrottled(response)) return null;

  const seconds = retryAfterSeconds(response);

  return seconds === null
    ? GENERIC
    : `Estas yendo muy rapido. Espera ${humanize(seconds)} y vuelve a intentarlo.`;
}

/**
 * El 429 de las pantallas de LECTURA (catalogo, ficha, configuracion de la tienda).
 *
 * Es otro mensaje y no el de arriba porque la culpa no es del comprador. El limite del
 * carrito y el del cierre se cuentan por SESION, asi que quien los agota es siempre quien
 * los esta viendo: "estas yendo muy rapido" describe lo que paso. El de lectura se cuenta
 * por IP, y con este front —un BFF: el navegador habla con Astro y es el servidor de Astro
 * quien llama al backend— todos los compradores llegan desde las mismas direcciones. O sea
 * que ahi el cubo es COMUN: a quien le toca el 429 puede ser alguien en su primer clic,
 * pagando la racha de otro. Decirle que va muy rapido seria mentirle.
 *
 * Tampoco es "no pudimos cargar el menu": eso suena a averia y la tienda esta perfectamente:
 * hay un techo por minuto y se libera solo. El texto dice las dos cosas que el comprador
 * necesita —que no se rompio nada y cuanto falta— y por eso NO invita a recargar a ciegas.
 */
export function busyMessage(seconds: number | null): string {
  const espera = seconds === null ? 'un momento' : humanize(seconds);

  return `La tienda esta recibiendo muchas visitas. El menu vuelve en ${espera}.`;
}
