// Cuenta de destino de las transferencias.
//
// Vive aqui, con el resto de datos estaticos del front, porque el contrato de
// la API no la expone todavia: el checkout (API 4) esta sin conectar. Cuando la
// devuelva, este archivo desaparece y <BankAccount> recibira la cuenta por
// props.

export interface BankAccount {
  /** Titular, tal como figura en el banco. */
  holder: string;
  bank: string;
  /** 18 digitos sin separadores: es lo que se copia al portapapeles. */
  clabe: string;
}

export const bankAccount: BankAccount = {
  holder: 'SuperFoods Restaurante SA de CV',
  bank: 'BBVA',
  clabe: '012345678901234567',
};

/**
 * Agrupa la CLABE como se lee en pantalla: 4-4-4-6.
 *
 * Se guarda en crudo y se agrupa al pintarla, no al reves: la banca en linea
 * acepta los 18 digitos seguidos, asi que el boton de copiar entrega el valor
 * de `clabe` y esta funcion solo afecta a lo que se ve.
 */
export function formatClabe(clabe: string): string {
  return [clabe.slice(0, 4), clabe.slice(4, 8), clabe.slice(8, 12), clabe.slice(12)]
    .filter(Boolean)
    .join(' ');
}
