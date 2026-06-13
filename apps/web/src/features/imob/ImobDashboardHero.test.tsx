import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { ImobDashboardHero } from "./ImobDashboardHero";

test("IMOB dashboard hero keeps last KPI snapshot visible during refresh and uses global conversion label", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ImobDashboardHero
        brandName="Jusall"
        workspaceLabel="Default"
        blockedTotal={2}
        overdueFollowUpCount={5}
        followUpLoading={false}
        conversionPct={12.5}
        totalRunCostCents={123400}
        hasKpiSnapshot
        kpiLoading
        activeProcessCount={8}
        evidencedProcessCount={3}
        priorityChips={[]}
        backToChatHref="/app/imob/chat"
        activeTab="funil"
        onTabChange={() => undefined}
      />
    </MemoryRouter>,
  );

  assert.match(html, /conv global/);
  assert.match(html, /12\.5%/);
  assert.match(html, /R\$\s*1\.234/);
});
