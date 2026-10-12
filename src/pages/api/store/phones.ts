import type { APIRoute } from 'astro';
import { forwardBody, proxyCart } from '../../../lib/cart-proxy.ts';

export const prerender = false;

/**
 * Registra el telefono de un cliente para las promociones: el formulario del pie
 * (ver components/Footer.astro). Contrato: `api/post-store-phones.md`.
 *
 * No necesita el carrito, pero pasa por el proxy del carrito por su cabecera: la
 * API cuenta su limite —cinco registros por minuto— por `X-Cart-Token`, y sin el
 * lo contaria por IP. Desde aqui todos los compradores llegan con las IPs de
 * Vercel, asi que compartirian un solo cubo y se agotaria solo. Quien registra su
 * numero sin haber abierto el carrito estrena sesion aqui: es un gesto suyo, no
 * una visita.
 *
 * El cuerpo se reenvia sin tocar, como en el resto del proxy: quien normaliza y
 * valida el numero es la API, y su 422 llega con `errors` intactos.
 */
export const POST: APIRoute = async (context) =>
  proxyCart(context, '/api/store/phones', {
    method: 'POST',
    ...(await forwardBody(context)),
  });
