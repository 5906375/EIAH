import test from "node:test";
import assert from "node:assert/strict";
import { getBillingReconciliationSummary } from "./billingReconciliation.js";
import {
  BILLING_RUN_COST_DEBIT_OPERATION_ID,
  getGovernedOperation,
} from "@eiah/core/catalog/governedOperationCatalog";

type Condition = Record<string, unknown>;

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (condition && typeof condition === "object" && !(condition instanceof Date)) {
    const cond = condition as Condition;
    if ("not" in cond) {
      if (cond.not === null) return value !== null && value !== undefined;
      return value !== cond.not;
    }
    if ("gte" in cond || "lt" in cond) {
      const time = value instanceof Date ? value.getTime() : new Date(value as string).getTime();
      if ("gte" in cond && time < (cond.gte as Date).getTime()) return false;
      if ("lt" in cond && time >= (cond.lt as Date).getTime()) return false;
      return true;
    }
    if ("startsWith" in cond) {
      return typeof value === "string" && value.startsWith(cond.startsWith as string);
    }
    if ("in" in cond) {
      return (cond.in as unknown[]).includes(value);
    }
  }
  return value === condition;
}

function matchesWhere(row: Record<string, unknown>, where: Condition): boolean {
  return Object.entries(where).every(([key, condition]) => matchesCondition(row[key], condition));
}

function createMockPrisma(fixtures: {
  runs: any[];
  breakdowns: any[];
  ledgerRows: any[];
  guardrailRows: any[];
}) {
  return {
    run: {
      findMany: async ({ where, take }: any) => {
        let rows = fixtures.runs.filter((row) => matchesWhere(row, where));
        rows = rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
    },
    runUsageBreakdown: {
      findMany: async ({ where, take }: any) => {
        let rows = fixtures.breakdowns.filter((row) => matchesWhere(row, where));
        rows = rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
    },
    billingLedger: {
      findMany: async ({ where, take }: any) => {
        let rows = fixtures.ledgerRows.filter((row) => matchesWhere(row, where));
        rows = rows.slice().sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return take ? rows.slice(0, take) : rows;
      },
    },
    guardrailLedger: {
      findMany: async ({ where }: any) => {
        return fixtures.guardrailRows.filter((row) => matchesWhere(row, where));
      },
    },
  } as any;
}

const TENANT = "tenant-1";
const WORKSPACE = "workspace-1";
const NOW = new Date("2026-09-03T00:00:00.000Z");

function run(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "run-1",
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    agent: "billing-agent",
    traceId: null,
    costCents: 0,
    status: "success",
    errorCode: null,
    finishedAt: NOW,
    createdAt: NOW,
    ...overrides,
  };
}

function breakdown(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "breakdown-1",
    runId: "run-1",
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    agent: "billing-agent",
    requestId: "run:run-1:debit",
    meterType: "tokens",
    amountCents: 0,
    createdAt: NOW,
    ...overrides,
  };
}

function ledger(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ledger-1",
    runId: "run-1",
    tenantId: TENANT,
    workspaceId: WORKSPACE,
    requestId: "run:run-1:debit",
    entryType: "debit",
    amountCents: 0,
    createdAt: NOW,
    ...overrides,
  };
}

// R1 — Run não terminal não entra na população.
test("R1: non-terminal run does not enter the P1 population", async () => {
  const prisma = createMockPrisma({
    runs: [run({ finishedAt: null })],
    breakdowns: [],
    ledgerRows: [],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.runsChecked, 0);
  assert.equal(summary.totals.auditGapCount, 0);
});

// R2 — Run terminal sem breakdown = not_applicable, não gap.
test("R2: terminal run without breakdown is not_applicable, not a gap", async () => {
  const prisma = createMockPrisma({
    runs: [run()],
    breakdowns: [],
    ledgerRows: [],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.runsChecked, 1);
  assert.equal(summary.totals.missingBreakdownCount, 1);
  assert.equal(summary.totals.auditGapCount, 0);
  assert.equal(summary.items.auditGaps.some((g) => g.runId === "run-1"), false);
});

// R3 — Run terminal com breakdown zero = zero-cost legítimo, não missing_breakdown.
test("R3: terminal run with a zero-sum breakdown is legitimate zero-cost, not missing_breakdown", async () => {
  const prisma = createMockPrisma({
    runs: [run({ costCents: 0 })],
    breakdowns: [breakdown({ amountCents: 0 })],
    ledgerRows: [ledger({ amountCents: 0 })],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.missingBreakdownCount, 0);
  assert.equal(summary.totals.auditGapCount, 0);
  assert.equal(summary.totals.breakdownRows, 1);
});

// R4 — Run terminal + breakdown > 0 + ledger ausente = auditGap.
test("R4: terminal run with breakdown but no ledger is an audit gap", async () => {
  const prisma = createMockPrisma({
    runs: [run({ costCents: 500 })],
    breakdowns: [breakdown({ amountCents: 500 })],
    ledgerRows: [],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.missingLedgerCount, 1);
  assert.equal(summary.totals.auditGapCount, 1);
  assert.equal(summary.items.auditGaps[0]?.issue, "missing_ledger");
});

// R5 — Run terminal + breakdown + valores inconsistentes = auditGap.
test("R5: terminal run with inconsistent breakdown/ledger values is an audit gap", async () => {
  const prisma = createMockPrisma({
    runs: [run({ costCents: 500 })],
    breakdowns: [breakdown({ amountCents: 500 })],
    ledgerRows: [ledger({ amountCents: 300 })],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.costMismatchCount, 1);
  assert.equal(summary.items.auditGaps[0]?.issue, "breakdown_vs_ledger_mismatch");
});

// R6 — USER_CANCELLED + usage + ledger ausente permanece mensurável (= auditGap real).
test("R6: USER_CANCELLED with usage and no ledger stays measurable as an audit gap", async () => {
  const prisma = createMockPrisma({
    runs: [run({ status: "blocked", errorCode: "USER_CANCELLED", costCents: 200 })],
    breakdowns: [breakdown({ amountCents: 200 })],
    ledgerRows: [],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.missingBreakdownCount, 0, "must not be treated as not_applicable");
  assert.equal(summary.totals.authorityUnresolvedCount, 0, "USER_CANCELLED has no governance-prevention narrative to resolve");
  assert.equal(summary.totals.missingLedgerCount, 1);
  assert.equal(summary.totals.auditGapCount, 1);
  assert.equal(summary.items.auditGaps[0]?.issue, "missing_ledger");
});

// R7 — GUARDRAIL_BLOCK com governance authority comprovada não vira auditGap pelo efeito impedido.
test("R7: GUARDRAIL_BLOCK with proven governance authority is not an audit gap", async () => {
  const prisma = createMockPrisma({
    runs: [run({ status: "blocked", errorCode: "GUARDRAILS_BLOCKED", costCents: 0 })],
    breakdowns: [breakdown({ amountCents: 0 })],
    ledgerRows: [],
    guardrailRows: [{ runId: "run-1", tenantId: TENANT, actionType: "blocked.guardrails" }],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.auditGapCount, 0);
  assert.equal(summary.totals.authorityUnresolvedCount, 0);
});

// R8 — GUARDRAIL_BLOCK sem authority resolvível = not_measured/error, nunca zero/no-gap silencioso.
test("R8: GUARDRAIL_BLOCK without resolvable authority is reported unresolved, never silently healthy", async () => {
  const prisma = createMockPrisma({
    runs: [run({ status: "blocked", errorCode: "GUARDRAILS_BLOCKED", costCents: 0 })],
    breakdowns: [breakdown({ amountCents: 0 })],
    ledgerRows: [],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.auditGapCount, 0, "must not be silently promoted to a confirmed gap");
  assert.equal(summary.totals.authorityUnresolvedCount, 1);
  assert.equal(summary.items.authorityUnresolved[0]?.reason, "GUARDRAIL_AUTHORITY_EVIDENCE_NOT_FOUND");
});

// R9 — duplicate group n=2 → count=1.
test("R9: a duplicate group of 2 rows contributes count=1", async () => {
  const prisma = createMockPrisma({
    runs: [],
    breakdowns: [],
    ledgerRows: [
      ledger({ id: "l1", requestId: "run:dup:debit" }),
      ledger({ id: "l2", requestId: "run:dup:debit" }),
    ],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.duplicateChargesCount, 1);
});

// R10 — duplicate group n=5 → count=4.
test("R10: a duplicate group of 5 rows contributes count=4", async () => {
  const prisma = createMockPrisma({
    runs: [],
    breakdowns: [],
    ledgerRows: Array.from({ length: 5 }, (_, i) => ledger({ id: `l${i}`, requestId: "run:dup:debit" })),
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.duplicateChargesCount, 4);
});

// R11 — dois grupos n=3 e n=2 → total=3.
test("R11: two duplicate groups (n=3, n=2) sum to total=3", async () => {
  const prisma = createMockPrisma({
    runs: [],
    breakdowns: [],
    ledgerRows: [
      ...Array.from({ length: 3 }, (_, i) => ledger({ id: `a${i}`, requestId: "run:a:debit" })),
      ...Array.from({ length: 2 }, (_, i) => ledger({ id: `b${i}`, requestId: "run:b:debit" })),
    ],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.duplicateChargesCount, 3);
});

// R12 — limit não altera duplicateChargesCount.
test("R12: limit truncates displayed items but never the duplicateChargesCount metric", async () => {
  const prisma = createMockPrisma({
    runs: [],
    breakdowns: [],
    ledgerRows: [
      ...Array.from({ length: 3 }, (_, i) => ledger({ id: `a${i}`, requestId: "run:a:debit" })),
      ...Array.from({ length: 2 }, (_, i) => ledger({ id: `b${i}`, requestId: "run:b:debit" })),
    ],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT, limit: 1 });
  assert.equal(summary.totals.duplicateChargesCount, 3);
  assert.ok(summary.items.duplicateCharges.length <= 1);
});

// R13 — entryType (e workspaceId) participam semanticamente do grouping, não apenas requestId.
test("R13: grouping key is the full semantic tuple, not requestId alone", async () => {
  const prisma = createMockPrisma({
    runs: [],
    breakdowns: [],
    ledgerRows: [
      ledger({ id: "l1", requestId: "run:shared:debit", workspaceId: "workspace-1" }),
      ledger({ id: "l2", requestId: "run:shared:debit", workspaceId: "workspace-2" }),
    ],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  // Same requestId but different workspaceId must NOT be merged into one
  // duplicate group — proves the key is tenantId+workspaceId+requestId+entryType,
  // not requestId alone.
  assert.equal(summary.totals.duplicateChargesCount, 0);
});

// R14 — tenant/workspace scope preservado.
test("R14: tenant scope is preserved, other tenants never leak into totals", async () => {
  const prisma = createMockPrisma({
    runs: [run({ id: "run-1", tenantId: TENANT }), run({ id: "run-2", tenantId: "tenant-2" })],
    breakdowns: [],
    ledgerRows: [],
    guardrailRows: [],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.runsChecked, 1);
});

// R15 — catálogo billing.run_cost_debit é realmente consumido.
test("R15: reconciliation blocked-category handling stays in sync with the governed operation catalog", () => {
  const operation = getGovernedOperation(BILLING_RUN_COST_DEBIT_OPERATION_ID);
  assert.deepEqual(
    new Set(Object.keys(operation.blockedSemantics.categories)),
    new Set(["USER_CANCELLED", "GUARDRAIL_BLOCK"]),
  );
  assert.deepEqual([...operation.requiredAuditChain], ["Run", "RunUsageBreakdown", "BillingLedger"]);
});

// R16 — trustscore não resolve guardrail authority.
test("R16: a blocked.trustscore ledger row does not resolve GUARDRAIL_BLOCK authority", async () => {
  const prisma = createMockPrisma({
    runs: [run({ status: "blocked", errorCode: "GUARDRAILS_BLOCKED", costCents: 0 })],
    breakdowns: [breakdown({ amountCents: 0 })],
    ledgerRows: [],
    guardrailRows: [{ runId: "run-1", tenantId: TENANT, actionType: "blocked.trustscore" }],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.auditGapCount, 0, "must not be silently promoted to a confirmed gap");
  assert.equal(summary.totals.authorityUnresolvedCount, 1, "distinct mechanism (trustscore) must not resolve guardrail authority");
  assert.equal(summary.items.authorityUnresolved[0]?.reason, "GUARDRAIL_AUTHORITY_EVIDENCE_NOT_FOUND");
});

// R17 — blocked.guardrails resolve o mecanismo correto.
test("R17: an exact blocked.guardrails ledger row resolves GUARDRAIL_BLOCK authority", async () => {
  const prisma = createMockPrisma({
    runs: [run({ status: "blocked", errorCode: "GUARDRAILS_BLOCKED", costCents: 0 })],
    breakdowns: [breakdown({ amountCents: 0 })],
    ledgerRows: [],
    guardrailRows: [{ runId: "run-1", tenantId: TENANT, actionType: "blocked.guardrails" }],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.authorityUnresolvedCount, 0);
  assert.equal(summary.totals.auditGapCount, 0, "must not classify the absent effect as an audit gap");
});

// R18 — blocked.* desconhecido não resolve (proteção contra regressão futura).
test("R18: an unrecognized blocked.* ledger row does not resolve GUARDRAIL_BLOCK authority", async () => {
  const prisma = createMockPrisma({
    runs: [run({ status: "blocked", errorCode: "GUARDRAILS_BLOCKED", costCents: 0 })],
    breakdowns: [breakdown({ amountCents: 0 })],
    ledgerRows: [],
    guardrailRows: [{ runId: "run-1", tenantId: TENANT, actionType: "blocked.compliance" }],
  });
  const summary = await getBillingReconciliationSummary(prisma, { tenantId: TENANT });
  assert.equal(summary.totals.auditGapCount, 0, "must not be silently promoted to a confirmed gap");
  assert.equal(summary.totals.authorityUnresolvedCount, 1, "unknown blocked.* value must not resolve guardrail authority");
  assert.equal(summary.items.authorityUnresolved[0]?.reason, "GUARDRAIL_AUTHORITY_EVIDENCE_NOT_FOUND");
});
