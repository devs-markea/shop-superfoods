// ---------------------------------------------------------------------------
// Los temas de color.
//
// Un tema es el acento de la marca y nada mas: un JSON en src/data/themes/, y el
// nombre del archivo es el del tema (green.json se pide como "green"). Cada clave
// esta explicada en src/data/theme.schema.json, que es lo que el editor ensena al
// pasar el raton por encima de ella.
//
// Lo que NO es del tema: los neutros —la tinta, los grises, los fondos— y las
// senales —el verde de WhatsApp, el de confirmacion, el azul de "obligatorio"—.
// Son los mismos con cualquier acento, viven en src/styles/colors.css y se
// cambian a mano.
//
// DE JSON A CSS. El tema se escribe en el `style` de <html> como tres variables
// —ver themeStyle()— y de ellas colors.css deriva el resto: el acento como color,
// su tinte y su borde, el "primary" de Bootstrap y el aro de foco de los botones.
// Va en <html> y en ningun otro elemento porque es ahi donde se calculan esos
// derivados: un tema puesto mas abajo cambiaria el triplete, pero el tinte y el
// borde ya vendrian calculados desde arriba con el tema de <html>.
//
// COMO SE ELIGE. Hoy, con STORE_THEME en el .env (ver astro.config.mjs), y quien
// lo lee es Layout.astro. El dia que lo elija el codigo, lo que cambia es esa
// linea del Layout: getTheme() acepta el nombre venga de donde venga.
//
// COMO SE ANADE UNO. Un JSON nuevo en src/data/themes/ y reiniciar el servidor:
// la lista de nombres que acepta STORE_THEME sale de esa carpeta al arrancar.
//
// LEGIBILIDAD. El acento lleva texto blanco encima —los botones— y se lee como
// texto sobre blanco —los precios, los totales—. Cuanto mas oscuro, mas legible
// en los dos sentidos. WCAG AA pide 4.5:1 para el texto normal, y el dorado con
// el que nacio la tienda da 2.2:1.
//
// Lo que tampoco sigue al tema son los iconos de public/: son imagenes, con el
// dorado dentro. Ver Layout.astro.
// ---------------------------------------------------------------------------

/** Lo que lleva cada JSON de src/data/themes/. */
interface ThemeFile {
  /** El acento: botones, precios, estados activos, aro de foco. */
  accent: string;
  /** El acento al pasar el raton o al pulsar. */
  accentHover: string;
  /** El extremo luminoso del degradado que ocupa el sitio de una foto que no hay. */
  accentBright: string;
}

export interface Theme extends ThemeFile {
  /** El nombre del archivo, sin `.json`. Es el que se pide y el que va en <html data-theme>. */
  id: string;
}

/**
 * El que se pinta si no se pide otro, o si se pide uno que no existe.
 *
 * Es tambien el `default` de STORE_THEME en astro.config.mjs, y aquel no puede leer
 * este: si cambia, cambian los dos.
 */
export const DEFAULT_THEME = 'gold';

const COLOR_KEYS = ['accent', 'accentHover', 'accentBright'] as const;

/** Solo #rrggbb: es la forma que se pasa a tres numeros sin ambiguedad. */
const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Los temas, por nombre.
 *
 * Un color mal escrito lanza aqui, al cargar el modulo. La misma comprobacion la
 * hace astro.config.mjs, y no sobra ninguna de las dos: aquella es la que para el
 * build —las pantallas se renderizan bajo demanda, asi que este modulo no se
 * ejecuta al construir—, y esta es la que salta en dev al editar un JSON con el
 * servidor en marcha, que no vuelve a leer la configuracion.
 */
const THEMES = new Map<string, Theme>(
  Object.entries(
    import.meta.glob<ThemeFile>('../data/themes/*.json', { eager: true, import: 'default' }),
  ).map(([path, file]) => {
    const id = path.slice(path.lastIndexOf('/') + 1, -'.json'.length);

    for (const key of COLOR_KEYS) {
      if (!HEX.test(file[key] ?? '')) {
        throw new Error(
          `[tema] src/data/themes/${id}.json: "${key}" tiene que ser un color #rrggbb y vale ${JSON.stringify(file[key])}`,
        );
      }
    }

    return [
      id,
      { id, accent: file.accent, accentHover: file.accentHover, accentBright: file.accentBright },
    ];
  }),
);

/**
 * El tema con ese nombre, o el de por defecto si no hay ninguno.
 *
 * Desde STORE_THEME no llega un nombre que no exista —el build falla antes—, pero el
 * dia que lo elija el codigo si puede llegar, y una tienda pintada en el tema por
 * defecto es mejor que una que no se pinta. Por eso cae y avisa en el log en lugar
 * de lanzar.
 */
export function getTheme(id: string): Theme {
  const theme = THEMES.get(id);

  if (theme) return theme;

  console.warn(`[tema] no hay ningun tema "${id}", se pinta "${DEFAULT_THEME}"`);

  return THEMES.get(DEFAULT_THEME)!;
}

/**
 * El tema como `style` de <html>: las tres variables de las que colors.css deriva
 * el resto.
 *
 * El acento sale en tres numeros (r, g, b) y no en hex porque Bootstrap lo lee asi
 * —rgba(var(--bs-primary-rgb), opacidad)— y de ahi mismo salen el tinte y el borde
 * sin depender de color-mix(). En el JSON va en hex, que es como lo da el diseno.
 */
export function themeStyle(theme: Theme): string {
  return [
    `--sf-accent-rgb: ${hexToRgb(theme.accent)}`,
    `--sf-accent-hover: ${theme.accentHover}`,
    `--sf-accent-bright: ${theme.accentBright}`,
  ].join('; ');
}

/** "#d5aa53" -> "213, 170, 83". Solo recibe #rrggbb: ver HEX. */
function hexToRgb(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);

  return [value >> 16, (value >> 8) & 255, value & 255].join(', ');
}
