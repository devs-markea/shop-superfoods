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
  /**
   * Tres datos, y ninguno se deriva de otro:
   *
   *   address       la completa, escrita para leerse entera. Es la del modal, que
   *                 tiene el ancho para mostrarla.
   *   shortAddress  la abreviada, para donde la completa no cabe: el rotulo del
   *                 pin en la barra de desktop.
   *   mapsUrl       a donde lleva el boton del modal.
   *
   * `shortAddress` NO es `address` recortada y no se sustituye por ella. Truncar
   * por caracteres no abrevia una direccion: lo que se queda fuera del corte es
   * justo lo que ubica el local —la colonia, la referencia—, y lo que sobrevive
   * ("Av. Coba 45, Cen…") no dice a donde ir. Cual es el trozo que identifica el
   * local es una decision del negocio, y por eso se captura aparte.
   */
  location?: { address?: string; shortAddress?: string; mapsUrl?: string };
  delivery?: {
    freeShipping?: { mode: FreeShippingMode; threshold: number | null };
    estimate?: string;
  };
  /**
   * Promesa de tiempo para recoger. Bloque propio y no `delivery.pickupEstimate`
   * porque no es un detalle del envio: son los dos modos de entrega, al mismo
   * nivel. Lleva una sola clave —donde se recoge ya esta en `location`, y cuando
   * abre, en el horario—.
   */
  pickup?: { estimate?: string };
  tips?: { enabled: boolean; amounts: number[] };
  legal?: { termsUrl?: string };
  /**
   * El banner de la portada, en tres piezas sueltas.
   *
   * No es una imagen con el texto dentro: un texto quemado en el JPG no se lee
   * en voz alta, se pixela y obliga a rehacer la foto para corregir una coma.
   * Aqui el titular y la bajada son texto de verdad y la imagen es solo el
   * fondo; componerlos —velo incluido— es cosa de la tienda.
   *
   * Cada clave sirve sola: el titulo sin foto es una franja de texto y la foto
   * sin titulo un fondo, y las dos son mejores que no pintar la portada. Sin
   * ninguna, no hay banner que inventar: la tienda abre en el catalogo.
   */
  home?: { banner?: { title?: string; description?: string; image?: string } };
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
      shortAddress: pick(remote.location?.shortAddress, fallback.location?.shortAddress),
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

    // Cada plazo cae a SU respaldo y nunca al del otro modo. Prometer el de
    // domicilio a quien va a recoger hace esperar de mas; el de recoger a quien
    // pide a domicilio promete lo que no se puede cumplir. Sin ninguno de los
    // dos no se promete plazo, y el reloj de ese modo no se pinta.
    pickup: { estimate: pick(remote.pickup?.estimate, fallback.pickup?.estimate) },

    tips: remote.tips ?? fallback.tips,

    legal: { termsUrl: pick(remote.legal?.termsUrl, fallback.legal?.termsUrl) },

    // El banner cae al respaldo clave a clave, como la ubicacion: son tres
    // huecos, no una decision. Lo que no rellena nadie se queda vacio y la
    // portada pinta lo que quede —o nada—, que es justo lo que pide el
    // contrato: sin banner no se inventa uno.
    home: {
      banner: {
        title: pick(remote.home?.banner?.title, fallback.home?.banner?.title),
        description: pick(remote.home?.banner?.description, fallback.home?.banner?.description),
        image: pick(remote.home?.banner?.image, fallback.home?.banner?.image),
      },
    },
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
