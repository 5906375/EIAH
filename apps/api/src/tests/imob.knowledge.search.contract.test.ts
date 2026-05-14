import "./support/testInfraEnv";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import process from "node:process";
import supertest from "supertest";
import { prismaGlobal } from "@repo/db";
import { createUploadedDocument } from "../services/uploads";

let request: ReturnType<typeof supertest>;

const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const entitledTenantId = `tenant-imob-knowledge-${suffix}`;
const entitledWorkspaceId = `workspace-imob-knowledge-${suffix}`;
const entitledUserId = `user-imob-knowledge-${suffix}`;
const entitledApiToken = `tok-imob-knowledge-${suffix}`;

const blockedTenantId = `tenant-imob-knowledge-blocked-${suffix}`;
const blockedWorkspaceId = `workspace-imob-knowledge-blocked-${suffix}`;
const blockedUserId = `user-imob-knowledge-blocked-${suffix}`;
const blockedApiToken = `tok-imob-knowledge-blocked-${suffix}`;

before(async () => {
  process.env.NODE_ENV = "test";
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: entitledTenantId, name: entitledTenantId } });
  await prismaGlobal.workspace.create({ data: { id: entitledWorkspaceId, tenantId: entitledTenantId, name: entitledWorkspaceId } });
  await prismaGlobal.user.create({
    data: { id: entitledUserId, tenantId: entitledTenantId, email: `${entitledUserId}@example.com`, displayName: "IMOB Knowledge Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: entitledApiToken,
      tenantId: entitledTenantId,
      workspaceId: entitledWorkspaceId,
      userId: entitledUserId,
      description: "imob-knowledge-search-test",
      revoked: false,
    },
  });
  await prismaGlobal.tenantActionPolicy.create({
    data: {
      tenantId: entitledTenantId,
      workspaceId: entitledWorkspaceId,
      actionName: "realestate.search_knowledge_base",
      allowed: true,
    },
  });
  await createUploadedDocument({
    prisma: prismaGlobal,
    tenantId: entitledTenantId,
    workspaceId: entitledWorkspaceId,
    agentSlug: "imob",
    fileName: "checklist-captacao-locacao-joinville.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    storageKey: `tests/${suffix}/checklist-captacao-locacao-joinville.pdf`,
    url: `/api/uploads/upload-knowledge-${suffix}`,
  });

  await prismaGlobal.tenant.create({ data: { id: blockedTenantId, name: blockedTenantId } });
  await prismaGlobal.workspace.create({ data: { id: blockedWorkspaceId, tenantId: blockedTenantId, name: blockedWorkspaceId } });
  await prismaGlobal.user.create({
    data: { id: blockedUserId, tenantId: blockedTenantId, email: `${blockedUserId}@example.com`, displayName: "IMOB Knowledge Blocked Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: blockedApiToken,
      tenantId: blockedTenantId,
      workspaceId: blockedWorkspaceId,
      userId: blockedUserId,
      description: "imob-knowledge-search-blocked-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.uploadedDocument.deleteMany({
    where: { tenantId: { in: [entitledTenantId, blockedTenantId] } },
  });
  await prismaGlobal.tenantActionPolicy.deleteMany({
    where: { tenantId: { in: [entitledTenantId, blockedTenantId] } },
  });
  await prismaGlobal.apiToken.deleteMany({
    where: { tenantId: { in: [entitledTenantId, blockedTenantId] } },
  });
  await prismaGlobal.user.deleteMany({
    where: { tenantId: { in: [entitledTenantId, blockedTenantId] } },
  });
  await prismaGlobal.workspace.deleteMany({
    where: { tenantId: { in: [entitledTenantId, blockedTenantId] } },
  });
  await prismaGlobal.guardrailAuditLedger.deleteMany({
    where: { tenantId: { in: [entitledTenantId, blockedTenantId] } },
  });
  await prismaGlobal.tenant.deleteMany({
    where: { id: { in: [entitledTenantId, blockedTenantId] } },
  });
  await prismaGlobal.$disconnect();
});

test("IMOB knowledge search returns metadata results for entitled tenant/workspace", async () => {
  const response = await request
    .post("/api/imob/knowledge/search")
    .set("Authorization", `Bearer ${entitledApiToken}`)
    .send({
      query: "contratos e propostas de locação em São Paulo",
      filters: {
        region: "São Paulo",
        segment: "locacao",
      },
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.tenantId, entitledTenantId);
  assert.equal(response.body?.data?.workspaceId, entitledWorkspaceId);
  assert.equal(response.body?.data?.entitlements?.REAL_ESTATE_CORE, true);
  assert.ok(Array.isArray(response.body?.data?.items));
  assert.ok((response.body?.data?.items ?? []).length >= 1);
  const firstItem = response.body?.data?.items?.[0];
  assert.equal(typeof firstItem?.sourceType, "string");
  assert.equal(typeof firstItem?.source?.type, "string");
  assert.equal(typeof firstItem?.source?.label, "string");
  assert.equal(typeof firstItem?.source?.origin, "string");
  assert.equal(typeof response.body?.data?.searchContext?.scopeLabel, "string");
  assert.equal(typeof response.body?.data?.searchContext?.provenance?.driveSyncActive, "boolean");
  assert.equal(typeof response.body?.data?.searchContext?.provenance?.webSyncActive, "boolean");
  assert.equal(typeof firstItem?.title, "string");
  assert.equal(typeof firstItem?.snippet, "string");
});

test("IMOB knowledge search fails closed without entitlement", async () => {
  const response = await request
    .post("/api/imob/knowledge/search")
    .set("Authorization", `Bearer ${blockedApiToken}`)
    .send({
      query: "buscar no acervo IMOB",
    });

  assert.equal(response.status, 403);
  assert.equal(response.body?.ok, false);
  assert.equal(response.body?.error?.code, "ENTITLEMENT_MISSING");
});

test("IMOB knowledge search returns workspace upload results with auditable source origin", async () => {
  const response = await request
    .post("/api/imob/knowledge/search")
    .set("Authorization", `Bearer ${entitledApiToken}`)
    .send({
      query: "checklist captação locação joinville",
      filters: {
        sourceTypes: ["upload"],
      },
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.ok((response.body?.data?.items ?? []).length >= 1);
  const firstItem = response.body?.data?.items?.[0];
  assert.equal(firstItem?.sourceType, "upload");
  assert.equal(firstItem?.source?.origin, "workspace_upload");
  assert.equal(firstItem?.source?.label, "Upload operacional");
  assert.equal(response.body?.data?.searchContext?.provenance?.totalWorkspaceUploadDocuments >= 1, true);
});
