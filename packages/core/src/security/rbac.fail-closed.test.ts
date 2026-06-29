import test from "node:test";
import assert from "node:assert/strict";
import { prismaGlobal } from "@repo/db";
import { guardrailLedger } from "../audit/guardrailLedger";
import { TenantPolicyStore } from "../policy/TenantPolicyStore";
import { checkScopePermission } from "../security/rbac";

function setPolicyRows(rows: Array<{ workspaceId: string | null; allowed: boolean; maxVersion: number | null }>) {
  (prismaGlobal as unknown as Record<string, unknown>).tenantActionPolicy = {
    findMany: async () => rows,
  };
}

function setLedgerCapture() {
  const ledgerEntries: Array<Record<string, unknown>> = [];
  const auditEntries: Array<Record<string, unknown>> = [];
  let ledgerCreateCalls = 0;
  let auditCreateCalls = 0;
  (prismaGlobal as unknown as Record<string, unknown>).guardrailLedger = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      ledgerCreateCalls += 1;
      ledgerEntries.push(data);
      return data;
    },
  };
  (prismaGlobal as unknown as Record<string, unknown>).guardrailAuditLedger = {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      auditCreateCalls += 1;
      auditEntries.push(data);
      return data;
    },
  };
  return { ledgerEntries, auditEntries, counts: { get ledger() { return ledgerCreateCalls; }, get audit() { return auditCreateCalls; } } };
}

test("TenantPolicyStore allows scope when workspace policy is explicitly enabled", async () => {
  setPolicyRows([{ workspaceId: "workspace-a", allowed: true, maxVersion: 7 }]);

  const decision = await TenantPolicyStore.getInstance().resolveScopeDecision(
    "tenant-a",
    "workspace-a",
    "reports.view",
  );

  assert.equal(decision.allowed, true);
  assert.equal(decision.reasonCode, "SCOPE_ALLOWED");
  assert.equal(decision.policyVersion, "v7");
});

test("TenantPolicyStore fails closed when policy is missing for tenant/workspace", async () => {
  setPolicyRows([]);

  const decision = await TenantPolicyStore.getInstance().resolveScopeDecision(
    "tenant-a",
    "workspace-a",
    "reports.view",
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "POLICY_NOT_FOUND");
});

test("TenantPolicyStore fails closed on workspace mismatch", async () => {
  setPolicyRows([{ workspaceId: "workspace-b", allowed: true, maxVersion: 3 }]);

  const decision = await TenantPolicyStore.getInstance().resolveScopeDecision(
    "tenant-a",
    "workspace-a",
    "reports.view",
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "WORKSPACE_SCOPE_MISMATCH");
  assert.equal(decision.policyVersion, "v3");
});

test("TenantPolicyStore fails closed when scope is explicitly disabled", async () => {
  setPolicyRows([{ workspaceId: "workspace-a", allowed: false, maxVersion: 2 }]);

  const decision = await TenantPolicyStore.getInstance().resolveScopeDecision(
    "tenant-a",
    "workspace-a",
    "reports.view",
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "TENANT_POLICY_DISABLED");
  assert.equal(decision.policyVersion, "v2");
});

test("TenantPolicyStore fails closed when store access is unavailable", async () => {
  (prismaGlobal as unknown as Record<string, unknown>).tenantActionPolicy = {
    findMany: async () => {
      throw new Error("db unavailable");
    },
  };

  const decision = await TenantPolicyStore.getInstance().resolveScopeDecision(
    "tenant-a",
    "workspace-a",
    "reports.view",
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "POLICY_STORE_UNAVAILABLE");
});

test("TenantPolicyStore fails closed when scope is blank", async () => {
  setPolicyRows([{ workspaceId: "workspace-a", allowed: true, maxVersion: 1 }]);

  const decision = await TenantPolicyStore.getInstance().resolveScopeDecision(
    "tenant-a",
    "workspace-a",
    "   ",
  );

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "SCOPE_NOT_ALLOWED");
});

test("TenantPolicyStore legacy isScopeAllowed returns true when scope decision is allowed", async () => {
  setPolicyRows([{ workspaceId: "workspace-a", allowed: true, maxVersion: 1 }]);

  const allowed = await TenantPolicyStore.getInstance().isScopeAllowed(
    "tenant-a",
    "workspace-a",
    "reports.view",
  );

  assert.equal(allowed, true);
});

test("TenantPolicyStore legacy isScopeAllowed returns false when scope decision is denied", async () => {
  setPolicyRows([]);

  const allowed = await TenantPolicyStore.getInstance().isScopeAllowed(
    "tenant-a",
    "workspace-a",
    "reports.view",
  );

  assert.equal(allowed, false);
});

test("RBAC deny persists a guardrail ledger event with tenant/workspace/scope/reasonCode", async () => {
  setPolicyRows([]);
  const { ledgerEntries, auditEntries, counts } = setLedgerCapture();

  const decision = await checkScopePermission({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    userId: "user-a",
    scope: "reports.view",
    requestId: "req-1",
    runId: "run-1",
  });

  assert.equal(decision.allowed, false);
  assert.equal(counts.ledger, 1);
  assert.equal(counts.audit, 1);
  assert.equal(ledgerEntries.length, 1);
  assert.equal(auditEntries.length, 1);
  assert.equal(ledgerEntries[0]?.tenantId, "tenant-a");
  assert.equal(ledgerEntries[0]?.runId, "run-1");
  assert.equal(ledgerEntries[0]?.actionType, "rbac.scope.deny");
  assert.equal(typeof ledgerEntries[0]?.criticalHash, "string");
  assert.equal((auditEntries[0]?.metadata as Record<string, unknown>)?.workspaceId, "workspace-a");
  assert.equal((auditEntries[0]?.metadata as Record<string, unknown>)?.requestId, "req-1");
  assert.equal((auditEntries[0]?.metadata as Record<string, unknown>)?.scope, "reports.view");
  assert.equal((auditEntries[0]?.metadata as Record<string, unknown>)?.reasonCode, "POLICY_NOT_FOUND");
});

test("RBAC deny writes exactly one GuardrailLedger record for a single decision", async () => {
  setPolicyRows([]);
  const { ledgerEntries, counts } = setLedgerCapture();

  await checkScopePermission({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    userId: "user-a",
    scope: "reports.view",
  });

  assert.equal(counts.ledger, 1);
  assert.equal(ledgerEntries.length, 1);
});

test("RBAC deny writes exactly one GuardrailAuditLedger record for a single decision", async () => {
  setPolicyRows([]);
  const { auditEntries, counts } = setLedgerCapture();

  await checkScopePermission({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    userId: "user-a",
    scope: "reports.view",
  });

  assert.equal(counts.audit, 1);
  assert.equal(auditEntries.length, 1);
});

test("RBAC allow persists a guardrail ledger event when scope is granted", async () => {
  setPolicyRows([{ workspaceId: "workspace-a", allowed: true, maxVersion: 7 }]);
  const { ledgerEntries, auditEntries, counts } = setLedgerCapture();

  const decision = await checkScopePermission({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    tokenId: "token-a",
    scope: "reports.view",
  });

  assert.equal(decision.allowed, true);
  assert.equal(counts.ledger, 1);
  assert.equal(counts.audit, 1);
  assert.equal(ledgerEntries.length, 1);
  assert.equal(auditEntries.length, 1);
  assert.equal(ledgerEntries[0]?.actionType, "rbac.scope.allow");
  assert.equal(typeof ledgerEntries[0]?.payloadHash, "string");
  assert.equal((auditEntries[0]?.metadata as Record<string, unknown>)?.actorId, "token-a");
  assert.equal((auditEntries[0]?.metadata as Record<string, unknown>)?.decision, "allow");
  assert.equal((auditEntries[0]?.metadata as Record<string, unknown>)?.reasonCode, "SCOPE_ALLOWED");
});

test("RBAC allow writes exactly one GuardrailLedger record for a single decision", async () => {
  setPolicyRows([{ workspaceId: "workspace-a", allowed: true, maxVersion: 7 }]);
  const { ledgerEntries, counts } = setLedgerCapture();

  await checkScopePermission({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    tokenId: "token-a",
    scope: "reports.view",
  });

  assert.equal(counts.ledger, 1);
  assert.equal(ledgerEntries.length, 1);
});

test("RBAC allow writes exactly one GuardrailAuditLedger record for a single decision", async () => {
  setPolicyRows([{ workspaceId: "workspace-a", allowed: true, maxVersion: 7 }]);
  const { auditEntries, counts } = setLedgerCapture();

  await checkScopePermission({
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    tokenId: "token-a",
    scope: "reports.view",
  });

  assert.equal(counts.audit, 1);
  assert.equal(auditEntries.length, 1);
});

test("RBAC deny remains deny when guardrail ledger persistence fails", async () => {
  setPolicyRows([]);
  const originalLog = guardrailLedger.log;
  let logAttempted = false;
  guardrailLedger.log = async () => {
    logAttempted = true;
    throw new Error("ledger unavailable");
  };

  try {
    const decision = await checkScopePermission({
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      userId: "user-a",
      scope: "reports.view",
    });

    assert.equal(logAttempted, true);
    assert.equal(decision.allowed, false);
    assert.equal(decision.reasonCode, "POLICY_NOT_FOUND");
  } finally {
    guardrailLedger.log = originalLog;
  }
});
