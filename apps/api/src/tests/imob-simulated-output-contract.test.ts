// PR MCP-1E — contrato tipado do fallback simulado (ver
// docs/architecture/mcp-contract-v1.md). Teste leve e propositalmente
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

// Shape exato produzido por apps/api/src/workers/runWorker.ts:1471-1484
// quando uma acao realestate.* nao tem ToolContract registrado.
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
  it("should accept the full producer shape from runWorker.ts", () => {
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
  it("should return TRUE for a valid simulated output (full producer shape)", () => {
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
