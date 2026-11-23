import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';

// localStorage simulado: o módulo só o usa dentro das funções, nunca na importação.
const memory = new Map();
globalThis.localStorage = {
  getItem: key => (memory.has(key) ? memory.get(key) : null),
  setItem: (key, value) => { memory.set(key, String(value)); },
  removeItem: key => { memory.delete(key); },
};
const {
  clientPropertyStorageKey, propertyOptionalAmountFields, readClientProperties, saveClientProperty
} = await import('../public/imob/client-properties.mjs');

beforeEach(() => memory.clear());

const base = { finalidade: 'locacao', titulo: 'Casa de teste', tipo: 'Casa', cidade: 'Itapema', bairro: 'Centro', preco: 3000 };
const newId = () => 'p-' + crypto.randomUUID();
const stored = id => readClientProperties().find(property => property.id === id);

test('os encargos opcionais são condomínio e IPTU', () => {
  assert.deepEqual(propertyOptionalAmountFields, ['condominio', 'iptu']);
});

test('encargo vazio é salvo como null e não como zero', () => {
  const id = newId();
  assert.equal(saveClientProperty(id, { ...base, condominio: null, iptu: null }), true);
  const property = stored(id);
  assert.equal(property.condominio, null);
  assert.equal(property.iptu, null);
  assert.equal(property.origem, 'informed_by_manager');
});

test('encargo ausente no registro também fica null', () => {
  const id = newId();
  saveClientProperty(id, base);
  assert.equal(stored(id).condominio, null);
  assert.equal(stored(id).iptu, null);
});

test('zero informado continua zero', () => {
  const id = newId();
  saveClientProperty(id, { ...base, condominio: 0, iptu: 120 });
  assert.equal(stored(id).condominio, 0);
  assert.equal(stored(id).iptu, 120);
});

test('valor inválido em encargo vira null; nos demais números continua 0', () => {
  const id = newId();
  saveClientProperty(id, { ...base, condominio: -10, iptu: NaN, area: -3, quartos: NaN });
  const property = stored(id);
  assert.equal(property.condominio, null);
  assert.equal(property.iptu, null);
  assert.equal(property.area, 0);
  assert.equal(property.quartos, 0);
});

test('limpar o campo de um imóvel de exemplo substitui o valor de exemplo por null', () => {
  assert.equal(stored('l-01').condominio, 480);
  assert.equal(stored('l-01').origem, undefined);
  saveClientProperty('l-01', { finalidade: 'locacao', titulo: 'Apartamento para locação no Centro', tipo: 'Apartamento', cidade: 'Balneário Camboriú', bairro: 'Centro', preco: 2750, condominio: null, iptu: 95 });
  assert.equal(stored('l-01').condominio, null);
  assert.equal(stored('l-01').iptu, 95);
  assert.equal(stored('l-01').origem, 'informed_by_manager');
});

test('registro antigo salvo com zero continua zero (não dá para distinguir de zero informado)', () => {
  const id = newId();
  memory.set(clientPropertyStorageKey, JSON.stringify({ [id]: { ...base, condominio: 0, iptu: 0 } }));
  assert.equal(stored(id).condominio, 0);
  assert.equal(stored(id).iptu, 0);
});
