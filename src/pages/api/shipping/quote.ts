import type { APIRoute } from 'astro';
import { forwardBody, proxyCart } from '../../../lib/cart-proxy.ts';

export const prerender = false;

/**
 * Cotizacion de envio. Reenvia a la API, que es quien mide, decide la ciudad y
 * pone el precio (ver `feature/medicion-de-distancia-en-backend.md`).
 *
 * Pasa por aqui y no directo desde el navegador por lo mismo que el carrito: la
 * cotizacion pertenece a la SESION, y el token de la sesion vive en una cookie
 * httpOnly de este front que ningun script puede leer. proxyCart lo pone en
 * `X-Cart-Token` y devuelve la respuesta tal cual.
 *
 * Que la sesion la ponga el servidor es ademas lo que ata la cotizacion a quien
 * la pidio: sin eso, cualquiera podria leer la de otro comprador mandando su
 * token a mano.
 */

/**
 * Cotiza un punto. El cuerpo se reenvia sin tocar —la ubicacion y la direccion
 * escrita hasta ese momento— porque quien lo valida es la API.
 */
export const POST: APIRoute = async (context) =>
  proxyCart(context, '/api/shipping/quote', {
    method: 'POST',
    ...(await forwardBody(context)),
  });

/**
 * La ultima cotizacion de esta sesion, sin volver a medir.
 *
 * Es la red de seguridad del borrador: su cookie dura dos horas y se pierde de
 * mas maneras de las que parece —la pestana dormida que despierta tarde, un
 * navegador que limpia al cerrar, el modo privado—, mientras que la sesion del
 * carrito dura treinta dias. Cuando la tienda descubre que perdio el importe pero
 * sigue teniendo sesion, lo pide aqui en lugar de volver a pedirle la ubicacion al
 * comprador o ensenar "Por cotizar" en un pedido que ya estaba cotizado.
 */
export const GET: APIRoute = (context) => proxyCart(context, '/api/shipping/quote');
