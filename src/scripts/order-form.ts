// Vista de detalle — total del boton.
// Suma los [data-price] marcados: el radio de tamano aporta el precio total y
// cada extra su sobrecoste. El texto sale de data-total-template, asi la copia
// vive en el marcado.
// Portado de shared/js/main.js.

const priceFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
});

function initOrderForm(form: HTMLFormElement): void {
  const output = form.querySelector<HTMLElement>('[data-total]');
  const template = output?.dataset.totalTemplate;

  if (output && template) {
    const update = () => {
      let total = 0;
      for (const input of form.querySelectorAll<HTMLInputElement>(
        '[data-price]:checked',
      )) {
        total += Number.parseFloat(input.dataset.price ?? '') || 0;
      }
      output.textContent = template.replace('{total}', priceFormatter.format(total));
    };

    form.addEventListener('change', update);
    update();
  }

  // Sin backend todavia: evita que el submit recargue la pagina.
  form.addEventListener('submit', (event) => event.preventDefault());
}

for (const form of document.querySelectorAll<HTMLFormElement>('[data-order-form]')) {
  initOrderForm(form);
}
