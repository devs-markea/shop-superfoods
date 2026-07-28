// JS de Bootstrap, importado por componentes en lugar del bundle completo.
// Importar un componente registra su "data API", asi que los elementos con
// data-bs-toggle funcionan solos, sin inicializacion manual.
//
// De momento solo el offcanvas del menu: el switch y los chips se resuelven
// con .btn-check (CSS puro) y las opciones con inputs nativos.
//
// Mantener sincronizado con los @import activos de src/styles/main.scss.
//
// Al anadir un componente de Bootstrap aqui, declararlo tambien en
// vite.optimizeDeps.include (astro.config.mjs): si Vite lo descubre al vuelo,
// reoptimiza a mitad de sesion y el 504 del dep viejo mata todo el JS de la
// pagina en silencio.

import 'bootstrap/js/dist/offcanvas.js';
