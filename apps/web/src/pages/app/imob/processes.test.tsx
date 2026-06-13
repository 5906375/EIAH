import test from "node:test";
import assert from "node:assert/strict";

import type { ImobCaseCostSnapshot, Run } from "@/lib/api";

import { mergeProcessesWithCostSnapshot } from "./processes";

function createRun(overrides: Partial<Run>): Run {
  return {
    id: "run-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    agent: "imob.specialist",
    status: "running",
    createdAt: "2026-06-10T10:00:00.000Z",
    updatedAt: "2026-06-10T10:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    costCents: 0,
    txId: null,
    receiptId: null,
    threadId: null,
    caseId: null,
    request: null,
    result: null,
    meta: null,
    error: null,
    ...overrides,
  } as Run;
}

test("mergeProcessesWithCostSnapshot applies consolidated cost by caseId and threadId", () => {
  const runs = [
    createRun({
      id: "run-case",
      caseId: "case-1",
      request: { action: "realestate.create_contract", clientName: "Ana", partnerName: "Broker A" },
    }),
    createRun({
      id: "run-thread",
      threadId: "thread-2",
      request: { action: "realestate.release_commission", clientName: "Bruno", partnerName: "Broker B" },
    }),
    createRun({
      id: "run-no-cost",
      request: { action: "realestate.register_property", clientName: "Carla", partnerName: "Broker C" },
    }),
    createRun({
      id: "run-ignored",
      agent: "generic.specialist",
      request: { action: "other.domain.action" },
    }),
  ];
  const costItems: ImobCaseCostSnapshot["items"] = [
    { caseId: "case-1", threadId: null, costCents: 1500, runs: 2 },
    { caseId: "case-2", threadId: "thread-2", costCents: 900, runs: 1 },
  ];

  const rows = mergeProcessesWithCostSnapshot(runs, costItems);

  assert.equal(rows.length, 3);
  assert.equal(rows[0]?.runId, "run-case");
  assert.equal(rows[0]?.costCents, 1500);
  assert.equal(rows[1]?.runId, "run-thread");
  assert.equal(rows[1]?.costCents, 900);
  assert.equal(rows[2]?.runId, "run-no-cost");
  assert.equal(rows[2]?.costCents, 0);
});

test("mergeProcessesWithCostSnapshot preserves stage labels for aggregated stage totals", () => {
  const rows = mergeProcessesWithCostSnapshot(
    [
      createRun({ request: { action: "realestate.create_contract" } }),
      createRun({ id: "run-2", request: { action: "realestate.create_contract" } }),
      createRun({ id: "run-3", request: { action: "realestate.release_commission" } }),
    ],
    [
      { caseId: "case-a", threadId: null, costCents: 1000, runs: 1 },
      { caseId: "case-b", threadId: null, costCents: 2000, runs: 1 },
    ],
  );

  const totalCost = rows.reduce((sum, item) => sum + item.costCents, 0);
  const byStage = new Map<string, number>();
  for (const row of rows) {
    byStage.set(row.stageLabel, (byStage.get(row.stageLabel) ?? 0) + row.costCents);
  }

  assert.equal(totalCost, 0);
  assert.equal(byStage.get("Criar contrato"), 0);
  assert.equal(byStage.get("Liberar comissão"), 0);
});
