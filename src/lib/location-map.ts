// ---------------------------------------------------------------------------
// El mapa de /mamayaya/datos, en linea.
//
// Es el MISMO selector de siempre —un mapa con el pin clavado en el centro, se
// mueve el mapa hasta el domicilio y se acepta— sacado de la hoja y puesto en el
// formulario, en el hueco que ocupaba el boton que la abria. Se gana un paso: la
// ubicacion se elige donde se rellena todo lo demas, sin abrir ni cerrar nada.
//
// El por que del pin clavado y el mapa que se mueve por debajo —y el por que el
// navegador ya no elige el punto— esta escrito una vez, en src/lib/map-picker.ts.
//
// SOLO SI GOOGLE RESPONDE
//
// El panel se sirve oculto y solo aparece cuando el SDK ha cargado. Si no carga
// —sin clave, clave rechazada, sin red o demasiado lento— vuelve el boton de
// siempre y con el la hoja, que ahi ofrece el respaldo: la posicion del
// dispositivo, con su filtro de precision.
//
// Por eso el marcado de los dos caminos convive en la pantalla y aqui solo se
// decide cual se ve: las piezas del camino del boton llevan
// `data-location-fallback` y se retiran mientras el mapa manda.
//
// Esto cuesta pedirle el SDK a Google al ENTRAR en la pantalla, y no al abrir la
// hoja como antes: es la unica forma de saber si hay mapa que ensenar. Se
// contiene con lo que ya se hacia —no se pide sin clave, ni cuando el pedido es
// para recoger— y con que la carga sigue siendo asincrona: el formulario se
// rellena mientras tanto.
//
// CONFIRMAR Y REUBICAR
//
// El punto no se va guardando mientras el mapa se mueve: se lee UNA VEZ, al
// confirmar con el boton verde. Confirmado, el mapa se bloquea —lo que se ve es
// lo que va en el pedido— y el verde deja su sitio al rojo, que descarta el
// punto y devuelve el mapa al movimiento.
//
// Solo navegador. Lo monta src/scripts/delivery-form.ts, que es quien sabe que
// hacer con el punto: rotularlo, cotizarlo y guardarlo.
// ---------------------------------------------------------------------------

import { loadGoogleMaps } from './google-maps.ts';
import { mountPlaceSearch, type PlaceHint } from './place-search.ts';

/** Centro de Cancun. Donde abre el mapa cuando no hay punto previo. */
const CANCUN = { lat: 21.1619, lng: -86.8515 };

/** Zoom de ciudad, para buscar; y el de portal, cuando ya hay un punto. */
const CITY_ZOOM = 13;
const SPOT_ZOOM = 18;

export interface LocationMapOptions {
  /** Donde abre el mapa: la ubicacion ya elegida, si la hay. */
  start?: { lat: number; lng: number } | null;
  /** El punto confirmado con el boton verde. */
  onConfirm: (lat: number, lng: number) => void;
  /** El boton rojo: el punto se descarta y el mapa vuelve a moverse. */
  onCancel: () => void;
  /**
   * La colonia y la calle de la sugerencia elegida en el buscador, para los
   * campos escritos del formulario. Llega al elegirla, no al confirmar: es lo
   * que se acaba de escribir y es cuando sirve de ayuda.
   */
  onAddress?: (hint: PlaceHint) => void;
}

/**
 * Monta el panel sobre el marcado de <LocationMap>.
 *
 * No devuelve nada y no lanza: el panel se gobierna solo, y el unico desenlace
 * que le importa a quien llama —que no haya mapa— ya se resuelve aqui dentro
 * devolviendo la pantalla a como estaba.
 *
 * Se monta una vez por pantalla.
 */
export async function mountLocationMap({
  start,
  onConfirm,
  onCancel,
  onAddress,
}: LocationMapOptions): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-location-map]');
  if (!root) return;

  const key = root.dataset.mapsKey;

  // Sin clave no hay nada que intentar: la pantalla se queda con el boton y la
  // hoja, que es exactamente lo que hacia antes de existir este panel.
  if (!key) return;

  const canvas = root.querySelector<HTMLElement>('[data-location-map-canvas]');
  const searchSlot = root.querySelector<HTMLElement>('[data-location-map-search]');
  const status = root.querySelector<HTMLElement>('[data-location-map-status]');
  const label = root.querySelector<HTMLElement>('[data-location-map-label]');
  const confirmButton = root.querySelector<HTMLButtonElement>('[data-location-map-confirm]');
  const cancelButton = root.querySelector<HTMLButtonElement>('[data-location-map-cancel]');
  const locateButton = root.querySelector<HTMLButtonElement>('[data-location-map-locate]');

  if (!canvas) return;

  // Las piezas del otro camino: el boton que abre la hoja, su pista y el enlace
  // de quitar la ubicacion, que aqui lo hace el boton rojo.
  const fallback = document.querySelectorAll<HTMLElement>('[data-location-fallback]');

  /** Cambia de camino: o manda el panel, o mandan el boton y su hoja. */
  const useMap = (on: boolean): void => {
    root.hidden = !on;
    for (const piece of fallback) piece.hidden = on;
  };

  let map: google.maps.Map | null = null;

  /** Si el punto esta confirmado, para reponer el estado sin recalcularlo. */
  let confirmed = false;

  /** Si el buscador llego a montarse: si Places no responde, no hay que ensenar. */
  let searchReady = false;

  /**
   * Los dos estados del panel.
   *
   * Confirmado, el mapa se bloquea entero —gestos, controles, diana y buscador—:
   * el punto ya esta guardado y lo que se ve bajo el pin tiene que seguir siendo
   * el. Y el buscador cuenta, que mueve la camara sin tocar el mapa. Para volver
   * a moverlo hay que pasar por el boton rojo, que es lo que descarta el punto de
   * verdad, en el borrador y en la cuenta del pedido.
   */
  const setDone = (done: boolean): void => {
    confirmed = done;
    root.classList.toggle('location-map--done', done);

    if (label) {
      label.textContent = done ? 'Ubicacion confirmada' : 'Mueve el mapa hasta tu domicilio';
      label.classList.toggle('location-map__label--done', done);
    }

    if (confirmButton) confirmButton.hidden = done;
    if (cancelButton) cancelButton.hidden = !done;
    if (locateButton) locateButton.hidden = done;
    if (searchSlot) searchSlot.hidden = done || !searchReady;

    map?.setOptions({
      gestureHandling: done ? 'none' : 'greedy',
      zoomControl: !done,
      keyboardShortcuts: !done,
    });
  };

  // El panel se destapa ANTES de cargar el SDK, con su aviso puesto: si esperara
  // a tener mapa, el boton se quedaria a la vista y luego daria un salto. Si
  // Google no contesta, el boton vuelve.
  useMap(true);

  const maps = await loadGoogleMaps(key).catch(() => null);

  // Sin clave que Google acepte, sin red o demasiado lenta: da igual cual de las
  // tres, porque la salida es la misma. Se devuelve la pantalla a como estaba y
  // el boton vuelve a abrir la hoja, que ofrece el respaldo del dispositivo.
  if (!maps) {
    useMap(false);
    return;
  }

  map = new maps.Map(canvas, {
    center: start ?? CANCUN,
    zoom: start ? SPOT_ZOOM : CITY_ZOOM,
    // Lo que sobra en un mapa que solo sirve para senalar un domicilio: el
    // callejero de Google, Street View, el tipo de mapa y la pantalla completa.
    // Cada uno de esos controles es una manera de salir de la tarea.
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false,
    // Un dedo arrastra el mapa; para hacer zoom, dos. Sin esto, bajar por el
    // formulario con el dedo sobre el mapa mueve el mapa en lugar de la pantalla.
    gestureHandling: 'greedy',
  });

  if (status) status.hidden = true;
  if (confirmButton) confirmButton.disabled = false;

  // Al volver a esta pantalla —desde el pago, o con el boton atras— la ubicacion
  // ya elegida llega puesta: el panel arranca en confirmado, con el mapa sobre
  // el punto, para que no parezca que hay que elegirlo otra vez.
  setDone(Boolean(start));

  // Confirmar es el unico momento en el que se lee el punto, y se lee del mapa:
  // lo que hay bajo el pin en ese instante es lo que se guarda, sin
  // intermediarios que puedan haberse quedado en la parada anterior.
  confirmButton?.addEventListener('click', () => {
    const spot = map?.getCenter();
    if (!spot) return;

    setDone(true);
    onConfirm(spot.lat(), spot.lng());
  });

  // Cambiar la ubicacion: se descarta el punto —con su cotizacion, de eso se
  // encarga quien monto el panel— y el mapa vuelve a moverse, desde donde estaba.
  cancelButton?.addEventListener('click', () => {
    setDone(false);
    onCancel();
  });

  // La diana: mueve la camara donde este el comprador. No elige el punto —de eso
  // se encarga el pin— asi que una lectura de las malas, deducida de la IP, se ve
  // en el mapa y se corrige arrastrando en lugar de acabar en el pedido. Por eso
  // aqui no hay filtro de precision: lo que se filtra es aceptar un punto sin
  // poder verlo, y eso solo pasa en el respaldo de la hoja.
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

  // El buscador de direcciones, lo ultimo: es lo unico que puede tardar —pide
  // otra libreria del SDK— y nada de lo de arriba lo necesita. Acerca la camara y
  // ya: quien confirma sigue siendo el comprador. Ver src/lib/place-search.ts.
  if (searchSlot) {
    await mountPlaceSearch(maps, searchSlot, (spot, hint) => {
      map?.setCenter(spot);
      map?.setZoom(SPOT_ZOOM);

      // La direccion que se acaba de elegir rellena los campos vacios de abajo:
      // colonia y calle. El numero lo escribe el comprador.
      onAddress?.(hint);
    });

    // mountPlaceSearch destapa el hueco solo si el buscador llego a montarse, y
    // el estado manda por encima: con el punto ya confirmado, el mapa esta
    // quieto y el buscador no se ensena hasta que se pulse el boton rojo.
    searchReady = !searchSlot.hidden;
    setDone(confirmed);
  }
}
