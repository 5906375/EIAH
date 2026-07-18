import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChatVerticalHandoffSurface, type ChatVerticalHandoffSurfaceSnapshot } from "./ChatVerticalHandoffSurface";
import { FrontDoorImobFixturePreviewPanel } from "./FrontDoorImobFixturePreviewPanel";
import {
  IMOB_FRONTDOOR_FIXTURE_PREVIEW_ROUTE,
  shouldRenderImobPilot2FixturePreview,
} from "../../features/imob/imobPilot2FixturePreview";

const validImobSnapshot: ChatVerticalHandoffSurfaceSnapshot = {
  version: "chat.vertical_handoff.v1",
  verticalId: "IMOB",
  handoffMessage: "Abrir contexto IMOB em modo read-only.",
  reasonCode: "IMOB_HANDOFF_READ_ONLY",
  riskLevel: "assisted",
  hitlRequired: false,
  renderHints: {
    verticalBadgeLabel: "IMOB",
    suggestedSurface: "cockpit",
    ctaLabel: "Abrir cockpit IMOB",
    cockpitDeepLink: "/app/imob/dashboard",
  },
};

function render(snapshot?: ChatVerticalHandoffSurfaceSnapshot | null) {
  return renderToStaticMarkup(React.createElement(ChatVerticalHandoffSurface, { snapshot }));
}

test("ARCH-IMPL-2: valid IMOB snapshot renders read-only context", () => {
  const html = render(validImobSnapshot);

  assert.match(html, /Handoff read-only/);
  assert.match(html, /IMOB/);
  assert.match(html, /Abrir contexto IMOB em modo read-only/);
  assert.match(html, /IMOB_HANDOFF_READ_ONLY/);
  assert.match(html, /Assistido/);
});

test("ARCH-IMPL-2: absent snapshot renders neutral inactive state", () => {
  const html = render(null);

  assert.match(html, /Nenhum handoff vertical ativo/);
  assert.match(html, /aria-label="Estado do handoff vertical do chat"/);
  assert.doesNotMatch(html, /Handoff read-only/);
});

test("ARCH-IMPL-2: critical HITL snapshot renders visual warning without approval", () => {
  const html = render({
    ...validImobSnapshot,
    riskLevel: "critical",
    hitlRequired: true,
    reasonCode: "IMOB_HANDOFF_CRITICAL_HITL",
  });

  assert.match(html, /Crítico/);
  assert.match(html, /HITL obrigatório/);
  assert.match(html, /nenhuma aprovação é executada/i);
  assert.doesNotMatch(html, /Aprovar/);
});

test("ARCH-IMPL-2: renderHints are displayed as presentation, not policy", () => {
  const html = render(validImobSnapshot);

  assert.match(html, /Render hints de apresentação/);
  assert.match(html, /Badge/);
  assert.match(html, /Superfície sugerida/);
  assert.match(html, /CTA sugerida/);
  assert.match(html, /Deep link/);
  assert.doesNotMatch(html, /entitlement/i);
  assert.doesNotMatch(html, /RBAC/i);
});

test("ARCH-IMPL-2: no mutational button or handler is exposed", () => {
  const html = render(validImobSnapshot);

  assert.doesNotMatch(html, /<button/i);
  assert.doesNotMatch(html, /onClick/i);
  assert.doesNotMatch(html, /lead\.create|lead\.discard|mutation/i);
});

test("ARCH-IMPL-2: no API or provider call occurs while rendering", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error("fetch should not be called");
  }) as typeof fetch;

  try {
    const html = render(validImobSnapshot);
    assert.match(html, /IMOB/);
    assert.equal(fetchCalls, 0);
    assert.doesNotMatch(html, /provider/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("ARCH-IMPL-2: basic accessibility labels are rendered", () => {
  const html = render(validImobSnapshot);

  assert.match(html, /aria-label="Handoff vertical read-only para IMOB"/);
  assert.match(html, /<section/);
});

function renderFrontDoorImobFixturePreview() {
  return renderToStaticMarkup(React.createElement(FrontDoorImobFixturePreviewPanel));
}

test("IMOB-PILOT-7B: /app/chat front door fixture route enables preview", () => {
  const url = new URL(`https://example.test${IMOB_FRONTDOOR_FIXTURE_PREVIEW_ROUTE}`);

  assert.equal(url.pathname, "/app/chat");
  assert.equal(url.hash, "#chat-agent-launcher");
  assert.equal(shouldRenderImobPilot2FixturePreview(url.search), true);
  assert.equal(shouldRenderImobPilot2FixturePreview("?agent=eiah&domain=imob"), false);
  assert.equal(
    shouldRenderImobPilot2FixturePreview("?agent=imob&domain=imob&fixture=imob-pilot-2-shadow-dry-run"),
    false
  );
});

test("IMOB-PILOT-7B: non-operational IMOB handoff preview renders read-only visual state", () => {
  const html = renderFrontDoorImobFixturePreview();

  assert.match(html, /Preview IMOB não operacional/);
  assert.match(html, /Front Door EIAH/);
  assert.match(html, /Resultado visual IMOB read-only/);
  assert.match(html, /Handoff read-only/);
  assert.match(html, /Synthetic IMOB shadow dry-run fixture/);
  assert.match(html, /CHAT_VERTICAL_HANDOFF_TO_COCKPIT/);
  assert.match(html, /RiskLevel/);
  assert.match(html, /high/);
  assert.match(html, /IMOB/);
});

test("IMOB-PILOT-7B: fixture source and synthetic sanitized policy are visible", () => {
  const html = renderFrontDoorImobFixturePreview();

  assert.match(html, /imob-pilot-2-shadow-dry-run-fixture-v1/);
  assert.match(html, /apps\/api\/src\/tests\/fixtures\/imob-pilot-2\/imob-pilot-2-shadow-dry-run\.fixture\.json/);
  assert.match(html, /Fixture sintética\/sanitizada/);
  assert.match(html, /Sintéticos e sanitizados/);
});

test("IMOB-PILOT-7B: HITL and proof receipt bundle states are read-only", () => {
  const html = renderFrontDoorImobFixturePreview();

  assert.match(html, /HITL gate read-only/);
  assert.match(html, /APPROVAL_REQUIRED/);
  assert.match(html, /blocked/);
  assert.match(html, /view_details, request_review/);
  assert.match(html, /Proof\/receipt\/bundle state read-only/);
  assert.match(html, /PROOF_UNAVAILABLE_READ_ONLY/);
  assert.match(html, /not_required/);
  assert.match(html, /Nenhum receipt, bundle, proof, ledger ou referência produtiva é gerado/);
});

test("IMOB-PILOT-7B: operational boundaries are explicit and no mutational CTA is rendered", () => {
  const html = renderFrontDoorImobFixturePreview();

  assert.match(html, /Sem provider/);
  assert.match(html, /Sem DB, ledger ou audit/);
  assert.match(html, /Sem receipt, bundle ou proof real/);
  assert.match(html, /Sem CTA mutacional/);
  assert.match(html, /Sem aprovação real/);
  assert.match(html, /Sem policy decision no frontend/);
  assert.match(html, /Sem regra no ChatAgentLauncher/);
  assert.doesNotMatch(html, /<button/i);
  assert.doesNotMatch(html, /href=/i);
  assert.doesNotMatch(html, /onClick/i);
  assert.doesNotMatch(html, /Open IMOB cockpit/);
  assert.doesNotMatch(html, /\/app\/imob\/chat/);
});
