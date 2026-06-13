import test from "node:test";
import assert from "node:assert/strict";

import { buildResponsibleActorAssignmentContract } from "../types/verticalResponsibleActorContract";
import { resolveVerticalExperienceRegistry } from "../services/verticalExperienceRegistry";

test("LEGAL responsible actor stub accepts legal.document under the shared canonical contract", () => {
  const contract = buildResponsibleActorAssignmentContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalKey: "LEGAL",
    entityType: "legal.document",
    entityId: "document-123",
    entitlementStatus: "active",
    responsibleMemberId: "member-123",
  });

  assert.equal(contract.verticalKey, "LEGAL");
  assert.equal(contract.entityType, "legal.document");
  assert.equal(contract.responsibleMemberId, "member-123");
});

test("LEGAL responsible actor stub accepts legal.opinion under the shared canonical contract", () => {
  const contract = buildResponsibleActorAssignmentContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalKey: "LEGAL",
    entityType: "legal.opinion",
    entityId: "opinion-123",
    entitlementStatus: "active",
    responsibleUserId: "user-123",
  });

  assert.equal(contract.verticalKey, "LEGAL");
  assert.equal(contract.entityType, "legal.opinion");
  assert.equal(contract.responsibleUserId, "user-123");
});

test("LEGAL stub remains aligned with the vertical experience registry", () => {
  const registry = resolveVerticalExperienceRegistry({
    installedProducts: [],
  });

  const legal = registry.find((item) => item.verticalId === "LEGAL");

  assert.ok(legal);
  assert.equal(legal?.verticalId, "LEGAL");
  assert.equal(legal?.activeDomain, "core");
  assert.equal(legal?.rolloutStage, "context_only");
  assert.equal(legal?.enabled, true);
  assert.match(legal?.contextSpecRef ?? "", /vertical-context-legal\.md$/i);
});

