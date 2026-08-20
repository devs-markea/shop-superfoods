// ---------------------------------------------------------------------------
// El selector de ubicacion: un mapa con un pin, dentro de la hoja de /mamayaya/datos.
//
// COMO SE ELIGE UN PUNTO
//
// El pin NO se arrastra: esta clavado en el centro de la hoja y lo que se mueve
// es el mapa por debajo. Es como lo hacen las apps de reparto, y no es un
// capricho de estilo: con el dedo encima de un pin de 24 px no se ve lo que hay
// debajo, y en un movil eso es justo el numero de la casa que se esta buscando.
// Moviendo el mapa, el punto elegido siempre queda a la vista.
//
// Por eso tampoco hay marcador de Google: el pin es un elemento de la pagina
// puesto en el centro con CSS, y el punto es `map.getCenter()`. Un
// AdvancedMarkerElement obligaria ademas a configurar un Map ID en la consola de
// Google para pintar lo mismo.
//
// EL NAVEGADOR YA NO ELIGE
//
// Antes el boton pedia la posicion al navegador y la guardaba. Sin sensor —un
// escritorio, o un movil con el GPS apagado— lo que responde se deduce de la IP
// del proveedor y puede caer en otra ciudad: de ahi salian pedidos con un envio
// medido contra un punto donde no vive nadie.
//
// Aqui la geolocalizacion solo MUEVE LA CAMARA, con el boton de la diana. El
// punto sigue siendo el que el comprador confirma, asi que una lectura mala se
// ve en el mapa antes de aceptarla en lugar de descubrirse en el importe.
//
// AQUI NO SE LEE NINGUNA DIRECCION
//
// El mapa no rotula que hay bajo el pin, y es a proposito. La direccion la
// resuelve el BACKEND al cotizar (`POST /api/shipping/quote` devuelve `address`),
// que es ademas la que acaba en el pedido: leerla tambien aqui seria pagarle a
// Google por un dato que ya se tiene.
//
// Y no solo por el importe. `idle` salta en CADA parada del mapa —arrastrar,
// soltar, acercar, ajustar—, asi que buscar una casa disparaba cinco o seis
// consultas y el texto iba y venia entre coordenadas y calle en cada una. Lo que
// confirma el sitio es el mapa, con sus nombres de calle pintados y el pin sobre
// el techo; la direccion escrita aparece al aceptar, en /mamayaya/datos, ya resuelta.
//
// SI EL MAPA NO CARGA, EL RESPALDO ES EL DISPOSITIVO
//
// Sin clave, con una clave rechazada, sin red o con el script de Google bloqueado,
// la hoja se queda sin mapa. Entonces —y SOLO entonces— ofrece la posicion del
// dispositivo, que es el otro sitio de donde puede salir un punto sin pedirle al
// comprador que copie nada.
//
// Con el filtro de precision puesto, que ahi importa mas que en ningun otro sitio:
// no hay mapa donde ver si el punto cae en su calle o en otra ciudad, asi que lo
// unico que separa un GPS de una posicion deducida de la IP es `coords.accuracy`.
// Lo que pase de MAX_ACCURACY_METERS no se acepta, y se dice por que.
//
// Si tampoco hay posicion utilizable, la hoja lo cuenta y ya: aqui se acaban los
// caminos. La ubicacion es OBLIGATORIA a domicilio —sin punto, /mamayaya/datos no deja
// continuar—, asi que lo que se ofrece es reintentar: dar el permiso, salir al
// aire libre o recargar la pantalla para que el mapa tenga otra oportunidad.
//
// Solo navegador. Lo consume src/scripts/delivery-form.ts, que es quien sabe que
// hacer con el punto: rotularlo, cotizarlo y guardarlo.
// ---------------------------------------------------------------------------

import { loadGoogleMaps } from './google-maps.ts';
import { mountPlaceSearch } from './place-search.ts';

/** Centro de Cancun. Donde abre el mapa cuando no hay punto previo. */
const CANCUN = { lat: 21.1619, lng: -86.8515 };

/** Zoom de ciudad, para buscar; y el de portal, cuando ya hay un punto. */
const CITY_ZOOM = 13;
const SPOT_ZOOM = 18;

/**
 * Hasta que imprecision se acepta una posicion del dispositivo, en metros.
 *
 * Un GPS da decenas de metros y una posicion por wifi, unos cientos. Lo que pasa
 * de aqui viene de la IP del proveedor —decenas de kilometros, a veces otra
 * ciudad— y con eso el envio se cotiza contra un trayecto que nadie va a hacer.
 *
 * Solo se aplica al respaldo, y ahi es la unica defensa que queda: con el mapa
 * delante, un punto malo se ve y se corrige arrastrando; sin mapa, nadie lo mira.
 */
const MAX_ACCURACY_METERS = 5000;

export interface MapPicker {
  /** Abre la hoja, centrada en `start` si lo hay. */
  open: (start?: { lat: number; lng: number } | null) => void;
}

/**
 * Monta el selector sobre el marcado de <LocationPicker>.
 *
 * `onPick` recibe el punto confirmado —por el mapa o por el respaldo—, que es lo
 * unico que sale de aqui: esta pieza no sabe que es un envio ni que hay un
 * borrador.
 *
 * Devuelve null si la hoja no esta en la pagina.
 */
export function createMapPicker(onPick: (lat: number, lng: number) => void): MapPicker | null {
  const sheet = document.getElementById('location-input');
  if (!(sheet instanceof HTMLDialogElement)) return null;

  const root = sheet.querySelector<HTMLElement>('[data-map-picker]');
  const canvas = sheet.querySelector<HTMLElement>('[data-map-canvas]');
  const stage = sheet.querySelector<HTMLElement>('[data-map-stage]');
  const searchSlot = sheet.querySelector<HTMLElement>('[data-map-search]');
  const applyButton = sheet.querySelector<HTMLButtonElement>('[data-map-apply]');
  const locateButton = sheet.querySelector<HTMLButtonElement>('[data-map-locate]');
  const status = sheet.querySelector<HTMLElement>('[data-map-status]');

  // El respaldo, que solo se destapa si el mapa no llega a cargar.
  const offline = sheet.querySelector<HTMLElement>('[data-map-offline]');
  const offlineError = sheet.querySelector<HTMLElement>('[data-map-offline-error]');
  const geolocateButton = sheet.querySelector<HTMLButtonElement>('[data-map-geolocate]');

  /**
   * Donde ABRE el mapa. El punto que se confirma no sale de aqui: lo dice el
   * propio mapa al aceptar, que es la unica lectura que no puede quedarse atras.
   */
  let opening = CANCUN;

  let map: google.maps.Map | null = null;
  let booting: Promise<void> | null = null;

  const setStatus = (message: string | null): void => {
    if (!status) return;
    status.textContent = message ?? '';
    status.hidden = !message;
  };

  const showOfflineError = (message: string | null): void => {
    if (!offlineError) return;
    offlineError.textContent = message ?? '';
    offlineError.hidden = !message;
  };

  /**
   * El mapa no se puede usar: sin clave, con una clave rechazada, sin red o
   * demasiado lento.
   *
   * La hoja cambia de piel: se va el mapa con su buscador y su boton de aceptar
   * —sin mapa, aceptar confirmaria el centro de Cancun como si fuera el domicilio
   * de alguien— y queda el respaldo, que pide la posicion al dispositivo.
   *
   * No se cuenta POR QUE fallo: "la clave no esta configurada" no es asunto de
   * quien esta comprando. Solo que no hay mapa y que hay otra forma.
   */
  const showFailure = (): void => {
    searchSlot?.setAttribute('hidden', '');
    stage?.setAttribute('hidden', '');
    applyButton?.setAttribute('hidden', '');
    setStatus(null);

    // Sin geolocalizacion tampoco hay respaldo que ofrecer: el boton se retira en
    // lugar de quedarse ahi para fallar al pulsarlo. Entonces esta hoja no puede
    // dar ningun punto, y sin punto no se continua: queda recargar la pantalla,
    // que es lo que le da al mapa otra oportunidad.
    if (!('geolocation' in navigator)) geolocateButton?.setAttribute('hidden', '');

    offline?.removeAttribute('hidden');
  };

  // El respaldo en si: la posicion del dispositivo, con su filtro de precision.
  //
  // Aqui el punto se ACEPTA a ciegas —no hay mapa donde verlo— asi que se rechaza
  // todo lo que no parezca un GPS de verdad. Es preferible quedarse sin cotizacion
  // que cobrar un envio medido contra la centralita del proveedor de internet.
  //
  // Lo que si se puede comprobar despues: el rotulo que queda bajo el boton en
  // /mamayaya/datos enlaza al punto en Google Maps.
  geolocateButton?.addEventListener('click', () => {
    if (!('geolocation' in navigator)) return;

    geolocateButton.disabled = true;
    showOfflineError(null);

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        geolocateButton.disabled = false;

        if (coords.accuracy > MAX_ACCURACY_METERS) {
          showOfflineError(
            'Tu dispositivo dio una ubicacion aproximada, de varios kilometros, y con ella no sabriamos a donde llevar tu pedido. Intentalo otra vez al aire libre, o con el GPS encendido.',
          );
          return;
        }

        sheet.close();
        onPick(coords.latitude, coords.longitude);
      },
      () => {
        // Permiso denegado, sin senal o agotado el plazo.
        geolocateButton.disabled = false;
        showOfflineError(
          'No pudimos obtener tu ubicacion. Revisa el permiso de ubicacion de tu navegador y vuelve a intentarlo: tu pedido necesita un punto en el mapa.',
        );
      },
      // enableHighAccuracy pide el sensor de verdad en lugar de la posicion
      // deducida de la red, que es la que se va a otra ciudad. Tarda mas —de ahi
      // los 20 segundos— y gasta mas bateria, y las dos cosas valen la pena
      // cuando de ese punto sale un importe.
      //
      // maximumAge en 0: nada de reutilizar una posicion cacheada de antes, que
      // puede ser de otro sitio.
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
  });

  /** Arranca el mapa. Se hace una vez, y siempre con la hoja ya abierta. */
  const boot = async (key: string): Promise<void> => {
    if (!canvas) throw new Error('La hoja no tiene donde pintar el mapa');

    const maps = await loadGoogleMaps(key);

    map = new maps.Map(canvas, {
      center: opening,
      zoom: CITY_ZOOM,
      // Lo que sobra en un mapa que solo sirve para senalar un domicilio: el
      // callejero de Google, Street View, el tipo de mapa y la pantalla
      // completa. Cada uno de esos controles es una manera de salir de la tarea.
      disableDefaultUI: true,
      zoomControl: true,
      clickableIcons: false,
      // Un dedo arrastra el mapa; para hacer zoom, dos. Sin esto, bajar por la
      // pagina con el dedo sobre el mapa mueve el mapa en lugar de la pantalla.
      gestureHandling: 'greedy',
    });

    // No hay listener de `idle`: el punto no se va apuntando conforme el mapa se
    // mueve, se lee UNA VEZ al aceptar. Escucharlo obligaba a mantener una copia
    // del centro al dia, y una copia es justamente lo que puede quedarse atras.

    // El buscador de direcciones, encima del mapa: es lo que hace que el
    // selector sirva sin GPS. El mismo que monta el panel en linea, y con el
    // mismo trato —acerca la camara, no confirma nada—. Ver
    // src/lib/place-search.ts.
    if (searchSlot) {
      await mountPlaceSearch(maps, searchSlot, (spot) => {
        map?.setCenter(spot);
        map?.setZoom(SPOT_ZOOM);
      });
    }
  };

  // Aceptar es el unico momento en el que se lee el punto, y se lee del mapa: lo
  // que hay bajo el pin en ese instante es lo que se guarda, sin intermediarios
  // que puedan haberse quedado en la parada anterior.
  applyButton?.addEventListener('click', () => {
    const spot = map?.getCenter();

    sheet.close();
    onPick(spot?.lat() ?? opening.lat, spot?.lng() ?? opening.lng);
  });

  // La diana: mueve la camara donde este el comprador. No elige el punto —de eso
  // se encarga el pin— asi que una lectura de las malas, deducida de la IP, se ve
  // en el mapa y se corrige arrastrando en lugar de acabar en el pedido.
  //
  // Y por eso AQUI no hay filtro de precision, al contrario que en el respaldo de
  // abajo: mover la camara a un sitio equivocado no cuesta nada, el mapa esta
  // delante. Lo que se filtra es aceptar un punto sin poder verlo.
  locateButton?.addEventListener('click', () => {
    if (!('geolocation' in navigator) || !map) return;

    locateButton.disabled = true;

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        locateButton.disabled = false;
        map?.setCenter({ lat: coords.latitude, lng: coords.longitude });
        map?.setZoom(SPOT_ZOOM);
      },
      () => {
        // Permiso denegado o sin senal. No se avisa de nada: el mapa esta
        // delante y se puede mover a mano, que es el camino principal.
        locateButton.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });

  return {
    open(start) {
      // El aviso del respaldo es del intento anterior: reabrir la hoja no puede
      // empezar con un "no pudimos obtener tu ubicacion" de hace dos minutos.
      showOfflineError(null);

      // La hoja se abre ANTES de montar el mapa, y no al reves: Google mide el
      // hueco al construirse, y dentro de un <dialog> cerrado ese hueco es cero.
      // Un mapa nacido asi se queda en gris hasta que algo lo obliga a medirse
      // otra vez.
      sheet.showModal();

      opening = start ?? CANCUN;

      if (map) {
        map.setCenter(opening);
        map.setZoom(start ? SPOT_ZOOM : CITY_ZOOM);
        return;
      }

      if (booting) return;

      setStatus('Cargando el mapa…');

      booting = boot(root?.dataset.mapsKey ?? '')
        .then(() => {
          setStatus(null);
          map?.setZoom(start ? SPOT_ZOOM : CITY_ZOOM);
        })
        .catch(() => {
          // Sin clave, rechazada, sin red o demasiado lenta: da igual cual de las
          // cuatro, porque la salida es la misma. Se permite reintentar en la
          // siguiente apertura por si fue la red.
          booting = null;
          showFailure();
        });
    },
  };
}
