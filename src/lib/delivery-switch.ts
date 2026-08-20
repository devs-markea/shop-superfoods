// ---------------------------------------------------------------------------
// El switch de entrega: "A domicilio" / "Para recoger".
//
// El mismo control aparece en dos pantallas y decide cosas distintas en cada
// una: en el listado, cual de los dos pares de metas se lee en la barra de
// pedido; en /mamayaya/datos, si hay que decir donde entregar. Lo que comparten es la
// ELECCION, y por eso vive donde vive el resto del pedido a medias: en el
// borrador (src/lib/checkout-draft.ts), no en la URL.
//
// Elegirlo en el listado es un atajo, no una decision cerrada: /mamayaya/datos llega con
// el modo ya puesto —quien sabe que va a recoger no tiene que decirlo dos
// veces— y ahi se puede cambiar. La ultima palabra sigue siendo la del
// formulario, que es quien manda el pedido.
//
// Sin nada guardado —primera visita, o borrador caducado— queda 'delivery'. El
// defecto no se repite aqui: es el de EMPTY_DRAFT, y hay uno solo.
//
// Los `value` de los radios son los del diseno ("domicilio" / "recoger") y el
// contrato de la API habla de 'delivery' / 'pickup'. La traduccion esta aqui, una
// vez, para que el marcado y los dos scripts no la escriban cada uno a su manera.
// ---------------------------------------------------------------------------

import { patchDraft, readDraft } from './checkout-draft.ts';
import type { DeliveryType } from './checkout.ts';

/** El `name` de los radios. Es tambien por donde se busca el switch. */
export const DELIVERY_FIELD = 'delivery';

/** Del contrato al marcado. */
export const SWITCH_VALUE: Record<DeliveryType, string> = {
  delivery: 'domicilio',
  pickup: 'recoger',
};

/**
 * Del marcado al contrato. Todo lo que no sea "recoger" es a domicilio: un value
 * inventado no puede acabar en un pedido sin direccion de entrega.
 */
export function toDeliveryType(value: string | null | undefined): DeliveryType {
  return value === SWITCH_VALUE.pickup ? 'pickup' : 'delivery';
}

// --- Solo navegador ------------------------------------------------------

/** El modo marcado en un switch ya pintado. Sin marca, el defecto. */
export function checkedDeliveryType(scope: ParentNode): DeliveryType {
  return toDeliveryType(
    scope.querySelector<HTMLInputElement>(`input[name="${DELIVERY_FIELD}"]:checked`)?.value,
  );
}

/**
 * Conecta un switch con el borrador, en las dos direcciones: guarda lo que se
 * elige y repone lo guardado cuando el documento vuelve a la vista.
 *
 * `onSync` recibe el modo vigente en los tres momentos —al arrancar, al elegir y
 * al reponer— para que la pantalla que dependa de el no tenga que escuchar por su
 * cuenta ni adivinar cuando ha cambiado.
 *
 * Lo que se repone es el borrador y no el DOM, porque el DOM puede haber quedado
 * atras: otra pestana eligio distinto, o el borrador caduco —dura dos horas— y
 * entonces lo que ensena el switch ya no se va a guardar en ninguna parte. En ese
 * caso vuelve al defecto, que es como llega quien entra por primera vez.
 */
export function bindDeliverySwitch(
  scope: ParentNode,
  onSync?: (type: DeliveryType) => void,
): void {
  const radios = Array.from(
    scope.querySelectorAll<HTMLInputElement>(`input[name="${DELIVERY_FIELD}"]`),
  );

  if (radios.length === 0) return;

  const apply = (type: DeliveryType): void => {
    for (const radio of radios) radio.checked = radio.value === SWITCH_VALUE[type];
    onSync?.(type);
  };

  const restore = (): void => apply(readDraft().deliveryType);

  for (const radio of radios) {
    radio.addEventListener('change', () => {
      // Los dos radios avisan del cambio: el que se marca y el que se desmarca.
      if (!radio.checked) return;

      const type = toDeliveryType(radio.value);

      patchDraft({ deliveryType: type });
      onSync?.(type);
    });
  }

  // pageshow con `persisted` es la vuelta atras desde la cache del navegador: el
  // documento se reutiliza tal cual quedo y este script no vuelve a correr, asi
  // que es el unico momento en el que se puede releer el borrador.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) restore();
  });

  // Y esta es la pestana que solo estuvo dormida: el documento sigue vivo, pero
  // el borrador puede haber caducado mientras. Al volver, el switch dice la
  // verdad —lo guardado, o el defecto— en lugar de una eleccion ya perdida.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') restore();
  });

  // Al arrancar. El servidor ya pinto el switch con el borrador, asi que esto no
  // mueve nada de sitio; sirve para la recarga —donde el navegador repone el
  // estado de los formularios— y para dar a `onSync` su primer valor sin que la
  // pantalla tenga que sacarlo del DOM por su cuenta.
  restore();
}
