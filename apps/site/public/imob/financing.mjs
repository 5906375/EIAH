// Simulação de financiamento imobiliário: funções puras, sem DOM e sem rede.
// É uma estimativa didática. Não inclui seguros, tarifas, avaliação nem a política de nenhum banco.

export const FINANCING_LIMITS = Object.freeze({ minYears: 1, maxYears: 35, maxRatePct: 100 });
export const FINANCING_SYSTEMS = Object.freeze(['price', 'sac']);

// Arredonda a centavos e evita o zero negativo (-0), que apareceria como "-R$ 0" na tela.
const cents = value => Math.round((value + Number.EPSILON) * 100) / 100 + 0;

/** Lê "1.234,56" ou "R$ 1.234,56". Devolve null quando o texto não é um valor em formato brasileiro. */
export function parseBrNumber(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const clean = text.replace(/R\$|\s/g, '');
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(clean)) return null;
  return Number(clean.replace(/\./g, '').replace(',', '.'));
}

/** Lê uma taxa digitada com vírgula ou ponto decimal ("11,5" ou "11.5"). */
export function parseRate(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const clean = text.replace(/%|\s/g, '');
  if (!/^\d+([.,]\d+)?$/.test(clean)) return null;
  return Number(clean.replace(',', '.'));
}

/** Converte taxa efetiva anual (%) em taxa efetiva mensal (fração). */
export const monthlyRate = annualRatePct => Math.pow(1 + annualRatePct / 100, 1 / 12) - 1;

/**
 * Simula um financiamento pelo sistema Price (parcela fixa) ou SAC (amortização constante).
 * Devolve { ok: true, ... } ou { ok: false, reason } sem lançar exceção:
 * 'price' | 'down' | 'term' | 'rate' | 'system'.
 */
export function simulateFinancing({ price, down = 0, annualRatePct, years, system = 'price' }) {
  if (!Number.isFinite(price) || price <= 0) return { ok: false, reason: 'price' };
  if (!Number.isFinite(down) || down < 0 || down >= price) return { ok: false, reason: 'down' };
  if (!Number.isInteger(years) || years < FINANCING_LIMITS.minYears || years > FINANCING_LIMITS.maxYears) {
    return { ok: false, reason: 'term' };
  }
  if (!Number.isFinite(annualRatePct) || annualRatePct < 0 || annualRatePct > FINANCING_LIMITS.maxRatePct) {
    return { ok: false, reason: 'rate' };
  }
  if (!FINANCING_SYSTEMS.includes(system)) return { ok: false, reason: 'system' };

  const principal = price - down;
  const months = years * 12;
  const i = monthlyRate(annualRatePct);
  let first;
  let last;
  let totalPaid;
  if (system === 'price') {
    const installment = i === 0 ? principal / months : (principal * i) / (1 - Math.pow(1 + i, -months));
    first = installment;
    last = installment;
    totalPaid = installment * months;
  } else {
    const amortization = principal / months;
    first = amortization + principal * i;
    last = amortization * (1 + i);
    totalPaid = principal + i * amortization * (months * (months + 1)) / 2;
  }
  return {
    ok: true,
    system,
    principal: cents(principal),
    months,
    downShare: down / price,
    first: cents(first),
    last: cents(last),
    totalPaid: cents(totalPaid),
    totalInterest: cents(Math.max(0, totalPaid - principal)),
  };
}
