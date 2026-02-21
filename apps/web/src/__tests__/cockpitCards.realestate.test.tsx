import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CockpitPanel from "@/components/runs/CockpitPanel";

const mockedApiGetCockpitQueues = vi.fn();
const mockedApiRealEstateDryRun = vi.fn();
const mockedApiApproveRun = vi.fn();
const mockedApiGetRunGovernance = vi.fn();
const mockedApiListRunEvents = vi.fn();

vi.mock("@/lib/api", () => ({
  apiGetCockpitQueues: (...args: unknown[]) => mockedApiGetCockpitQueues(...args),
  apiRealEstateDryRun: (...args: unknown[]) => mockedApiRealEstateDryRun(...args),
  apiApproveRun: (...args: unknown[]) => mockedApiApproveRun(...args),
  apiGetRunGovernance: (...args: unknown[]) => mockedApiGetRunGovernance(...args),
  apiListRunEvents: (...args: unknown[]) => mockedApiListRunEvents(...args),
}));

describe("cockpit cards realestate", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiGetCockpitQueues.mockResolvedValue({
      ok: true,
      data: {
        approvals: { total: 1, items: [] },
        reconcile: { pending: 1, sample: [] },
        expiringDelegations: { total: 1, windowDays: 7, items: [] },
        whatsappFailures: { total: 0, items: [] },
      },
    });
    mockedApiRealEstateDryRun.mockResolvedValue({
      ok: true,
      policyDecision: { decision: "allow", mode: "enforce", reason: null },
      preview: { charges: [{ leaseId: "lease-1", amount: 1000 }] },
      planHash: "plan_hash_1",
      diffHash: "diff_hash_1",
    });
    mockedApiApproveRun.mockResolvedValue({
      ok: true,
      runState: { targetStatus: "pending" },
    });
    mockedApiGetRunGovernance.mockResolvedValue({
      runId: "run-1",
      proofs: [{ id: "pou-1", actionId: "close_month", status: "finalized" }],
      evidence: { auditEventIds: ["audit-1", "audit-2"] },
    });
    mockedApiListRunEvents.mockResolvedValue({
      items: [{ id: "evt-1", type: "whatsapp.sent", payload: { messageId: "wamid.1", status: "sent" } }],
    });
  });

  it("smoke: opens panel and shows DryRun/Approvals/Receipts cards", async () => {
    render(
      <CockpitPanel
        queuesEnabled
        tenantId="tenant-A"
        workspaceId="workspace-A"
        selectedRun={
          {
            id: "run-1",
            workspaceId: "workspace-A",
            agent: "EIAH",
            status: "awaiting_approval",
          } as any
        }
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));

    await waitFor(() => {
      expect(screen.getByText("DryRun")).toBeInTheDocument();
      expect(screen.getByText("Approvals")).toBeInTheDocument();
      expect(screen.getByText("Receipts")).toBeInTheDocument();
    });
  });

  it("executes dry-run and displays hashes", async () => {
    render(<CockpitPanel queuesEnabled tenantId="tenant-A" workspaceId="workspace-A" selectedRun={{ id: "run-1" } as any} />);
    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));

    const dryRunButtons = await screen.findAllByRole("button", { name: "Executar dry-run" });
    fireEvent.click(dryRunButtons[0]);

    await waitFor(() => {
      expect(mockedApiRealEstateDryRun).toHaveBeenCalledTimes(1);
      expect(screen.getByText(/planHash: plan_hash_1/)).toBeInTheDocument();
      expect(screen.getByText(/diffHash: diff_hash_1/)).toBeInTheDocument();
    });
  });

  it("approves selected run from approvals card", async () => {
    render(<CockpitPanel queuesEnabled tenantId="tenant-A" workspaceId="workspace-A" selectedRun={{ id: "run-1" } as any} />);
    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));

    const reasonFields = screen.getAllByPlaceholderText("reason (opcional)");
    fireEvent.change(reasonFields[0], {
      target: { value: "approved by smoke test" },
    });
    const approveButtons = screen.getAllByRole("button", { name: "Approve" });
    fireEvent.click(approveButtons[0]);

    await waitFor(() => {
      expect(mockedApiApproveRun).toHaveBeenCalledTimes(1);
      expect(mockedApiApproveRun.mock.calls[0][0]).toBe("run-1");
      expect(screen.getByText(/Aprovado/)).toBeInTheDocument();
    });
  });
});
