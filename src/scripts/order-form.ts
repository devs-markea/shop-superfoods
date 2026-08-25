// Ficha del platillo: seleccion, total y alta en el carrito.
//
// El total se calcula igual que el simulador del panel:
//
//     variante elegida + Σ (cantidad x precio de opcion)
//
// donde la cantidad es 0/1 en radio y checkbox, y 0..n en el control de
// cantidad —el unico donde el precio se multiplica por algo distinto de 0 o 1.
//
// Los importes que se muestran aqui son solo para mostrar. El precio que cuenta
// es el que recalcula el servidor al agregar: al carrito solo se envian
// identificadores y cantidades.
//
// La peticion va a /api/cart/items de este mismo front, que reenvia a la API
// con el token de la sesion. Al ser mismo origen la cookie viaja sola, sin
// credentials: 'include' ni configuracion de CORS.

import { formatPrice } from '../lib/price';
import { throttleMessage } from '../lib/throttle';
import {
  OPTION_ENTRIES_MAX,
  groupIsFull,
  stepCeiling,
  unitCap,
  type OptionControl,
  type OptionRule,
} from '../lib/options';

/**
 * Techo del contador de UNIDADES DEL PLATILLO —el de la fila de compra, no el de
 * una opcion—. Es un tope de forma, del mismo orden que OPTION_MAX_QUANTITY: la
 * cantidad de la linea la valida el servidor y esto solo evita gastar un viaje en
 * un numero que ya se ve venir mal.
 */
const PRODUCT_MAX_QUANTITY = 99;

interface SelectedOption {
  optionId: string;
  quantity: number;
  price: number;
  /**
   * Solo el control `quantity` significa unidades. En radio y checkbox el
   * numero es presencia/ausencia y el servidor lo normaliza a 1, asi que ni se
   * manda.
   */
  counted: boolean;
}

interface Selection {
  variantId: string | null;
  variantPrice: number;
  options: SelectedOption[];
}

/**
 * Algo que impide comprar. Sin grupo cuando afecta al conjunto del envio.
 *
 * `message` puede ser null, y ese es el caso normal del minimo: bloquea la
 * compra sin redactar nada, porque cuanto hace falta ya lo dice el rotulo del
 * grupo. Un problema mudo sigue apagando el boton y sigue atrayendo el foco al
 * enviar; lo unico que no hace es pintar una linea roja. Ver la nota de
 * src/lib/options.ts.
 */
interface Problem {
  group: HTMLElement | null;
  message: string | null;
}

const groupsOf = (form: HTMLFormElement) => [
  ...form.querySelectorAll<HTMLElement>('[data-option-group]'),
];

const choicesOf = (group: HTMLElement) => [
  ...group.querySelectorAll<HTMLElement>('[data-choice]'),
];

const priceOf = (element: HTMLElement) => Number.parseFloat(element.dataset.price ?? '') || 0;

const quantityOf = (row: HTMLElement) =>
  Number.parseInt(row.querySelector<HTMLElement>('[data-quantity]')?.textContent ?? '', 10) || 0;

/**
 * La regla del grupo tal como la publica la API. No se deriva nada aqui: el
 * backend ya resolvio el control y los topes en un solo sitio.
 */
function ruleOf(group: HTMLElement): OptionRule {
  return {
    control: (group.dataset.control ?? 'checkbox') as OptionControl,
    min: Number.parseInt(group.dataset.min ?? '', 10) || 0,
    // data-max vacio es "sin tope"; data-max="0" es un grupo que no admite
    // ninguna opcion, y son cosas distintas.
    max: group.dataset.max ? Number.parseInt(group.dataset.max, 10) : null,
    maxPerOption: group.dataset.maxPerOption
      ? Number.parseInt(group.dataset.maxPerOption, 10)
      : null,
  };
}

/**
 * UNIDADES del grupo, que es lo que acotan min y max en los tres controles. En
 * el contador es la SUMA de todos: lo que gasta una opcion deja de estar
 * disponible para las demas, y bajar una a 0 devuelve sus unidades al total.
 *
 * En radio y checkbox una casilla marcada vale exactamente 1 unidad, asi que
 * aqui sale el mismo numero de siempre.
 */
function countUnits(group: HTMLElement): number {
  if (group.dataset.control === 'quantity') {
    return choicesOf(group).reduce((units, row) => units + quantityOf(row), 0);
  }

  return group.querySelectorAll('[data-choice]:checked').length;
}

/**
 * Opciones DISTINTAS con seleccion, que es otra cuenta: cada una ocupa UNA
 * entrada del arreglo `options` de la peticion, lleve 1 unidad o 4. Es lo que
 * mide el tope de forma de la API, no los topes del grupo.
 */
function countEntries(group: HTMLElement): number {
  if (group.dataset.control === 'quantity') {
    return choicesOf(group).filter((row) => quantityOf(row) > 0).length;
  }

  return group.querySelectorAll('[data-choice]:checked').length;
}

function readSelection(form: HTMLFormElement): Selection {
  // Con hasVariants: false no hay selector, pero la variante existe y su id
  // viaja igual. El precio base es el suyo.
  let variantId = form.dataset.variantId || null;
  let variantPrice = Number.parseFloat(form.dataset.basePrice ?? '') || 0;
  const options: SelectedOption[] = [];

  for (const group of groupsOf(form)) {
    if (group.dataset.control === 'quantity') {
      // Solo viajan las opciones con contador > 0: una entrada con quantity 0
      // no se ignora, rompe la peticion entera con un 422.
      for (const row of choicesOf(group)) {
        const quantity = quantityOf(row);
        if (quantity > 0) {
          options.push({
            optionId: row.dataset.optionId ?? '',
            quantity,
            price: priceOf(row),
            counted: true,
          });
        }
      }
      continue;
    }

    for (const input of group.querySelectorAll<HTMLInputElement>('[data-choice]:checked')) {
      if (group.dataset.kind === 'variant') {
        variantId = input.value;
        variantPrice = priceOf(input);
      } else {
        options.push({ optionId: input.value, quantity: 1, price: priceOf(input), counted: false });
      }
    }
  }

  return { variantId, variantPrice, options };
}

function totalOf(selection: Selection): number {
  return selection.options.reduce(
    (sum, option) => sum + option.price * option.quantity,
    selection.variantPrice,
  );
}

/**
 * Unidades del platillo que se van a agregar.
 *
 * El contador vive en la fila de compra y SOLO SE PINTA EN DESKTOP: en movil no
 * hay nada que leer, esto devuelve 1 y el pedido entra de uno en uno, igual que
 * antes de que el contador existiera.
 *
 * El numero se lee del marcado —como en los contadores de opciones— y se acota
 * aqui, que es el unico sitio que lo mueve. El piso es 1: de cero unidades no hay
 * nada que agregar.
 */
function productQuantityOf(form: HTMLFormElement): number {
  const value = form.querySelector<HTMLElement>('[data-quantity-value]');
  if (!value) return 1;

  const parsed = Number.parseInt(value.textContent ?? '', 10);
  return Number.isNaN(parsed) ? 1 : Math.min(PRODUCT_MAX_QUANTITY, Math.max(1, parsed));
}

/** El piso y el techo del contador del platillo, dibujados en sus dos botones. */
function applyProductLimits(form: HTMLFormElement): void {
  const quantity = productQuantityOf(form);

  const minus = form.querySelector<HTMLButtonElement>('[data-quantity-step="-1"]');
  if (minus) minus.disabled = quantity <= 1;

  const plus = form.querySelector<HTMLButtonElement>('[data-quantity-step="1"]');
  if (plus) plus.disabled = quantity >= PRODUCT_MAX_QUANTITY;
}

/**
 * Aplica los topes que se pueden dibujar, en lugar de avisar despues. Los
 * maximos se dejan cumplir deshabilitando controles; el minimo no se puede
 * dibujar, asi que lo sostiene problemsOf() bloqueando la compra.
 */
function applyLimits(group: HTMLElement): void {
  // Grupo con max: 0. No admite ninguna opcion y llega ya inerte del servidor.
  if (group.hasAttribute('data-inert')) return;

  const rule = ruleOf(group);
  const { control, max } = rule;

  if (control === 'quantity') {
    const rows = choicesOf(group);
    const cap = unitCap(rule);

    // El tope general se mide UNA vez para todo el grupo: es la suma de los
    // contadores, y al llegar a `max` se cierra el grupo entero.
    const full = groupIsFull(rule, countUnits(group));

    for (const row of rows) {
      const quantity = quantityOf(row);
      row.toggleAttribute('data-selected', quantity > 0);

      const minus = row.querySelector<HTMLButtonElement>('[data-step="-1"]');
      if (minus) minus.disabled = quantity === 0;

      // Los DOS topes del control, que acotan alcances distintos y pueden estar
      // activos a la vez en el mismo grupo:
      //
      //   atUnitCap  esta opcion llego a SUS unidades maximas (maxPerOption)
      //   full       el GRUPO llego a las suyas (max), sumando todos los
      //              contadores
      //
      // El segundo alcanza a TODAS las opciones, incluidas las que ya tienen
      // unidades: el total esta repartido y no cabe una mas. Para mover unidades
      // de una opcion a otra hay que bajar primero con el `−`, que es lo que
      // libera el hueco.
      const atUnitCap = quantity >= cap;

      // Los dos se COMUNICAN deshabilitando el boton, a diferencia del checkbox,
      // que ignora el clic en silencio. Es deliberado: un contador se sube
      // pulsando repetidamente, y un boton que deja de responder sin senal se
      // lee como una averia.
      const plus = row.querySelector<HTMLButtonElement>('[data-step="1"]');
      if (plus) plus.disabled = atUnitCap || full;

      // La etiqueta solo se atenua en lo que no se puede elegir: una opcion en 0
      // con el grupo lleno, que es el mismo lenguaje visual del checkbox
      // deshabilitado. Una opcion CON unidades esta elegida aunque su `+` este
      // frenado —por su tope o por el del grupo—, asi que atenuarla seria mentir.
      row.toggleAttribute('data-blocked', full && quantity === 0);

      // El importe solo dice algo a partir de la segunda unidad: con una, la
      // etiqueta de la opcion ya lleva el precio.
      //
      // Y se retira al tocar el techo de la opcion. Ahi la fila ya esta en su
      // momento mas cargado —el numero mas alto que admite y el `+` apagado— y
      // la suma en negrita pegada a un stepper muerto no sienta bien. La cifra
      // no se pierde: el boton de agregar lleva el total, que es donde se paga.
      const amount = row.querySelector<HTMLElement>('[data-option-amount]');
      if (amount) {
        const price = priceOf(row);
        const visible = quantity > 1 && price > 0 && !atUnitCap;
        amount.textContent = visible ? `+ ${formatPrice(price * quantity)}` : '';
        amount.hidden = !visible;
      }
    }
    return;
  }

  // El mismo tope general del contador, sobre la misma columna: aqui cada
  // casilla marcada vale una unidad, asi que "unidades del grupo" y "casillas
  // marcadas" son el mismo numero. Lo que cambia es que este no se comunica —la
  // casilla se deshabilita y ya—, porque marcar es un gesto de una vez y no una
  // pulsacion repetida que se quede sin respuesta.
  if (control !== 'checkbox' || max === null) return;

  const inputs = [...group.querySelectorAll<HTMLInputElement>('[data-choice]')];
  const checked = inputs.filter((input) => input.checked).length;
  for (const input of inputs) input.disabled = !input.checked && checked >= max;
}

function setGroupError(group: HTMLElement, message: string | null): void {
  const slot = group.querySelector<HTMLElement>('[data-group-error]');
  if (!slot) return;
  slot.textContent = message ?? '';
  slot.hidden = message === null;
}

function setFormError(form: HTMLFormElement, message: string | null): void {
  const slot = form.querySelector<HTMLElement>('[data-form-error]');
  if (!slot) return;
  slot.textContent = message ?? '';
  slot.hidden = message === null;
}

/**
 * Un grupo de cantidad obligatorio nace incumplido: todos los contadores
 * arrancan en 0. El contrato pide que sea el cliente quien bloquee la compra
 * hasta que se cumpla el minimo.
 *
 * El boton se apaga pero sigue siendo pulsable, y ahora eso pesa mas que antes:
 * como el minimo ya no redacta ningun aviso, el click es lo unico que queda
 * para senalar donde falta algo —el submit lleva el foco y desplaza hasta el
 * grupo—. Un `disabled` real no emite click y se llevaria tambien esa pista.
 */
function setBlocked(form: HTMLFormElement, blocked: boolean): void {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.setAttribute('aria-disabled', String(blocked));
}

/**
 * Comprueba los minimos antes de gastar un viaje al servidor. El servidor
 * revalida igual: esto es comodidad, no la garantia.
 */
function problemsOf(form: HTMLFormElement): Problem[] {
  const problems: Problem[] = [];
  let entries = 0;

  for (const group of groupsOf(form)) {
    const rule = ruleOf(group);

    // Las dos cuentas del grupo, que no son la misma en el control de cantidad:
    // el minimo se mide en unidades y el tope de la peticion en entradas del
    // arreglo `options`, una por opcion con seleccion.
    const units = countUnits(group);

    // La variante no viaja en `options`, asi que no cuenta para el tope.
    if (group.dataset.kind !== 'variant') entries += countEntries(group);

    // Solo el minimo, y solo en unidades: cuantas opciones distintas tenga el
    // grupo no es una condicion del grupo.
    //
    // Sin mensaje, a proposito: cuanto hace falta ya lo dice ruleLabel() encima
    // de las opciones, y repetirlo en rojo debajo era decirlo dos veces. El
    // problema se registra igual —de el salen el boton bloqueado y el foco al
    // enviar—, solo que mudo.
    if (units < rule.min) {
      problems.push({ group, message: null });
    }
  }

  if (entries > OPTION_ENTRIES_MAX) {
    problems.push({
      group: null,
      message: `Elegiste demasiadas opciones distintas: el maximo es ${OPTION_ENTRIES_MAX}.`,
    });
  }

  return problems;
}

/**
 * §9 del contrato: la API responde en dos idiomas. Los errores de negocio —los
 * que nombra `options.{personalizationId}`— llegan en espanol y se muestran tal
 * cual junto a su grupo. Los de forma llegan en ingles
 * (`The options.0.quantity field must be at least 1.`), asi que de esos se usa
 * la clave y el texto lo pone la tienda.
 */
const FIELD_MESSAGE: Record<string, string> = {
  productId: 'Este platillo ya no se puede pedir ahora mismo.',
  priceId: 'Elige una variante de precio.',
  quantity: 'Esa cantidad no es valida.',
  options: 'Revisa las opciones que elegiste.',
  cart: 'No pudimos actualizar tu pedido.',
};

const GENERIC_ERROR = 'No pudimos agregar el platillo.';

function showApiErrors(form: HTMLFormElement, body: unknown): void {
  const payload = body as { errors?: unknown } | null;
  const errors =
    payload && typeof payload.errors === 'object' && payload.errors !== null
      ? (payload.errors as Record<string, unknown>)
      : null;

  for (const group of groupsOf(form)) setGroupError(group, null);

  // Un Set porque varias entradas de forma comparten clave: `options.0.quantity`
  // y `options.1.optionId` no deben pintar dos veces el mismo aviso.
  const loose = new Set<string>();

  for (const [field, value] of Object.entries(errors ?? {})) {
    const text = String(Array.isArray(value) ? value[0] : value);
    const parts = field.split('.');

    // `options.{personalizationId}` son exactamente dos segmentos y es el error
    // de negocio del grupo. `options.0.quantity` son tres y es de forma: ese no
    // se muestra tal cual porque viene en ingles.
    const group =
      parts.length === 2 && parts[0] === 'options'
        ? form.querySelector<HTMLElement>(`[data-group-id="${CSS.escape(parts[1])}"]`)
        : null;

    if (group) {
      setGroupError(group, text);
      continue;
    }

    loose.add(FIELD_MESSAGE[parts[0]] ?? GENERIC_ERROR);
  }

  // El `message` de la respuesta tampoco se muestra: tambien puede venir en
  // ingles si el fallo fue de forma.
  setFormError(form, loose.size > 0 ? [...loose].join(' ') : errors ? null : GENERIC_ERROR);
}

async function addToCart(form: HTMLFormElement): Promise<void> {
  const endpoint = form.dataset.endpoint;
  const productId = form.dataset.productId;
  if (!endpoint || !productId) return;

  setFormError(form, null);

  const selection = readSelection(form);
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (button) button.disabled = true;

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        productId,
        // Las unidades del contador de la ficha, que en movil son siempre 1.
        quantity: productQuantityOf(form),
        // priceId es obligatorio si y solo si el platillo tiene variantes; en
        // los de precio unico se manda igual cuando lo conocemos.
        ...(selection.variantId ? { priceId: selection.variantId } : {}),
        options: selection.options.map(({ optionId, quantity, counted }) =>
          counted ? { optionId, quantity } : { optionId },
        ),
      }),
    });

    if (response.ok) {
      // La linea ya esta en el carrito: el pedido es la confirmacion.
      window.location.assign(form.dataset.redirect || '/mamayaya/carrito');
      return;
    }

    // El techo de ritmo no es un error de la seleccion, asi que no pasa por showApiErrors:
    // su respuesta no trae `errors` que repartir por los grupos del formulario y acabaria en
    // el mensaje generico. Ver src/lib/throttle.ts.
    const throttled = throttleMessage(response);

    if (throttled) {
      setFormError(form, throttled);
      return;
    }

    showApiErrors(form, await response.json().catch(() => null));
  } catch {
    setFormError(form, 'No pudimos agregar el platillo. Revisa tu conexion.');
  } finally {
    if (button) button.disabled = false;
  }
}

function initOrderForm(form: HTMLFormElement): void {
  const output = form.querySelector<HTMLElement>('[data-total]');
  const template = output?.dataset.totalTemplate;

  // Los errores de cada grupo no aparecen de entrada: seria regañar a alguien
  // que aun no ha tocado nada. Hasta el primer intento de envio, lo que falta
  // se resume en una linea sobre el boton.
  let revealed = false;

  const refresh = (): void => {
    for (const group of groupsOf(form)) applyLimits(group);
    applyProductLimits(form);

    if (output && template) {
      // Lo que se paga por lo que se agrega: la configuracion elegida POR las
      // unidades del contador. En movil el contador no se pinta, la cuenta se
      // multiplica por 1 y el boton dice el mismo importe que decia antes.
      const unit = totalOf(readSelection(form));
      output.textContent = template.replace(
        '{total}',
        formatPrice(unit * productQuantityOf(form)),
      );
    }

    const problems = problemsOf(form);
    setBlocked(form, problems.length > 0);

    // El primero que tenga algo que decir, no el primero a secas: los minimos
    // son mudos y ahora pueden venir por delante del tope de entradas, que si
    // habla. Buscar el mensaje evita que un problema mudo tape al que no lo es.
    if (!revealed) {
      setFormError(form, problems.find((problem) => problem.message !== null)?.message ?? null);
      return;
    }

    // Los problemas mudos no llegan al mapa ni a la lista: un hueco con cadena
    // vacia se pintaria como un aviso en blanco, peor que no pintar nada.
    const byGroup = new Map<HTMLElement, string>();
    const loose: string[] = [];
    for (const problem of problems) {
      if (problem.message === null) continue;
      if (problem.group) byGroup.set(problem.group, problem.message);
      else loose.push(problem.message);
    }

    for (const group of groupsOf(form)) setGroupError(group, byGroup.get(group) ?? null);
    setFormError(form, loose.length > 0 ? loose.join(' ') : null);
  };

  form.addEventListener('change', refresh);

  form.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    // Unidades del platillo. Se resuelve antes y sale por su cuenta: lleva otro
    // gancho —`data-quantity-step`— justo para no confundirse con el contador de
    // una opcion, que cuenta otra cosa y vive dentro de un grupo.
    const units = target.closest<HTMLElement>('[data-quantity-step]');
    if (units) {
      const value = form.querySelector<HTMLElement>('[data-quantity-value]');
      if (!value) return;

      // Los dos botones ya llegan deshabilitados en el piso y en el techo, asi
      // que esto es el cinturon: pasarse solo serviria para cobrar un 422.
      const delta = Number.parseInt(units.dataset.quantityStep ?? '', 10) || 0;
      const next = Math.min(
        PRODUCT_MAX_QUANTITY,
        Math.max(1, productQuantityOf(form) + delta),
      );

      value.textContent = String(next);
      refresh();
      return;
    }

    const step = target.closest<HTMLElement>('[data-step]');
    if (!step) return;

    const row = step.closest<HTMLElement>('[data-choice]');
    const group = row?.closest<HTMLElement>('[data-option-group]');
    const value = row?.querySelector<HTMLElement>('[data-quantity]');
    if (!row || !group || !value) return;

    // Piso en 0 y techo en el mas bajo de los dos topes: las unidades que le
    // quedan a esta opcion y las que le quedan al grupo. El `+` ya esta
    // deshabilitado al llegar a cualquiera de los dos, asi que esto es solo el
    // cinturon: pasarse solo serviria para cobrar un 422.
    const delta = Number.parseInt(step.dataset.step ?? '', 10) || 0;
    const quantity = quantityOf(row);
    const ceiling = stepCeiling(ruleOf(group), countUnits(group), quantity);
    const next = Math.min(ceiling, Math.max(0, quantity + delta));

    value.textContent = String(next);
    refresh();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const problems = problemsOf(form);
    if (problems.length > 0) {
      revealed = true;
      refresh();

      // El foco primero y el desplazamiento despues: lo que importa es dejar
      // el cursor en el grupo que falta, no la animacion.
      const group = problems.find((problem) => problem.group)?.group;
      group
        ?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')
        ?.focus({ preventScroll: true });
      group?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // A partir de aqui manda el servidor: si responde 422, sus mensajes se
    // reparten por grupo y refresh() los mantiene desde entonces.
    revealed = true;
    void addToCart(form);
  });

  refresh();
}

for (const form of document.querySelectorAll<HTMLFormElement>('[data-order-form]')) {
  initOrderForm(form);
}
