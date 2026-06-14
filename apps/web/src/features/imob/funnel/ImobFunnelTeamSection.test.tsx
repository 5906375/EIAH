import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { ImobFunnelTeamSection } from "./ImobFunnelTeamSection";

test("ImobFunnelTeamSection renders team blocks inside funnel context", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ImobFunnelTeamSection
        specialistLoad={[
          {
            specialistId: "J_360",
            reasonCode: "DOCUMENT_BLOCKER",
            total: 2,
            weightedScore: 18,
          },
        ]}
        rescueIndex={[
          {
            scope: "phase",
            key: "proposta",
            rescued: 1,
            totalCritical: 3,
            rescueRate: 0.33,
          },
        ]}
        approvalContext={[
          {
            caseId: "case-1",
            threadId: "thread-1",
            specialistId: "fin-nexus",
            reasonCode: "FINANCIAL_BLOCKER",
            reasonLabel: "bloqueio financeiro",
            category: "financial",
            requiresApproval: true,
            requiresEvidence: true,
            evidenceCount: 2,
            humanJourneyPhase: "fechamento",
            waitingOn: "finance",
            urgency: "critical",
            agingHours: 12,
            currentObjective: "fechar pendência financeira",
            nextStep: "validar cobrança",
            suggestedAction: "checar histórico",
            priorityScore: 20,
            autoprompt: "consultar caso",
          },
        ]}
        kpiPerformance={{
          period: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-14T00:00:00.000Z" },
          windowDays: 15,
          metricSource: "derived",
          totals: {
            brokers: 1,
            cases: 3,
            closings: 1,
            estimatedListingValueCents: 900_000_00,
          },
          unassigned: {
            label: "Corretor não atribuído",
            cases: 1,
            closings: 0,
            estimatedListingValueCents: 0,
            assignmentSource: "unassigned_internal",
          },
          ranking: [
            {
              broker: "Mariana Souza",
              cases: 3,
              closings: 1,
              closingRatePct: 33.3,
              avgPendingItems: 1.3,
              avgCycleHours: 12,
              estimatedListingValueCents: 900_000_00,
              assignmentSource: "owner_responsible_fallback",
              updatedAt: "2026-06-14T00:00:00.000Z",
            },
          ],
          generatedAt: "2026-06-14T00:00:00.000Z",
        }}
        kpiLoading={false}
        kpiWindowDays={15}
        telemetryMetrics={{
          messageToPlanAvgMs: 180,
          planToExecuteAvgMs: 2500,
          chatToRunCoveragePct: 82,
          persistSuccessRatePct: 91,
        }}
        buildApprovalHref={(item) => `/app/imob/chat?caseId=${item.caseId}`}
        onApprovalAction={() => undefined}
      />
    </MemoryRouter>,
  );

  assert.match(html, /Equipe no Funil/);
  assert.match(html, /Performance de corretores/);
  assert.match(html, /Telemetria operacional/);
  assert.match(html, /Carga por specialist/);
  assert.match(html, /Approvals contextuais/);
  assert.match(html, /Índice de resgate/);
});
