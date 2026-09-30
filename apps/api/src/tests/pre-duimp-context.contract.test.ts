import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPreDuimpContextContract,
  preDuimpContextContractSchema,
  evaluatePreDuimpIsolation,
  evaluatePreDuimpEntitlementGate,
} from "../types/preDuimpContextContract";

import { evaluateVerticalEntitlementGate } from "../types/verticalEntitlementGateContract";

test("pre-duimp context contract accepts canonical shadow record for Logística (verticalId=log)", () => {
  const context = buildPreDuimpContextContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalId: "log",
    recordType: "log.comex_duimp_context",
    recordId: "duimp-context-1",
  });

  assert.equal(context.verticalId, "log");
  assert.equal(context.recordType, "log.comex_duimp_context");
  assert.equal(context.mode, "shadow");
  assert.equal(context.externalTransmissionAllowed, false);
});

test("pre-duimp context contract rejects any verticalId other than the Logística literal 'log'", () => {
  const parsed = preDuimpContextContractSchema.safeParse({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalId: "IMOB",
    recordType: "log.comex_duimp_context",
    recordId: "duimp-context-1",
  });

  assert.equal(parsed.success, false);
});

test("pre-duimp context contract rejects non-shadow mode", () => {
  const parsed = preDuimpContextContractSchema.safeParse({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalId: "log",
    recordType: "log.comex_duimp_context",
    recordId: "duimp-context-1",
    mode: "live",
  });

  assert.equal(parsed.success, false);
});

test("pre-duimp context contract rejects externalTransmissionAllowed=true", () => {
  const parsed = preDuimpContextContractSchema.safeParse({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalId: "log",
    recordType: "log.comex_duimp_context",
    recordId: "duimp-context-1",
    externalTransmissionAllowed: true,
  });

  assert.equal(parsed.success, false);
});

test("pre-duimp isolation allows requester in the same tenant/workspace pair", () => {
  const context = buildPreDuimpContextContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalId: "log",
    recordType: "log.comex_duimp_context",
    recordId: "duimp-context-1",
  });

  const result = evaluatePreDuimpIsolation(context, {
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  });

  assert.deepEqual(result, { allowed: true });
});

test("pre-duimp isolation denies a requester from a different tenant", () => {
  const context = buildPreDuimpContextContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalId: "log",
    recordType: "log.comex_duimp_context",
    recordId: "duimp-context-1",
  });

  const result = evaluatePreDuimpIsolation(context, {
    tenantId: "tenant-B",
    workspaceId: "workspace-A",
  });

  assert.deepEqual(result, { allowed: false, reason: "tenant_mismatch" });
});

test("pre-duimp isolation denies a requester from a different workspace in the same tenant", () => {
  const context = buildPreDuimpContextContract({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    verticalId: "log",
    recordType: "log.comex_duimp_context",
    recordId: "duimp-context-1",
  });

  const result = evaluatePreDuimpIsolation(context, {
    tenantId: "tenant-A",
    workspaceId: "workspace-B",
  });

  assert.deepEqual(result, { allowed: false, reason: "workspace_mismatch" });
});

const ENTITLEMENT_CONTEXT = { tenantId: "tenant-A", workspaceId: "workspace-A" };

test("pre-duimp entitlement gate allows an active LOGISTICA installation matching the authority tenant/workspace", () => {
  const result = evaluatePreDuimpEntitlementGate({
    context: ENTITLEMENT_CONTEXT,
    installation: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      product: "LOGISTICA",
      status: "active",
    },
  });

  assert.equal(result.allowed, true);
  if (result.allowed) assert.equal(result.status, "active");
});

test("pre-duimp entitlement gate denies with installation_missing when no installation is provided (cut 3 fixes cut 1's permissive default)", () => {
  const result = evaluatePreDuimpEntitlementGate({
    context: ENTITLEMENT_CONTEXT,
    installation: null,
  });

  assert.deepEqual(result, { allowed: false, reason: "installation_missing" });
});

test("pre-duimp entitlement gate denies with installation_scope_mismatch when installation belongs to a different tenant/workspace", () => {
  const result = evaluatePreDuimpEntitlementGate({
    context: ENTITLEMENT_CONTEXT,
    installation: {
      tenantId: "tenant-B",
      workspaceId: "workspace-A",
      product: "LOGISTICA",
      status: "active",
    },
  });

  assert.deepEqual(result, { allowed: false, reason: "installation_scope_mismatch" });
});

test("pre-duimp entitlement gate denies with installation_product_mismatch when the installation product is not LOGISTICA", () => {
  const result = evaluatePreDuimpEntitlementGate({
    context: ENTITLEMENT_CONTEXT,
    installation: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      product: "IMOB",
      status: "active",
    },
  });

  assert.deepEqual(result, { allowed: false, reason: "installation_product_mismatch" });
});

test("pre-duimp entitlement gate denies with status_denied when the matching installation is not active for a state-changing action", () => {
  const result = evaluatePreDuimpEntitlementGate({
    context: ENTITLEMENT_CONTEXT,
    installation: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      product: "LOGISTICA",
      status: "suspended",
    },
  });

  assert.equal(result.allowed, false);
  if (!result.allowed) {
    assert.equal(result.reason, "status_denied");
    assert.equal(result.status, "suspended");
  }
});

test("PRE_DUIMP literal active retains the existing billing and grace decisions", () => {
  const installation = { ...ENTITLEMENT_CONTEXT, product: "LOGISTICA", status: "active" };
  for (const [billingPastDue, gracePeriodActive] of [[false, false], [false, true], [true, false], [true, true]]) {
    const result = evaluatePreDuimpEntitlementGate({ context: ENTITLEMENT_CONTEXT, installation,
      billingPastDue, gracePeriodActive });
    assert.deepEqual(result, billingPastDue && !gracePeriodActive
      ? { allowed: false, reason: "status_denied", status: "past_due", gateReason: "past_due_block" }
      : { allowed: true, status: "active" });
  }
});

test("PRE_DUIMP preserves suspended classification even when billing and grace flags vary", () => {
  const installation = { ...ENTITLEMENT_CONTEXT, product: "LOGISTICA", status: "suspended" };
  for (const [billingPastDue, gracePeriodActive] of [[false, false], [false, true], [true, false], [true, true]]) {
    assert.deepEqual(evaluatePreDuimpEntitlementGate({ context: ENTITLEMENT_CONTEXT, installation,
      billingPastDue, gracePeriodActive }),
    { allowed: false, reason: "status_denied", status: "suspended", gateReason: "suspended_block" });
  }
});

test("generic vertical entitlement continues normalizing active status independently of PRE_DUIMP", () => {
  for (const status of ["active", "ACTIVE", " active "]) {
    assert.deepEqual(evaluateVerticalEntitlementGate({
      installation: { ...ENTITLEMENT_CONTEXT, product: "IMOB", status },
      action: "start_new_execution", billingPastDue: false, gracePeriodActive: false,
    }), { allowed: true, status: "active", reason: "enabled" });
  }
});
