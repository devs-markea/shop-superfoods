// Block: navbar — la barra de movil, transparente sobre el banner y con su fondo al bajar.
//
// Arriba del todo la barra va sobre la foto del banner y no lleva fondo; en cuanto la
// pagina se mueve de ahi, vuelve el suyo, para que lo que pasa por debajo —el texto
// del banner y despues el catalogo— no se lea a traves del logo. Lo que se pinta en cada
// estado esta en components/Navbar.astro: aqui solo se dice en cual se esta.
//
// La clase se pone igual con banner que sin el: sin banner la barra ya lleva su fondo, y
// la clase no cambia nada.
//
// Al recargar a media pagina el navegador restaura el scroll antes de que esto arranque,
// asi que la primera llamada ya la encuentra abajo y le devuelve el fondo sin esperar a
// que el comprador se mueva.

/** La clase que devuelve el fondo. */
const SCROLLED = 'navbar--scrolled';

const navbar = document.querySelector<HTMLElement>('.navbar');

if (navbar) {
  // scrollY > 0 y no un umbral: la barra es transparente solo en la posicion de
  // partida. El rebote de iOS arriba del todo da negativo, y ahi sigue transparente.
  const update = () => navbar.classList.toggle(SCROLLED, window.scrollY > 0);

  window.addEventListener('scroll', update, { passive: true });
  update();
}
