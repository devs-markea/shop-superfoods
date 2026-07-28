// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

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
      weights: [400, 500, 600, 700],
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
    // por delante TODO el JS de la vista sin dejar rastro en consola: la
    // hamburguesa deja de abrir el menu, el carrusel de categorias no arrastra
    // y el boton de agregar no anima, hasta reiniciar el servidor de dev.
    // Declarados, se empaquetan al arrancar y el hash ya no se mueve.
    optimizeDeps: {
      include: ['bootstrap/js/dist/offcanvas.js', 'bootstrap/js/dist/dropdown.js'],
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
