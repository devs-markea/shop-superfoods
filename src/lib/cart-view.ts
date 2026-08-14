// ---------------------------------------------------------------------------
// La VISTA del carrito: `lines`.
//
// El carrito publica dos planos del mismo pedido:
//
//   items   el ESTADO. Una fila de cart_items, con el id que reciben PATCH y
//           DELETE. Es lo unico que se puede mutar.
//   lines   la PRESENTACION. Lo que se pinta, ya agrupado y resuelto por el
//           servidor, incluidos los grupos de "compra y lleva".
//
// Se pinta `lines` y solo `lines`, ramificando por `kind` y nunca por la
// presencia de `promotion`: una linea normal tambien puede traerla —con
// descuento, o con un 2x1 al que le faltan unidades—.
//
// POR QUE ESTE MODULO DIBUJA HTML EN LUGAR DE HABER UN COMPONENTE .astro
//
// Un grupo se forma con TODAS las unidades del mismo platillo del carrito, asi
// que cualquier cambio de cantidad puede rehacer los grupos y reordenar la
// lista entera: no vale parchear la linea tocada. Como el repintado ocurre en
// el navegador y un componente .astro no se puede invocar desde un <script>,
// la alternativa era escribir el mismo marcado dos veces —una servida y otra de
// cliente— y verlas divergir. Aqui hay una sola: la pagina la usa con set:html
// para el primer render y el script la reutiliza en cada respuesta de la API.
//
// Isomorfico a proposito: no importa nada de `astro:env`. Por eso las URL de
// imagen entran resueltas (`resolveImage`) en vez de resolverse aqui.
// ---------------------------------------------------------------------------

import { formatPrice } from './price';
import { iconHtml } from './icons';

export interface CartOption {
  /** null en lineas antiguas sin id en el snapshot. */
  optionId: string | null;
  label: string;
  /** Nombre de la personalizacion a la que pertenece la opcion. */
  group: string;
  price: number;
  /** 1 en radio y checkbox; n en el control de cantidad. */
  quantity: number;
}

export interface CartPromotion {
  id: string;
  name: string;
  type: 'percentage' | 'fixed' | 'special' | 'buy_get';
  source: 'own' | 'category';
  /** "15%" · "$50" · "2x1". */
  label: string;
}

/** Lo que le falta a un "compra y lleva" para cerrar el siguiente grupo. */
export interface PromoHint {
  type: 'buy_get';
  label: string;
  missing: number;
}

export interface CartItemLine {
  kind: 'item';
  /** cart_items.id — el que viaja en PATCH y DELETE. */
  itemId: string;
  /** menus.id — identifica el platillo en el carrito, no enlaza a su pagina. */
  productId: string;
  /**
   * menus.slug — con el se enlaza a `/{slug}`. null cuando el platillo se
   * elimino del catalogo: la linea conserva su snapshot pero ya no hay pagina
   * que abrir. Ver titleHtml().
   */
  productSlug: string | null;
  name: string;
  image: { url: string; alt: string };
  variantId: string | null;
  variantName: string | null;
  options: CartOption[];
  /** Unidades de esta fila que NO entraron en ningun grupo. */
  quantity: number;
  unitPrice: number;
  /** unitPrice x quantity: el importe TACHADO. */
  originalTotal: number;
  discount: number;
  total: number;
  promotion: CartPromotion | null;
  promoHint: PromoHint | null;
}

export interface CartPromoUnit {
  /** La fila de la que sale esta unidad. */
  itemId: string;
  variantId: string | null;
  variantName: string | null;
  options: CartOption[];
  unitPrice: number;
  /** Las regaladas del grupo. Son gratis ENTERAS, personalizaciones incluidas. */
  isFree: boolean;
}

export interface CartPromoGroupLine {
  kind: 'promoGroup';
  productId: string;
  /** Idem `CartItemLine.productSlug`. */
  productSlug: string | null;
  name: string;
  image: { url: string; alt: string };
  /** Nunca null: sin promocion no hay grupo. */
  promotion: CartPromotion;
  units: CartPromoUnit[];
  originalTotal: number;
  discount: number;
  total: number;
}

export type CartLine = CartItemLine | CartPromoGroupLine;

/** Lo que hace falta para pintar: la presentacion y la cantidad real de cada fila. */
export interface CartLinesView {
  lines: CartLine[];
  items: Array<{ id: string; quantity: number }>;
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Todo lo que venga de la API pasa por aqui: son nombres que escribe otra persona. */
function escape(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

/** El separador de siempre: el del pedido y el de las unidades de un grupo. */
const SEPARATOR = ' · ';

/**
 * Resumen legible de una configuracion: "Grande · Guacamole x2". Es lo que
 * distingue dos lineas del mismo platillo, y dentro de un grupo, una unidad de
 * otra.
 *
 * El separador se puede cambiar porque el detalle de las pantallas de cierre lo
 * pide con guiones ("Grande - Guacamole x2"), no con puntos. Lo que no cambia es
 * como se nombra una opcion repetida ("Guacamole x2"): esa regla se escribe una
 * vez, aqui, y por eso el detalle no se monta su propia cadena.
 */
export function describeSelection(
  selection: {
    variantName: string | null;
    options: CartOption[];
  },
  separator: string = SEPARATOR,
): string {
  const options = describeOptions(selection.options, separator);

  if (!selection.variantName) return options;

  return options ? `${selection.variantName}${separator}${options}` : selection.variantName;
}

/** Solo las personalizaciones: "Guacamole x2 · Queso". Vacio si no hay. */
export function describeOptions(options: CartOption[], separator: string = SEPARATOR): string {
  return options
    .map((option) => (option.quantity > 1 ? `${option.label} x${option.quantity}` : option.label))
    .join(separator);
}

/**
 * El nombre accesible del chip del pedido de la barra de desktop: lo que lee un
 * lector de pantalla donde la vista ve un importe y una cifra colgada del icono.
 *
 * Vive aqui —y no en el componente— porque lo escriben dos sitios: la barra al
 * pintarse y el carrito al cambiar una cantidad, que la actualiza sin recargar.
 * Es la misma regla que shippingLabel() en src/lib/shipping.ts.
 */
export function cartChipLabel(total: number, count: number): string {
  if (count <= 0) return 'Mi pedido, vacio';

  return `Mi pedido: ${count} ${count === 1 ? 'articulo' : 'articulos'}, ${formatPrice(total)}`;
}

/**
 * El nombre del platillo, enlazado a su ficha cuando todavia hay ficha.
 *
 * La ficha se pide por ENLACE —`/{slug}`—, y el id no es respaldo: `/{productId}`
 * no resuelve ninguna pagina. Por eso `productSlug: null` —el platillo salio del
 * catalogo— deja el nombre en texto plano en vez de enlazar a un 404. La linea
 * sigue siendo editable: el carrito la identifica por `productId`, que no se va.
 *
 * Misma regla que productHref() del catalogo, escrita aqui porque este modulo es
 * isomorfico y no importa nada del cliente HTTP.
 */
function titleHtml(line: { productSlug: string | null; name: string }): string {
  const name = escape(line.name);
  if (!line.productSlug) return name;

  return `<a class="text-reset" href="/${encodeURIComponent(line.productSlug)}">${name}</a>`;
}

/**
 * La misma regla que assetUrl() del cliente HTTP: la foto llega absoluta salvo
 * el placeholder de los platillos sin foto, que es una ruta del Laravel. Aqui
 * se recibe la base en lugar de leerla de astro:env, para que el repintado del
 * navegador resuelva igual que el marcado servido.
 */
export function imageResolver(base: string): (url: string) => string {
  const host = base.replace(/\/+$/, '');
  return (url) => (url.startsWith('/') ? `${host}${url}` : url);
}

// ---------------------------------------------------------------------------
// Marcado
// ---------------------------------------------------------------------------

/** Espejo de <QuantityStepper>: mismo bloque, dibujado desde JS. */
function stepperHtml(quantity: number, itemName: string, canDecrease: boolean): string {
  const name = escape(itemName);

  return `<div class="stepper" data-stepper>
  <button class="stepper__button stepper__button--minus btn-plain" type="button" aria-label="Quitar una unidad de ${name}" data-step="-1"${canDecrease ? '' : ' disabled'}><span class="stepper__minus"></span></button>
  <span class="stepper__value" aria-live="polite" data-quantity>${quantity}</span>
  <button class="stepper__button stepper__button--plus btn-plain" type="button" aria-label="Agregar una unidad de ${name}" data-step="1">${iconHtml('plus', 'sm')}</button>
</div>`;
}

/**
 * Los controles de una linea del pedido: papelera, el par de precios y el
 * contador. Siempre operan sobre una FILA de cart_items, que es lo unico que el
 * PATCH sabe cambiar, y por eso los tres numeros pueden no coincidir:
 *
 *   rowQuantity     la cantidad real de la fila, y la base sobre la que suma el
 *                   contador. Es la trampa que hay que evitar: subir "1" en una
 *                   linea que muestra 1 pero cuya fila lleva 3 unidades bajaria
 *                   el pedido en vez de subirlo. El script suma sobre
 *                   data-row-quantity, nunca sobre lo que se ve.
 *   removeQuantity  lo que se lleva la papelera. Toda la fila cuando es entera
 *                   de esta linea; solo las unidades sueltas cuando el resto ya
 *                   esta en una promocion.
 *   display         el numero que se ve. En un grupo de "compra y lleva" son
 *                   las unidades del grupo, no las de la fila que edita.
 */
function controlsHtml(options: {
  itemId: string;
  /** Para las etiquetas del contador: el platillo, no la configuracion. */
  name: string;
  rowQuantity: number;
  removeQuantity: number;
  display: number;
  canDecrease: boolean;
  /** Lo que se lleva la papelera, para su etiqueta de accesibilidad. */
  removeLabel: string;
  /** El par de precios, que comparte fila con la papelera. Vacio sin descuento. */
  pricing?: string;
}): string {
  const {
    itemId,
    name,
    rowQuantity,
    removeQuantity,
    display,
    canDecrease,
    removeLabel,
    pricing = '',
  } = options;

  return `<div class="order-item__actions" data-row data-line-id="${escape(itemId)}" data-row-quantity="${rowQuantity}" data-line-quantity="${removeQuantity}">
  <button class="order-item__remove btn-plain" type="button" aria-label="Quitar ${escape(removeLabel)} del pedido" data-remove-line>${iconHtml('trash', 'sm')}</button>
  ${pricing}
  ${stepperHtml(display, name, canDecrease)}
</div>`;
}

function mediaHtml(image: { url: string; alt: string }, resolveImage: (url: string) => string): string {
  return `<div class="order-item__media">
  <img class="order-item__image" src="${escape(resolveImage(image.url))}" width="70" height="70" alt="${escape(image.alt)}" loading="lazy" decoding="async">
</div>`;
}

/**
 * La insignia, junto al nombre. Sin el nombre de la promocion al lado: la
 * etiqueta ya dice lo que descuenta, y repetirlo en dorado debajo era decir dos
 * veces lo mismo en una linea de 70 de alto. El nombre sigue en el `title`.
 */
function badgeHtml(promotion: CartPromotion): string {
  return `<span class="promo-badge order-item__badge" title="${escape(promotion.name)}">${iconHtml('tag', 'sm')}<span class="promo-badge__label">${escape(promotion.label)}</span></span>`;
}

/**
 * El par original + final, abajo y junto a la papelera, que es espacio que
 * estaba vacio. Solo con descuento: sin el, el final seria el unico importe y ya
 * esta arriba a la derecha, asi que no habria nada que comparar.
 */
function pricingHtml(originalTotal: number, total: number, discount: number): string {
  if (discount <= 0 || originalTotal <= total) return '';

  return `<span class="order-item__pricing"><s class="price-was">${formatPrice(originalTotal)}</s><span class="order-item__pricing-final">${formatPrice(total)}</span></span>`;
}

function itemLineHtml(
  line: CartItemLine,
  rowQuantity: number,
  resolveImage: (url: string) => string,
): string {
  const selection = describeSelection(line);

  // La fila aporta unidades a un grupo ademas de a esta linea. Sin decirlo, el
  // comprador ve una hamburguesa suelta a $120 y otras dos arriba en el grupo
  // sin entender que son la misma configuracion.
  const split = rowQuantity > line.quantity;

  // El aviso de promocion incompleta es lo que evita que un 2x1 a medias
  // parezca roto: la linea trae su promocion y descuento 0 hasta que hay
  // unidades para cerrar grupo.
  const hint = line.promoHint;

  const notes: Array<{ text: string; muted: boolean }> = [];

  if (hint) {
    notes.push({
      text: `Agrega ${hint.missing} ${hint.missing === 1 ? 'unidad' : 'unidades'} mas y aprovecha el ${hint.label}`,
      muted: false,
    });
  }

  if (split) {
    notes.push({
      text: 'Las demas unidades de esta configuracion ya estan en la promocion.',
      muted: true,
    });
  }

  return `<li class="order-item">
  ${mediaHtml(line.image, resolveImage)}
  <div class="order-item__body">
    <div class="order-item__head">
      <div class="order-item__info">
        <h2 class="order-item__title">${titleHtml(line)}${line.promotion ? badgeHtml(line.promotion) : ''}</h2>
        ${selection ? `<p class="order-item__custom">${escape(selection)}</p>` : ''}
      </div>
      <span class="order-item__price">${formatPrice(line.total)}</span>
    </div>
    ${notes.map((note) => `<p class="order-item__hint${note.muted ? ' order-item__hint--muted' : ''}">${escape(note.text)}</p>`).join('')}
    ${controlsHtml({
      itemId: line.itemId,
      name: line.name,
      rowQuantity,
      removeQuantity: line.quantity,
      display: line.quantity,
      canDecrease: line.quantity > 1,
      removeLabel: line.name,
      pricing: pricingHtml(line.originalTotal, line.total, line.discount),
    })}
  </div>
</li>`;
}

/**
 * Una unidad del grupo, nombrada como el platillo que es.
 *
 * Antes decia "Doble" a secas —y "Unidad" cuando no habia ni variante—, que no
 * dice nada de lo que se lleva. Ahora la primera linea es el platillo con su
 * variante ("Hamburguesa - Doble") y las personalizaciones van debajo, que es
 * como se leen en el resto del pedido.
 */
function unitHtml(unit: CartPromoUnit, productName: string): string {
  const title = unit.variantName ? `${productName} - ${unit.variantName}` : productName;
  const options = describeOptions(unit.options);

  // "GRATIS" a secas, sin importes debajo: la unidad regalada lo es entera,
  // personalizaciones incluidas, asi que no hay ningun resto que cobrar.
  const amount = unit.isFree
    ? '<span class="promo-unit__free">GRATIS</span>'
    : `<span class="promo-unit__price">${formatPrice(unit.unitPrice)}</span>`;

  return `<li class="promo-unit${unit.isFree ? ' promo-unit--free' : ''}">
  <span class="promo-unit__info">
    <span class="promo-unit__label">${escape(title)}</span>
    ${options ? `<span class="promo-unit__options">${escape(options)}</span>` : ''}
  </span>
  ${amount}
</li>`;
}

/**
 * La fila que editan el contador y la papelera del grupo: la ULTIMA que entro
 * al carrito de todas las que le aportan unidades.
 *
 * El orden lo da `items` —la API lo devuelve en orden de entrada—, no `units`,
 * que lo ordena el motor de la promocion para decidir cual sale gratis.
 */
function lastRow(
  units: CartPromoUnit[],
  rows: Map<string, { quantity: number; index: number }>,
): { itemId: string; quantity: number; unit: CartPromoUnit } | null {
  let last: { itemId: string; quantity: number; unit: CartPromoUnit; index: number } | null = null;

  for (const unit of units) {
    const row = rows.get(unit.itemId);
    // Sin fila en `items` no hay nada que editar; se queda detras de cualquier
    // otra en vez de sacar al grupo de contador.
    const index = row?.index ?? -1;

    if (last && index < last.index) continue;

    last = { itemId: unit.itemId, quantity: row?.quantity ?? 1, unit, index };
  }

  return last;
}

function groupLineHtml(
  line: CartPromoGroupLine,
  context: {
    rows: Map<string, { quantity: number; index: number }>;
    resolveImage: (url: string) => string;
  },
): string {
  const units = line.units.map((unit) => unitHtml(unit, line.name)).join('');
  const count = line.units.length;

  // UN solo control para todo el grupo, y FUERA del acordeon: papelera, par de
  // precios y contador en el mismo renglon, exactamente como una linea con
  // descuento. Son tres tarjetas —normal, con descuento y grupo— y esta es la
  // unica que se salia: un control por fila obligaba a etiquetar cada uno para
  // decir cual editaba, y a subir el par de precios junto al nombre.
  //
  // Todo apunta a la ultima fila que entro, que es por donde el pedido crecio:
  // "+" y "−" mueven esa, y la papelera la borra entera. El PATCH no sabe hacer
  // otra cosa —opera sobre una fila de cart_items, no existe "quitar una unidad
  // del grupo"—, y con varias configuraciones dentro (un 2x1 que junta una
  // Sencilla y una Doble son dos filas) el desglose del acordeon es el que dice
  // que hay en el grupo.
  const target = lastRow(line.units, context.rows);

  const targetLabel = target ? describeSelection(target.unit) : '';

  const controls = target
    ? controlsHtml({
        itemId: target.itemId,
        name: line.name,
        rowQuantity: target.quantity,
        // La papelera se lleva la fila entera: es "quitar lo ultimo que entro",
        // no "quitar una unidad", que ya lo hace el "−".
        removeQuantity: target.quantity,
        // El contador ensena las unidades del GRUPO, que es lo que el comprador
        // se lleva; la fila que edita puede aportar solo una parte.
        display: count,
        // Un grupo lleva dos unidades o mas, asi que "−" siempre tiene algo que
        // quitar. Si la fila se queda en cero la API la borra y el grupo se
        // deshace en una linea normal, que es justo lo que se acaba de pedir.
        canDecrease: true,
        removeLabel: targetLabel ? `${line.name} - ${targetLabel}` : line.name,
        pricing: pricingHtml(line.originalTotal, line.total, line.discount),
      })
    : '';

  return `<li class="order-item order-item--promo">
  ${mediaHtml(line.image, context.resolveImage)}
  <div class="order-item__body">
    <div class="order-item__head">
      <div class="order-item__info">
        <h2 class="order-item__title">${titleHtml(line)}${badgeHtml(line.promotion)}</h2>
      </div>
      <span class="order-item__price">${formatPrice(line.total)}</span>
    </div>

    <details class="promo-group">
      <summary class="promo-group__summary">Ver las ${count} unidades</summary>
      <ul class="promo-group__units list-unstyled">${units}</ul>
    </details>

    ${controls}
  </div>
</li>`;
}

/**
 * La lista completa. Se repinta entera en cada cambio porque al anadir o quitar
 * unidades los grupos se rehacen: no hay linea estable que actualizar.
 */
export function renderLines(view: CartLinesView, resolveImage: (url: string) => string): string {
  // De cada fila hacen falta dos cosas: la cantidad real —la base del PATCH— y
  // el orden de entrada, que es lo que elige la fila que edita un grupo.
  const rows = new Map(
    view.items.map((item, index) => [item.id, { quantity: item.quantity, index }]),
  );

  return view.lines
    .map((line) =>
      line.kind === 'promoGroup'
        ? groupLineHtml(line, { rows, resolveImage })
        : itemLineHtml(line, rows.get(line.itemId)?.quantity ?? line.quantity, resolveImage),
    )
    .join('');
}
