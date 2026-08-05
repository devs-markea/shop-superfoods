/**
 * Agrupa la CLABE como se lee en pantalla: 4-4-4-6.
 *
 * Se guarda y se copia en crudo —18 digitos seguidos, que es lo que acepta la
 * banca en linea— y se agrupa solo al pintarla. Por si la API la devolviera con
 * espacios algun dia, se limpia antes de agrupar.
 */
export function formatClabe(clabe: string): string {
  const digits = clabe.replace(/\D/g, '');

  return [digits.slice(0, 4), digits.slice(4, 8), digits.slice(8, 12), digits.slice(12)]
    .filter(Boolean)
    .join(' ');
}
