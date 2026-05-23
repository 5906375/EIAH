import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { planImobCase } from "../services/imob/crm/imobCrmCasePlanner";
import { resolveImobOperationRouteLoose } from "../services/imob/orchestrator/imobOperationRouter";

test("prepare contract E2E routes back to documents when the document packet is still pending", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "contract-case-1",
    caseContext: {
      caseId: "contract-case-1",
      flow: "contract.prepare",
    },
    operational: {
      flow: "contract.prepare",
      pendingFields: ["documentPacketStatus"],
      contractDraft: {
        propertyId: "property-4455",
        counterpartyName: "Maria",
        contractType: "sale",
        documentPacketStatus: "pending",
        handoffTarget: "LEGAL",
        approvalRequired: true,
      },
    },
  });

  const plan = planImobCase(context);
  const route = resolveImobOperationRouteLoose(context.canonicalCaseState?.nextAction.operation);

  assert.equal(context.canonicalCaseState?.mission, "prepare_contract");
  assert.equal(context.canonicalCaseState?.currentStep, "checking_document_sufficiency");
  assert.equal(context.canonicalCaseState?.missionStatus, "blocked");
  assert.equal(context.canonicalCaseState?.nextAction.operation, "documents");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "DOCUMENTS_REQUIRED");
  assert.equal(context.canonicalCaseState?.proof.required, true);
  assert.equal(context.canonicalCaseState?.proof.minimumProofSatisfied, false);
  assert.deepEqual(context.canonicalCaseState?.proof.missingProof, ["document_package"]);
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "documents.collect");
  assert.equal(plan.primaryAction?.operation, "documents.collect");
  assert.equal(context.crmProjection?.caseCard.targetAgent, "IMOB_DocumentAgent");
  assert.equal(route?.dispatchedAgentId, "IMOB_DocumentAgent");
});

test("prepare contract E2E advances to legal handoff when documents are ready", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "contract-case-2",
    caseContext: {
      caseId: "contract-case-2",
      flow: "contract.prepare",
    },
    operational: {
      flow: "contract.prepare",
      pendingFields: [],
      contractDraft: {
        propertyId: "property-4455",
        counterpartyName: "Maria",
        contractType: "sale",
        documentPacketStatus: "ready",
        handoffTarget: "LEGAL",
        approvalRequired: true,
      },
    },
  });

  assert.equal(context.canonicalCaseState?.mission, "prepare_contract");
  assert.equal(context.canonicalCaseState?.currentStep, "legal_handoff");
  assert.equal(context.canonicalCaseState?.missionStatus, "in_progress");
  assert.equal(context.canonicalCaseState?.nextAction.operation, "contract");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "CONTRACT_PREPARATION_REQUIRED");
  assert.equal(context.canonicalCaseState?.proof.required, true);
  assert.equal(context.canonicalCaseState?.proof.minimumProofSatisfied, true);
  assert.equal(context.crmProjection?.caseCard.proofStatus, "satisfied");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "contract.prepare");
});
