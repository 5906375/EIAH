import { money } from './stay-visual.mjs';
import { FINANCING_LIMITS, parseBrNumber, parseRate, simulateFinancing } from './financing.mjs';

// Valores iniciais de exemplo. Não são taxas de mercado: a pessoa ajusta conforme a proposta do banco.
export const financingDefaults = Object.freeze({ downShare: 0.2, years: 30, annualRatePct: 11.5, system: 'price' });

const messages = {
  price: 'Este imóvel não tem um valor de venda válido para simular.',
  down: 'A entrada deve ser menor que o valor do imóvel.',
  term: `Informe o prazo em anos inteiros, de ${FINANCING_LIMITS.minYears} a ${FINANCING_LIMITS.maxYears}.`,
  rate: 'Informe os juros ao ano, por exemplo 11,5.',
  system: 'Escolha Price ou SAC.',
  input: 'Confira os campos: use números, com vírgula para decimais.',
};

export const canSimulateFinancing = property =>
  property?.finalidade === 'venda' && Number.isFinite(property.preco) && property.preco > 0;

export function financingMarkup(property) {
  const down = Math.round(property.preco * financingDefaults.downShare).toLocaleString('pt-BR');
  return `<section class="financing" aria-labelledby="financingTitle">
    <h3 id="financingTitle">Simule o financiamento</h3>
    <div class="financing-grid">
      <label for="financingDown">Entrada (R$)<input id="financingDown" inputmode="numeric" autocomplete="off" value="${down}"></label>
      <label for="financingYears">Prazo (anos)<input id="financingYears" inputmode="numeric" autocomplete="off" value="${financingDefaults.years}"></label>
      <label for="financingRate">Juros (% ao ano)<input id="financingRate" inputmode="decimal" autocomplete="off" value="${String(financingDefaults.annualRatePct).replace('.', ',')}"></label>
      <label for="financingSystem">Sistema
        <select id="financingSystem">
          <option value="price">Price (parcela fixa)</option>
          <option value="sac">SAC (parcela decrescente)</option>
        </select>
      </label>
    </div>
    <div class="financing-result" id="financingResult" role="status" aria-live="polite"></div>
    <p class="field-help">Estimativa de exemplo, sem seguros, tarifas nem avaliação do banco. Os juros iniciais são só um valor de partida; as condições reais são definidas pela instituição financeira.</p>
  </section>`;
}

function resultMarkup(result) {
  const totals = `Total pago ≈ ${money(result.totalPaid)} · juros ≈ ${money(result.totalInterest)}`;
  if (result.system === 'price') {
    return `<p>Parcela estimada: <strong>${money(result.first)}</strong> por mês, fixa, em ${result.months} meses.</p><p class="field-help">${totals}</p>`;
  }
  return `<p>Primeira parcela: <strong>${money(result.first)}</strong> · última: <strong>${money(result.last)}</strong> (${result.months} meses, decrescente).</p><p class="field-help">${totals}</p>`;
}

/** Liga os campos do painel ao cálculo. Recebe a raiz onde o markup foi inserido. */
export function bindFinancing(root, property) {
  const field = id => root.querySelector('#' + id);
  const output = field('financingResult');
  if (!output || !canSimulateFinancing(property)) return;
  const calculate = () => {
    const down = parseBrNumber(field('financingDown').value || '0');
    const yearsText = field('financingYears').value.trim();
    const rate = parseRate(field('financingRate').value);
    if (down === null || rate === null || !/^\d+$/.test(yearsText)) {
      output.textContent = messages.input;
      return;
    }
    const result = simulateFinancing({
      price: property.preco, down, annualRatePct: rate, years: Number(yearsText), system: field('financingSystem').value,
    });
    if (result.ok) output.innerHTML = resultMarkup(result);
    else output.textContent = messages[result.reason] ?? messages.input;
  };
  for (const id of ['financingDown', 'financingYears', 'financingRate', 'financingSystem']) {
    field(id).addEventListener('input', calculate);
  }
  calculate();
}
