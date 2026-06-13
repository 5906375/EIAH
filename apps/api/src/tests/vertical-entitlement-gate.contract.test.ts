import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateVerticalEntitlementGate,
  resolveOperationalEntitlementStatus,
} from "../types/verticalEntitlementGateContract";

const activeInstallation = {
  tenantId: "tenant-A",
  workspaceId: "workspace-A",
  product: "IMOB",
  status: "active",
};

test("vertical entitlement gate allows sensitive assignment when installation is active", () => {
  const result = evaluateVerticalEntitlementGate({
    installation: activeInstallation,
    action: "assign_responsible",
  });

  assert.equal(result.status, "active");
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "enabled");
});

test("vertical entitlement gate blocks sensitive assignment when installation is suspended", () => {
  const result = evaluateVerticalEntitlementGate({
    installation: {
      ...activeInstallation,
      status: "suspended",
    },
    action: "assign_responsible",
  });

  assert.equal(result.status, "suspended");
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "suspended_block");
});

test("vertical entitlement gate treats billing past_due without grace period as blocked for sensitive actions", () => {
  const status = resolveOperationalEntitlementStatus({
    installation: activeInstallation,
    billingPastDue: true,
    gracePeriodActive: false,
  });

  const result = evaluateVerticalEntitlementGate({
    installation: activeInstallation,
    action: "assign_responsible",
    billingPastDue: true,
    gracePeriodActive: false,
  });

  assert.equal(status, "past_due");
  assert.equal(result.status, "past_due");
  assert.equal(result.allowed, false);
  assert.equal(result.reason, "past_due_block");
});

test("vertical entitlement gate keeps read access during inactive and suspended states", () => {
  const suspended = evaluateVerticalEntitlementGate({
    installation: {
      ...activeInstallation,
      status: "suspended",
    },
    action: "read_history",
  });

  const inactive = evaluateVerticalEntitlementGate({
    installation: null,
    action: "read_history",
  });

  assert.equal(suspended.allowed, true);
  assert.equal(suspended.reason, "read_only");
  assert.equal(inactive.status, "inactive");
  assert.equal(inactive.allowed, true);
  assert.equal(inactive.reason, "read_only");
});

