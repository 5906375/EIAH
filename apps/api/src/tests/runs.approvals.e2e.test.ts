import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaGlobal } from "@repo/db";

let app: ReturnType<typeof express>;
let signSession: typeof import("../auth/session").signSession;

async function createTestApp() {
  const { runsRouter } = await import("../routes/runs");
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api", runsRouter);
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

describe("runs approvals e2e", () => {
  const suffix = Date.now().toString(36);
  const tenantId = `tenant-approval-${suffix}`;
  const workspaceId = `workspace-approval-${suffix}`;
  const approverId = `approver-${suffix}`;
  const approverEmail = `approver-${suffix}@example.com`;
  const runApprovedId = `run-approved-${suffix}`;
  const runRejectedAbortId = `run-rejected-abort-${suffix}`;
  const runRejectedPauseId = `run-rejected-pause-${suffix}`;
  const previousThreshold = process.env.TRUST_SCORE_THRESHOLD;
  const previousRejectPolicy = process.env.APPROVAL_REJECT_POLICY;

  beforeAll(async () => {
    process.env.TRUST_SCORE_THRESHOLD = "0";
    const sessionModule = await import("../auth/session");
    signSession = sessionModule.signSession;
    app = await createTestApp();

    await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
    await prismaGlobal.workspace.create({
      data: { id: workspaceId, tenantId, name: workspaceId },
    });
    await prismaGlobal.user.create({
      data: { id: approverId, tenantId, email: approverEmail, displayName: "Approver" },
    });
    await prismaGlobal.tenantMembership.create({
      data: { tenantId, userId: approverId, role: "TENANT_ADMIN", status: "ACTIVE" },
    });

    const makeRun = (id: string) =>
      prismaGlobal.run.create({
        data: {
          id,
          tenantId,
          workspaceId,
          userId: approverId,
          agent: "agent-approval-test",
          status: "awaiting_approval",
          request: {
            prompt: "",
            metadata: { criticality: "low" },
          },
          costCents: 0,
        },
      });

    await makeRun(runApprovedId);
    await makeRun(runRejectedAbortId);
    await makeRun(runRejectedPauseId);
  });

  afterAll(async () => {
    process.env.TRUST_SCORE_THRESHOLD = previousThreshold;
    process.env.APPROVAL_REJECT_POLICY = previousRejectPolicy;

    const ignoreCleanupError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("append-only")) return;
      if (message.includes("Foreign key constraint")) return;
      throw error;
    };

    try {
      await prismaGlobal.runEvent.deleteMany({
        where: { runId: { in: [runApprovedId, runRejectedAbortId, runRejectedPauseId] } },
      });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.approvalRecord.deleteMany({
        where: { runId: { in: [runApprovedId, runRejectedAbortId, runRejectedPauseId] } },
      });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.guardrailLedger.deleteMany({ where: { tenantId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.run.deleteMany({
        where: { id: { in: [runApprovedId, runRejectedAbortId, runRejectedPauseId] } },
      });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.tenantMembership.deleteMany({ where: { tenantId, userId: approverId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.user.deleteMany({ where: { id: approverId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.workspace.deleteMany({ where: { id: workspaceId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
  });

  it("approves run and emits decision receipt with governance evidence", async () => {
    const cookie = cookieFor({
      userId: approverId,
      tenantId,
      workspaceId,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .post(`/api/runs/${runApprovedId}/approve`)
      .set("Cookie", cookie)
      .send({
        decision: "APPROVED",
        idempotency_key: `idem-approved-${suffix}`,
      })
      .expect(200);

    expect(response.body?.ok).toBe(true);
    expect(response.body?.event?.type).toBe("run.approved");
    expect(response.body?.decisionReceiptHash).toEqual(expect.any(String));
    expect(response.body?.runState).toEqual({ policy: "resume", targetStatus: "pending" });

    const updatedRun = await prismaGlobal.run.findUnique({ where: { id: runApprovedId } });
    expect(updatedRun?.status).toBe("pending");

    const event = await prismaGlobal.runEvent.findFirst({
      where: { runId: runApprovedId, type: "run.approved" },
      orderBy: { createdAt: "desc" },
    });
    const payload = (event?.payload ?? null) as Record<string, any> | null;
    expect(payload?.decisionReceiptHash).toBe(response.body?.decisionReceiptHash);
    expect(payload?.decisionReceipt?.approver?.userId).toBe(approverId);
    expect(payload?.decisionReceipt?.approver?.role).toBe("TENANT_ADMIN");
    expect(payload?.decisionReceipt?.approver?.walletId).toBeNull();
    expect(payload?.decisionReceipt?.trustSnapshot).toBeTruthy();
    expect(payload?.decisionReceipt?.decisionTimestamp).toEqual(expect.any(String));
  });

  it("rejects run with abort policy and updates run state machine to blocked", async () => {
    process.env.APPROVAL_REJECT_POLICY = "abort";
    const cookie = cookieFor({
      userId: approverId,
      tenantId,
      workspaceId,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .post(`/api/runs/${runRejectedAbortId}/approve`)
      .set("Cookie", cookie)
      .send({
        decision: "REJECTED",
        reason: "manual reject for risk control",
        idempotency_key: `idem-reject-abort-${suffix}`,
      })
      .expect(200);

    expect(response.body?.event?.type).toBe("run.rejected");
    expect(response.body?.runState).toEqual({ policy: "abort", targetStatus: "blocked" });
    expect(response.body?.decisionReceiptHash).toEqual(expect.any(String));

    const run = await prismaGlobal.run.findUnique({ where: { id: runRejectedAbortId } });
    expect(run?.status).toBe("blocked");
    expect(run?.errorCode).toBe("APPROVAL_REJECTED");
  });

  it("rejects run with pause policy and keeps run awaiting approval", async () => {
    process.env.APPROVAL_REJECT_POLICY = "pause";
    const cookie = cookieFor({
      userId: approverId,
      tenantId,
      workspaceId,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .post(`/api/runs/${runRejectedPauseId}/approve`)
      .set("Cookie", cookie)
      .send({
        decision: "REJECTED",
        reason: "needs further review",
        idempotency_key: `idem-reject-pause-${suffix}`,
      })
      .expect(200);

    expect(response.body?.event?.type).toBe("run.rejected");
    expect(response.body?.runState).toEqual({ policy: "pause", targetStatus: "awaiting_approval" });

    const run = await prismaGlobal.run.findUnique({ where: { id: runRejectedPauseId } });
    expect(run?.status).toBe("awaiting_approval");
    expect(run?.errorCode).toBeNull();
  });
});
