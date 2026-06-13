import test from "node:test";
import assert from "node:assert/strict";

import type { ImobCase } from "@/lib/api";
import { buildImobCaseList, formatImobProcessLabel } from "@/features/imob/imobCommandCenterHelper";

function createImobCase(overrides: Partial<ImobCase>): ImobCase {
  return {
    id: "case-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    threadId: "thread-1",
    flow: "property.create",
    stage: "collecting",
    status: "pending_data",
    ownerResponsible: "corretor",
    nextStep: "Completar dados do imóvel",
    blockers: [],
    pendingItems: [],
    ownerId: null,
    propertyId: null,
    leadId: null,
    externalDealId: null,
    metadata: null,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    canonical: {
      journeyType: "property_capture",
      recommendedActions: [{ id: "act-1", label: "Salvar cadastro", actionType: "operational" }],
    },
    owner: null,
    property: null,
    lead: null,
    _count: { events: 0 },
    ...overrides,
  };
}

test("formatImobProcessLabel maps the expected IMOB flows", () => {
  assert.equal(formatImobProcessLabel("property.create"), "Captação");
  assert.equal(formatImobProcessLabel("proposal.create"), "Proposta");
  assert.equal(formatImobProcessLabel("contract.prepare"), "Contrato");
  assert.equal(formatImobProcessLabel("commission.settle"), "Comissão");
  assert.equal(formatImobProcessLabel("unknown.flow"), "Caso");
});

test("buildImobCaseList returns process label and keeps process id available", () => {
  const rows = buildImobCaseList(
    [
      createImobCase({
        id: "case-captacao",
        flow: "property.create",
        canonical: {
          journeyType: "property_capture",
          recommendedActions: [{ id: "a1", label: "Salvar cadastro", actionType: "operational" }],
        },
      }),
      createImobCase({
        id: "case-proposta",
        flow: "proposal.create",
        canonical: {
          journeyType: "proposal",
          recommendedActions: [{ id: "a2", label: "Montar proposta", actionType: "operational" }],
        },
      }),
      createImobCase({
        id: "case-contrato",
        flow: "contract.prepare",
        canonical: {
          journeyType: "contract",
          recommendedActions: [{ id: "a3", label: "Gerar contrato", actionType: "operational" }],
        },
      }),
      createImobCase({
        id: "case-comissao",
        flow: "commission.settle",
        canonical: {
          journeyType: "commission",
          recommendedActions: [{ id: "a4", label: "Conferir settlement", actionType: "operational" }],
        },
      }),
    ],
    "all",
    "all",
  );

  const byId = new Map(rows.map((row) => [row.processId, row]));
  assert.equal(byId.get("case-captacao")?.processLabel, "Captação");
  assert.equal(byId.get("case-proposta")?.processLabel, "Proposta");
  assert.equal(byId.get("case-contrato")?.processLabel, "Contrato");
  assert.equal(byId.get("case-comissao")?.processLabel, "Comissão");
  assert.equal(byId.get("case-captacao")?.journeyLabel, "Captação");
  assert.equal(byId.get("case-proposta")?.journeyLabel, "Proposta");
  assert.equal(byId.get("case-captacao")?.processId, "case-captacao");
});
