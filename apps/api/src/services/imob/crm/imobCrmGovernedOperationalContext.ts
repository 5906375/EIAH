import type {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

const UPDATE_VERBS = ["editar", "atualizar", "alterar"];
const DELETE_VERBS = ["excluir", "deletar", "remover", "apagar", "arquivar"];
const CASE_RECENT_TERMS = ["caso mais recente", "caso recente", "ultimo caso", "último caso"];
const SHOW_TERMS = ["mostrar", "ver", "consultar", "quais", "abrir"];

function includesAny(text: string, candidates: string[]) {
  return candidates.some((candidate) => text.includes(candidate));
}

function collectConsultSignals(normalized: string) {
  const signals: string[] = [];
  if (includesAny(normalized, CASE_RECENT_TERMS)) signals.push("recent_case");
  if (normalized.includes("casos do lead") || normalized.includes("quais casos do lead")) signals.push("lead_cases");
  if (normalized.includes("status desse caso") || normalized.includes("status deste caso") || normalized.includes("status do caso")) signals.push("case_status");
  if (normalized.includes("o que falta") || normalized.includes("pendencia") || normalized.includes("pendência")) signals.push("missing_items");
  if (includesAny(normalized, SHOW_TERMS)) signals.push("show_records");
  if (normalized.includes("listar leads") || normalized.includes("quais leads estao cadastrados") || normalized.includes("quais leads estão cadastrados") || normalized.includes("leads cadastrados")) signals.push("lead_list");
  if (normalized.includes("listar proprietarios") || normalized.includes("listar proprietários") || normalized.includes("quais proprietarios estao cadastrados") || normalized.includes("quais proprietários estão cadastrados") || normalized.includes("proprietarios cadastrados") || normalized.includes("proprietários cadastrados")) signals.push("owner_list");
  if (normalized.includes("listar imoveis") || normalized.includes("listar imóveis") || normalized.includes("quais imoveis estao cadastrados") || normalized.includes("quais imóveis estão cadastrados") || normalized.includes("imoveis cadastrados") || normalized.includes("imóveis cadastrados")) signals.push("property_list");
  if (normalized.includes("com pendencias") || normalized.includes("com pendências")) signals.push("pending_only");
  if (normalized.includes("qualificados") || normalized.includes("qualificado")) signals.push("qualified_only");
  if (normalized.includes("prontos para revisao") || normalized.includes("prontos para revisão") || normalized.includes("pronto para revisao") || normalized.includes("pronto para revisão")) signals.push("ready_for_review");
  if (includesAny(normalized, UPDATE_VERBS)) signals.push("edit");
  if (includesAny(normalized, DELETE_VERBS)) signals.push("delete");
  if (normalized.includes("locacao") || normalized.includes("locação")) signals.push("goal_rent");
  if (normalized.includes("venda") || normalized.includes("compra")) signals.push("goal_sale");
  if (normalized.includes("nesse caso") || normalized.includes("desse caso") || normalized.includes("deste caso")) signals.push("current_case");
  return signals;
}

export function buildGovernedImobOperationalUpdateContext(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
): ImobOperationalUpdateContext {
  const normalized = helpers.normalizeImobRouteText(params.message);
  const asksLinkOwner =
    normalized.includes("concluir vinculo")
    || normalized.includes("vincular proprietario ao imovel")
    || normalized.includes("vincular proprietário ao imóvel")
    || normalized.includes("vincular imovel ao proprietario")
    || normalized.includes("vincular imóvel ao proprietário")
    || normalized.includes("concluir ligacao proprietario imovel")
    || normalized.includes("concluir ligacao proprietário imóvel");
  return {
    intentVersion: "imob.crm.operational.v1",
    intentSignals: [
      ...(includesAny(normalized, UPDATE_VERBS) ? ["edit"] : []),
      ...(includesAny(normalized, DELETE_VERBS) ? ["delete"] : []),
    ],
    normalized,
    ownerName: helpers.extractOwnerNameFromMessage(params.message),
    ownerExplicitName: helpers.extractOwnerExplicitNameFromMessage(params.message),
    ownerExplicitPhone: helpers.extractOwnerExplicitPhoneFromMessage(params.message),
    ownerExplicitEmail: helpers.extractOwnerExplicitEmailFromMessage(params.message),
    ownerExplicitDocument: helpers.extractOwnerExplicitDocumentFromMessage(params.message),
    leadName: helpers.extractLeadNameFromMessage(params.message),
    document: helpers.extractDocumentFromMessage(params.message),
    address: helpers.extractAddressFromMessage(params.message),
    explicitAddress: helpers.extractExplicitAddressFieldFromMessage(params.message),
    propertyRef: helpers.extractPropertyRefFromMessage(params.message),
    leadPhone: helpers.extractLeadPhoneFromMessage(params.message),
    leadEmail: helpers.extractLeadEmailFromMessage(params.message),
    leadGoal: helpers.extractLeadGoalFromMessage(params.message),
    budgetCents: helpers.extractAmountAfterKeywords(params.message, ["orcamento", "orçamento", "budget"]),
    priceCents: helpers.extractAmountAfterKeywords(params.message, ["preco", "preço", "valor"]),
    targetCity: helpers.extractFreeformCityAfterKeywords(params.message, ["cidade do lead", "cidade de interesse"]),
    asksEdit: includesAny(normalized, UPDATE_VERBS),
    asksDelete: includesAny(normalized, DELETE_VERBS),
    ownerCrudId: helpers.extractOwnerCrudIdFromMessage(params.message),
    propertyCrudId: helpers.extractPropertyCrudIdFromMessage(params.message),
    propertyType: helpers.extractPropertyTypeFromMessage(params.message),
    propertyGoal: helpers.extractPropertyGoalFromMessage(params.message),
    propertyCity: helpers.extractPropertyCityFromMessage(params.message),
    asksLinkOwner,
  };
}

export function buildGovernedImobOperationalConsultContext(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
): ImobOperationalConsultContext {
  const normalized = helpers.normalizeImobRouteText(params.message);
  const intentSignals = collectConsultSignals(normalized);
  const asksRecentCase = intentSignals.includes("recent_case");
  const ownerNameHint = helpers.extractOwnerNameFromMessage(params.message);
  const propertyRefHint = helpers.extractPropertyRefFromMessage(params.message);
  const addressHint = helpers.extractAddressFromMessage(params.message);
  const wantsLead = normalized.includes("lead");
  const wantsCase = normalized.includes("caso");
  const wantsOwner =
    includesAny(normalized, ["proprietario", "proprietária", "proprietaria", "proprietarios", "proprietários", "dono", "owner"])
    || Boolean(ownerNameHint);
  const wantsProperty =
    includesAny(normalized, ["imovel", "imóvel", "imoveis", "imóveis", "apartamento", "apto", "casa", "studio", "terreno", "galpao", "galpão", "sala"])
    || Boolean(propertyRefHint)
    || Boolean(addressHint);
  const asksCurrentCase = intentSignals.includes("current_case") || asksRecentCase;
  const asksShow = intentSignals.includes("show_records") || asksRecentCase;

  return {
    intentVersion: "imob.crm.operational.v1",
    intentSignals,
    normalized,
    ownerNameHint,
    propertyRefHint,
    addressHint,
    wantsLead,
    wantsCase,
    wantsOwner,
    wantsProperty,
    asksLeadCases: intentSignals.includes("lead_cases"),
    asksCurrentCase,
    asksCaseStatus: intentSignals.includes("case_status"),
    asksMissing: intentSignals.includes("missing_items"),
    asksShow,
    asksLeadList: wantsLead && intentSignals.includes("lead_list"),
    asksOwnerList: wantsOwner && intentSignals.includes("owner_list"),
    asksPropertyList: wantsProperty && intentSignals.includes("property_list"),
    asksPendingOnly: intentSignals.includes("pending_only"),
    asksQualifiedOnly: intentSignals.includes("qualified_only"),
    asksReadyForReview: intentSignals.includes("ready_for_review"),
    asksEdit: intentSignals.includes("edit"),
    asksDelete: intentSignals.includes("delete"),
    ownerCrudId: helpers.extractOwnerCrudIdFromMessage(params.message),
    propertyCrudId: helpers.extractPropertyCrudIdFromMessage(params.message),
    asksGoalRent: intentSignals.includes("goal_rent"),
    asksGoalSale: intentSignals.includes("goal_sale"),
    listCityFilter: helpers.extractListCityFilter(params.message),
    businessReadIntent: helpers.resolveImobBusinessReadIntent(params.message),
    hasOperationalTarget: wantsLead || wantsCase || wantsOwner || wantsProperty,
    hasOperationalAction:
      intentSignals.includes("lead_cases")
      || asksCurrentCase
      || intentSignals.includes("case_status")
      || intentSignals.includes("missing_items")
      || asksShow
      || intentSignals.includes("edit")
      || intentSignals.includes("delete")
      || (wantsLead && intentSignals.includes("lead_list"))
      || (wantsOwner && intentSignals.includes("owner_list"))
      || (wantsProperty && intentSignals.includes("property_list"))
      || Boolean(helpers.resolveImobBusinessReadIntent(params.message))
      || helpers.isBulkPropertyOnboardingQuestion(normalized)
      || helpers.isImobRecentRegistrationReadRequest(normalized),
  };
}
