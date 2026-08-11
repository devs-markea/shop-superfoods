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

      // Geocodificacion inversa de la ubicacion compartida (/api/geocode).
      // Opcional: sin ella la tienda funciona igual y la ubicacion se rotula con
      // sus coordenadas. Secreta y de servidor para que no se gaste la cuota
      // desde el navegador.
      GOOGLE_MAPS_API_KEY: envField.string({
        context: 'server',
        access: 'secret',
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
      // El 800 lo pide un unico label —el folio de /confirmado— y suma
      // dos ficheros al preload de todas las paginas. Si esa factura pesa mas
      // que el peso exacto, se quita de aqui y el folio cae al 700.
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
