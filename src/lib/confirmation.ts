// ---------------------------------------------------------------------------
// Que dice el acuse, segun lo que de verdad paso con el pago.
//
// /pedido-confirmado es la pantalla de vuelta de Mercado Pago, y ahi el pedido
// puede estar en media docena de situaciones distintas: pagado, esperando que el
// webhook confirme, rechazado por falta de fondos, cancelado por el comprador,
// creado sin que la pasarela llegara a abrirse... Cada una necesita otro titular,
// otro aviso y otra accion, y decirlas mal tiene coste en las dos direcciones:
// prometer un pedido confirmado que nadie pago, o pedirle el dinero otra vez a
// quien ya pago.
//
// Aqui se decide todo eso, en un solo sitio y sin marcado, para que la pantalla
// solo tenga que pintar lo que se le devuelve.
//
// Dos reglas que vienen del contrato de la API:
//
//   1. NO se interpretan los parametros de la URL de vuelta. Los pone el cliente
//      y no son de fiar: la verdad la pone el webhook, y se lee releyendo el
//      pedido. Aqui no entra la URL.
//   2. El pago NO se deduce del estado del pedido a secas, sino del METODO mas el
//      estado. `in_preparation` significa "pagado" en Mercado Pago -solo el
//      webhook lleva la orden ahi- y es el estado INICIAL en efectivo, donde no
//      dice nada del pago.
// ---------------------------------------------------------------------------

import type { PaymentMethod, StoreOrder } from './checkout.ts';

/** Que accion se ofrece al pie. La pantalla la traduce a un control. */
export type ConfirmationAction =
  /** Abrir el chat de la tienda: el pedido esta hecho y no hay nada que pagar. */
  | { kind: 'whatsapp' }
  /** Volver a leer el pedido: falta que llegue una confirmacion de fuera. */
  | { kind: 'refresh' }
  /** Abrir un cobro nuevo contra POST /api/orders/{id}/payment. */
  | { kind: 'pay'; label: string };

export interface ConfirmationView {
  /** Sello: verde con visto, o dorado con reloj. */
  state: 'success' | 'pending';
  title: string;
  /** Que pasa a continuacion, en una linea. Va bajo el titular. */
  note: string;
  /** Si se rotula el folio. Un pedido sin cobrar no se rotula como comprobante. */
  showFolio: boolean;
  action: ConfirmationAction;
  /** Aviso corto bajo el boton. */
  actionNote?: string;
}

/** Estados en los que el pedido ya esta cobrado y en marcha. */
const PAID = ['paid', 'in_preparation', 'ready', 'delivered'];

/** Estados terminales que no son un cobro fallido, sino un pedido que ya no vive. */
const CLOSED = ['cancelled', 'rejected', 'expired'];

const REFUNDED = ['refunded', 'partially_refunded'];

/**
 * El acuse de un pedido en marcha, que es el caso normal de los tres metodos.
 *
 * El titular no se queda en "Pedido confirmado" para siempre: la cookie del pedido
 * dura un dia, asi que se vuelve aqui con el pedido ya listo o ya entregado, y
 * prometer un aviso que llego hace horas envejece mal.
 *
 * En efectivo no se afirma que este pagado -se paga al recibirlo- pero si que el
 * pedido esta en marcha, que es lo que el comprador necesita saber.
 */
function placed(method: PaymentMethod, order: StoreOrder): ConfirmationView {
  const pickup = order.deliveryType === 'pickup';

  if (order.status === 'delivered') {
    return {
      state: 'success',
      title: 'Pedido entregado',
      note: 'Gracias por tu compra.',
      showFolio: true,
      action: { kind: 'whatsapp' },
    };
  }

  if (order.status === 'ready') {
    return {
      state: 'success',
      title: 'Tu pedido esta listo',
      note: pickup ? 'Pasa por el local a recogerlo.' : 'Ya salio de la cocina.',
      showFolio: true,
      action: { kind: 'whatsapp' },
    };
  }

  // Al recoger se paga en el local, a domicilio al recibirlo. La API acepta las
  // seis combinaciones de metodo y entrega, asi que el aviso lo decide la entrega y
  // no el metodo.
  const cashNote = pickup
    ? ' Lo pagas en efectivo al recogerlo.'
    : ' Lo pagas en efectivo al recibirlo.';

  return {
    state: 'success',
    title: 'Pedido confirmado',
    note:
      'Te avisaremos por WhatsApp cuando tu pedido este listo.' +
      (method === 'efectivo' ? cashNote : ''),
    showFolio: true,
    action: { kind: 'whatsapp' },
  };
}

/**
 * Lo que se rotula cuando no hay pedido que leer: se entro directo a la pantalla,
 * sin pasar por el pago. Se mantiene revisable -el diseno se puede ver- sin
 * afirmar nada de un pedido que no existe.
 */
export function confirmationWithoutOrder(): ConfirmationView {
  return {
    state: 'success',
    title: 'Pedido confirmado',
    note: 'Te avisaremos por WhatsApp cuando tu pedido este listo.',
    showFolio: true,
    action: { kind: 'whatsapp' },
  };
}

/**
 * Con que metodo se cerro un pedido, cuando la cookie que lo apunta ya no esta.
 *
 * Es un ultimo recurso: la API no devuelve el metodo, asi que lo unico firme es el
 * bloque `payment`, que solo viaja en Mercado Pago. Entre los otros dos se elige
 * por el modo de entrega, que si viaja: al recoger se paga en efectivo y a
 * domicilio, por transferencia. Es lo que ofrece hoy la tienda, no una regla de la
 * API -que acepta las seis combinaciones-, asi que puede errar el rotulo de un
 * pedido raro. Con la cookie en pie nunca se usa.
 */
export function inferMethod(order: StoreOrder | null): PaymentMethod {
  if (order?.payment) return 'mercado_pago';
  return order?.deliveryType === 'pickup' ? 'efectivo' : 'bank_transfer';
}

/**
 * El acuse, resuelto.
 *
 * @param method   Metodo con el que se cerro. La API no lo devuelve: lo guarda la
 *                 cookie del pedido, y sin el no se puede leer el estado.
 * @param order    El pedido recien releido de la API.
 * @param chargeStarted  Si la pasarela llego a abrirse. Solo se conoce en Mercado
 *                 Pago y solo lo sabe la tienda; `undefined` es "no aplica".
 */
export function resolveConfirmation(
  method: PaymentMethod,
  order: StoreOrder,
  chargeStarted?: boolean,
): ConfirmationView {
  // --- Lo que vale para los tres metodos ---------------------------------

  if (REFUNDED.includes(order.status)) {
    return {
      state: 'pending',
      title: order.statusLabel,
      note: 'Tu pago se devolvio. Escribenos si necesitas ayuda con este pedido.',
      showFolio: true,
      action: { kind: 'whatsapp' },
    };
  }

  if (CLOSED.includes(order.status)) {
    return {
      state: 'pending',
      title: order.statusLabel,
      note: 'Este pedido ya no esta en curso. Escribenos si crees que es un error.',
      showFolio: true,
      action: { kind: 'whatsapp' },
    };
  }

  // --- Mercado Pago: el unico metodo que cobra por pasarela --------------
  //
  // Y por eso el unico con estados que no dependen de nadie de la tienda: entre
  // la vuelta del comprador y el webhook pueden pasar unos segundos, y un cobro
  // puede morir sin que el pedido se mueva de sitio.
  if (method === 'mercado_pago') {
    if (PAID.includes(order.status)) return placed(method, order);

    const { rejection } = order.payment ?? {};

    // El cobro murio. El motivo llega ya traducido y escrito para el comprador,
    // asi que se muestra tal cual: es el que distingue "no tienes fondos" -prueba
    // otra tarjeta- de "revisa el codigo de seguridad" -corrige y reintenta con la
    // misma-, y son salidas distintas.
    if (rejection) {
      return {
        state: 'pending',
        title: 'No pudimos cobrar tu pago',
        note: rejection.message,
        // El pedido existe, pero rotular su folio junto a un pago que fallo lo
        // haria parecer un comprobante.
        showFolio: false,
        action: rejection.retryable
          ? { kind: 'pay', label: 'Reintentar el pago' }
          : { kind: 'whatsapp' },
        actionNote: rejection.retryable
          ? 'Tu pedido se conserva: solo se cobra de nuevo.'
          : 'Tu pedido se conserva. Escribenos y lo resolvemos.',
      };
    }

    // Sin rechazo, "Pago pendiente" significa una de dos cosas, y la API no las
    // distingue. Lo que las separa es si el cobro llego a abrirse, que solo lo
    // sabe la tienda.
    if (chargeStarted === false) {
      return {
        state: 'pending',
        title: 'Tu pedido esta guardado',
        note: 'No pudimos abrir el pago, asi que todavia no se ha cobrado nada.',
        showFolio: false,
        action: { kind: 'pay', label: 'Pagar ahora' },
        actionNote: 'Tu pedido se conserva mientras completas el pago.',
      };
    }

    return {
      state: 'pending',
      title: 'Estamos confirmando tu pago',
      note: 'Mercado Pago nos lo confirma en unos segundos. Tu pedido ya esta guardado.',
      showFolio: true,
      action: { kind: 'refresh' },
      actionNote: 'Puedes actualizar en unos segundos para ver el estado.',
    };
  }

  // --- Transferencia y efectivo ------------------------------------------
  //
  // No pasan por aqui en su flujo normal -cierran en /pedido-recibido-, pero se
  // llega releyendo la pantalla: una transferencia ya confirmada por la tienda
  // acaba en este acuse, y de un pedido en efectivo se puede volver por el
  // historial.
  if (method === 'bank_transfer' && order.status === 'awaiting_verification') {
    return {
      state: 'pending',
      title: 'Pedido recibido',
      note: 'Estamos revisando tu comprobante. Te confirmamos por WhatsApp.',
      showFolio: true,
      action: { kind: 'whatsapp' },
    };
  }

  return placed(method, order);
}
