import type { APIRoute } from 'astro';

// Fuerza renderizado on-demand: sirve para comprobar que el adaptador de
// Vercel genera la funcion serverless correctamente.
export const prerender = false;

export const GET: APIRoute = () =>
  Response.json({
    status: 'ok',
    runtime: `node ${process.version}`,
    timestamp: new Date().toISOString(),
  });
