// ---------------------------------------------------------------------------
// API 4 — Lectura del pedido.
//
//   GET /api/orders/{id}
//
// Solo servidor: usa el token de la sesion. Las pantallas de cierre releen el
// pedido en cada visita en lugar de guardarlo en la cookie, porque su estado
// cambia sin que el comprador toque nada: una transferencia nace "Por confirmar"
// y sin folio, y el folio aparece cuando la tienda da el pago por bueno.
// ---------------------------------------------------------------------------

import { ApiError, unwrap } from './api.ts';
import { cartFetch } from './cart.ts';
import type { StoreOrder } from './checkout.ts';

/**
 * Pedido de esta sesion. Devuelve null si no existe o es de otra sesion: la API
 * responde 404 en los dos casos, a proposito.
 */
export async function getOrder(id: string, token: string): Promise<StoreOrder | null> {
  const path = `/api/orders/${encodeURIComponent(id)}`;

  try {
    return await unwrap<StoreOrder>(await cartFetch(path, token), path);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
