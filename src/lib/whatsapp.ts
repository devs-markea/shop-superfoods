// Enlaces de WhatsApp.
//
// Los usan las dos pantallas de cierre: la de transferencia, donde el comprador
// manda su comprobante, y la de Mercado Pago, donde el pedido ya esta hecho.
//
// El mensaje sale de una plantilla de la configuracion de la tienda y lo rellena
// la propia tienda con los datos del pedido, que ya tiene. No hace falta que el
// backend lo componga: el unico dato que no conoce el front es la plantilla.

/** Valores que puede llevar un mensaje. Lo que falte deja su marcador visible. */
export interface MessageValues {
  folio?: string;
  total?: string;
  nombre?: string;
  estado?: string;
  metodo?: string;
}

/**
 * Rellena los marcadores `{clave}` de la plantilla.
 *
 * Un marcador desconocido se deja tal cual, a proposito: si el negocio escribe
 * `{sucursal}` en el panel, el mensaje sale con `{sucursal}` literal y alguien lo
 * nota. Es preferible a que la plantilla se rompa o a borrar texto en silencio.
 */
export function fillMessage(template: string, values: MessageValues): string {
  return template.replace(/\{(\w+)\}/g, (marker, key: string) => {
    const value = values[key as keyof MessageValues];
    return value ?? marker;
  });
}

/**
 * Enlace a un chat de WhatsApp con el mensaje ya escrito.
 *
 * Devuelve null si no hay telefono configurado, y quien llama decide que hacer con
 * eso: hoy las pantallas de cierre dejan el boton inerte en lugar de mandar a
 * nadie a un chat vacio.
 *
 * wa.me exige el numero en E.164 SIN el `+` ni separadores, asi que se limpia
 * aqui: `+52 998 123 4567` y `529981234567` valen igual.
 */
export function whatsAppUrl(phone: string, message: string): string | null {
  const digits = normalizePhone(phone);
  if (!digits) return null;

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
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
