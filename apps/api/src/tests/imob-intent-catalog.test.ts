import test from "node:test";
import assert from "node:assert/strict";

import {
  detectEntityPlurality,
  matchImobConversationalIntents,
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

test("IMOB conversational catalog exposes pipeline status intent", () => {
  const matches = matchImobConversationalIntents("qual status do negócio?");

  assert.equal(matches[0]?.intentId, "pipeline_status");
  assert.equal(matches[0]?.nextActionPolicy, "read_pipeline_status");
  assert.ok(matches[0]?.relatedJourneys?.includes("temporada_rules"));
});

test("IMOB conversational catalog treats case status phrasing as pipeline status", () => {
  const matches = matchImobConversationalIntents("qual status desse caso?");

  assert.equal(matches[0]?.intentId, "pipeline_status");
  assert.equal(matches[0]?.nextActionPolicy, "read_pipeline_status");
});

test("IMOB conversational catalog exposes blocked run resolution intent", () => {
  const matches = matchImobConversationalIntents("como destravar esse caso?");

  assert.equal(matches[0]?.intentId, "blocked_run_resolution");
  assert.equal(matches[0]?.nextActionPolicy, "resolve_blocked_run");
  assert.ok(matches[0]?.relatedJourneys?.includes("temporada_rules"));
});

test("IMOB conversational catalog exposes next best action intent", () => {
  const matches = matchImobConversationalIntents("qual próximo passo?");

  assert.equal(matches[0]?.intentId, "next_best_action");
  assert.equal(matches[0]?.nextActionPolicy, "recommend_next_best_action");
  assert.ok(matches[0]?.relatedJourneys?.includes("temporada_rules"));
});

test("IMOB conversational catalog treats short follow-up as next best action", () => {
  const matches = matchImobConversationalIntents("vamos seguir");

  assert.equal(matches[0]?.intentId, "next_best_action");
  assert.equal(matches[0]?.nextActionPolicy, "recommend_next_best_action");
});
