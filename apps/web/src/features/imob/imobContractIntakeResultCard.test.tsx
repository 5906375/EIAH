import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ImobContractIntakeResultCardView } from "./ImobContractIntakeResultCard";
import type { ImobContractIntakeResultWidget } from "@/lib/api";

const BASE_WIDGET: ImobContractIntakeResultWidget = {
  kind: "contract_intake_result",
  runId: "run-result-001",
  stage: "documents_collecting",
  status: "ready_for_review",
  nextStep: "Corretora deve revisar clausulas identificadas",
  pendingItems: ["Garantia não definida"],
  riskFlags: ["Multa rescisória abaixo do mínimo legal"],
  documentHash: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
};

function render(
  overrides: Partial<React.ComponentProps<typeof ImobContractIntakeResultCardView>> = {},
): string {
  return renderToStaticMarkup(
    React.createElement(ImobContractIntakeResultCardView, {
      widget: BASE_WIDGET,
      exportStatus: {},
      pdfGuidanceMsg: null,
      ...overrides,
    }),
  );
}

describe("ImobContractIntakeResultCard — view", () => {
  it("RC-1: renders stage label", () => {
    const html = render({});
    assert.match(html, /Coletando documentos/);
  });

  it("RC-2: renders status label", () => {
    const html = render({});
    assert.match(html, /Pronto para revisão/);
  });

  it("RC-3: renders nextStep", () => {
    const html = render({});
    assert.match(html, /Corretora deve revisar/);
  });

  it("RC-4: renders pending items", () => {
    const html = render({});
    assert.match(html, /Garantia não definida/);
  });

  it("RC-5: renders risk flags with warning prefix", () => {
    const html = render({});
    assert.match(html, /⚠/);
    assert.match(html, /Multa rescisória abaixo do mínimo legal/);
  });

  it("RC-6: Exportar HTML button present", () => {
    const html = render({});
    assert.match(html, /Exportar HTML/);
  });

  it("RC-7: Exportar DOCX button present", () => {
    const html = render({});
    assert.match(html, /Exportar DOCX/);
  });

  it("RC-8: PDF button shows Orientação, not Download", () => {
    const html = render({});
    assert.match(html, /Orientação PDF/);
    assert.doesNotMatch(html, /Download PDF/);
    assert.doesNotMatch(html, /Baixar PDF/);
  });

  it("RC-9: Ver no Command Center link rendered when href provided", () => {
    const html = render({ commandCenterHref: "/app/imob/cases" });
    assert.match(html, /Ver no Command Center/);
    assert.match(html, /\/app\/imob\/cases/);
  });

  it("RC-10: Ver no Command Center absent when no href", () => {
    const html = render({ commandCenterHref: undefined });
    assert.doesNotMatch(html, /Ver no Command Center/);
  });

  it("RC-11: PDF guidance message rendered when present", () => {
    const html = render({ pdfGuidanceMsg: "Use o HTML exportado com jspdf" });
    assert.match(html, /Use o HTML exportado com jspdf/);
  });

  it("RC-12: HTML export error shown when status=error", () => {
    const html = render({ exportStatus: { html: "error" } });
    assert.match(html, /Falha ao exportar HTML/);
  });

  it("RC-13: DOCX export error shown when status=error", () => {
    const html = render({ exportStatus: { docx: "error" } });
    assert.match(html, /Falha ao exportar DOCX/);
  });

  it("RC-14: no CPF pattern in rendered output (no PII)", () => {
    const html = render({});
    assert.doesNotMatch(html, /\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });

  it("RC-15: no email pattern in rendered output (no PII)", () => {
    const html = render({});
    assert.doesNotMatch(html, /[^\s@]+@[^\s@]+\.[^\s@]+/);
  });

  it("RC-16: runId prefix shown (truncated, no full PII leakage)", () => {
    const html = render({});
    assert.match(html, /run:/);
    assert.match(html, /run-result-/);
  });
});
