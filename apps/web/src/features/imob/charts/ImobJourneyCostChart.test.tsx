import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobJourneyCostChart } from "./ImobJourneyCostChart";

test("IMOB journey cost chart renders total-based percentages, coverage and Outros bucket", () => {
  const html = renderToStaticMarkup(
    <ImobJourneyCostChart
      loading={false}
      totalCostCents={1000}
      costCoverage={{ runsCount: 8, linkedRunsCount: 6, unlinkedRunsCount: 2 }}
      items={[
        { label: "Captação", cases: 1, runs: 1, costCents: 300 },
        { label: "Qualificação", cases: 1, runs: 1, costCents: 200 },
        { label: "Proposta", cases: 1, runs: 1, costCents: 150 },
        { label: "Contrato", cases: 1, runs: 1, costCents: 100 },
        { label: "Comissão", cases: 1, runs: 1, costCents: 50 },
        { label: "Varredura de mercado", cases: 1, runs: 1, costCents: 200 },
      ]}
    />,
  );

  assert.match(html, /6\/8 runs vinculados/);
  assert.match(html, /Parte dos runs não pôde ser vinculada: 2 run\(s\)\./);
  assert.match(html, /Outros/);
  assert.match(html, /30\.0%/);
  assert.match(html, /20\.0%/);
});

test("IMOB journey cost chart renders empty state when no cost exists", () => {
  const html = renderToStaticMarkup(
    <ImobJourneyCostChart
      loading={false}
      totalCostCents={0}
      costCoverage={{ runsCount: 0, linkedRunsCount: 0, unlinkedRunsCount: 0 }}
      items={[]}
    />,
  );

  assert.match(html, /Sem runs com custo no período/);
});
