import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResponsibleActorAssignmentContract,
  responsibleActorAssignmentContractSchema,
} from "../types/verticalResponsibleActorContract";

test("vertical responsible actor contract accepts canonical IMOB assignment", () => {
  const contract = buildResponsibleActorAssignmentContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalKey: "IMOB",
    entityType: "imob.case",
    entityId: "case-123",
    entitlementStatus: "active",
    responsibleUserId: "user-123",
  });

  assert.equal(contract.verticalKey, "IMOB");
  assert.equal(contract.entityType, "imob.case");
  assert.equal(contract.entitlementStatus, "active");
  assert.equal(contract.responsibleUserId, "user-123");
});

test("vertical responsible actor contract accepts canonical LEGAL assignment", () => {
  const contract = buildResponsibleActorAssignmentContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalKey: "LEGAL",
    entityType: "legal.document",
    entityId: "doc-123",
    responsibleMemberId: "member-123",
  });

  assert.equal(contract.verticalKey, "LEGAL");
  assert.equal(contract.entityType, "legal.document");
  assert.equal(contract.entitlementStatus, "active");
  assert.equal(contract.responsibleMemberId, "member-123");
});

test("vertical responsible actor contract rejects cross-vertical entity types", () => {
  const parsed = responsibleActorAssignmentContractSchema.safeParse({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalKey: "LEGAL",
    entityType: "imob.case",
    entityId: "case-123",
    responsibleUserId: "user-123",
  });

  assert.equal(parsed.success, false);
  assert.match(parsed.error.issues[0]?.message ?? "", /not valid for verticalKey LEGAL/i);
});

test("vertical responsible actor contract requires at least one responsible identifier", () => {
  const parsed = responsibleActorAssignmentContractSchema.safeParse({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalKey: "IMOB",
    entityType: "imob.case",
    entityId: "case-123",
  });

  assert.equal(parsed.success, false);
  assert.match(parsed.error.issues[0]?.message ?? "", /responsibleUserId or responsibleMemberId is required/i);
});

