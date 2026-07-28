// Block: product-card — feedback al agregar.
// Portado de shared/js/main.js. Delegacion en document, asi funciona con las
// tarjetas que se pinten despues (filtros, paginacion, scroll infinito).
//
// Pendiente: conectar con el carrito real. Hoy solo anima el boton.

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLElement>('[data-add]');
  if (!button) return;

  button.classList.remove('product-card__add--added');
  void button.offsetWidth; // reinicia la animacion
  button.classList.add('product-card__add--added');
});
