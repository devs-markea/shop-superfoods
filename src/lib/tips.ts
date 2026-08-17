// ---------------------------------------------------------------------------
// La propina: que importes se ofrecen y cual se acepta.
//
// Isomorfico a proposito, como src/lib/checkout.ts: no importa nada de
// `astro:env`, asi que lo usan por igual el frontmatter de /pago —que pinta los
// botones y el total del primer render— y el script del navegador, que atiende
// el importe libre de "Otro".
//
// La API valida MUY poco: `tip` solo tiene que ser numerico y >= 0. Ni entero,
// ni acotado, ni uno de los importes configurados. Es decir, el importe libre
// cabe en el contrato, y tambien cabria un 12.5 o un 999999999. Quien decide
// que es una propina razonable es esta pantalla, y por eso las reglas viven
// aqui y no repartidas entre el componente, el script y la cookie.
// ---------------------------------------------------------------------------

/**
 * Digitos que caben en el campo de "Otro", y con ellos el tope del importe.
 *
 * Se define por digitos y no por importe para que el `maxlength` del campo y la
 * validacion sean la misma regla: lo que se puede teclear es exactamente lo que
 * se acepta, y no hay forma de escribir algo que luego se rechace en silencio.
 */
export const TIP_MAX_DIGITS = 5;

/** 99999. Un tope, no una expectativa: esta para frenar el cero de mas. */
export const TIP_MAX = 10 ** TIP_MAX_DIGITS - 1;

/**
 * Un importe de propina valido, o null.
 *
 * Entero y entre 0 y TIP_MAX. Se rechaza —en vez de recortar— porque un valor
 * fuera de rango no viene de alguien eligiendo: viene de una cookie manipulada,
 * de una version anterior o de un dedo en el teclado numerico. Recortarlo
 * inventaria una decision; devolver null deja que quien llama caiga a 0, que es
 * la propina que nadie discute.
 *
 * Acepta cadenas porque de ahi llegan los dos origenes del navegador: el `value`
 * del radio y lo que se teclea en "Otro".
 */
export function parseTipAmount(value: unknown): number | null {
  if (typeof value === 'string' && value.trim() === '') return null;

  const amount = typeof value === 'string' ? Number(value.trim()) : value;

  if (typeof amount !== 'number' || !Number.isInteger(amount)) return null;
  if (amount < 0 || amount > TIP_MAX) return null;

  return amount;
}

/**
 * Los importes del panel, listos para pintarse como botones.
 *
 * Hace tres cosas, y las tres por el mismo motivo —que el selector no dependa de
 * como venga configurado el negocio—:
 *
 *   1. Descarta lo que no es un importe (texto, negativos, decimales) y los
 *      repetidos, que darian dos botones identicos.
 *   2. Ordena de menor a mayor. La API los manda ordenados, pero el orden es lo
 *      que hace legible una fila de importes y no cuesta nada garantizarlo.
 *   3. **Antepone el 0**, si no venia ya.
 *
 * El 0 es el punto tres y el importante. "No dejar propina" es una opcion del
 * contrato —la API acepta `tip: 0`, y el respaldo de la tienda lo lista— pero el
 * panel no tiene por que incluirlo, y hoy no lo incluye: `GET /api/store`
 * responde `[5, 10, 11, 15]`. Sin el, la unica salida de quien no quiere dejar
 * propina es "Otro", que ni lo dice ni lo parece. Asi que el 0 no se pide al
 * negocio: se garantiza aqui. Los importes son de quien vende; poder no dejar
 * propina es de quien compra.
 *
 * Sin ningun importe positivo devuelve la lista vacia y no un `[0]`: un selector
 * con un solo boton que ademas es "nada" no es un selector, es un adorno.
 */
export function normalizeTipAmounts(amounts: unknown): number[] {
  if (!Array.isArray(amounts)) return [];

  const positives = [
    ...new Set(
      amounts
        .map(parseTipAmount)
        .filter((amount): amount is number => amount !== null && amount > 0),
    ),
  ].sort((a, b) => a - b);

  return positives.length > 0 ? [0, ...positives] : [];
}

/**
 * Si el importe elegido se escribio en "Otro" en vez de pulsarse.
 *
 * Es lo que decide, en el servidor, si el campo libre nace abierto y con su
 * valor dentro: al volver a /pago desde la pantalla de transferencia, una
 * propina de $23 tiene que seguir siendo $23 y verse donde se escribio.
 */
export function isCustomTip(tip: number, amounts: readonly number[]): boolean {
  return tip > 0 && !amounts.includes(tip);
}
