// ---------------------------------------------------------------------------
// Cliente HTTP de la API de la tienda.
//
// Toda respuesta llega en camelCase y envuelta por el estandar de Laravel
// Resources: { "data": ... }. El sobre se abre aqui una sola vez para que las
// vistas trabajen con el dato y no con el envoltorio.
//
// Solo servidor: API_URL viene de astro:env/server, asi que este modulo no
// puede importarse desde un <script> de cliente.
// ---------------------------------------------------------------------------

import { API_URL, SHOP_API_KEY } from 'astro:env/server';
// throttle.ts es isomorfico (no importa `astro:env`), asi que se puede usar desde aqui
// igual que desde un <script> de la pagina.
import { retryAfterSeconds } from './throttle.ts';

/** Cuerpo de error de Laravel: 422 de validacion y 404 traen esta forma. */
export interface ApiErrorBody {
  message?: string;
  errors?: Record<string, string[]>;
}

/** Fallo al hablar con la API. `status` es 0 cuando ni siquiera respondio. */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  /** Cuerpo de la respuesta cuando venia en JSON. Lleva `errors` en los 422. */
  readonly body?: ApiErrorBody;
  /**
   * Segundos que pide esperar la API, del `Retry-After` de un 429. `null` en todo
   * lo demas.
   *
   * Se guarda AQUI y no se lee de la Response porque quien atiende el fallo suele
   * estar lejos de ella: `apiGet` abre el sobre y descarta la respuesta, asi que
   * para cuando la pantalla atrapa el error ya no hay cabeceras que consultar. Es
   * el unico dato del 429 que se aprovecha —un numero, no un texto— y es lo que
   * permite decir cuanto falta en vez de invitar a reintentar a ciegas.
   */
  readonly retryAfter: number | null;
  /**
   * Si la API acepto la conexion y se callo hasta agotar el plazo, en lugar de no llegar a
   * contestar. Las dos llegan con `status: 0` y son averias distintas —una es del backend,
   * la otra de la red—, asi que el codigo que ve el comprador tambien las separa: `TMO`
   * contra `NET`. Ver src/lib/error-codes.ts.
   */
  readonly timedOut: boolean;

  constructor(
    message: string,
    status: number,
    path: string,
    options: {
      cause?: unknown;
      body?: ApiErrorBody;
      retryAfter?: number | null;
      timedOut?: boolean;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.body = options.body;
    this.retryAfter = options.retryAfter ?? null;
    this.timedOut = options.timedOut ?? false;
  }
}

/**
 * Une base y ruta. Concatena en lugar de usar `new URL(path, base)` porque esa
 * forma se come el subpath de la base: con API_URL = `https://host/tienda`,
 * `new URL('/api/products', API_URL)` da `https://host/api/products`.
 */
export function endpoint(path: string): string {
  return `${API_URL.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

/**
 * Host de la API, sin barra final. Lo necesita el carrito para resolver las
 * imagenes de las lineas que repinta en el navegador, donde API_URL no existe.
 */
export function assetBase(): string {
  return API_URL.replace(/\/+$/, '');
}

/**
 * Resuelve una URL de imagen contra el host de la API.
 *
 * `image.url` llega absoluta; una que empiece por `/` es una ruta del Laravel, no
 * de este front, asi que servirla tal cual daria un 404.
 *
 * Lo que ya no llega aqui es el relleno de los platillos sin foto: cuenta como
 * "sin foto" y no se pinta ninguna caja (ver src/lib/product-image.ts). Y ojo con
 * el subpath: endpoint() lo conserva —bien para `/api/...`— asi que una ruta de
 * asset solo resuelve mientras API_URL sea el host a secas.
 */
export function assetUrl(url: string): string {
  return url.startsWith('/') ? endpoint(url) : url;
}

/**
 * Cabecera que identifica a ESTA aplicacion ante el backend, no al comprador.
 *
 * El backend la exige en todo `/api/*` de tienda (`EnsureShopClient`). Quien es el comprador
 * lo sigue diciendo `X-Cart-Token`: las dos viajan juntas y responden a preguntas distintas
 * —que aplicacion habla, y de quien es el carrito—.
 *
 * Sin clave configurada no se manda nada, que es lo que permite desplegar por partes: mientras
 * el backend tampoco la tenga puesta, no exige ninguna. Ver .env.example.
 */
function clientHeaders(): Record<string, string> {
  return SHOP_API_KEY ? { 'X-Shop-Key': SHOP_API_KEY } : {};
}

// ---------------------------------------------------------------------------
// Plazo y reintento
//
// POR QUE EXISTE ESTO. El backend vive en un hosting compartido (nginx con cache de
// proxy por delante, Apache con mod_php detras) y la PRIMERA rafaga despues de un rato
// ocioso le cuesta unas cuatro veces mas que la siguiente: medido contra staging, nueve
// llamadas en paralelo tras cinco minutos de ocio tardaron entre 548 y 831 ms, y esas
// mismas nueve un segundo despues, entre 128 y 208. Ese arranque en frio es el momento en
// que el proxy puede quedarse sin procesos y contestar el 502/503 que la tienda pinta
// como "no pudimos cargar el menu". Quien reintenta llega cuando los procesos YA estan
// levantados, asi que el segundo intento es el barato.
//
// NO SE REINTENTA LO QUE CAMBIA ESTADO, y esta es la linea que no se puede cruzar. Por
// aqui pasa tambien el proxy del carrito (ver cartFetch en src/lib/cart.ts), que reenvia
// POST, PATCH y DELETE: repetir un POST /api/cart/items mete la linea dos veces, y el
// unico que tiene defensa propia contra el doble envio es el checkout, con su
// `Idempotency-Key` (ver placeOrder en src/lib/checkout.ts). De modo que el reintento se
// limita a GET y HEAD, que son los que se pueden repetir sin consecuencias — y son
// justamente los del diagnostico: catalogo, ficha, configuracion y horario.
//
// Y EL PLAZO, TAMPOCO. La primera version de este reintento —que no llego a desplegarse— lo
// ponia a todos los metodos, y era un error que podia duplicar pedidos: ver sendOnce, abajo. El plazo existe para las lecturas que arman
// una pagina en el servidor, donde un socket callado colgaria la funcion de Astro hasta su
// duracion maxima y el comprador acabaria en la pagina de error de Vercel. Con el, ese
// cuelgue sale por el camino que ya estaba escrito: ApiError con status 0.
// ---------------------------------------------------------------------------

/**
 * Lo que se le concede a UNA tentativa.
 *
 * Seis segundos y no dos: la respuesta lenta legitima existe —el arranque en frio medido
 * ronda los 850 ms y bajo carga ajena sube— y cortarla convertiria un exito tardio en un
 * fallo. Esto no esta para acelerar nada, sino para que un silencio termine.
 */
const ATTEMPT_TIMEOUT_MS = 6_000;

/**
 * Techo de TODAS las tentativas de una misma peticion, esperas incluidas.
 *
 * Existe porque tres tentativas de seis segundos son diecinueve, y la funcion de Vercel se
 * muere antes: pasado el presupuesto no se abre otra tentativa, se devuelve lo que haya.
 * Si algun dia se configura `maxDuration` en el adaptador, este numero tiene que quedar
 * por debajo con holgura — una pagina hace varias de estas llamadas.
 */
const TOTAL_BUDGET_MS = 8_000;

/** Tentativas de una lectura, la primera incluida. */
const MAX_ATTEMPTS = 3;

/**
 * Lo minimo que tiene que quedar de presupuesto para que merezca la pena abrir otra
 * tentativa, espera aparte.
 *
 * Un segundo porque es lo que tarda el backend en frio (medido: hasta ~850 ms). Sin este
 * margen, una tentativa podia abrirse con 40 ms de presupuesto: moria al instante y el log
 * decia "no respondio en 40 ms" —una lentitud que no hubo—, y si la anterior habia sido un
 * 502, ese 502 se descartaba y se perdia.
 */
const MIN_ATTEMPT_MS = 1_000;

/**
 * Lo que se espera ANTES de cada reintento, en milisegundos.
 *
 * Creciente y corto: si el fallo fue el arranque en frio, un cuarto de segundo suele
 * bastar para que el proceso ya este en pie; y si no basto, el siguiente da algo mas de
 * aire sin gastar el presupuesto de arriba. Tiene un elemento menos que MAX_ATTEMPTS
 * porque la primera tentativa no espera.
 */
const BACKOFF_MS = [250, 750];

/**
 * Si merece la pena repetir una respuesta que llego.
 *
 * Solo el 5xx, que es el fallo del servidor o del proxy que tiene delante — y el 508
 * ("Resource Limit Is Reached") de estos hostings cae ahi dentro.
 *
 * EL 429 QUEDA FUERA A PROPOSITO, aunque sea tentador: es un techo por minuto, y repetir
 * contra el lo unico que hace es gastar otra ficha del mismo cubo y retrasar el momento en
 * que se libera. Ese caso ya tiene su camino escrito —`Retry-After` y busyMessage en
 * src/lib/throttle.ts—, que dice cuanto falta en vez de insistir.
 */
function worthRetrying(status: number): boolean {
  return status >= 500;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Peticion cruda. No interpreta el resultado: quien llama decide si desenvuelve
 * el sobre o reenvia la respuesta tal cual.
 *
 * Solo las lecturas llevan plazo y reintento. El contrato NO cambia en ningun caso: un 5xx
 * se devuelve como Response, para que el proxy del carrito pueda seguir reenviando estado y
 * cuerpo sin interpretarlos.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();

  return method === 'GET' || method === 'HEAD' ? readWithRetry(path, init) : sendOnce(path, init);
}

/**
 * Lo que cambia estado (POST, PATCH, DELETE): una sola peticion, SIN plazo y SIN reintento.
 *
 * ES EL CODIGO DE ANTES DEL REINTENTO, SIN TOCAR, Y TIENE QUE SEGUIR SIENDOLO. Por aqui
 * pasan el checkout y el cobro de Mercado Pago (via proxyCart), y en ellos cortar por
 * tiempo es peor que esperar. Asi habria duplicado pedidos el plazo de la primera version, que
 * no llego a desplegarse:
 *
 *   0 s  POST /api/checkout con la clave K: el backend toma el candado y empieza
 *   6 s  el plazo corta y el proxy responde 502         (el backend SIGUE creando)
 *   7 s  el comprador vuelve a pulsar con K: candado tomado y sin valor, 409
 *        checkout-draft.ts retira el borrador ante cualquier 409: la clave se pierde
 *   8 s  el primer pedido termina y EXISTE, sin que el comprador viera el acuse; si vuelve
 *        a llenar el formulario, la clave nueva abre UN SEGUNDO PEDIDO
 *
 * Sin plazo, el proxy espera lo que tarde el backend —Mercado Pago lento incluido— y
 * devuelve el 201. Si alguna vez tarda mas que la vida de la funcion en Vercel, el script
 * que lanzo el POST pinta su propio error: aqui no hay pagina del servidor que proteger.
 */
async function sendOnce(path: string, init: RequestInit): Promise<Response> {
  const url = endpoint(path);

  try {
    return await fetch(url, {
      ...init,
      // clientHeaders() va AL FINAL: la clave de la aplicacion no es negociable por
      // quien llama, y asi ningun `init.headers` puede pisarla por descuido.
      headers: { Accept: 'application/json', ...init.headers, ...clientHeaders() },
    });
  } catch (cause) {
    // fetch solo rechaza por red, DNS o TLS: la API no llego a contestar.
    throw new ApiError(`Sin respuesta de la API en ${url}.`, 0, path, { cause });
  }
}

/** Lecturas (GET, HEAD): plazo por tentativa, hasta MAX_ATTEMPTS y un presupuesto total. */
async function readWithRetry(path: string, init: RequestInit): Promise<Response> {
  const url = endpoint(path);
  const attempts = MAX_ATTEMPTS;

  const deadline = Date.now() + TOTAL_BUDGET_MS;

  // La ultima causa de red, para que el ApiError del final explique el fallo de la
  // tentativa que de verdad se rindio y no el de la primera.
  let lastCause: unknown;
  let lastTimedOut = false;
  // El plazo que se le concedio a la tentativa que fallo. No siempre es
  // ATTEMPT_TIMEOUT_MS: a la ultima se le recorta a lo que quede de presupuesto, y decir
  // "no respondio en 6000 ms" de una que solo espero 1750 mandaria a buscar una lentitud
  // que no hubo.
  let lastBudget = ATTEMPT_TIMEOUT_MS;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) {
      const pause = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS.at(-1) ?? 0;

      // Sin presupuesto para la espera MAS una tentativa que valga algo, no se abre otra:
      // gastarlo en un intento que va a morir a medias no le sirve a nadie.
      if (deadline - Date.now() <= pause + MIN_ATTEMPT_MS) break;

      await wait(pause);
    }

    const remaining = deadline - Date.now();
    const budget = Math.min(ATTEMPT_TIMEOUT_MS, Math.max(remaining, 0));

    if (budget <= 0) break;

    // Dos relojes distintos: el plazo de ESTA tentativa y la cancelacion que pudiera traer
    // quien llama. Se combinan para que cualquiera de los dos corte el fetch, y luego se
    // consulta `timeout.aborted` para saber cual fue — que es lo que distingue "no
    // contesto a tiempo" de "me pidieron parar".
    const timeout = AbortSignal.timeout(budget);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

    try {
      const response = await fetch(url, {
        ...init,
        signal,
        // clientHeaders() va AL FINAL: la clave de la aplicacion no es negociable por
        // quien llama, y asi ningun `init.headers` puede pisarla por descuido.
        headers: { Accept: 'application/json', ...init.headers, ...clientHeaders() },
      });

      // Se comprueba que la tentativa siguiente vaya a existir DE VERDAD —quedan turnos y
      // queda presupuesto para la espera— antes de descartar esta respuesta. Si no se
      // comprobara aqui, un 5xx lento podria descartarse para nada: el presupuesto se
      // agotaria en la espera, no habria segunda tentativa, y el fallo saldria por el
      // ApiError de abajo diciendo "sin respuesta" cuando la hubo y era un 502.
      // El margen es el MISMO que el de la comprobacion de arriba: si fueran distintos, esta
      // podria dar por hecha una tentativa que aquella despues no abre.
      const pause = BACKOFF_MS[attempt] ?? BACKOFF_MS.at(-1) ?? 0;
      const willRetry = attempt < attempts - 1 && deadline - Date.now() > pause + MIN_ATTEMPT_MS;

      if (willRetry && worthRetrying(response.status)) {
        // El cuerpo que se descarta hay que cerrarlo: en undici una respuesta sin consumir
        // retiene el socket del pool, y la tentativa siguiente saldria por uno nuevo
        // mientras aquel se queda colgado hasta que expire.
        await response.body?.cancel().catch(() => {});
        continue;
      }

      return response;
    } catch (cause) {
      // Una cancelacion de quien llama no es un fallo de la API: ni se reintenta ni se
      // disfraza de ApiError.
      if (init.signal?.aborted) throw cause;

      lastCause = cause;
      lastTimedOut = timeout.aborted;
      lastBudget = budget;
    }
  }

  // fetch solo rechaza por red, DNS o TLS: la API no llego a contestar. Y desde que hay
  // plazo, tambien por haberse quedado callada — se dice cual de las dos, porque en el log
  // de la funcion son dos averias distintas.
  throw new ApiError(
    lastTimedOut
      ? `La API no respondio en ${lastBudget} ms en ${url}.`
      : `Sin respuesta de la API en ${url}.`,
    0,
    path,
    { cause: lastCause, timedOut: lastTimedOut },
  );
}

/** Abre el sobre { data } o lanza ApiError con el cuerpo del fallo. */
export async function unwrap<T>(response: Response, path: string): Promise<T> {
  if (!response.ok) {
    // El cuerpo puede no ser JSON (un 500 con la pagina de error de Laravel):
    // en ese caso el ApiError va sin body, no revienta aqui.
    const body = await response.json().catch(() => undefined);
    throw new ApiError(`La API respondio ${response.status} en ${path}.`, response.status, path, {
      body,
      retryAfter: retryAfterSeconds(response),
    });
  }

  // UNA RESPUESTA "BUENA" QUE NO TRAE JSON TAMBIEN ES UN FALLO, y hay que decirlo con su
  // status. El 2026-09-17 el antibots del hosting contestaba al servidor de la tienda con un
  // `202` y una pagina HTML que redirige a su captcha: `response.ok` valia true, `json()`
  // reventaba con un SyntaxError que no era ApiError, y el log de Vercel hablaba de un token
  // `<` inesperado en lugar del 202 que lo explicaba todo. Desde que hay cache, ademas, esto
  // es lo que impide guardar una averia como si fuera el catalogo (ver src/lib/cache.ts).
  const body = await response
    .json()
    .then((parsed) => parsed as { data: T })
    .catch(() => null);

  if (!body) {
    throw new ApiError(
      `La API respondio ${response.status} sin JSON en ${path}.`,
      response.status,
      path,
    );
  }

  return body.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  return unwrap<T>(await apiFetch(path), path);
}
