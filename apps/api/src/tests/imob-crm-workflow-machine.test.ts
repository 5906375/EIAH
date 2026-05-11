import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImobCrmWorkflowReasonCodes,
  classifyImobCrmWorkflowTransitionFromMessage,
  canTransition,
  deriveImobCrmWorkflowState,
  filterImobCrmWorkflowCtas,
  getAllowedTransitions,
  getBlockerReason,
  isImobCrmWorkflowNextMessageValid,
  resolveTransition,
} from "../services/imob/crm/imobCrmWorkflowMachine";

test("IMOB_CRM workflow machine allows owner dedupe update when matched entity exists", () => {
  const decision = resolveTransition("owner.dedupe_review", "choose_update_existing", {
    matchedEntityId: "owner-1",
    matchedEntityLabel: "Proprietario",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.nextState, "owner.update");
  assert.equal(decision.preserveContext, true);
});

test("IMOB_CRM workflow machine blocks owner dedupe update fail-closed without matched entity", () => {
  const decision = resolveTransition("owner.dedupe_review", "choose_update_existing", {});

  assert.equal(decision.allowed, false);
  assert.equal(decision.nextState, "owner.dedupe_review");
  assert.equal(decision.reasonCode, "owner_dedupe_missing_match");
});

test("IMOB_CRM workflow machine preserves context when creating a new owner after dedupe", () => {
  const decision = resolveTransition("owner.dedupe_review", "choose_create_new", {
    matchedEntityId: "owner-1",
    matchedEntityLabel: "Proprietario",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.nextState, "owner.create");
  assert.equal(decision.preserveContext, true);
});

test("IMOB_CRM workflow machine lists dedupe matches without resetting the flow", () => {
  const decision = resolveTransition("owner.dedupe_review", "show_records", {
    matches: [{ id: "owner-1", label: "Proprietario" }],
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.nextState, "owner.dedupe_review");
  assert.equal(decision.sideEffect, "list_records");
  assert.equal(decision.preserveContext, true);
});

test("IMOB_CRM workflow machine blocks visit scheduling without linked property", () => {
  const reason = getBlockerReason("visit.schedule", "continue", {
    leadQualified: true,
    propertyLinked: false,
  });

  assert.equal(reason, "visit_missing_property");
});

test("IMOB_CRM workflow machine blocks visit scheduling without qualified lead", () => {
  const reason = getBlockerReason("visit.schedule", "continue", {
    leadQualified: false,
    propertyLinked: true,
  });

  assert.equal(reason, "visit_missing_lead_qualification");
});

test("IMOB_CRM workflow machine allows visit scheduling when lead and property are ready", () => {
  assert.equal(canTransition("visit.schedule", "continue", {
    leadQualified: true,
    propertyLinked: true,
  }), true);
});

test("IMOB_CRM workflow machine keeps pilot status read-only", () => {
  assert.equal(canTransition("pilot.status", "read_only_query", { readOnly: true }), true);
  assert.equal(canTransition("pilot.status", "continue", { readOnly: true }), false);
  assert.equal(getBlockerReason("pilot.status", "continue", { readOnly: true }), "pilot_read_only");
});

test("IMOB_CRM workflow machine does not reopen completed lead qualification without pending fields", () => {
  const decision = resolveTransition("lead.qualify", "continue", {
    pendingFields: [],
  });

  assert.equal(decision.allowed, false);
  assert.equal(decision.reasonCode, "lead_already_qualified");
});

test("IMOB_CRM workflow machine keeps documents owned by IMOB and specialist as support", () => {
  const decision = resolveTransition("documents.review", "read_only_query", {
    ownershipAgentId: "IMOB",
    specialistAgentId: "J_360",
  });

  assert.equal(decision.allowed, true);
  assert.equal(decision.ownershipAgentId, "IMOB");
  assert.equal(decision.specialistAgentId, "J_360");
});

test("IMOB_CRM workflow machine derives runtime dedupe and documents states from operational flow", () => {
  assert.equal(deriveImobCrmWorkflowState({
    operationalFlow: "property.market_scan",
    operationalStatus: "collecting",
  }), "property.market_scan");
  assert.equal(deriveImobCrmWorkflowState({
    operationalFlow: "property.market_scan",
    operationalStatus: "ready_for_review",
    marketScanSelectionStatus: "pending_confirmation",
  }), "property.market_scan.selection");
  assert.equal(deriveImobCrmWorkflowState({
    operationalFlow: "owner.create",
    operationalStatus: "awaiting_dedupe_decision",
  }), "owner.dedupe_review");
  assert.equal(deriveImobCrmWorkflowState({
    operationalFlow: "documents.collect",
    operationalStatus: "collecting",
  }), "documents.review");
});

test("IMOB_CRM workflow machine exposes allowed transitions per state", () => {
  assert.deepEqual(getAllowedTransitions("owner.dedupe_review"), [
    "choose_update_existing",
    "choose_create_new",
    "show_records",
    "cancel",
  ]);
  assert.deepEqual(getAllowedTransitions("property.market_scan"), [
    "start_market_scan",
    "select_market_scan_item",
    "read_only_query",
    "continue",
    "cancel",
  ]);
  assert.deepEqual(getAllowedTransitions("property.market_scan.selection"), [
    "select_market_scan_item",
    "confirm_market_scan_selection",
    "read_only_query",
    "continue",
    "cancel",
  ]);
});

test("IMOB_CRM workflow machine classifies next messages into workflow transitions", () => {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  assert.equal(classifyImobCrmWorkflowTransitionFromMessage("consultar caso", normalize), "read_only_query");
  assert.equal(classifyImobCrmWorkflowTransitionFromMessage("fazer varredura de mercado", normalize), "start_market_scan");
  assert.equal(classifyImobCrmWorkflowTransitionFromMessage("selecionar imóvel prop-1 do scan", normalize), "select_market_scan_item");
  assert.equal(classifyImobCrmWorkflowTransitionFromMessage("confirmar seleção do scan prop-1", normalize), "confirm_market_scan_selection");
  assert.equal(classifyImobCrmWorkflowTransitionFromMessage("criar novo proprietário", normalize), "choose_create_new");
  assert.equal(classifyImobCrmWorkflowTransitionFromMessage("atualizar existente", normalize), "choose_update_existing");
});

test("IMOB_CRM workflow machine offers property.market_scan when requested from property.create", () => {
  const decision = resolveTransition("property.create", "start_market_scan", {});

  assert.equal(decision.allowed, true);
  assert.equal(decision.nextState, "property.market_scan");
  assert.equal(decision.reasonCode, "property_multiple_candidates_offer_market_scan");
});

test("IMOB_CRM workflow machine keeps market scan selection pending until explicit confirmation", () => {
  const selectionDecision = resolveTransition("property.market_scan", "select_market_scan_item", {
    selectedSourceId: "prop-1",
  });
  assert.equal(selectionDecision.allowed, true);
  assert.equal(selectionDecision.nextState, "property.market_scan.selection");

  const confirmDecision = resolveTransition("property.market_scan.selection", "confirm_market_scan_selection", {
    selectedSourceId: "prop-1",
  });
  assert.equal(confirmDecision.allowed, true);
  assert.equal(confirmDecision.nextState, "property.create");
});

test("IMOB_CRM workflow machine validates nextMessage against allowed transitions", () => {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  assert.equal(isImobCrmWorkflowNextMessageValid({
    state: "documents.review",
    context: { ownershipAgentId: "IMOB", specialistAgentId: "J_360" },
    message: "revisar documentos",
    normalize,
  }), true);
  assert.equal(isImobCrmWorkflowNextMessageValid({
    state: "pilot.status",
    context: {},
    message: "cadastrar proprietário",
    normalize,
  }), false);
});

test("IMOB_CRM workflow machine filters CTAs to valid transitions only", () => {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const ctas = filterImobCrmWorkflowCtas({
    state: "case.review",
    context: {},
    normalize,
    ctas: [
      { id: "1", label: "Consultar caso", kind: "neutral", action: "send_suggested_message", nextMessage: "consultar caso" },
      { id: "2", label: "Cadastrar proprietário", kind: "primary", action: "send_suggested_message", nextMessage: "cadastrar proprietário" },
    ],
  });
  assert.deepEqual(ctas.map((item) => item.nextMessage), ["consultar caso", "cadastrar proprietário"]);
});

test("IMOB_CRM workflow machine builds consolidated reason codes per state", () => {
  const codes = buildImobCrmWorkflowReasonCodes({
    state: "documents.review",
    context: { ownershipAgentId: "IMOB", specialistAgentId: "J_360" },
    includeDocumentsOwnership: true,
  });
  assert.ok(codes.includes("documents_review"));
  assert.ok(codes.includes("documents_owned_by_imob"));
});
