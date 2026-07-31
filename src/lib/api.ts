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

import { API_URL } from 'astro:env/server';

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

  constructor(
    message: string,
    status: number,
    path: string,
    options: { cause?: unknown; body?: ApiErrorBody } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
    this.body = options.body;
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
 * Resuelve una URL de imagen contra el host de la API.
 *
 * `image.url` es absoluta salvo el placeholder de los platillos sin foto, que
 * puede llegar como ruta (`/images/placeholder-dish.svg`). Esa ruta existe en
 * el Laravel, no en este front, asi que servirla tal cual daria un 404.
 */
export function assetUrl(url: string): string {
  return url.startsWith('/') ? endpoint(url) : url;
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
      headers: { Accept: 'application/json', ...init.headers },
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
    });
  }

  const body = (await response.json()) as { data: T };
  return body.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  return unwrap<T>(await apiFetch(path), path);
}
