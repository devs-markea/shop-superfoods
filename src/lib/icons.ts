// ---------------------------------------------------------------------------
// Trazos del sistema de iconos: viewBox 20x20, trazo 2, remates redondos. La
// rejilla admite excepciones cuando el diseno trae el icono dibujado en otra
// —ver ICON_VIEWBOX—; el trazo y los remates no, los pone .icon para todos.
// Todos heredan el color con currentColor, asi los estados de los botones no
// necesitan reglas extra.
//
// Viven aqui y no dentro de <Icon> porque el carrito repinta sus lineas desde
// el navegador —los grupos de "compra y lleva" se rehacen enteros en cada
// cambio, ver src/lib/cart-view.ts— y un componente .astro no se puede invocar
// desde un <script>. Un solo diccionario para las dos formas de dibujarlos.
// ---------------------------------------------------------------------------

export type IconName =
  | 'clock'
  | 'map-pin'
  | 'share'
  | 'truck'
  | 'shopping-cart'
  | 'plus'
  | 'chevron-left'
  | 'arrow-left'
  | 'trash'
  | 'phone'
  | 'credit-card'
  | 'cash'
  | 'copy'
  | 'check'
  | 'info'
  | 'tag'
  | 'close'
  | 'crosshair';

export type IconSize = 'lg' | 'md' | 'sm';

export const ICON_PATHS: Record<IconName, string> = {
  clock:
    '<path d="M10 5v5l3.334 1.667M18.334 10a8.334 8.334 0 1 1-16.668 0 8.334 8.334 0 0 1 16.668 0Z"/>',
  'map-pin':
    '<path d="M10.5 18.167C12.05 16.828 16.666 12.494 16.666 8.333a6.666 6.666 0 1 0-13.332 0c0 4.161 4.615 8.495 6.165 9.834a.833.833 0 0 0 1.001 0Z"/><circle cx="10" cy="8.333" r="2.5"/>',
  // Compartir la tienda. Hoy no lo pinta ninguna pantalla: el boton salio de la
  // barra superior porque sigue esperando el dominio real (`publicUrl`). El trazo
  // se queda aqui para cuando vuelva.
  share:
    '<path d="M10 1.666V12.5M6.667 5 10 1.666 13.333 5M3.334 10v6.667c0 .442.176.866.488 1.179.312.312.736.488 1.178.488h9.999c.442 0 .866-.176 1.178-.488.313-.313.489-.737.489-1.179V10"/>',
  truck:
    '<path d="M11.667 15V5a.833.833 0 0 0-.834-.833H1.667A.833.833 0 0 0 .833 5v9.167c0 .46.373.833.834.833h1.666"/><path d="M12.5 15H7.5"/><path d="M15.833 15H17.5a.833.833 0 0 0 .833-.833v-3.042a.833.833 0 0 0-.183-.517l-2.9-3.625a.833.833 0 0 0-.65-.316h-2.933"/><circle cx="14.167" cy="15" r="1.667"/><circle cx="5.833" cy="15" r="1.667"/>',
  // Carrito de la barra de desktop, tal como llego del diseno
  // (elementos-shared/shopping-cart.svg): rejilla de 28 y trazo 2, no la de 20
  // del resto. Ver ICON_VIEWBOX, justo debajo.
  'shopping-cart':
    '<path d="M3.5 3.5H5.833L6.3 5.833M8.167 15.167h11.666L24.5 5.833H6.3M8.167 15.167 6.3 5.833M8.167 15.167l-2.675 2.675c-.735.735-.215 1.991.825 1.991h13.516M19.833 19.833a2.333 2.333 0 1 0 0 4.667 2.333 2.333 0 0 0 0-4.667ZM10.5 22.167A2.333 2.333 0 0 1 8.167 24.5a2.333 2.333 0 0 1 0-4.667 2.333 2.333 0 0 1 2.333 2.334Z"/>',
  plus: '<path d="M10 4.167v11.666M4.167 10h11.666"/>',
  'chevron-left': '<path d="M12.5 15.833 6.667 10 12.5 4.167"/>',
  'arrow-left': '<path d="M16.667 10H3.333M8.333 15l-5-5 5-5"/>',
  trash:
    '<path d="M2.5 5.833h15M7.5 5.833V4.167a.833.833 0 0 1 .833-.834h3.334a.833.833 0 0 1 .833.834v1.666"/><path d="M15.833 5.833 15.14 16.24a1.667 1.667 0 0 1-1.663 1.427H6.523A1.667 1.667 0 0 1 4.86 16.24L4.167 5.833"/><path d="M8.333 9.167v5M11.667 9.167v5"/>',
  // Movil: representa la transferencia bancaria (banca desde el telefono).
  // 10 de ancho por 16 de alto: la silueta real de un telefono (proporcion 1:2)
  // se lee como una raya a 20px, asi que se ensancha para que se reconozca.
  phone: '<rect x="5" y="2" width="10" height="16" rx="2"/><path d="M8.75 15h2.5"/>',
  'credit-card':
    '<rect x="1.667" y="4.167" width="16.666" height="11.666" rx="1.667"/><path d="M1.667 8.333h16.666"/>',
  // Billete con el importe en el centro: el pago en efectivo, al recoger. No
  // reusa 'credit-card' —una tarjeta no es efectivo— y por eso es mas bajo que
  // ella: 10 de alto contra 11.666, la proporcion de un billete.
  cash: '<rect x="1.667" y="5" width="16.666" height="10" rx="1.667"/><circle cx="10" cy="10" r="2.083"/>',
  // Dos cuadrados superpuestos: el de atras se dibuja abierto, para que el de
  // delante no lo cruce. Copiar la CLABE.
  copy: '<rect x="6.667" y="6.667" width="11.666" height="11.666" rx="1.667"/><path d="M3.333 13.333a1.667 1.667 0 0 1-1.666-1.666V3.333c0-.92.746-1.666 1.666-1.666h8.334c.92 0 1.666.746 1.666 1.666"/>',
  // Confirmacion del boton de copiar.
  check: '<path d="M16.667 5 7.5 14.167 3.333 10"/>',
  // El punto de la "i" es un trazo de longitud casi cero: con el remate redondo
  // del sistema sale redondo sin necesidad de un circulo relleno.
  info: '<circle cx="10" cy="10" r="8.333"/><path d="M10 13.333V10M10 6.667h.008"/>',
  // Etiqueta de precio: la insignia de las promociones. Es el mismo icono que
  // el panel usa en la vista previa del formulario de descuento, asi que el
  // administrador reconoce en la tienda lo que configuro.
  tag: '<path d="M10.488 2.155a1.667 1.667 0 0 0-1.178-.488H3.333a1.667 1.667 0 0 0-1.666 1.666V9.31c0 .442.175.866.488 1.178l7.253 7.254a2.022 2.022 0 0 0 2.859 0l5.483-5.483a2.022 2.022 0 0 0 0-2.859Z"/><path d="M6.25 6.25h.008"/>',
  // Cerrar. El de Bootstrap (.btn-close) es una imagen de fondo con su propio
  // grosor y su propio negro: no sigue el sistema ni hereda el color del padre.
  close: '<path d="M15 5 5 15M5 5l10 10"/>',
  // "Centrar el mapa donde estoy", en la hoja de la ubicacion. Es la diana de
  // toda la vida: el mismo dibujo que usa el boton de recentrar de cualquier
  // mapa, para que se reconozca sin rotulo.
  crosshair:
    '<circle cx="10" cy="10" r="6.667"/><circle cx="10" cy="10" r="1.667"/><path d="M10 1.667v2.5M10 15.833v2.5M18.333 10h-2.5M4.167 10h-2.5"/>',
};

const DEFAULT_VIEWBOX = '0 0 20 20';

/**
 * Los iconos que NO viven en la rejilla de 20.
 *
 * Hoy solo el carrito. Llego del diseno dibujado en 28 con trazo 2, y como se
 * pinta a 28 se deja en su rejilla: reescalarlo a 20 lo dibujaria al 71% y el
 * trazo saldria a 2.8 al volver a 28, mas grueso que el del diseno y que el del
 * resto del sistema. El grosor lo pone .icon una sola vez, asi que la unica
 * forma de respetarlo es no cambiarle la escala al icono.
 */
const ICON_VIEWBOX: Partial<Record<IconName, string>> = {
  'shopping-cart': '0 0 28 28',
};

/** La rejilla en la que esta dibujado el icono. */
export function iconViewBox(name: IconName): string {
  return ICON_VIEWBOX[name] ?? DEFAULT_VIEWBOX;
}

/** Las mismas clases que pone <Icon>, para que el SVG de cliente no se salga del sistema. */
export function iconClass(size: IconSize = 'md'): string {
  if (size === 'sm') return 'icon icon--sm';
  if (size === 'lg') return 'icon icon--lg';
  return 'icon';
}

/**
 * El icono como cadena. Solo lo usa el repintado del carrito; en el marcado
 * servido se usa <Icon>, que lee este mismo diccionario.
 */
export function iconHtml(name: IconName, size: IconSize = 'md'): string {
  return `<svg class="${iconClass(size)}" viewBox="${iconViewBox(name)}" aria-hidden="true" focusable="false">${ICON_PATHS[name]}</svg>`;
}
