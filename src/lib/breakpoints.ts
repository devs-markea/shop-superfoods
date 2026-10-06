// La frontera entre movil y desktop, para los scripts que tienen que saber de que lado
// estan. Es la misma `md` de Bootstrap que usan todos los `@media (min-width: 768px)`
// de los estilos: si cambia alli, cambia aqui.

/** Para `window.matchMedia`. */
export const DESKTOP_QUERY = '(min-width: 768px)';
