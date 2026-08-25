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

  // Las redes del negocio, en el ORDEN en que se quieren pintar en el pie. Cada
  // una se escribe entera:
  //
  //   { network: 'instagram', label: 'Instagram', url: 'https://instagram.com/superfoods' }
  //
  // `network` solo puede ser uno de estos seis: facebook, instagram, whatsapp,
  // tiktok, youtube, x. Es con lo que se elige el icono, asi que cualquier otro
  // se ignora. La `url` va ABSOLUTA y con https://, y la de WhatsApp escrita ya
  // como https://wa.me/<numero> —el enlace, no el telefono—.
  //
  // Vacio a proposito: los perfiles los publica el panel, y esta lista se usa
  // entera o nada, nunca mezclada con la suya. Sin redes en ninguno de los dos
  // sitios el pie no pinta la fila de iconos, que es lo correcto: no hay perfil
  // al que mandar.
  //
  // OJO: el WhatsApp de aqui NO es el `whatsapp.phone` de abajo. Aquel es el
  // numero al que llega el comprobante del pedido; este es un enlace mas del
  // pie, y el negocio puede querer apuntarlo a otro numero.
  socialLinks: [],

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

  // Vacia a proposito, por lo mismo que la ubicacion y con mas motivo: una CLABE
  // equivocada manda el dinero del comprador a otra cuenta. La cuenta la publica
  // el panel, y esta se usa ENTERA o nada —no se cose el titular de aqui con la
  // CLABE de alla—, asi que con dejarse uno de los tres no hay respaldo.
  //
  // Sin cuenta en ninguno de los dos sitios, /mamayaya/pago no ofrece la
  // transferencia: quedan el efectivo y Mercado Pago. Es la degradacion de
  // siempre —no se ofrece lo que no se puede cumplir—, no un error.
  bankTransfer: {
    holder: '',
    bank: '',
    // 18 digitos seguidos, sin espacios: es lo que se copia al portapapeles.
    clabe: '',
  },

  location: {
    // Vacias a proposito: la ubicacion ya la sirve el panel, y una direccion
    // equivocada aqui mandaria al comprador al local de otro. Si algun dia hace
    // falta respaldo, va la direccion real de la tienda.
    //
    // Los tres sirven por separado: con direccion el modal se abre sin boton, con
    // enlace el boton lleva a Maps sin direccion que leer, y la abreviada rotula
    // el pin de la barra aunque no haya ninguna de las otras dos. Sin direccion ni
    // enlace, el modal no existe y el icono no lo ofrece.
    address: '',
    // La ABREVIADA, maximo 60. No es la de arriba recortada: es el trozo que el
    // negocio elige para decir donde esta, y se escribe a mano igual que ella.
    shortAddress: '',
    mapsUrl: '',
  },

  delivery: {
    // Modos: 'none' (nunca), 'always' (siempre) o 'threshold' (a partir de un
    // importe). Con 'threshold' hay que poner tambien el importe.
    freeShipping: { mode: 'threshold', threshold: 400 },
    // Desde que se hace el pedido hasta que llega a la puerta, traslado incluido.
    estimate: '25-35 min',
  },

  pickup: {
    // En cuanto esta listo en el mostrador. Es OTRA promesa: aqui no hay
    // traslado, asi que suele ser menos que la de arriba. No se copia de
    // `delivery.estimate` ni al reves —quien viene al local esperaria de mas—.
    estimate: '10-15 min',
  },

  tips: { enabled: true, amounts: [0, 15, 30] },

  legal: {
    // Sin ella, "Terminos y condiciones" se rotula pero no enlaza.
    termsUrl: '',
  },

  home: {
    // El banner de la portada. Vacio a proposito: es una campana, y la campana
    // la escribe el panel —cambia con la temporada, con la promocion o con la
    // foto nueva—. Un titular de respaldo seguiria anunciando en enero lo que se
    // escribio en agosto.
    //
    // Las tres claves sirven por separado: con titulo se pinta una franja de
    // texto, con imagen un fondo, y con las dos el banner entero. Sin ninguna no
    // hay banner y la portada abre directamente en el catalogo.
    banner: {
      // Maximo 80.
      title: '',
      // Maximo 180.
      description: '',
      // URL ABSOLUTA (https://...). No se concatena con ninguna base: el backend
      // ya compone el dominio, que cambia entre local, staging y produccion.
      image: '',
    },
  },
};
