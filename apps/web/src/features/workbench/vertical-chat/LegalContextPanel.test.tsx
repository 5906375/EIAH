import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { LegalContextPanel } from "./LegalContextPanel";

describe("LegalContextPanel", () => {
  it("renderiza sem dados inventados", () => {
    const html = renderToStaticMarkup(
      React.createElement(LegalContextPanel, {})
    );
    assert.ok(html.length > 0, "deve renderizar algo");
    assert.ok(html.includes("Análise jurídica"), "deve conter o texto do empty state");
    assert.ok(
      html.includes("Envie um contrato"),
      "deve conter instrução de empty state"
    );
  });

  it("NÃO renderiza pill ou badge 'J-360 vertical'", () => {
    const html = renderToStaticMarkup(
      React.createElement(LegalContextPanel, {})
    );
    // J-360 NÃO deve aparecer sem specialistAvailable=true
    assert.ok(!html.includes("J-360"), "J-360 não deve aparecer quando especialista indisponível");
    assert.ok(!html.includes("Especialista disponível"), "badge especialista não deve aparecer");
  });

  it("J-360 aparece APENAS como texto de especialista quando specialistAvailable=true", () => {
    const html = renderToStaticMarkup(
      React.createElement(LegalContextPanel, { specialistAvailable: true })
    );
    assert.ok(html.includes("J-360 — Agente Jurídico"), "J-360 deve aparecer como texto de especialista");
    assert.ok(html.includes("Especialista disponível"), "deve mostrar a seção de especialista");
    // Confirmar que J-360 é apresentado como agente, não como vertical
    const lowerHtml = html.toLowerCase();
    assert.ok(!lowerHtml.includes('role="tab"'), "J-360 não deve estar em tablist/pill de vertical");
  });

  it("texto do empty state presente", () => {
    const html = renderToStaticMarkup(
      React.createElement(LegalContextPanel, {})
    );
    assert.ok(html.includes("contrato"), "deve mencionar contrato no empty state");
    assert.ok(html.includes("Contexto Jurídico"), "deve ter o label de contexto");
    assert.ok(html.includes("LEGAL"), "deve ter o badge LEGAL");
  });

  it("NÃO contém dados hardcoded de pessoas, CPFs ou processos", () => {
    const html = renderToStaticMarkup(
      React.createElement(LegalContextPanel, { specialistAvailable: true })
    );
    const lowerHtml = html.toLowerCase();
    assert.ok(!lowerHtml.includes("joão"), "não deve ter nome fictício");
    assert.ok(!lowerHtml.includes("maria"), "não deve ter nome fictício");
    assert.ok(!lowerHtml.includes("cpf"), "não deve ter CPF");
    assert.ok(!lowerHtml.includes("850.000"), "não deve ter valor hardcoded");
    assert.ok(!lowerHtml.includes("processo"), "não deve ter processo hardcoded");
  });
});
