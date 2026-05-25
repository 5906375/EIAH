import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { resolveImobRecoveryResponse } from "../services/imob/orchestrator/imobRecoveryResolver";

test("dedupe context e2e keeps owner dedupe review explicit in the active case", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-dedupe-1",
    caseContext: {
      caseId: "case-dedupe-1",
      flow: "owner.dedupe_review",
    },
    operational: {
      flow: "owner.dedupe_review",
      dedupeDecision: {
        status: "pending",
        flow: "owner.create",
        entityType: "owner",
        entityId: "owner-1",
        entityLabel: "Carlos Alberto",
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    context,
    intent: "what_is_missing",
  });

  assert.equal(context.dedupe?.status, "pending_review");
  assert.equal(context.canonicalCaseState?.nextAction.reasonCode, "DEDUPE_REVIEW_PENDING");
  assert.equal(response.primaryAction?.operation, "owner.create");
  assert.match(response.summary, /dedupe/i);
});
