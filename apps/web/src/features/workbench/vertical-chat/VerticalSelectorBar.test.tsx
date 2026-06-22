import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import { VerticalSelectorBar } from "./VerticalSelectorBar";
import type { VerticalSelectorItem } from "./VerticalChatTypes";

const ITEMS_PREVIEW: VerticalSelectorItem[] = [
  { id: "imob",  label: "IMOB",  state: "active",  color: "#5DCAA5" },
  { id: "legal", label: "LEGAL", state: "preview", color: "#7F77DD", tooltip: "Em breve" },
];

const ITEMS_INACTIVE: VerticalSelectorItem[] = [
  { id: "imob",  label: "IMOB",  state: "active",   color: "#5DCAA5" },
  { id: "legal", label: "LEGAL", state: "inactive", color: "#7F77DD" },
];

describe("VerticalSelectorBar", () => {
  it("renderiza pill IMOB com state active", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerticalSelectorBar, {
        verticals: ITEMS_PREVIEW,
        activeVerticalId: "imob",
        onSelect: () => {},
      })
    );
    assert.ok(html.includes("IMOB"), "pill IMOB deve estar presente");
    assert.ok(html.includes('aria-selected="true"'), "IMOB deve estar aria-selected=true");
  });

  it("renderiza pill LEGAL com state preview (borda tracejada, não clicável)", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerticalSelectorBar, {
        verticals: ITEMS_PREVIEW,
        activeVerticalId: "imob",
        onSelect: () => {},
      })
    );
    assert.ok(html.includes("LEGAL"), "pill LEGAL deve estar presente");
    assert.ok(html.includes("border-dashed"), "LEGAL preview deve ter borda tracejada");
    assert.ok(html.includes("Em breve"), "LEGAL preview deve mostrar texto Em breve");
    assert.ok(html.includes("disabled"), "pill LEGAL preview deve ser disabled");
  });

  it("NÃO renderiza pill J-360 (assert negativo explícito)", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerticalSelectorBar, {
        verticals: ITEMS_PREVIEW,
        activeVerticalId: "imob",
        onSelect: () => {},
      })
    );
    const lowerHtml = html.toLowerCase();
    assert.ok(!lowerHtml.includes("j360"), "pill J-360 não deve existir");
    assert.ok(!lowerHtml.includes("j-360"), "pill J-360 não deve existir");
    assert.ok(!lowerHtml.includes("juridico"), "pill jurídico não deve existir como vertical");
  });

  it("onSelect disparado ao clicar IMOB quando inactive", () => {
    let selected: string | null = null;
    const items: VerticalSelectorItem[] = [
      { id: "imob",  label: "IMOB",  state: "inactive", color: "#5DCAA5" },
      { id: "legal", label: "LEGAL", state: "active",   color: "#7F77DD" },
    ];
    const html = renderToStaticMarkup(
      React.createElement(VerticalSelectorBar, {
        verticals: items,
        activeVerticalId: "legal",
        onSelect: (id) => { selected = id; },
      })
    );
    // pill IMOB presente e não-disabled
    assert.ok(html.includes("IMOB"), "pill IMOB deve estar presente");
    const imobDisabled = html.match(/<button[^>]*IMOB/s)?.[0]?.includes('disabled=""') ?? false;
    assert.ok(!imobDisabled, "pill IMOB inactive não deve ser disabled");
  });

  it("onSelect NÃO disparado ao clicar LEGAL preview (button disabled)", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerticalSelectorBar, {
        verticals: ITEMS_PREVIEW,
        activeVerticalId: "imob",
        onSelect: () => { throw new Error("não deve disparar"); },
      })
    );
    // confirma que o button LEGAL tem disabled
    assert.ok(html.includes("disabled"), "pill LEGAL preview deve ter atributo disabled");
  });

  it("aria-selected e aria-disabled corretos", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerticalSelectorBar, {
        verticals: ITEMS_PREVIEW,
        activeVerticalId: "imob",
        onSelect: () => {},
      })
    );
    assert.ok(html.includes('aria-selected="true"'), "IMOB active deve ter aria-selected=true");
    assert.ok(html.includes('aria-disabled="true"'), "LEGAL preview deve ter aria-disabled=true");
  });

  it("pill com state disabled não é renderizado", () => {
    const items: VerticalSelectorItem[] = [
      { id: "imob",  label: "IMOB",  state: "active",   color: "#5DCAA5" },
      { id: "legal", label: "LEGAL", state: "disabled",  color: "#7F77DD" },
    ];
    const html = renderToStaticMarkup(
      React.createElement(VerticalSelectorBar, {
        verticals: items,
        activeVerticalId: "imob",
        onSelect: () => {},
      })
    );
    assert.ok(!html.includes("LEGAL"), "pill disabled não deve ser renderizado");
  });
});
