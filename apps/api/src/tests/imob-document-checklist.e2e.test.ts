import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { resolveImobRecoveryResponse } from "../services/imob/orchestrator/imobRecoveryResolver";

test("document checklist e2e varies by operation and keeps blockers explicit", () => {
  const saleContext = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-sale",
    caseContext: {
      caseId: "case-sale",
      flow: "documents.collect",
      property: { id: "property-sale", goal: "venda", city: "Itapema", address: "Rua 1", ownerId: "owner-1" },
      owner: { id: "owner-1", name: "Carlos Alberto", document: "12345678900" },
    },
    operational: {
      flow: "documents.collect",
      documentDraft: {
        referenceId: "property-sale",
        subjectType: "owner",
        documentTypes: ["cpf"],
        deliveryChannel: "upload",
      },
    },
  });

  const seasonalContext = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-seasonal",
    caseContext: {
      caseId: "case-seasonal",
      flow: "documents.collect",
      property: { id: "property-sea", goal: "aluguel_por_temporada", city: "Itapema", address: "Rua 2", ownerId: "owner-1" },
      owner: { id: "owner-1", name: "Carlos Alberto", document: "12345678900" },
    },
    operational: {
      flow: "documents.collect",
      documentDraft: {
        referenceId: "property-sea",
        subjectType: "owner",
        documentTypes: ["cpf", "matricula"],
        deliveryChannel: "upload",
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    context: seasonalContext,
    intent: "what_is_missing",
  });

  assert.equal(saleContext.documentChecklist?.operation, "venda");
  assert.equal(seasonalContext.documentChecklist?.operation, "temporada");
  assert.ok(seasonalContext.documentChecklist?.pendingDocuments.includes("regras e condições da temporada"));
  assert.match(response.summary, /temporada/i);
  assert.equal(response.primaryAction?.operation, "documents.collect");
});
