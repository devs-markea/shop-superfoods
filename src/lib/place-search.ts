// ---------------------------------------------------------------------------
// El buscador de direcciones de Google, encima del mapa.
//
// Es lo que hace que el selector sirva sin GPS: escribir "Bonampak 12" lleva el
// mapa al portal y de ahi solo queda ajustar. Se limita a Mexico porque es donde
// entrega la tienda, y una lista de sugerencias del mundo entero solo puede
// confundir.
//
// ACERCA, PERO NO CONFIRMA. Lo unico que hace al elegir una sugerencia es mover
// la camara: el punto sigue siendo el que el comprador acepta, porque una
// direccion escrita puede caer en el numero de al lado.
//
// Lo usan los dos selectores de /mamayaya/datos —el panel en linea (src/lib/location-map.ts)
// y la hoja (src/lib/map-picker.ts)— con el mismo comportamiento, asi que vive
// aqui y no dentro de uno de los dos.
//
// Solo navegador.
// ---------------------------------------------------------------------------

/** Centro de Cancun: sesga las sugerencias hacia la ciudad donde entrega la tienda. */
const CANCUN = { lat: 21.1619, lng: -86.8515 };

/** Radio de ese sesgo, en metros. */
const BIAS_RADIUS = 50_000;

/**
 * Lo que la sugerencia elegida sabe decir de los campos escritos del
 * formulario. Los dos son opcionales: no toda direccion trae colonia, y de un
 * punto de interes puede no salir ninguna calle.
 *
 * El numero NO viaja aqui aunque Google lo devuelva: lo escribe el comprador,
 * que es quien sabe si es el 12, el 12-A o el interior 3.
 */
export interface PlaceHint {
  /** La calle, sin numero. */
  street?: string;
  /** La colonia. En Cancun, la supermanzana o el fraccionamiento. */
  neighborhood?: string;
}

/**
 * Los tipos de Google que valen como "colonia", en orden de preferencia. En
 * Mexico la colonia llega casi siempre como sublocality_level_1; `neighborhood`
 * queda de ultimo recurso porque a veces trae el nombre de la zona y no el de la
 * colonia.
 */
const NEIGHBORHOOD_TYPES = ['sublocality_level_1', 'sublocality', 'neighborhood'];

/** Traduce las piezas de la direccion de Google a los dos campos que se rellenan. */
function hintFrom(components: google.maps.places.AddressComponent[] | undefined): PlaceHint {
  const pick = (types: string[]): string | undefined => {
    for (const type of types) {
      const found = components?.find((component) => component.types.includes(type));
      if (found?.longText) return found.longText;
    }

    return undefined;
  };

  return {
    street: pick(['route']),
    neighborhood: pick(NEIGHBORHOOD_TYPES),
  };
}

/**
 * Inserta el buscador en `slot` y lo destapa.
 *
 * `onPick` recibe el punto de la sugerencia y lo que esa direccion sepa decir de
 * la colonia y la calle. Las dos cosas salen de la MISMA consulta: `location` y
 * `addressComponents` viajan en el mismo grupo de campos, asi que la direccion
 * no cuesta una peticion mas ni un SKU distinto.
 *
 * No lanza: si la pieza no esta disponible —la clave sin Places habilitado, o
 * una version del SDK que no la traiga— el mapa se queda sin buscador y sigue
 * funcionando, que arrastrar y hacer zoom no depende de ella.
 */
export async function mountPlaceSearch(
  maps: typeof google.maps,
  slot: HTMLElement,
  onPick: (spot: google.maps.LatLng, hint: PlaceHint) => void,
): Promise<void> {
  try {
    const places = (await maps.importLibrary('places')) as google.maps.PlacesLibrary;
    const { PlaceAutocompleteElement } = places;

    if (!PlaceAutocompleteElement) return;

    const search = new PlaceAutocompleteElement({
      includedRegionCodes: ['mx'],
      locationBias: { center: CANCUN, radius: BIAS_RADIUS },
    });

    search.setAttribute('placeholder', 'Busca tu calle y numero');
    slot.append(search);
    slot.hidden = false;

    // El buscador vive dentro del <form> de /mamayaya/datos, y ahi un Enter en un campo
    // de texto envia el formulario: buscar una calle acabaria en el aviso de
    // "completa los campos". El widget ya se queda con la tecla cuando hay una
    // sugerencia marcada; esto solo impide el envio implicito.
    slot.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') event.preventDefault();
    });

    search.addEventListener('gmp-select', (event) => {
      void (async () => {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({ fields: ['location', 'addressComponents'] });

        if (place.location) onPick(place.location, hintFrom(place.addressComponents));
      })();
    });
  } catch {
    // Sin buscador, el mapa basta.
  }
}
