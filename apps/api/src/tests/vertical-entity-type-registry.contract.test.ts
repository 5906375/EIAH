import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResponsibleActorAssignmentContract,
  responsibleActorEntityTypeSchema,
  responsibleActorVerticalKeySchema,
} from "../types/verticalResponsibleActorContract";
import { resolveVerticalExperienceRegistry } from "../services/verticalExperienceRegistry";

test("vertical entity type registry exposes only explicit canonical values for IMOB and LEGAL", () => {
  assert.deepEqual(responsibleActorVerticalKeySchema.options, ["IMOB", "LEGAL"]);
  assert.deepEqual(responsibleActorEntityTypeSchema.options, [
    "imob.case",
    "imob.lead",
    "imob.property",
    "legal.document",
    "legal.opinion",
  ]);
});

test("vertical entity type registry accepts canonical entity types for declared verticals", () => {
  const imob = buildResponsibleActorAssignmentContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalKey: "IMOB",
    entityType: "imob.property",
    entityId: "property-1",
    responsibleUserId: "user-1",
  });

  const legal = buildResponsibleActorAssignmentContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalKey: "LEGAL",
    entityType: "legal.opinion",
    entityId: "opinion-1",
    responsibleMemberId: "member-1",
  });

  assert.equal(imob.entityType, "imob.property");
  assert.equal(legal.entityType, "legal.opinion");
});

test("vertical entity type registry rejects free-form entity types", () => {
  const parsed = responsibleActorEntityTypeSchema.safeParse("legal.memo");

  assert.equal(parsed.success, false);
});

test("vertical entity type registry stays aligned with currently declared verticals in the platform registry", () => {
  const registry = resolveVerticalExperienceRegistry({
    installedProducts: [{ product: "IMOB", status: "active" }],
  });

  const declaredVerticals = registry
    .map((item) => item.verticalId)
    .filter((item): item is "IMOB" | "LEGAL" => item === "IMOB" || item === "LEGAL")
    .sort();

  const contractVerticals = [...responsibleActorVerticalKeySchema.options].sort();

  assert.deepEqual(declaredVerticals, contractVerticals);
});

