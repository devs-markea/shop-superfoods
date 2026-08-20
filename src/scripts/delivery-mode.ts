// Modo de entrega en el listado.
//
// El switch de la barra de pedido no pide nada por si mismo: elige, y lo elegido
// se guarda en el borrador para que /mamayaya/datos llegue con el modo puesto. Es un
// atajo —quien ya sabe que va a recoger no tiene que decirlo dos veces— y se
// puede cambiar alli, que es donde el modo decide que se pide.
//
// Lo que se ve al tocarlo —el relevo de las metas de la barra: plazo y envio a
// domicilio, recoleccion y mapa al recoger— lo hace CSS leyendo el radio
// marcado, asi que aqui no hay nada que pintar. Ver
// components/OrderMeta.astro.
//
// El resto —guardar, releer y volver al defecto cuando ya no hay nada que
// recuperar— es de src/lib/delivery-switch.ts, porque /mamayaya/datos necesita lo mismo.

import { bindDeliverySwitch } from '../lib/delivery-switch';

const switchEl = document.querySelector<HTMLElement>('[data-delivery-switch]');

if (switchEl) bindDeliverySwitch(switchEl);
