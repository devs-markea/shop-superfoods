import type { APIRoute } from 'astro';
import { forwardBody, proxyCart } from '../../lib/cart-proxy.ts';

export const prerender = false;

/**
 * Cierra el pedido (API 4).
 *
 * Reusa el proxy del carrito porque la sesion es la misma: el token sale de
 * nuestra cookie httpOnly y no de una cabecera del cliente. Eso es tambien lo
 * que decide QUE carrito se convierte en pedido, asi que las lineas no pueden
 * falsearse desde el navegador.
 *
 * El cuerpo se reenvia sin tocar —entrega, cliente, propina y metodo— para que
 * el 422 de validacion llegue con sus `errors` intactos: sus mensajes de negocio
 * vienen en espanol y son los que muestra la interfaz.
 *
 * De las cabeceras del navegador solo sube `Idempotency-Key`, y se nombra a mano
 * a proposito: el proxy decide que llega arriba, porque si reenviara todo lo que
 * mande el cliente podria colarse un `X-Cart-Token` ajeno y leerse el carrito de
 * otra persona. Sin reenviarla, la idempotencia no existiria: la API no veria la
 * clave y cada reintento crearia un pedido nuevo.
 */
export const POST: APIRoute = async (context) => {
  const idempotencyKey = context.request.headers.get('Idempotency-Key');

  return proxyCart(context, '/api/checkout', {
    method: 'POST',
    ...(await forwardBody(context)),
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
  });
};
