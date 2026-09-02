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

  constructor(
    message: string,
    status: number,
    path: string,
    options: { cause?: unknown; body?: ApiErrorBody; retryAfter?: number | null } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.body = options.body;
    this.retryAfter = options.retryAfter ?? null;
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

/**
 * Peticion cruda. No interpreta el resultado: quien llama decide si desenvuelve
 * el sobre o reenvia la respuesta tal cual.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
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

  const body = (await response.json()) as { data: T };
  return body.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  return unwrap<T>(await apiFetch(path), path);
}
