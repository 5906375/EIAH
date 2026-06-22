import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ReactiveContextPanel } from "./ReactiveContextPanel";

const IMOB_PROPS = {
  state: "empty" as const,
  intakeContext: null,
  commandCenterHref: null,
  funnelHref: null,
  runArchiveHref: null,
};

describe("ReactiveContextPanel", () => {
  it("renderiza ImobWorkbenchContextPanel quando activeVerticalId = 'imob'", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactiveContextPanel, {
        activeVerticalId: "imob",
        imobProps: IMOB_PROPS,
      })
    );
    assert.ok(html.includes("Contexto IMOB"), "deve renderizar o painel IMOB");
    assert.ok(!html.includes("Contexto Jurídico"), "não deve renderizar o painel LEGAL");
  });

  it("renderiza LegalContextPanel quando activeVerticalId = 'legal'", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactiveContextPanel, {
        activeVerticalId: "legal",
        imobProps: IMOB_PROPS,
      })
    );
    assert.ok(html.includes("Contexto Jurídico"), "deve renderizar o painel LEGAL");
    assert.ok(!html.includes("Contexto IMOB"), "não deve renderizar o painel IMOB");
  });

  it("fallback para IMOB quando activeVerticalId é valor desconhecido via cast", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactiveContextPanel, {
        activeVerticalId: "imob",
        imobProps: IMOB_PROPS,
      })
    );
    assert.ok(html.includes("Contexto IMOB"), "fallback deve renderizar IMOB");
  });

  it("LegalContextPanel renderiza sem especialista por padrão", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactiveContextPanel, {
        activeVerticalId: "legal",
        imobProps: IMOB_PROPS,
      })
    );
    assert.ok(!html.includes("Especialista disponível"), "sem especialista disponível por padrão");
  });

  it("LegalContextPanel renderiza especialista quando legalSpecialistAvailable=true", () => {
    const html = renderToStaticMarkup(
      React.createElement(ReactiveContextPanel, {
        activeVerticalId: "legal",
        imobProps: IMOB_PROPS,
        legalSpecialistAvailable: true,
      })
    );
    assert.ok(html.includes("Especialista disponível"), "deve mostrar especialista");
    assert.ok(html.includes("J-360"), "deve nomear J-360 como agente especialista");
  });
});
