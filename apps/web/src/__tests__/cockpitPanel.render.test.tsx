import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import CockpitPanel from "@/components/runs/CockpitPanel";

const mockedApiGetCockpitQueues = vi.fn();

vi.mock("@/lib/api", () => ({
  apiGetCockpitQueues: (...args: unknown[]) => mockedApiGetCockpitQueues(...args),
}));

describe("CockpitPanel render", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApiGetCockpitQueues.mockResolvedValue({
      ok: true,
      data: {
        approvals: { total: 3, items: [] },
        reconcile: { pending: 2, sample: [] },
        expiringDelegations: { total: 1, windowDays: 7, items: [] },
        whatsappFailures: { total: 4, items: [] },
      },
    });
  });

  it("renders collapsed and expands on click", async () => {
    render(<CockpitPanel queuesEnabled />);

    expect(screen.getByTestId("cockpit-panel")).toBeInTheDocument();
    expect(screen.queryByText("Approvals pendentes")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));

    await waitFor(() => {
      expect(screen.getByText("Approvals pendentes")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
    });
  });

  it("does not call API when queues are disabled", async () => {
    render(<CockpitPanel queuesEnabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Expandir" }));
    expect(mockedApiGetCockpitQueues).not.toHaveBeenCalled();
    expect(screen.getByText(/Filas desabilitadas/)).toBeInTheDocument();
  });
});
