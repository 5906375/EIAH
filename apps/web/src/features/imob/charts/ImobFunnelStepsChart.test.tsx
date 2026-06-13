import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobFunnelStepsChart } from "./ImobFunnelStepsChart";

test("IMOB funnel steps chart renders updated opened label and monotonic step summary", () => {
  const html = renderToStaticMarkup(
    <ImobFunnelStepsChart
      loading={false}
      windowDays={7}
      steps={[
        { id: "opened", label: "Casos criados no período", count: 12, conversionPct: 100 },
        { id: "qualified", label: "Lead qualificado", count: 8, conversionPct: 66.67 },
        { id: "visit", label: "Visita", count: 4, conversionPct: 50 },
        { id: "proposal", label: "Proposta", count: 2, conversionPct: 50 },
        { id: "closing", label: "Fechamento", count: 1, conversionPct: 50 },
      ]}
    />,
  );

  assert.match(html, /Funil de conversão/);
  assert.match(html, /5 etapas · 7d/);
  assert.match(html, /Casos criados no período/);
  assert.match(html, /Lead qualificado/);
  assert.match(html, /8 de 12 · 66\.7% de conversão · -4/);
  assert.match(html, /2 de 4 · 50\.0% de conversão · -2/);
});

test("IMOB funnel steps chart renders loading and empty states", () => {
  const loadingHtml = renderToStaticMarkup(
    <ImobFunnelStepsChart loading windowDays={15} steps={[]} />,
  );
  const emptyHtml = renderToStaticMarkup(
    <ImobFunnelStepsChart loading={false} windowDays={30} steps={[]} />,
  );

  assert.match(loadingHtml, /Carregando/);
  assert.match(emptyHtml, /Sem dados de funil neste recorte/);
});

test("IMOB funnel steps chart signals anomalous transitions", () => {
  const alertHtml = renderToStaticMarkup(
    <ImobFunnelStepsChart
      loading={false}
      windowDays={7}
      steps={[
        { id: "opened", label: "Casos criados no período", count: 10, conversionPct: 100 },
        { id: "qualified", label: "Lead qualificado", count: 0, conversionPct: 0 },
        { id: "visit", label: "Visita", count: 3, conversionPct: 0 },
        { id: "proposal", label: "Proposta", count: 4, conversionPct: 133.33 },
      ]}
    />,
  );

  assert.match(alertHtml, /⚠ 3 de 0 · 0\.0% de anomalia crítica/);
  assert.match(alertHtml, /↑ 4 de 3 · 133\.3% de anomalia/);
});
