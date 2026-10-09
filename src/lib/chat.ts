// ---------------------------------------------------------------------------
// El chat de la tienda: a que numero se abre y con que mensaje.
//
// Lo usan el boton propio (components/ChatFab.astro) y el widget de Wati
// (components/WatiChat.astro), hoy apagado. Los dos abren lo mismo: una
// conversacion de WhatsApp con el negocio, con el mensaje ya escrito.
// ---------------------------------------------------------------------------

/**
 * El numero del chat, el que dio el negocio para atender dudas.
 *
 * Hoy coincide con el `whatsapp.phone` del panel, pero son dos datos: aquel es
 * al que llega el comprobante del pedido, y lo puede cambiar el negocio sin que
 * el chat se mueva. En digitos y con la lada, porque Wati lo pega tal cual en su
 * enlace; whatsAppUrl() lo normaliza igualmente.
 */
export const CHAT_PHONE = '5219987566999';

/**
 * El hueco del enlace del platillo dentro del mensaje.
 *
 * Lo rellena el navegador, que es quien sabe en que dominio se esta viendo la
 * pagina: el `site` de astro.config.mjs no es el de la tienda. Son letras y
 * guiones bajos para que encodeURIComponent lo deje intacto y se pueda buscar
 * dentro del enlace ya codificado.
 */
export const CHAT_LINK_SLOT = '__dish_link__';

// El saludo por nombre —"Hola, Mamá Yaya."—, quitado por ahora: se queda en
// "Hola." Se apaga aqui y no se borra porque el nombre sigue llegando del panel,
// asi que volver a saludar con el es cambiar esta linea.
const GREET_BY_NAME = false;

interface ChatContext {
  /** El nombre de la tienda, del panel. Solo lo usa el saludo por nombre. */
  storeName?: string;
  /** El platillo, cuando la pantalla es su ficha. */
  dish?: string;
  /** Si la pantalla es una de las siete del pedido. */
  order?: boolean;
}

/**
 * El mensaje con el que se abre el chat: lo que el cliente se encuentra ya
 * escrito en WhatsApp, y que completa con su duda. Cuatro decisiones:
 *
 * - Dice DE QUE va la duda con palabras: el platillo en su ficha, el pedido en
 *   sus siete pantallas y el menu en la portada. "en línea" dice ademas por
 *   donde llega el chat.
 * - El enlace va solo en la ficha, que es donde dice algo: quien contesta abre
 *   el platillo de un toque. En el resto seria la direccion de la tienda, que no
 *   le dice nada a nadie. Va en su propio renglon y con otro debajo, para que la
 *   pregunta no se teclee pegada a el. Aqui va el hueco: ver CHAT_LINK_SLOT.
 * - Sin enlace acaba en un espacio, sin signo: WhatsApp deja el cursor al
 *   final, y lo siguiente que se teclea es la pregunta.
 * - Lleva acentos aunque la tienda escriba sin ellos, por lo mismo que
 *   src/lib/whatsapp.ts: se lee en la conversacion, junto a los textos del ERP.
 *
 * Sale sin codificar: lo codifica quien lo pega en un enlace, y tiene que ser
 * con encodeURIComponent —un `&`, un `#` o unas comillas en el nombre de un
 * platillo cortarian el mensaje—.
 */
export function chatMessage({ storeName, dish, order = false }: ChatContext): string {
  const greeting = GREET_BY_NAME && storeName ? `Hola, ${storeName}.` : 'Hola.';

  // La de la portada lleva su propio saludo porque es la frase tal como la pidio
  // el negocio.
  if (dish) return `${greeting} Tengo una duda sobre ${dish}\n${CHAT_LINK_SLOT}\n`;
  if (order) return `${greeting} Tengo una duda sobre mi pedido en línea `;
  return '¡Hola! Tengo una duda sobre el menú en línea ';
}
