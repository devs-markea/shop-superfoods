// ---------------------------------------------------------------------------
// Reglas de los tres controles de la ficha: radio, checkbox y cantidad.
//
// El backend decide la forma de cada grupo en un solo sitio
// (PersonalizationControl) y la publica ya resuelta en `control`, `required`,
// `min` y `max`. Aqui no se vuelve a derivar nada: solo se traduce a texto y a
// los topes que la interfaz puede aplicar sin preguntar al servidor.
//
// Modulo propio y sin dependencias del servidor porque lo comparten el marcado
// que genera Astro y el script que corre en el navegador; importar catalog.ts
// desde el cliente arrastraria la capa de fetch al bundle.
// ---------------------------------------------------------------------------

/**
 * Tope de `options.*.quantity` en POST /api/cart/items. Es un limite de forma,
 * no de negocio: se aplica aunque el grupo no traiga `maxPerOption`. El propio
 * `max_per_option` del panel se valida contra este mismo techo, asi que nunca
 * llega un tope de negocio que la tienda rechazaria.
 */
export const OPTION_MAX_QUANTITY = 99;

/** Tope de entradas del arreglo `options` en POST /api/cart/items. */
export const OPTION_ENTRIES_MAX = 50;

export type OptionControl = 'radio' | 'checkbox' | 'quantity';

/**
 * Lo unico que decide como se dibuja y como se valida un grupo.
 *
 * Hay DOS magnitudes distintas y cada una tiene su campo, que es la confusion
 * mas comun del modelo:
 *
 *   min / max     cuentan opciones DISTINTAS  -> radio y checkbox
 *   maxPerOption  cuenta UNIDADES de una      -> quantity
 *                 misma opcion
 *
 * Son excluyentes por construccion: nunca llegan las dos con valor. Por eso el
 * control `quantity` trae siempre `max: null` aunque el panel tenga configurado
 * un maximo de opciones, y los otros dos traen siempre `maxPerOption: null`.
 */
export interface OptionRule {
  control: OptionControl;
  min: number;
  max: number | null;
  maxPerOption: number | null;
}

/**
 * Hasta donde puede subir el contador de UNA opcion. Sin tope de negocio queda
 * el tecnico de la API, que es el que evita gastar un 422 en algo que se sabe
 * de antemano.
 */
export function unitCap(rule: OptionRule): number {
  return Math.min(rule.maxPerOption ?? OPTION_MAX_QUANTITY, OPTION_MAX_QUANTITY);
}

/**
 * `max: 0` es una configuracion valida y significa que el grupo no admite
 * ninguna opcion: se dibuja en solo lectura y el servidor rechaza cualquier
 * cosa que se mande de el.
 */
export function isInert(rule: OptionRule): boolean {
  return rule.max === 0;
}

/**
 * `min` mayor que el numero de opciones pasa la validacion del panel y deja el
 * platillo imposible de pedir: el minimo no se puede cumplir ni marcandolo
 * todo. Se detecta aqui para decirlo en la ficha en vez de dejar que el
 * carrito lo rechace una y otra vez.
 */
export function isUnfulfillable(rule: OptionRule, optionCount: number): boolean {
  return rule.min > optionCount;
}

/** Etiqueta del grupo cuando no admite ninguna opcion. */
export const INERT_LABEL = 'No se puede elegir ninguna opcion';

/** Etiqueta de un grupo sin minimo ni tope. La cubre el tag del encabezado. */
export const OPTIONAL_LABEL = 'Opcional';

/**
 * Cuantas opciones se pueden elegir, en una linea. Mismo texto que el panel
 * para que las dos interfaces digan lo mismo del mismo grupo.
 */
export function ruleLabel(rule: OptionRule): string {
  const { control, min, max } = rule;

  // Eleccion unica: el control llega como radio solo con min = 1 y max = 1.
  if (control === 'radio') return 'Elige 1';

  // El tope de unidades no existe, y el de opciones distintas no aplica a este
  // control: lo unico que se puede anunciar es el minimo.
  if (control === 'quantity') return min >= 1 ? `Elige al menos ${min}` : OPTIONAL_LABEL;

  if (isInert(rule)) return INERT_LABEL;
  if (min >= 1 && max !== null) return min === max ? `Elige ${min}` : `Elige entre ${min} y ${max}`;
  if (min >= 1) return `Elige al menos ${min}`;
  if (max !== null) return `Hasta ${max}`;
  return OPTIONAL_LABEL;
}

/**
 * Falta de minimo, con el mismo texto que devuelve el servidor en
 * `options.{personalizationId}`. Los dos mensajes acaban en el mismo hueco de
 * la ficha, asi que conviene que no se contradigan.
 */
export function missingMessage(rule: OptionRule, groupLabel: string): string {
  return rule.min === 1
    ? `Elige una opcion de «${groupLabel}».`
    : `Elige al menos ${rule.min} opciones de «${groupLabel}».`;
}

/** Grupo que nadie puede completar: se avisa en lugar de pedir lo imposible. */
export function unfulfillableMessage(rule: OptionRule, optionCount: number): string {
  return `Este grupo pide ${rule.min} opciones distintas y solo tiene ${optionCount}: el platillo no se puede pedir todavia.`;
}
