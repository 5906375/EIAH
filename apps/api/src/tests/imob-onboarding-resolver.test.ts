import test from "node:test";
import assert from "node:assert/strict";

import {
  ImobOnboardingIntent,
  type ImobOnboardingResponse,
} from "../services/eiah/contracts/imobOnboardingResponse.v1";
import { resolveImobOnboardingResponse } from "../services/imob/orchestrator/imobOnboardingResolver";

function buildResponse(
  intent: ImobOnboardingIntent,
  overrides: Partial<Parameters<typeof resolveImobOnboardingResponse>[0]> = {},
): ImobOnboardingResponse {
  return resolveImobOnboardingResponse({
    intent,
    ...overrides,
  });
}

test("IMOB onboarding resolver returns structured general help with runtime-backed prompts", () => {
  const response = buildResponse(ImobOnboardingIntent.GENERAL_HELP);

  assert.equal(response.intent, ImobOnboardingIntent.GENERAL_HELP);
  assert.match(response.summary, /chat imob conduz/i);
  assert.ok(response.suggestedPrompts.length >= 9);
  assert.ok(response.suggestedPrompts.every((item) => item.capabilityId.length > 0));
  assert.ok(response.suggestedPrompts.every((item) => item.targetAgent.length > 0));
  assert.ok(response.suggestedPrompts.some((item) => item.capabilityId === "viability.market_analysis"));
  assert.ok(response.suggestedPrompts.some((item) => item.capabilityId === "lead.scoring"));
  assert.ok(response.suggestedPrompts.some((item) => item.capabilityId === "inventory.active_watch"));
  assert.ok(response.suggestedPrompts.some((item) => item.capabilityId === "relationship.commercial_memory"));
  assert.equal(response.governance.registryVersion, "imobCapabilityRegistry.v1");
  assert.equal(response.governance.killSwitchAware, true);
});

test("IMOB onboarding resolver expands capture help with property, viability and lead prompts", () => {
  const response = buildResponse(ImobOnboardingIntent.CAPTURE_HELP);

  assert.ok(response.suggestedPrompts.some((item) => item.label === "Captação"));
  assert.ok(response.suggestedPrompts.some((item) => item.label === "Viabilidade"));
  assert.ok(response.suggestedPrompts.some((item) => item.label === "Proprietário"));
  assert.ok(response.suggestedPrompts.some((item) => item.label === "Qualificação do lead"));
  assert.ok(response.suggestedPrompts.some((item) => item.label === "Priorização do lead"));
});

test("IMOB onboarding resolver expands transaction help with proposal, documents and continuity prompts", () => {
  const response = buildResponse(ImobOnboardingIntent.TRANSACTION_HELP);

  assert.ok(response.suggestedPrompts.some((item) => item.label === "Proposta"));
  assert.ok(response.suggestedPrompts.some((item) => item.label === "Documentos"));
  assert.ok(response.suggestedPrompts.some((item) => item.label === "Follow-up"));
  assert.ok(response.suggestedPrompts.some((item) => item.label === "Relacionamento"));
  assert.ok(response.suggestedPrompts.some((item) => item.label === "Próximo passo"));
});

test("IMOB onboarding resolver removes prompts from disabled capabilities", () => {
  const response = buildResponse(ImobOnboardingIntent.GENERAL_HELP, {
    disabledCapabilityIds: ["active_capture.scouting", "schedule.real_calendar"],
  });

  assert.ok(response.suggestedPrompts.every((item) => item.capabilityId !== "active_capture.scouting"));
  assert.ok(response.suggestedPrompts.every((item) => item.capabilityId !== "schedule.real_calendar"));
});

test("IMOB onboarding resolver keeps onboarding explanatory without entitlement but blocks actionable handoff", () => {
  const response = buildResponse(ImobOnboardingIntent.CAPTURE_HELP, {
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: {
        REAL_ESTATE_CORE: false,
        IMOB_INSTALLED: false,
      },
    },
  });

  assert.ok(response.suggestedPrompts.length > 0);
  assert.ok(response.suggestedPrompts.every((item) => item.executable === false));
  assert.equal(response.handoffShortcut?.allowed, false);
  assert.equal(response.handoffShortcut?.reasonCode, "IMOB_ENTITLEMENT_MISSING");
});

test("IMOB onboarding resolver enables chat handoff when tenant, workspace and IMOB entitlement are valid", () => {
  const response = buildResponse(ImobOnboardingIntent.NEXT_ACTION_QUERY, {
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    access: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: {
        REAL_ESTATE_CORE: true,
        IMOB_INSTALLED: true,
      },
    },
  });

  assert.equal(response.handoffShortcut?.allowed, true);
  assert.equal(response.handoffShortcut?.route, "/app/imob/chat");
  assert.equal(response.handoffShortcut?.preloadedMessage, "qual o próximo passo desse caso?");
  assert.ok(response.suggestedPrompts.every((item) => item.executable === true));
});
