import type { APIRoute } from 'astro';
import { forwardBody, proxyCart } from '../../../../lib/cart-proxy.ts';

export const prerender = false;

const linePath = (item: string | undefined) =>
  `/api/cart/items/${encodeURIComponent(item ?? '')}`;

/** Cambia la cantidad de una linea. Con 0 la elimina. */
export const PATCH: APIRoute = async (context) =>
  proxyCart(context, linePath(context.params.item), {
    method: 'PATCH',
    ...(await forwardBody(context)),
  });

/**
 * Quita una linea. Una linea de otra sesion responde 404, no 403: la API no
 * confirma que exista.
 */
export const DELETE: APIRoute = (context) =>
  proxyCart(context, linePath(context.params.item), { method: 'DELETE' });
