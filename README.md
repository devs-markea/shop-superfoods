# Shop Superfoods

Pedido de comida a domicilio o para recoger. **Astro 7** + **Bootstrap 5.3** con
metodologia **BEM**, desplegado en **Vercel**.

La maqueta de referencia vive en [`shared/`](shared/) (HTML + CSS puro, sin
build). Este proyecto es su adaptacion: mismos tokens, mismos bloques BEM, con
Bootstrap resolviendo lo que ya trae resuelto.

## Stack

| Pieza           | Version | Nota                                       |
| :-------------- | :------ | :----------------------------------------- |
| astro           | 7.1.3   | Vite 8, compilador Rust                    |
| @astrojs/vercel | 11.0.3  | peer `astro ^7.0.0`                        |
| bootstrap       | 5.3.8   | SCSS personalizado, imports selectivos     |
| @popperjs/core  | 2.11.8  | peer de Bootstrap; hoy no se empaqueta     |
| sass            | 1.102.0 | dev                                        |
| typescript      | 6.0.3   | fijado: `@astrojs/check` aun no soporta v7 |

Node **24.x** (`engines` + `.nvmrc`). Astro 7 exige `>=22.12.0`; Vercel usa 24
como runtime por defecto.

## Comandos

| Comando           | Accion                                   |
| :---------------- | :--------------------------------------- |
| `npm run dev`     | Servidor local en `localhost:4321`       |
| `npm run build`   | Build de produccion + salida `.vercel/`  |
| `npm run preview` | Previsualiza el build                    |
| `npm run check`   | Diagnostico de tipos en `.astro` y `.ts` |

## Rutas

| Ruta                | Vista                     | Origen en la maqueta |
| :------------------ | :------------------------ | :------------------- |
| `/`                 | Listado (menu)            | `shared/index.html`  |
| `/producto/[slug]`  | Detalle con opciones      | `shared/product.html`|
| `/mi-pedido`        | Pedido en curso (carrito) | spec de Figma        |
| `/datos-de-entrega` | Contacto y direccion      | spec de Figma        |
| `/resumen-de-pago`  | Propina, metodo y total   | spec de Figma        |
| `/api/health`       | Sonda on-demand (SSR)     | —                    |

Flujo completo y redirecciones: [`docs/flujo.md`](docs/flujo.md).
Contexto para retomar el proyecto: [`docs/contexto.md`](docs/contexto.md).

`/mi-pedido` es el pedido en curso; `/pedidos` (en el menu) queda para el
historico. Son vistas distintas.

El detalle se genera con `getStaticPaths()` desde `src/data/products.ts`: una
pagina estatica por producto.

## Estructura

```text
src/
├── assets/         logo e iconos exportados del diseno
├── data/           products.ts — catalogo y grupos de opciones
├── components/     un componente por bloque BEM
├── layouts/        Layout.astro (head, SEO, fuente)
├── pages/          rutas
├── scripts/        JS de cliente, uno por comportamiento
└── styles/
    ├── _variables.scss   tokens -> variables de Bootstrap
    ├── _tokens.scss      regenera las custom properties --sf-*
    ├── components/       un archivo por bloque BEM
    └── main.scss         entrada: orden de imports obligatorio
```

## Tokens: una sola fuente de verdad

En la maqueta los tokens eran custom properties. Bootstrap necesita valores en
tiempo de compilacion para construir sus mapas, asi que aqui son **variables
Sass** en `_variables.scss`, y de ahi salen las dos capas:

- las variables de Bootstrap (`$primary`, `$body-bg`, `$border-radius`…),
- las custom properties `--sf-*` que consumen los bloques BEM, regeneradas por
  interpolacion en `_tokens.scss`.

Los valores no se repiten en ningun sitio. Para cambiar la marca, se toca solo
`_variables.scss`.

> **Ojo con el espaciado:** se sustituye la escala de Bootstrap por la de 4px de
> la spec, para que `gap-3` valga exactamente `--sf-space-3` (12px). Cambia el
> significado de las utilidades respecto a Bootstrap de serie: `p-3` son 12px,
> no 16px.

## Que resuelve Bootstrap y que sigue siendo propio

| Bloque BEM      | Base de Bootstrap        | Por que                                  |
| :-------------- | :----------------------- | :--------------------------------------- |
| `.switch`       | `.btn` + `.btn-check`    | Radios: sin JS, navegable con flechas. Sin `.btn-group`: cuadraba las esquinas internas de la pastilla activa |
| `.chip`         | `.btn` + `.btn-check`    | Idem; seleccion unica por `name`          |
| `.tag`          | `.badge`                 | Forma y tipografia via `$badge-*`         |
| `.product-card` | `.card`                  | Fondo, radius y sombra via `$card-*`      |
| `.product-list` | `.row` + `.row-cols-*`   | Rejilla responsive                        |
| `.option`       | `.form-check-input`      | Control nativo real, no un span dibujado  |
| `.action-bar`   | `.btn .btn-primary`      | El boton; la barra sigue siendo propia. Compartida por el detalle ("Agregar — total") y el pedido ("Continuar") |
| `.navbar`       | `.navbar`                | Logo centrado entre 2 zonas: propio       |
| `.category-nav` | —                        | Scroll libre: el carousel de BS es otra cosa |
| `.icon`         | —                        | Sistema propio 20x20, `currentColor`      |
| `.shipping-progress` | `.progress` + `.progress-bar` | Alto 6, radius 3 y colores via `$progress-*` |
| `.order-comments` | `.form-control`        | Padding, radius, borde y placeholder via `$input-*` |
| `.topbar`       | —                        | Titulo entre vecinos, no centrado al layout |
| `.stepper`      | —                        | Botones de 28 circulares: no es un `.btn-group` |
| `.order-item`   | —                        | Dos filas con `space-between` a la altura de la imagen |
| `.field` / `.field-note` | `.form-control`  | Alto 44 y placeholder propios; el resto via `$input-*` |
| `.location`     | —                        | El boton define `color: gold` y el `Icon` lo hereda |
| `.country-select` | —                      | Un `<select>` nativo no puede mostrar la bandera |
| `.screen-body`  | —                        | Columna de contenido compartida por `/mi-pedido` y `/datos-de-entrega` |

### Componentes compartidos entre pantallas

| Componente      | Que resuelve                                            |
| :-------------- | :------------------------------------------------------ |
| `ScreenHeader`  | Cabecera de 124 con titulo centrado. La forma a reutilizar en pantallas interiores |
| `TopBar`        | Barra de 48 con total a la derecha. Solo `/mi-pedido`    |
| `BackButton`    | Control de vuelta, usado por los dos anteriores          |
| `ActionBar`     | Barra de accion al fondo: submit, o enlace si lleva `href` |
| `DeliverySwitch`| Switch domicilio / recoger                               |
| `TextField`     | Campo de 44 con su label accesible                       |
| `Icon`          | Sistema de iconos; el color lo pone quien lo contiene    |

`ScreenHeader` y `TopBar` comparten el bloque `.topbar` y sus elements, pero
reparten distinto: son dos componentes en lugar de uno con un flag, porque el
titulo centrado y el total a la derecha son necesidades excluyentes.

El titulo centrado de `.topbar--tall` usa un `__spacer` de 24 que replica al
`BackButton`: con `space-between`, el elemento del medio solo queda centrado en
el ancho real si el primero y el ultimo miden lo mismo. Es el mismo recurso que
`.navbar__side` en el listado, donde los dos laterales se igualan para centrar
el logo.

Dos cambios de fondo respecto a la maqueta, ambos eliminan JavaScript:

- **Switch y chips pasan de `<button>` + JS a radios.** El estado lo lleva el
  DOM, funciona sin JS, es navegable con teclado y se envia en un formulario.
- **Las opciones usan el `<input>` real** en vez de ocultarlo y dibujar un
  `<span>`. Mismo aspecto, pero visible para las herramientas de accesibilidad.

Del JS de la maqueta solo sobrevive lo que no tiene equivalente declarativo:
arrastre del carrusel, animacion del boton "+" y calculo del total.

## Estilos

`main.scss` importa Bootstrap **por partes**. El orden no se puede reordenar:
`functions` -> nuestros `_variables` -> `variables` de Bootstrap -> componentes
-> `utilities/api` -> capa propia BEM.

Para activar un componente desactivado (dropdown, modal, accordion…),
descomenta su `@import` en `main.scss`. Si necesita JavaScript, importalo
tambien en `src/scripts/bootstrap.ts`.

Coste actual: **~24 kB de CSS** y **~7 kB de JS**, comprimidos.

## Tipografia

Inter se sirve **autoalojada** con la API de fuentes de Astro (`fonts` en
`astro.config.mjs`), no desde Google Fonts: sin peticion a terceros y con
`preload` del woff2. Expone `--sf-font-inter`, que consume
`$font-family-sans-serif`.

## Imagenes

Las fotos de producto son de Unsplash, igual que en la maqueta, y se sirven con
`<img>` normal para no descargarlas en cada build. El logo si pasa por
`astro:assets` (se convierte a WebP).

Cuando haya fotos propias: moverlas a `src/assets/` y usar `<Image />`, o
activar `imageService: true` en el adaptador para usar la optimizacion de
Vercel.

## Renderizado

`output: 'static'`: todo se prerenderiza. Para una ruta on-demand (carrito,
checkout, cuenta) exporta:

```ts
export const prerender = false;
```

## Despliegue

Vercel detecta Astro automaticamente; no hace falta `vercel.json`. El adaptador
genera `.vercel/output` con la funcion `_render` en `nodejs24.x`.

Antes de publicar: cambiar `site` en `astro.config.mjs` por el dominio real
(afecta a canonical URLs y Open Graph).

### Notas de mantenimiento

- `npm audit` reporta `path-to-regexp` (high) via `@vercel/routing-utils`. **No
  ejecutar `npm audit fix --force`**: degrada el adaptador a la v8, incompatible
  con Astro 7. Vercel depende a proposito de la version pineada para replicar su
  enrutado de produccion. Es build-time, no procesa peticiones de usuario.
- Los avisos de deprecacion de Sass que genera Bootstrap se silencian con
  `quietDeps` en `astro.config.mjs`. Se resolveran cuando Bootstrap migre a
  `@use`.
- El carrito no persiste todavia: el boton "+" del listado solo anima, el
  formulario del detalle hace `preventDefault()` y los cambios de cantidad de
  `/mi-pedido` viven solo en la pagina. Los datos de ejemplo estan en
  `src/data/cart.ts`.

### Interpretaciones de la spec de `/mi-pedido`

Siguiendo el criterio de [`shared/README.md`](shared/README.md), los huecos de
la spec se resolvieron asi:

| Spec                                    | Aplicado                                     |
| :-------------------------------------- | :------------------------------------------- |
| Barra al `60%` con `$75` restantes y total `$325` | El progreso se **calcula** (`total / 400` = 81%). Los tres numeros no pueden ser ciertos a la vez; un 60% fijo mentiria al cambiar el pedido |
| `label title` / `label personalizacion` sin tipografia | Patron del sistema: 14/20 semibold #141821 y 12/16 regular #6C757D |
| Flecha atras `24x24`                    | Caja tactil de 24 con el icono de 20 del sistema, igual que `.navbar__action` |
| Menos del stepper: rectangulo `10x1.5`  | `<span>` con esas medidas exactas, no un icono de trazo (a 1.5 el sistema de 20x20 con stroke 2 no da la medida) |
| Contenedor `390x568`                    | `max-width: 390` sin alto fijo: la lista crece. En desktop sube a 560 |
| Ancho `87` del stepper                  | No se fija: con dos digitos crece en lugar de recortar el numero |

### Interpretaciones de la spec de `/datos-de-entrega`

| Spec                                    | Aplicado                                     |
| :-------------------------------------- | :------------------------------------------- |
| Primer input del bloque de contacto sin placeholder | "Nombre completo": es el unico dato de contacto que falta junto al telefono |
| Padding lateral de los inputs           | 16, el mismo que el textarea y el resto del sistema |
| Banderas 20x14                          | SVG de bandas planas, sin escudos ni soles: a ese tamano no se distinguen. Si hacen falta banderas fieles, entra un set de assets o `flag-icons` |
| Lista del dropdown sin spec visual      | `.dropdown-menu` de Bootstrap con los `$dropdown-*` alineados a los tokens |

El borde de 2px `#EAECF0` es comun a los campos de una linea y al selector de
pais. Los textarea se quedan en 1px, que es lo que trae `.form-control`.

Paises del selector: Mexico (+52, por defecto), Estados Unidos (+1), Brasil
(+55), Peru (+51), Argentina (+54) y Colombia (+57). Para anadir mas hacen falta
las dos piezas: la entrada en `src/data/countries.ts` y la bandera en
`Flag.astro`.
