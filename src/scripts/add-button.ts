// Block: product-card — feedback al agregar.
// Portado de shared/js/main.js. Delegacion en document, asi funciona con las
// tarjetas que se pinten despues (filtros, paginacion, scroll infinito).
//
// Pendiente: conectar con el carrito real (API 3, POST /api/cart/items). El
// boton ya lleva el identificador en data-product-id, pero un platillo con
// personalizaciones obligatorias no se puede añadir sin pasar por el detalle:
// hay que decidir si este "+" navega o manda la seleccion por defecto. Hoy
// solo anima.

document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const button = target.closest<HTMLElement>('[data-add]');
  if (!button) return;

  button.classList.remove('product-card__add--added');
  void button.offsetWidth; // reinicia la animacion
  button.classList.add('product-card__add--added');
});
