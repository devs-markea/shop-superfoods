// ---------------------------------------------------------------------------
// El buscador de la portada: como se compara un texto con lo que se escribe.
//
// Isomorfico a proposito. El servidor deja escrito en cada platillo su texto ya
// normalizado (`data-search`, ver components/MenuSection.astro) y el navegador
// normaliza lo que se escribe con esta misma funcion (src/scripts/menu-search.ts).
// Si cada lado normalizara a su manera, "Jamón" dejaria de encontrar "jamon".
// ---------------------------------------------------------------------------

/**
 * Minusculas, sin acentos ni dieresis y con los espacios reducidos a uno: "Pokè  de
 * Atún" y "poke de atun" quedan iguales. La ñ se queda en n, que es lo que se teclea
 * cuando no se tiene a mano.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Si el texto de un platillo contiene TODAS las palabras buscadas, en cualquier orden y
 * en cualquier parte: "pollo bowl" encuentra "Bowl de pollo". Las dos cadenas ya
 * normalizadas.
 */
export function matchesSearch(text: string, query: string): boolean {
  return query.split(' ').every((term) => text.includes(term));
}
