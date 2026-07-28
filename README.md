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
