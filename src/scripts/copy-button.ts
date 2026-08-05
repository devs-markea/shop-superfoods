// Block: copy-button — copiar al portapapeles con confirmacion.
//
// Delegacion en document, asi sirve para cualquier [data-copy] de la pagina y
// para los que se pinten despues. La confirmacion es el visto del propio boton
// mas el aviso que el componente deja a su lado para lectores de pantalla.

// Cuanto dura el visto antes de volver al icono de copiar.
const FEEDBACK_MS = 2000;

const timers = new WeakMap<HTMLElement, number>();

document.addEventListener('click', async (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLElement>('[data-copy]');
  if (!button) return;

  const value = button.dataset.copy;
  if (!value) return;

  const status = button.parentElement?.querySelector<HTMLElement>('[data-copy-status]');

  try {
    // Requiere contexto seguro: en http:// sin localhost no existe.
    await navigator.clipboard.writeText(value);
  } catch {
    // Sin portapapeles queda el valor en pantalla, que se puede seleccionar.
    if (status) status.textContent = 'No se pudo copiar.';
    return;
  }

  button.classList.add('copy-button--copied');
  if (status) status.textContent = 'Copiado.';

  window.clearTimeout(timers.get(button));
  timers.set(
    button,
    window.setTimeout(() => {
      button.classList.remove('copy-button--copied');
      if (status) status.textContent = '';
    }, FEEDBACK_MS),
  );
});
