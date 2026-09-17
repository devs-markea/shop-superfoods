// ---------------------------------------------------------------------------
// Cache de las tres lecturas que arman cualquier pantalla: catalogo, horario y
// configuracion de la tienda.
//
// POR QUE EXISTE. Las nueve pantallas piden las tres en cada visita —el catalogo, ocho
// de ellas solo para rotular las categorias del pie— y el backend vive en un hosting
// compartido donde cada peticion arranca un proceso de PHP. Guardarlas quita casi todas
// esas lecturas y, de paso, aplasta las rafagas: cien compradores entrando a la vez no
// piden el catalogo cien veces.
//
// DONDE VIVE: en la Runtime Cache de Vercel, que es regional y se comparte entre las
// instancias de la funcion. Se eligio sobre una memoria por instancia por una razon
// concreta: SE PUEDE PURGAR desde el panel de Vercel (CDN -> Caches -> Purge cache) o con
// `vercel cache invalidate --tag`, que es como el negocio refresca la tienda despues de
// editar el panel. Una memoria de proceso solo se vacia al desplegar.
//
// Fuera de Vercel —`npm run dev`— getCache() cae a una cache en memoria del proceso, asi
// que esto funciona igual en local, sin compartirse entre arranques.
//
// LO QUE NUNCA SE GUARDA: un fallo. Ni un 5xx, ni un 429, ni un plazo agotado, ni una
// respuesta que no traiga JSON —el 2026-09-17 el antibots del hosting contestaba un `202`
// con el HTML de su captcha, y guardar eso habria congelado la averia—. Eso lo garantiza
// `unwrap` en src/lib/api.ts, que convierte esas respuestas en ApiError: aqui solo se
// guarda lo que `load` devuelve sin lanzar.
// ---------------------------------------------------------------------------

import { getCache } from '@vercel/functions';

/**
 * Version de la FORMA de lo guardado, no de su contenido.
 *
 * La Runtime Cache sobrevive a los despliegues, asi que un cambio de contrato —un campo
 * que se va, uno que cambia de tipo— seguiria leyendose con la forma vieja durante toda su
 * ventana. Subir esta letra estrena claves y deja morir las de antes.
 */
const VERSION = 'v1';

/**
 * Las etiquetas con las que se purga. Son lo que se teclea en el panel de Vercel, asi que
 * se escriben para leerse ahi, y `tienda` purga las tres de una vez.
 */
export const CACHE_TAGS = {
  all: 'tienda',
  catalog: 'tienda-catalogo',
  schedule: 'tienda-horario',
  config: 'tienda-config',
} as const;

/** Lo minimo que vale la pena guardar algo: por debajo, cada visita volveria a pedirlo. */
const MIN_FRESH_MS = 30_000;

interface Entry<T> {
  value: T;
  /** Cuando se leyo de la API. Solo para el log: es lo que dice cuanto lleva ahi. */
  fetchedAt: number;
  /** Hasta cuando se sirve sin preguntar. */
  freshUntil: number;
  /** Hasta cuando se sirve SI LA API FALLA. Despues, el fallo se propaga. */
  staleUntil: number;
}

export interface CachedRead<T> {
  /** Nombre corto, para la clave y para el log: `catalogo`, `horario`, `configuracion`. */
  key: string;
  tag: string;
  /** La lectura de verdad. Si lanza, no se guarda nada. */
  load: () => Promise<T>;
  /**
   * Hasta cuando vale lo leido, en epoch ms. Es una funcion y no una duracion porque el
   * catalogo no caduca por tiempo sino en el proximo cambio de horario de la tienda.
   */
  freshUntil: (value: T, fetchedAt: number) => number | Promise<number>;
  /** Cuanto se sigue sirviendo despues de caducar, pero solo si la API falla. */
  staleFor?: number;
  /** Salta la copia guardada y va a la API. La respuesta si se guarda. */
  fresh?: boolean;
}

/**
 * Las lecturas en curso de esta instancia.
 *
 * Sin esto, las cuatro llamadas que lanza una pantalla a la vez —y las de todas las visitas
 * que atienda la misma instancia— encontrarian la entrada vacia a la vez y saldrian todas a
 * la API. La Runtime Cache no dedupe por su cuenta: es justo la rafaga que se quiere evitar.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function cached<T>(read: CachedRead<T>): Promise<T> {
  // La lectura fresca no comparte turno con la normal: quien la pide es una pantalla de
  // pago, que no puede recibir una copia guardada por haber llegado tarde a la fila.
  const lane = `${VERSION}:${read.key}${read.fresh ? '!fresh' : ''}`;
  const running = inFlight.get(lane) as Promise<T> | undefined;

  if (running) return running;

  const pending = resolve(read).finally(() => inFlight.delete(lane));

  inFlight.set(lane, pending);

  return pending;
}

async function resolve<T>(read: CachedRead<T>): Promise<T> {
  const key = `${VERSION}:${read.key}`;
  const entry = read.fresh ? null : await readEntry<T>(key);
  const now = Date.now();

  if (entry && now < entry.freshUntil) return entry.value;

  try {
    const value = await read.load();
    const fetchedAt = Date.now();
    const freshUntil = Math.max(await read.freshUntil(value, fetchedAt), fetchedAt + MIN_FRESH_MS);
    const staleUntil = freshUntil + (read.staleFor ?? 0);

    await writeEntry(key, read.tag, { value, fetchedAt, freshUntil, staleUntil });

    console.info(
      `[cache] ${read.key}: leido de la API, vale hasta ${new Date(freshUntil).toISOString()}`,
    );

    return value;
  } catch (error) {
    // La copia vieja es mejor que el aviso de averia, pero solo un rato y solo si la hay:
    // pasado `staleUntil` el fallo sigue su camino y la pantalla lo cuenta como siempre.
    if (entry && now < entry.staleUntil) {
      console.warn(
        `[cache] ${read.key}: la API fallo, se sirve la copia del ${new Date(entry.fetchedAt).toISOString()}`,
        error,
      );

      return entry.value;
    }

    throw error;
  }
}

/**
 * La entrada guardada, o `null`.
 *
 * NUNCA LANZA. Si la Runtime Cache no responde o devuelve algo con otra forma, esto es como
 * no tener copia: se pide a la API. Una averia del cache no puede tumbar la tienda.
 */
async function readEntry<T>(key: string): Promise<Entry<T> | null> {
  try {
    const raw = (await getCache().get(key)) as Entry<T> | null | undefined;

    if (!raw || typeof raw.freshUntil !== 'number' || typeof raw.staleUntil !== 'number') {
      return null;
    }

    return raw;
  } catch (error) {
    console.error('[cache] no se pudo leer', key, error);

    return null;
  }
}

/** Guarda la entrada. Tampoco lanza: si no se puede guardar, se sirve igual lo leido. */
async function writeEntry<T>(key: string, tag: string, entry: Entry<T>): Promise<void> {
  // El ttl es lo que la entrada puede llegar a servir, copia vieja incluida: por debajo de
  // eso, Vercel la borraria antes de que el respaldo ante fallos sirviera de nada.
  const ttl = Math.ceil((entry.staleUntil - entry.fetchedAt) / 1000);

  try {
    await getCache().set(key, entry, { ttl, tags: [tag, CACHE_TAGS.all], name: key });
  } catch (error) {
    console.error('[cache] no se pudo guardar', key, error);
  }
}
