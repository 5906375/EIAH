import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobSpecialistLoadBoard } from "./ImobSpecialistLoadBoard";
import type { ImobSpecialistLoadMetric } from "@/lib/api";

test("IMOB specialist load board renders specialist x reason code rows", () => {
  const items: ImobSpecialistLoadMetric[] = [
    {
      specialistId: "I_BC",
      reasonCode: "COMMERCIAL_PRIORITY",
      total: 4,
      weightedScore: 22,
    },
  ];

  const html = renderToStaticMarkup(<ImobSpecialistLoadBoard items={items} />);

  assert.match(html, /Carga por specialist/);
  assert.match(html, /I_BC/);
  assert.match(html, /Comercial/);
});
