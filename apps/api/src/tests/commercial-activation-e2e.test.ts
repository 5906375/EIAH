import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { planImobCase } from "../services/imob/crm/imobCrmCasePlanner";
import { resolveImobOperationRouteLoose } from "../services/imob/orchestrator/imobOperationRouter";

test("commercial activation E2E keeps the mission blocked while policy and approval are still pending", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "campaign-case-1",
    caseContext: {
      caseId: "campaign-case-1",
      flow: "listing.activate",
    },
    operational: {
      flow: "listing.activate",
      pendingFields: [],
      campaignDraft: {
        propertyId: "property-9911",
        campaignRef: "campaign-owner-reactivation",
        objective: "promote_listing",
        publicationChannels: ["portal"],
        approvalRequired: true,
        approvalStatus: "pending",
        policyStatus: "pending",
        consentStatus: "ready",
        evidenceStatus: "pending",
        activationStatus: "draft",
      },
    },
  });

  const plan = planImobCase(context);
  const route = resolveImobOperationRouteLoose(context.canonicalCaseState?.nextAction.operation);

  assert.equal(context.canonicalCaseState?.mission, "commercial_activation");
  assert.equal(context.canonicalCaseState?.currentStep, "blocked_by_policy");
  assert.equal(context.canonicalCaseState?.missionStatus, "blocked");
  assert.equal(context.canonicalCaseState?.nextAction.operation, "campaign");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "CAMPAIGN_POLICY_REQUIRED");
  assert.equal(context.canonicalCaseState?.proof.required, true);
  assert.equal(context.canonicalCaseState?.proof.minimumProofSatisfied, false);
  assert.deepEqual(context.canonicalCaseState?.proof.missingProof, ["campaign_record"]);
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "listing.activate");
  assert.equal(plan.primaryAction?.operation, "listing.activate");
  assert.equal(context.crmProjection?.caseCard.targetAgent, "IMOB_FollowUpAgent");
  assert.equal(route?.dispatchedAgentId, "IMOB_FollowUpAgent");
});

test("commercial activation E2E marks the mission done when the campaign is published with proof satisfied", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "campaign-case-2",
    caseContext: {
      caseId: "campaign-case-2",
      flow: "listing.activate",
    },
    operational: {
      flow: "listing.activate",
      pendingFields: [],
      campaignDraft: {
        propertyId: "property-9911",
        campaignRef: "campaign-owner-reactivation",
        objective: "promote_listing",
        publicationChannels: ["portal", "internal"],
        approvalRequired: true,
        approvalStatus: "approved",
        policyStatus: "ready",
        consentStatus: "ready",
        evidenceStatus: "ready",
        activationStatus: "published",
      },
    },
  });

  assert.equal(context.canonicalCaseState?.mission, "commercial_activation");
  assert.equal(context.canonicalCaseState?.currentStep, "published_or_sent");
  assert.equal(context.canonicalCaseState?.missionStatus, "done");
  assert.equal(context.canonicalCaseState?.proof.required, true);
  assert.equal(context.canonicalCaseState?.proof.minimumProofSatisfied, true);
  assert.equal(context.crmProjection?.caseCard.proofStatus, "satisfied");
  assert.equal(context.recoverySnapshot?.primaryAction?.operation, "listing.activate");
});
