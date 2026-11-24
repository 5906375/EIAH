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

test('a Prévia 02 parte de fotos próprias, diferentes das da Prévia 01', async () => {
  const { properties: previa01 } = await import('../public/imob/properties.mjs');
  const { iaClienteProperties, previa02Photos } = await import('../public/imob/properties-ia-cliente.mjs');
  const previa02 = readClientProperties();
  for (const [id, names] of Object.entries(previa02Photos)) {
    const own = previa02.find(property => property.id === id).fotos;
    const original = previa01.find(property => property.id === id).fotos;
    assert.equal(own.length, names.length, id);
    assert.ok(own.every(src => /\/assets\/previa02-[a-z0-9-]+\.webp$/.test(src)), id + ': só arquivos previa02-*');
    assert.ok(own.every(src => !original.includes(src)), id + ': nenhuma foto em comum com a Prévia 01');
  }
  assert.equal(iaClienteProperties.length, previa01.length, 'mesmos imóveis nas duas prévias');
  assert.deepEqual(previa02.map(property => property.id), previa01.map(property => property.id));
});

test('a Prévia 01 não muda e os imóveis sem foto própria mantêm as fotos atuais', async () => {
  const { properties: previa01 } = await import('../public/imob/properties.mjs');
  assert.ok(previa01.every(property => property.fotos.every(src => !/previa02-/.test(src))), 'properties.mjs não usa fotos da Prévia 02');
  const { previa02Photos } = await import('../public/imob/properties-ia-cliente.mjs');
  for (const property of previa01.filter(item => !previa02Photos[item.id])) {
    assert.deepEqual(readClientProperties().find(item => item.id === property.id).fotos, property.fotos, property.id);
  }
});

test('editar um imóvel na Prévia 02 mantém as fotos próprias quando o cliente não envia fotos', () => {
  const edit = { finalidade: 'venda', titulo: 'Apartamento editado', tipo: 'Apartamento', cidade: 'Balneário Camboriú', bairro: 'Centro', preco: 950000 };
  assert.equal(saveClientProperty('v-01', edit), true);
  const property = stored('v-01');
  assert.equal(property.titulo, 'Apartamento editado');
  assert.ok(property.fotos.length === 2 && property.fotos.every(src => /previa02-v01-/.test(src)), JSON.stringify(property.fotos));
});
