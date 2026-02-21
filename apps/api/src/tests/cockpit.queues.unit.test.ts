import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  buildCockpitQueueSnapshot,
  getCockpitQueuesHandler,
  isCockpitQueuesEnabled,
} from "../routes/cockpit";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    run: { findMany: vi.fn() },
    runEvent: { findMany: vi.fn() },
    delegationPolicy: { findMany: vi.fn() },
    $queryRawUnsafe: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock("@eiah/core", () => ({
  reconcileLedgerService: vi.fn(async () => ({
    checkedGuardrail: 1,
    checkedScl: 1,
    missingInScl: [],
    missingInGuardrail: [],
    mismatchedTx: [],
  })),
}));

describe("cockpit queues snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.mockPrisma.run.findMany.mockResolvedValue([
      {
        id: "run-1",
        createdAt: new Date("2026-02-20T10:00:00.000Z"),
        request: { metadata: { criticality: "high", requiredApprovals: 2 } },
        userId: "user-1",
      },
    ]);
    hoisted.mockPrisma.runEvent.findMany.mockResolvedValue([
      {
        runId: "run-1",
        payload: { reason: "approval_required" },
      },
    ]);
    hoisted.mockPrisma.delegationPolicy.findMany.mockResolvedValue([
      {
        id: "del-1",
        delegatorId: "tenant-A",
        delegateeId: "tenant-B",
        marketplaceId: "mk-1",
        scope: "execute",
        trustMin: 70,
        status: "active",
        validUntil: new Date("2026-02-22T10:00:00.000Z"),
      },
    ]);
    hoisted.mockPrisma.$queryRawUnsafe.mockResolvedValue([
      {
        message_id: "wamid.1",
        phone_e164: "5511999999999",
        status: "failed",
        sent_at: new Date("2026-02-20T09:00:00.000Z"),
        updated_at: new Date("2026-02-20T09:05:00.000Z"),
      },
    ]);
  });

  it("builds the expected queue response shape", async () => {
    const req = {
      prisma: hoisted.mockPrisma,
      authContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
      query: { limit: "20", expiringWindowDays: "7" },
    } as unknown as TenantAwareRequest;

    const snapshot = await buildCockpitQueueSnapshot(req, {
      now: new Date("2026-02-20T08:00:00.000Z"),
      reconcile: (async () => ({
        checkedGuardrail: 2,
        checkedScl: 2,
        missingInScl: [{ id: "g1", runId: "run-1", actionType: "a1", txId: null, timestamp: new Date(), criticalHash: "h" }],
        missingInGuardrail: [],
        mismatchedTx: [],
      })) as any,
    });

    expect(snapshot.approvals.total).toBe(1);
    expect(snapshot.approvals.items[0]).toEqual(
      expect.objectContaining({
        runId: "run-1",
        status: "awaiting_approval",
        reason: "approval_required",
        requiredApprovals: 2,
      })
    );
    expect(snapshot.reconcile.pending).toBe(1);
    expect(snapshot.expiringDelegations.total).toBe(1);
    expect(snapshot.whatsappFailures.total).toBe(1);
  });
});

describe("GET /cockpit/queues", () => {
  function createMockRes() {
    return {
      statusCode: 200,
      payload: null as any,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(body: unknown) {
        this.payload = body;
        return this;
      },
    };
  }

  it("returns 404 payload when feature flag is disabled", async () => {
    const previous = process.env.COCKPIT_QUEUES_ENABLED;
    process.env.COCKPIT_QUEUES_ENABLED = "false";
    try {
      expect(isCockpitQueuesEnabled()).toBe(false);
      const req = {
        prisma: hoisted.mockPrisma,
        authContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
      } as unknown as TenantAwareRequest;
      const res = createMockRes();
      await getCockpitQueuesHandler(req, res as any);
      expect(res.statusCode).toBe(404);
      expect(res.payload?.ok).toBe(false);
      expect(res.payload?.error?.code).toBe("COCKPIT_QUEUES_DISABLED");
    } finally {
      process.env.COCKPIT_QUEUES_ENABLED = previous;
    }
  });

  it("returns queue data when feature flag is enabled", async () => {
    const previous = process.env.COCKPIT_QUEUES_ENABLED;
    process.env.COCKPIT_QUEUES_ENABLED = "true";
    try {
      expect(isCockpitQueuesEnabled()).toBe(true);
      const req = {
        prisma: hoisted.mockPrisma,
        authContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
        query: {},
      } as unknown as TenantAwareRequest;
      const res = createMockRes();
      await getCockpitQueuesHandler(req, res as any);
      expect(res.statusCode).toBe(200);
      expect(res.payload?.ok).toBe(true);
      expect(res.payload?.data).toEqual(
        expect.objectContaining({
          approvals: expect.any(Object),
          reconcile: expect.any(Object),
          expiringDelegations: expect.any(Object),
          whatsappFailures: expect.any(Object),
        })
      );
    } finally {
      process.env.COCKPIT_QUEUES_ENABLED = previous;
    }
  });
});
