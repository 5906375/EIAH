import test from "node:test";
import assert from "node:assert/strict";

import { resolveHelpDictionarySnapshot } from "./helpDictionaryResolver";

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
  assert.ok(snapshot?.quickReplies.length);
  assert.ok((snapshot?.quickReplies.length ?? 0) <= 3);
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

test("resolver keeps sanitized quick replies limited to three items", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "como funciona",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.ok((snapshot?.quickReplies.length ?? 0) <= 3);
  assert.deepEqual(snapshot?.quickReplies, ["Explicar plataforma", "Explicar agentes", "Explicar Chat IMOB"]);
});

test("resolver routes agents guidance to agent scope", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "como ler os cards dos agentes?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "agent");
  assert.match(snapshot?.content ?? "", /Como ler os cards dos agentes/i);
});

test("resolver explains IMOB as a vertical in public taxonomy", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "IMOB é agente ou vertical?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "agent");
  assert.match(snapshot?.content ?? "", /IMOB na taxonomia publica/i);
  assert.match(snapshot?.content ?? "", /tratado como vertical/i);
});

test("resolver explains Billing as an operational surface", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "Billing é agente ou área?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "agent");
  assert.match(snapshot?.content ?? "", /Billing na taxonomia publica/i);
  assert.match(snapshot?.content ?? "", /area operacional/i);
});

test("resolver explains IMOB_CRM as internal component", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "IMOB_CRM é público ou interno?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "agent");
  assert.match(snapshot?.content ?? "", /IMOB_CRM na taxonomia publica/i);
  assert.match(snapshot?.content ?? "", /componente interno/i);
});

test("resolver routes workflow guidance to workflow scope", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "quando usar chat versus runs?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "workflow");
  assert.match(snapshot?.content ?? "", /Quando usar Chat e quando usar Runs/i);
});

test("resolver does not let IMOB mention block workflow comparison help on generic route", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "qual a diferença entre chat e chat imob?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "workflow");
  assert.match(snapshot?.content ?? "", /Chat principal e Chat IMOB/i);
});

test("resolver routes billing semantics to billing scope", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "qual a diferença entre pricing e billing?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "billing");
  assert.match(snapshot?.content ?? "", /Pricing, Billing e reconciliação/i);
});

test("resolver blocks governance workspace entry when workspace context is missing", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "habilitar agente no workspace",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.responseType, "blocked");
  assert.equal(snapshot?.intent.intentId, "policy_blocked_missing_workspace_context");
});

test("resolver routes governance receipt help to governance scope", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "receipt",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.equal(snapshot?.intent.scopeHint, "governance");
  assert.match(snapshot?.content ?? "", /Guardian, receipt e verificação/i);
});

test("resolver routes product strategy topics to productStrategy scope", () => {
  const whiteLabel = resolveHelpDictionarySnapshot({
    input: "white label",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const dao = resolveHelpDictionarySnapshot({
    input: "DAO",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const tokenizacao = resolveHelpDictionarySnapshot({
    input: "tokenização",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(whiteLabel?.intent.scopeHint, "productStrategy");
  assert.match(whiteLabel?.content ?? "", /White label no EIAH/i);
  assert.equal(dao?.intent.scopeHint, "productStrategy");
  assert.match(dao?.content ?? "", /DAO no contexto do EIAH/i);
  assert.equal(tokenizacao?.intent.scopeHint, "productStrategy");
  assert.match(tokenizacao?.content ?? "", /Tokenização no contexto do EIAH/i);
});
