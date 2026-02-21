import type { BrowserContext, Page } from "@playwright/test";

type HarnessMode = "mock" | "real";

type PendingApprovalItem = {
  runId: string;
  status: "awaiting_approval";
  reason: string;
  requiredApprovals: number;
  criticality: "low" | "medium" | "high" | "critical" | "unknown";
  createdAt: string;
  requestedBy: string;
};

type SeedResult = {
  pendingRunId: string;
  activeRunId: string;
};

type ApprovalHarness = {
  mode: HarnessMode;
  seed: SeedResult;
};

const DEFAULT_SEED: SeedResult = {
  pendingRunId: process.env.E2E_APPROVAL_PENDING_RUN_ID || "run-e2e-pending-approval-001",
  activeRunId: process.env.E2E_APPROVAL_ACTIVE_RUN_ID || "run-e2e-active-stream-001",
};

function resolveHarnessMode(): HarnessMode {
  return process.env.E2E_APPROVAL_HARNESS_MODE === "real" ? "real" : "mock";
}

function authPayload() {
  return {
    ok: true,
    data: {
      role: "tenant_admin",
      roles: ["tenant_admin"],
      permissions: ["approvals.view", "approvals.approve", "approvals.manage"],
      allowedTenants: ["tenant-A"],
      allowedWorkspaces: ["workspace-A"],
      scope: "tenant",
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      userId: "user-approver-e2e",
      identityType: "password",
      activeProfileId: "profile-e2e",
      tenantRole: "TENANT_ADMIN",
      membershipStatus: "ACTIVE",
      profiles: [
        {
          id: "profile-e2e",
          fullName: "Approval E2E",
          role: "tenant_admin",
          tenantId: "tenant-A",
          workspaceId: "workspace-A",
        },
      ],
    },
  };
}

async function installMockSse(context: BrowserContext, seed: SeedResult) {
  await context.addInitScript(
    ({ activeRunId }) => {
      const events = [
        {
          id: "evt-1",
          runId: activeRunId,
          type: "run.step.completed",
          payload: { step: "approval_gate" },
          createdAt: new Date().toISOString(),
        },
        {
          id: "evt-2",
          runId: activeRunId,
          type: "run.completed",
          payload: { status: "success" },
          createdAt: new Date(Date.now() + 300).toISOString(),
        },
      ];

      class MockEventSource {
        url: string;
        withCredentials: boolean;
        readyState: number;
        onopen: ((event: Event) => void) | null;
        onmessage: ((event: MessageEvent) => void) | null;
        onerror: ((event: Event) => void) | null;
        private timer: ReturnType<typeof setInterval> | null;

        constructor(url: string, init?: { withCredentials?: boolean }) {
          this.url = url;
          this.withCredentials = !!init?.withCredentials;
          this.readyState = 0;
          this.onopen = null;
          this.onmessage = null;
          this.onerror = null;
          this.timer = null;

          setTimeout(() => {
            this.readyState = 1;
            this.onopen?.(new Event("open"));

            let index = 0;
            this.timer = setInterval(() => {
              if (this.readyState !== 1) return;
              if (index >= events.length) {
                if (this.timer) clearInterval(this.timer);
                return;
              }
              const payload = events[index++];
              this.onmessage?.(
                new MessageEvent("message", {
                  data: JSON.stringify(payload),
                })
              );
            }, 150);
          }, 10);
        }

        close() {
          this.readyState = 2;
          if (this.timer) clearInterval(this.timer);
        }

        addEventListener() {
          // not needed for current UI usage
        }

        removeEventListener() {
          // not needed for current UI usage
        }

        dispatchEvent() {
          return true;
        }
      }

      Object.defineProperty(globalThis, "EventSource", {
        configurable: true,
        writable: true,
        value: MockEventSource,
      });
    },
    { activeRunId: seed.activeRunId }
  );
}

async function installMockApi(context: BrowserContext, seed: SeedResult) {
  const approvals: PendingApprovalItem[] = [
    {
      runId: seed.pendingRunId,
      status: "awaiting_approval",
      reason: "High criticality requires human decision",
      requiredApprovals: 1,
      criticality: "critical",
      createdAt: new Date().toISOString(),
      requestedBy: "agent-e2e",
    },
  ];

  await context.route("**/api/**", async (route) => {
    const request = route.request();
    const method = request.method();
    const url = new URL(request.url());
    const path = url.pathname;

    if (method === "GET" && path.endsWith("/api/auth/me")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(authPayload()) });
      return;
    }

    if (method === "GET" && path.match(/\/api\/workspaces\/[^/]+\/trust-history$/)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ workspaceId: "workspace-A", window: "30d", points: [] }),
      });
      return;
    }

    if (method === "GET" && (path.endsWith("/api/runs") || path.endsWith("/api/runs/global"))) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: seed.activeRunId,
              workspaceId: "workspace-A",
              tenantId: "tenant-A",
              agent: "agent-approval-e2e",
              status: "running",
              startedAt: new Date().toISOString(),
              finishedAt: null,
            },
          ],
          total: 1,
        }),
      });
      return;
    }

    if (method === "GET" && path.endsWith("/api/governance/pending-approvals")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, items: approvals }),
      });
      return;
    }

    if (method === "POST" && path.match(/\/api\/runs\/[^/]+\/approve$/)) {
      const runId = path.split("/")[3] || seed.pendingRunId;
      const postBody = request.postDataJSON() as { decision?: "APPROVED" | "REJECTED"; reason?: string | null } | null;
      const decision = postBody?.decision ?? "APPROVED";
      const idx = approvals.findIndex((item) => item.runId === runId);
      if (idx >= 0) approvals.splice(idx, 1);

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          event: {
            id: `evt-${Date.now()}`,
            runId,
            type: decision === "APPROVED" ? "run.approved" : "run.rejected",
            payload: {
              decision,
              reason: postBody?.reason ?? null,
            },
            createdAt: new Date().toISOString(),
          },
          decisionReceiptHash: `hash-${runId}`,
          runState: {
            policy: decision === "APPROVED" ? "resume" : "pause",
            targetStatus: decision === "APPROVED" ? "running" : "awaiting_approval",
          },
        }),
      });
      return;
    }

    if (method === "GET" && path.endsWith("/api/delegations")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items: [] }) });
      return;
    }

    if (method === "GET" && path.endsWith("/api/governance/overview")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          intent: null,
          judge: {
            total: 0,
            flagged: 0,
            clean: 0,
            avgScore: null,
            lastSeen: null,
            topFlags: [],
          },
        }),
      });
      return;
    }

    if (method === "GET" && path.endsWith("/api/ledger/integrity/report")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          summary: {
            checkedGuardrail: 0,
            checkedScl: 0,
            missingInScl: 0,
            missingInGuardrail: 0,
            mismatchedTx: 0,
            matchRatio: 1,
          },
          rows: [],
        }),
      });
      return;
    }

    await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "e2e_unhandled_route", path, method }) });
  });
}

async function seedPendingRunReal(page: Page, seed: SeedResult) {
  const seedEndpoint = process.env.E2E_APPROVAL_SEED_ENDPOINT;
  if (!seedEndpoint) {
    throw new Error(
      "E2E_APPROVAL_SEED_ENDPOINT is required in real mode to seed a pending run for approval E2E"
    );
  }

  const response = await page.request.post(seedEndpoint, {
    data: {
      runId: seed.pendingRunId,
      tenantId: process.env.E2E_TENANT_ID || "tenant-A",
      workspaceId: process.env.E2E_WORKSPACE_ID || "workspace-A",
      status: "awaiting_approval",
      criticality: "critical",
    },
  });

  if (!response.ok()) {
    const body = await response.text();
    throw new Error(`Seed endpoint failed: ${response.status()} ${body}`);
  }
}

export async function setupApprovalHarness(context: BrowserContext, page: Page): Promise<ApprovalHarness> {
  const mode = resolveHarnessMode();
  const seed = { ...DEFAULT_SEED };

  if (mode === "mock") {
    await installMockSse(context, seed);
    await installMockApi(context, seed);
    return { mode, seed };
  }

  await seedPendingRunReal(page, seed);
  return { mode, seed };
}
