// ---------------------------------------------------------------------------
// La cotizacion de envio, leida desde el servidor.
//
//   GET /api/shipping/quote   la ultima de esta sesion, sin volver a medir
//
// Solo servidor: usa cartFetch, que lleva el token de la sesion. El navegador
// pide la suya por el proxy de /api/shipping/quote.
//
// Existe para una situacion concreta: la tienda guarda una copia de la
// cotizacion en la cookie del borrador —que dura dos horas y el navegador puede
// vaciar— mientras que la sesion del carrito dura treinta dias. Cuando la copia
// se pierde pero la sesion sigue, la pantalla la recupera de la API y la vuelve a
// pintar en el primer render, sin pedirle nada al comprador.
// ---------------------------------------------------------------------------

import { cartFetch } from './cart.ts';
import { quoteFromResponse, type ShippingQuote, type ShippingQuoteResponse } from './shipping.ts';

/**
 * La ultima cotizacion de la sesion, o `null`.
 *
 * Nunca lanza y nunca hace ruido: mientras la API no publique el endpoint
 * responde 404, que aqui es exactamente lo mismo que "esta sesion no ha cotizado
 * nada". En los dos casos la tienda pinta "Por cotizar", que es un estado que ya
 * sabe pintar.
 */
export async function getShippingQuote(token: string): Promise<ShippingQuote | null> {
  try {
    const response = await cartFetch('/api/shipping/quote', token);

    if (!response.ok) return null;

    const body = (await response.json()) as { data?: ShippingQuoteResponse | null };

    return quoteFromResponse(body.data);
  } catch (error) {
    console.error('[envio] fallo GET /api/shipping/quote', error);
    return null;
  }
}
