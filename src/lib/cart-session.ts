// ---------------------------------------------------------------------------
// Sesion del carrito.
//
// El navegador NO habla con Laravel: llama a /api/cart* de este mismo front y
// Astro reenvia. Tres razones, todas del propio contrato de la API:
//
//   1. La cookie sf_cart necesita SameSite=None para viajar cross-site, y eso
//      exige HTTPS. En desarrollo por HTTP cae a Lax y el carrito dejaria de
//      funcionar salvo que front y API compartan host.
//   2. Con credenciales, CORS no admite `allowed_origins: *`, asi que habria
//      que publicar y mantener la lista de origenes en el backend.
//   3. Pasando por Astro el token queda en una cookie httpOnly de nuestro
//      dominio: ningun script de la pagina puede leerlo.
//
// El token lo emite este front, no el backend. El contrato lo contempla —"el
// token puede gestionarse a mano con la cabecera X-Cart-Token (un ULID), tiene
// prioridad sobre la cookie"— y evita tener que leer y reenviar el Set-Cookie
// de Laravel, que podria venir cifrado por su middleware EncryptCookies.
// ---------------------------------------------------------------------------

import type { AstroCookies } from 'astro';
import { ulid } from './ulid.ts';

const COOKIE_NAME = 'sf_cart';
const THIRTY_DAYS = 60 * 60 * 24 * 30;

/**
 * Token de la sesion actual, emitiendolo si es la primera visita.
 *
 * httpOnly para que no lo lea ningun script; sameSite lax porque la cookie es
 * de primera parte y solo la usa este servidor; secure fuera de desarrollo.
 */
export function resolveCartToken(cookies: AstroCookies): string {
  const existing = cookies.get(COOKIE_NAME)?.value;
  if (existing) return existing;

  const token = ulid();

  cookies.set(COOKIE_NAME, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    maxAge: THIRTY_DAYS,
  });

  return token;
}

/**
 * El token que ya tiene la sesion. `null` si no hay: aqui no se emite ninguno.
 *
 * Es lo que necesita una pantalla que solo quiere ENSENAR el carrito, como la
 * portada en su barra de desktop. Con resolveCartToken cada visita abriria
 * sesion, y `GET /api/cart` crea el carrito si no existe: una tienda recien
 * publicada acumularia un carrito vacio por visitante y por rastreador para leer
 * un cero que ya se sabia. Quien no tiene cookie no tiene pedido.
 */
export function peekCartToken(cookies: AstroCookies): string | null {
  return cookies.get(COOKIE_NAME)?.value ?? null;
}
