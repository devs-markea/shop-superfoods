// ---------------------------------------------------------------------------
// API 4 — Checkout.
//
//   POST /api/checkout   convierte el carrito de la sesion en pedido (201)
//
// Las lineas NO viajan en el cuerpo. Ya estan en el carrito del servidor,
// identificadas por la cookie de sesion, y el checkout las congela en un
// snapshot inmutable con sus variantes y personalizaciones. Lo unico que hay que
// reunir por el camino es: modo de entrega, cliente, propina y metodo de pago.
//
// Isomorfico a proposito: no importa nada de `astro:env`, asi que vale igual en
// el frontmatter de una pagina y en un <script> de cliente. El POST va contra
// /api/checkout de este mismo front, que reenvia con el token de la sesion — el
// navegador no lo tiene, es una cookie httpOnly.
// ---------------------------------------------------------------------------

export type DeliveryType = 'delivery' | 'pickup';

/** Los tres que acepta la API. `efectivo` no esta en el diseno todavia. */
export type PaymentMethod = 'bank_transfer' | 'efectivo' | 'mercado_pago';

export interface CheckoutCustomer {
  /** Obligatorio siempre. */
  name: string;
  /** Obligatorio siempre: es la llave con la que el ERP identifica al cliente. */
  phone: string;
  email?: string;
  /**
   * A domicilio hace falta UNA de las dos formas de decir donde entregar: estos
   * tres juntos, o `locationUrl`. Con ninguna, la API responde 422 en los tres.
   *
   * Media direccion no vale: elegida la via escrita, los tres van juntos.
   */
  neighborhood?: string;
  street?: string;
  exteriorNumber?: string;
  crossStreets?: string;
  addressReferences?: string;
  /** Enlace de Google Maps al punto elegido. Sustituye a la direccion escrita. */
  locationUrl?: string;
}

export interface CheckoutRequest {
  deliveryType: DeliveryType;
  paymentMethod: PaymentMethod;
  /** Opcional para la API. Se manda siempre, aunque sea 0. */
  tip?: number;
  /**
   * Comentarios del pedido, maximo 1000. Van a la raiz y no al cliente porque
   * son del pedido: el panel los muestra bajo las lineas.
   */
  notes?: string;
  customer: CheckoutCustomer;
}

/**
 * Lo minimo que necesitan las pantallas de cierre para listar el pedido.
 *
 * Lo cumplen tanto las lineas del carrito como las del pedido creado, asi que
 * las dos sirven sin convertir nada: antes de cerrar se pinta el carrito y
 * despues el pedido, que es lo unico que queda (el checkout vacia el carrito).
 */
export interface OrderLine {
  quantity: number;
  name: string;
  /**
   * La promocion que la API aplico a la linea, para rotularla en el detalle.
   * Opcional porque solo la traen las lineas del carrito: el pedido ya creado
   * congela el nombre de la promocion, no su etiqueta.
   */
  promotion?: { label?: string; name?: string } | null;
}

/**
 * Por que no se cobro, con el motivo ya traducido.
 *
 * Llega SOLO si el cobro murio —rechazado, cancelado o expirado—, asi que se
 * comprueba por presencia y no contra null: un cobro pendiente o acreditado no
 * lleva el bloque.
 *
 * Es lo que separa los dos significados de `pending_payment`: con rechazo, el
 * cobro fallo; sin el, el webhook todavia no ha llegado.
 */
export interface PaymentRejection {
  /** Clave estable (`insufficient_funds`, `duplicated_payment`...). */
  reason: string;
  /** En espanol y escrito para el comprador. Se muestra tal cual. */
  message: string;
  /**
   * Si reintentar AHORA tiene sentido. Es false en dos casos y por buenos
   * motivos: con un cobro en vuelo, un segundo intento puede acabar en dos
   * cargos; y si el comprador abandono, no es la tienda quien debe empujarlo.
   */
  retryable: boolean;
}

/**
 * Cobro del pedido. **Solo viaja en Mercado Pago**: transferencia y efectivo no
 * traen el bloque, porque su pago no pasa por una pasarela.
 */
export interface OrderPayment {
  provider: 'mercado_pago';
  /** Estado del cobro (`pending`, `approved`, `rejected`...). */
  status: string;
  /**
   * A donde mandar al comprador. Puede llegar null —la pasarela no respondio, o
   * no esta configurada—: entonces NO se redirige, que seria navegar a null. El
   * pedido existe y se paga mas tarde con startPayment().
   */
  redirectUrl: string | null;
  rejection?: PaymentRejection;
}

/** Pedido creado. Solo los campos que consume la tienda. */
export interface StoreOrder {
  /**
   * Identificador de acceso: con el se relee el pedido, y es la numeracion que
   * el negocio ya usa como folio (1, 2, 3...). Es lo que se rotula.
   */
  id: string;
  /**
   * Llega null en transferencia hasta que la tienda valida el pago, asi que sirve
   * para saber si el pedido ya esta cobrado. No se rotula: hoy es un ULID de 26
   * caracteres, ilegible en voz alta.
   */
  orderNumber: string | null;
  /** Clave estable para ramificar (`awaiting_verification`, `paid`...). */
  status: string;
  /** Etiqueta en espanol, ya resuelta por el backend. */
  statusLabel: string;
  isActive: boolean;
  deliveryType: DeliveryType;
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  tipTotal: number;
  total: number;
  placedAt: string | null;
  /**
   * Snapshot congelado del cliente. La tienda solo lee el nombre, para el mensaje
   * de WhatsApp: el pedido historico no cambia si el cliente actualiza sus datos.
   */
  customer?: { name?: string };
  items: OrderLine[];
  /**
   * El cobro, solo en Mercado Pago. Su ausencia es el modo mas fiable de saber
   * que el pedido no se paga por pasarela.
   */
  payment?: OrderPayment;
}

/** Como se rotula cada metodo en las pantallas de cierre. */
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: 'Transferencia',
  efectivo: 'Efectivo',
  mercado_pago: 'Mercado Pago',
};

/** Del valor del radio de /pago al que espera la API. */
export function toPaymentMethod(value: string | undefined): PaymentMethod | null {
  if (value === 'transferencia') return 'bank_transfer';
  if (value === 'mercadopago') return 'mercado_pago';
  if (value === 'efectivo') return 'efectivo';
  return null;
}

export type CheckoutOutcome =
  | { ok: true; order: StoreOrder }
  | { ok: false; message: string; status?: number };

const GENERIC_ERROR = 'No pudimos crear tu pedido. Intentalo de nuevo.';

/** El del cobro: el pedido ya existe, y lo que fallo es pagarlo. */
const PAYMENT_ERROR = 'No pudimos abrir el pago. Intentalo de nuevo.';

/**
 * Primer error legible de una respuesta de fallo.
 *
 * Se prefiere `errors` a `message` por lo mismo que en la ficha del platillo: las
 * reglas de negocio llegan en espanol dentro de `errors`, mientras que `message`
 * puede venir en ingles —o con el detalle de una excepcion— si el fallo fue de
 * forma.
 *
 * El 409 es la excepcion: la idempotencia no responde `errors` y su `message`
 * ("Este pedido ya se habia enviado.") es justo lo que hay que decirle a quien
 * esta comprando.
 */
function readError(body: unknown, status: number, fallback = GENERIC_ERROR): string {
  if (!body || typeof body !== 'object') return fallback;

  const errors = (body as { errors?: Record<string, string[]> }).errors;
  const first = errors && Object.values(errors)[0]?.[0];
  if (first) return first;

  if (status === 409) {
    const message = (body as { message?: string }).message;
    if (message) return message;
  }

  return fallback;
}

/**
 * Cierra el pedido. Solo navegador: el POST pasa por el proxy de este front para
 * que sea el servidor quien ponga el token de la sesion.
 *
 * `idempotencyKey` es una cadena por INTENTO DE COMPRA, no por peticion: con la
 * misma clave, un reintento devuelve 200 con el pedido que ya se creo en lugar de
 * crear otro. Es lo que cubre el hueco del boton deshabilitado, que no protege de
 * un reintento tras un timeout —donde el pedido si se creo pero la respuesta se
 * perdio—. Pasados 10 minutos la API deja de recordar la clave y responde 409.
 *
 * Cualquier 2xx vale: 201 el primer envio, 200 el reintento.
 */
export async function placeOrder(
  request: CheckoutRequest,
  idempotencyKey: string,
): Promise<CheckoutOutcome> {
  let response: Response;

  try {
    response = await fetch('/api/checkout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, message: 'No pudimos contactar con la tienda. Revisa tu conexion.' };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    return { ok: false, message: readError(body, response.status), status: response.status };
  }

  const order = (body as { data?: StoreOrder } | null)?.data;
  if (!order) return { ok: false, message: GENERIC_ERROR, status: response.status };

  return { ok: true, order };
}

export type PaymentAttempt =
  | { ok: true; redirectUrl: string }
  | { ok: false; message: string };

/**
 * Abre un cobro NUEVO sobre un pedido que sigue esperando pago, y devuelve a
 * donde mandar al comprador. Es la unica via de reintento en Mercado Pago.
 *
 * No se reintenta con /api/checkout: tras el primer cierre el carrito esta vacio,
 * asi que responderia "Tu carrito esta vacio" —o 409, si la clave de idempotencia
 * sigue en su ventana—. Aqui el pedido se reutiliza y solo el cobro es nuevo, asi
 * que no se generan pedidos basura; de todos los intentos, la API garantiza que
 * solo uno pueda quedar aprobado.
 *
 * Un intento intacto se reutiliza arriba: pulsar dos veces devuelve la misma
 * pasarela en lugar de abrir otra.
 *
 * Solo navegador: pasa por el proxy de este front, que pone el token de la sesion.
 */
export async function startPayment(orderId: string): Promise<PaymentAttempt> {
  let response: Response;

  try {
    response = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payment`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
  } catch {
    return { ok: false, message: 'No pudimos contactar con la tienda. Revisa tu conexion.' };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    // Respaldo propio: aqui el pedido ya existe, asi que hablar de crearlo
    // asustaria sin motivo. Los mensajes de negocio siguen mandando cuando vienen
    // ("Este pedido ya no admite un pago nuevo.").
    return { ok: false, message: readError(body, response.status, PAYMENT_ERROR) };
  }

  // Aqui `data` es el cobro, no el pedido: este endpoint no devuelve la orden.
  const redirectUrl = (body as { data?: { redirectUrl?: string | null } } | null)?.data?.redirectUrl;

  if (!redirectUrl) {
    return { ok: false, message: PAYMENT_ERROR };
  }

  return { ok: true, redirectUrl };
}
