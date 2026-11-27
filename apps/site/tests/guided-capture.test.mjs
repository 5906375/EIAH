import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { propertyTextFields } from '../public/imob/client-properties.mjs';
import {
  GUIDED_FIELDS, GUIDED_LIMITS, canApply, currentStep, editStep, goBack, guidedSteps, missingRequired,
  reviewItems, skipField, startGuided, submitAnswer, toFormValues, validateGuidedField
} from '../public/imob/guided-capture.mjs';

const field = name => GUIDED_FIELDS.find(item => item.name === name);
const answer = (state, ...values) => values.reduce((current, value) => submitAnswer(current, value), state);
const names = values => guidedSteps(values).map(item => item.name);

test('a finalidade é a primeira pergunta e define os passos seguintes', () => {
  assert.equal(GUIDED_FIELDS[0].name, 'finalidade');
  assert.ok(!names({}).includes('condominio'), 'sem finalidade não há encargos nem hóspedes');
  assert.ok(!names({}).includes('maxGuests'));
  assert.ok(names({ finalidade: 'venda' }).includes('condominio'));
  assert.ok(names({ finalidade: 'locacao' }).includes('iptu'));
  assert.ok(!names({ finalidade: 'locacao' }).includes('maxGuests'));
  assert.ok(names({ finalidade: 'temporada' }).includes('maxGuests'));
  assert.ok(names({ finalidade: 'temporada' }).includes('cleaning'));
  assert.ok(!names({ finalidade: 'temporada' }).includes('condominio'));
});

test('texto: obrigatório, limite de caracteres e vazio opcional', () => {
  assert.equal(validateGuidedField(field('titulo'), '   ').ok, false);
  assert.equal(validateGuidedField(field('titulo'), 'a'.repeat(101)).ok, false);
  assert.deepEqual(validateGuidedField(field('titulo'), '  Casa  '), { ok: true, value: 'Casa' });
  assert.deepEqual(validateGuidedField(field('descricao'), ''), { ok: true, value: '' });
  assert.equal(validateGuidedField(field('descricao'), 'x'.repeat(801)).ok, false);
});

test('valor em reais aceita formato brasileiro e recusa o que não é número', () => {
  const preco = field('preco');
  assert.equal(validateGuidedField(preco, '650.000').value, 650000);
  assert.equal(validateGuidedField(preco, 'R$ 1.250,50').value, 1250.5);
  assert.equal(validateGuidedField(preco, '3000').value, 3000);
  for (const bad of ['0', 'abc', '-5', '12.5', '1.2.3']) assert.equal(validateGuidedField(preco, bad).ok, false, bad);
  assert.equal(validateGuidedField(preco, '').ok, false);
  assert.equal(validateGuidedField(preco, '9.999.999.999').ok, false);
});

test('encargo em branco é "não informado" (null); zero informado continua zero', () => {
  assert.deepEqual(validateGuidedField(field('condominio'), ''), { ok: true, value: null });
  assert.deepEqual(validateGuidedField(field('condominio'), '0'), { ok: true, value: 0 });
  assert.deepEqual(validateGuidedField(field('iptu'), '120'), { ok: true, value: 120 });
});

test('área e contagens respeitam os limites', () => {
  assert.equal(validateGuidedField(field('area'), '82,5').value, 82.5);
  assert.equal(validateGuidedField(field('area'), '100.000').ok, true);
  assert.equal(validateGuidedField(field('area'), '100.001').ok, false);
  assert.equal(validateGuidedField(field('quartos'), '50').ok, true);
  assert.equal(validateGuidedField(field('quartos'), '51').ok, false);
  assert.equal(validateGuidedField(field('vagas'), '100').ok, true);
  assert.equal(validateGuidedField(field('vagas'), '101').ok, false);
  assert.equal(validateGuidedField(field('quartos'), '2,5').ok, false);
  assert.equal(validateGuidedField(field('quartos'), '-1').ok, false);
  assert.deepEqual(validateGuidedField(field('suites'), ''), { ok: true, value: null });
});

test('capacidade de hóspedes é obrigatória, de 1 a 12', () => {
  const guests = field('maxGuests');
  assert.equal(validateGuidedField(guests, '').ok, false);
  assert.equal(validateGuidedField(guests, '0').ok, false);
  assert.equal(validateGuidedField(guests, '13').ok, false);
  assert.equal(validateGuidedField(guests, '4').value, 4);
});

test('finalidade só aceita as três opções', () => {
  assert.equal(validateGuidedField(field('finalidade'), 'venda').value, 'venda');
  assert.equal(validateGuidedField(field('finalidade'), 'outra').ok, false);
  assert.equal(validateGuidedField(field('finalidade'), '').ok, false);
});

test('jornada completa de uma venda chega à revisão e gera os valores do formulário', () => {
  let state = startGuided();
  assert.equal(currentStep(state).name, 'finalidade');
  state = answer(state, 'venda', 'Apartamento', 'Apartamento com varanda', 'Itapema', 'Meia Praia', '650.000');
  assert.equal(currentStep(state).name, 'area');
  state = answer(state, '82', '2', '1', '2', '1', '', '', 'Varanda, elevador', 'Sala iluminada.');
  assert.equal(state.phase, 'review');
  assert.equal(canApply(state), true);
  const form = toFormValues(state);
  assert.equal(form.preco, '650000');
  assert.equal(form.condominio, '', 'condomínio em branco segue em branco, nunca 0');
  assert.equal(form.iptu, '');
  assert.equal(form.finalidade, 'venda');
  assert.ok(!('maxGuests' in form));
});

test('resposta inválida mantém o passo e informa o erro; depois da correção avança', () => {
  let state = answer(startGuided(), 'locacao', 'Casa', 'Casa de praia', 'Itapema', 'Centro');
  assert.equal(currentStep(state).name, 'preco');
  state = submitAnswer(state, 'muito caro');
  assert.equal(currentStep(state).name, 'preco');
  assert.match(state.error, /valor em reais/);
  state = submitAnswer(state, '3.000');
  assert.equal(state.error, null);
  assert.equal(currentStep(state).name, 'area');
});

test('campo obrigatório não pode ser pulado; opcional pode e mantém o valor existente', () => {
  const required = skipField(startGuided());
  assert.equal(currentStep(required).name, 'finalidade');
  assert.match(required.error, /obrigatório/);
  let state = startGuided({ finalidade: 'venda', tipo: 'Casa', titulo: 'T', cidade: 'C', bairro: 'B', preco: '500000', area: '90' });
  state = answer(state, 'venda', 'Casa', 'T', 'C', 'B', '500000');
  assert.equal(currentStep(state).name, 'area');
  state = skipField(state);
  assert.equal(state.values.area, 90, 'pular não altera o valor');
  assert.equal(currentStep(state).name, 'quartos');
});

test('resposta vazia num opcional limpa o valor, diferente de pular', () => {
  let state = startGuided({ finalidade: 'locacao', condominio: '480' });
  state = answer(state, 'locacao', 'Casa', 'T', 'C', 'B', '3000', '', '', '', '', '');
  assert.equal(currentStep(state).name, 'condominio');
  state = submitAnswer(state, '');
  assert.equal(state.values.condominio, null);
});

test('voltar retorna ao passo anterior e da revisão ao último passo', () => {
  let state = answer(startGuided(), 'venda', 'Casa');
  assert.equal(currentStep(state).name, 'titulo');
  state = goBack(state);
  assert.equal(currentStep(state).name, 'tipo');
  assert.equal(goBack(startGuided()).index, 0);
});

test('corrigir a partir da revisão volta à revisão; mudar para temporada exige a capacidade', () => {
  let state = answer(startGuided(), 'venda', 'Casa', 'Título', 'Itapema', 'Centro', '500.000', '', '', '', '', '', '', '', '', '');
  assert.equal(state.phase, 'review');
  assert.equal(canApply(state), true);
  state = editStep(state, 'finalidade');
  assert.equal(state.phase, 'collecting');
  state = submitAnswer(state, 'temporada');
  assert.equal(state.phase, 'review', 'depois de corrigir, retorna à revisão');
  assert.equal(canApply(state), false);
  assert.deepEqual(missingRequired(state).map(item => item.name), ['maxGuests']);
});

test('a revisão diz o que não foi informado sem inventar valores', () => {
  const state = answer(startGuided(), 'locacao', 'Casa', 'Título', 'Itapema', 'Centro', '3.000', '', '', '', '', '', '', '', '', '');
  const byName = Object.fromEntries(reviewItems(state).map(item => [item.name, item.display]));
  assert.equal(byName.condominio, 'Não informado');
  assert.equal(byName.iptu, 'Não informado');
  assert.match(byName.quartos, /a vitrine usará 0/);
  assert.match(byName.preco, /3\.000/);
});

test('valores iniciais inválidos do formulário são ignorados', () => {
  const state = startGuided({ finalidade: 'inexistente', preco: 'abc', quartos: '99' });
  assert.deepEqual(state.values, {});
});

test('os limites do módulo coincidem com o client-properties e com o HTML do editor', () => {
  assert.deepEqual({ ...GUIDED_LIMITS.text }, Object.fromEntries(
    Object.keys(GUIDED_LIMITS.text).map(name => [name, propertyTextFields[name]])
  ));
  const html = readFileSync(new URL('../public/imob/ia-cliente/personalizar/index.html', import.meta.url), 'utf8');
  const attribute = (name, attr) => html.match(new RegExp(`name="${name}"[^>]*\\b${attr}="(\\d+)"`))?.[1];
  for (const [name, max] of Object.entries(GUIDED_LIMITS.text)) {
    assert.equal(Number(attribute(name, 'maxlength')), max, `maxlength de ${name}`);
  }
  for (const [name, max] of Object.entries(GUIDED_LIMITS.counts)) {
    assert.equal(Number(attribute(name, 'max')), max, `max de ${name}`);
  }
  assert.equal(Number(attribute('area', 'max')), GUIDED_LIMITS.areaMax);
  assert.equal(Number(attribute('maxGuests', 'max')), GUIDED_LIMITS.guests.max);
});
