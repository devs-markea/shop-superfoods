// ---------------------------------------------------------------------------
// Carga del SDK de Google Maps.
//
// Una sola vez por pagina y SOLO cuando hace falta: son unos 90 KB de
// JavaScript de un tercero, y en /mamayaya/datos la mayoria de las visitas no llegan a
// abrir el mapa. Se pide al abrir la hoja, no al cargar la pantalla, asi que el
// formulario de entrega sigue costando lo que costaba.
//
// Solo navegador, como src/lib/cart-summary.ts o src/lib/delivery-switch.ts.
//
// La clave viaja en el marcado (`data-maps-key`, ver LocationPicker.astro) y no
// se importa aqui de `astro:env/client`: es el mismo reparto que el resto de los
// datos que el servidor le pasa a un script de esta tienda. Que se vea en el
// codigo de la pagina es normal en una clave de mapa —todas se ven—; lo que
// impide que otro la gaste es la restriccion por referente HTTP en Google Cloud.
// ---------------------------------------------------------------------------

/** Nombre del callback global que el SDK llama al terminar de cargarse. */
const CALLBACK = '__sfGoogleMapsReady';

/**
 * Lo que se espera como mucho al SDK, en milisegundos.
 *
 * Hace falta porque el fallo mas probable no avisa por `onerror`: con una clave
 * mal restringida o sin facturacion, el script se descarga bien y es DESPUES
 * cuando Google se queja. Sin este plazo la hoja se quedaria cargando para
 * siempre en lugar de ofrecer el camino de respaldo.
 */
const TIMEOUT = 10_000;

/** La carga en vuelo o ya resuelta: el SDK se pide una vez y se comparte. */
let pending: Promise<typeof google.maps> | null = null;

/**
 * El SDK de Google Maps, con las librerias que usa el selector de ubicacion.
 *
 * Rechaza —sin ruido en consola por su cuenta— cuando no se puede usar: sin
 * clave, con una clave rechazada, sin red o si tarda demasiado. Quien llama
 * decide que hacer con eso; en esta tienda, decirlo en la hoja y dejar que el
 * pedido siga con la direccion escrita.
 */
export function loadGoogleMaps(key: string | undefined): Promise<typeof google.maps> {
  if (pending) return pending;

  if (!key) return Promise.reject(new Error('Falta GOOGLE_MAPS_API_KEY'));

  pending = new Promise((resolve, reject) => {
    const globals = window as unknown as Record<string, unknown>;

    const timer = window.setTimeout(() => {
      reject(new Error('Google Maps tardo demasiado en cargar'));
    }, TIMEOUT);

    const settle = (error?: Error): void => {
      window.clearTimeout(timer);
      delete globals[CALLBACK];

      if (error) reject(error);
      else resolve(google.maps);
    };

    globals[CALLBACK] = () => settle();

    // El SDK llama a esta global cuando la clave no vale —dominio no autorizado,
    // API sin habilitar, facturacion caida—. Es la unica senal de ese fallo: el
    // script en si se cargo, asi que `onerror` no salta.
    globals.gm_authFailure = () => settle(new Error('Google Maps rechazo la clave'));

    const params = new URLSearchParams({
      key,
      // `weekly` es el canal estable de Google, el que recomiendan para
      // produccion: se mueve, pero no se rompe entre versiones.
      v: 'weekly',
      // Solo `places`, que es el buscador de direcciones de la hoja. La
      // geocodificacion NO se pide: quien traduce el punto a una direccion es el
      // backend al cotizar, y pedirsela tambien a Google seria pagar dos veces
      // por el mismo dato. Ver src/lib/map-picker.ts.
      libraries: 'places',
      language: 'es',
      region: 'MX',
      loading: 'async',
      callback: CALLBACK,
    });

    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`;
    script.async = true;
    script.onerror = () => settle(new Error('No se pudo descargar Google Maps'));

    document.head.append(script);
  });

  return pending;
}
