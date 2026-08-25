// @ts-check
import { defineConfig, envField, fontProviders } from 'astro/config';

import vercel from '@astrojs/vercel';

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
    '/confirmado': { status: 302, destination: '/mamayaya/confirmado' },
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

  // Precarga los links al pasar el raton: navegacion mas rapida en catalogo.
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'hover',
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
      // El 800 lo piden dos rotulos —el folio de /confirmado y el nombre del
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
