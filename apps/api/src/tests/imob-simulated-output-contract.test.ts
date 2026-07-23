// PR MCP-1E — defesa historica para outputs simulados persistidos antes do
// fail-closed MCP-1I (ver docs/architecture/mcp-contract-v1.md). Teste leve e
// propositalmente
// isolado: importa so imobCanonical.ts, sem tocar
// apps/api/src/queues/imobRunCompletedQueue.ts (Queue do BullMQ instanciada
// no nivel do modulo com conexao Redis real — ver imob-worker-foundation-
// phase4-1b.test.ts, que por isso precisa de services reais). Este arquivo
// nao precisa de Postgres/Redis: roda em test:ci-unit-suite (Grupo B).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  simulatedToolExecutionResultSchema,
  shouldSkipImobPostRunMutationForSimulatedOutput,
} from "../services/imob/imobCanonical.js";

// Shape historico produzido antes do MCP-1I quando uma acao realestate.*
// nao tinha ToolContract registrado. O produtor atual nao emite este shape.
const fullProducerLiteral = {
  ok: true,
  simulated: true,
  action: "realestate.register_property",
  version: "1.0.0",
  status: "success",
  output: {
    message: "Simulated realestate.register_property execution",
    payloadPreview: ["field1", "field2"],
  },
};

describe("[MCP-1E] simulatedToolExecutionResultSchema", () => {
  it("should accept the historical producer shape", () => {
    const parsed = simulatedToolExecutionResultSchema.safeParse(fullProducerLiteral);
    assert.equal(parsed.success, true);
    assert.deepEqual(parsed.data, fullProducerLiteral);
  });

  it("should reject a drifted shape where output.payloadPreview is not an array", () => {
    const drifted = {
      ...fullProducerLiteral,
      output: { ...fullProducerLiteral.output, payloadPreview: "not-an-array" },
    };
    assert.equal(simulatedToolExecutionResultSchema.safeParse(drifted).success, false);
  });
});

describe("[MCP-1E] shouldSkipImobPostRunMutationForSimulatedOutput", () => {
  it("should return TRUE for a valid historical simulated output", () => {
    const run = {
      response: {
        outputs: [{ stepId: "step-1", data: fullProducerLiteral }],
      },
    };
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput(run), true);
  });

  it("should return FALSE for an unexpected shape (simulated missing/not-literal-true)", () => {
    const runWithoutSimulated = {
      response: {
        outputs: [{ stepId: "step-1", data: { ok: true, action: "realestate.register_property" } }],
      },
    };
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput(runWithoutSimulated), false);

    const runWithStringSimulated = {
      response: {
        outputs: [{ stepId: "step-1", data: { ...fullProducerLiteral, simulated: "true" } }],
      },
    };
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput(runWithStringSimulated), false);
  });
});
