// ---------------------------------------------------------------------------
// Borrador del pedido: lo que se va reuniendo entre /mi-pedido y el cierre.
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
  /** Se elige en /resumen-de-pago. */
  paymentMethod: PaymentMethod | null;
  tip: number;
  customer: CheckoutCustomer;
  /**
   * Texto de la ubicacion elegida, el que se muestra bajo el boton. Solo es de
   * la interfaz: al checkout va `customer.locationUrl`.
   */
  locationLabel: string;
  /**
   * Comentarios del pedido, capturados en /mi-pedido.
   *
   * PENDIENTE: `CheckoutRequest` no tiene campo para ellos (§6 del contrato), asi
   * que hoy se guardan para no perderlos por el camino pero NO se envian. En
   * cuanto la API acepte un campo de notas, se anade en toCheckoutRequest().
   */
  comments: string;
}

/** Pedido recien creado. La cookie solo apunta: el pedido se relee de la API. */
export interface OrderPointer {
  id: string;
  /** El pedido no devuelve el metodo, y la pantalla de cierre lo rotula. */
  method: PaymentMethod;
}

export const EMPTY_DRAFT: CheckoutDraft = {
  deliveryType: 'delivery',
  paymentMethod: null,
  tip: 0,
  customer: { name: '', phone: '' },
  locationLabel: '',
  comments: '',
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
      // El cliente nunca se sustituye entero: si la cookie viene a medias, los
      // campos que falten tienen que quedar vacios, no undefined.
      customer: { ...EMPTY_DRAFT.customer, ...parsed.customer },
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
    return parsed.id && parsed.method ? { id: parsed.id, method: parsed.method } : null;
  } catch {
    return null;
  }
}

// --- Reglas --------------------------------------------------------------

/**
 * Que falta para poder cerrar el pedido, en lenguaje de la interfaz.
 *
 * Reproduce las reglas de la API para no descubrirlas con un 422: nombre y
 * telefono siempre; colonia, calle y numero solo a domicilio. Para recoger no se
 * pide direccion, y el backend tampoco.
 *
 * La ubicacion de Google Maps NO sustituye a la direccion: la API la exige
 * igualmente en los pedidos a domicilio. Es un extra que ayuda al repartidor y,
 * cuando haya clave de geocodificacion, la que rellena esos tres campos sola.
 */
export function draftGaps(draft: CheckoutDraft): string[] {
  const { customer } = draft;
  const gaps: string[] = [];

  if (!customer.name?.trim()) gaps.push('tu nombre');
  if (!customer.phone?.trim()) gaps.push('tu telefono');

  if (draft.deliveryType === 'delivery') {
    if (!customer.neighborhood?.trim()) gaps.push('la colonia');
    if (!customer.street?.trim()) gaps.push('la calle');
    if (!customer.exteriorNumber?.trim()) gaps.push('el numero exterior');
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
  const keys = [
    'email',
    'neighborhood',
    'street',
    'exteriorNumber',
    'crossStreets',
    'addressReferences',
    'locationUrl',
  ] as const;

  for (const key of keys) {
    const value = customer[key]?.trim();
    if (value) optional[key] = value;
  }

  return {
    deliveryType: draft.deliveryType,
    paymentMethod: draft.paymentMethod,
    tip: draft.tip,
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
 */
export async function confirmDraft(method: PaymentMethod): Promise<CheckoutOutcome> {
  const draft = patchDraft({ paymentMethod: method });
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

  const outcome = await placeOrder(request);

  if (outcome.ok) {
    saveOrderPointer({ id: outcome.order.id, method });
    clearDraft();
  }

  return outcome;
}
