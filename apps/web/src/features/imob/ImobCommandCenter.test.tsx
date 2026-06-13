import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { ImobCommandCenter } from "./ImobCommandCenter";

test("IMOB command center renders KPIs, filters, table and action links", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ImobCommandCenter
        health={{
          workspaceId: "workspace-A",
          module: "imob",
          window: "7d",
          generatedAt: "2026-06-11T12:00:00.000Z",
          summary: {
            blockedTotal: 3,
            pendingApprovals: 2,
            pendingLegal: 1,
            salesKitPendingReview: 2,
            partialSettlements: 1,
          },
          byStatus: [],
          byReasonCode: [{ reasonCode: "DOCUMENT_BLOCKER", count: 2, severity: "CRITICAL" }],
          topBlockedRuns: [],
          actions: [],
        }}
        cases={[
          {
            processId: "case-1",
            processLabel: "Captação",
            caseId: "case-1",
            threadId: "thread-1",
            status: "pending_data",
            riskLabel: "DOCUMENT_BLOCKER",
            ageHours: 12.5,
            updatedAt: "2026-06-11T10:00:00.000Z",
            priorityLabel: "alta",
            priorityScore: 9,
            nextAction: "Salvar cadastro",
            journeyLabel: "Captação",
          },
        ]}
        loading={false}
        error={null}
        statusFilter="pending_data"
        reasonFilter="all"
        totalCostLabel="R$ 120"
        caseCostMap={new Map([["case-1", 0]])}
        onStatusFilterChange={() => undefined}
        onReasonFilterChange={() => undefined}
        onRefresh={() => undefined}
        onDownloadArtifact={() => undefined}
        conversationId="conv-1"
      />
    </MemoryRouter>
  );

  assert.match(html, /Central Operacional/);
  assert.match(html, /Bloqueios/);
  assert.match(html, /Pendente revis/);
  assert.match(html, /Pendências legais/);
  assert.match(html, /Settlements parciais/);
  assert.match(html, /Captação/);
  assert.match(html, /abrir no chat/);
  assert.match(html, /Dossiê/);
  assert.match(html, /Comprovante/);
  assert.match(html, /Atualizar casos/);
  assert.match(html, />PDF</);
  assert.match(html, />HTML</);
  assert.match(html, /R\$\s?0/);
});

test("IMOB command center renders empty state and error copy", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ImobCommandCenter
        health={null}
        cases={[]}
        loading={true}
        error="Falha ao carregar central"
        statusFilter="all"
        reasonFilter="all"
        totalCostLabel="R$ 0"
        onStatusFilterChange={() => undefined}
        onReasonFilterChange={() => undefined}
        onRefresh={() => undefined}
        onDownloadArtifact={() => undefined}
      />
    </MemoryRouter>
  );

  assert.match(html, /Falha ao carregar central/);
  assert.match(html, /Nenhum caso para os filtros atuais/);
  assert.match(html, /Atualizando/);
});

test("IMOB command center marks missing consolidated cost explicitly", () => {
  const html = renderToStaticMarkup(
    <MemoryRouter>
      <ImobCommandCenter
        health={null}
        cases={[
          {
            processId: "case-2",
            processLabel: "Proposta",
            caseId: "case-2",
            threadId: "thread-2",
            status: "pending_data",
            riskLabel: "COMMERCIAL_PRIORITY",
            ageHours: 4,
            updatedAt: "2026-06-11T10:00:00.000Z",
            priorityLabel: "média",
            priorityScore: 5,
            nextAction: "Montar proposta",
            journeyLabel: "Proposta",
          },
        ]}
        loading={false}
        error={null}
        statusFilter="all"
        reasonFilter="all"
        totalCostLabel="R$ 0"
        caseCostMap={new Map()}
        onStatusFilterChange={() => undefined}
        onReasonFilterChange={() => undefined}
        onRefresh={() => undefined}
        onDownloadArtifact={() => undefined}
      />
    </MemoryRouter>
  );

  assert.match(html, /custo consolidado indisponível/);
});
