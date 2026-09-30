import test from "node:test";
import assert from "node:assert/strict";
import { captureInternalSourceCandidates, type InternalSourceReadPort, type InternalFactInput } from "../lib/p1InternalSourceCapture.js";

const from = "2026-09-14T00:00:00Z", to = "2026-09-21T00:00:00Z", cutoffAt = "2026-09-28T00:00:00Z";
function fixture() {
  const calls: string[] = [];
  const workspaces = [{ id: "w1", tenantId: "t" }, { id: "w2", tenantId: "t" }];
  const runs = [
    { id: "r1", tenantId: "t", workspaceId: "w1", createdAt: from,
      finishedAt: "2026-09-22T00:00:00Z" as string | null, status: "success", costCents: 100 },
    { id: "r2", tenantId: "t", workspaceId: "w2", createdAt: "2026-09-20T00:00:00Z",
      finishedAt: null as string | null, status: "running", costCents: 0 },
  ];
  const facts: InternalFactInput[] = [
    { id: "u", kind: "usage", tenantId: "t", workspaceId: "w1", runId: "r1", createdAt: "2026-09-25T00:00:00Z" },
    { id: "l", kind: "ledger", entryType: "debit", tenantId: "t", workspaceId: "w1", runId: "r1", createdAt: "2026-09-26T00:00:00Z" },
    { id: "orphan", kind: "ledger", entryType: "debit", tenantId: "t", workspaceId: null, runId: null, createdAt: "2026-09-27T00:00:00Z" },
  ];
  const port: InternalSourceReadPort = {
    async withReadView(read) {
      calls.push("view");
      return read({
        snapshotRef: "synthetic-read-view",
        async listWorkspaces(tenantId) { calls.push("workspaces:" + tenantId); return workspaces; },
        async listRuns(scope) { calls.push("runs:" + scope.tenantId); return runs; },
        async listFacts(scope) { calls.push("facts:" + scope.tenantId); return facts; },
      });
    },
  };
  return { port, calls, workspaces, runs, facts };
}
const scope = { tenantId: "t", from, to, cutoffAt };
test("one injected read view includes pending runs, both workspaces, late facts and unresolved links", async () => {
  const f = fixture();
  const result = await captureInternalSourceCandidates(f.port, scope);
  assert.deepEqual(f.calls, ["view", "workspaces:t", "runs:t", "facts:t"]);
  assert.deepEqual(result.workspaceIds, ["w1", "w2"]);
  assert.deepEqual(result.runs.map(r => r.id), ["r1", "r2"]);
  assert.deepEqual(result.counts, { workspaces: 2, runs: 2, pendingRuns: 1, usage: 1, ledger: 2, authority: 0, unresolvedFacts: 1 });
  assert.equal(result.sourcePopulationVerification, "not_demonstrated");
  assert.equal(result.snapshotVerification, "not_demonstrated");
  assert.equal(result.watermarkVerification, "not_demonstrated");
  assert.equal(result.operationMappingVerification, "not_demonstrated");
  assert.equal(result.operationalEligibility, "blocked");
  assert.equal(result.facts.find(fact => fact.id === "l")?.kind, "ledger");
});
test("mixed tenant, mismatched workspace and duplicate fact fail closed", async () => {
  const tenant = fixture(); tenant.facts[0] = { ...tenant.facts[0], tenantId: "other" };
  await assert.rejects(captureInternalSourceCandidates(tenant.port, scope), /fact_tenant_mismatch/);
  const workspace = fixture(); workspace.facts[0] = { ...workspace.facts[0], workspaceId: "w2" };
  await assert.rejects(captureInternalSourceCandidates(workspace.port, scope), /fact_run_workspace_mismatch/);
  const duplicate = fixture(); duplicate.facts.push({ ...duplicate.facts[0] });
  await assert.rejects(captureInternalSourceCandidates(duplicate.port, scope), /duplicate_fact/);
});
test("fact after cutoff and incomplete included population cannot be promoted", async () => {
  const late = fixture(); late.facts[0] = { ...late.facts[0], createdAt: "2026-09-29T00:00:00Z" };
  await assert.rejects(captureInternalSourceCandidates(late.port, scope), /fact_after_cutoff/);
  const omitted = fixture(); omitted.runs.splice(0, 1); omitted.facts.splice(0, 2);
  const result = await captureInternalSourceCandidates(omitted.port, scope);
  assert.deepEqual(result.runs.map(r => r.id), ["r2"]);
  assert.equal(result.sourcePopulationVerification, "not_demonstrated");
  assert.equal(result.operationalEligibility, "blocked");
});
test("nondebit and other guardrail actions cannot enter the selected facts", async () => {
  const credit = fixture();
  credit.facts[1] = { ...credit.facts[1], entryType: "credit" } as unknown as InternalFactInput;
  await assert.rejects(captureInternalSourceCandidates(credit.port, scope), /unsupported_ledger_entry_type/);
  const warning = fixture();
  warning.facts.push({ id: "warning", kind: "authority", actionType: "warning.guardrails",
    tenantId: "t", workspaceId: null, runId: "r1", createdAt: cutoffAt } as unknown as InternalFactInput);
  await assert.rejects(captureInternalSourceCandidates(warning.port, scope), /unsupported_authority_action_type/);
});
