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
   * Los tres siguientes son obligatorios con `delivery` y la API los rechaza si
   * faltan, aunque venga `locationUrl`. Comprobado contra staging:
   * "La colonia es obligatoria para pedidos a domicilio."
   */
  neighborhood?: string;
  street?: string;
  exteriorNumber?: string;
  crossStreets?: string;
  addressReferences?: string;
  /** Enlace de Google Maps al punto elegido. Complementa la direccion. */
  locationUrl?: string;
}

export interface CheckoutRequest {
  deliveryType: DeliveryType;
  paymentMethod: PaymentMethod;
  /** Opcional para la API. Se manda siempre, aunque sea 0. */
  tip?: number;
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
  items: OrderLine[];
}

/** Como se rotula cada metodo en las pantallas de cierre. */
export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: 'Transferencia',
  efectivo: 'Efectivo',
  mercado_pago: 'Mercado Pago',
};

/** Del valor del radio de /resumen-de-pago al que espera la API. */
export function toPaymentMethod(value: string | undefined): PaymentMethod | null {
  if (value === 'transferencia') return 'bank_transfer';
  if (value === 'mercadopago') return 'mercado_pago';
  if (value === 'efectivo') return 'efectivo';
  return null;
}

export type CheckoutOutcome =
  | { ok: true; order: StoreOrder }
  | { ok: false; message: string };

const GENERIC_ERROR = 'No pudimos crear tu pedido. Intentalo de nuevo.';

/**
 * Primer error legible de un 422.
 *
 * Se prefiere `errors` a `message` por lo mismo que en la ficha del platillo:
 * las reglas de negocio llegan en espanol dentro de `errors`, mientras que
 * `message` puede venir en ingles si el fallo fue de forma.
 */
function readError(body: unknown): string {
  if (!body || typeof body !== 'object') return GENERIC_ERROR;

  const errors = (body as { errors?: Record<string, string[]> }).errors;
  const first = errors && Object.values(errors)[0]?.[0];

  return first ?? GENERIC_ERROR;
}

/**
 * Cierra el pedido. Solo navegador: el POST pasa por el proxy de este front para
 * que sea el servidor quien ponga el token de la sesion.
 */
export async function placeOrder(request: CheckoutRequest): Promise<CheckoutOutcome> {
  let response: Response;

  try {
    response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    });
  } catch {
    return { ok: false, message: 'No pudimos contactar con la tienda. Revisa tu conexion.' };
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) return { ok: false, message: readError(body) };

  const order = (body as { data?: StoreOrder } | null)?.data;
  if (!order) return { ok: false, message: GENERIC_ERROR };

  return { ok: true, order };
}
