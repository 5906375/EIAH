import assert from "node:assert/strict";
import test from "node:test";

import {
  formatImobUnitList,
  getImobAssetDestinationLabel,
  normalizeImobAssetDestination,
  parseImobUnits,
  resolveImobAssetNextSteps,
} from "../src/index.js";

const labels = (text: string) => parseImobUnits(text).units.map((unit) => unit.label);

test("destinação: valores legados e novos normalizam; ausência não vira sem_destinacao", () => {
  assert.equal(normalizeImobAssetDestination("locacao"), "locacao");
  assert.equal(normalizeImobAssetDestination("Locação"), "locacao");
  assert.equal(normalizeImobAssetDestination("venda"), "venda");
  assert.equal(normalizeImobAssetDestination("aluguel_por_temporada"), "aluguel_por_temporada");
  assert.equal(normalizeImobAssetDestination("temporada"), "aluguel_por_temporada");
  assert.equal(normalizeImobAssetDestination("Permuta"), "permuta");
  assert.equal(normalizeImobAssetDestination("uso próprio"), "uso_proprio");
  assert.equal(normalizeImobAssetDestination("Manutenção / indisponibilidade"), "manutencao");
  assert.equal(normalizeImobAssetDestination("Sem destinação definida"), "sem_destinacao");
  assert.equal(normalizeImobAssetDestination("sem_destinacao"), "sem_destinacao");
  // não informada ≠ escolha explícita
  assert.equal(normalizeImobAssetDestination(""), null);
  assert.equal(normalizeImobAssetDestination(null), null);
  assert.equal(normalizeImobAssetDestination(undefined), null);
  assert.equal(normalizeImobAssetDestination("qualquer coisa"), null);
  assert.equal(getImobAssetDestinationLabel("permuta"), "Permuta");
  assert.equal(getImobAssetDestinationLabel(null), null);
});

test("próximos passos: locação oferece atual, encerrada e nova — sem saltar para contrato", () => {
  const steps = resolveImobAssetNextSteps("locacao", "Kitnet 101");
  assert.ok(steps);
  assert.equal(steps.startsOperation, true);
  assert.deepEqual(steps.actions.map((action) => action.intent), [
    "lease_register_current",
    "lease_register_historical",
    "lease_start_new",
  ]);
  assert.match(steps.message, /Kitnet 101/);
  assert.match(steps.message, /locação já existente, uma locação encerrada ou iniciar uma nova/);
});

test("próximos passos: venda e permuta apontam para negociação existente ou nova", () => {
  const sale = resolveImobAssetNextSteps("venda", "Kitnet 103");
  assert.deepEqual(sale?.actions.map((a) => a.intent), ["sale_register_existing", "sale_start_new"]);
  const exchange = resolveImobAssetNextSteps("permuta", "Sala 02");
  assert.deepEqual(exchange?.actions.map((a) => a.intent), ["exchange_register_existing", "exchange_start_new"]);
});

test("próximos passos: uso próprio, manutenção, temporada e sem destinação não abrem operação", () => {
  for (const destination of ["uso_proprio", "manutencao", "aluguel_por_temporada", "sem_destinacao"]) {
    const steps = resolveImobAssetNextSteps(destination, "Kitnet 104");
    assert.ok(steps, destination);
    assert.equal(steps.startsOperation, false, destination);
    assert.deepEqual(steps.actions, [], destination);
  }
  assert.equal(resolveImobAssetNextSteps(null), null);
  assert.equal(resolveImobAssetNextSteps(""), null);
});

test("unidades: faixa + lista da frase do usuário viram 7 unidades distintas", () => {
  const parsed = parseImobUnits(
    "Cadastre as kitnets 101 a 105 e as salas 01 e 02, todas no mesmo endereço e todas do mesmo proprietário.",
  );
  assert.deepEqual(parsed.units.map((unit) => unit.label), [
    "Kitnet 101",
    "Kitnet 102",
    "Kitnet 103",
    "Kitnet 104",
    "Kitnet 105",
    "Sala 01",
    "Sala 02",
  ]);
  assert.deepEqual(parsed.duplicates, []);
  assert.deepEqual(parsed.invalidRanges, []);
});

test("unidades: não confunde número do endereço com unidade e preserva zero à esquerda", () => {
  assert.deepEqual(labels("sala 01 a 03 na Rua Alvin Bauer, 783"), ["Sala 01", "Sala 02", "Sala 03"]);
  assert.deepEqual(labels("Rua Alvin Bauer, 783 - kitnet 101"), ["Kitnet 101"]);
  assert.deepEqual(labels("Apto 301"), ["Apto 301"]);
  assert.deepEqual(labels("kitnets de 8 a 10"), ["Kitnet 8", "Kitnet 9", "Kitnet 10"]);
  assert.deepEqual(labels("sala 7 ao 9"), ["Sala 7", "Sala 8", "Sala 9"]);
});

test("unidades: repetidas e faixas invertidas não viram unidades silenciosamente", () => {
  const parsed = parseImobUnits("kitnet 101, kitnet 101 e kitnet 105 a 103");
  assert.deepEqual(parsed.units.map((unit) => unit.label), ["Kitnet 101"]);
  assert.deepEqual(parsed.duplicates, ["Kitnet 101"]);
  assert.deepEqual(parsed.invalidRanges, ["Kitnet 105 a 103"]);
  assert.deepEqual(labels("sem unidades aqui"), []);
  assert.deepEqual(labels(""), []);
  assert.deepEqual(labels(null), []);
});

test("unidades: a lista canônica é re-interpretável (idempotente)", () => {
  const first = parseImobUnits("kitnets 101 a 103 e sala 01");
  const again = parseImobUnits(formatImobUnitList(first.units));
  assert.deepEqual(again.units, first.units);
});

test("próximos passos: lote usa 'as N unidades' e frases neutras de gênero", () => {
  const batch = resolveImobAssetNextSteps("venda", "Kitnet 101", { unitCount: 5 });
  assert.match(batch?.message ?? "", /^Você definiu as 5 unidades para venda\./);
  assert.doesNotMatch(batch?.message ?? "", /Kitnet 101/);
  const single = resolveImobAssetNextSteps("uso_proprio", "Sala 02");
  assert.match(single?.message ?? "", /^Você definiu Sala 02 como uso próprio\./);
  assert.match(resolveImobAssetNextSteps("locacao")?.message ?? "", /^Você definiu o imóvel para locação\./);
  // ações iguais para uma ou várias unidades; quem decide o alvo é a superfície
  assert.deepEqual(
    resolveImobAssetNextSteps("locacao", null, { unitCount: 3 })?.actions.map((a) => a.intent),
    resolveImobAssetNextSteps("locacao", "Kitnet 101")?.actions.map((a) => a.intent),
  );
});
