// ---------------------------------------------------------------------------
// APIs 1 y 2 — Catalogo y detalle del platillo.
//
//   GET /api/products        -> listado de la portada
//   GET /api/products/{id}   -> ficha con variantes y personalizaciones
//
// El backend llama Menu a esta entidad y el front la llama Product: es solo
// vocabulario, la llave es `menus.id` en los dos lados.
//
// Identificador: v1 enruta por id porque la columna slug no existe todavia.
// Todo lo que construye URLs pasa por productHref(), y todo lo que lee la URL
// pasa el parametro tal cual a la API. El dia que el backend acepte slug
// —§12 del contrato dice que lo aceptara ADEMAS del id, en la misma ruta— basta
// con que el payload traiga `slug` para que las URLs cambien solas.
// ---------------------------------------------------------------------------

import { ApiError, apiGet, assetUrl } from './api.ts';
import type { OptionControl } from './options.ts';

export interface ProductImage {
  url: string;
  alt: string;
}

/** Por que un platillo publicado no se puede comprar ahora mismo. */
export type UnavailableReason = 'no_price' | 'out_of_schedule';

export interface ProductListItem {
  /** menus.id — llave estable: enruta al detalle y viaja al carrito. */
  id: string;
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
   * v1 no lo manda: la columna no existe todavia en el backend. Declarado
   * opcional para que el dia que la API lo incluya las URLs pasen a usarlo sin
   * tocar el marcado.
   */
  slug?: string;
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

/** Ruta del detalle. Por slug cuando la API lo mande; hoy, por id. */
export function productHref(item: Pick<ProductListItem, 'id' | 'slug'>): string {
  return `/producto/${item.slug ?? item.id}`;
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
  /** Precio absoluto de la variante, en MXN. */
  price: number;
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
  id: string;
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
  slug?: string;
}

/**
 * Ficha del platillo. `handle` es lo que venga en la URL: hoy siempre un id,
 * manana puede ser un slug sin que este codigo cambie.
 *
 * Devuelve null cuando la API responde 404 — inexistente, despublicado o sin
 * categoria, que desde fuera son indistinguibles a proposito.
 */
export async function getProduct(handle: string): Promise<ProductDetail | null> {
  try {
    return await apiGet<ProductDetail>(`/api/products/${encodeURIComponent(handle)}`);
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

/** Total inicial: variante por defecto + las opciones preseleccionadas. */
export function initialTotal(product: ProductDetail): number {
  const preselected = product.customizations.reduce((sum, customization) => {
    const option = customization.options.find((it) => it.id === customization.defaultOptionId);
    return sum + (option?.price ?? 0);
  }, 0);

  return (defaultVariant(product)?.price ?? product.basePrice) + preselected;
}
