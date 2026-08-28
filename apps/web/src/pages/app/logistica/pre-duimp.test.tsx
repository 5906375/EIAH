import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EiahBrandMark } from "@/components/brand/EiahBrandMark";
import PreDuimpPage from "./pre-duimp";

test("PRE_DUIMP page exposes the internal shadow surface and only one editable contract field", () => {
  const html = renderToStaticMarkup(<PreDuimpPage />);

  assert.match(html, /Logística/);
  assert.match(html, /Pré-DUIMP/);
  assert.match(html, /Modo shadow/);
  assert.match(html, /Nenhuma transmissão ao Siscomex\/Portal Único/);
  assert.match(html, /Criar contexto/);
  assert.equal((html.match(/<input/g) ?? []).length, 1);
  assert.match(html, /name="recordId"/);
  assert.doesNotMatch(
    html,
    /tenantId|workspaceId|grantedScopes|scopes|installation|entitlement|approvalId|policyDecision|authority|token/,
  );
});

test("PRE_DUIMP page keeps HITL and replay visibly unavailable without operational controls", () => {
  const html = renderToStaticMarkup(<PreDuimpPage />);

  assert.match(html, /Aprovação HITL persistida ainda não está habilitada neste ambiente/);
  assert.match(html, /Replay e idempotência persistidos ainda estão em preparação/);
  assert.doesNotMatch(html, /log\.duimp_context\.review/);
  assert.equal((html.match(/type="submit"/g) ?? []).length, 1);
});

test("PRE_DUIMP submit path has a single-flight guard around its only POST", () => {
  const pageSource = readFileSync(new URL("./pre-duimp.tsx", import.meta.url), "utf8");

  assert.match(pageSource, /if \(submissionInFlightRef\.current\) return/);
  assert.equal((pageSource.match(/apiCreatePreDuimpContext\(request\)/g) ?? []).length, 1);
  assert.match(pageSource, /finally[\s\S]*submissionInFlightRef\.current = false/);
});

test("PRE_DUIMP page has labels, visible focus treatment and an aria-live result region", () => {
  const html = renderToStaticMarkup(<PreDuimpPage />);

  assert.match(html, /<label for="pre-duimp-record-id"/);
  assert.match(html, /id="pre-duimp-record-id"/);
  assert.match(html, /focus:ring-2/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
});

test("PRE_DUIMP page uses responsive stacking without fixed pixel widths or a duplicate logo", () => {
  const html = renderToStaticMarkup(<PreDuimpPage />);

  assert.match(html, /lg:grid-cols-/);
  assert.match(html, /min-w-0/);
  assert.doesNotMatch(html, /w-\[\d/);
  assert.doesNotMatch(html, /<img/);
});

test("official EIAH symbol preserves proportions and accessible naming", () => {
  const isolated = renderToStaticMarkup(<EiahBrandMark />);
  const accompanied = renderToStaticMarkup(<EiahBrandMark visibleName />);

  assert.match(isolated, /eiah-symbol\.svg/);
  assert.match(isolated, /alt="EIAH"/);
  assert.match(isolated, /object-contain/);
  assert.match(isolated, /width="40" height="40"/);
  assert.match(accompanied, /alt=""/);
  assert.match(accompanied, /aria-hidden="true"/);
});

test("global shell uses the official brand component and no longer imports the divergent PNG", () => {
  const appSource = readFileSync(new URL("../../../App.tsx", import.meta.url), "utf8");

  assert.match(appSource, /<EiahBrandMark/);
  assert.match(appSource, /visibleName/);
  assert.doesNotMatch(appSource, /Eiah_logo\.png/);
});

test("PRE_DUIMP shell gate is server-authoritative and never hydrates capability from localStorage", () => {
  const appSource = readFileSync(new URL("../../../App.tsx", import.meta.url), "utf8");
  const storeSource = readFileSync(new URL("../../../state/sessionStore.ts", import.meta.url), "utf8");

  assert.match(appSource, /isPreDuimpAccessAllowed/);
  assert.match(appSource, /RequirePreDuimpAccess/);
  assert.match(appSource, /preDuimpAccess: \{ status: "loading" \}/);
  assert.match(appSource, /if \(!active\) return/);
  assert.match(appSource, /active = false/);
  assert.doesNotMatch(storeSource, /getItem\(["']pre.?duimp/i);
  assert.doesNotMatch(storeSource, /setItem\(["']pre.?duimp/i);
});
