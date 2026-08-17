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
import { hasSharedLocation, type CheckoutDraft } from './checkout-draft.ts';
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

/**
 * El envio que puede ensenar este borrador, ya recuperado si hacia falta.
 *
 * Reune las dos mitades de la misma decision, que antes escribia cada pantalla
 * por su cuenta:
 *
 *   1. Sin ubicacion compartida no hay cotizacion que ensenar —ni la del
 *      borrador ni la de la sesion—, porque el envio se cotiza contra un punto y
 *      este pedido no lleva ninguno. Ver hasSharedLocation().
 *   2. Con ubicacion y sin importe a mano, se recupera de la API: la cookie del
 *      borrador dura dos horas y la sesion del carrito treinta dias, asi que la
 *      copia se pierde mucho antes que el original.
 *
 * Al recoger tampoco se pregunta: ahi no hay envio del que hablar, y la
 * cotizacion que quede en el borrador es de una eleccion anterior.
 *
 * Devuelve una promesa sin esperarla dentro a proposito: las pantallas la
 * arrancan junto a las demas lecturas y la esperan todas juntas.
 */
export async function quoteForDraft(
  draft: CheckoutDraft,
  token: string,
): Promise<ShippingQuote | null> {
  if (draft.deliveryType === 'pickup' || !hasSharedLocation(draft)) return null;

  return draft.shipping ?? (await getShippingQuote(token));
}
