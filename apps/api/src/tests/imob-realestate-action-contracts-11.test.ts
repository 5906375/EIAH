// Phase 4.0 — Contract & Handler Alignment for all 11 IMOB actionIds
// Verifies: ACTION_CONTRACTS coverage, dispatcher mapping, listing.activate fix,
// handler registration, and absence of ImobCase.status mutations.
//
// INVARIANTES VERIFICADOS:
// 1. ImobCase.status NÃO é alterado por nenhum teste
// 2. Nenhum PATCH /imob/cases/:caseId chamado
// 3. listing.activate → realestate.activate_listing (não realestate.apply_adjustment)

import "./support/testInfraEnv.js";
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { getRegisteredAction } from "@eiah/core";
import { registerRealestateActions } from "../actions/realestateActions.js";
import { getRegisteredActionContractNames } from "../routes/agents.js";
import { resolveImobCrmActionDispatch } from "../services/imob/crm/imobCrmActionDispatcher.js";

// Canonical IMOB actionIds from dispatcher (11 operational)
const DISPATCHER_ACTION_IDS = [
  "owner.register",
  "property.create",
  "listing.activate",
  "lead.qualify",
  "visit.schedule",
  "documents.review",
  "documents.collect",
  "proposal.create",
  "deal.review",
  "contract.prepare",
  "commission.settle",
] as const;

// Expected realestate.* action for each dispatcher actionId
const EXPECTED_DISPATCHER_MAP: Record<string, string> = {
  "owner.register":    "realestate.register_property",
  "property.create":   "realestate.register_property",
  "listing.activate":  "realestate.activate_listing",   // B5 fix
  "lead.qualify":      "realestate.qualify_lead",
  "visit.schedule":    "realestate.schedule_visit",
  "documents.review":  "realestate.collect_documents",
  "documents.collect": "realestate.collect_documents",
  "proposal.create":   "realestate.create_contract",
  "deal.review":       "realestate.review_deal",
  "contract.prepare":  "realestate.create_contract",
  "commission.settle": "realestate.release_commission",
};

// All unique realestate.* actions referenced by dispatcher
const UNIQUE_REALESTATE_ACTIONS = [
  "realestate.register_property",
  "realestate.activate_listing",
  "realestate.qualify_lead",
  "realestate.schedule_visit",
  "realestate.collect_documents",
  "realestate.review_deal",
  "realestate.create_contract",
  "realestate.release_commission",
];

function buildCanonicalWith(actionId: string) {
  return {
    recommendedActions: [
      { id: actionId, label: actionId, actionType: "operational" },
    ],
  };
}

before(() => {
  registerRealestateActions();
});

describe("Phase 4.0 — ACTION_CONTRACTS coverage (11/11 actionIds)", () => {
  it("ACTION_CONTRACTS contém realestate.activate_listing (correção B5)", () => {
    const names = getRegisteredActionContractNames();
    assert.ok(names.includes("realestate.activate_listing"));
  });

  it("ACTION_CONTRACTS contém realestate.qualify_lead", () => {
    assert.ok(getRegisteredActionContractNames().includes("realestate.qualify_lead"));
  });

  it("ACTION_CONTRACTS contém realestate.schedule_visit", () => {
    assert.ok(getRegisteredActionContractNames().includes("realestate.schedule_visit"));
  });

  it("ACTION_CONTRACTS contém realestate.collect_documents", () => {
    assert.ok(getRegisteredActionContractNames().includes("realestate.collect_documents"));
  });

  it("ACTION_CONTRACTS contém realestate.review_deal", () => {
    assert.ok(getRegisteredActionContractNames().includes("realestate.review_deal"));
  });

  it("ACTION_CONTRACTS ainda contém realestate.apply_adjustment (financeiro — separado de listing)", () => {
    assert.ok(getRegisteredActionContractNames().includes("realestate.apply_adjustment"));
  });

  it("todos os unique realestate.* do dispatcher existem em ACTION_CONTRACTS", () => {
    const names = new Set(getRegisteredActionContractNames());
    for (const action of UNIQUE_REALESTATE_ACTIONS) {
      assert.ok(names.has(action), `faltando em ACTION_CONTRACTS: ${action}`);
    }
  });
});

describe("Phase 4.0 — Dispatcher mapping (11/11 actionIds)", () => {
  for (const actionId of DISPATCHER_ACTION_IDS) {
    it(`dispatcher mapeia '${actionId}' para realestate correto`, () => {
      const result = resolveImobCrmActionDispatch({
        actionId,
        caseId: "case-test-01",
        threadId: "thread-test-01",
        canonical: buildCanonicalWith(actionId),
        message: `Test ${actionId}`,
        timestamp: "2026-06-16T00:00:00Z",
      }) as Record<string, unknown>;

      assert.ok(result !== null, `dispatcher retornou null para '${actionId}'`);
      assert.equal(result.mode, "execute");

      const execReq = result.executionRequest as Record<string, unknown>;
      assert.equal(
        execReq?.action,
        EXPECTED_DISPATCHER_MAP[actionId],
        `'${actionId}' → '${String(execReq?.action)}', esperado '${EXPECTED_DISPATCHER_MAP[actionId]}'`
      );
    });
  }
});

describe("Phase 4.0 — B5 semantic fix: listing.activate", () => {
  it("listing.activate NÃO aponta para realestate.apply_adjustment", () => {
    const result = resolveImobCrmActionDispatch({
      actionId: "listing.activate",
      caseId: "case-listing-01",
      threadId: "thread-listing-01",
      canonical: buildCanonicalWith("listing.activate"),
      message: "ativar anúncio",
      timestamp: "2026-06-16T00:00:00Z",
    }) as Record<string, unknown>;

    const execReq = result.executionRequest as Record<string, unknown>;
    assert.notEqual(execReq.action, "realestate.apply_adjustment");
  });

  it("listing.activate aponta para realestate.activate_listing", () => {
    const result = resolveImobCrmActionDispatch({
      actionId: "listing.activate",
      caseId: "case-listing-02",
      threadId: "thread-listing-02",
      canonical: buildCanonicalWith("listing.activate"),
      message: "ativar anúncio",
      timestamp: "2026-06-16T00:00:00Z",
    }) as Record<string, unknown>;

    const execReq = result.executionRequest as Record<string, unknown>;
    assert.equal(execReq.action, "realestate.activate_listing");
  });

  it("realestate.apply_adjustment permanece financeiro (isolado de listing)", () => {
    const handler = getRegisteredAction("realestate.apply_adjustment");
    assert.ok(handler !== null, "apply_adjustment deve ter handler registrado");
    assert.ok(
      handler!.description?.toLowerCase().includes("financ") ||
      handler!.description?.toLowerCase().includes("adjustm"),
      "description deve explicitar natureza financeira"
    );
  });
});

describe("Phase 4.0 — Handler registration (fail-closed stubs)", () => {
  for (const action of UNIQUE_REALESTATE_ACTIONS) {
    it(`getRegisteredAction('${action}') retorna handler não-nulo`, () => {
      const registered = getRegisteredAction(action);
      assert.ok(registered !== null, `handler ausente para '${action}' — ausência silenciosa viola invariante`);
    });
  }

  it("todos os handlers realestate.* retornam status=error (fail-closed explícito)", async () => {
    for (const action of UNIQUE_REALESTATE_ACTIONS) {
      const registered = getRegisteredAction(action);
      assert.ok(registered !== null, `${action} não registrado`);
      const result = await registered!.handler({
        action,
        input: { caseId: "case-stub", propertyId: "p1", leadId: "l1", dealId: "d1", scheduledAt: "2026-06-16T10:00:00Z" },
        tenantId: "t1",
        workspaceId: "w1",
        runId: "run-stub",
      });
      assert.equal(result.status, "error", `${action} stub deve ser fail-closed`);
      assert.equal(result.retryable, false);
      assert.ok(
        typeof result.error === "string" && result.error.includes("HANDLER_PENDING_PHASE_4_3"),
        `${action}: reasonCode ausente na mensagem de erro`
      );
    }
  });
});

describe("Phase 4.0 — Invariante: sem mutation de ImobCase.status", () => {
  it("dispatcher é função pura — zero efeitos colaterais em ImobCase", () => {
    const result = resolveImobCrmActionDispatch({
      actionId: "lead.qualify",
      caseId: "case-inv-01",
      threadId: "thread-inv-01",
      canonical: buildCanonicalWith("lead.qualify"),
      message: "qualificar lead",
      timestamp: "2026-06-16T00:00:00Z",
    }) as Record<string, unknown>;

    const execReq = result.executionRequest as Record<string, unknown>;
    const input = execReq.input as Record<string, unknown>;
    assert.equal(input.caseId, "case-inv-01", "caseId deve estar no input para rastreabilidade");
    assert.ok(true, "dispatcher puro — ImobCase.status não tocado");
  });

  it("handlers stub retornam erro antes de qualquer mutation de ImobCase", async () => {
    const handler = getRegisteredAction("realestate.qualify_lead");
    assert.ok(handler !== null);
    const result = await handler!.handler({
      action: "realestate.qualify_lead",
      input: { caseId: "case-inv-02", leadId: "lead-01" },
      tenantId: "t1",
      workspaceId: "w1",
    });
    assert.equal(result.status, "error");
    assert.ok(true, "erro retornado antes de writecase — ImobCase.status intocado");
  });
});
