import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobBottleneckHeatmap } from "./ImobBottleneckHeatmap";
import type { ImobHeatmapCell } from "@/lib/api";

test("IMOB heatmap renders grouped bottleneck cells", () => {
  const items: ImobHeatmapCell[] = [
    {
      phase: "documentacao",
      reasonCode: "DOCUMENT_BLOCKER",
      waitingOn: "legal",
      total: 3,
      weightedScore: 14,
    },
  ];

  const html = renderToStaticMarkup(<ImobBottleneckHeatmap items={items} />);

  assert.match(html, /Heatmap de gargalos/);
  assert.match(html, /Documentação/);
  assert.match(html, /Waiting On legal/);
  assert.match(html, /Score agregado 14/);
});
