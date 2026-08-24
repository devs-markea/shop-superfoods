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
 * Los dos topes cuentan UNIDADES; lo que los distingue es el ALCANCE, y esa es
 * la confusion mas comun del modelo:
 *
 *   min / max     unidades del GRUPO, sumadas   -> los tres controles
 *   maxPerOption  unidades de UNA opcion        -> solo quantity
 *
 * En radio y en checkbox una opcion marcada vale exactamente 1 unidad, asi que
 * alli "unidades del grupo" y "opciones distintas" son el mismo numero y la
 * distincion no se nota. En `quantity` si: una opcion puede valer 4, y entonces
 * `min` y `max` acotan la SUMA de los contadores, no cuantos estan abiertos.
 * `maxPerOption` es el unico campo exclusivo de un control, porque es el unico
 * sitio donde una opcion puede valer mas de 1.
 *
 * En un grupo `quantity` los dos topes CONVIVEN y el general manda:
 *
 *   min: 8, max: 8, maxPerOption: 4
 *     -> hay que sumar 8 unidades en el grupo, repartidas como sea
 *     -> ninguna opcion pasa de 4, asi que hacen falta al menos dos
 *     -> 4+4 y 4+3+1 valen; 5+3 se pasa del individual y 4+4+1 del general
 *
 * Lo que gastan unas opciones deja de estar disponible para las demas, y por eso
 * bajar un contador a 0 devuelve sus unidades al total: el individual solo pone
 * techo, nunca obliga a llenarse ni permite superar el general.
 */
export interface OptionRule {
  control: OptionControl;
  min: number;
  max: number | null;
  maxPerOption: number | null;
}

/**
 * Hasta donde puede subir el contador de UNA opcion, sin mirar lo que hayan
 * gastado las demas. Son tres techos y gana el mas bajo:
 *
 *   maxPerOption  el tope individual, si el grupo lo trae
 *   max           el general: una sola opcion tampoco puede pasar del total del
 *                 grupo, y con `maxPerOption` sin configurar es lo unico que la
 *                 frena
 *   99            el tope de forma de la API, que se aplica siempre
 *
 * Fuera del control de cantidad devuelve 1: una opcion marcada vale una unidad
 * (C26), y ese 1 es lo que hace que groupCapacity() valga para los tres.
 */
export function unitCap(rule: OptionRule): number {
  if (rule.control !== 'quantity') return 1;

  return Math.min(
    rule.maxPerOption ?? OPTION_MAX_QUANTITY,
    rule.max ?? OPTION_MAX_QUANTITY,
    OPTION_MAX_QUANTITY,
  );
}

/**
 * Unidades que el grupo puede llegar a dar entre todas sus opciones. Con
 * `maxPerOption` es lo que reparte el techo individual; sin el, el tope de forma
 * de la API. Es el numero contra el que se mide un minimo imposible.
 */
export function groupCapacity(rule: OptionRule, optionCount: number): number {
  return optionCount * unitCap(rule);
}

/**
 * El grupo llego a su tope GENERAL de unidades (C31). A partir de aqui no cabe
 * ninguna mas, ni siquiera en una opcion que ya tiene: para mover unidades hay
 * que bajar otra con el `−`.
 */
export function groupIsFull(rule: OptionRule, units: number): boolean {
  return rule.max !== null && units >= rule.max;
}

/**
 * Hasta donde puede subir ESTE contador ahora mismo: su techo individual, o lo
 * que quede libre en el grupo si eso es menos. `units` es la suma de todos los
 * contadores, la de esta opcion incluida, y por eso se le devuelve lo que ya
 * tiene puesto antes de repartir el resto.
 */
export function stepCeiling(rule: OptionRule, units: number, quantity: number): number {
  const cap = unitCap(rule);
  if (rule.max === null) return cap;

  return Math.min(cap, quantity + Math.max(0, rule.max - units));
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
 * `min` mayor que lo que el grupo puede dar pasa la validacion del panel y deja
 * el platillo imposible de pedir: el minimo no se cumple ni marcandolo todo. Se
 * detecta aqui para decirlo en la ficha en vez de dejar que el carrito lo
 * rechace una y otra vez.
 *
 * Desde que `min` cuenta unidades, el techo del grupo de cantidad ya no es
 * "cuantas opciones tiene" sino opciones x tope individual: `min: 8` con UNA
 * opcion y `maxPerOption: 4` da 4, y el platillo no se puede comprar. El panel
 * no lo comprueba —el numero de opciones y el minimo se editan en secciones
 * distintas del mismo formulario—, asi que lo absorbe la tienda.
 */
export function isUnfulfillable(rule: OptionRule, optionCount: number): boolean {
  return rule.min > groupCapacity(rule, optionCount);
}

/** Etiqueta del grupo cuando no admite ninguna opcion. */
export const INERT_LABEL = 'No se puede elegir ninguna opcion';

/** Etiqueta de un grupo sin minimo ni tope. La cubre el tag del encabezado. */
export const OPTIONAL_LABEL = 'Opcional';

/**
 * Cuanto hay que elegir, en una linea. Mismo texto que el panel para que las
 * dos interfaces digan lo mismo del mismo grupo.
 *
 * Lo unico que ramifica por control es la MAGNITUD, y la pone amount(): en
 * radio y checkbox se cuentan opciones —"Elige 2"— y en cantidad, unidades del
 * grupo —"Elige 2 unidades"—. Es la diferencia que el cambio del 2026-08-24
 * hace visible: un grupo de cantidad con min 2 y max 2 ya no pide dos opciones
 * distintas, sino dos unidades, y con `maxPerOption` de sobra las dos pueden
 * salir de la misma.
 *
 * `maxPerOption` NO entra aqui. Es el otro alcance —una opcion, no el grupo— y
 * su tope ya se comunica donde se alcanza: el `+` de esa opcion se deshabilita.
 * Mezclar los dos alcances en una sola linea de texto es justo la confusion que
 * el modelo de campos separados evita.
 */
export function ruleLabel(rule: OptionRule): string {
  const { min, max } = rule;

  // Eleccion unica: el control llega como radio solo con min = 1 y max = 1, asi
  // que "Elige 1" es siempre exacto y se lee mejor que derivarlo de min === max.
  if (rule.control === 'radio') return 'Elige 1';

  if (isInert(rule)) return INERT_LABEL;
  if (min >= 1 && max !== null)
    return min === max ? `Elige ${amount(rule, min)}` : `Elige entre ${min} y ${amount(rule, max)}`;
  if (min >= 1) return `Elige al menos ${amount(rule, min)}`;
  if (max !== null) return `Hasta ${amount(rule, max)}`;
  return OPTIONAL_LABEL;
}

/**
 * El numero con su unidad, cuando la unidad no se sobreentiende. En radio y
 * checkbox sale pelado —"Elige 2" son dos casillas y no hay otra lectura—; en
 * cantidad se dice "unidades" porque ahi el mismo 2 podria confundirse con dos
 * opciones distintas, que es justo lo que `min` y `max` dejaron de contar.
 */
function amount(rule: OptionRule, count: number): string {
  if (rule.control !== 'quantity') return String(count);
  return `${count} ${plural(count, 'unidad', 'unidades')}`;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * Falta de minimo, con el mismo texto que devuelve el servidor en
 * `options.{personalizationId}`. Los dos mensajes acaban en el mismo hueco de
 * la ficha, asi que conviene que no se contradigan — y el servidor tambien
 * cambia de magnitud en el control de cantidad: alli el minimo se reclama en
 * unidades del grupo, no en opciones.
 */
export function missingMessage(rule: OptionRule, groupLabel: string): string {
  if (rule.control === 'quantity') {
    return `Elige al menos ${amount(rule, rule.min)} de «${groupLabel}».`;
  }

  return rule.min === 1
    ? `Elige una opcion de «${groupLabel}».`
    : `Elige al menos ${rule.min} opciones de «${groupLabel}».`;
}

/**
 * Grupo que nadie puede completar: se avisa en lugar de pedir lo imposible.
 *
 * Se dice con lo que le falta al grupo para dar el minimo, y eso son dos cuentas
 * distintas: en radio y checkbox el techo son sus opciones, y en cantidad lo que
 * suman todas con el tope individual puesto.
 */
export function unfulfillableMessage(rule: OptionRule, optionCount: number): string {
  if (rule.control === 'quantity') {
    const capacity = groupCapacity(rule, optionCount);
    return `Este grupo pide ${amount(rule, rule.min)} y como mucho admite ${capacity}: el platillo no se puede pedir todavia.`;
  }

  return `Este grupo pide ${rule.min} opciones distintas y solo tiene ${optionCount}: el platillo no se puede pedir todavia.`;
}
