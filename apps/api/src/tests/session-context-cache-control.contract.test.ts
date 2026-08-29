import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import process from "node:process";
import test, { after, before } from "node:test";

import { parse } from "dotenv";
import express from "express";
import supertest from "supertest";

import { governedErrorHandler } from "../middlewares/governedErrorHandler";

const previousDatabaseUrl = process.env.DATABASE_URL;
if (!process.env.DATABASE_URL) {
  const dbEnvPath = fileURLToPath(new URL("../../../../packages/db/.env", import.meta.url));
  process.env.DATABASE_URL = parse(readFileSync(dbEnvPath)).DATABASE_URL;
}
assert.ok(process.env.DATABASE_URL, "DATABASE_URL is required for the session context HTTP contract test");

const { closePrismaResources, prismaGlobal } = await import("@repo/db");
const { sessionRouter } = await import("../routes/session");

const suffix = randomUUID();
const syntheticToken = `tok_session_context_cache_${suffix}`;
const syntheticTenantId = `tenant-session-context-cache-${suffix}`;
const syntheticWorkspaceId = `workspace-session-context-cache-${suffix}`;

const tenantDelegate = prismaGlobal.tenant;
const marketplaceDelegate = prismaGlobal.marketplaceItem;
const auditDelegate = prismaGlobal.guardrailAuditLedger;
const originalTenantFindUnique = tenantDelegate.findUnique;
const originalMarketplaceFindMany = marketplaceDelegate.findMany;
const originalAuditCreate = auditDelegate.create;

let failTenantLookup = false;
let auditWriteAttempts = 0;
let request: ReturnType<typeof supertest>;

before(async () => {
  await prismaGlobal.tenant.create({
    data: { id: syntheticTenantId, name: "Synthetic session context cache tenant" },
  });
  await prismaGlobal.workspace.create({
    data: {
      id: syntheticWorkspaceId,
      tenantId: syntheticTenantId,
      name: "Synthetic session context cache workspace",
    },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: syntheticToken,
      tenantId: syntheticTenantId,
      workspaceId: syntheticWorkspaceId,
      description: "Synthetic session context cache-control test",
      revoked: false,
    },
  });

  tenantDelegate.findUnique = (async (...args: Parameters<typeof originalTenantFindUnique>) => {
    if (failTenantLookup) throw new Error("synthetic tenant lookup failure");
    return originalTenantFindUnique(...args);
  }) as unknown as typeof originalTenantFindUnique;
  marketplaceDelegate.findMany = (async () => []) as typeof originalMarketplaceFindMany;
  auditDelegate.create = (async () => {
    auditWriteAttempts += 1;
    return {} as never;
  }) as unknown as typeof originalAuditCreate;

  const app = express();
  app.use(express.json());
  app.use("/api", sessionRouter);
  app.use(governedErrorHandler);
  request = supertest(app);
});

after(async () => {
  tenantDelegate.findUnique = originalTenantFindUnique;
  marketplaceDelegate.findMany = originalMarketplaceFindMany;
  auditDelegate.create = originalAuditCreate;

  let ledgerCount = -1;
  let auditCount = -1;
  let deletedTokens = -1;
  let deletedWorkspaces = -1;
  let deletedTenants = -1;
  try {
    ledgerCount = await prismaGlobal.guardrailLedger.count({ where: { tenantId: syntheticTenantId } });
    auditCount = await prismaGlobal.guardrailAuditLedger.count({ where: { tenantId: syntheticTenantId } });
    deletedTokens = (
      await prismaGlobal.apiToken.deleteMany({ where: { tenantId: syntheticTenantId } })
    ).count;
    deletedWorkspaces = (
      await prismaGlobal.workspace.deleteMany({ where: { id: syntheticWorkspaceId } })
    ).count;
    deletedTenants = (
      await prismaGlobal.tenant.deleteMany({ where: { id: syntheticTenantId } })
    ).count;
  } finally {
    await closePrismaResources();
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  }

  assert.equal(ledgerCount, 0);
  assert.equal(auditCount, 0);
  assert.equal(deletedTokens, 1);
  assert.equal(deletedWorkspaces, 1);
  assert.equal(deletedTenants, 1);
});

function authenticatedGet(query = "") {
  return request
    .get(`/api/session/context${query}`)
    .set("Authorization", `Bearer ${syntheticToken}`);
}

test("GET /api/session/context always returns Cache-Control: no-store", async (t) => {
  await t.test("authenticated 200", async () => {
    const response = await authenticatedGet();

    assert.equal(response.status, 200);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.body?.ok, true);
  });

  await t.test("unauthenticated 401", async () => {
    const response = await request.get("/api/session/context");

    assert.equal(response.status, 401);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.body?.error?.code, "UNAUTHORIZED");
  });

  await t.test("authenticated 403", async () => {
    const response = await authenticatedGet("?domain=imob");

    assert.equal(response.status, 403);
    assert.equal(response.headers["cache-control"], "no-store");
    assert.equal(response.body?.error?.code, "ENTITLEMENT_MISSING");
    assert.equal(auditWriteAttempts, 1);
  });

  await t.test("asynchronous dependency failure becomes governed 500", async () => {
    failTenantLookup = true;
    try {
      const response = await authenticatedGet();

      assert.equal(response.status, 500);
      assert.equal(response.headers["cache-control"], "no-store");
      assert.equal(response.body?.reasonCode, "INTERNAL_ERROR");
    } finally {
      failTenantLookup = false;
    }
  });
});
