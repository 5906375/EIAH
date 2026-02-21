import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaGlobal } from "@repo/db";

let app: ReturnType<typeof express>;
let signSession: typeof import("../auth/session").signSession;

async function createTestApp() {
  const { governanceRouter } = await import("../routes/governance");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api", governanceRouter);
  return expressApp;
}

function cookieFor(claims: {
  userId: string;
  tenantId: string;
  workspaceId: string | null;
  activeProfileId: string | null;
  identityType: "password" | "wallet";
}) {
  const token = signSession(claims);
  return `token=${token}`;
}

describe("pou ledger endpoint", () => {
  const suffix = Date.now().toString(36);
  const tenantId = `tenant-pou-${suffix}`;
  const tenantOther = `tenant-pou-other-${suffix}`;
  const workspaceId = `workspace-pou-${suffix}`;
  const workspaceOther = `workspace-pou-other-${suffix}`;
  const userId = `user-pou-${suffix}`;
  const email = `user-pou-${suffix}@example.com`;
  const runId = `run-pou-${suffix}`;
  const runCriticalHash = `critical-${suffix}`;
  const runSclTxId = `scltx-proof-link-${suffix}`;
  let pouId = "";

  beforeAll(async () => {
    const sessionModule = await import("../auth/session");
    signSession = sessionModule.signSession;
    app = await createTestApp();

    await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
    await prismaGlobal.tenant.create({ data: { id: tenantOther, name: tenantOther } });
    await prismaGlobal.workspace.create({
      data: { id: workspaceId, tenantId, name: workspaceId },
    });
    await prismaGlobal.workspace.create({
      data: { id: workspaceOther, tenantId: tenantOther, name: workspaceOther },
    });
    await prismaGlobal.user.create({
      data: { id: userId, tenantId, email, displayName: "Viewer" },
    });
    await prismaGlobal.tenantMembership.create({
      data: { tenantId, userId, role: "TENANT_VIEWER", status: "ACTIVE" },
    });
    await prismaGlobal.tenantMembership.create({
      data: { tenantId: tenantOther, userId, role: "TENANT_VIEWER", status: "ACTIVE" },
    });
    await prismaGlobal.run.create({
      data: {
        id: runId,
        tenantId,
        workspaceId,
        agent: "agent-x",
        status: "success",
        request: {},
        criticalHash: runCriticalHash,
        sclTxId: runSclTxId,
      },
    });
    await prismaGlobal.sclLedger.create({
      data: {
        tenantId,
        workspaceId,
        runId,
        criticalHash: runCriticalHash,
        txId: runSclTxId,
        payload: { source: "test" },
        signature: "sig-test",
      },
    });
    await prismaGlobal.guardrailLedger.create({
      data: {
        tenantId,
        runId,
        actionType: "run.action.signed",
        criticalHash: runCriticalHash,
        payloadHash: `payload-${suffix}`,
        txId: runSclTxId,
      },
    });
    const pou = await prismaGlobal.proofOfUsage.create({
      data: {
        tenantId,
        workspaceId,
        runId,
        actionId: "action-x",
        intentHash: "intent-hash",
        paramsHash: "params-hash",
        signatureHash: "signature-hash",
        resultHash: "result-hash",
        compositeTxId: `tx-${suffix}`,
        status: "PENDING",
      },
    });
    pouId = pou.id;
  });

  afterAll(async () => {
    const ignoreCleanupError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("append-only")) return;
      if (message.includes("Foreign key constraint")) return;
      throw error;
    };
    try {
      await prismaGlobal.guardrailAuditLedger.deleteMany({
        where: { tenantId: { in: [tenantId, tenantOther] } },
      });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.guardrailLedger.deleteMany({
        where: { tenantId: { in: [tenantId, tenantOther] } },
      });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.sclLedger.deleteMany({ where: { runId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.proofOfUsage.deleteMany({ where: { tenantId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.run.deleteMany({ where: { id: runId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.tenantMembership.deleteMany({ where: { userId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.user.deleteMany({ where: { id: userId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.workspace.deleteMany({ where: { id: { in: [workspaceId, workspaceOther] } } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.tenant.deleteMany({ where: { id: { in: [tenantId, tenantOther] } } });
    } catch (error) {
      ignoreCleanupError(error);
    }
  });

  it("returns PoU record for tenant", async () => {
    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .get(`/api/ledger/pou/${pouId}`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body?.schemaVersion).toBe("pou.v1");
    expect(response.body?.data?.id).toBe(pouId);
    expect(response.body?.data?.compositeTxId).toBe(`tx-${suffix}`);
    expect(response.body?.data?.hashes?.intentHash).toBe("intent-hash");
    expect(response.body?.data?.anchoring?.phase4Dependency).toBe("required");
    expect(response.body?.data?.anchoring?.status).toBe("anchored");
    expect(response.body?.data?.anchoring?.checks?.hashConsistent).toBe(true);
    expect(response.body?.data?.anchoring?.checks?.txConsistent).toBe(true);
  });

  it("returns txId reconciliation with run/scl/pou links", async () => {
    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .get(`/api/ledger/${runSclTxId}`)
      .set("Cookie", cookie)
      .expect(200);

    expect(response.body?.ok).toBe(true);
    expect(response.body?.txId).toBe(runSclTxId);
    expect(response.body?.run?.id).toBe(runId);
    expect(response.body?.scl?.txId).toBe(runSclTxId);
    expect(response.body?.reconciliation?.runId).toBe(runId);
    expect(Array.isArray(response.body?.reconciliation?.pouReceiptIds)).toBe(true);
  });

  it("blocks cross-tenant access", async () => {
    const cookie = cookieFor({
      userId,
      tenantId: tenantOther,
      workspaceId: workspaceOther,
      activeProfileId: null,
      identityType: "password",
    });

    await request(app)
      .get(`/api/ledger/pou/${pouId}`)
      .set("Cookie", cookie)
      .expect(404);
  });
});
