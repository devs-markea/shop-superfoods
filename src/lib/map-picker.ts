// ---------------------------------------------------------------------------
// El selector de ubicacion: un mapa con un pin, dentro de la hoja de /datos.
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
// el techo; la direccion escrita aparece al aceptar, en /datos, ya resuelta.
//
// SIN MAPA SE SIGUE PUDIENDO
//
// Sin clave configurada, con una clave rechazada o sin red, la hoja cae a lo que
// habia antes: abrir Google Maps aparte y pegar aqui el enlace. Es el mismo
// trabajo —traer un punto de Maps— por el camino que no depende de nadie.
//
// Solo navegador. Lo consume src/scripts/delivery-form.ts, que es quien sabe que
// hacer con el punto: rotularlo, cotizarlo y guardarlo.
// ---------------------------------------------------------------------------

import { loadGoogleMaps } from './google-maps.ts';
import { isShortMapsLink, parseCoords } from './shipping.ts';

/** Centro de Cancun. Donde abre el mapa cuando no hay punto previo. */
const CANCUN = { lat: 21.1619, lng: -86.8515 };

/** Zoom de ciudad, para buscar; y el de portal, cuando ya hay un punto. */
const CITY_ZOOM = 13;
const SPOT_ZOOM = 18;

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
  const searchSlot = sheet.querySelector<HTMLElement>('[data-map-search]');
  const applyButton = sheet.querySelector<HTMLButtonElement>('[data-map-apply]');
  const locateButton = sheet.querySelector<HTMLButtonElement>('[data-map-locate]');
  const fallback = sheet.querySelector<HTMLElement>('[data-map-fallback]');
  const status = sheet.querySelector<HTMLElement>('[data-map-status]');

  const manualInput = sheet.querySelector<HTMLInputElement>('[data-manual-input]');
  const manualError = sheet.querySelector<HTMLElement>('[data-manual-error]');
  const manualApply = sheet.querySelector<HTMLButtonElement>('[data-manual-apply]');

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

  /**
   * Cae al respaldo: el mapa no se puede usar y la hoja pasa a pedir el enlace.
   *
   * No se cuenta por que —"la clave no esta configurada" no es asunto de quien
   * esta comprando—: se dice que hay que indicarla por el otro camino, que es lo
   * unico que puede hacer al respecto.
   */
  const useFallback = (): void => {
    root?.setAttribute('hidden', '');
    applyButton?.setAttribute('hidden', '');
    fallback?.removeAttribute('hidden');
    setStatus(null);
    manualInput?.focus();
  };

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
    await mountSearch(maps);
  };

  /**
   * El buscador de direcciones, encima del mapa.
   *
   * Es lo que hace que el selector sirva sin GPS: escribir "Bonampak 12" lleva el
   * mapa al portal y de ahi solo queda ajustar. Se limita a Mexico porque es
   * donde entrega la tienda, y una lista de sugerencias del mundo entero solo
   * puede confundir.
   *
   * Si esta pieza no esta disponible —la clave sin Places habilitado, o una
   * version del SDK que no la traiga— el mapa se queda sin buscador y sigue
   * funcionando: arrastrar y hacer zoom no depende de ella.
   */
  const mountSearch = async (maps: typeof google.maps): Promise<void> => {
    if (!searchSlot) return;

    try {
      const places = (await maps.importLibrary('places')) as google.maps.PlacesLibrary;
      const { PlaceAutocompleteElement } = places;

      if (!PlaceAutocompleteElement) return;

      const search = new PlaceAutocompleteElement({
        includedRegionCodes: ['mx'],
        locationBias: { center: CANCUN, radius: 50_000 },
      });

      search.setAttribute('placeholder', 'Busca tu calle y numero');
      searchSlot.append(search);
      searchSlot.hidden = false;

      search.addEventListener('gmp-select', (event) => {
        void (async () => {
          const place = event.placePrediction.toPlace();
          await place.fetchFields({ fields: ['location'] });

          const spot = place.location;
          if (!spot || !map) return;

          // El buscador acerca, pero no confirma: el pin queda sobre el portal y
          // sigue siendo el comprador quien acepta. Una direccion escrita puede
          // caer en el numero de al lado.
          map.setCenter(spot);
          map.setZoom(SPOT_ZOOM);
        })();
      });
    } catch {
      // Sin buscador, el mapa basta.
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

  // --- El respaldo: pegar el enlace de Maps ---------------------------------

  manualApply?.addEventListener('click', () => {
    const text = manualInput?.value ?? '';
    const spot = parseCoords(text);

    if (!spot) {
      if (manualError) {
        // Un enlace corto no lleva el punto dentro: hay que abrirlo para que Maps
        // lo despliegue, y eso no lo puede hacer el navegador contra otro dominio.
        manualError.textContent = isShortMapsLink(text)
          ? 'Ese enlace corto no trae las coordenadas. Abrelo en Maps y copia el enlace largo de la barra de direcciones.'
          : 'No reconocimos ese enlace. Pega el enlace de Google Maps o las coordenadas, como "21.1421, -86.8235".';
        manualError.hidden = false;
      }
      return;
    }

    sheet.close();
    if (manualInput) manualInput.value = '';
    onPick(spot.lat, spot.lng);
  });

  return {
    open(start) {
      if (manualError) manualError.hidden = true;

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
          useFallback();
        });
    },
  };
}
