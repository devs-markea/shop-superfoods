// Formato de precio, en su propio modulo para que el JS de cliente pueda
// importarlo sin arrastrar el catalogo entero al bundle.

const priceFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

export function formatPrice(value: number): string {
  return priceFormatter.format(value);
}
