import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ChatVerticalHandoffSurface, type ChatVerticalHandoffSurfaceSnapshot } from "./ChatVerticalHandoffSurface";

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
