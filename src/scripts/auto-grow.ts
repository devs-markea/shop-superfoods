// Textarea que crece con su contenido.
// Sustituye al tirador de redimensionado: el campo se expande al escribir, sin
// el asa de la esquina ni barra de scroll (ver components/OrderComments.astro).

function grow(field: HTMLTextAreaElement): void {
  // Se reinicia antes de medir: si no, scrollHeight nunca decrece al borrar.
  field.style.height = 'auto';
  field.style.height = `${field.scrollHeight}px`;
}

for (const field of document.querySelectorAll<HTMLTextAreaElement>('[data-auto-grow]')) {
  field.addEventListener('input', () => grow(field));

  // Al cargar puede venir con texto (autocompletado o vuelta atras).
  if (field.value) grow(field);
}
