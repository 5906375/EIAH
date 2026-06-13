import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobCycleTimePanel } from "./ImobCycleTimePanel";

test("IMOB cycle time panel avoids trusted zero states when coverage is missing", () => {
  const html = renderToStaticMarkup(
    <ImobCycleTimePanel
      docsResolved48hPct={0}
      averageDurationHours={0}
      durationSampleSize={0}
      resolutionSampleSize={0}
      loading={false}
      windowDays={7}
    />,
  );

  assert.match(html, /Sem dados suficientes/);
  assert.match(html, /Nenhum fechamento medido no recorte|Sem dados suficientes para calcular ciclo médio/);
  assert.doesNotMatch(html, />0h</);
  assert.doesNotMatch(html, />0%</);
});

test("IMOB cycle time panel renders measured values when coverage exists", () => {
  const html = renderToStaticMarkup(
    <ImobCycleTimePanel
      docsResolved48hPct={62.5}
      averageDurationHours={36}
      durationSampleSize={4}
      resolutionSampleSize={4}
      loading={false}
      windowDays={15}
    />,
  );

  assert.match(html, />36h</);
  assert.match(html, /4 fechamento\(s\) medidos/);
  assert.match(html, />63%</);
});
