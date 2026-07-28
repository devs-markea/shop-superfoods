// Vista de datos de entrega.
//
// Pendiente: el envio real del formulario y geocodificar las coordenadas para
// rellenar la direccion.

// Solo esta pantalla usa dropdown, asi que su JS (y Popper) se importa aqui y
// no en scripts/bootstrap.ts: el listado no paga por lo que no usa.
// Declarado en vite.optimizeDeps.include, como el resto del JS de Bootstrap.
import 'bootstrap/js/dist/dropdown.js';

const form = document.querySelector<HTMLFormElement>('[data-delivery-form]');

if (form) {
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

  // "Continuar" sigue siendo un submit, no un enlace, para que los campos
  // required se validen antes de avanzar. Sin backend todavia: se comprueba el
  // formulario y se navega al resumen.
  //
  // Pendiente: persistir los datos. Hoy se pierden al cambiar de pantalla.
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    window.location.assign('/resumen-de-pago');
  });

  // Compartir ubicacion. Se pide el permiso solo al pulsar, nunca al cargar.
  const shareButton = form.querySelector<HTMLButtonElement>('[data-share-location]');

  shareButton?.addEventListener('click', () => {
    if (!('geolocation' in navigator)) return;

    shareButton.disabled = true;
    navigator.geolocation.getCurrentPosition(
      () => {
        // Pendiente: geocodificar las coordenadas y rellenar los campos.
        shareButton.disabled = false;
      },
      () => {
        // Permiso denegado o sin senal: se sigue con el alta manual.
        shareButton.disabled = false;
      },
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  });
}
