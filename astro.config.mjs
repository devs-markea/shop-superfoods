// @ts-check
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig, envField, fontProviders } from 'astro/config';

import vercel from '@astrojs/vercel';

// Los temas de color: un JSON por tema en src/data/themes/, y el nombre del archivo es el
// del tema. Ver src/lib/theme.ts.
//
// Se leen aqui, al arrancar, por las dos cosas que solo se pueden hacer antes del build:
// darle a STORE_THEME la lista de nombres que acepta, y parar el build si un tema trae un
// color mal escrito. Las pantallas se renderizan bajo demanda, asi que sin esto el error
// no saldria al construir sino en produccion, con la primera visita.
//
// Por eso un tema nuevo pide reiniciar el servidor de dev: la carpeta se lee una vez.
const THEMES_DIR = new URL('./src/data/themes/', import.meta.url);

const THEMES = readdirSync(THEMES_DIR)
  .filter((file) => file.endsWith('.json'))
  .map((file) => {
    let theme;

    try {
      theme = JSON.parse(readFileSync(new URL(file, THEMES_DIR), 'utf8'));
    } catch (error) {
      throw new Error(`src/data/themes/${file} no es un JSON valido: ${error}`);
    }

    // Las mismas tres claves y el mismo formato que comprueba src/lib/theme.ts.
    for (const key of ['accent', 'accentHover', 'accentBright']) {
      if (!/^#[0-9a-f]{6}$/i.test(theme[key] ?? '')) {
        throw new Error(
          `src/data/themes/${file}: "${key}" tiene que ser un color #rrggbb y vale ${JSON.stringify(theme[key])}`,
        );
      }
    }

    return file.slice(0, -'.json'.length);
  });

// El de por defecto tiene que existir: es el que se pinta sin STORE_THEME y el que
// recoge cualquier nombre desconocido. Es el DEFAULT_THEME de src/lib/theme.ts.
if (!THEMES.includes('gold')) {
  throw new Error('Falta src/data/themes/gold.json, el tema por defecto.');
}

// https://astro.build/config
export default defineConfig({
  // TODO: reemplazar por el dominio final antes de publicar.
  // Necesario para canonical URLs, sitemap y Open Graph.
  site: 'https://shop-superfoods.vercel.app',

  // `static` por defecto: cada pagina se prerenderiza salvo que
  // exporte `export const prerender = false` para renderizar on-demand
  // (carrito, checkout, cuenta de usuario...).
  output: 'static',

  // La tienda cuelga de /mamayaya (src/pages/mamayaya/), asi que la raiz no
  // sirve ninguna pagina. Sin esto, quien teclee el dominio a secas —o abra un
  // marcador de cuando las pantallas vivian en la raiz— cae en el 404 por
  // defecto de Astro: una pagina gris, en ingles y sin un enlace de vuelta a la
  // tienda. Con esto entra por la puerta.
  //
  // 302 y no el 301 que pone Astro por defecto, por lo mismo que las guardas de
  // /mamayaya/recibido: el prefijo es de ahora, y un 301 se queda cacheado en el
  // navegador para siempre. El dia que la raiz tenga contenido propio —o que la
  // tienda se mude— un 301 obligaria a vaciar el cache de cada visitante.
  //
  // Las siete viejas se listan una a una a proposito, sin comodin: son las que
  // existieron de verdad, y cada linea se borra el dia que ya nadie las tenga
  // guardada. Un comodin taparia para siempre el 404 de cualquier URL inventada.
  redirects: {
    '/': { status: 302, destination: '/mamayaya' },
    '/carrito': { status: 302, destination: '/mamayaya/carrito' },
    '/datos': { status: 302, destination: '/mamayaya/datos' },
    '/pago': { status: 302, destination: '/mamayaya/pago' },
    '/pago/transferencia': { status: 302, destination: '/mamayaya/pago/transferencia' },
    '/pago/efectivo': { status: 302, destination: '/mamayaya/pago/efectivo' },
    '/recibido': { status: 302, destination: '/mamayaya/recibido' },
    // El acuse de Mercado Pago vive ya en /mamayaya/recibido: se va directo.
    '/confirmado': { status: 302, destination: '/mamayaya/recibido' },

    // La ruta que tuvo el acuse de Mercado Pago, y la URL a la que volvia la
    // pasarela. Desde el 2026-10-09 el backend devuelve directo a
    // /mamayaya/recibido?order={id}, pero los cobros creados antes llevan esta
    // guardada en Mercado Pago: sin la linea, quien pague uno de esos volveria al
    // 404 de la ficha con el pedido ya cobrado. Se borra cuando no quede ninguno.
    //
    // El `order` de la vuelta lo conserva Vercel, que segun su documentacion pasa
    // la query al destino; el servidor de dev no. Es solo el respaldo de cuando la
    // cookie del pedido se perdio: con ella, el acuse no lo necesita.
    '/mamayaya/confirmado': { status: 302, destination: '/mamayaya/recibido' },
  },

  // Origen de la API de la tienda (Laravel). Solo se consume desde el
  // servidor, asi que no viaja al cliente.
  //
  // Sin valor por defecto a proposito: la propia documentacion de la API avisa
  // de que su APP_URL vale `http://localhost`, y un fallback equivalente aqui
  // se colaria en produccion sin que nadie lo notara. Preferimos que el build
  // falle nombrando la variable que falta.
  env: {
    schema: {
      API_URL: envField.string({ context: 'server', access: 'public' }),

      // El tema de color: de que color es el acento de la tienda. Es el nombre de un JSON de
      // src/data/themes/ —green, pink, orange…—, y quien lo aplica es Layout.astro. Los
      // nombres van en ingles, como el resto de identificadores del codigo.
      //
      // Sin poner es 'gold', el dorado: la tienda tal como se diseno.
      //
      // Una variable de entorno POR AHORA: cada despliegue es una tienda —ver SHOP_API_KEY—
      // y el color es de la tienda. El dia que lo elija el codigo, se cambia la linea del
      // Layout que lo lee y esta variable sobra.
      //
      // `values` son los archivos de la carpeta, leidos arriba: un nombre que no tenga su JSON
      // hace fallar el build nombrando la variable, en lugar de publicar la tienda con el tema
      // por defecto sin avisar.
      STORE_THEME: envField.enum({
        context: 'server',
        access: 'public',
        values: THEMES,
        optional: true,
        default: 'gold',
      }),

      // Clave del CLIENTE autorizado de la API. Viaja en la cabecera `X-Shop-Key` de cada
      // llamada al backend y es lo que distingue a esta tienda de cualquiera que conozca la
      // URL de la API: sin ella, el catalogo, la lista de precios y la configuracion del
      // negocio —telefono de WhatsApp, CLABE, plantillas— quedan servidos a quien pase.
      //
      // `secret` y no `public`: no se inlinea en ningun bundle del navegador. Puede ser un
      // secreto de verdad precisamente porque este front es un BFF —el navegador llama a
      // /api/* de Astro y es el SERVIDOR quien reenvia al backend—. El dia que una pantalla
      // llame directo a la API desde el cliente, esta clave deja de serlo.
      //
      // Opcional a proposito, y en este orden: se despliega ANTES aqui que en el backend.
      // Mientras el Laravel la tenga vacia no exige nada, asi que mandarla no rompe nada;
      // al reves —backend primero— la tienda entera responde 401 hasta el segundo despliegue.
      SHOP_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),

      // Clave con la que el BACKEND pide vaciar la cache de esta tienda: la cabecera
      // `X-Cache-Purge-Key` de POST /api/cache/invalidate (src/pages/api/cache/invalidate.ts).
      // Es lo que deja al boton del panel refrescar la tienda sin entrar a Vercel.
      //
      // Va en sentido CONTRARIO a SHOP_API_KEY —aquella la manda esta tienda al backend, esta
      // la manda el backend a la tienda— y por eso es otro secreto: si se filtra una, la otra
      // sigue cerrando su puerta.
      //
      // Opcional, pero sin ella el endpoint no purga NADA: responde 503 a todo. Es al reves que
      // SHOP_API_KEY a proposito —una URL publica que vacia la cache, abierta, es una forma
      // gratis de mandarle rafagas de lecturas al backend—.
      SHOP_CACHE_PURGE_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),

      // De donde sale "abierto" o "cerrado".
      //
      //   false (por omision)  del `isOpen` que resuelve el backend, como siempre. El horario
      //                        se guarda 30 s, porque ese dato caduca al minuto.
      //   true                 de los RANGOS de `days[].shifts`, calculados aqui en cada
      //                        render (ver resolveSchedule en src/lib/schedule.ts). Como los
      //                        rangos no caducan, el horario se guarda UNA SEMANA y el rotulo
      //                        deja de ir hasta medio minuto tarde.
      //
      // Existe porque encender eso es mover al front una regla que hoy solo vive en el
      // backend (`ScheduleAvailability`), y dos implementaciones de la misma regla pueden
      // separarse. Apagado, el calculo se hace igual y SE COMPARA con el servidor en cada
      // lectura, dejando en el log cualquier diferencia. Se enciende cuando ese log lleve un
      // tiempo callado; si algo se tuerce, se apaga sin desplegar codigo.
      SCHEDULE_FROM_SHIFTS: envField.boolean({
        context: 'server',
        access: 'secret',
        optional: true,
        default: false,
      }),

      // Modo de pruebas: silencia el aviso de la zona de reparto, que es lo unico
      // que hace desde que cotizar es cosa del backend. Sin ese aviso por delante,
      // el equipo puede recorrer el pedido desde donde vive.
      //
      // Apagado mientras no se diga lo contrario: encendido en produccion, un
      // comprador de otra ciudad no leeria donde entrega la tienda.
      //
      // Cuando la API tenga su propio modo de pruebas, esta variable sobra: quien
      // decide si un punto esta en la ciudad es quien cotiza.
      TEST_MODE: envField.boolean({
        context: 'server',
        access: 'secret',
        optional: true,
        default: false,
      }),

      // Clave de NAVEGADOR de Google Maps, para el selector de ubicacion de
      // /datos: el mapa con el pin y su buscador de direcciones. Le bastan dos
      // APIs habilitadas —Maps JavaScript y Places (New)—; la direccion del
      // punto la resuelve el backend al cotizar. Ver .env.example.
      //
      // `client` y `public` porque es exactamente eso: viaja al navegador y se
      // ve en el codigo de la pagina. No es un secreto que se escape, es una
      // clave que se protege por DONDE se usa —restringirla por referente HTTP
      // al dominio de la tienda en Google Cloud— y no por ocultarla. Una clave
      // sin esa restriccion la puede gastar cualquiera desde otro sitio.
      //
      // Opcional a proposito: sin ella la tienda no falla, se queda sin selector
      // de ubicacion. La hoja avisa de que el mapa no cargo y el pedido sigue con
      // la direccion escrita, que es lo que de verdad hace falta; el envio se
      // queda "Por cotizar". Ver components/LocationPicker.astro.
      GOOGLE_MAPS_API_KEY: envField.string({
        context: 'client',
        access: 'public',
        optional: true,
      }),
    },
  },

  // Precarga los links al PULSARLOS —`touchstart` / `mousedown`—, no al pasar el raton por
  // encima: navegacion mas rapida en el catalogo sin cobrarsela al backend.
  //
  // POR QUE NO 'hover', QUE ES EL VALOR POR OMISION. Precargar aqui no es bajarse un archivo:
  // ninguna pantalla de la tienda esta prerenderizada (todas exportan `prerender = false`,
  // porque `available` depende del horario resuelto al momento), asi que la URL de una ficha
  // es una funcion en Vercel que RENDERIZA EN SERVIDOR, y ese render hace cuatro llamadas a la
  // API: /store, /store/schedule, /products y /products/{slug}. El HTML pesa unos KB; lo que
  // cuesta son las consultas que hay detras.
  //
  // Con 'hover' eso se disparaba con el CURSOR. Recorrer con el raton una rejilla de doce
  // platillos —sin pulsar nada— lanzaba doce renders, unas cuarenta y ocho peticiones de
  // lectura. Y el limite de lectura de la API se cuenta por IP, que con este front —un BFF: el
  // navegador habla con Astro y es el servidor de Astro quien llama al backend— es UN CUBO
  // COMUN para toda la tienda (600/min, ver services.shop.rate_limits.read). O sea que el gasto
  // dejaba de depender de cuanta gente compraba y pasaba a depender de cuanto se movia el
  // raton, y al agotarse el cubo la API responde 429 a TODOS: al que paso el cursor y al que
  // acababa de entrar.
  //
  // 'tap' precarga cuando el comprador ya decidio entrar, que es cuando la precarga sirve de
  // verdad. Se pierden los milisegundos de ventaja del hover; se gana que la factura sea
  // proporcional a las visitas reales.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'tap',
  },

  // Inter, la tipografia de la maqueta. La API de fuentes de Astro descarga y
  // autoaloja los ficheros en el build, en lugar de pedirlos a Google Fonts en
  // cada visita: sin peticion a terceros, sin FOUT y sin preconnect.
  // Expone --sf-font-inter, que consume $font-family-sans-serif.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Inter',
      cssVariable: '--sf-font-inter',
      // El 800 lo piden dos rotulos —el folio de /recibido y el nombre del
      // platillo en la ficha de desktop— y suma dos ficheros al preload de todas
      // las paginas. Si esa factura pesa mas que el peso exacto, se quita de aqui
      // y los dos caen al 700.
      weights: [400, 500, 600, 700, 800],
      styles: ['normal'],
      subsets: ['latin', 'latin-ext'],
      fallbacks: ['system-ui', 'sans-serif'],
    },
  ],

  vite: {
    // El JS de Bootstrap se distribuye en UMD, asi que Vite tiene que
    // pre-empaquetarlo. Sin declararlo aqui lo descubre al vuelo, la primera
    // vez que se pide la pagina que lo importa: reoptimiza, cambia el
    // browserHash y las URLs de deps ya servidas pasan a devolver 504. Como
    // estos imports abren la cadena de modulos de cada pagina, ese 504 se lleva
    // por delante TODO el JS de la vista sin dejar rastro en consola: el
    // selector de pais deja de desplegarse, el carrusel de categorias no
    // arrastra y el boton de agregar no anima, hasta reiniciar el servidor de
    // dev. Declarados, se empaquetan al arrancar y el hash ya no se mueve.
    optimizeDeps: {
      include: ['bootstrap/js/dist/dropdown.js'],
    },

    css: {
      preprocessorOptions: {
        scss: {
          // Bootstrap 5.3 todavia usa @import, color-functions y builtins
          // globales, deprecados en Dart Sass. quietDeps silencia los avisos
          // que vienen de node_modules sin ocultar los de nuestro codigo.
          quietDeps: true,
          // main.scss usa @import a proposito: es el mecanismo que soporta
          // Bootstrap 5 para inyectar overrides de variables.
          silenceDeprecations: ['import'],
        },
      },
    },
  },

  adapter: vercel({
    // Vercel Web Analytics. Activar cuando este habilitado en el dashboard.
    webAnalytics: { enabled: false },

    // Optimizacion de imagenes de Vercel en lugar de sharp.
    // Recomendado para fotos de producto, pero consume cuota del plan.
    // imageService: true,

    // Incremental Static Regeneration para el catalogo.
    // isr: { expiration: 60 * 60 },
  }),
});
