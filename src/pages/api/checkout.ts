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
 */
export const POST: APIRoute = async (context) =>
  proxyCart(context, '/api/checkout', {
    method: 'POST',
    ...(await forwardBody(context)),
  });
