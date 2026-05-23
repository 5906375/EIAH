import test from "node:test";
import assert from "node:assert/strict";

import { createImobAgentActivityEvent } from "../services/imob/agents/imobAgentActivity";
import { buildImobAgentActivities } from "../services/imob/agents/imobAgentActivityRuntime";

test("agent activity event defaults the visual prefix to Agente and normalizes labels", () => {
  const event = createImobAgentActivityEvent({
    agentId: "IMOB_MarketScanAgent",
    agentLabel: " Market Scan ",
    role: "supporting",
    mode: "intelligence",
    status: "working",
    visibleMessage: " Preparando varredura em Itajaí e Camboriú. ",
  });

  assert.equal(event.displayPrefix, "Agente");
  assert.equal(event.agentLabel, "Market Scan");
  assert.equal(event.visibleMessage, "Preparando varredura em Itajaí e Camboriú.");
});

test("agent activity event preserves governance metadata without inferring UI routing", () => {
  const event = createImobAgentActivityEvent({
    agentId: "Guardian_EvidenceAgent",
    agentLabel: "Guardian",
    role: "guardian",
    mode: "audit",
    status: "completed",
    visibleMessage: "Registrando snapshot da análise.",
    reasonCode: "evidence.decision_rationale",
    evidenceId: "ev-123",
  });

  assert.equal(event.role, "guardian");
  assert.equal(event.mode, "audit");
  assert.equal(event.reasonCode, "evidence.decision_rationale");
  assert.equal(event.evidenceId, "ev-123");
});

test("buildImobAgentActivities emits IMOB, Market Scan and Guardian for resolved market scan", () => {
  const activities = buildImobAgentActivities({
    mode: "consult",
    action: "realestate.market_scan",
    threadLabel: "Captação",
    conversationState: {
      slots: {
        goal: null,
        city: null,
        region: null,
        neighborhood: null,
        budgetMax: null,
        bedrooms: null,
        bathrooms: null,
        propertyType: null,
      },
      mode: "consult",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "property.market_scan",
        status: "collecting",
        pendingFields: ["city", "goal"],
        propertyDraft: {
          propertyId: null,
          propertyType: null,
          goal: null,
          cep: null,
          city: null,
          neighborhood: null,
          bedrooms: null,
          bathrooms: null,
          address: null,
        },
        marketScanContext: {
          cities: ["Itajaí", "Camboriú"],
          cityCandidates: ["Itajaí", "Camboriú"],
          uf: "SC",
          goals: ["locacao"],
          goalCandidates: ["locacao"],
          propertyTypes: ["apartamento"],
          bedrooms: [2],
          priceRange: null,
          readOnly: true,
          limitPerGroup: 10,
        },
      },
    },
    presentation: {
      text: "Varredura read-only concluída.",
      marketScanResult: {
        scanId: "scan-1",
        providerId: "internal_crm",
        sourceStatus: "completed",
        totalItems: 1,
        groups: [],
        readOnly: true,
        generatedAt: "2026-05-09T12:00:00.000Z",
      },
    },
  } as any);

  assert.deepEqual(
    activities.map((item) => item.agentLabel),
    ["IMOB", "Market Scan", "Guardian"],
  );
  assert.equal(activities[1]?.mode, "intelligence");
  assert.equal(activities[0]?.displayPrefix, "Agente");
  assert.equal(activities[2]?.evidenceId, "scan-1");
});

test("buildImobAgentActivities preserves IMOB ownership and dispatches PropertyAgent for property.create", () => {
  const activities = buildImobAgentActivities({
    mode: "execute",
    action: "realestate.property_create",
    threadLabel: "Captação",
    conversationState: {
      slots: {
        goal: null,
        city: null,
        region: null,
        neighborhood: null,
        budgetMax: null,
        bedrooms: null,
        bathrooms: null,
        propertyType: null,
      },
      mode: "execute",
      pendingSlot: "none",
      resultOffset: 0,
      operational: {
        flow: "property.create",
        status: "collecting",
        pendingFields: ["city"],
        propertyDraft: {
          propertyId: null,
          propertyType: null,
          goal: null,
          cep: null,
          city: null,
          neighborhood: null,
          bedrooms: null,
          bathrooms: null,
          address: null,
        },
      },
    },
    presentation: {
      text: "Vamos cadastrar o imóvel.",
    },
  } as any);

  assert.deepEqual(
    activities.map((item) => item.agentId),
    ["IMOB_Orchestrator", "IMOB_PropertyAgent"],
  );
  assert.equal(activities[0]?.role, "owner");
  assert.equal(activities[1]?.role, "owner");
  assert.match(activities[1]?.visibleMessage ?? "", /cadastro|imóvel/i);
});
