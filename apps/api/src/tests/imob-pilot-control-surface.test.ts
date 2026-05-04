import test from "node:test";
import assert from "node:assert/strict";

import { buildImobPilotControlSurface } from "../services/imob/imobPilotControlSurface";

test("pilot control surface exposes explicit calendar pilot state for IMOB_CRM", () => {
  const surface = buildImobPilotControlSurface({
    caseContext: {
      caseId: "case-1",
      flow: "visit.schedule",
      nextStep: "confirmar agenda da visita",
      lead: { id: "lead-1" },
    },
    generatedAt: "2026-05-04T11:00:00.000Z",
  });

  assert.equal(surface?.flowType, "assisted_calendar_flow");
  assert.equal(surface?.status, "approval_required");
  assert.equal(surface?.rolloutStage, "shadow");
  assert.equal(surface?.visibleAgentId, "IMOB");
  assert.ok((surface?.availableActions.length ?? 0) >= 2);
});

test("pilot control surface remains read-only and does not invent tracking", () => {
  const surface = buildImobPilotControlSurface({
    caseContext: {
      caseId: "case-1",
      flow: "visit.schedule",
      nextStep: "confirmar agenda da visita",
      lead: { id: "lead-1" },
    },
    generatedAt: "2026-05-04T11:05:00.000Z",
  });

  assert.equal(surface?.trackingId, null);
  assert.equal(surface?.jobId, null);
  assert.equal(surface?.evidenceRefs.length, 0);
  assert.match(surface?.summary ?? "", /approval operacional auditável/i);
});

test("pilot control surface does not activate for non-calendar flows", () => {
  const surface = buildImobPilotControlSurface({
    caseContext: {
      caseId: "case-2",
      flow: "listing.activate",
      nextStep: "publicar imóvel",
    },
    generatedAt: "2026-05-04T11:10:00.000Z",
  });

  assert.equal(surface, undefined);
});
