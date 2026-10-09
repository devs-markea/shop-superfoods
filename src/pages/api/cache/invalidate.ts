import { createHash, timingSafeEqual } from 'node:crypto';
import type { APIRoute } from 'astro';
import { SHOP_CACHE_PURGE_KEY } from 'astro:env/server';
import { expireTags, isCacheTag, type CacheTag } from '../../../lib/cache.ts';

export const prerender = false;

/**
 * Vacia la cache de las lecturas (src/lib/cache.ts) a peticion del BACKEND.
 *
 * Es el otro extremo del boton "Refrescar tienda" de Configuracion de la tienda: el negocio
 * edita el panel, lo pulsa, y Laravel llama aqui. Antes eso exigia entrar a Vercel y purgar a
 * mano, y mientras nadie lo hiciera la tienda seguia un dia entero con el catalogo y la
 * configuracion de antes.
 *
 *     POST /api/cache/invalidate
 *     X-Cache-Purge-Key: <SHOP_CACHE_PURGE_KEY>
 *     { "tags": ["tienda"] }
 *
 *   204  purgado
 *   401  la clave no es la de aqui
 *   422  el cuerpo no es una lista de etiquetas conocidas
 *   502  Vercel no acepto la purga
 *   503  esta tienda no tiene SHOP_CACHE_PURGE_KEY: no se purga nada
 *
 * NO HACE FALTA UN TOKEN DE VERCEL: la funcion corre dentro de Vercel, que le pone el acceso
 * a su propia cache. Por eso la purga vive aqui y no en el backend, que para llamar a la API
 * de Vercel tendria que guardar un token capaz de leer las variables de este proyecto.
 *
 * Purga el entorno del despliegue que recibe la peticion: el backend tiene que llamar al
 * dominio de produccion, porque una URL de preview vaciaria la cache de preview.
 *
 * Solo acepta las etiquetas de `CACHE_TAGS`. Aunque alguien tuviera la clave, lo unico que
 * puede hacer con ella es vaciar la cache de esta tienda.
 */
export const POST: APIRoute = async ({ request }) => {
  if (!SHOP_CACHE_PURGE_KEY) {
    console.warn('[cache] peticion de purga rechazada: falta SHOP_CACHE_PURGE_KEY');

    return Response.json(
      { message: 'La tienda no tiene configurada la clave de purga.' },
      { status: 503 },
    );
  }

  if (!sameSecret(request.headers.get('X-Cache-Purge-Key') ?? '', SHOP_CACHE_PURGE_KEY)) {
    console.warn('[cache] peticion de purga rechazada: clave incorrecta');

    return Response.json({ message: 'No autorizado.' }, { status: 401 });
  }

  const tags = readTags(await request.json().catch(() => null));

  if (!tags) {
    return Response.json(
      { message: 'Se esperaba { "tags": [...] } con etiquetas de la tienda.' },
      { status: 422 },
    );
  }

  try {
    await expireTags(tags);
  } catch (error) {
    console.error('[cache] Vercel no acepto la purga', tags, error);

    return Response.json({ message: 'Vercel no acepto la purga.' }, { status: 502 });
  }

  return new Response(null, { status: 204 });
};

/**
 * Las etiquetas del cuerpo, sin repetir, o `null` si el cuerpo no sirve.
 *
 * Una etiqueta desconocida invalida la peticion entera en vez de ignorarse: si el backend pide
 * algo que aqui no existe, es que los dos lados dejaron de hablar de lo mismo, y un 204 lo
 * taparia.
 */
function readTags(body: unknown): CacheTag[] | null {
  const tags = (body as { tags?: unknown } | null)?.tags;

  if (!Array.isArray(tags) || tags.length === 0 || !tags.every(isCacheTag)) return null;

  return [...new Set(tags)];
}

/**
 * Compara la clave sin delatar por el tiempo cuantos caracteres acerto.
 *
 * `===` se detiene en el primer caracter distinto, y esa diferencia de tiempo es lo que deja
 * adivinar un secreto byte a byte. `timingSafeEqual` exige dos entradas del mismo largo, asi
 * que se comparan sus huellas: miden siempre 32 bytes.
 */
function sameSecret(provided: string, expected: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();

  return provided !== '' && timingSafeEqual(digest(provided), digest(expected));
}
