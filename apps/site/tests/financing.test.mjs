import assert from 'node:assert/strict';
import test from 'node:test';
import { FINANCING_LIMITS, monthlyRate, parseBrNumber, parseRate, simulateFinancing } from '../public/imob/financing.mjs';

// Taxa anual equivalente a exatamente 1% ao mês, para comparar com valores conhecidos de tabela.
const ANNUAL_FOR_ONE_PERCENT_MONTH = (Math.pow(1.01, 12) - 1) * 100;
const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} difere de ${expected} por mais de ${tolerance}`);

test('converte taxa anual efetiva em mensal', () => {
  near(monthlyRate(ANNUAL_FOR_ONE_PERCENT_MONTH), 0.01, 1e-12);
  assert.equal(monthlyRate(0), 0);
});

test('Price: R$ 100.000 em 30 anos a 1% ao mês dá parcela fixa de R$ 1.028,61', () => {
  const result = simulateFinancing({ price: 100000, down: 0, annualRatePct: ANNUAL_FOR_ONE_PERCENT_MONTH, years: 30 });
  assert.equal(result.ok, true);
  near(result.first, 1028.61);
  assert.equal(result.first, result.last);
  assert.equal(result.months, 360);
  // A parcela exibida é arredondada a centavos; o total usa a parcela exata (erro máximo de meio centavo por mês).
  near(result.totalPaid, result.first * 360, 360 * 0.005);
  near(result.totalInterest, result.totalPaid - 100000, 0.01);
});

test('SAC: primeira parcela, última parcela e juros totais', () => {
  const result = simulateFinancing({ price: 100000, down: 0, annualRatePct: ANNUAL_FOR_ONE_PERCENT_MONTH, years: 30, system: 'sac' });
  assert.equal(result.ok, true);
  near(result.first, 100000 / 360 + 1000); // 1.277,78
  near(result.last, (100000 / 360) * 1.01); // 280,56
  near(result.totalInterest, 180500, 0.5);
  near(result.totalPaid, 280500, 0.5);
  assert.ok(result.first > result.last);
});

test('juros zero divide o valor financiado pelo número de meses', () => {
  const price = simulateFinancing({ price: 150000, down: 30000, annualRatePct: 0, years: 10 });
  assert.equal(price.first, 1000);
  assert.ok(Object.is(price.totalInterest, 0), 'juros totais devem ser +0, nunca -0');
  const sac = simulateFinancing({ price: 150000, down: 30000, annualRatePct: 0, years: 10, system: 'sac' });
  assert.equal(sac.first, 1000);
  assert.equal(sac.last, 1000);
});

test('a entrada reduz o valor financiado e informa a proporção', () => {
  const result = simulateFinancing({ price: 500000, down: 100000, annualRatePct: 11.5, years: 30 });
  assert.equal(result.principal, 400000);
  assert.equal(result.downShare, 0.2);
});

test('o Price é mais barato por mês no início e o SAC é mais barato no total', () => {
  const args = { price: 800000, down: 160000, annualRatePct: 11.5, years: 30 };
  const price = simulateFinancing({ ...args, system: 'price' });
  const sac = simulateFinancing({ ...args, system: 'sac' });
  assert.ok(price.first < sac.first);
  assert.ok(sac.totalPaid < price.totalPaid);
});

test('entradas inválidas devolvem o motivo, sem lançar exceção', () => {
  const ok = { price: 500000, down: 100000, annualRatePct: 11.5, years: 30 };
  const reason = override => simulateFinancing({ ...ok, ...override }).reason;
  assert.equal(reason({ price: 0 }), 'price');
  assert.equal(reason({ price: NaN }), 'price');
  assert.equal(reason({ down: -1 }), 'down');
  assert.equal(reason({ down: 500000 }), 'down');
  assert.equal(reason({ years: 0 }), 'term');
  assert.equal(reason({ years: FINANCING_LIMITS.maxYears + 1 }), 'term');
  assert.equal(reason({ years: 2.5 }), 'term');
  assert.equal(reason({ annualRatePct: -1 }), 'rate');
  assert.equal(reason({ annualRatePct: 101 }), 'rate');
  assert.equal(reason({ annualRatePct: undefined }), 'rate');
  assert.equal(reason({ system: 'outro' }), 'system');
});

test('interpreta valores em formato brasileiro e recusa o que não é número', () => {
  assert.equal(parseBrNumber('1.234,56'), 1234.56);
  assert.equal(parseBrNumber('R$ 188.000'), 188000);
  assert.equal(parseBrNumber('0'), 0);
  assert.equal(parseBrNumber(''), null);
  assert.equal(parseBrNumber('abc'), null);
  assert.equal(parseBrNumber('1.23'), null);
  assert.equal(parseBrNumber(null), null);
  assert.equal(parseBrNumber(Infinity), null);
});

test('interpreta taxa com vírgula ou ponto', () => {
  assert.equal(parseRate('11,5'), 11.5);
  assert.equal(parseRate('11.5'), 11.5);
  assert.equal(parseRate('9%'), 9);
  assert.equal(parseRate('-3'), null);
  assert.equal(parseRate('x'), null);
});
