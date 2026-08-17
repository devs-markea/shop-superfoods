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

// EL ESQUELETO AL CAMBIAR DE CATEGORIA
//
// Ocultar celdas es instantaneo, y por eso el cambio no se veia: si los platillos
// que quedan son los que ya estaban —lo normal al pasar de "Todos" a la categoria
// que llena la primera fila—, la rejilla se queda exactamente igual y parece que el
// chip no hizo nada.
//
// Asi que la rejilla se rehace a la vista: las tarjetas que quedan pasan por el
// esqueleto durante HOLD y vuelven. El relleno no espera ninguna descarga —el
// contenido esta debajo, entero— y no pretende decir que la haya: es el acuse de
// recibo del filtro. Lo que se pinta lo decide .product-card--loading en
// components/_product-card.scss.
//
// Se pone en TODO lo que queda a la vista, no solo en lo que vuelve de estar
// oculto, porque el caso que hay que resolver es justamente el de las tarjetas que
// no se movieron.
//
// Con movimiento reducido no hay espera ni relleno: el filtro se aplica y ya. Se
// consulta aqui porque el bloque de _base.scss solo manda sobre las animaciones de
// CSS, y esta pausa es de JavaScript.
const LOADING = 'product-card--loading';

/** Lo que dura el esqueleto. Va de la mano del barrido de 700ms del modifier. */
const HOLD = 480;

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

function initCategoryFilter(list: HTMLElement): void {
  const cells = list.querySelectorAll<HTMLElement>('[data-category]');
  const cards = list.querySelectorAll<HTMLElement>('[data-card]');

  // Un solo temporizador: dos chips pulsados seguidos reinician la cuenta en lugar
  // de dejar dos relojes sueltos, cada uno destapando lo que le toco.
  let holdTimer = 0;

  function settle(): void {
    // Se destapan TODAS, no las del ultimo cambio: con el chip pulsado a media
    // espera, las de la vuelta anterior tambien tienen que salir del esqueleto.
    for (const card of cards) card.classList.remove(LOADING);
  }

  function apply(category: string, loading: boolean): void {
    for (const cell of cells) {
      cell.hidden = category !== ALL_CATEGORIES && cell.dataset.category !== category;

      // En el mismo bloque que el `hidden`, antes de que el navegador pinte: la
      // tarjeta no llega a asomar entera para taparse justo despues.
      if (loading && !cell.hidden) {
        cell.querySelector<HTMLElement>('[data-card]')?.classList.add(LOADING);
      }
    }

    if (!loading) return;

    window.clearTimeout(holdTimer);
    holdTimer = window.setTimeout(settle, HOLD);
  }

  // Delegado en document: los chips viven en la barra de pedido, fuera de la
  // lista, y el arrastre del carrusel puede repintar su scroll pero no el DOM.
  document.addEventListener('change', (event) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.name !== 'category') return;
    apply(input.value, !reduced.matches);
  });

  // Estado inicial: respeta el chip que llegue marcado del servidor. Sin esqueleto,
  // que aqui no se esta rehaciendo nada —la pagina acaba de llegar asi—.
  const checked = document.querySelector<HTMLInputElement>('input[name="category"]:checked');
  if (checked) apply(checked.value, false);
}

const list = document.querySelector<HTMLElement>('[data-product-list]');
if (list) initCategoryFilter(list);
