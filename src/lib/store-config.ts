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
import type { DeliveryType, PaymentMethod } from './checkout.ts';
import type { MessageTemplates } from './whatsapp.ts';

/**
 * Las redes que la tienda sabe pintar. Es una lista CERRADA: `network` es con lo
 * que se elige el icono, asi que una red que no este aqui se ignora en lugar de
 * pintar un glifo generico —el dia que la API publique una septima, esta tienda
 * no se rompe, solo no la pinta hasta que se le anada el icono—.
 */
export const SOCIAL_NETWORKS = [
  'facebook',
  'instagram',
  'whatsapp',
  'tiktok',
  'youtube',
  'x',
] as const;

export type SocialNetwork = (typeof SOCIAL_NETWORKS)[number];

/**
 * Un perfil del negocio, tal y como lo pinta el pie.
 *
 * Es una LISTA y no un objeto (`{ facebook: "..." }`) por dos razones que
 * importan al pintarla: el orden es dato —es el que capturo el negocio en el
 * panel, y es el orden en que quiere sus iconos— y anadir una red es anadir un
 * icono, no un campo del contrato.
 */
export interface SocialLink {
  network: SocialNetwork;
  /** El nombre accesible del enlace: "Facebook", "TikTok", "X (Twitter)". */
  label: string;
  /** Absoluta y con protocolo. La de WhatsApp llega ya convertida en `wa.me`. */
  url: string;
}

/**
 * La cuenta a la que se transfiere. Los tres datos van juntos: sin titular no se
 * sabe a nombre de quien va la transferencia, sin banco no se sabe desde donde
 * puede hacerse, y sin CLABE no hay a donde mandarla.
 */
export interface BankTransfer {
  holder: string;
  bank: string;
  /** 18 digitos en crudo. El formato 4-4-4-6 lo pone quien la pinta. */
  clabe: string;
}

/** Como se decide el envio gratis. Tres decisiones excluyentes. */
export type FreeShippingMode = 'none' | 'always' | 'threshold';

export interface StoreSettings {
  name?: string;
  publicUrl?: string;
  /**
   * Los perfiles a los que manda el pie. Van en la raiz, junto a `name` y
   * `publicUrl`, porque son del mismo acto que ellas: con que se presenta la
   * tienda cuando se la nombra desde fuera.
   *
   * El WhatsApp de aqui NO es el de `whatsapp.phone`. Aquel es el numero al que
   * se manda el comprobante del pedido y lo usan los botones del cierre; este es
   * un enlace mas del pie, que el negocio puede apuntar a otro numero
   * —atencion, catalogo, comunidad—. Pueden coincidir, pero son dos datos, se
   * configuran en dos sitios distintos del panel y ninguno se deriva del otro.
   */
  socialLinks?: SocialLink[];
  whatsapp?: {
    phone?: string;
    /**
     * Ya normalizadas a DOS NIVELES: modo de entrega y, dentro, metodo de pago.
     * Se leen con pickTemplate(), que aplica la caida a `delivery`.
     *
     * Lo que llega de la API puede tener tres formas a la vez —los dos grupos,
     * las claves planas por metodo y los dos alias por pantalla—, y todas se
     * reducen aqui: ver resolveTemplates(). Las pantallas ven solo esta.
     */
    templates?: MessageTemplates;
    /**
     * Que escribe `{platillos}`. Son dos interruptores y no uno porque son dos
     * datos distintos: que se cobro y como se prepara.
     */
    items?: { showVariant?: boolean; showCustomizations?: boolean };
  };
  /**
   * La cuenta de destino de las transferencias. Los tres datos son obligatorios
   * porque la cuenta se publica ENTERA o no se publica: ver resolveBankTransfer().
   */
  bankTransfer?: BankTransfer;
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
 * La cuenta bancaria, entera o ninguna.
 *
 * Es la regla del contrato —`bankTransfer` solo viaja con los tres datos— y aqui
 * se aplica tambien al respaldo: media cuenta no sirve para pagar y si para
 * desconfiar. Por eso NO se rellena dato a dato como la ubicacion, que son tres
 * datos que sirven por separado; coser el titular del respaldo con la CLABE del
 * panel compondria una cuenta que nadie configuro. Es la regla de `tips` y de
 * `socialLinks`: bloque entero o nada.
 *
 * Y por eso devuelve `undefined` en lugar de campos vacios: es lo que deja a las
 * pantallas comprobar presencia. Sin cuenta, /mamayaya/pago no ofrece la
 * transferencia como metodo —ver components/PaymentMethods.astro—, que es mejor que
 * ofrecerla y acabar en una tarjeta sin CLABE a la que transferir.
 */
function resolveBankTransfer(account: Partial<BankTransfer> | undefined): BankTransfer | undefined {
  const holder = account?.holder?.trim();
  const bank = account?.bank?.trim();
  const clabe = account?.clabe?.trim();

  if (!holder || !bank || !clabe) return undefined;

  return { holder, bank, clabe };
}

/** Lo que puede traer `whatsapp.templates` hoy: los dos grupos y las claves en retirada. */
type RemoteTemplates = MessageTemplates & Partial<Record<PaymentMethod, string>> & {
  efectivo_pickup?: string;
};

const METHODS: PaymentMethod[] = ['bank_transfer', 'efectivo', 'mercado_pago'];

/**
 * Las plantillas del panel, reducidas a los dos niveles del contrato vigente.
 *
 * Todo lo que la API publica en retirada se absorbe AQUI, en el borde, para que
 * las pantallas vean una sola forma y el dia que los alias se retiren solo haya
 * que encoger esta funcion. Las tres formas conviven hoy en la misma respuesta:
 *
 *   templates.delivery.<metodo>   el contrato vigente, agrupado
 *   templates.pickup.<metodo>     idem. Lleva SOLO lo que cambia (hoy, efectivo)
 *   templates.<metodo>            plano por metodo, apunta a delivery.<metodo>
 *   templates.efectivo_pickup     el intermedio, apunta a pickup.efectivo
 *
 * Los dos alias mas viejos —`paymentProof` y `orderPlaced`, indexados por
 * PANTALLA— no se leen: apuntan a `delivery.bank_transfer` y
 * `delivery.mercado_pago`, que el nivel plano ya cubre, y eran justo los que
 * mandaban al pedido de efectivo un texto que no era el suyo.
 *
 * La casilla que el negocio dejo vacia NO se rellena: su boton queda inerte.
 */
function resolveTemplates(templates: RemoteTemplates | undefined): MessageTemplates {
  if (!templates) return {};

  const group = (mode: DeliveryType): Partial<Record<PaymentMethod, string>> =>
    Object.fromEntries(
      METHODS.flatMap((method) => {
        const template = templates[mode]?.[method]?.trim() || legacy(templates, mode, method);

        return template ? [[method, template]] : [];
      }),
    );

  const delivery = group('delivery');
  const pickup = group('pickup');

  // Un grupo sin ninguna plantilla no viaja, igual que en la API: ausente es
  // mejor que vacio, y asi pickTemplate() cae a `delivery` por el mismo camino
  // que cuando el grupo si viene pero le falta esa casilla.
  return {
    ...(Object.keys(delivery).length ? { delivery } : {}),
    ...(Object.keys(pickup).length ? { pickup } : {}),
  };
}

/** La clave plana equivalente, mientras la API siga emitiendolas. */
function legacy(
  templates: RemoteTemplates,
  mode: DeliveryType,
  method: PaymentMethod,
): string | undefined {
  if (mode === 'pickup') {
    // Solo el efectivo tuvo clave propia para recoger. El resto no la necesita:
    // pickTemplate() los resuelve cayendo a `delivery`.
    return method === 'efectivo' ? templates.efectivo_pickup?.trim() : undefined;
  }

  return templates[method]?.trim();
}

/**
 * Rotulos de respaldo, y SOLO para el respaldo.
 *
 * La API manda `label` con cada red justamente para no obligar a la tienda a
 * mantener esta tabla, y cuando viaja manda ella. Esto existe porque
 * src/data/store-fallback.ts lo escribe alguien que no es programador y puede
 * dejarse el rotulo: un icono sin nombre accesible es un enlace mudo para quien
 * navega con lector, y capitalizar el token daria "Tiktok" y "X" donde la marca
 * escribe "TikTok" y "X (Twitter)".
 */
const NETWORK_LABELS: Record<SocialNetwork, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X (Twitter)',
};

/** Si el token es una de las seis redes que hay icono para pintar. */
function isNetwork(value: unknown): value is SocialNetwork {
  return typeof value === 'string' && (SOCIAL_NETWORKS as readonly string[]).includes(value);
}

/**
 * Deja la lista como la pinta el pie: en el orden en que viene —que es el que
 * capturo el negocio— y sin las entradas que no se pueden pintar.
 *
 * Se cae una entrada cuando su `network` no esta en la lista cerrada, cuando no
 * trae `url` o cuando la que trae no es absoluta. Un icono de menos es mejor que
 * un `<a>` que no lleva a ninguna parte, que es la misma regla que gobierna el
 * resto de la tienda.
 */
function normalizeSocialLinks(links: SocialLink[] | undefined): SocialLink[] {
  if (!Array.isArray(links)) return [];

  return links.flatMap((link) => {
    const network = link?.network;
    const url = link?.url?.trim();

    if (!isNetwork(network) || !url || !/^https?:\/\//i.test(url)) return [];

    return [{ network, label: link.label?.trim() || NETWORK_LABELS[network], url }];
  });
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
  const socialLinks = normalizeSocialLinks(remote.socialLinks);

  return {
    name: pick(remote.name, fallback.name),
    publicUrl: pick(remote.publicUrl, fallback.publicUrl),

    // La lista entera o la del respaldo, nunca las dos mezcladas: el orden es
    // dato, y colar una red escrita a mano entre las del panel publicaria un
    // perfil que el negocio no configuro. Es la regla de `tips` y de
    // `freeShipping` —bloque entero o nada—, no la de `location`. Sin redes en
    // ninguno de los dos sitios la lista queda vacia y el pie no pinta la fila.
    socialLinks: socialLinks.length ? socialLinks : normalizeSocialLinks(fallback.socialLinks),

    // El telefono si cae al respaldo —sin numero no hay conversacion que abrir y
    // el boton queda inerte—, pero las plantillas NO.
    //
    // Son texto que el negocio escribe y previsualiza en su panel, y desde que
    // el panel inserta la estructura completa del pedido, una plantilla de
    // respaldo escrita aqui no es "el mismo mensaje mas corto": es otro mensaje,
    // sin direccion, sin platillos y con otro formato de importes. Rellenar ese
    // hueco resucitaria en el chat del cliente el texto que el negocio acaba de
    // borrar, y sin que nadie se entere. Vacia, el boton se queda inerte, que es
    // lo que manda el contrato.
    whatsapp: {
      phone: pick(remote.whatsapp?.phone, fallback.whatsapp?.phone),
      templates: resolveTemplates(remote.whatsapp?.templates),
      // Sin interruptores no se enciende nada. Viajan siempre que haya telefono,
      // asi que su ausencia es una API vieja, no una decision del negocio — y
      // ante la duda se escribe de menos: una variante de mas en el mensaje es
      // un dato que el negocio eligio no publicar.
      items: {
        showVariant: remote.whatsapp?.items?.showVariant === true,
        showCustomizations: remote.whatsapp?.items?.showCustomizations === true,
      },
    },

    // La del panel o la del respaldo, nunca las dos mezcladas, y solo si esta
    // completa: ver resolveBankTransfer(). Sin cuenta en ninguno de los dos
    // sitios la clave no viaja y la transferencia deja de ofrecerse.
    bankTransfer:
      resolveBankTransfer(remote.bankTransfer) ?? resolveBankTransfer(fallback.bankTransfer),

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

/*
|--------------------------------------------------------------------------
| Reutilizacion del horario
|--------------------------------------------------------------------------
|
| `GET /api/store/schedule` se pide en TODAS las pantallas —son ocho, y cada una
| lo pide entera de nuevo— para pintar el rotulo de abierto/cerrado. No es un dato
| que cambie entre dos de ellas, asi que se reutiliza durante unos segundos.
|
| POR QUE HACE FALTA ESCRIBIRLO AQUI. El backend YA dice cuanto vale su respuesta:
| la manda con `Cache-Control: public, max-age=30` (StoreConfigController::schedule).
| Pero esa cabecera solo la obedece quien tenga un cache HTTP, y en este camino no
| hay ninguno: el navegador nunca ve estas respuestas —este front es un BFF, las
| pide el servidor de Astro— y el `fetch` de Node no tiene cache. Comprobado: tres
| llamadas seguidas a la misma URL con `max-age=300` son tres golpes al servidor.
| O sea que la cabecera viaja y se descarta.
|
| QUE SE CEDE. `isOpen` viene RESUELTO del servidor (no se deriva aqui de los
| turnos), asi que durante la ventana el rotulo puede ir hasta medio minuto tarde:
| la tienda cierra y el sitio sigue diciendo "Abierto" un rato. Es exactamente el
| desfase que el endpoint declara aceptable con su `max-age=30`, y es la razon de
| que el horario viva en su propio endpoint y no dentro de `/api/store` —que se
| declara valido cinco minutos y NO se reutiliza aqui: ahi va la CLABE, y un cambio
| de cuenta tiene que llegar al primer pedido, no al de dentro de cinco minutos—.
*/

/**
 * Ventana de reutilizacion, en milisegundos.
 *
 * SI CAMBIA EL `max-age` DEL BACKEND, HAY QUE CAMBIARLO AQUI: no se deduce de la
 * respuesta porque `apiGet` abre el sobre y descarta la `Response`, y leer la
 * cabecera obligaria a arrastrarla por todo el cliente para ahorrar una constante.
 */
const SCHEDULE_TTL_MS = 30_000;

/**
 * El ultimo horario pedido, con la hora en que se pidio.
 *
 * Se guarda la PROMESA y no el valor ya resuelto: asi dos renders simultaneos en la
 * misma instancia esperan la MISMA peticion en vez de lanzar dos.
 *
 * VIVE EN LA INSTANCIA, no en un almacen compartido. En Vercel cada funcion tiene su
 * propia memoria, de modo que esto ahorra llamadas dentro de una instancia caliente y
 * no ahorra ninguna entre instancias distintas ni despues de un arranque en frio.
 * Reduce el gasto; no lo elimina. Es a proposito: un cache compartido de verdad seria
 * infraestructura nueva para un dato que caduca en treinta segundos.
 */
let cachedSchedule: { at: number; value: Promise<StoreSchedule | null> } | null = null;

/** Horario de la tienda. `null` si no se pudo leer: el reloj no afirma nada. */
export async function getStoreSchedule(): Promise<StoreSchedule | null> {
  const now = Date.now();

  if (cachedSchedule && now - cachedSchedule.at < SCHEDULE_TTL_MS) {
    return cachedSchedule.value;
  }

  const pending = fetchStoreSchedule();
  cachedSchedule = { at: now, value: pending };

  const schedule = await pending;

  // UN FALLO NO SE GUARDA. `fetchStoreSchedule` devuelve `null` cuando la API no
  // responde, y congelar ese `null` treinta segundos convertiria un tropiezo en medio
  // minuto de "no se sabe" para todas las pantallas que sirva esta instancia. Al
  // soltarlo, la siguiente peticion reintenta. La comparacion evita pisar una entrada
  // mas nueva que hubiera entrado mientras se esperaba.
  if (schedule === null && cachedSchedule?.value === pending) {
    cachedSchedule = null;
  }

  return schedule;
}

async function fetchStoreSchedule(): Promise<StoreSchedule | null> {
  try {
    return normalizeSchedule(await apiGet<Parameters<typeof normalizeSchedule>[0]>('/api/store/schedule'));
  } catch (error) {
    console.error('[tienda] fallo GET /api/store/schedule', error);
    return null;
  }
}
