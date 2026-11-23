import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { propertyChatReply } = await import('../public/imob/property-chat-replies.mjs');
const { properties } = await import('../public/imob/properties.mjs');

const sample = properties.find(property => property.id === 'l-01'); // condomínio 480, IPTU 95
const unknown = { ...sample, condominio: null, iptu: null };

test('com valores informados, o chat responde o condomínio, o IPTU e o total', () => {
  assert.match(propertyChatReply(sample, 'Qual o condomínio?'), /480/);
  assert.match(propertyChatReply(sample, 'Qual o IPTU?'), /95/);
  assert.match(propertyChatReply(sample, 'Qual o total mensal com condomínio e IPTU?'), /3\.325/);
});

test('sem condomínio informado, o chat não inventa R$ 0 nem lança erro', () => {
  const reply = propertyChatReply(unknown, 'Qual o condomínio?');
  assert.doesNotMatch(reply, /R\$\s?0\b/);
  assert.match(reply, /não está no anúncio|confirmado pela equipe/);
});

test('sem IPTU informado, o chat também encaminha para a equipe', () => {
  const reply = propertyChatReply(unknown, 'Qual é o IPTU?');
  assert.doesNotMatch(reply, /R\$\s?0\b/);
  assert.match(reply, /não está no anúncio|confirmado pela equipe/);
});

test('sem encargos, perguntar o total não calcula um total parcial', () => {
  const reply = propertyChatReply(unknown, 'Qual o total mensal com condomínio e IPTU?');
  assert.doesNotMatch(reply, /2\.750,00 por mês\.$/);
  assert.doesNotMatch(reply, /total mensal estimado/i);
  assert.match(reply, /não está no anúncio|confirmado pela equipe/);
});

test('com só o IPTU faltando, o condomínio ainda é respondido', () => {
  const reply = propertyChatReply({ ...sample, iptu: null }, 'Qual o condomínio?');
  assert.match(reply, /480/);
});
