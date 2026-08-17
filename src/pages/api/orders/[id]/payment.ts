import type { APIRoute } from 'astro';
import { proxyCart } from '../../../../lib/cart-proxy.ts';

export const prerender = false;

/**
 * Abre un cobro nuevo sobre un pedido que sigue esperando pago (Mercado Pago).
 *
 * Reusa el proxy del carrito porque la sesion es la misma: el token sale de
 * nuestra cookie httpOnly y no de una cabecera del cliente. Aqui eso es lo que
 * acota el pedido —la API responde 404 si es de otra sesion—, asi que un id
 * ajeno no abre el cobro de nadie.
 *
 * Sin cuerpo: el pedido ya lo tiene todo. Lo unico que viaja es el id en la ruta
 * y, cuando el acuse la calculo, la huella de dispositivo de Mercado Pago
 * (`X-Meli-Session-Id`). Se nombra a mano por lo mismo que en /api/checkout: el
 * proxy decide que sube, en lugar de reenviar a ciegas lo que mande el navegador.
 *
 * Aqui la huella importa mas que en el checkout: este endpoint solo se usa cuando
 * un cobro anterior no salio, asi que es justo el intento que hay que ayudar a
 * aprobar.
 *
 * La respuesta se devuelve tal cual para que sus `errors` lleguen intactos: sus
 * mensajes de negocio vienen en espanol —"Este pedido ya no admite un pago
 * nuevo."— y son los que muestra la interfaz.
 */
export const POST: APIRoute = (context) => {
  const deviceSessionId = context.request.headers.get('X-Meli-Session-Id');

  return proxyCart(context, `/api/orders/${encodeURIComponent(context.params.id ?? '')}/payment`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(deviceSessionId ? { 'X-Meli-Session-Id': deviceSessionId } : {}),
    },
  });
};
