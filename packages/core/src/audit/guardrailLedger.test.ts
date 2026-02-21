import test from "node:test";
import assert from "node:assert/strict";
import {
  configureGuardrailLedgerWriter,
  getGuardrailLedgerMetrics,
  guardrailLedger,
} from "./guardrailLedger";

test("guardrailLedger logs fallback when writer is not configured", async () => {
  configureGuardrailLedgerWriter(null);
  const before = getGuardrailLedgerMetrics().guardrailLedgerFallbackTotal;
  await guardrailLedger.log({
    type: "policy.violation",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
  });
  const after = getGuardrailLedgerMetrics().guardrailLedgerFallbackTotal;
  assert.equal(after, before + 1);
});

test("guardrailLedger increments write failure metric when writer throws", async () => {
  const before = getGuardrailLedgerMetrics().guardrailLedgerWriteFailedTotal;
  configureGuardrailLedgerWriter(async () => {
    throw new Error("db offline");
  });

  await guardrailLedger.log({
    type: "policy.violation",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    action: "governance.trust.manage",
  });

  const after = getGuardrailLedgerMetrics().guardrailLedgerWriteFailedTotal;
  assert.equal(after, before + 1);
  configureGuardrailLedgerWriter(null);
});
