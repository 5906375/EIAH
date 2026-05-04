import { resolveImobCaseOperationalConsult } from "./imobCrmOperationalCase";
import { resolveImobLeadOperationalConsult, resolveImobLeadOperationalUpdate } from "./imobCrmOperationalLead";
import { resolveImobOwnerOperationalConsult, resolveImobOwnerOperationalUpdate } from "./imobCrmOperationalOwner";
import { resolveImobPropertyOperationalConsult, resolveImobPropertyOperationalUpdate } from "./imobCrmOperationalProperty";
import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  ImobOperationalUpdateContext,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

export type { ImobOperationalResolverParams } from "./imobCrmOperationalResolverShared";

function buildUpdateContext(params: ImobOperationalResolverParams, helpers: ResolverHelpers): ImobOperationalUpdateContext {
  const normalized = helpers.normalizeImobRouteText(params.message);
  return {
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
    asksEdit: normalized.includes("editar") || normalized.includes("atualizar") || normalized.includes("alterar"),
    asksDelete: normalized.includes("excluir") || normalized.includes("deletar") || normalized.includes("remover") || normalized.includes("apagar") || normalized.includes("arquivar"),
    ownerCrudId: helpers.extractOwnerCrudIdFromMessage(params.message),
    propertyCrudId: helpers.extractPropertyCrudIdFromMessage(params.message),
    propertyType: helpers.extractPropertyTypeFromMessage(params.message),
    propertyGoal: helpers.extractPropertyGoalFromMessage(params.message),
    propertyCity: helpers.extractPropertyCityFromMessage(params.message),
  };
}

function buildConsultContext(params: ImobOperationalResolverParams, helpers: ResolverHelpers): ImobOperationalConsultContext {
  const normalized = helpers.normalizeImobRouteText(params.message);
  const asksRecentCase =
    normalized.includes("caso mais recente")
    || normalized.includes("caso recente")
    || normalized.includes("ultimo caso")
    || normalized.includes("último caso");
  const ownerNameHint = helpers.extractOwnerNameFromMessage(params.message);
  const propertyRefHint = helpers.extractPropertyRefFromMessage(params.message);
  const addressHint = helpers.extractAddressFromMessage(params.message);
  const wantsLead = normalized.includes("lead");
  const wantsCase = normalized.includes("caso");
  const wantsOwner = normalized.includes("proprietario") || normalized.includes("proprietária") || normalized.includes("proprietaria") || normalized.includes("proprietarios") || normalized.includes("proprietários") || normalized.includes("dono") || normalized.includes("owner") || Boolean(ownerNameHint);
  const wantsProperty = normalized.includes("imovel") || normalized.includes("imóvel") || normalized.includes("imoveis") || normalized.includes("imóveis") || normalized.includes("apartamento") || normalized.includes("apto") || normalized.includes("casa") || normalized.includes("studio") || normalized.includes("terreno") || normalized.includes("galpao") || normalized.includes("galpão") || normalized.includes("sala") || Boolean(propertyRefHint) || Boolean(addressHint);
  return {
    normalized,
    ownerNameHint,
    propertyRefHint,
    addressHint,
    wantsLead,
    wantsCase,
    wantsOwner,
    wantsProperty,
    asksLeadCases: normalized.includes("casos do lead") || normalized.includes("quais casos do lead"),
    asksCurrentCase: normalized.includes("nesse caso") || normalized.includes("desse caso") || normalized.includes("deste caso") || asksRecentCase,
    asksCaseStatus: normalized.includes("status desse caso") || normalized.includes("status deste caso") || normalized.includes("status do caso"),
    asksMissing: normalized.includes("o que falta") || normalized.includes("pendencia") || normalized.includes("pendência"),
    asksShow: normalized.includes("mostrar") || normalized.includes("ver") || normalized.includes("consultar") || normalized.includes("quais") || normalized.includes("abrir") || asksRecentCase,
    asksLeadList: wantsLead && (normalized.includes("listar leads") || normalized.includes("quais leads estao cadastrados") || normalized.includes("quais leads estão cadastrados") || normalized.includes("leads cadastrados")),
    asksOwnerList: wantsOwner && (normalized.includes("listar proprietarios") || normalized.includes("listar proprietários") || normalized.includes("quais proprietarios estao cadastrados") || normalized.includes("quais proprietários estão cadastrados") || normalized.includes("proprietarios cadastrados") || normalized.includes("proprietários cadastrados")),
    asksPropertyList: wantsProperty && (normalized.includes("listar imoveis") || normalized.includes("listar imóveis") || normalized.includes("quais imoveis estao cadastrados") || normalized.includes("quais imóveis estão cadastrados") || normalized.includes("imoveis cadastrados") || normalized.includes("imóveis cadastrados")),
    asksPendingOnly: normalized.includes("com pendencias") || normalized.includes("com pendências"),
    asksQualifiedOnly: normalized.includes("qualificados") || normalized.includes("qualificado"),
    asksReadyForReview: normalized.includes("prontos para revisao") || normalized.includes("prontos para revisão") || normalized.includes("pronto para revisao") || normalized.includes("pronto para revisão"),
    asksEdit: normalized.includes("editar") || normalized.includes("atualizar") || normalized.includes("alterar"),
    asksDelete: normalized.includes("excluir") || normalized.includes("deletar") || normalized.includes("remover") || normalized.includes("apagar") || normalized.includes("arquivar"),
    ownerCrudId: helpers.extractOwnerCrudIdFromMessage(params.message),
    propertyCrudId: helpers.extractPropertyCrudIdFromMessage(params.message),
    asksGoalRent: normalized.includes("locacao") || normalized.includes("locação"),
    asksGoalSale: normalized.includes("venda") || normalized.includes("compra"),
    listCityFilter: helpers.extractListCityFilter(params.message),
    businessReadIntent: helpers.resolveImobBusinessReadIntent(params.message),
  };
}

export async function resolveImobOperationalUpdateImpl(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
) {
  const crmResolved = await helpers.resolveImobCrmOperationalUpdate(params);
  if (crmResolved) return crmResolved;

  const context = buildUpdateContext(params, helpers);
  return (
    await resolveImobOwnerOperationalUpdate(params, helpers, context)
    ?? await resolveImobLeadOperationalUpdate(params, helpers, context)
    ?? await resolveImobPropertyOperationalUpdate(params, helpers, context)
    ?? null
  );
}

export async function resolveImobOperationalConsultImpl(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
) {
  const crmResolved = await helpers.resolveImobCrmOperationalConsult(params);
  if (crmResolved) return crmResolved;

  const context = buildConsultContext(params, helpers);
  if (!(context.wantsLead || context.wantsCase || context.wantsOwner || context.wantsProperty) || !(context.asksLeadCases || context.asksCurrentCase || context.asksCaseStatus || context.asksMissing || context.asksShow || context.asksEdit || context.asksDelete || context.asksLeadList || context.asksOwnerList || context.asksPropertyList || context.businessReadIntent || helpers.isBulkPropertyOnboardingQuestion(context.normalized) || helpers.isImobRecentRegistrationReadRequest(context.normalized))) {
    return null;
  }

  return (
    await resolveImobCaseOperationalConsult(params, helpers, context)
    ?? await resolveImobLeadOperationalConsult(params, helpers, context)
    ?? await resolveImobOwnerOperationalConsult(params, helpers, context)
    ?? await resolveImobPropertyOperationalConsult(params, helpers, context)
    ?? null
  );
}
