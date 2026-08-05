// Generador de identificadores unicos del proyecto.
//
// Lo usan el token del carrito (servidor) y la clave de idempotencia del checkout
// (navegador), asi que vive aparte de los dos: no depende de nada de Astro.
//
// No se usa `crypto.randomUUID()` porque exige contexto seguro y no existe al
// servir por http:// desde otra maquina de la red, que es como se prueba en un
// telefono. `getRandomValues` si funciona en cualquier contexto.

// Crockford base32, el alfabeto de ULID: sin I, L, O ni U.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * ULID de 26 caracteres: 10 de marca de tiempo + 16 de aleatoriedad.
 *
 * 256 es multiplo de 32, asi que el `% 32` sobre bytes criptograficos reparte
 * uniforme y no introduce sesgo.
 */
export function ulid(now = Date.now()): string {
  let time = '';
  let rest = now;

  for (let i = 0; i < 10; i += 1) {
    time = CROCKFORD[rest % 32] + time;
    rest = Math.floor(rest / 32);
  }

  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let random = '';
  for (const byte of bytes) random += CROCKFORD[byte % 32];

  return time + random;
}
