// ---------------------------------------------------------------------------
// Borrador del pedido: lo que se va reuniendo entre /carrito y el cierre.
//
// Nada viaja en la URL. El borrador vive en una cookie de primera parte que
// escribe el navegador y lee tambien el servidor: asi cada pantalla puede
// renderizar el total con propina o el metodo elegido sin esperar a que arranque
// el JavaScript, y sin duplicar el estado en dos sitios.
//
// No es httpOnly a proposito —la escriben los scripts de la tienda— y no guarda
// nada que el propio comprador no haya escrito en el formulario. El unico dato
// sensible del flujo, el token del carrito, sigue en su cookie httpOnly aparte.
//
// Se borra al cerrar el pedido: lo que queda entonces es el pedido, que es de la
// API, no del front.
// ---------------------------------------------------------------------------

import { placeOrder } from './checkout.ts';
import { parseQuote, type ShippingQuote } from './shipping.ts';
import { ulid } from './ulid.ts';
import type {
  CheckoutCustomer,
  CheckoutOutcome,
  CheckoutRequest,
  DeliveryType,
  PaymentMethod,
} from './checkout.ts';

export const DRAFT_COOKIE = 'sf_checkout';
export const ORDER_COOKIE = 'sf_order';

/** Dos horas: lo que dura un checkout, no una sesion. */
const DRAFT_MAX_AGE = 60 * 60 * 2;
/** Un dia: para poder volver a la pantalla de cierre desde el historial. */
const ORDER_MAX_AGE = 60 * 60 * 24;

export interface CheckoutDraft {
  deliveryType: DeliveryType;
  /** Se elige en /pago. */
  paymentMethod: PaymentMethod | null;
  tip: number;
  customer: CheckoutCustomer;
  /**
   * Texto de la ubicacion elegida, el que se muestra bajo el boton. Solo es de
   * la interfaz: al checkout va `customer.locationUrl`.
   */
  locationLabel: string;
  /** Comentarios del pedido, capturados en /carrito. Viajan como `notes`. */
  comments: string;
  /**
   * Lo que el backend contesto sobre el envio a la ubicacion compartida: el
   * importe, los kilometros, si se entrega ahi y el aviso si no.
   *
   * Se pide UNA VEZ, al compartir la ubicacion en /datos, y de ahi en adelante
   * solo se lee: cotizar es una llamada que mide contra un tercero con cuota, y
   * ni la distancia ni la ciudad de un punto cambian entre pantallas. Se vuelve a
   * pedir si el comprador comparte otro punto.
   *
   * Es una COPIA, no la fuente: la guarda la API mientras dure la sesion del
   * carrito, y si esta cookie se pierde —dura dos horas— la pantalla la recupera
   * con GET /api/shipping/quote. Y es solo para mostrarla: lo que se cobra lo
   * calcula el backend al cerrar el pedido.
   *
   * `null` mientras no haya ubicacion compartida: entonces el envio se queda
   * "Por cotizar", como antes de que hubiera cotizacion.
   */
  shipping: ShippingQuote | null;
  /**
   * Clave de idempotencia de ESTE intento de compra.
   *
   * Se emite en el primer envio y se reutiliza en los reintentos, porque es lo
   * unico que hace que un timeout no acabe en dos pedidos. Vive en el borrador
   * justamente por eso: si se generara en cada `fetch` no protegeria de nada, y si
   * se generara al entrar en la pantalla se perderia al volver atras.
   *
   * Al cerrarse el pedido el borrador se borra, asi que la compra siguiente
   * empieza con una clave nueva.
   */
  idempotencyKey: string;
}

/** Pedido recien creado. La cookie solo apunta: el pedido se relee de la API. */
export interface OrderPointer {
  id: string;
  /** El pedido no devuelve el metodo, y la pantalla de cierre lo rotula. */
  method: PaymentMethod;
  /**
   * Como se entrega. El pedido si lo devuelve, pero /recibido rotula sin
   * pedirlo —lo hace tambien cuando la lectura falla o no hay telefono al que
   * escribir—, y en efectivo la diferencia es toda la pantalla: pagar al
   * repartidor no es pasar por el local.
   *
   * Opcional porque los punteros escritos antes de que el efectivo saliera a
   * domicilio no lo llevan. Esos eran todos para recoger, asi que su ausencia se
   * lee como 'pickup' y el acuse de un pedido de ayer sigue diciendo la verdad.
   */
  deliveryType?: DeliveryType;
  /**
   * Si el cobro llego a abrirse. Solo tiene sentido en Mercado Pago, donde el
   * checkout puede devolver el pedido creado y la pasarela sin arrancar
   * (`redirectUrl: null`, porque no respondio o no esta configurada).
   *
   * Lo guarda la tienda porque la API no lo puede decir: el pedido queda en "Pago
   * pendiente" en los dos casos, y ese estado significa dos cosas distintas —"no
   * empezaste a pagar" y "estamos esperando la confirmacion de tu pago"—. Sin este
   * dato, el acuse tendria que elegir entre prometer un pago que nadie hizo o
   * pedirle otra vez el dinero a quien ya pago.
   */
  chargeStarted?: boolean;
}

export const EMPTY_DRAFT: CheckoutDraft = {
  deliveryType: 'delivery',
  paymentMethod: null,
  tip: 0,
  customer: { name: '', phone: '' },
  locationLabel: '',
  comments: '',
  shipping: null,
  idempotencyKey: '',
};

// --- Serializacion -------------------------------------------------------
// Un JSON en la cookie, codificado: la direccion trae espacios y acentos.

export function parseDraft(raw: string | undefined | null): CheckoutDraft {
  if (!raw) return EMPTY_DRAFT;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<CheckoutDraft>;

    return {
      ...EMPTY_DRAFT,
      ...parsed,
      // Los dos valores del contrato y ninguno mas —la misma regla que en el
      // puntero del pedido—. Un modo inventado dejaria el switch de entrega sin
      // nada marcado, porque ninguna de sus dos opciones seria la elegida, y
      // viajaria al checkout para volver como un 422.
      deliveryType: parsed.deliveryType === 'pickup' ? 'pickup' : 'delivery',
      // El cliente nunca se sustituye entero: si la cookie viene a medias, los
      // campos que falten tienen que quedar vacios, no undefined.
      customer: { ...EMPTY_DRAFT.customer, ...parsed.customer },
      // La cotizacion se valida entera, como el modo de entrega: un importe
      // negativo o de texto rotularia un envio con lo que diga la cookie. Sin
      // cotizacion valida, el envio vuelve a "Por cotizar".
      shipping: parseQuote(parsed.shipping),
    };
  } catch {
    // Cookie manipulada o de una version anterior: se empieza de cero.
    return EMPTY_DRAFT;
  }
}

export function parseOrderPointer(raw: string | undefined | null): OrderPointer | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as Partial<OrderPointer>;

    if (!parsed.id || !parsed.method) return null;

    return {
      id: parsed.id,
      method: parsed.method,
      // Los dos valores del contrato y ninguno mas: un modo inventado en la cookie
      // no puede colarse hasta la copia de la pantalla de cierre.
      ...(parsed.deliveryType === 'delivery' || parsed.deliveryType === 'pickup'
        ? { deliveryType: parsed.deliveryType }
        : {}),
      // Se copia solo si viene: "no lo se" y "el cobro no arranco" no son lo
      // mismo, y un false inventado convertiria en aviso de impago un pedido
      // de transferencia.
      ...(typeof parsed.chargeStarted === 'boolean'
        ? { chargeStarted: parsed.chargeStarted }
        : {}),
    };
  } catch {
    return null;
  }
}

// --- Reglas --------------------------------------------------------------

/** Digitos utiles de un telefono, sin lada, espacios ni signos. */
export function phoneDigits(phone: string): string {
  return phone.replace(/\D/g, '');
}

/** Como se nombran los tres campos de la direccion en los avisos. */
const ADDRESS_GAPS = ['la colonia', 'la calle', 'el numero exterior'];

/**
 * Campos del cliente que solo tienen sentido a domicilio. Al recoger no se piden
 * ni se mandan: el pedido se entrega en el local.
 */
const ADDRESS_KEYS = [
  'neighborhood',
  'street',
  'exteriorNumber',
  'crossStreets',
  'addressReferences',
  'locationUrl',
] as const;

type OptionalCustomerKey = 'email' | (typeof ADDRESS_KEYS)[number];

/**
 * Que falta para poder cerrar el pedido, en lenguaje de la interfaz.
 *
 * Cubre las reglas de la API para no descubrirlas con un 422 dos pantallas mas
 * adelante, cuando ya no hay donde arreglarlo:
 *
 *   - Nombre y telefono, SIEMPRE, tambien al recoger.
 *   - El telefono tiene que ser utilizable: es la llave con la que el ERP
 *     identifica al cliente, y uno ilegible mete a compradores distintos en el
 *     mismo registro.
 *   - A domicilio, la direccion escrita entera: colonia, calle y numero exterior.
 *   - Al recoger, nada mas: ni direccion ni ubicacion.
 *
 * Aqui la tienda es MAS estricta que la API a proposito. Arriba basta con una de
 * las dos formas de decir donde entregar —la direccion escrita o `locationUrl`—,
 * pero la que lee el repartidor es la escrita: un enlace de Maps no se puede
 * dictar por telefono ni buscar en un portal. Asi que la ubicacion dejo de
 * sustituir a la direccion y quedo como lo que es, un extra que la precisa.
 */
export function draftGaps(draft: CheckoutDraft): string[] {
  const { customer } = draft;
  const gaps: string[] = [];

  if (!customer.name?.trim()) gaps.push('tu nombre');

  const digits = phoneDigits(customer.phone ?? '');
  if (!digits) gaps.push('tu telefono');
  else if (digits.length < 10) gaps.push('un telefono valido de 10 digitos');

  if (draft.deliveryType === 'delivery') {
    const [neighborhood, street, exteriorNumber] = ADDRESS_GAPS;

    if (!customer.neighborhood?.trim()) gaps.push(neighborhood);
    if (!customer.street?.trim()) gaps.push(street);
    if (!customer.exteriorNumber?.trim()) gaps.push(exteriorNumber);
  }

  return gaps;
}

/** "la colonia, la calle y el numero exterior" */
export function listGaps(gaps: string[]): string {
  if (gaps.length <= 1) return gaps.join('');
  return `${gaps.slice(0, -1).join(', ')} y ${gaps[gaps.length - 1]}`;
}

/**
 * El borrador como cuerpo del checkout. Devuelve null si falta algo obligatorio
 * o si todavia no se ha elegido metodo de pago.
 *
 * Los campos vacios se omiten en lugar de mandarse en blanco: la API los tiene
 * como opcionales y un "" no es un valor.
 */
export function toCheckoutRequest(draft: CheckoutDraft): CheckoutRequest | null {
  if (!draft.paymentMethod || draftGaps(draft).length > 0) return null;

  const { customer } = draft;

  const optional: Partial<CheckoutCustomer> = {};

  // Al recoger se manda solo el contacto. Los campos de la direccion se descartan
  // aunque el borrador los recuerde de una eleccion anterior: el pedido se recoge
  // en el local, y mandar la casa de quien compra guardaria en el pedido una
  // direccion de entrega que nadie va a usar.
  const keys: readonly OptionalCustomerKey[] =
    draft.deliveryType === 'pickup' ? ['email'] : ['email', ...ADDRESS_KEYS];

  for (const key of keys) {
    const value = customer[key]?.trim();
    if (value) optional[key] = value;
  }

  const notes = draft.comments.trim();

  // La cotizacion que vio el comprador. Viaja SOLO como referencia: el envio que
  // se cobra lo recalcula la API desde `customer.locationUrl`, y un importe
  // enviado desde aqui se rechaza con 422. Sirve para que el backend pueda
  // comparar lo que se enseño con lo que cobro, que es como se descubre que una
  // pantalla se quedo atras.
  //
  // Al recoger no se manda: ahi no hay envio del que hablar, y la cotizacion que
  // quede en el borrador es de una eleccion anterior.
  const quoteId = draft.deliveryType === 'pickup' ? '' : (draft.shipping?.quoteId ?? '');

  return {
    deliveryType: draft.deliveryType,
    paymentMethod: draft.paymentMethod,
    tip: draft.tip,
    ...(quoteId ? { shipping: { quoteId } } : {}),
    // La API acepta el campo ausente, null, vacio o con espacios: los cuatro se
    // guardan igual. Se omite cuando no hay nada que decir, y no se recorta a los
    // 1000 del limite porque el propio campo del carrito ya no deja escribir mas.
    ...(notes ? { notes } : {}),
    customer: {
      name: customer.name.trim(),
      phone: customer.phone.trim(),
      ...optional,
    },
  };
}

// --- Solo navegador ------------------------------------------------------
// El servidor lee las cookies por `Astro.cookies` y estas cuatro no le sirven.

function readCookie(name: string): string | undefined {
  return document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
}

function writeCookie(name: string, value: string, maxAge: number): void {
  const secure = window.location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; samesite=lax${secure}`;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; path=/; max-age=0`;
}

export function readDraft(): CheckoutDraft {
  return parseDraft(readCookie(DRAFT_COOKIE));
}

/** Mezcla y guarda. Devuelve el borrador ya completo, listo para validar. */
export function patchDraft(patch: Partial<CheckoutDraft>): CheckoutDraft {
  const current = readDraft();

  const next: CheckoutDraft = {
    ...current,
    ...patch,
    customer: { ...current.customer, ...patch.customer },
  };

  writeCookie(DRAFT_COOKIE, encodeURIComponent(JSON.stringify(next)), DRAFT_MAX_AGE);

  return next;
}

export function clearDraft(): void {
  deleteCookie(DRAFT_COOKIE);
}

export function saveOrderPointer(pointer: OrderPointer): void {
  writeCookie(ORDER_COOKIE, encodeURIComponent(JSON.stringify(pointer)), ORDER_MAX_AGE);
}

/**
 * Cierra el pedido con el metodo indicado: el paso de borrador a pedido.
 *
 * Lo llaman las dos pantallas que confirman —el resumen con Mercado Pago y la
 * transferencia con su "Confirmar pedido"—, porque lo que cambia entre ellas es
 * CUANDO se cierra, no COMO.
 *
 * Al cerrarse, el borrador deja de ser la verdad y se borra: el carrito queda
 * vacio arriba y lo unico que queda del pedido es el pedido.
 *
 * El envio no viaja como importe: la API lo recalcula al cerrar, desde la misma
 * ubicacion, y lo congela en `shippingTotal`. Lo unico que se manda es la
 * referencia de la cotizacion que vio el comprador, para que el backend pueda
 * comparar lo enseñado con lo cobrado. Ver toCheckoutRequest().
 */
export async function confirmDraft(method: PaymentMethod): Promise<CheckoutOutcome> {
  const current = readDraft();

  // La clave se emite una sola vez por intento de compra: si ya hay una, este
  // envio es un reintento y tiene que llevar la misma.
  const draft = patchDraft({
    paymentMethod: method,
    idempotencyKey: current.idempotencyKey || ulid(),
  });

  const gaps = draftGaps(draft);

  if (gaps.length > 0) {
    return {
      ok: false,
      message: `Falta ${listGaps(gaps)}. Revisa tus datos de entrega.`,
    };
  }

  const request = toCheckoutRequest(draft);

  if (!request) {
    return { ok: false, message: 'Faltan datos del pedido. Revisa tus datos de entrega.' };
  }

  const outcome = await placeOrder(request, draft.idempotencyKey);

  if (outcome.ok) {
    const { payment } = outcome.order;

    saveOrderPointer({
      id: outcome.order.id,
      method,
      deliveryType: draft.deliveryType,
      // El bloque `payment` solo viaja en Mercado Pago, asi que su ausencia es
      // tambien la de la pregunta: en transferencia y efectivo no hay cobro que
      // arrancar. Con el, lo que decide es la pasarela: sin URL no hubo cobro.
      ...(payment ? { chargeStarted: Boolean(payment.redirectUrl) } : {}),
    });

    clearDraft();
    return outcome;
  }

  // 409: la API ya no recuerda la clave, pero el pedido se envio. Reintentar con
  // ella no llevaria a ninguna parte, asi que el borrador se retira y la tienda
  // vuelve a empezar limpia. El carrito, arriba, ya se vacio con ese pedido.
  if (outcome.status === 409) clearDraft();

  return outcome;
}
