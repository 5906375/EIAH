import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPreDuimpContextContract,
  preDuimpContextContractSchema,
  evaluatePreDuimpIsolation,
  evaluatePreDuimpEntitlementGate,
} from "../types/preDuimpContextContract";

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

test("pre-duimp entitlement gate reuses the generic multi-vertical gate as a read-only action", () => {
  const activeGate = evaluatePreDuimpEntitlementGate({
    installation: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      product: "LOGISTICA",
      status: "active",
    },
  });
  assert.equal(activeGate.allowed, true);
  assert.equal(activeGate.status, "active");

  const noInstallationGate = evaluatePreDuimpEntitlementGate({ installation: null });
  assert.equal(noInstallationGate.allowed, true);
  assert.equal(noInstallationGate.status, "inactive");
  assert.equal(noInstallationGate.reason, "read_only");
});
