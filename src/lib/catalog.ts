// ---------------------------------------------------------------------------
// APIs 1 y 2 — Catalogo y detalle del platillo.
//
//   GET /api/products         -> listado de la portada
//   GET /api/products/{slug}  -> ficha con variantes y personalizaciones
//
// El backend llama Menu a esta entidad y el front la llama Product: es solo
// vocabulario, la misma fila de `menus` en los dos lados.
//
// DOS IDENTIFICADORES CON DOS TRABAJOS
//
//   slug  RUTEA. La URL de la tienda —`/mamayaya/{slug}`— y la ruta de la ficha en la
//         API. Lo escribe el administrador, asi que PUEDE CAMBIAR: si lo hace,
//         el enlace anterior responde 404 y no hay redireccion.
//   id    COMPRA. Es el `productId` que viaja a POST /api/cart/items, y nunca
//         cambia.
//
// De ahi la regla del contrato: el slug es para la barra de direcciones y el id
// para el estado que tiene que sobrevivir a un cambio de enlace. Ninguno
// sustituye al otro —pedir la ficha por id responde 404 desde el 2026-08-10—,
// asi que aqui no hay respaldo de uno por el otro en ningun sentido.
// ---------------------------------------------------------------------------

import { ApiError, apiGet, assetUrl } from './api.ts';
import { formatPrice } from './price.ts';
import type { OptionControl } from './options.ts';

export interface ProductImage {
  url: string;
  alt: string;
}

/** Por que un platillo publicado no se puede comprar ahora mismo. */
export type UnavailableReason = 'no_price' | 'out_of_schedule';

// ---------------------------------------------------------------------------
// Promociones
//
// La API entrega los importes YA RESUELTOS. `value` es el numero crudo que
// configuro el administrador y viaja solo para componer etiquetas: no sirve
// para calcular, porque en `special` significa el precio final y no el ahorro.
// Aqui no se calcula ningun descuento; se decide que se pinta y ya.
// ---------------------------------------------------------------------------

export interface PromotionDiscount {
  kind: 'percentage' | 'fixed' | 'special';
  /** Crudo, SOLO para etiquetas propias. Nunca para calcular. */
  value: number;
  /** La variante de referencia: la mas barata, la misma de `basePrice`. */
  variantId: string;
  /** Precio de lista de esa variante. Es lo que se pinta tachado. */
  originalPrice: number;
  finalPrice: number;
  savings: number;
  /** Cuantas variantes bajan de precio, de cuantas tiene el platillo. */
  variantsAffected: number;
  variantsTotal: number;
}

export interface PromotionBuyGet {
  /** Tamano del grupo. */
  buy: number;
  /** Unidades que se cobran. */
  get: number;
  /** buy - get. */
  free: number;
}

export interface Promotion {
  id: string;
  name: string;
  type: 'discount' | 'buy_get';
  /** `own` = del platillo · `category` = heredada de su categoria. */
  source: 'own' | 'category';
  /** "15%" · "$50" · "2x1". Ya compuesta por el backend. */
  label: string;
  /** null cuando type === 'buy_get'. */
  discount: PromotionDiscount | null;
  /** null cuando type === 'discount'. */
  buyGet: PromotionBuyGet | null;
}

export interface ProductListItem {
  /** menus.id — la llave estable, la que viaja al carrito. Nunca cambia. */
  id: string;
  /**
   * menus.slug — como se nombra el platillo en la URL: `/mamayaya/{slug}`. Obligatorio
   * (`NOT NULL` y `UNIQUE`), asi que no hay tarjeta sin enlace. Ver productHref().
   */
  slug: string;
  name: string;
  /** Cadena vacia cuando el platillo no tiene descripcion. */
  description: string;
  /** Nombre de la categoria. De aqui salen los chips de filtro. */
  category: string;
  /** Precio "desde" (el minimo de sus variantes), en MXN. */
  basePrice: number;
  image: ProductImage;
  /** false = visible pero no comprable ahora: tarjeta atenuada, sin boton. */
  available: boolean;
  unavailableReason: UnavailableReason | null;
  /**
   * null tiene CUATRO motivos indistinguibles a proposito: no hay promocion,
   * esta desactivada, esta fuera de vigencia, o no baja el precio de ninguna
   * variante. Por eso la tarjeta se resuelve con un `if` y nunca puede tachar
   * un precio por encima de otro mayor.
   */
  promotion: Promotion | null;
}

/** Chip que no filtra nada. Lo pone la interfaz, no viene del catalogo. */
export const ALL_CATEGORIES = 'Todos';

/**
 * Catalogo completo publicado. Sin paginacion por diseno: cabe en una
 * respuesta y el filtrado por categoria se hace en cliente sobre esta lista.
 */
export function getProducts(): Promise<ProductListItem[]> {
  return apiGet<ProductListItem[]>('/api/products');
}

/**
 * Categorias del propio payload, en el orden en que llegan (la API ya ordena
 * por posicion de categoria y de platillo).
 *
 * Derivarlas de la lista y no de una constante escrita a mano es requisito del
 * contrato: `category` es un nombre, sensible a renombres desde el panel. De
 * paso garantiza que ningun chip pueda dejar la rejilla vacia.
 */
export function getCategories(items: ProductListItem[]): string[] {
  return [ALL_CATEGORIES, ...new Set(items.map((item) => item.category))];
}

/**
 * Ruta del detalle. Cuelga de `/mamayaya` —`/mamayaya/{slug}`—, asi que compite con las
 * pantallas del pedido (`/mamayaya/carrito`, `/mamayaya/datos`, `/mamayaya/pago`...): en Astro las rutas
 * estaticas ganan a `[slug]`, y por eso un platillo no puede tapar ninguna.
 *
 * Solo el slug: el id no es respaldo de nada aqui, porque `/mamayaya/{id}` no resuelve
 * ninguna ficha —ni en esta ruta ni en la de la API—.
 */
export function productHref(item: Pick<ProductListItem, 'slug'>): string {
  return `/mamayaya/${encodeURIComponent(item.slug)}`;
}

/** URL lista para el `src`, con el placeholder ya resuelto. */
export function productImageSrc(item: { image: ProductImage }): string {
  return assetUrl(item.image.url);
}

// ---------------------------------------------------------------------------
// API 2 — Detalle
// ---------------------------------------------------------------------------

/** Variante de precio: menu_prices. `name` es '' en platillos de precio unico. */
export interface Variant {
  id: string;
  name: string;
  /** Precio de LISTA de la variante, en MXN. No cambia con la promocion. */
  price: number;
  /**
   * Precio con la promocion aplicada. null = esta variante NO baja de precio, y
   * entonces no se tacha nada: un precio especial puede alcanzar a unas
   * variantes y a otras no, y en "compra y lleva" llegan todas en null porque
   * la oferta se resuelve por unidades en el carrito.
   */
  finalPrice: number | null;
  savings: number | null;
}

/** Lo que cuesta de verdad la variante: el descontado si lo hay. */
export function variantPrice(variant: Variant | undefined): number | undefined {
  if (!variant) return undefined;
  return variant.finalPrice ?? variant.price;
}

export interface CustomizationOption {
  id: string;
  label: string;
  /** Sobrecoste por unidad, en MXN. Se SUMA al precio de la variante. */
  price: number;
}

export interface Customization {
  id: string;
  name: string;
  /** Lo deriva el servidor con la misma regla que el simulador del panel. */
  control: OptionControl;
  required: boolean;
  /**
   * Opciones DISTINTAS minimas y maximas, no unidades. Significan lo mismo en
   * los tres controles, `quantity` incluido: alli una opcion cuenta como
   * elegida cuando su contador es >= 1.
   */
  min: number;
  max: number | null;
  /**
   * UNIDADES maximas de una misma opcion, 1..99. Solo tiene valor en el control
   * `quantity`, el unico donde una opcion puede valer mas de 1; null significa
   * sin tope de negocio. Es la OTRA magnitud, no el espejo de `max`: en un
   * grupo de cantidad los dos pueden venir con valor y se aplican los dos.
   */
  maxPerOption: number | null;
  defaultOptionId: string | null;
  options: CustomizationOption[];
}

export interface ProductDetail {
  /** menus.id — la llave estable, la que va al carrito. */
  id: string;
  /**
   * menus.slug, en su forma CANONICA: la ficha se pidio por enlace y este es el
   * enlace con el que la tienda la guarda.
   */
  slug: string;
  name: string;
  description: string;
  category: string;
  image: ProductImage;
  available: boolean;
  unavailableReason: UnavailableReason | null;
  basePrice: number;
  hasVariants: boolean;
  defaultVariantId: string | null;
  variants: Variant[];
  customizations: Customization[];
  /** La misma forma que en el listado. Aqui rotula el bloque de la ficha. */
  promotion: Promotion | null;
}

/**
 * La ruta de la ficha en la API. Es el mismo slug de la URL de la tienda y va en
 * la propia ruta del recurso, asi que lo que se lee de `Astro.params` se pasa sin
 * traducir. Unico sitio del front que compone esta ruta.
 */
function productPath(slug: string): string {
  return `/api/products/${encodeURIComponent(slug)}`;
}

/**
 * Ficha del platillo por su enlace. `slug` es lo que venia en `/mamayaya/{slug}`.
 *
 * Devuelve null cuando la API responde 404, que son cuatro casos indistinguibles
 * a proposito: el enlace no existe, el administrador lo reescribio —el anterior
 * no redirige—, el platillo esta despublicado, o no tiene categoria.
 */
export async function getProduct(slug: string): Promise<ProductDetail | null> {
  try {
    return await apiGet<ProductDetail>(productPath(slug));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Vista de la ficha
// ---------------------------------------------------------------------------

export interface OptionChoiceView {
  id: string;
  label: string;
  price: number;
  /**
   * Solo en variantes con descuento: el precio que se cobra. El de arriba pasa
   * a ser el tachado. En las personalizaciones es siempre null, porque la
   * promocion no las toca —su precio es el incremento integro.
   */
  finalPrice: number | null;
  checked: boolean;
}

/**
 * Forma unica que consume <OptionGroup>. Normaliza dos cosas distintas —las
 * variantes de precio y las personalizaciones— porque en pantalla son el mismo
 * bloque: encabezado, etiqueta de obligatoriedad y lista de opciones.
 */
export interface OptionGroupView {
  id: string;
  /** Atributo `name` de los inputs del grupo. */
  name: string;
  label: string;
  control: OptionControl;
  required: boolean;
  min: number;
  max: number | null;
  maxPerOption: number | null;
  /**
   * `variant`: el precio ES el precio del platillo, sustituye a los demas.
   * `option`:  el precio es un sobrecoste que se suma.
   *
   * Es la distincion que el modelo anterior no hacia —los radios llevaban
   * precio absoluto y los checkbox incremento en el mismo atributo— y que
   * rompia el total en cuanto habia mas de un grupo de eleccion unica.
   */
  kind: 'variant' | 'option';
  choices: OptionChoiceView[];
}

/**
 * Etiqueta del grupo de variantes. La API no manda un nombre para el bloque
 * (las variantes son filas de menu_prices, no una personalizacion), asi que la
 * copia vive aqui.
 */
const VARIANTS_LABEL = 'Elige una opcion';

/**
 * Nombre de respaldo de una variante sin nombre. Solo puede darse con
 * `hasVariants: false`, donde no se dibuja el selector, pero el respaldo evita
 * una fila sin etiqueta si la regla del backend cambiara.
 */
export const VARIANT_FALLBACK_LABEL = 'Variante';

export function toOptionGroups(product: ProductDetail): OptionGroupView[] {
  const groups: OptionGroupView[] = [];

  // Con hasVariants: false hay exactamente una variante sin nombre. No se
  // dibuja el selector, pero su id sigue viajando al carrito: lo lleva un
  // campo oculto que pone la pagina.
  if (product.hasVariants) {
    groups.push({
      id: 'variant',
      name: 'variant',
      label: VARIANTS_LABEL,
      control: 'radio',
      required: true,
      min: 1,
      max: 1,
      // Las variantes no son una personalizacion: no hay unidades que acotar.
      maxPerOption: null,
      kind: 'variant',
      choices: product.variants.map((variant, index) => ({
        id: variant.id,
        label: variant.name,
        price: variant.price,
        finalPrice: variant.finalPrice,
        // defaultVariantId es la primera variante, como el simulador. El
        // index === 0 cubre el caso de que llegue null.
        checked: product.defaultVariantId ? variant.id === product.defaultVariantId : index === 0,
      })),
    });
  }

  for (const customization of product.customizations) {
    groups.push({
      id: customization.id,
      name: `customization-${customization.id}`,
      label: customization.name,
      control: customization.control,
      required: customization.required,
      min: customization.min,
      max: customization.max,
      maxPerOption: customization.maxPerOption,
      kind: 'option',
      choices: customization.options.map((option) => ({
        id: option.id,
        label: option.label,
        price: option.price,
        // Las personalizaciones se cobran integras, con promocion o sin ella.
        finalPrice: null,
        // Solo los grupos radio traen preseleccion; en los demas es null.
        checked: option.id === customization.defaultOptionId,
      })),
    });
  }

  return groups;
}

/** Variante marcada al abrir la ficha. De ella sale el total inicial. */
export function defaultVariant(product: ProductDetail): Variant | undefined {
  return (
    product.variants.find((variant) => variant.id === product.defaultVariantId) ??
    product.variants[0]
  );
}

/**
 * Total inicial: variante por defecto + las opciones preseleccionadas.
 *
 * La variante entra ya descontada. Si entrara por su precio de lista, el boton
 * prometeria un importe y el carrito cobraria otro —que es exactamente la
 * asimetria que las promociones en el catalogo vienen a cerrar—.
 */
export function initialTotal(product: ProductDetail): number {
  const preselected = product.customizations.reduce((sum, customization) => {
    const option = customization.options.find((it) => it.id === customization.defaultOptionId);
    return sum + (option?.price ?? 0);
  }, 0);

  return (variantPrice(defaultVariant(product)) ?? product.basePrice) + preselected;
}

// ---------------------------------------------------------------------------
// La promocion, resuelta para pintarla
// ---------------------------------------------------------------------------

export interface PromotionView {
  /** "15%" · "$50" · "2x1". La etiqueta corta de la tarjeta. */
  label: string;
  /**
   * La misma etiqueta, escrita entera: "Descuento de 15%", "Lleva 2 y paga 1".
   * La ficha tiene ancho de sobra y es la unica insignia de la pantalla, asi
   * que ahi el atajo de la rejilla no hace falta.
   */
  detailLabel: string;
  name: string;
  /** Precio de lista a TACHAR. null = no se tacha nada. */
  original: number | null;
  /** Lo que se paga hoy por la variante de referencia. */
  price: number;
  /** Ahorro a rotular. 0 = no hay etiqueta de ahorro. */
  savings: number;
  /**
   * Aclaracion bajo el precio para el descuento que no alcanza a todas las
   * variantes, o null cuando no hace falta ninguna.
   */
  note: string | null;
}

const plural = (count: number, one: string, many: string) => (count === 1 ? one : many);

/**
 * El rotulo largo de cada tipo. `value` es el numero crudo del panel y este es
 * justo el uso para el que viaja: componer etiquetas. Nunca para calcular.
 *
 * `special` se rotula aparte porque no descuenta nada: FIJA el precio. Llamarlo
 * "Descuento de $150" en un platillo de $189 diria que se restan $150.
 */
const DISCOUNT_LABEL: Record<PromotionDiscount['kind'], (value: number) => string> = {
  percentage: (value) => `Descuento de ${value}%`,
  fixed: (value) => `Descuento de ${formatPrice(value)}`,
  special: (value) => `Precio especial de ${formatPrice(value)}`,
};

/**
 * Decide QUE se pinta a partir del bloque que manda la API. No calcula ningun
 * importe: los tres —original, final y ahorro— llegan resueltos.
 *
 * Los tres casos que tiene que separar:
 *
 *   buy_get   el precio unitario no cambia. Ni tachado, ni ahorro, ni nota: la
 *             insignia —"2x1"— es todo lo que se pinta, y el "Lleva N y paga M"
 *             se queda como rotulo largo de la ficha. El descuento aparece en el
 *             carrito, cuando hay unidades para formar grupo.
 *   descuento con ahorro en la variante de referencia -> tachado + final + ahorro.
 *   descuento SIN ahorro en ella: es el `special` degenerado, que baja unas
 *             variantes y no la mas barata. Llega con savings 0 y se rotula por
 *             cuantas alcanza, en vez de tachar un precio que no baja.
 */
export function promotionView(item: {
  basePrice: number;
  promotion: Promotion | null;
}): PromotionView | null {
  const promotion = item.promotion;
  if (!promotion) return null;

  const { buyGet, discount } = promotion;

  if (promotion.type === 'buy_get' || !discount) {
    const offer = buyGet ? `Lleva ${buyGet.buy} y paga ${buyGet.get}` : null;

    return {
      label: promotion.label,
      detailLabel: offer ?? promotion.label,
      name: promotion.name,
      original: null,
      price: item.basePrice,
      savings: 0,
      // El "Lleva 2 y paga 1" no baja al pie de la tarjeta: la insignia ya dice
      // "2x1" en la misma tarjeta, y repetirlo debajo del precio ocupaba la
      // linea del ahorro para decir por segunda vez lo mismo.
      note: null,
    };
  }

  const detailLabel = DISCOUNT_LABEL[discount.kind](discount.value);

  const partial =
    discount.variantsTotal > 1 && discount.variantsAffected < discount.variantsTotal
      ? `Precio especial en ${discount.variantsAffected} de ${discount.variantsTotal} ${plural(discount.variantsTotal, 'tamano', 'tamanos')}`
      : null;

  if (discount.savings <= 0) {
    return {
      label: promotion.label,
      detailLabel,
      name: promotion.name,
      original: null,
      price: item.basePrice,
      savings: 0,
      note: partial,
    };
  }

  return {
    label: promotion.label,
    detailLabel,
    name: promotion.name,
    original: discount.originalPrice,
    price: discount.finalPrice,
    savings: discount.savings,
    note: partial,
  };
}
