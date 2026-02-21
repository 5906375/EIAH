import { expect, test } from "@playwright/test";
import { setupApprovalHarness } from "../harness/approvalHarness";

test.describe("Governance approvals E2E", () => {
  test("aprova run pendente pela UI e limpa fila", async ({ context, page }) => {
    const harness = await setupApprovalHarness(context, page);

    await page.goto("/app/governance");
    await page.getByTestId("tab-approvals").click();

    const approvalItem = page.getByTestId(`approval-item-${harness.seed.pendingRunId}`);
    await expect(approvalItem).toBeVisible();

    const approveResponse = page.waitForResponse((response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/api/runs/${harness.seed.pendingRunId}/approve`)
    );

    await page.getByTestId(`approval-approve-${harness.seed.pendingRunId}`).click();

    const response = await approveResponse;
    expect(response.ok()).toBeTruthy();
    await expect(page.getByText("Sem approvals pendentes no workspace.")).toBeVisible();

    if (harness.mode === "mock") {
      const activeCard = page.getByTestId(`active-run-${harness.seed.activeRunId}`);
      await expect(activeCard).toBeVisible();
      await expect(activeCard).toContainText("run.completed");
    }
  });

  test("rejeita run pendente pela UI com motivo", async ({ context, page }) => {
    const harness = await setupApprovalHarness(context, page);

    await page.goto("/app/governance");
    await page.getByTestId("tab-approvals").click();

    const rejectButton = page.getByTestId(`approval-reject-${harness.seed.pendingRunId}`);
    await expect(rejectButton).toBeVisible();

    page.once("dialog", (dialog) => {
      expect(dialog.type()).toBe("prompt");
      void dialog.accept("Risk policy denied");
    });

    await rejectButton.click();

    await expect(page.getByText("Sem approvals pendentes no workspace.")).toBeVisible();
  });
});
