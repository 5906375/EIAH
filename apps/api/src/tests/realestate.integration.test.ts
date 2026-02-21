import express from "express";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prismaGlobal } from "@repo/db";

let app: ReturnType<typeof express>;
let signSession: typeof import("../auth/session").signSession;

async function createTestApp() {
  const [{ realestateRouter }, { runsRouter }] = await Promise.all([
    import("../routes/realestate"),
    import("../routes/runs"),
  ]);
  const expressApp = express();
  expressApp.use(express.json());
  expressApp.use("/api", realestateRouter);
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

describe("realestate sprint1 integration", () => {
  const suffix = Date.now().toString(36);
  const tenantId = `tenant-re-${suffix}`;
  const workspaceId = `workspace-re-${suffix}`;
  const userId = `user-re-${suffix}`;
  const email = `user-re-${suffix}@example.com`;
  const runId = `run-re-${suffix}`;

  const otherTenantId = `tenant-re-other-${suffix}`;
  const otherWorkspaceId = `workspace-re-other-${suffix}`;
  const previousLlmTaskRouterFlag = process.env.LLM_TASK_ROUTER_ENABLED;

  beforeAll(async () => {
    process.env.TRUST_SCORE_THRESHOLD = "0";
    process.env.LLM_TASK_ROUTER_ENABLED = "true";
    await import("../actions/tenantActionRegistry");
    const sessionModule = await import("../auth/session");
    signSession = sessionModule.signSession;
    app = await createTestApp();

    await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
    await prismaGlobal.workspace.create({
      data: { id: workspaceId, tenantId, name: workspaceId },
    });
    await prismaGlobal.user.create({
      data: { id: userId, tenantId, email, displayName: "Real Estate Admin" },
    });
    await prismaGlobal.tenantMembership.create({
      data: { tenantId, userId, role: "TENANT_ADMIN", status: "ACTIVE" },
    });

    await prismaGlobal.tenant.create({ data: { id: otherTenantId, name: otherTenantId } });
    await prismaGlobal.workspace.create({
      data: { id: otherWorkspaceId, tenantId: otherTenantId, name: otherWorkspaceId },
    });

    await prismaGlobal.run.create({
      data: {
        id: runId,
        tenantId,
        workspaceId,
        userId,
        agent: "EIAH",
        status: "awaiting_approval",
        request: { prompt: "approve adjustment", metadata: { criticality: "low" } },
      },
    });
  });

  afterAll(async () => {
    if (previousLlmTaskRouterFlag === undefined) {
      delete process.env.LLM_TASK_ROUTER_ENABLED;
    } else {
      process.env.LLM_TASK_ROUTER_ENABLED = previousLlmTaskRouterFlag;
    }
    const ignoreCleanupError = (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("append-only")) return;
      if (message.includes("Foreign key constraint")) return;
      throw error;
    };
    try {
      await prismaGlobal.runEvent.deleteMany({ where: { runId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.approvalRecord.deleteMany({ where: { runId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.sclLedger.deleteMany({ where: { runId } });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.guardrailLedger.deleteMany({
        where: { tenantId: { in: [tenantId, otherTenantId] } },
      });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.guardrailAuditLedger.deleteMany({
        where: { tenantId: { in: [tenantId, otherTenantId] } },
      });
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
      await prismaGlobal.workspace.deleteMany({
        where: { id: { in: [workspaceId, otherWorkspaceId] } },
      });
    } catch (error) {
      ignoreCleanupError(error);
    }
    try {
      await prismaGlobal.tenant.deleteMany({
        where: { id: { in: [tenantId, otherTenantId] } },
      });
    } catch (error) {
      ignoreCleanupError(error);
    }
  });

  it("executes dry-run -> approve -> apply_adjustment and records ledger evidence", async () => {
    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId,
      activeProfileId: null,
      identityType: "password",
    });

    const leasePayload = {
      tenantId,
      workspaceId,
      leaseId: "lease-rh-1",
      period: "2026-02",
      dueRule: "BUSINESS_DAY_NTH=6",
      reminderOffsetBusinessDays: 2,
      rentAmount: 3000,
      condoBaseAmount: 800,
      evidenceRefs: ["doc://condo/ata-1"],
      tenantName: "Inquilino A",
      tenantEmail: "inquilino@example.com",
      tenantDocument: "12345678900",
    };

    const dryRunResponse = await request(app)
      .post("/api/realestate/dry-run")
      .set("Cookie", cookie)
      .set("Idempotency-Key", `idem-dry-${suffix}`)
      .send({
        period: "2026-02",
        nth: 6,
        reminderOffset: 2,
        leases: [leasePayload],
      })
      .expect(200);

    expect(dryRunResponse.body?.ok).toBe(true);
    expect(dryRunResponse.body?.policyDecision?.decision).toBeDefined();
    expect(dryRunResponse.body?.preview?.chargeItems?.[0]?.leaseId).toBe("lease-rh-1");
    expect(typeof dryRunResponse.body?.planHash).toBe("string");
    expect(typeof dryRunResponse.body?.diffHash).toBe("string");

    const approvalResponse = await request(app)
      .post(`/api/runs/${runId}/approve`)
      .set("Cookie", cookie)
      .send({
        decision: "APPROVED",
        idempotency_key: `idem-approve-${suffix}`,
      })
      .expect(200);

    expect(approvalResponse.body?.ok).toBe(true);

    const applyResponse = await request(app)
      .post("/api/realestate/apply-adjustment")
      .set("Cookie", cookie)
      .set("Idempotency-Key", `idem-apply-${suffix}`)
      .send({
        period: "2026-02",
        lease: leasePayload,
        adjustmentAmount: 900,
        runId,
        approval: {
          approved: true,
          approverId: userId,
          reason: "approved via governance flow",
        },
      })
      .expect(200);

    expect(applyResponse.body?.ok).toBe(true);
    expect(applyResponse.body?.result?.applied).toBe(true);
    expect(typeof applyResponse.body?.ledger?.txId).toBe("string");

    const scl = await prismaGlobal.sclLedger.findFirst({
      where: { runId, tenantId, workspaceId },
      orderBy: { signedAt: "desc" },
    });
    expect(scl?.txId).toEqual(expect.any(String));

    const llmEvent = await prismaGlobal.runEvent.findFirst({
      where: {
        runId,
        tenantId,
        workspaceId,
        type: "run.action.llm.audit",
      },
      orderBy: { createdAt: "desc" },
    });
    expect(llmEvent).toBeTruthy();
    const payload = (llmEvent?.payload ?? {}) as {
      llm?: Array<{ promptHash?: string; outputHash?: string }>;
    };
    expect(typeof payload?.llm?.[0]?.promptHash).toBe("string");
    expect(typeof payload?.llm?.[0]?.outputHash).toBe("string");
  });

  it("blocks whatsapp send without opt-in", async () => {
    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .post("/api/realestate/whatsapp/send")
      .set("Cookie", cookie)
      .set("Idempotency-Key", `idem-wa-no-optin-${suffix}`)
      .send({
        to: "5511999998888",
        templateName: "rent_due_reminder",
        languageCode: "pt_BR",
      })
      .expect(412);

    expect(response.body?.error?.code).toBe("WHATSAPP_OPT_IN_REQUIRED");
  });

  it("denies leaseId outside tenant/workspace scope", async () => {
    const cookie = cookieFor({
      userId,
      tenantId,
      workspaceId,
      activeProfileId: null,
      identityType: "password",
    });

    const response = await request(app)
      .post("/api/realestate/dry-run")
      .set("Cookie", cookie)
      .set("Idempotency-Key", `idem-cross-tenant-${suffix}`)
      .send({
        period: "2026-02",
        leases: [
          {
            tenantId: otherTenantId,
            workspaceId: otherWorkspaceId,
            leaseId: "lease-forbidden",
            period: "2026-02",
            dueRule: "BUSINESS_DAY_NTH=6",
            reminderOffsetBusinessDays: 2,
            rentAmount: 1000,
            condoBaseAmount: 200,
          },
        ],
      })
      .expect(403);

    expect(response.body?.error?.code).toBe("LEASE_SCOPE_FORBIDDEN");
  });
});
