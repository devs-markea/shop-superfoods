// ---------------------------------------------------------------------------
// Lo que pinta una tarjeta de platillo de la portada, ya decidido.
//
// Hay dos tarjetas con dos estructuras —<ProductCard>, la de pie de los destacados,
// y <MenuCard>, la de las categorias— y las dos cuentan lo mismo: si se puede
// comprar, por que no, el precio y la foto. Lo deciden aqui, una vez, para que no
// puedan contradecirse.
// ---------------------------------------------------------------------------

import { productImageView, promotionView, type ProductListItem, type PromotionView } from './catalog.ts';

// El contrato distingue por que no se puede comprar, asi que el aviso tambien.
// Record<string, string> y no Record<UnavailableReason, string>: si el backend
// anade un motivo nuevo, la tarjeta cae en el texto generico en lugar de
// pintar "undefined".
const UNAVAILABLE_LABEL: Record<string, string> = {
  no_price: 'Sin precio',
  out_of_schedule: 'Fuera de horario',
};

// El nombre se recorta a 24 caracteres. En una tarjeta de 128 con la foto de 80
// el titulo dispone de una sola linea, y ahora la comparte con la insignia de la
// promocion: sin recorte, un nombre largo la empujaria fuera. El nombre entero
// sigue accesible en el `title` del enlace y en la ficha.
const NAME_MAX = 24;

export interface ProductCardView {
  /**
   * Se puede pedir ahora. Si no, el "+" deja su sitio al motivo o, cuando no hay motivo
   * que decir —la tienda esta cerrada—, se pinta apagado.
   */
  orderable: boolean;
  /** El motivo que ocupa el sitio del boton, o null si no hay que decir nada. */
  notice: string | null;
  /**
   * Los cuatro elementos de la spec, en este orden: insignia, precio tachado, precio
   * final y etiqueta de ahorro. Los tres ultimos solo cuando la promocion baja de verdad
   * el precio de la variante de referencia —la mas barata, la misma que sustenta el
   * "desde" de la tarjeta—.
   */
  promo: PromotionView | null;
  /** El nombre, recortado a NAME_MAX. */
  displayName: string;
  /**
   * La foto, si la hay. Sin ella la tarjeta NO pinta la caja: el cuerpo se queda con su
   * sitio. Ver src/lib/product-image.ts.
   */
  image: { src: string; alt: string } | null;
}

/**
 * @param storeClosed La tienda esta cerrada: nada es comprable, y la etiqueta del
 *                    motivo se calla porque ya lo dice la tarjeta de tienda cerrada.
 */
export function productCardView(product: ProductListItem, storeClosed: boolean): ProductCardView {
  // EL HORARIO MANDA SOBRE `available`, EN LOS DOS SENTIDOS, y esto es lo que permite
  // guardar el catalogo un dia entero (ver CATALOG_FRESH_MS en src/lib/catalog.ts).
  //
  // `available` viene resuelto por el backend EN EL MOMENTO EN QUE SE LEYO el catalogo, asi
  // que en una copia guardada envejece: una lista pedida de madrugada trae todo "fuera de
  // horario" y, sin esto, la tienda abriria con el menu entero apagado. El horario no
  // envejece —se pide aparte y se resuelve al minuto—, asi que es el que decide:
  //
  //   tienda cerrada      nada es comprable, diga lo que diga el catalogo
  //   tienda abierta      un "fuera de horario" guardado se ignora
  //
  // Lo que NO se ignora es cualquier otro motivo: esos no dependen del reloj, y si el
  // contrato estrena uno —hoy `out_of_schedule` es el unico que se emite— la tarjeta lo
  // respeta.
  //
  // Lo que se cede: una categoria con horario propio distinto al de la tienda puede verse
  // comprable fuera de SU horario hasta que se purgue el cache. La ficha, que se lee
  // fresca, dice la verdad, y el backend rechaza el alta con un 422.
  const staleSchedule = !product.available && product.unavailableReason === 'out_of_schedule';

  const orderable = (product.available || staleSchedule) && !storeClosed;

  // Lo unico que se calla con la tienda cerrada es la etiqueta del motivo: repetir
  // "Fuera de horario" en cada platillo convertiria el menu en una lista de
  // negativas, y eso ya lo dice una sola vez la tarjeta de tienda cerrada.
  const notice =
    storeClosed || product.available || staleSchedule
      ? null
      : (UNAVAILABLE_LABEL[product.unavailableReason ?? ''] ?? 'No disponible');

  const displayName =
    product.name.length > NAME_MAX
      ? `${product.name.slice(0, NAME_MAX).trimEnd()}...`
      : product.name;

  return {
    orderable,
    notice,
    promo: promotionView(product),
    displayName,
    image: productImageView(product),
  };
}
