import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { ImobContractIntakeDraftCardView } from "./ImobContractIntakeDraftCard";
import type { ImobContractIntakeDraftWidget } from "@/lib/api";

const BASE_WIDGET: ImobContractIntakeDraftWidget = {
  kind: "contract_intake_draft",
  draftId: "draft-abc-001",
  draftExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  documentKind: "lease_contract",
  contractType: "residential_lease",
  documentHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
  pendingItems: ["Fiador não identificado", "Vigência não especificada"],
  riskFlags: ["Cláusula 12 sem multa rescisória"],
  actionId: "imob.contract.intake",
  requiresConfirmation: true,
};

function render(props: Partial<typeof ImobContractIntakeDraftCardView extends React.FC<infer P> ? P : never> & {
  widget?: ImobContractIntakeDraftWidget;
}): string {
  const widget = props.widget ?? BASE_WIDGET;
  return renderToStaticMarkup(
    React.createElement(ImobContractIntakeDraftCardView, {
      widget,
      phase: "pending",
      ...props,
    }),
  );
}

describe("ImobContractIntakeDraftCard — view", () => {
  it("DC-1: renders pending items", () => {
    const html = render({});
    assert.match(html, /Fiador não identificado/);
    assert.match(html, /Vigência não especificada/);
  });

  it("DC-2: renders risk flags with warning prefix", () => {
    const html = render({});
    assert.match(html, /⚠/);
    assert.match(html, /Cláusula 12 sem multa rescisória/);
  });

  it("DC-3: renders contract type label — residential_lease", () => {
    const html = render({});
    assert.match(html, /Locação Residencial/);
  });

  it("DC-4: renders contract type label — commercial_lease", () => {
    const html = render({ widget: { ...BASE_WIDGET, contractType: "commercial_lease" } });
    assert.match(html, /Locação Comercial/);
  });

  it("DC-5: renders contract type label — seasonal_lease", () => {
    const html = render({ widget: { ...BASE_WIDGET, contractType: "seasonal_lease" } });
    assert.match(html, /Temporada/);
  });

  it("DC-6: renders document kind label", () => {
    const html = render({});
    assert.match(html, /Contrato de Locação/);
  });

  it("DC-7: confirm button present in pending phase", () => {
    const html = render({ phase: "pending" });
    assert.match(html, /Confirmar Intake/);
  });

  it("DC-8: confirm button absent in confirming phase", () => {
    const html = render({ phase: "confirming" });
    assert.doesNotMatch(html, /Confirmar Intake/);
    assert.match(html, /Confirmando/);
  });

  it("DC-9: confirmed state shows runId", () => {
    const html = render({ phase: "confirmed", runId: "run-test-xyz" });
    assert.match(html, /run-test-xyz/);
    assert.match(html, /confirmado/);
  });

  it("DC-10: error state shows error message", () => {
    const html = render({ phase: "error", errorMsg: "Falha na comunicação com o servidor" });
    assert.match(html, /Falha na comunicação com o servidor/);
  });

  it("DC-11: no CPF pattern in rendered output (no PII)", () => {
    const html = render({});
    assert.doesNotMatch(html, /\d{3}\.\d{3}\.\d{3}-\d{2}/);
  });

  it("DC-12: no CNPJ pattern in rendered output (no PII)", () => {
    const html = render({});
    assert.doesNotMatch(html, /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  });

  it("DC-13: no email pattern in rendered output (no PII)", () => {
    const html = render({});
    assert.doesNotMatch(html, /[^\s@]+@[^\s@]+\.[^\s@]+/);
  });

  it("DC-14: empty pending and risk lists — no list section rendered", () => {
    const html = render({
      widget: { ...BASE_WIDGET, pendingItems: [], riskFlags: [] },
    });
    assert.doesNotMatch(html, /Itens Pendentes/);
    assert.doesNotMatch(html, /Alertas de Risco/);
  });
});
