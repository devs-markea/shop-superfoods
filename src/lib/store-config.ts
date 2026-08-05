// ---------------------------------------------------------------------------
// Configuracion de la tienda.
//
//   GET /api/store            datos de negocio, cacheable 5 minutos
//   GET /api/store/schedule   horario, cacheable 30 segundos (depende de la hora)
//
// Los dos son publicos y no llevan sesion. La API omite el bloque entero cuando
// un dato no esta configurado, asi que aqui se mezcla con el respaldo de
// src/data/store-fallback.ts **dato a dato**: manda lo que venga de arriba y el
// respaldo solo rellena huecos.
//
// Solo servidor: usa apiGet. Las pantallas lo llaman en su frontmatter y pasan a
// los componentes lo que necesiten.
// ---------------------------------------------------------------------------

import { apiGet } from './api.ts';
import { normalizeSchedule, type StoreSchedule } from './schedule.ts';
import { storeFallback } from '../data/store-fallback.ts';

/** Como se decide el envio gratis. Tres decisiones excluyentes. */
export type FreeShippingMode = 'none' | 'always' | 'threshold';

export interface StoreSettings {
  name?: string;
  publicUrl?: string;
  whatsapp?: {
    phone?: string;
    templates?: { paymentProof?: string; orderPlaced?: string };
  };
  bankTransfer?: { holder?: string; bank?: string; clabe?: string };
  location?: { address?: string; mapsUrl?: string };
  delivery?: {
    freeShipping?: { mode: FreeShippingMode; threshold: number | null };
    estimate?: string;
  };
  tips?: { enabled: boolean; amounts: number[] };
  legal?: { termsUrl?: string };
}

// El horario tiene su propio modulo: la API publica hechos y redactar el estado o
// agrupar los dias es presentacion. Ver src/lib/schedule.ts.
export type { StoreSchedule };

/**
 * Un valor si tiene contenido; si no, el del respaldo.
 *
 * Se compara contra vacio y no contra `undefined` porque un `""` guardado en el
 * panel es tan "sin configurar" como un campo que no viaja.
 */
function pick(value: string | undefined, fallback: string | undefined): string {
  return value?.trim() || fallback?.trim() || '';
}

/**
 * Configuracion resuelta: lo de la API con los huecos rellenados.
 *
 * Nunca lanza. Si la API no responde, la tienda sigue vendiendo con el respaldo:
 * un dato de configuracion caido no puede tumbar el catalogo.
 */
export async function getStoreConfig(): Promise<StoreSettings> {
  let remote: StoreSettings = {};

  try {
    remote = await apiGet<StoreSettings>('/api/store');
  } catch (error) {
    console.error('[tienda] fallo GET /api/store, se usa el respaldo', error);
  }

  const fallback = storeFallback;

  return {
    name: pick(remote.name, fallback.name),
    publicUrl: pick(remote.publicUrl, fallback.publicUrl),

    whatsapp: {
      phone: pick(remote.whatsapp?.phone, fallback.whatsapp?.phone),
      templates: {
        paymentProof: pick(
          remote.whatsapp?.templates?.paymentProof,
          fallback.whatsapp?.templates?.paymentProof,
        ),
        orderPlaced: pick(
          remote.whatsapp?.templates?.orderPlaced,
          fallback.whatsapp?.templates?.orderPlaced,
        ),
      },
    },

    bankTransfer: {
      holder: pick(remote.bankTransfer?.holder, fallback.bankTransfer?.holder),
      bank: pick(remote.bankTransfer?.bank, fallback.bankTransfer?.bank),
      clabe: pick(remote.bankTransfer?.clabe, fallback.bankTransfer?.clabe),
    },

    location: {
      address: pick(remote.location?.address, fallback.location?.address),
      mapsUrl: pick(remote.location?.mapsUrl, fallback.location?.mapsUrl),
    },

    delivery: {
      // El envio gratis y la propina no caen al respaldo campo a campo: son
      // decisiones, no huecos. `mode: 'none'` es "no hay envio gratis" y
      // `enabled: false` es "no se pide propina"; rellenarlos con el respaldo
      // seria desobedecer al negocio y prometer algo que nadie va a respetar.
      // Solo se usa el respaldo cuando el bloque entero no viaja.
      freeShipping: remote.delivery?.freeShipping ?? fallback.delivery?.freeShipping,
      // El estimado si es un hueco: es una promesa escrita, no una decision.
      estimate: pick(remote.delivery?.estimate, fallback.delivery?.estimate),
    },
    tips: remote.tips ?? fallback.tips,

    legal: { termsUrl: pick(remote.legal?.termsUrl, fallback.legal?.termsUrl) },
  };
}

/** Horario de la tienda. `null` si no se pudo leer: el reloj no afirma nada. */
export async function getStoreSchedule(): Promise<StoreSchedule | null> {
  try {
    return normalizeSchedule(await apiGet<Parameters<typeof normalizeSchedule>[0]>('/api/store/schedule'));
  } catch (error) {
    console.error('[tienda] fallo GET /api/store/schedule', error);
    return null;
  }
}
