// Phase 4.1b — Worker Foundation tests
// Verifies: buildImobCanonicalCase extraction, shouldSkipImobPostRunMutationForSimulatedOutput guard,
// imobRunCompletedQueue payload validation, and architectural invariants.
//
// INVARIANTES VERIFICADOS:
// 1. buildImobCanonicalCase é função pura — sem efeitos colaterais em ImobCase
// 2. simulated=true → guard retorna true → mutation NUNCA ocorre
// 3. Fila rejeita payload sem campos obrigatórios
// 4. Canonical extraction não quebra comportamento existente

import "./support/testInfraEnv.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildImobCanonicalCase,
  shouldSkipImobPostRunMutationForSimulatedOutput,
  mapImobFlowToJourneyType,
  mapImobFlowToCommercialGoal,
  asStringList,
} from "../services/imob/imobCanonical.js";
import { enqueueImobRunCompleted } from "../queues/imobRunCompletedQueue.js";

// ─── S1: buildImobCanonicalCase — pure function, canonical outputs ──────────

describe("[S1] Phase 4.1b — buildImobCanonicalCase canonical extraction", () => {
  it("should derive journeyType=commission for commission.settle flow", () => {
    const result = buildImobCanonicalCase({
      flow: "commission.settle",
      stage: "closing",
      status: "ready_for_review",
    });
    assert.equal(result.journeyType, "commission");
    assert.equal(result.commercialGoal, "comissao");
  });

  it("should derive journeyType=property_capture for owner.create, property.create and listing.activate", () => {
    for (const flow of ["owner.create", "property.create", "listing.activate"]) {
      const result = buildImobCanonicalCase({ flow, stage: null, status: null });
      assert.equal(result.journeyType, "property_capture", `flow=${flow}`);
    }
  });

  it("should include BLOCKERS_PRESENT in reasonCodes when blockers non-empty", () => {
    const result = buildImobCanonicalCase({
      flow: "lead.qualify",
      stage: "intake",
      status: "blocked",
      blockers: ["Documento CPF ausente"],
    });
    assert.ok(result.reasonCodes?.includes("BLOCKERS_PRESENT"));
    assert.ok(result.reasonCodes?.includes("CASE_STATUS_BLOCKED"));
  });

  it("should cap recommendedActions at 3 entries", () => {
    const result = buildImobCanonicalCase({
      flow: "property.create",
      stage: "intake",
      status: "pending_data",
      pendingItems: ["Endereço", "Matrícula"],
      blockers: ["Proprietário ausente"],
      nextStep: "Avançar para revisão do imóvel",
    });
    assert.ok((result.recommendedActions?.length ?? 0) <= 3);
  });

  it("should produce empty blockedActions when no blockers provided", () => {
    const result = buildImobCanonicalCase({ flow: "proposal.create", stage: null, status: null });
    assert.deepEqual(result.blockedActions, []);
  });
});

// ─── S2: asStringList — extracted helper preserves behavior ─────────────────

describe("[S2] Phase 4.1b — asStringList helper", () => {
  it("should return empty array for non-array input", () => {
    assert.deepEqual(asStringList(null), []);
    assert.deepEqual(asStringList(undefined), []);
    assert.deepEqual(asStringList("string"), []);
    assert.deepEqual(asStringList(42), []);
  });

  it("should filter non-string elements and trim strings", () => {
    const result = asStringList(["  foo  ", 123, null, "bar", ""]);
    assert.deepEqual(result, ["foo", "bar"]);
  });
});

// ─── S3: shouldSkipImobPostRunMutationForSimulatedOutput ────────────────────

describe("[S3] Phase 4.1b — shouldSkipImobPostRunMutationForSimulatedOutput guard", () => {
  it("should return TRUE when any output has simulated=true (simulated run → skip mutation)", () => {
    const run = {
      response: {
        outputs: [
          { stepId: "step-1", data: { ok: true, simulated: true, action: "realestate.register_property", status: "success" } },
        ],
      },
    };
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput(run), true);
  });

  it("should return FALSE when no outputs are simulated (real run → allow mutation)", () => {
    const run = {
      response: {
        outputs: [
          { stepId: "step-1", data: { ok: true, simulated: false, action: "realestate.register_property" } },
        ],
      },
    };
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput(run), false);
  });

  it("should return FALSE when outputs array is empty", () => {
    const run = { response: { outputs: [] } };
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput(run), false);
  });

  it("should return FALSE when response is missing", () => {
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput({}), false);
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput({ response: null }), false);
  });

  it("should return FALSE when response.outputs is not an array", () => {
    const run = { response: { outputs: { stepId: "x", data: { simulated: true } } } };
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput(run), false);
  });

  it("should return TRUE when one of multiple outputs is simulated (any simulated → skip all)", () => {
    const run = {
      response: {
        outputs: [
          { stepId: "step-1", data: { ok: true, simulated: false } },
          { stepId: "step-2", data: { ok: true, simulated: true } },
        ],
      },
    };
    assert.equal(shouldSkipImobPostRunMutationForSimulatedOutput(run), true);
  });
});

// ─── S4: imobRunCompletedQueue payload validation ───────────────────────────

describe("[S4] Phase 4.1b — enqueueImobRunCompleted payload guard", () => {
  it("should throw when required fields are missing", async () => {
    const invalidPayload = {
      runId: "run-1",
      tenantId: "t1",
      workspaceId: "w1",
      // caseId missing
      actionId: "owner.register",
      eventRunId: "ev-1",
    } as Parameters<typeof enqueueImobRunCompleted>[0];

    await assert.rejects(
      () => enqueueImobRunCompleted(invalidPayload),
      /requires runId.*tenantId.*workspaceId.*caseId.*actionId.*eventRunId/,
    );
  });
});

// ─── S5: mapImobFlowTo* — boundary coverage ─────────────────────────────────

describe("[S5] Phase 4.1b — flow mapping boundary coverage", () => {
  it("should map all canonical IMOB flows to a known journeyType", () => {
    const flows = [
      "owner.create", "property.create", "listing.activate",
      "lead.qualify", "visit.schedule", "documents.collect",
      "proposal.create", "deal.review", "contract.prepare",
      "commission.settle", "rules.configure",
    ];
    const validJourneyTypes = [
      "property_capture", "lead_qualification", "proposal",
      "visit_follow_up", "negotiation", "documentation",
      "contract", "closing", "commission", "temporada_rules", "operations",
    ];
    for (const flow of flows) {
      const jt = mapImobFlowToJourneyType(flow);
      assert.ok(validJourneyTypes.includes(jt), `flow=${flow} → journeyType=${jt} not in valid set`);
    }
  });

  it("should map unknown flow to operations/operacao fallback", () => {
    assert.equal(mapImobFlowToJourneyType("unknown.flow"), "operations");
    assert.equal(mapImobFlowToCommercialGoal("unknown.flow"), "operacao");
  });

  it("should map null/undefined flow to operations/operacao fallback", () => {
    assert.equal(mapImobFlowToJourneyType(null), "operations");
    assert.equal(mapImobFlowToJourneyType(undefined), "operations");
    assert.equal(mapImobFlowToCommercialGoal(null), "operacao");
  });
});
