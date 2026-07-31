// Vista de datos de entrega.
//
// Reune la mitad del pedido que el carrito no tiene —modo de entrega, cliente y
// direccion— y la deja en el borrador para que sobreviva a las pantallas de pago.
// Nada de esto viaja en la URL: ver src/lib/checkout-draft.ts.
//
// Pendiente: precargar el formulario con GET /api/customer cuando la sesion ya
// haya cerrado un pedido ("¿enviamos a la misma direccion?").

// Solo esta pantalla usa dropdown, asi que su JS (y Popper) se importa aqui y
// no en scripts/bootstrap.ts: el listado no paga por lo que no usa.
// Declarado en vite.optimizeDeps.include, como el resto del JS de Bootstrap.
import 'bootstrap/js/dist/dropdown.js';

import { draftGaps, listGaps, patchDraft } from '../lib/checkout-draft';
import type { CheckoutCustomer, DeliveryType } from '../lib/checkout';

const form = document.querySelector<HTMLFormElement>('[data-delivery-form]');

if (form) {
  const value = (name: string): string =>
    form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)?.value.trim() ??
    '';

  // --- Selector de codigo de pais ---
  const toggle = form.querySelector<HTMLElement>('[data-country-toggle]');
  const codeOutput = form.querySelector<HTMLElement>('[data-country-code]');
  const hiddenValue = form.querySelector<HTMLInputElement>('[data-country-value]');

  for (const option of form.querySelectorAll<HTMLElement>('[data-country-option]')) {
    option.addEventListener('click', () => {
      const dialCode = option.dataset.dialCode;
      if (!dialCode || !toggle || !codeOutput || !hiddenValue) return;

      codeOutput.textContent = dialCode;
      hiddenValue.value = dialCode;

      // La bandera se clona de la opcion elegida: asi el SVG se define una sola
      // vez, en el marcado, y el script no tiene que conocer los trazados.
      const source = option.querySelector('svg');
      const target = toggle.querySelector('svg');
      if (source && target) {
        const clone = source.cloneNode(true) as SVGElement;
        clone.setAttribute('class', 'country-select__flag');
        target.replaceWith(clone);
      }

      for (const other of form.querySelectorAll('[data-country-option]')) {
        other.classList.toggle('active', other === option);
        other.setAttribute('aria-current', String(other === option));
      }
    });
  }

  // --- Modo de entrega ---
  // Para recoger no hace falta direccion, y el backend tampoco la pide: los tres
  // campos dejan de ser obligatorios para que el navegador no los reclame.
  const addressNames = ['neighborhood', 'street', 'number'];

  const deliveryType = (): DeliveryType =>
    form.querySelector<HTMLInputElement>('[name="delivery"]:checked')?.value === 'recoger'
      ? 'pickup'
      : 'delivery';

  const syncAddressRequirement = (): void => {
    const needed = deliveryType() === 'delivery';

    for (const name of addressNames) {
      const field = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
      if (field) field.required = needed;
    }
  };

  form.addEventListener('change', syncAddressRequirement);
  syncAddressRequirement();

  // --- Ubicacion ---
  const shareButton = form.querySelector<HTMLButtonElement>('[data-share-location]');
  const locationUrl = form.querySelector<HTMLInputElement>('[data-location-url]');
  const selected = form.querySelector<HTMLElement>('[data-location-selected]');
  const locationLabel = form.querySelector<HTMLElement>('[data-location-label]');
  const locationLink = form.querySelector<HTMLAnchorElement>('[data-location-link]');
  const clearButton = form.querySelector<HTMLButtonElement>('[data-location-clear]');
  const error = form.querySelector<HTMLElement>('[data-delivery-error]');

  const showError = (message: string | null): void => {
    if (!error) return;
    error.textContent = message ?? '';
    error.hidden = !message;
  };

  const showLocation = (url: string, label: string): void => {
    if (locationUrl) locationUrl.value = url;
    if (locationLabel) locationLabel.textContent = label;
    if (locationLink) locationLink.href = url;
    if (selected) selected.hidden = false;
  };

  const clearLocation = (): void => {
    if (locationUrl) locationUrl.value = '';
    if (selected) selected.hidden = true;
  };

  clearButton?.addEventListener('click', clearLocation);

  /**
   * Rellena un campo vacio. No pisa lo que el comprador haya escrito: la
   * geocodificacion ayuda, no corrige.
   */
  const fillIfEmpty = (name: string, text: string | undefined): void => {
    const field = form.querySelector<HTMLInputElement>(`[name="${name}"]`);
    if (field && !field.value.trim() && text) field.value = text;
  };

  /**
   * Pide la direccion del punto y devuelve el texto para el label.
   *
   * Sin clave de Google configurada el endpoint responde `configured: false`, y
   * entonces el label son las coordenadas: se ve peor, pero la ubicacion queda
   * igual de bien guardada, porque lo que viaja al pedido es el enlace de Maps.
   */
  const describe = async (lat: number, lng: number): Promise<string> => {
    const coordinates = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;

    try {
      const response = await fetch(`/api/geocode?lat=${lat}&lng=${lng}`, {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) return coordinates;

      const data = (await response.json()) as {
        configured?: boolean;
        label?: string | null;
        neighborhood?: string;
        street?: string;
        exteriorNumber?: string;
      };

      if (!data.configured) return coordinates;

      fillIfEmpty('neighborhood', data.neighborhood);
      fillIfEmpty('street', data.street);
      fillIfEmpty('number', data.exteriorNumber);

      return data.label || coordinates;
    } catch {
      return coordinates;
    }
  };

  // Se pide el permiso solo al pulsar, nunca al cargar.
  shareButton?.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showError('Tu navegador no puede compartir la ubicacion. Escribe la direccion.');
      return;
    }

    shareButton.disabled = true;

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;

        // El formato que entiende cualquier cliente de Maps, y el que espera la
        // API en `customer.locationUrl`.
        const url = `https://www.google.com/maps?q=${latitude},${longitude}`;

        showLocation(url, 'Ubicacion compartida');
        showError(null);

        showLocation(url, await describe(latitude, longitude));
        shareButton.disabled = false;
      },
      () => {
        // Permiso denegado o sin senal: se sigue con el alta manual.
        showError('No pudimos obtener tu ubicacion. Escribe la direccion.');
        shareButton.disabled = false;
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  });

  // --- Continuar ---
  // Sigue siendo un submit, no un enlace, para que los campos required se
  // validen antes de avanzar.
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();

      // Ademas de los globos del navegador, el aviso queda escrito en la
      // pantalla: los globos se cierran al primer toque.
      showError('Completa los campos marcados para continuar.');
      return;
    }

    // Telefono en formato internacional. El ejemplo del contrato lo trae
    // nacional ("9981234567"), pero el campo acepta el +52 (comprobado contra
    // staging) y el selector de pais existe para algo.
    //
    // OJO: el ERP identifica al cliente POR TELEFONO. Si el panel guarda los
    // numeros en nacional, el mismo comprador saldria dos veces. Conviene
    // confirmar con backend cual de las dos formas es la canonica.
    const customer: CheckoutCustomer = {
      name: value('name'),
      phone: `${value('country_code')}${value('phone')}`.trim(),
      neighborhood: value('neighborhood'),
      street: value('street'),
      exteriorNumber: value('number'),
      crossStreets: value('cross_streets'),
      addressReferences: value('references'),
      locationUrl: value('locationUrl'),
    };

    const draft = patchDraft({
      deliveryType: deliveryType(),
      customer,
      locationLabel: locationLabel?.textContent?.trim() ?? '',
    });

    // Ultima red: si algo obligatorio sigue vacio, la API responderia 422 dos
    // pantallas mas adelante, cuando ya no hay donde arreglarlo.
    const gaps = draftGaps(draft);

    if (gaps.length > 0) {
      showError(`Falta ${listGaps(gaps)}.`);
      return;
    }

    showError(null);
    window.location.assign('/resumen-de-pago');
  });
}
