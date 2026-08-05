import type { APIRoute } from 'astro';
import { forwardBody, proxyCart } from '../../../lib/cart-proxy.ts';

export const prerender = false;

/**
 * Anade un platillo configurado.
 *
 * El cuerpo se reenvia sin tocar: son solo identificadores y cantidades, y
 * quien los valida —y quien pone los precios— es la API. Este proxy no anade
 * ninguna comprobacion porque no aporta ninguna garantia: el endpoint de
 * arriba es publico de todas formas.
 */
export const POST: APIRoute = async (context) =>
  proxyCart(context, '/api/cart/items', {
    method: 'POST',
    ...(await forwardBody(context)),
  });
