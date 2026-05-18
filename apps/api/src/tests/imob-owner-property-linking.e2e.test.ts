import test from "node:test";
import assert from "node:assert/strict";

import {
  linkImobPropertyOwner,
  type ImobPropertyLinkOwnerRepository,
} from "../services/imob/crm/operations/propertyLinkOwner";

function createRepository(initialOwnerId?: string | null) {
  const calls: Array<Record<string, unknown>> = [];
  const repository: ImobPropertyLinkOwnerRepository = {
    async getOwner({ ownerId }) {
      return ownerId === "owner-1" ? { id: ownerId } : null;
    },
    async getProperty({ propertyId }) {
      return propertyId === "property-1" ? { id: propertyId, ownerId: initialOwnerId } : null;
    },
    async linkOwnerToProperty(params) {
      calls.push(params);
    },
  };
  return { repository, calls };
}

test("property.link_owner links owner and property once inside tenant/workspace/case scope", async () => {
  const { repository, calls } = createRepository(null);
  const result = await linkImobPropertyOwner({
    repository,
    input: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "case-1",
      ownerId: "owner-1",
      propertyId: "property-1",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "linked");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.ownerId, "owner-1");
  assert.equal(calls[0]?.propertyId, "property-1");
});

test("property.link_owner is idempotent when owner is already linked", async () => {
  const { repository, calls } = createRepository("owner-1");
  const result = await linkImobPropertyOwner({
    repository,
    input: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "case-1",
      ownerId: "owner-1",
      propertyId: "property-1",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "already_linked");
  assert.equal(calls.length, 0);
});

test("property.link_owner fails closed without required scope and entity ids", async () => {
  const { repository, calls } = createRepository(null);
  const missingCase = await linkImobPropertyOwner({
    repository,
    input: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "",
      ownerId: "owner-1",
      propertyId: "property-1",
    },
  });
  const missingOwner = await linkImobPropertyOwner({
    repository,
    input: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      caseId: "case-1",
      ownerId: null,
      propertyId: "property-1",
    },
  });

  assert.equal(missingCase.ok, false);
  assert.equal(missingCase.status, "blocked");
  assert.equal((missingCase as any).reasonCode, "case_scope_missing");
  assert.equal(missingOwner.ok, false);
  assert.equal((missingOwner as any).reasonCode, "owner_id_missing");
  assert.equal(calls.length, 0);
});
