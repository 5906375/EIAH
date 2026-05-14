import test from "node:test";
import assert from "node:assert/strict";

import { classifyImobGovernedIntent } from "../services/imob/imobGovernedIntent";
import { buildGovernedImobOperationalConsultContext } from "../services/imob/crm/imobCrmGovernedOperationalContext";

test("governed IMOB intent classifier flags high-signal ambiguity instead of collapsing it silently", () => {
  const result = classifyImobGovernedIntent("quero agendar visita e preparar contrato");

  assert.equal(result.version, "imob.intent.v1");
  assert.equal(result.ambiguous, true);
  assert.ok(result.candidates.some((candidate) => candidate.intent === "visit"));
  assert.ok(result.candidates.some((candidate) => candidate.intent === "contract"));
});

test("governed IMOB operational consult context centralizes consult signals", () => {
  const context = buildGovernedImobOperationalConsultContext(
    {
      prisma: {} as any,
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      message: "listar imóveis prontos para revisão em itajai",
      threadState: null,
    },
    {
      auditAgentId: "audit-agent",
      resolveImobCrmOperationalUpdate: async () => null,
      resolveImobCrmOperationalConsult: async () => null,
      normalizeImobRouteText: (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
      extractOwnerNameFromMessage: () => null,
      extractOwnerExplicitNameFromMessage: () => null,
      extractOwnerExplicitPhoneFromMessage: () => null,
      extractOwnerExplicitEmailFromMessage: () => null,
      extractOwnerExplicitDocumentFromMessage: () => null,
      extractLeadNameFromMessage: () => null,
      extractDocumentFromMessage: () => null,
      extractAddressFromMessage: () => null,
      extractExplicitAddressFieldFromMessage: () => null,
      extractPropertyRefFromMessage: () => null,
      extractLeadPhoneFromMessage: () => null,
      extractLeadEmailFromMessage: () => null,
      extractLeadGoalFromMessage: () => null,
      extractAmountAfterKeywords: () => null,
      extractFreeformCityAfterKeywords: () => null,
      extractOwnerCrudIdFromMessage: () => null,
      extractPropertyCrudIdFromMessage: () => null,
      extractPropertyTypeFromMessage: () => null,
      extractPropertyGoalFromMessage: () => null,
      extractPropertyCityFromMessage: () => null,
      resolveOwnerDisplayName: async () => "",
      recordImobCrmAuditEvent: async () => undefined,
      resolveOwnerDocumentForDisplay: () => null,
      formatImobStatusLabel: () => "",
      formatImobPendingList: () => "",
      createEmptyThreadState: () => null,
      formatBudgetCentsForImob: () => null,
      formatPropertyLookupLabel: () => "",
      isOwnerDeleteConfirmationMessage: () => false,
      isPropertyDeleteConfirmationMessage: () => false,
      asObject: () => null,
      asString: () => null,
      asStringList: () => [],
      buildOwnerPendingSuggestion: () => null,
      buildLeadPendingSuggestion: () => null,
      buildPropertyPendingSuggestion: () => null,
      extractListCityFilter: () => "itajai",
      resolveImobBusinessReadIntent: () => null,
      buildCaseContextFromRecord: () => null,
      formatImobCaseFlowLabel: () => "",
      buildImobBusinessReadPresentation: () => ({}),
      isBulkPropertyOnboardingQuestion: () => false,
      buildBulkPropertyOnboardingConsult: () => ({}),
      isImobRecentRegistrationReadRequest: () => false,
      buildImobRecentRegistrationConsult: async () => ({}),
      titleCaseRouteWords: () => "",
      findOwnerIdByAuditName: async () => null,
      buildOwnerUpdateForm: () => ({}),
      buildPropertyUpdateForm: () => ({}),
    },
  );

  assert.equal(context.intentVersion, "imob.crm.operational.v1");
  assert.equal(context.wantsProperty, true);
  assert.equal(context.asksPropertyList, true);
  assert.equal(context.asksReadyForReview, true);
  assert.equal(context.hasOperationalTarget, true);
  assert.equal(context.hasOperationalAction, true);
  assert.ok(context.intentSignals?.includes("property_list"));
});
