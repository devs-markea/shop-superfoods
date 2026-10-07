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
import { CACHE_TAGS, cached } from './cache.ts';
import { formatPrice } from './price.ts';
import { hasImage } from './product-image.ts';
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

/**
 * La categoria del listado tal como la publica la API: el grupo `{ id, name, description }`
 * desde el 2026-10-05. Antes era el nombre suelto, y el contrato todavia lo admite; fuera de
 * readCategory() nadie mira esta forma.
 *
 * `description` llego al grupo el 2026-10-06. Opcional aqui porque un grupo anterior —o uno
 * guardado en la cache antes de esa fecha— no la trae.
 */
type ApiCategory = string | { id: string | number; name: string; description?: string };

/**
 * Una categoria del menu, por su id y con el nombre que se pinta. Es la forma que comparten
 * la lista de `GET /api/store` (`categories`) y la categoria de cada platillo.
 */
export interface CategoryRef {
  /**
   * `menu_categories.id`, como texto. CON EL SE EMPAREJA TODO: la seccion con sus platillos,
   * la entrada de la columna lateral con su seccion, el chip con lo que filtra y el pase de
   * "Descubre" con su destino. No cambia si el administrador renombra la categoria, y dos
   * categorias con el mismo nombre no se confunden.
   */
  id: string;
  name: string;
}

/** La categoria de un platillo, ya leida. */
export interface ProductCategory extends CategoryRef {
  /**
   * Texto plano, hasta 500 caracteres y con sus saltos de linea. Cadena vacia cuando la
   * categoria no tiene: se pinta con un `if`.
   */
  description: string;
}

/**
 * El id se pasa a texto: es como lo publica el contrato, y asi se compara igual con el
 * valor de un chip o de un `data-` del marcado, que siempre son texto.
 *
 * LA FORMA VIEJA —el nombre suelto— no trae id. Hoy la API ya no la manda, pero la cache
 * guarda la respuesta tal cual y sobrevive a los despliegues, asi que una copia anterior
 * podria traerla: entonces el nombre hace de id, para que el platillo no se quede fuera del
 * menu. Es el unico sitio donde el nombre empareja algo, y se puede borrar en cuanto el
 * contrato retire esa forma.
 */
function readCategory(category: ApiCategory): ProductCategory {
  return typeof category === 'string'
    ? { id: category, name: category, description: '' }
    : { id: String(category.id), name: category.name, description: category.description ?? '' };
}

/**
 * El platillo esta entre los destacados del panel. `position` ORDENA, no indexa: un
 * destacado que no se publica deja su hueco, asi que con 1, 2 y 3 en el panel pueden
 * llegar 1 y 3.
 */
export interface Featured {
  isFeatured: true;
  position: number;
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
  /** Ya leida por getProducts(), llegue como llegue. Por su `id` se agrupa en secciones. */
  category: ProductCategory;
  /** Precio "desde" (el minimo de sus variantes), en MXN. */
  basePrice: number;
  image: ProductImage;
  /** false = visible pero no comprable ahora: tarjeta atenuada, sin el "+". */
  available: boolean;
  unavailableReason: UnavailableReason | null;
  /**
   * null tiene CUATRO motivos indistinguibles a proposito: no hay promocion,
   * esta desactivada, esta fuera de vigencia, o no baja el precio de ninguna
   * variante. Por eso la tarjeta se resuelve con un `if` y nunca puede tachar
   * un precio por encima de otro mayor.
   */
  promotion: Promotion | null;
  /** null = no es destacado. Destacar no lo hace comprable: `available` manda igual. */
  featured: Featured | null;
}

/**
 * Una tarjeta tal como llega de la API, antes de leer su categoria. `featured` es opcional
 * por lo mismo que la descripcion de la categoria: una respuesta guardada antes del
 * 2026-10-05 no lo trae.
 */
type ApiProductListItem = Omit<ProductListItem, 'category' | 'featured'> & {
  category: ApiCategory;
  featured?: Featured | null;
};

/**
 * Cuanto se sigue sirviendo el catalogo guardado si la API falla.
 *
 * Una hora: las averias que motivaron esto duran minutos, y ensenar el menu de hace un rato
 * es mejor que "No pudimos cargar el menu". Lo que se cede es que los precios y las altas
 * puedan ser de hace un dia y una hora; comprar no corre riesgo, porque la ficha lee el
 * platillo fresco y el backend revalida al anadir.
 */
const CATALOG_STALE_MS = 60 * 60_000;

/**
 * Cuanto vale el catalogo guardado: un dia, o sea UNA lectura diaria por region.
 *
 * No caduca en las aperturas ni en los cierres, y eso tiene una consecuencia que hay que
 * saber: `available` queda congelado en el valor que tenia al leerse. Por eso la tarjeta no
 * se fia de el cuando el motivo es el horario —ver src/components/ProductCard.astro—, y
 * decide con el horario, que se lee aparte y si esta al minuto.
 *
 * Lo que cambia por decision de alguien —precios, altas, bajas, promociones— llega cuando se
 * purga el cache. Con esta ventana, purgar al editar el panel deja de ser opcional.
 */
const CATALOG_FRESH_MS = 24 * 60 * 60_000;

/**
 * Catalogo completo publicado. Sin paginacion por diseno: cabe en una
 * respuesta y el filtrado por categoria se hace en cliente sobre esta lista.
 *
 * SE GUARDA UN DIA ENTERO: una sola lectura diaria por region, en lugar de una por visita.
 * Lo que el reloj mueve —abierto o cerrado— no sale de aqui, sino del horario, que se pide
 * aparte y esta al minuto.
 */
export function getProducts(): Promise<ProductListItem[]> {
  return (
    cached<ApiProductListItem[]>({
      key: 'catalogo',
      tag: CACHE_TAGS.catalog,
      load: () => apiGet<ApiProductListItem[]>('/api/products'),
      freshUntil: (_items, fetchedAt) => fetchedAt + CATALOG_FRESH_MS,
      staleFor: CATALOG_STALE_MS,
    })
      // La categoria se lee al salir de la cache y no dentro de `load`: lo guardado es la
      // respuesta tal cual, y como la Runtime Cache sobrevive a los despliegues, puede traer
      // cualquiera de las dos formas sin tener que subir su VERSION. Lo mismo `featured`.
      .then((items) =>
        items.map((item) => ({
          ...item,
          category: readCategory(item.category),
          featured: item.featured ?? null,
        })),
      )
  );
}

/** Los platillos de una categoria, con la categoria que se pinta. */
interface CategoryGroup {
  category: ProductCategory;
  products: ProductListItem[];
}

/**
 * Los platillos agrupados por el id de su categoria, en el orden del panel.
 *
 * La lista y el orden los da `listed` —`categories` de `GET /api/store`, en el orden del
 * arrastre del administrador— y los platillos se le cuelgan por `category.id`. De ahi sale
 * tambien el nombre: es el que el contrato manda pintar en el chip.
 *
 * Dos cosas que pueden pasar porque catalogo y configuracion se guardan por separado, y que
 * se resuelven a favor del catalogo, que es lo que se vende:
 *
 *   una categoria de la lista sin platillos   no se pinta: seria una entrada del indice
 *                                             que lleva a una seccion vacia
 *   platillos de una categoria que no esta     se pintan igual, detras, en el orden del
 *   en la lista                                catalogo y con el nombre que traen
 *
 * Sin lista —la API no la publico, o no se pudo leer— queda solo el segundo caso: el orden
 * del catalogo, que la API ya da por posicion de categoria y de platillo.
 */
function groupByCategory(
  items: ProductListItem[],
  listed: readonly CategoryRef[],
): CategoryGroup[] {
  const groups = new Map<string, CategoryGroup>();

  for (const item of items) {
    const group = groups.get(item.category.id);

    if (group) group.products.push(item);
    else groups.set(item.category.id, { category: item.category, products: [item] });
  }

  const ordered: CategoryGroup[] = [];

  for (const entry of listed) {
    const group = groups.get(entry.id);
    if (!group) continue;

    ordered.push({ ...group, category: { ...group.category, name: entry.name } });
    groups.delete(entry.id);
  }

  return [...ordered, ...groups.values()];
}

/**
 * Las categorias con platillos, por id y en el orden del panel: los rotulos de "Descubre"
 * del pie. Los indices de la portada no salen de aqui sino de getMenuSections(), que usa
 * la misma agrupacion.
 *
 * `listed` es `store.categories`. Las pantallas que no la tienen a mano la omiten y se
 * quedan con el orden del catalogo, que es el mismo.
 */
export function getCategories(
  items: ProductListItem[],
  listed: readonly CategoryRef[] = [],
): CategoryRef[] {
  return groupByCategory(items, listed).map(({ category }) => ({
    id: category.id,
    name: category.name,
  }));
}

// ---------------------------------------------------------------------------
// Secciones del menu
//
// La portada ya no filtra una rejilla: pinta el catalogo partido en secciones, una por
// categoria, con los destacados delante. Su indice —la columna lateral en desktop
// (components/MenuSidebar.astro) y las tabs en movil (components/CategoryNav.astro)—
// las lista y marca en cual se esta.
// ---------------------------------------------------------------------------

/**
 * Rotulo y bajada de la seccion de destacados cuando el negocio no escribio los suyos.
 *
 * No es una categoria del panel —un destacado sigue en la suya, y aparece en las dos—,
 * asi que sus textos no llegan con el catalogo: los publica `home.featured` de
 * `GET /api/store`, cada uno con su texto o vacio. Vacio no quita la linea de la portada:
 * vuelve a la de aqui. Ver getMenuSections().
 */
export const FEATURED_SECTION = {
  name: 'Destacados',
  description: 'Los favoritos de nuestros clientes',
} as const;

/**
 * Los textos de la seccion de destacados tal como los resuelve getStoreConfig():
 * `home.featured`, con cadena vacia donde el negocio no escribio nada.
 */
export interface FeaturedHeading {
  title?: string;
  description?: string;
}

export interface MenuSection {
  /**
   * El `id` del elemento, al que salta la columna lateral. En las categorias sale del id
   * de la categoria, saneado para un atributo `id`.
   */
  anchor: string;
  /** `featured` se pinta como lista horizontal; `category`, como rejilla. */
  kind: 'featured' | 'category';
  /** El id de la categoria; null en los destacados, que no son una. */
  categoryId: string | null;
  name: string;
  /** Cadena vacia cuando no hay bajada que pintar. */
  description: string;
  products: ProductListItem[];
}

/**
 * Los destacados primero —si hay alguno— y despues una seccion por categoria, por id y en
 * el orden del panel (ver groupByCategory). La bajada de cada seccion es la de su primera
 * tarjeta: viaja repetida en todas.
 *
 * Los destacados se ordenan aqui porque `featured` no cambia el orden de la lista. El
 * `sort` es estable, asi que dos posiciones iguales conservan el orden de la API.
 *
 * `listed` es `store.categories`, como en getCategories(): las dos dan la misma lista en el
 * mismo orden, que es lo que hace que cada rotulo del pie tenga su seccion.
 *
 * `heading` es `store.home.featured`: el titular y la bajada de los destacados. El titular
 * es el `name` de la seccion, asi que rotula tambien su entrada en los dos indices, igual
 * que el nombre de una categoria. El `anchor` no sale de el —es fijo—, y por eso el indice
 * sigue encontrando la seccion escriba lo que escriba el negocio.
 */
export function getMenuSections(
  items: ProductListItem[],
  listed: readonly CategoryRef[] = [],
  heading: FeaturedHeading = {},
): MenuSection[] {
  const sections: MenuSection[] = [];

  const featured = items
    .filter((item) => item.featured)
    .sort((a, b) => (a.featured?.position ?? 0) - (b.featured?.position ?? 0));

  // Sin ningun destacado no hay seccion, ni entrada en la columna: no se anuncia una
  // lista vacia.
  if (featured.length > 0) {
    sections.push({
      anchor: 'menu-destacados',
      kind: 'featured',
      categoryId: null,
      // `||` y no `??`: lo que el negocio dejo vacio llega como cadena vacia.
      name: heading.title || FEATURED_SECTION.name,
      description: heading.description || FEATURED_SECTION.description,
      products: featured,
    });
  }

  for (const { category, products } of groupByCategory(items, listed)) {
    sections.push({
      // Los ids son numeros hoy; el saneado es por si un dia no lo son, que un espacio
      // en un `id` rompe el salto.
      anchor: `menu-categoria-${category.id.replace(/[^\w-]/g, '-')}`,
      kind: 'category',
      categoryId: category.id,
      name: category.name,
      description: category.description,
      products,
    });
  }

  return sections;
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

/**
 * La foto lista para el `<img>`, o null cuando el platillo no tiene ninguna.
 *
 * Devolver null —y no una URL de relleno— es lo que permite que la tarjeta y la
 * ficha no pinten la caja y el contenido ocupe su sitio. Quien decide es
 * hasImage(), que es la misma pregunta que se hace el pedido en el navegador:
 * ver src/lib/product-image.ts.
 */
export function productImageView(item: {
  image?: { url?: string | null; alt?: string | null } | null;
}): { src: string; alt: string } | null {
  if (!hasImage(item.image)) return null;

  // El alt puede llegar vacio, o no llegar: entonces la foto es decorativa —el
  // nombre del platillo esta escrito al lado— y lo que no puede quedar es un
  // <img> sin el atributo.
  return { src: assetUrl(item.image.url), alt: item.image.alt ?? '' };
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
  /**
   * Foto propia de la variante, o null cuando no tiene —y entonces la ficha
   * ensena la del platillo—. Opcional en el tipo porque llego con el cambio
   * del 2026-10-01: una respuesta anterior no la trae y debe leerse como null.
   * Solo la manda la ficha; el listado no la conoce. Quien la pinta es
   * src/scripts/product-hero.ts, al elegir la variante.
   */
  image?: ProductImage | null;
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
   * UNIDADES minimas y maximas DEL GRUPO, no opciones distintas. Significan lo
   * mismo en los tres controles: en radio y checkbox una opcion marcada vale
   * exactamente 1 unidad, asi que ahi las dos lecturas dan el mismo numero; en
   * `quantity` son la SUMA de los contadores.
   */
  min: number;
  max: number | null;
  /**
   * UNIDADES maximas de UNA misma opcion, 1..99. Solo tiene valor en el control
   * `quantity`, el unico donde una opcion puede valer mas de 1; null significa
   * sin tope de negocio. Es el mismo tipo de cuenta que `max` —unidades— con
   * otro alcance: el general reparte el total y este pone techo a cada parte.
   * En un grupo de cantidad los dos pueden venir con valor y se aplican los dos,
   * y el panel ya impide guardar un individual por encima del general.
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
  /**
   * Solo en variantes con foto propia: la que pasa a la cabecera de la ficha al
   * elegirla. null en las demas y en todas las personalizaciones.
   */
  image: { src: string; alt: string } | null;
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
  /** Unidades de UNA opcion, con el mismo significado que en Customization. */
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
      // Las variantes no son una personalizacion: se elige una y vale por 1
      // unidad, asi que no hay tope individual que repartir.
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
        // La misma pregunta que la foto del platillo: si llegara el relleno en
        // lugar de null, cuenta como "sin foto" y no taparia la buena.
        image: productImageView(variant),
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
        image: null,
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
