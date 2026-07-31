// ---------------------------------------------------------------------------
// API 3 — Carrito.
//
//   GET    /api/cart
//   POST   /api/cart/items
//   PATCH  /api/cart/items/{item}
//   DELETE /api/cart/items/{item}
//   DELETE /api/cart
//
// Toda operacion devuelve el carrito COMPLETO ya recalculado, asi que la
// interfaz nunca suma por su cuenta: repinta con lo que llega.
//
// Ninguna ruta recibe un id de carrito. La sesion viaja en la cabecera
// X-Cart-Token, que pone src/lib/cart-session.ts a partir de una cookie
// httpOnly de este front. Ver alli por que no hablamos directamente desde el
// navegador con la API.
// ---------------------------------------------------------------------------

import { apiFetch, assetUrl, unwrap } from './api.ts';
import type { ProductImage } from './catalog.ts';

export interface CartItemOption {
  optionId: string | null;
  label: string;
  /** Nombre de la personalizacion a la que pertenece la opcion. */
  group: string;
  price: number;
  quantity: number;
}

export interface CartItem {
  /** cart_items.id — el que viaja en PATCH y DELETE. */
  id: string;
  productId: string;
  name: string;
  image: ProductImage;
  variantId: string | null;
  variantName: string | null;
  quantity: number;
  /** Precio de la variante. */
  basePrice: number;
  /** Suma de cantidad x precio de opcion, por unidad. */
  optionsTotal: number;
  /** basePrice + optionsTotal: lo que la interfaz multiplica por cantidad. */
  unitPrice: number;
  options: CartItemOption[];
  promotion: { name: string; type: string; source: 'own' | 'category' } | null;
  discount: number;
  /** Unidades gratis por "compra y lleva". */
  freeQuantity: number;
  lineTotal: number;
}

export interface Cart {
  id: string;
  /** 'MXN'. Llega null mientras el carrito esta vacio. */
  currency: string | null;
  /** Suma de cantidades, no de lineas. */
  itemsCount: number;
  items: CartItem[];
  subtotal: number;
  discountTotal: number;
  total: number;
  /** Siempre 0 en el carrito: el envio se decide en el checkout. */
  shippingTotal: number;
  tipTotal: number;
}

export interface AddToCartPayload {
  productId: string;
  quantity: number;
  /** Opcional solo si el platillo es de precio unico. */
  priceId?: string;
  options?: Array<{ optionId: string; quantity: number }>;
}

/**
 * Umbral de envio gratis, en MXN.
 *
 * Vive en el front a proposito: el backend no tiene regla de envio y congela
 * shippingTotal en 0 (§12 del contrato). La barra de progreso es, de momento,
 * una promesa comercial de esta interfaz. Cuando el backend calcule envio, el
 * umbral debe venir de el y esta constante desaparece.
 */
export const FREE_SHIPPING_THRESHOLD = 400;

/**
 * Peticion cruda al carrito. Devuelve la Response tal cual para que el proxy
 * pueda reenviar estado y cuerpo sin interpretarlos: un 422 de validacion
 * tiene que llegar al navegador con sus `errors` intactos.
 */
export function cartFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return apiFetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      'X-Cart-Token': token,
      ...init.headers,
    },
  });
}

/** Carrito de la sesion. La API lo crea vacio en la primera visita. */
export async function getCart(token: string): Promise<Cart> {
  const response = await cartFetch('/api/cart', token);
  return unwrap<Cart>(response, '/api/cart');
}

/** URL de la foto de la linea, con el placeholder ya resuelto. */
export function cartItemImageSrc(item: CartItem): string {
  return assetUrl(item.image.url);
}

/**
 * Resumen legible de la configuracion de una linea: "Grande · Guacamole x2".
 * Sustituye al campo `customization` que el carrito de maqueta guardaba como
 * texto; ahora se compone de los datos que devuelve la API.
 */
export function describeSelection(item: CartItem): string {
  const parts: string[] = [];

  if (item.variantName) parts.push(item.variantName);

  for (const option of item.options) {
    parts.push(option.quantity > 1 ? `${option.label} x${option.quantity}` : option.label);
  }

  return parts.join(' · ');
}

/** Cuanto falta para el envio gratis. 0 si ya se alcanzo. */
export function remainingForFreeShipping(total: number): number {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - total);
}

/** Porcentaje de avance hacia el envio gratis, acotado a 100. */
export function shippingProgress(total: number): number {
  return Math.min(100, Math.round((total / FREE_SHIPPING_THRESHOLD) * 100));
}
