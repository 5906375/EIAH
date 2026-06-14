import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ImobBrokerChart } from "./ImobBrokerChart";

test("ImobBrokerChart renders dynamic window, derived badge and unassigned warning", () => {
  const html = renderToStaticMarkup(
    <ImobBrokerChart
      ranking={[
        {
          broker: "Mariana Souza",
          cases: 3,
          closings: 2,
          closingRatePct: 66.6,
          estimatedListingValueCents: 650_000_00,
          assignmentSource: "owner_responsible_fallback",
        },
      ]}
      loading={false}
      windowDays={15}
      metricSource="derived"
      unassigned={{
        label: "Corretor não atribuído",
        cases: 2,
        closings: 1,
        estimatedListingValueCents: 500_000_00,
      }}
    />,
  );

  assert.match(html, /15 dias/);
  assert.match(html, /Derivado/);
  assert.match(html, /Corretor não atribuído/);
  assert.match(html, /Valor anunciado est\./);
  assert.match(html, /atribuição derivada/);
});
