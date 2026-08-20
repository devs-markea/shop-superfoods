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

import { apiFetch, unwrap } from './api.ts';
import type { ProductImage } from './catalog.ts';
import type { CartLine, CartOption, CartPromotion } from './cart-view.ts';

export type { CartLine, CartOption, CartPromotion };

/** Alias historico: la forma de la opcion es la misma en `items` y en `lines`. */
export type CartItemOption = CartOption;

export interface CartItem {
  /** cart_items.id — el que viaja en PATCH y DELETE. */
  id: string;
  /** menus.id — la llave del platillo. No se va nunca de la linea. */
  productId: string;
  /** menus.slug, para volver a su pagina. null si salio del catalogo. */
  productSlug: string | null;
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
  /** = unitPrice. Explicito para no tener que deducirlo. */
  originalUnitPrice: number;
  /** = originalUnitPrice x quantity: el importe antes de descontar. */
  originalLineTotal: number;
  options: CartItemOption[];
  promotion: CartPromotion | null;
  /** Importe descontado EN ESTA LINEA. Puede venir de un grupo. */
  discount: number;
  /** Unidades gratis que esta linea aporta a un "compra y lleva". */
  freeQuantity: number;
  lineTotal: number;
}

export interface Cart {
  id: string;
  /** 'MXN'. Llega null mientras el carrito esta vacio. */
  currency: string | null;
  /** Suma de cantidades, no de lineas. */
  itemsCount: number;
  /**
   * El ESTADO: una fila de cart_items por entrada, con el id que reciben PATCH
   * y DELETE. No sirve para pintar —un grupo de "compra y lleva" toma unidades
   * de varias filas—, pero es de donde sale la cantidad real de cada fila.
   */
  items: CartItem[];
  /** La PRESENTACION: lo que se pinta, ya agrupado. Ver src/lib/cart-view.ts. */
  lines: CartLine[];
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

// El umbral de envio gratis ya no vive aqui: lo configura el negocio y llega en
// `delivery.freeShipping` de GET /api/store, que ademas dice si hay envio gratis
// —`none`, `always` o `threshold`—. Ver src/lib/store-config.ts.
//
// Sigue siendo una promesa de esta interfaz: el backend no tiene regla de envio y
// congela shippingTotal en 0 (§12 del contrato).

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

// El resumen legible de una configuracion ("Grande · Guacamole x2") vive en
// cart-view.ts: lo necesitan tanto las lineas como las unidades de un grupo, y
// ese modulo si se puede importar desde el navegador.
export { describeSelection } from './cart-view.ts';

/**
 * Si el carrito esta vacio y no hay con que seguir el checkout.
 *
 * Lo miran las cuatro pantallas que van despues del pedido y las cuatro vuelven
 * a `/mamayaya/carrito`. La ruta se escribe en cada una, como el resto de destinos del
 * proyecto —`Astro.redirect('/mamayaya/datos')`, `backHref="/mamayaya/carrito"`—: aqui vive la
 * regla, no el mapa de rutas.
 *
 * Las cuatro pantallas que van despues —datos, resumen y los dos cierres—
 * existen para convertir un pedido en una compra, y sin lineas no hay pedido.
 * Lo que se pinta entonces es un formulario que pide una direccion para nada, un
 * resumen de $0 y un "Confirmar pedido" cuyo unico final posible es el 422 de la
 * API —"Tu carrito esta vacio."— tres pantallas mas alla de donde se arreglaba.
 *
 * `null` NO cuenta como vacio, y esa es la parte que importa: es lo que
 * devuelven las pantallas cuando la lectura se cayo, y de un fallo de la casa no
 * se deduce que alguien no tenga pedido. Es la misma regla que separa el 404 del
 * 503 en las pantallas de cierre: se echa a quien no tiene nada, no a quien no
 * pudimos preguntar.
 *
 * Se miran las `lines` y no los `items` por lo mismo que las pinta la vista: es
 * lo que el comprador reconoce como su pedido.
 *
 * No sustituye a draftGaps(): aquella comprueba los datos de ENTREGA y devuelve
 * a /mamayaya/datos, que es donde se escriben. Son dos faltas distintas y cada una tiene
 * su pantalla.
 */
export function isEmptyCart(cart: Cart | null): boolean {
  return cart !== null && cart.lines.length === 0;
}

/** Cuanto falta para el envio gratis. 0 si ya se alcanzo. */
export function remainingForFreeShipping(total: number, threshold: number): number {
  return Math.max(0, threshold - total);
}

/** Porcentaje de avance hacia el envio gratis, acotado a 100. */
export function shippingProgress(total: number, threshold: number): number {
  if (threshold <= 0) return 100;
  return Math.min(100, Math.round((total / threshold) * 100));
}
