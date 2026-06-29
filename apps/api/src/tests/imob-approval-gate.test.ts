import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobApprovalGate } from "../services/imob/imobApprovalGate";

test("approval gate blocks HIGH action without approval", () => {
  const decision = resolveImobApprovalGate({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    runId: "run-a",
    actionType: "contract.prepare",
    policyCriticality: "HIGH",
    approvalStatus: "not_required",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "APPROVAL_REQUIRED");
});

test("approval gate blocks CRITICAL action without approval", () => {
  const decision = resolveImobApprovalGate({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    runId: "run-critical",
    actionType: "commission.settle",
    policyCriticality: "CRITICAL",
    approvalStatus: "pending",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "APPROVAL_REQUIRED");
});

test("approval gate allows HIGH action with valid approval", () => {
  const decision = resolveImobApprovalGate({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    runId: "run-a",
    actionType: "contract.prepare",
    policyCriticality: "HIGH",
    approvalId: "approval-1",
    approvalStatus: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-06-28T10:00:00.000Z",
    now: new Date("2026-06-28T11:00:00.000Z"),
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.reasonCode, "APPROVAL_GRANTED");
  assert.equal(decision.approvalId, "approval-1");
});

test("approval gate blocks expired approval", () => {
  const decision = resolveImobApprovalGate({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    runId: "run-a",
    actionType: "commission.settle",
    policyCriticality: "HIGH",
    approvalStatus: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-06-28T10:00:00.000Z",
    approvalExpiresAt: "2026-06-28T10:30:00.000Z",
    now: new Date("2026-06-28T11:00:00.000Z"),
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "APPROVAL_EXPIRED");
});

test("approval gate blocks scope mismatch", () => {
  const decision = resolveImobApprovalGate({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    runId: "run-a",
    actionType: "proposal.create",
    policyCriticality: "HIGH",
    approvalStatus: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-06-28T10:00:00.000Z",
    approvalScopeWorkspaceId: "workspace-b",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "APPROVAL_SCOPE_MISMATCH");
});

test("approval gate blocks tenant scope mismatch", () => {
  const decision = resolveImobApprovalGate({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    runId: "run-a",
    actionType: "proposal.create",
    policyCriticality: "HIGH",
    approvalStatus: "approved",
    approvedBy: "director@acme.test",
    approvedAt: "2026-06-28T10:00:00.000Z",
    approvalScopeTenantId: "tenant-b",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "APPROVAL_SCOPE_MISMATCH");
});

test("approval gate blocks invalid approval payload", () => {
  const decision = resolveImobApprovalGate({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    runId: "run-a",
    actionType: "deal.review",
    policyCriticality: "HIGH",
    approvalStatus: "approved",
    approvedBy: "",
    approvedAt: "not-a-date",
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "APPROVAL_INVALID");
});
