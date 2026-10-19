import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { LogisticaContextAccess } from "@eiah/contracts";
import { LogisticaCockpitContent } from "./cockpit";
const access: LogisticaContextAccess = { allowed: true, mode: "context_only", usage: "full", executionAllowed: false, externalTransmissionAllowed: false, reason: "available" };
function render(value = access, preDuimpAllowed = false) {
  return renderToStaticMarkup(<MemoryRouter><LogisticaCockpitContent access={value} preDuimpAllowed={preDuimpAllowed} workspaceId="workspace-test" /></MemoryRouter>);
}
test("denied context exposes Front Door recovery without operational modules", () => {
  for (const reason of ["installation_missing", "approval_required", "policy_denied", "revoked", "membership_required"] as const) {
    const html = render({ ...access, allowed: false, usage: "blocked", reason });
    assert.match(html, /domain=core/);
    assert.doesNotMatch(html, /Preparar contexto|Abrir Pré-DUIMP|workspace-test/);
  }
});
test("context-only cockpit requires separate PRE-DUIMP capability", () => {
  const html = render();
  assert.match(html, /Consultando preparações/);
  assert.match(html, /domain=logistica/);
  assert.doesNotMatch(html, /Abrir Pré-DUIMP/);
  assert.match(render(access, true), /href="\/app\/logistica\/pre-duimp"/);
});
test("read-only revocation cannot prepare a new operation", () => {
  const html = render({ ...access, usage: "read_only", reason: "revoked" });
  assert.match(html, /somente para leitura/);
  assert.doesNotMatch(html, /Preparar contexto|<input/);
});
