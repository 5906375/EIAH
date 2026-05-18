import type {
  ImobCaseActionId,
  ImobCaseContextV1,
  ImobCaseMission,
  ImobCasePlanActionV1,
  ImobCasePlanV1,
  ImobCaseStage,
} from "./imobCaseContextContract";

function action(params: {
  operation: ImobCaseActionId;
  label: string;
  nextMessage: string;
  kind?: "primary" | "secondary" | "neutral";
  reasonCode?: string;
}): ImobCasePlanActionV1 {
  return {
    id: params.operation.replace(/\./g, "-"),
    operation: params.operation,
    label: params.label,
    nextMessage: params.nextMessage,
    kind: params.kind ?? "primary",
    reasonCode: params.reasonCode,
  };
}

function buildResolved(context: ImobCaseContextV1): ImobCasePlanV1["resolved"] {
  return {
    owner: context.readiness.ownerReady,
    property: context.readiness.propertyReady,
    ownerLinkedToProperty: context.links.ownerProperty?.status === "linked",
    lead: Boolean(context.entities.lead?.id || context.entities.lead?.name),
    documents: context.readiness.documentsReady,
    seasonalRules: context.readiness.seasonalRulesReady,
    visit: false,
    proposal: false,
    contract: Boolean(context.entities.contract?.id),
    commission: Boolean(context.entities.commission?.id),
  };
}

function suppressResolvedActions(resolved: ImobCasePlanV1["resolved"]) {
  const suppressed: ImobCaseActionId[] = [];
  if (resolved.owner) suppressed.push("owner.create");
  if (resolved.property) suppressed.push("property.create");
  if (resolved.ownerLinkedToProperty) suppressed.push("property.link_owner");
  if (resolved.documents) suppressed.push("documents.collect");
  if (resolved.seasonalRules) suppressed.push("rules.configure");
  return suppressed;
}

function secondaryForCapture(resolved: ImobCasePlanV1["resolved"]): ImobCasePlanActionV1[] {
  const secondary: ImobCasePlanActionV1[] = [];
  if (resolved.owner && resolved.property) {
    secondary.push(action({
      operation: "documents.collect",
      label: "Revisar documentos",
      nextMessage: "revisar documentos deste caso",
      kind: "secondary",
      reasonCode: "capture_documents_next",
    }));
  }
  secondary.push(action({
    operation: "case.review",
    label: "Consultar caso",
    nextMessage: "consultar caso",
    kind: "neutral",
    reasonCode: "case_review_available",
  }));
  return secondary.slice(0, 2);
}

function planCaptureSeasonalProperty(context: ImobCaseContextV1, resolved: ImobCasePlanV1["resolved"]) {
  let stage: ImobCaseStage = "intake";
  let primaryAction: ImobCasePlanActionV1 | null = null;

  if (!resolved.owner) {
    stage = "owner_collecting";
    primaryAction = action({
      operation: "owner.create",
      label: "Cadastrar proprietário",
      nextMessage: "cadastrar proprietário para imóvel de temporada",
      reasonCode: "owner_missing",
    });
  } else if (!resolved.property) {
    stage = "property_collecting";
    primaryAction = action({
      operation: "property.create",
      label: "Cadastrar imóvel de temporada",
      nextMessage: "cadastrar imóvel de temporada",
      reasonCode: "property_missing",
    });
  } else if (!resolved.ownerLinkedToProperty) {
    stage = "owner_property_linking";
    primaryAction = action({
      operation: "property.link_owner",
      label: "Concluir vínculo",
      nextMessage: "concluir vínculo proprietário-imóvel",
      reasonCode: "owner_property_not_linked",
    });
  } else if (!resolved.documents) {
    stage = "documents_collecting";
    primaryAction = action({
      operation: "documents.collect",
      label: "Revisar documentos",
      nextMessage: "revisar documentos da captação",
      reasonCode: "documents_missing",
    });
  } else if (!resolved.seasonalRules) {
    stage = "seasonal_rules";
    primaryAction = action({
      operation: "rules.configure",
      label: "Configurar regras de temporada",
      nextMessage: "configurar regras de temporada",
      reasonCode: "seasonal_rules_missing",
    });
  } else {
    stage = "done";
  }

  return {
    stage,
    primaryAction,
    secondaryActions: secondaryForCapture(resolved).filter((item) => item.operation !== primaryAction?.operation),
  };
}

function defaultMission(context: ImobCaseContextV1): ImobCaseMission {
  return context.missionContext?.mission ?? "case_review";
}

export function planImobCase(context: ImobCaseContextV1): ImobCasePlanV1 {
  const mission = defaultMission(context);
  const resolved = buildResolved(context);
  const suppressedActions = suppressResolvedActions(resolved);

  if (mission === "capture_seasonal_property") {
    const planned = planCaptureSeasonalProperty(context, resolved);
    return {
      version: "1.0",
      mission,
      stage: planned.stage,
      resolved,
      blockers: context.blockers,
      primaryAction: planned.primaryAction,
      secondaryActions: planned.secondaryActions,
      suppressedActions,
    };
  }

  return {
    version: "1.0",
    mission,
    stage: context.blockers.some((blocker) => blocker.severity === "blocking") ? "blocked" : "intake",
    resolved,
    blockers: context.blockers,
    primaryAction: action({
      operation: "case.review",
      label: "Consultar caso",
      nextMessage: "consultar caso",
      reasonCode: "case_review_available",
    }),
    secondaryActions: [],
    suppressedActions,
  };
}
