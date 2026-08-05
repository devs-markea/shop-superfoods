import type { APIRoute } from 'astro';
import { proxyCart } from '../../lib/cart-proxy.ts';

export const prerender = false;

/** Carrito de la sesion. La API lo crea vacio en la primera visita. */
export const GET: APIRoute = (context) => proxyCart(context, '/api/cart');

/** Vacia el carrito. */
export const DELETE: APIRoute = (context) =>
  proxyCart(context, '/api/cart', { method: 'DELETE' });
