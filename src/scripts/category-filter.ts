// Block: product-list — filtrado por categoria.
//
// El contrato de la API lo deja en el cliente: el catalogo llega entero en una
// sola respuesta, sin paginacion. Aqui no hay que pedir nada, solo ocultar las
// celdas que no coinciden con el chip marcado.
//
// Los chips son radios name="category" (.btn-check) y sus valores salen del
// mismo payload que las tarjetas, asi que ninguna categoria puede dejar la
// rejilla vacia y no hace falta un estado "sin resultados".
//
// El atributo hidden basta: el Reboot de Bootstrap lo lleva a
// `display: none !important`, que gana a las clases de rejilla.

const ALL_CATEGORIES = 'Todos';

function initCategoryFilter(list: HTMLElement): void {
  const cells = list.querySelectorAll<HTMLElement>('[data-category]');

  function apply(category: string): void {
    for (const cell of cells) {
      cell.hidden = category !== ALL_CATEGORIES && cell.dataset.category !== category;
    }
  }

  // Delegado en document: los chips viven en la barra de pedido, fuera de la
  // lista, y el arrastre del carrusel puede repintar su scroll pero no el DOM.
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.name !== 'category') return;
    apply(input.value);
  });

  // Estado inicial: respeta el chip que llegue marcado del servidor.
  const checked = document.querySelector<HTMLInputElement>('input[name="category"]:checked');
  if (checked) apply(checked.value);
}

const list = document.querySelector<HTMLElement>('[data-product-list]');
if (list) initCategoryFilter(list);
