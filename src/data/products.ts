// ---------------------------------------------------------------------------
// Catalogo. Datos extraidos de shared/index.html y shared/product.html.
//
// Provisional: sustituir por una coleccion de contenido (src/content/) o por
// la API del backend. La forma de los tipos es la que consumen los
// componentes, asi que el cambio no deberia tocar el marcado.
// ---------------------------------------------------------------------------

export interface OptionChoice {
  value: string;
  label: string;
  /** Precio total de la opcion (radio) o sobrecoste (checkbox), en MXN. */
  price: number;
}

export interface OptionGroup {
  id: string;
  name: string;
  label: string;
  type: 'radio' | 'checkbox';
  required: boolean;
  choices: OptionChoice[];
}

export interface Product {
  slug: string;
  name: string;
  description: string;
  price: number;
  category: string;
  /** Identificador de la foto en Unsplash. */
  photoId: string;
  alt: string;
  optionGroups: OptionGroup[];
}

export const categories = [
  'Todos',
  'Bowls',
  'Ensaladas',
  'Smoothies',
  'Proteinas',
  'Snacks',
  'Bebidas',
  'Postres',
] as const;

/** URL de Unsplash al tamano pedido. Las fotos son de referencia. */
export function photoUrl(photoId: string, width: number, height: number): string {
  return `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=${width}&h=${height}&q=80`;
}

// Vive en src/lib/price.ts para que el JS de cliente lo use sin importar el
// catalogo. Se reexporta aqui por comodidad de los componentes.
export { formatPrice } from '../lib/price.ts';

/** Grupos de opciones de la maqueta de detalle, reutilizados por producto. */
function standardOptions(basePrice: number): OptionGroup[] {
  return [
    {
      id: 'size',
      name: 'size',
      label: 'Elige el tamano',
      type: 'radio',
      required: true,
      choices: [
        { value: 'individual', label: 'Individual', price: basePrice },
        { value: 'grande', label: 'Grande', price: basePrice + 40 },
        { value: 'compartir', label: 'Para compartir', price: basePrice + 80 },
      ],
    },
    {
      id: 'extras',
      name: 'extras',
      label: 'Agrega extras',
      type: 'checkbox',
      required: false,
      choices: [
        { value: 'guacamole', label: 'Guacamole', price: 20 },
        { value: 'queso', label: 'Queso extra', price: 15 },
        { value: 'semillas', label: 'Mix de semillas', price: 10 },
      ],
    },
  ];
}

export const products: Product[] = [
  {
    slug: 'bowl-de-acai',
    name: 'Bowl de acai',
    description:
      'Acai organico, platano, granola casera, coco rallado y miel de agave.',
    price: 89,
    category: 'Bowls',
    photoId: 'photo-1512621776951-a57141f2eefd',
    alt: 'Bowl de acai con frutas y granola',
    optionGroups: standardOptions(89),
  },
  {
    slug: 'ensalada-de-quinoa',
    name: 'Ensalada de quinoa',
    description:
      'Quinoa roja, aguacate, kale masajeado, semillas y vinagreta de limon.',
    price: 115,
    category: 'Ensaladas',
    photoId: 'photo-1546069901-ba9599a7e63c',
    alt: 'Ensalada de quinoa con aguacate',
    optionGroups: standardOptions(115),
  },
  {
    slug: 'smoothie-verde-detox',
    name: 'Smoothie verde detox',
    description: 'Espinaca, pina, jengibre, espirulina y agua de coco natural.',
    price: 75,
    category: 'Smoothies',
    photoId: 'photo-1511690743698-d9d85f2fbf38',
    alt: 'Smoothie verde en vaso',
    optionGroups: standardOptions(75),
  },
  {
    slug: 'salmon-con-verduras',
    name: 'Salmon con verduras',
    description:
      'Salmon salvaje a la plancha, esparragos, brocoli y arroz integral.',
    price: 189,
    category: 'Proteinas',
    photoId: 'photo-1467003909585-2f8a72700288',
    alt: 'Salmon a la plancha con verduras',
    optionGroups: standardOptions(189),
  },
  {
    slug: 'buddha-bowl-mediterraneo',
    name: 'Buddha bowl mediterraneo',
    description: 'Garbanzo especiado, hummus, pepino, tomate cherry y tahini.',
    price: 129,
    category: 'Bowls',
    photoId: 'photo-1490645935967-10de6ba17061',
    alt: 'Buddha bowl mediterraneo',
    optionGroups: standardOptions(129),
  },
  {
    slug: 'golden-latte-de-curcuma',
    name: 'Golden latte de curcuma',
    description: 'Leche de almendra, curcuma fresca, canela y pimienta negra.',
    price: 65,
    category: 'Bebidas',
    photoId: 'photo-1502741224143-90386d7f8c82',
    alt: 'Latte de curcuma en taza',
    optionGroups: standardOptions(65),
  },
];
