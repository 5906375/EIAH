import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobRescueIndex } from "./ImobRescueIndex";
import type { ImobRescueMetric } from "@/lib/api";

test("IMOB rescue index renders rescue rates by phase", () => {
  const items: ImobRescueMetric[] = [
    {
      scope: "phase",
      key: "proposta",
      rescued: 2,
      totalCritical: 4,
      rescueRate: 0.5,
    },
  ];

  const html = renderToStaticMarkup(<ImobRescueIndex items={items} />);

  assert.match(html, /Índice de resgate/);
  assert.match(html, /Proposta/);
  assert.match(html, /50%/);
});
