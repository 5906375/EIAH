import test from "node:test";
import assert from "node:assert/strict";

import { buildImobCaseContextV1 } from "../services/imob/crm/imobCaseContextBuilder";
import { resolveImobRecoveryResponse } from "../services/imob/orchestrator/imobRecoveryResolver";

test("market scan handoff keeps capture recommendation as next safe action without reopening fake pendencies", () => {
  const context = buildImobCaseContextV1({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    caseId: "case-scan-handoff-1",
    message: "fazer varredura de mercado em Itajai para apartamentos de 2 quartos para venda",
    operational: {
      flow: "property.market_scan",
      missionContext: {
        mission: "capture_sale_property",
        lockedUntilExplicitChange: false,
      },
      marketScanSnapshot: {
        scanId: "scan-1",
        providerId: "internal_crm",
        sourceStatus: "completed",
        totalItems: 4,
        readOnly: true,
        generatedAt: "2026-05-25T12:00:00.000Z",
        intelligence: {
          comparableCount: 3,
          comparableSources: [{ providerId: "internal_crm", source: "internal_crm", count: 3 }],
          priceRange: { min: 640000, max: 690000, currency: "BRL" },
          liquidityScore: 0.72,
          pricingRisk: "low",
          sourceCoverageScore: 0.88,
          confidenceScore: 0.78,
          confidenceBand: "high",
        },
        groups: [],
      },
      marketScanOpportunity: {
        opportunityId: "opp-1",
        recommendedAction: "captar",
        confidenceScore: 0.78,
        sourceCoverageScore: 0.88,
        liquidityScore: 0.72,
        pricingRisk: "low",
        priceRange: { min: 640000, max: 690000, currency: "BRL" },
        nextStep: "Preparar draft de captação e submeter para aprovação humana.",
        requiresHumanApproval: true,
        evidenceBundleId: "ev-1",
      },
    },
  });

  const response = resolveImobRecoveryResponse({
    context,
    intent: "next_step",
  });

  assert.equal(response.primaryAction?.label, "Seguir com captação");
  assert.equal(response.primaryAction?.nextMessage, "confirmar captação do scan");
  assert.match(response.summary, /captação/i);
  assert.match(response.summary, /base suficiente/i);
});
