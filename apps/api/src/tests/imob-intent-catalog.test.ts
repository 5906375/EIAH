import test from "node:test";
import assert from "node:assert/strict";

import {
  detectEntityPlurality,
  parseImobIntent,
  resolveCanonicalLabel,
} from "../services/imob/imobIntentCatalog";

test("IMOB intent catalog biases plural entities toward list actions", () => {
  const parsed = parseImobIntent("mostrar proprietários");

  assert.equal(parsed.entity, "proprietario");
  assert.equal(parsed.action, "list");
  assert.equal(parsed.pluralityHint, "plural");
  assert.equal(parsed.canonicalLabel, "Listar proprietários");
});

test("IMOB intent catalog biases singular entities toward get actions when consultive alias is present", () => {
  const parsed = parseImobIntent("consultar proprietário");

  assert.equal(parsed.entity, "proprietario");
  assert.equal(parsed.action, "get");
  assert.equal(parsed.pluralityHint, "singular");
  assert.equal(parsed.canonicalLabel, "Consultar proprietário");
});

test("IMOB intent catalog matches longer whole phrases before loose aliases", () => {
  const parsed = parseImobIntent("ver detalhes de contrato");

  assert.equal(parsed.entity, "contrato");
  assert.equal(parsed.action, "get");
  assert.equal(resolveCanonicalLabel("ver detalhes de contrato"), "Consultar contrato");
  assert.ok(parsed.actionScore > 0);
});

test("IMOB intent catalog detects plurality for imóveis", () => {
  assert.equal(detectEntityPlurality("listar imóveis", "imovel"), "plural");
  assert.equal(detectEntityPlurality("consultar imóvel", "imovel"), "singular");
});


test("IMOB intent catalog treats cadastro noun variants as create intent", () => {
  const parsed = parseImobIntent("iniciar cadastro de proprietário");

  assert.equal(parsed.entity, "proprietario");
  assert.equal(parsed.action, "create");
  assert.equal(parsed.canonicalLabel, "Cadastrar proprietário");
});


test("IMOB intent catalog treats consulta noun variants as get intent", () => {
  const parsed = parseImobIntent("consulta de proprietário");

  assert.equal(parsed.entity, "proprietario");
  assert.equal(parsed.action, "get");
  assert.equal(parsed.canonicalLabel, "Consultar proprietário");
});

test("IMOB intent catalog treats listagem noun variants as list intent", () => {
  const parsed = parseImobIntent("listagem de imóveis");

  assert.equal(parsed.entity, "imovel");
  assert.equal(parsed.action, "list");
  assert.equal(parsed.canonicalLabel, "Listar imóveis");
});

test("IMOB intent catalog treats exclusão noun variants as delete intent", () => {
  const parsed = parseImobIntent("exclusão de proprietário");

  assert.equal(parsed.entity, "proprietario");
  assert.equal(parsed.action, "delete");
  assert.equal(parsed.canonicalLabel, "Excluir proprietário");
});

test("IMOB intent catalog treats edição noun variants as edit intent", () => {
  const parsed = parseImobIntent("edição de imóvel");

  assert.equal(parsed.entity, "imovel");
  assert.equal(parsed.action, "edit");
  assert.equal(parsed.canonicalLabel, "Editar imóvel");
});
