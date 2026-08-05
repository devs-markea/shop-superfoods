// ---------------------------------------------------------------------------
// Respaldo de la configuracion de la tienda.
//
// EDITAR A MANO. Es el unico sitio del proyecto pensado para tocarse sin ser
// programador: son los valores que la tienda usa cuando `GET /api/store` no
// responde, o cuando responde sin un dato concreto porque nadie lo ha
// configurado todavia en el panel.
//
// Manda la API. Esto solo rellena huecos, dato a dato: si el panel tiene
// telefono y no tiene CLABE, se usa el telefono de la API y la CLABE de aqui.
//
// REGLA: vacio significa "sin configurar", y la interfaz degrada sola —el boton
// de WhatsApp no navega, los terminos no enlazan, el icono de ubicacion no se
// muestra—. Nunca se rellena con un valor inventado para que algo parezca
// funcionar: un telefono equivocado manda al comprador con un desconocido y una
// CLABE equivocada manda su dinero a otra cuenta.
// ---------------------------------------------------------------------------

import type { StoreSettings } from '../lib/store-config.ts';

export const storeFallback: StoreSettings = {
  name: 'SuperFoods',

  whatsapp: {
    // Telefono de la tienda. Se acepta escrito como se quiera —con lada, con
    // espacios, con el 1 de los moviles mexicanos—: se normaliza al pintarlo.
    phone: '+52 1 998 756 6999',
    templates: {
      paymentProof:
        'Hola, envio el comprobante de mi pedido #{folio} por {total} a nombre de {nombre}.',
      orderPlaced: 'Hola, acabo de hacer el pedido #{folio} por {total} a nombre de {nombre}.',
    },
  },

  bankTransfer: {
    holder: 'SuperFoods Restaurante SA de CV',
    bank: 'BBVA',
    // 18 digitos seguidos, sin espacios: es lo que se copia al portapapeles.
    clabe: '012345678901234567',
  },

  location: {
    // Vacias a proposito: la ubicacion ya la sirve el panel, y una direccion
    // equivocada aqui mandaria al comprador al local de otro. Si algun dia hace
    // falta respaldo, va la direccion real de la tienda.
    //
    // Los dos sirven por separado: con direccion el modal se abre sin boton, con
    // enlace el boton lleva a Maps sin direccion que leer. Sin ninguno de los
    // dos, el icono de ubicacion no aparece.
    address: '',
    mapsUrl: '',
  },

  delivery: {
    // Modos: 'none' (nunca), 'always' (siempre) o 'threshold' (a partir de un
    // importe). Con 'threshold' hay que poner tambien el importe.
    freeShipping: { mode: 'threshold', threshold: 400 },
    estimate: '25-35 min',
  },

  tips: { enabled: true, amounts: [0, 15, 30] },

  legal: {
    // Sin ella, "Terminos y condiciones" se rotula pero no enlaza.
    termsUrl: '',
  },
};
