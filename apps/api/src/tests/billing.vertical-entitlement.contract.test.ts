import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateVerticalEntitlementGate,
  resolveOperationalEntitlementStatus,
  tenantProductInstallationLikeSchema,
} from "../types/verticalEntitlementGateContract";

const installationRow = {
  tenantId: "tenant-A",
  workspaceId: "workspace-A",
  product: "IMOB",
  status: "active",
};

test("billing vertical entitlement contract uses TenantProductInstallation shape as the current entitlement base", () => {
  const parsed = tenantProductInstallationLikeSchema.parse(installationRow);
  const status = resolveOperationalEntitlementStatus({
    installation: parsed,
    billingPastDue: false,
    gracePeriodActive: false,
  });

  assert.equal(parsed.product, "IMOB");
  assert.equal(parsed.status, "active");
  assert.equal(status, "active");
});

test("billing vertical entitlement contract derives past_due from billing signal without requiring a new VerticalEntitlement model", () => {
  const status = resolveOperationalEntitlementStatus({
    installation: installationRow,
    billingPastDue: true,
    gracePeriodActive: false,
  });

  const gate = evaluateVerticalEntitlementGate({
    installation: installationRow,
    action: "start_new_execution",
    billingPastDue: true,
    gracePeriodActive: false,
  });

  assert.equal(status, "past_due");
  assert.equal(gate.status, "past_due");
  assert.equal(gate.allowed, false);
});

test("billing vertical entitlement contract respects grace period while installation remains active", () => {
  const status = resolveOperationalEntitlementStatus({
    installation: installationRow,
    billingPastDue: true,
    gracePeriodActive: true,
  });

  const gate = evaluateVerticalEntitlementGate({
    installation: installationRow,
    action: "start_new_execution",
    billingPastDue: true,
    gracePeriodActive: true,
  });

  assert.equal(status, "active");
  assert.equal(gate.status, "active");
  assert.equal(gate.allowed, true);
});

test("billing vertical entitlement contract maps suspended and missing installations without extra entitlement state", () => {
  const suspended = resolveOperationalEntitlementStatus({
    installation: {
      ...installationRow,
      status: "suspended",
    },
  });
  const inactive = resolveOperationalEntitlementStatus({
    installation: null,
  });

  assert.equal(suspended, "suspended");
  assert.equal(inactive, "inactive");
});

