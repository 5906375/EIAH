import assert from 'node:assert/strict';
import test from 'node:test';
import {
  chargeStatus, isKnownAmount, missingChargeNames, rentalCosts, unknownChargesNotice
} from '../public/imob/rental-costs.mjs';

const rental = (extra = {}) => ({ finalidade: 'locacao', preco: 2750, condominio: 480, iptu: 95, ...extra });

test('zero informado é diferente de não informado', () => {
  assert.equal(isKnownAmount(0), true);
  for (const unknown of [null, undefined, NaN, Infinity, -1, '100', '', {}]) {
    assert.equal(isKnownAmount(unknown), false, String(unknown));
  }
});

test('total mensal soma aluguel, condomínio e IPTU quando tudo é conhecido', () => {
  const costs = rentalCosts(rental());
  assert.equal(costs.complete, true);
  assert.equal(costs.total, 3325);
  assert.deepEqual(costs.missing, []);
});

test('o IPTU entra arredondado no total, como antes da mudança', () => {
  assert.equal(rentalCosts(rental({ iptu: 95.4 })).total, 3325);
  assert.equal(rentalCosts(rental({ iptu: 95.6 })).total, 3326);
});

test('encargo zero informado conta no total (imóvel sem condomínio)', () => {
  const costs = rentalCosts(rental({ condominio: 0 }));
  assert.equal(costs.complete, true);
  assert.equal(costs.total, 2845);
});

test('encargo não informado impede o total e nunca vira zero', () => {
  const noCondo = rentalCosts(rental({ condominio: null }));
  assert.equal(noCondo.total, null);
  assert.equal(noCondo.complete, false);
  assert.deepEqual(noCondo.missing.map(charge => charge.key), ['condominio']);
  const noBoth = rentalCosts(rental({ condominio: undefined, iptu: null }));
  assert.equal(noBoth.total, null);
  assert.deepEqual(noBoth.missing.map(charge => charge.key), ['condominio', 'iptu']);
});

test('aluguel inválido também impede o total', () => {
  assert.equal(rentalCosts(rental({ preco: null })).total, null);
  assert.equal(rentalCosts(rental({ preco: -5 })).total, null);
});

test('origem de cada encargo: informado, exemplo ou não informado', () => {
  assert.equal(chargeStatus(rental({ origem: 'informed_by_manager' }), 'condominio').origin, 'informed_by_manager');
  assert.equal(chargeStatus(rental(), 'condominio').origin, 'example');
  const unknown = chargeStatus(rental({ iptu: null, origem: 'informed_by_manager' }), 'iptu');
  assert.deepEqual(unknown, { key: 'iptu', known: false, amount: null, origin: 'unknown' });
});

test('textos de aviso para o visitante', () => {
  assert.equal(unknownChargesNotice(rentalCosts(rental({ condominio: null, iptu: null }))), 'Condomínio e IPTU não informados');
  assert.equal(unknownChargesNotice(rentalCosts(rental({ iptu: null }))), 'IPTU não informado');
  assert.equal(unknownChargesNotice(rentalCosts(rental({ condominio: null }))), 'Condomínio não informado');
  assert.equal(unknownChargesNotice(rentalCosts(rental())), '');
  assert.equal(missingChargeNames(rentalCosts(rental({ condominio: null, iptu: null }))), 'condomínio e IPTU');
});
