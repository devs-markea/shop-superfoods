// ---------------------------------------------------------------------------
// Reenvio de las operaciones de carrito a la API.
//
// Devuelve la respuesta de arriba TAL CUAL —mismo estado, mismo cuerpo— para
// que un 422 de validacion llegue al navegador con sus `errors` intactos y sea
// la interfaz quien decida como mostrarlos.
// ---------------------------------------------------------------------------

import type { APIContext } from 'astro';
import { cartFetch } from './cart.ts';
import { resolveCartToken } from './cart-session.ts';

export async function proxyCart(
  context: APIContext,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  // El token sale SIEMPRE de nuestra cookie httpOnly, nunca de una cabecera
  // del cliente: si se reenviara lo que manda el navegador, cualquiera podria
  // leer el carrito de otra persona poniendo su token a mano.
  const token = resolveCartToken(context.cookies);

  let upstream: Response;

  try {
    upstream = await cartFetch(path, token, init);
  } catch (error) {
    console.error('[carrito] no se pudo contactar con la API', path, error);
    return Response.json({ message: 'No pudimos contactar con la tienda.' }, { status: 502 });
  }

  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
      // El carrito es de esta sesion: que no lo cachee nadie por el camino.
      'Cache-Control': 'no-store',
    },
  });
}

/** Cuerpo de la peticion, listo para reenviar sin interpretarlo. */
export async function forwardBody(context: APIContext): Promise<RequestInit> {
  return {
    headers: { 'Content-Type': 'application/json' },
    body: await context.request.text(),
  };
}
