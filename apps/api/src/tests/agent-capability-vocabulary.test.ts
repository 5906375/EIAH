import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_CAPABILITY_DECLARATIONS, listCapabilityTurnVocabulary } from "../services/agentCapabilityVocabulary";
import * as agents from "../services/agents";

// O vocabulário declarado vive em um módulo sem dependências de runtime (para motores de turno puros); agents.ts reexporta a API
// existente e segue dono da descoberta/habilitação. Estes testes impedem divergência entre os dois.
test("agents.ts reexporta exatamente o mesmo vocabulário e continua exportando os símbolos públicos", () => {
  assert.equal(agents.listCapabilityTurnVocabulary, listCapabilityTurnVocabulary);
  assert.equal(typeof agents.normalizeAgentKey, "function");
  assert.equal(typeof agents.resolveAgentId, "function");
});

test("o id canônico do vocabulário coincide com resolveAgentId de cada chave declarada (sem deriva)", () => {
  const vocabulary = listCapabilityTurnVocabulary();
  assert.ok(vocabulary.length > 0);
  for (const entry of vocabulary) {
    const keys = Object.keys(AGENT_CAPABILITY_DECLARATIONS).filter((key) => AGENT_CAPABILITY_DECLARATIONS[key].some((d) => d.domain === entry.domain && d.capability === entry.capability));
    assert.ok(keys.length >= 1);
    assert.ok(keys.some((key) => agents.resolveAgentId(key) === entry.agentId), `${entry.agentId} != resolveAgentId(${keys.join(",")})`);
  }
});

test("comportamento preservado: conteúdo do vocabulário de marketing e consistência com a descoberta por capacidade", () => {
  const [mkt] = listCapabilityTurnVocabulary();
  assert.equal(mkt.agentId, "MKT");
  assert.equal(mkt.domain, "marketing");
  assert.equal(mkt.capability, "campaign");
  assert.deepEqual(mkt.agentTerms, ["marketing", "marketing gps", "mkt"]);
  assert.ok(mkt.needTerms.includes("campanha") && mkt.needTerms.includes("divulgar"));
  assert.deepEqual(agents.listAgentsDeclaringCapability("marketing", "campaign"), ["MKT"]);
  assert.deepEqual(agents.getAgentCapabilityDeclarations("mkt").map((d) => d.capability), ["campaign"]);
  assert.equal(agents.isCommerciallyGovernedAgent("mkt"), true);
  assert.equal(agents.isCommerciallyGovernedAgent("eiah"), false);
});
