// Paises disponibles en el selector de codigo de telefono.
// Ampliar aqui y en Flag.astro (hacen falta las dos: datos y bandera).

import type { CountryCode } from '../components/Flag.astro';

export interface Country {
  code: CountryCode;
  name: string;
  dialCode: string;
}

export const countries: Country[] = [
  { code: 'mx', name: 'Mexico', dialCode: '+52' },
  { code: 'us', name: 'Estados Unidos', dialCode: '+1' },
  { code: 'br', name: 'Brasil', dialCode: '+55' },
  { code: 'pe', name: 'Peru', dialCode: '+51' },
  { code: 'ar', name: 'Argentina', dialCode: '+54' },
  { code: 'co', name: 'Colombia', dialCode: '+57' },
];

export const defaultCountry = countries[0];
