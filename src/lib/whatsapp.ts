// ---------------------------------------------------------------------------
// El mensaje de WhatsApp de las pantallas de cierre.
//
// El negocio escribe la plantilla en su panel y la tienda la rellena con el
// pedido que acaba de releer. El backend no compone el texto: el unico dato que
// el front no conoce es la plantilla, y esa viaja en GET /api/store.
//
// Aqui vive el mensaje entero: el vocabulario de marcadores, las cuatro reglas
// de sustitucion, el formato de los importes y el bloque de platillos. El
// contrato esta en generals/configuracion-de-la-tienda.md §3.2 y §3.2-bis.
//
// LA REFERENCIA ES EL ERP. El panel escribe el mismo pedido desde
// `App\Support\WhatsappMessage`, y el comprador y el negocio acaban leyendo los
// dos textos en la misma conversacion: donde esta implementacion y aquella
// discrepen, la equivocada es esta. Por eso hay literales con acento en este
// fichero —"envío", "Dirección"— aunque el resto de la tienda escriba sin
// ellos: no son copia de la tienda, son copia del ERP.
// ---------------------------------------------------------------------------

import {
  PAYMENT_LABEL,
  type DeliveryType,
  type OrderLine,
  type PaymentMethod,
  type StoreOrder,
} from './checkout.ts';

/**
 * Los veintidos marcadores, agrupados por la pregunta que contestan.
 *
 * La lista es la que decide que es un marcador CONOCIDO, y de ahi salen las dos
 * primeras reglas de sustitucion: lo que no esta aqui se deja literal, y lo que
 * si esta pero llega sin valor se lleva su renglon. Por eso es una lista y no
 * solo un tipo: en tiempo de ejecucion hay que poder preguntar.
 */
const MARKERS = [
  // El pedido
  'folio',
  'estado',
  'notas',
  'platillos',
  // Quien lo hizo
  'nombre',
  'celular',
  // A donde va
  'entrega',
  'calle',
  'numero',
  'colonia',
  'entrecalles',
  'referencias',
  'ubicacion',
  'direccion',
  // Donde recogerlo — los dos unicos que NO salen del pedido
  'sucursal',
  'mapa',
  // Cuanto suma
  'productos',
  'descuento',
  'envio',
  'propina',
  'total',
  'metodo',
] as const;

type MarkerName = (typeof MARKERS)[number];

const KNOWN = new Set<string>(MARKERS);

/**
 * Valores que puede llevar un mensaje.
 *
 * Una clave ausente y una clave vacia son lo MISMO para el relleno: las dos son
 * "marcador conocido sin valor" y las dos se llevan su renglon. Lo que las
 * distingue de un `{sucursal}` que el negocio invento es que esa ni siquiera
 * esta en la lista.
 */
export type MessageValues = Partial<Record<MarkerName, string>>;

/** Los dos interruptores de `store.whatsapp.items`: que escribe `{platillos}`. */
export interface ItemsOptions {
  showVariant?: boolean;
  showCustomizations?: boolean;
}

/**
 * Las plantillas, agrupadas por modo de entrega y dentro por metodo de pago.
 *
 * Son DOS niveles porque la llave del mensaje son dos datos del pedido: como se
 * recibe y como se paga. Y los dos son el token del pedido tal cual —no
 * camelCase como el resto del contrato— para que la resolucion sea un acceso y
 * no una tabla de correspondencias que alguien tenga que mantener.
 */
export type MessageTemplates = Partial<Record<DeliveryType, Partial<Record<PaymentMethod, string>>>>;

/**
 * Lo que el mensaje necesita ademas del pedido.
 *
 * `location` esta aqui porque `{sucursal}` y `{mapa}` son los dos unicos
 * marcadores que no describen el pedido sino el LOCAL: un pedido no sabe donde
 * esta su sucursal, y quien pasa a recogerlo tiene que leer a donde ir.
 */
export interface MessageContext {
  items?: ItemsOptions;
  location?: { address?: string; shortAddress?: string; mapsUrl?: string };
}

/**
 * La plantilla de un pedido: su modo de entrega y su metodo de pago.
 *
 * `pickup` lleva SOLO lo que cambia —hoy, el efectivo—, asi que la lectura cae
 * en `delivery` cuando la casilla no esta. Es la unica regla que el contrato le
 * pide a la tienda, y esta aqui y no en las pantallas para que las dos resuelvan
 * igual.
 *
 * Repetir en `pickup` la transferencia y Mercado Pago seria publicar dos veces el
 * mismo texto: quien manda una captura o quien ya pago con la pasarela dice lo
 * mismo se lleve el pedido a su casa o al mostrador. El unico que cambia es el
 * efectivo, porque a domicilio se paga al recibir y al recoger se paga en el
 * mostrador — y ahi hace falta decir donde esta el mostrador.
 */
export function pickTemplate(
  templates: MessageTemplates | undefined,
  deliveryType: DeliveryType,
  paymentMethod: PaymentMethod,
): string | undefined {
  return templates?.[deliveryType]?.[paymentMethod] ?? templates?.delivery?.[paymentMethod];
}

const MARKER = /\{(\w+)\}/g;

/**
 * La vineta de las lineas de opcion: `·` U+00B7 MIDDLE DOT.
 *
 * No es una eleccion de estilo. El `‣` (U+2023) no lo traen ni Roboto —el
 * Android de WhatsApp— ni Segoe UI ni Arial, asi que llegaba al chat como un
 * recuadro vacio. Y `-` o `*` al principio del renglon tampoco valen: WhatsApp
 * los interpreta como lista y reescribe la sangria del bloque entero.
 */
const BULLET = '·';

/**
 * Lo que se escribe donde deberia ir el envio de un pedido a domicilio que
 * nadie ha podido cotizar. Se grita a proposito: es el unico dato del mensaje
 * que obliga a alguien a hacer algo ANTES de cobrar.
 */
const SHIPPING_PENDING = '\u{1F6A8} Por definir \u{1F6A8}';

/**
 * Rellena la plantilla, renglon a renglon.
 *
 * Se trabaja por renglones y no sobre el texto entero porque la regla 2 lo pide:
 * lo que se va cuando falta un dato no es el hueco, es la linea con su etiqueta
 * y su vineta. Un `• Referencias:` colgando en el chat de un cliente no informa
 * de nada; solo delata que el mensaje se arma con plantillas.
 *
 * Las cuatro reglas, y ninguna es opcional:
 *
 *   1  marcador DESCONOCIDO         se deja literal. Alguien lo nota y se
 *                                   corrige en el panel, que es donde se escribio
 *   2  marcador conocido SIN valor  se va el renglon entero... salvo que otro
 *                                   marcador del mismo renglon si trajera valor
 *   3  marcador en MAYUSCULAS       el valor sale en mayusculas. Es la unica
 *                                   forma de dar enfasis en un chat sin formato
 *   4  limpieza de restos           en el renglon que si se manda
 *
 * Un renglon sin marcadores —un `---`, un encabezado, el saludo— se manda tal
 * cual, y uno que solo lleva marcadores desconocidos tambien: si se fuera, el
 * negocio nunca veria que escribio mal el nombre.
 */
export function fillMessage(template: string, values: MessageValues): string {
  return template
    .split('\n')
    .map((line) => fillLine(line, values))
    .filter((line): line is string => line !== null)
    .join('\n');
}

/** Un renglon ya sustituido, o null si le toca irse. */
function fillLine(line: string, values: MessageValues): string | null {
  let known = 0;
  let filled = 0;

  const substituted = line.replace(MARKER, (marker, key: string) => {
    const value = resolveMarker(key, values);

    if (value === undefined) return marker; // regla 1

    known += 1;
    if (value !== '') filled += 1;

    return isShouted(key) ? value.toLocaleUpperCase('es-MX') : value; // regla 3
  });

  // Regla 2. Se mira `known`, no la cuenta de marcadores: un renglon cuyos
  // unicos marcadores son desconocidos se queda, porque su texto literal es el
  // aviso de que hay algo que corregir.
  if (known > 0 && filled === 0) return null;

  return cleanUp(substituted);
}

/**
 * El valor de un marcador: `undefined` si no es del vocabulario, y cadena vacia
 * si lo es pero el pedido no lo trae. Es la diferencia entre las reglas 1 y 2.
 *
 * La busqueda es insensible a mayusculas porque `{METODO}` y `{metodo}` son el
 * mismo marcador escrito de dos formas: lo que cambia es como sale el valor, no
 * de donde se lee.
 */
function resolveMarker(key: string, values: MessageValues): string | undefined {
  const name = key.toLowerCase();

  if (!KNOWN.has(name)) return undefined;

  return values[name as MarkerName] ?? '';
}

/** Si el negocio lo escribio en mayusculas para que el valor salga gritado. */
function isShouted(key: string): boolean {
  return /[A-Z]/.test(key) && key === key.toUpperCase();
}

/**
 * Regla 4, sobre el renglon que si se manda: quita el `#` que se quedo sin su
 * folio, el espacio que el hueco dejo antes de la puntuacion, los espacios
 * dobles y el que quedo al final.
 *
 * SIN TOCAR LOS SALTOS DE LINEA. Se limpia dentro de un renglon, nunca sobre el
 * texto entero: `{platillos}` trae los suyos y colapsarlos convertiria el pedido
 * en un parrafo.
 *
 * El orden importa: el `#` se va primero porque deja detras el espacio doble que
 * limpia la regla siguiente.
 */
function cleanUp(line: string): string {
  return line
    .replace(/#(?=\s|$)/g, '')
    .replace(/ +([,.;:!?])/g, '$1')
    .replace(/ {2,}/g, ' ')
    .replace(/[ \t]+$/, '');
}

// --- Importes ---------------------------------------------------------------

const WHOLE = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const WITH_CENTS = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * El importe como lo escribe el ERP: `$547`, `$1,190`, `$119.50`.
 *
 * NO es formatPrice(): esa pone siempre dos decimales, que es lo que quiere la
 * interfaz. Aqui sobran, y no por gusto —la tienda venia escribiendo `$200.00`
 * donde el panel escribia `$200` para el mismo pedido, y quien recibe los dos
 * mensajes tiene que poder leerlos como uno solo—.
 *
 * Los centavos aparecen solo cuando existen, y entonces van los dos: `$119.50`,
 * no `$119.5`.
 */
export function formatMessagePrice(value: number): string {
  return Number.isInteger(value) ? WHOLE.format(value) : WITH_CENTS.format(value);
}

// --- El pedido, convertido en marcadores -------------------------------------

/**
 * Los veintidos valores de un mensaje.
 *
 * Todo el mapeo campo a campo vive aqui, en un solo sitio: las tres pantallas de
 * cierre pasan el mismo pedido y tienen que mandar el mismo mensaje, y la unica
 * forma de garantizarlo es que ninguna arme su propia lista.
 */
export function orderMessageValues(order: StoreOrder, context: MessageContext = {}): MessageValues {
  const customer = order.customer ?? {};
  const location = context.location ?? {};

  // Con "para recoger" no hay a donde llevar nada, asi que los siete marcadores
  // de direccion van vacios AUNQUE el pedido lleve una congelada —la lleva si
  // ese mismo cliente pidio a domicilio otra vez—. Ensenarla convertiria en
  // destino algo que nadie tiene que atender.
  //
  // `{entrega}` no entra en ese vaciado: es justo el marcador que dice cual de
  // los dos modos es, y en un pedido de recoger su valor es "Recoger en
  // sucursal". Ver la nota de arriba del fichero sobre el conteo del contrato.
  const pickup = order.deliveryType === 'pickup';
  const address = pickup ? {} : customer;

  const { envio, totalSuffix } = resolveShipping(order);

  return {
    // El pedido
    folio: order.folio != null ? String(order.folio) : '000',
    estado: order.statusLabel,
    notas: order.notes ?? '',
    platillos: composeItems(order.items ?? [], context.items),

    // Quien lo hizo
    nombre: customer.name ?? '',
    celular: customer.phone ? readablePhone(customer.phone) : '',

    // A donde va
    entrega: pickup ? 'Recoger en sucursal' : 'Entrega a domicilio',
    calle: address.street ?? '',
    numero: address.exteriorNumber ?? '',
    colonia: address.neighborhood ?? '',
    entrecalles: address.crossStreets ?? '',
    referencias: address.addressReferences ?? '',
    ubicacion: address.locationUrl ? canonicalMapsUrl(address.locationUrl) : '',
    direccion: oneLineAddress(address),

    // Donde recogerlo. Los dos van en TODAS las plantillas, no solo en la de
    // recoger: la direccion del local es un dato publico que un mensaje de
    // domicilio tambien puede querer, y acotarlos obligaria a explicar por que un
    // marcador funciona en una plantilla y no en la de al lado.
    //
    // La abreviada no es un formato de repuesto sino la misma ubicacion escrita
    // corta, asi que sirve igual: aqui el renglon vacio es el pedido que nadie
    // sabe donde recoger.
    sucursal: location.address?.trim() || location.shortAddress?.trim() || '',
    mapa: location.mapsUrl ?? '',

    // Cuanto suma
    productos: formatMessagePrice(order.subtotal),
    // Solo cuando hay descuento: un "• Descuento: $0" es un renglon que no dice
    // nada, y vacio se lo lleva la regla 2.
    descuento: order.discountTotal > 0 ? formatMessagePrice(order.discountTotal) : '',
    envio,
    // Siempre, aunque sea cero. Es una pregunta que se le hizo al cliente y el
    // `$0` es su respuesta; el renglon ausente se leeria como que no se le
    // ofrecio propina.
    propina: formatMessagePrice(order.tipTotal),
    total: `${formatMessagePrice(order.total)}${totalSuffix}`,
    metodo: order.paymentMethod ? PAYMENT_LABEL[order.paymentMethod] : '',
  };
}

/**
 * El envio es el unico importe que no siempre es una cifra.
 *
 * Un pedido a domicilio que no se pudo cotizar —sin ubicacion compartida, fuera
 * del area, con la medicion apagada— llega con `shippingTotal: 0`, y ese cero NO
 * significa gratis. Lo que los distingue es el bloque `shipping`, que solo viaja
 * cuando hubo cotizacion: sin el, el cero es un hueco.
 *
 * Cuando es un hueco, el total lo repite en su propio renglon (`$547 + envío`)
 * para que la cifra no se lea como definitiva.
 */
function resolveShipping(order: StoreOrder): { envio: string; totalSuffix: string } {
  if (order.deliveryType === 'pickup') return { envio: '', totalSuffix: '' };

  if (!order.shipping) return { envio: SHIPPING_PENDING, totalSuffix: ' + envío' };

  if (order.shippingTotal === 0) return { envio: 'Gratis', totalSuffix: '' };

  return { envio: formatMessagePrice(order.shippingTotal), totalSuffix: '' };
}

/**
 * Las cuatro primeras piezas de la direccion en una linea, para las plantillas
 * que no quieren un bloque entero: `Girasol 42, Col. Las Flores (entre Palma y
 * Ceiba)`.
 *
 * Se compone con lo que haya. Sin ninguna pieza sale vacia y la regla 2 se lleva
 * su renglon, que es lo que toca en un pedido para recoger.
 */
function oneLineAddress(customer: OrderCustomer): string {
  const street = [customer.street, customer.exteriorNumber].filter(Boolean).join(' ');
  const head = [street, customer.neighborhood && `Col. ${customer.neighborhood}`]
    .filter(Boolean)
    .join(', ');
  const cross = customer.crossStreets ? `(entre ${customer.crossStreets})` : '';

  return [head, cross].filter(Boolean).join(' ');
}

/**
 * El enlace del punto compartido, reducido a su forma canonica.
 *
 * Quien reparte necesita un punto, no la copia de lo que se pego: el mismo sitio
 * llega escrito de media docena de formas segun de donde saliera el enlace. Se
 * extraen las coordenadas y se reescribe.
 *
 * Un enlace que no las lleve encima —los acortados no las llevan— se manda tal
 * cual: resolverlo pediria una peticion a Google, y un enlace acortado sigue
 * abriendo el sitio correcto.
 */
function canonicalMapsUrl(url: string): string {
  const coords = url.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);

  if (!coords) return url;

  return `https://www.google.com/maps/search/?api=1&query=${coords[1]},${coords[2]}`;
}

/**
 * El celular escrito para leerse y copiarse —`+52 9983948803`—, no el E.164
 * pegado con el que se guarda.
 *
 * Quien lee el mensaje va a marcar ese numero o pegarlo en una busqueda, y
 * `+529983948803` obliga a contar digitos para saber donde acaba la lada.
 */
function readablePhone(phone: string): string {
  const digits = normalizePhone(phone);

  if (!digits) return '';

  return digits.startsWith('52') ? `+52 ${digits.slice(2)}` : `+${digits}`;
}

// --- {platillos} -------------------------------------------------------------

/**
 * El pedido entero, un bloque por platillo y en el orden en que se pidieron.
 *
 * Es el unico marcador que no sustituye un dato suelto sino que escribe varias
 * lineas, y el unico que compone la tienda: los interruptores
 * son suyos pero las lineas son del pedido que la tienda acaba de releer.
 *
 *   2x Poke con milanesa - Milanesa de Pollo ($229)
 *   · Arroz poblano ($20)
 *   · Con aguacate
 *
 *   1x Agua de jamaica ($35)
 *
 * Los importes SE DESGLOSAN en vez de resumirse en el total de la linea: asi el
 * mensaje se puede auditar sumando —los renglones dan exactamente
 * `{productos}`— y un cargo que nadie reconoce se localiza en el platillo que lo
 * trajo, en lugar de quedar escondido dentro de una cifra redonda.
 */
export function composeItems(items: OrderLine[], options: ItemsOptions = {}): string {
  // Un renglon en blanco entre platillos. Sin el, un pedido de cuatro con
  // opciones es un muro donde no se ve donde acaba uno y empieza el siguiente.
  return items.map((item) => composeItem(item, options)).join('\n\n');
}

function composeItem(item: OrderLine, { showVariant, showCustomizations }: ItemsOptions): string {
  // La variante va con guion y detras del nombre porque es parte del NOMBRE de
  // lo que se pidio —"Poke con milanesa - Milanesa de Res"—, no una nota al
  // margen: entre parentesis se leeria como un comentario.
  const variant = showVariant && item.variantName ? ` - ${item.variantName}` : '';

  // El precio BASE de la variante, por unidad. No es el total de la linea: eso
  // romperia la suma con la que se audita el mensaje.
  const price = item.unitPrice === undefined ? '' : ` (${formatMessagePrice(item.unitPrice)})`;

  const head = `${item.quantity}x ${item.name}${variant}${price}`;

  if (!showCustomizations) return head;

  const options = (item.options ?? []).map((option) => {
    // La cantidad solo cuando pasa de una: "1x Con aguacate" seria ruido en
    // todas las lineas para poder decirlo en una. Y el precio solo cuando lo
    // tiene: las opciones sin coste son la mayoria, y escribirles "($0)"
    // llenaria el mensaje de ceros para senalar lo que no cuesta nada.
    const quantity = option.quantity > 1 ? `${option.quantity}x ` : '';
    const cost = option.price > 0 ? ` (${formatMessagePrice(option.price)})` : '';

    return `${BULLET} ${quantity}${option.label}${cost}`;
  });

  return [head, ...options].join('\n');
}

/** Las piezas del cliente que el mensaje sabe leer. */
type OrderCustomer = NonNullable<StoreOrder['customer']>;

// --- El enlace ---------------------------------------------------------------

/**
 * Enlace a un chat de WhatsApp, con el mensaje ya escrito si se le pasa uno.
 *
 * Devuelve null si no hay telefono configurado, y quien llama decide que hacer
 * con eso: hoy las pantallas de cierre dejan el boton inerte en lugar de mandar
 * a nadie a un chat vacio.
 *
 * Sin mensaje el chat se abre en blanco, que es lo que quiere el enlace del pie:
 * ahi no hay pedido del que hablar todavia, y `?text=` vacio solo seria ruido en
 * la URL.
 *
 * wa.me exige el numero en E.164 SIN el `+` ni separadores, asi que se limpia
 * aqui: `+52 998 123 4567` y `529981234567` valen igual.
 */
export function whatsAppUrl(phone: string, message = ''): string | null {
  const digits = normalizePhone(phone);
  if (!digits) return null;

  const chat = `https://wa.me/${digits}`;

  // encodeURIComponent y NUNCA encodeURI. No es un detalle de estilo: las
  // plantillas empiezan por `#{folio}` y `{ubicacion}` trae un `&` dentro. Con
  // encodeURI el `#` abre un fragmento y WhatsApp recibe el mensaje cortado ahi
  // mismo — el comprador manda un chat vacio y no se entera.
  return message ? `${chat}?text=${encodeURIComponent(message)}` : chat;
}

/**
 * Deja el numero como lo quiere wa.me: solo digitos, en E.164 sin el `+`.
 *
 * El backend normaliza igual antes de publicarlo, asi que esto solo actua sobre
 * el respaldo escrito a mano — donde el numero llega como lo escribiria una
 * persona: `+52 1 998 756 6999`.
 *
 * El `1` de los moviles mexicanos se descarta: es el prefijo de la marcacion
 * antigua y hoy sobra en E.164 (`5219987566999` -> `529987566999`). WhatsApp
 * acepta las dos formas, pero conviene una sola para que el enlace del respaldo y
 * el de la API no difieran.
 */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');

  return /^521\d{10}$/.test(digits) ? `52${digits.slice(3)}` : digits;
}
