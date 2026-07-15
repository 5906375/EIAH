import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveChannelBinding } from "../services/channelBinding";

const phoneHash = "4a354f4d31fe66a17265a1e72fbf40d4d9c6a445f0d3b35f0f79d8d8a34b5265";
const requiredScope = "whatsapp:inbound:read_only";
const requiredEntitlement = "channel.whatsapp.inbound.read_only";

function buildBindings(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    [phoneHash]: {
      tenantId: "tenant-imob-read-only",
      workspaceId: "workspace-imob-read-only",
      scope: requiredScope,
      allowedScopes: [requiredScope],
      entitlements: [requiredEntitlement],
      sessionExpiresAt: "2099-07-15T12:00:00.000Z",
      ...overrides,
    },
  });
}

test("channel binding allows a canonical read-only binding decision", () => {
  const decision = resolveChannelBinding({
    fromPhoneHash: phoneHash,
    bindingsJson: buildBindings(),
    requiredScope,
    requiredEntitlement,
    nowMs: Date.parse("2026-07-15T12:00:00.000Z"),
  });

  assert.deepEqual(decision, {
    allowed: true,
    tenantId: "tenant-imob-read-only",
    workspaceId: "workspace-imob-read-only",
    scope: requiredScope,
    entitlement: requiredEntitlement,
    reasonCode: null,
  });
});

test("channel binding fails closed when the phone has no binding", () => {
  const decision = resolveChannelBinding({
    fromPhoneHash: "missing-phone-hash",
    bindingsJson: buildBindings(),
    requiredScope,
    requiredEntitlement,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "WHATSAPP_PHONE_NOT_BOUND");
  assert.equal(decision.tenantId, null);
  assert.equal(decision.workspaceId, null);
});

test("channel binding fails closed when the session is expired", () => {
  const decision = resolveChannelBinding({
    fromPhoneHash: phoneHash,
    bindingsJson: buildBindings({ sessionExpiresAt: "2026-07-14T12:00:00.000Z" }),
    requiredScope,
    requiredEntitlement,
    nowMs: Date.parse("2026-07-15T12:00:00.000Z"),
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "SESSION_EXPIRED");
  assert.equal(decision.tenantId, "tenant-imob-read-only");
  assert.equal(decision.workspaceId, "workspace-imob-read-only");
});

test("channel binding fails closed when the entitlement contract is incomplete", () => {
  const decision = resolveChannelBinding({
    fromPhoneHash: phoneHash,
    bindingsJson: buildBindings({ entitlements: [] }),
    requiredScope,
    requiredEntitlement,
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "ENTITLEMENT_REQUIRED");
  assert.equal(decision.entitlement, requiredEntitlement);
});
