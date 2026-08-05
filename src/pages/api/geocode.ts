import type { APIRoute } from 'astro';
import { GOOGLE_MAPS_API_KEY } from 'astro:env/server';

export const prerender = false;

interface GoogleComponent {
  long_name: string;
  types: string[];
}

interface GoogleResult {
  formatted_address?: string;
  address_components?: GoogleComponent[];
}

/** Primer componente que declare alguno de esos tipos. */
function pick(components: GoogleComponent[], types: string[]): string | undefined {
  return components.find((component) => component.types.some((type) => types.includes(type)))
    ?.long_name;
}

/**
 * Geocodificacion inversa: de un punto a una direccion.
 *
 * La clave se queda en el servidor, como API_URL: si se pusiera en el navegador
 * cualquiera podria gastar la cuota del proyecto. Por eso el punto entra aqui y
 * sale la direccion ya resuelta.
 *
 * Es opcional. Sin `GOOGLE_MAPS_API_KEY` responde `{ configured: false }` y no un
 * error, porque no lo es: la interfaz se queda entonces con las coordenadas como
 * texto de la ubicacion, que es peor pero funciona. Y se puede pedir igual, porque
 * la ubicacion compartida basta por si sola: esto solo decide si el repartidor
 * recibe ademas una direccion legible.
 */
export const GET: APIRoute = async ({ url }) => {
  const lat = Number.parseFloat(url.searchParams.get('lat') ?? '');
  const lng = Number.parseFloat(url.searchParams.get('lng') ?? '');

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return Response.json({ message: 'Coordenadas invalidas.' }, { status: 422 });
  }

  if (!GOOGLE_MAPS_API_KEY) return Response.json({ configured: false });

  const endpoint = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  endpoint.searchParams.set('latlng', `${lat},${lng}`);
  endpoint.searchParams.set('language', 'es');
  endpoint.searchParams.set('key', GOOGLE_MAPS_API_KEY);

  let payload: { status?: string; results?: GoogleResult[] };

  try {
    const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
    payload = await response.json();
  } catch (error) {
    console.error('[geocode] no se pudo contactar con Google', error);
    return Response.json({ message: 'No pudimos resolver la ubicacion.' }, { status: 502 });
  }

  // ZERO_RESULTS es una respuesta legitima: un punto en el mar no tiene calle.
  const result = payload.status === 'OK' ? payload.results?.[0] : undefined;

  if (!result) return Response.json({ configured: true, label: null });

  const components = result.address_components ?? [];

  return Response.json(
    {
      configured: true,
      label: result.formatted_address ?? null,
      neighborhood: pick(components, ['neighborhood', 'sublocality', 'sublocality_level_1']),
      street: pick(components, ['route']),
      exteriorNumber: pick(components, ['street_number']),
    },
    // La direccion de un punto no cambia: que la cachee el navegador.
    { headers: { 'Cache-Control': 'private, max-age=3600' } },
  );
};
