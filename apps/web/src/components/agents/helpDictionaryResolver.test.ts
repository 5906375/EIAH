import test from "node:test";
import assert from "node:assert/strict";

import { resolveHelpDictionarySnapshot } from "./helpDictionaryResolver.ts";

test("resolver prioritizes page help before global help", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "como funciona o billing?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "page");
  assert.equal(snapshot?.intent.intentId, "billing_overview");
  assert.match(snapshot?.content ?? "", /Billing & Quotas|Controle financeiro/i);
});

test("resolver returns clarify for generic ambiguous help prompts", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "como funciona",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.responseType, "clarify");
  assert.equal(snapshot?.intent.intentId, "policy_clarify");
});

test("resolver returns vertical IMOB help when route is IMOB and entitlement exists", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "onde acompanho pipeline e etapas no IMOB?",
    routeIntent: "imob",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "vertical");
  assert.match(snapshot?.content ?? "", /Dashboard IMOB|pipeline|etapas/i);
});

test("resolver blocks IMOB help when entitlement is missing", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "quero instalar o IMOB no workspace",
    routeIntent: "imob",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: false },
    },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.responseType, "blocked");
  assert.equal(snapshot?.intent.intentId, "policy_blocked_missing_entitlement");
});

test("resolver returns global fallback when requested", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "zzzz qqqq nao relacionado",
    routeIntent: "help",
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
    },
    includeFallback: true,
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.responseType, "not_found");
  assert.match(snapshot?.content ?? "", /Como a plataforma EIAH se organiza/i);
});
