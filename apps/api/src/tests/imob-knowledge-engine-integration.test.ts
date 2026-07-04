import "./support/testInfraEnv";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { resolveImobTurn } from "../services/imob/imobTurnResolver";
import {
  ImobKnowledgeEngineError,
  resolveImobKnowledgeContext,
} from "../services/imob/imobKnowledgeEngine";

function resolveKnowledgeTurn(message: string) {
  return resolveImobTurn({
    message,
    access: {
      tenantId: "tenant-imob-kb",
      workspaceId: "workspace-imob-kb",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });
}

test("pergunta de captação retorna entry imob.playbook.captacao-basics.v1", () => {
  const result = resolveKnowledgeTurn("buscar playbook de captação");
  assert.equal(result.mode, "search_knowledge");
  assert.equal(result.knowledgeContext?.entryId, "imob.playbook.captacao-basics.v1");
});

test("pergunta de locação/documentos retorna imob.checklist.locacao-checklist.v1", () => {
  const result = resolveKnowledgeTurn("buscar documentos e checklist de locação");
  assert.equal(result.mode, "search_knowledge");
  assert.equal(result.knowledgeContext?.entryId, "imob.checklist.locacao-checklist.v1");
});

test("pergunta de visita retorna imob.template.briefing-visita.v1", () => {
  const result = resolveKnowledgeTurn("buscar briefing de visita");
  assert.equal(result.mode, "search_knowledge");
  assert.equal(result.knowledgeContext?.entryId, "imob.template.briefing-visita.v1");
});

test("pergunta de atendimento/triagem retorna imob.policy.atendimento-inicial.v1", () => {
  const result = resolveKnowledgeTurn("buscar política de atendimento inicial e triagem");
  assert.equal(result.mode, "search_knowledge");
  assert.equal(result.knowledgeContext?.entryId, "imob.policy.atendimento-inicial.v1");
});

test("pergunta de glossário retorna imob.glossary.termos-operacionais.v1", () => {
  const result = resolveKnowledgeTurn("buscar glossário de termos operacionais da captação");
  assert.equal(result.mode, "search_knowledge");
  assert.equal(result.knowledgeContext?.entryId, "imob.glossary.termos-operacionais.v1");
});

test("pergunta sensível de preço/valuation não retorna decisão automática e marca human review", () => {
  const result = resolveKnowledgeTurn("buscar preço ideal e valuation do imóvel");
  assert.equal(result.mode, "search_knowledge");
  assert.equal(result.knowledgeContext?.mode, "human_review_required");
  assert.equal(result.knowledgeContext?.requiresHumanReview, true);
  assert.equal(result.knowledgeContext?.governance.humanReviewRequired, true);
  assert.ok((result.knowledgeContext?.governance.blockedAutomaticUses ?? []).includes("automatic_pricing_decision"));
  assert.match(result.presentation.text, /revisão humana/i);
});

test("pergunta de contrato final não retorna finalização automática", () => {
  const result = resolveKnowledgeTurn("buscar como finalizar contrato final");
  assert.equal(result.mode, "search_knowledge");
  assert.equal(result.knowledgeContext?.requiresHumanReview, true);
  assert.ok((result.knowledgeContext?.governance.blockedAutomaticUses ?? []).includes("automatic_contract_finalization"));
  assert.match(result.presentation.text, /sem retornar decisão automática proibida|revisão humana/i);
});

test("retorno inclui provenance e source", () => {
  const result = resolveKnowledgeTurn("buscar playbook de captação");
  assert.equal(result.knowledgeContext?.provenance.resolver, "imob_kb_engine.v1");
  assert.equal(result.knowledgeContext?.provenance.strategy, "deterministic_intent_map");
  assert.equal(typeof result.knowledgeContext?.source.ref, "string");
  assert.equal(typeof result.knowledgeContext?.lastUpdated, "string");
});

test("ausência de KB/manifesto retorna erro controlado", () => {
  assert.throws(
    () => resolveImobKnowledgeContext({ message: "buscar playbook de captação", rootDir: path.resolve("tmp-imob-kb-missing-root") }),
    (error: unknown) => error instanceof ImobKnowledgeEngineError && error.code === "IMOB_KB_UNAVAILABLE",
  );
});

test("ChatAgentLauncher não é alterado", () => {
  const launcherFile = readFileSync(
    path.resolve("apps/api/src/services/imob/imobKnowledgeEngine.ts"),
    "utf8",
  );

  assert.equal(launcherFile.includes("ChatAgentLauncher"), false);
});
