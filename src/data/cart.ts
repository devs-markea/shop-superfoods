// ---------------------------------------------------------------------------
// Pedido en curso.
//
// Provisional, igual que products.ts: aqui iria el estado real del carrito
// (localStorage, cookie de sesion o API). Los totales se calculan, nunca se
// escriben a mano, para que la vista no pueda contradecir a los datos.
// ---------------------------------------------------------------------------

import { products, type Product } from './products.ts';

export interface CartLine {
  id: string;
  slug: string;
  /** Resumen de las opciones elegidas en la ficha del producto. */
  customization: string;
  /** Precio unitario ya con tamano y extras incluidos, en MXN. */
  unitPrice: number;
  quantity: number;
}

export interface CartLineView extends CartLine {
  product: Product;
  subtotal: number;
}

/** Importe a partir del cual el envio es gratis, en MXN. */
export const FREE_SHIPPING_THRESHOLD = 400;

export const cartLines: CartLine[] = [
  {
    id: 'line-1',
    slug: 'ensalada-de-quinoa',
    customization: 'Grande · Guacamole',
    unitPrice: 175, // 115 base + 40 grande + 20 guacamole
    quantity: 1,
  },
  {
    id: 'line-2',
    slug: 'smoothie-verde-detox',
    customization: 'Individual',
    unitPrice: 75,
    quantity: 2,
  },
];

/** Une cada linea con su producto y calcula el subtotal. */
export function getCartView(lines: CartLine[] = cartLines): CartLineView[] {
  return lines.flatMap((line) => {
    const product = products.find((item) => item.slug === line.slug);
    if (!product) return []; // linea huerfana: se ignora en lugar de romper
    return [{ ...line, product, subtotal: line.unitPrice * line.quantity }];
  });
}

export function getCartTotal(lines: CartLineView[]): number {
  return lines.reduce((sum, line) => sum + line.subtotal, 0);
}

/** Cuanto falta para el envio gratis. 0 si ya se alcanzo. */
export function getRemainingForFreeShipping(total: number): number {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - total);
}

/** Porcentaje de avance hacia el envio gratis, acotado a 100. */
export function getShippingProgress(total: number): number {
  return Math.min(100, Math.round((total / FREE_SHIPPING_THRESHOLD) * 100));
}
