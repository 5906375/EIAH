import test from "node:test";
import assert from "node:assert/strict";
import { selectInternalRunCandidates } from "../lib/p1InternalRunPopulation.js";

function fixture() {
  return {
    tenantId: "tenant-A",
    window: { from: "2026-09-14T00:00:00Z", to: "2026-09-21T00:00:00Z" },
    cutoffAt: "2026-09-28T00:00:00Z",
    workspaces: [{ id: "w-1", tenantId: "tenant-A" }, { id: "w-2", tenantId: "tenant-A" }],
    runs: [
      { id: "positive", tenantId: "tenant-A", workspaceId: "w-1", createdAt: "2026-09-20T00:00:00Z",
        finishedAt: "2026-09-22T00:00:00Z" as string | null, status: "success", costCents: 100 },
      { id: "zero", tenantId: "tenant-A", workspaceId: "w-2", createdAt: "2026-09-14T00:00:00Z",
        finishedAt: "2026-09-15T00:00:00Z" as string | null, status: "success", costCents: 0 },
      { id: "pending", tenantId: "tenant-A", workspaceId: "w-1", createdAt: "2026-09-20T23:59:59Z",
        finishedAt: null as string | null, status: "running", costCents: 0 },
    ],
  };
}
test("all included tenant runs remain candidates irrespective of cost or terminality", () => {
  const result = selectInternalRunCandidates(fixture());
  assert.deepEqual(result.workspaceIds, ["w-1", "w-2"]);
  assert.deepEqual(result.runIds, ["pending", "positive", "zero"]);
  assert.deepEqual(result.pendingRunIds, ["pending"]);
  assert.equal(result.candidateCount, 3);
  assert.equal(result.sourcePopulationVerification, "not_demonstrated");
  assert.equal(result.operationMappingVerification, "not_demonstrated");
  assert.equal(result.operationalEligibility, "blocked");
});
test("cross-tenant workspace and run fail closed", () => {
  const w = fixture(); w.workspaces[1].tenantId = "tenant-B";
  assert.throws(() => selectInternalRunCandidates(w), /workspace_tenant_mismatch/);
  const r = fixture(); r.runs[0].tenantId = "tenant-B";
  assert.throws(() => selectInternalRunCandidates(r), /run_tenant_mismatch/);
  const wrongWorkspace = fixture(); wrongWorkspace.runs[0].workspaceId = "w-other";
  assert.throws(() => selectInternalRunCandidates(wrongWorkspace), /run_workspace_not_in_tenant/);
});
test("duplicates, unknown state and invalid finish fail closed", () => {
  const duplicate = fixture(); duplicate.runs.push({ ...duplicate.runs[0] });
  assert.throws(() => selectInternalRunCandidates(duplicate), /duplicate_run/);
  const unknown = fixture(); unknown.runs[0].status = "mystery";
  assert.throws(() => selectInternalRunCandidates(unknown), /unknown_run_status/);
  const invalid = fixture(); invalid.runs[2].status = "success";
  assert.throws(() => selectInternalRunCandidates(invalid), /terminal_run_without_finish/);
  const lateFinish = fixture(); lateFinish.runs[0].finishedAt = "2026-09-29T00:00:00Z";
  assert.throws(() => selectInternalRunCandidates(lateFinish), /run_status_or_finish_inconsistent/);
});
test("window is half open, with no implicit filtering", () => {
  const outside = fixture(); outside.runs[0].createdAt = outside.window.to;
  assert.throws(() => selectInternalRunCandidates(outside), /run_outside_window/);
  const empty = fixture(); empty.runs.splice(0);
  const result = selectInternalRunCandidates(empty);
  assert.equal(result.candidateCount, 0);
  assert.equal(result.sourcePopulationVerification, "not_demonstrated");
});
