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
 * De las cabeceras del navegador suben DOS, y las dos se nombran a mano a
 * proposito: el proxy decide que llega arriba, porque si reenviara todo lo que
 * mande el cliente podria colarse un `X-Cart-Token` ajeno y leerse el carrito de
 * otra persona.
 *
 *   Idempotency-Key    sin ella la idempotencia no existiria: la API no veria la
 *                      clave y cada reintento crearia un pedido nuevo
 *   X-Meli-Session-Id  la huella de dispositivo de Mercado Pago, que mejora la
 *                      aprobacion del cobro. La calcula `security.js` en /pago y
 *                      Laravel la reenvia a la pasarela como `X-meli-session-id`
 *
 * Ninguna de las dos es de fiar por venir del navegador, y ninguna hace falta que
 * lo sea: la primera solo agrupa reintentos de esta misma sesion y la segunda es
 * una senal para el motor de riesgo de Mercado Pago. Lo que decide QUE carrito se
 * convierte en pedido sigue siendo la cookie, y esa no la toca el cliente.
 */
export const POST: APIRoute = async (context) => {
  const idempotencyKey = context.request.headers.get('Idempotency-Key');
  const deviceSessionId = context.request.headers.get('X-Meli-Session-Id');

  return proxyCart(context, '/api/checkout', {
    method: 'POST',
    ...(await forwardBody(context)),
    headers: {
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...(deviceSessionId ? { 'X-Meli-Session-Id': deviceSessionId } : {}),
    },
  });
};
