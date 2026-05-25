import type {
  ImobCaseActionId,
  ImobCaseContextV1,
  ImobCaseMission,
  ImobCasePlanActionV1,
  ImobCaseRecoverySnapshotV1,
  ImobCaseStage,
  ImobRecoveryIntentV1,
  ImobRecoveryResponseV1,
} from "../crm/imobCaseContextContract";

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

function normalizeMessage(value?: string | null) {
  return (value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function inferStageFromMission(mission: ImobCaseMission, context: ImobCaseContextV1): ImobCaseStage {
  switch (mission) {
    case "qualify_lead":
      return "lead_matching";
    case "schedule_visit":
      return "visit_scheduling";
    case "collect_documents":
      return "documents_collecting";
    case "prepare_contract":
      return "contract_preparing";
    case "settle_commission":
      return "commission_review";
    case "commercial_activation":
      return "campaign_preparing";
    case "capture_seasonal_property":
    case "capture_rental_property":
    case "capture_sale_property":
      return context.blockers.some((item) => item.severity === "blocking") ? "blocked" : "intake";
    case "case_review":
      return context.blockers.some((item) => item.severity === "blocking") ? "blocked" : "intake";
  }
}

function buildSafeFallbackAction(caseId: string): ImobCasePlanActionV1 {
  return action({
    operation: "case.review",
    label: "Consultar caso",
    nextMessage: caseId ? `consultar caso ${caseId}` : "consultar caso",
    kind: "neutral",
    reasonCode: "case_review_available",
  });
}

function mapCanonicalNextActionToPlanAction(context: ImobCaseContextV1): ImobCasePlanActionV1 | null {
  const canonical = context.canonicalCaseState;
  if (!canonical?.nextAction) return null;

  const nextAction = canonical.nextAction;
  const fallbackCaseReview = buildSafeFallbackAction(context.caseId);

  if (nextAction.operation === "owner") {
    return action({
      operation: "owner.create",
      label: "Cadastrar proprietário",
      nextMessage: "cadastrar proprietário",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "property") {
    const isLinking = nextAction.reasonCode === "OWNER_PROPERTY_LINK_REQUIRED";
    return action({
      operation: isLinking ? "property.link_owner" : "property.create",
      label: isLinking ? "Concluir vínculo" : "Cadastrar imóvel",
      nextMessage: isLinking ? "concluir vínculo proprietário-imóvel" : "cadastrar imóvel",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "lead") {
    if (nextAction.reasonCode === "LEAD_REENGAGEMENT_REQUIRED") {
      return action({
        operation: "lead.qualify",
        label: "Retomar lead",
        nextMessage: "retomar lead deste caso",
        reasonCode: nextAction.reasonCode,
      });
    }

    if (nextAction.reasonCode === "LEAD_DISQUALIFIED") {
      return action({
        operation: "lead.qualify",
        label: "Revisar desqualificação do lead",
        nextMessage: "revisar desqualificação deste lead",
        reasonCode: nextAction.reasonCode,
      });
    }

    if (nextAction.reasonCode === "LEAD_PROPERTY_MATCH_PENDING") {
      return action({
        operation: "lead.qualify",
        label: "Buscar imóvel compatível",
        nextMessage: "buscar imóvel compatível para este lead",
        reasonCode: nextAction.reasonCode,
      });
    }

    if (nextAction.reasonCode === "LEAD_PROPERTY_MATCH_REVIEW_REQUIRED") {
      return action({
        operation: "lead.qualify",
        label: "Refinar critérios do lead",
        nextMessage: "refinar critérios deste lead",
        reasonCode: nextAction.reasonCode,
      });
    }

    if (nextAction.reasonCode === "PROPOSAL_REQUIRED" || nextAction.reasonCode === "PROPOSAL_REVIEW_REQUIRED") {
      return action({
        operation: "proposal.create",
        label: nextAction.reasonCode === "PROPOSAL_REVIEW_REQUIRED" ? "Revisar proposta" : "Preparar proposta",
        nextMessage: nextAction.reasonCode === "PROPOSAL_REVIEW_REQUIRED" ? "revisar proposta deste caso" : "preparar proposta deste caso",
        reasonCode: nextAction.reasonCode,
      });
    }

    return action({
      operation: "lead.qualify",
      label: "Retomar lead",
      nextMessage: "retomar qualificação do lead",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "documents") {
    return action({
      operation: "documents.collect",
      label: "Revisar documentos",
      nextMessage: "revisar documentos deste caso",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "visit") {
    return action({
      operation: "visit.schedule",
      label: nextAction.reasonCode === "VISIT_REQUIRED" ? "Avançar para visita" : "Agendar visita",
      nextMessage: nextAction.reasonCode === "VISIT_REQUIRED" ? "vamos avançar para visita" : "agendar visita deste caso",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "contract") {
    return action({
      operation: "contract.prepare",
      label: "Preparar contrato",
      nextMessage: "preparar contrato deste caso",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "commission") {
    return action({
      operation: "commission.settle",
      label: "Revisar comissão",
      nextMessage: "revisar comissão deste caso",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "campaign") {
    return action({
      operation: "listing.activate",
      label: "Preparar ativação comercial",
      nextMessage: "preparar ativação comercial deste caso",
      reasonCode: nextAction.reasonCode,
    });
  }

  return fallbackCaseReview;
}

function buildMissingItems(context: ImobCaseContextV1) {
  const canonicalItems = context.canonicalCaseState?.pendingFields?.map((item) => item.label ?? item.field) ?? [];
  const blockerItems = context.blockers
    .filter((item) => item.severity === "blocking" || item.severity === "warning")
    .map((item) => item.message);
  return [...new Set([...canonicalItems, ...blockerItems])];
}

function buildSecondaryActions(params: {
  primaryAction: ImobCasePlanActionV1 | null;
  fallbackAction: ImobCasePlanActionV1;
}): ImobCasePlanActionV1[] {
  const actions: ImobCasePlanActionV1[] = [];
  if (!params.primaryAction || params.primaryAction.operation !== params.fallbackAction.operation) {
    actions.push(params.fallbackAction);
  }
  return actions;
}

export function matchImobRecoveryIntent(message?: string | null): ImobRecoveryIntentV1 | null {
  const normalized = normalizeMessage(message);
  if (!normalized) return null;

  if (normalized.includes("consultar caso")) return "consult_case";
  if (normalized.includes("o que falta") || normalized.includes("pendencia") || normalized.includes("pendencias")) return "what_is_missing";
  if (normalized.includes("proximo passo") || normalized.includes("qual proximo passo")) return "next_step";
  if (normalized.includes("retomar") || normalized.includes("continuar de onde paramos")) return "resume_case";
  return null;
}

export function resolveImobRecoverySnapshot(context: ImobCaseContextV1): ImobCaseRecoverySnapshotV1 {
  const mission = context.missionContext?.mission ?? "case_review";
  const fallbackAction = buildSafeFallbackAction(context.caseId);
  const primaryAction = mapCanonicalNextActionToPlanAction(context) ?? fallbackAction;
  const missingItems = buildMissingItems(context);
  const secondaryActions = buildSecondaryActions({
    primaryAction,
    fallbackAction,
  });
  const hasBlocking = context.blockers.some((item) => item.severity === "blocking");
  const reasonCode = hasBlocking
    ? "RECOVERY_BLOCKED"
    : missingItems.length > 0
      ? "RECOVERY_MISSING_ITEMS"
      : primaryAction
        ? "RECOVERY_READY"
        : "RECOVERY_NEXT_STEP_UNRESOLVED";

  return {
    version: "1.0",
    mission,
    stage: inferStageFromMission(mission, context),
    blockers: context.blockers,
    missingItems,
    primaryAction,
    secondaryActions,
    supportedIntents: ["consult_case", "resume_case", "what_is_missing", "next_step"],
    safeFallbackAction: fallbackAction,
    reasonCode,
  };
}

export function resolveImobRecoveryResponse(params: {
  context: ImobCaseContextV1;
  intent: ImobRecoveryIntentV1;
}): ImobRecoveryResponseV1 {
  const snapshot = params.context.recoverySnapshot ?? resolveImobRecoverySnapshot(params.context);
  const leadMatchingSummary = params.context.missionContext?.mission === "qualify_lead"
    ? params.context.leadMatching?.summary
    : null;
  const leadLifecycleSummary = params.context.missionContext?.mission === "qualify_lead"
    ? params.context.leadLifecycle?.summary
    : null;
  const leadContextSuffix = [leadMatchingSummary, leadLifecycleSummary].filter(Boolean).join(" ");
  const leadContextSentence = leadContextSuffix ? ` ${leadContextSuffix}` : "";

  if (params.intent === "what_is_missing") {
    return {
      version: "1.0",
      intent: params.intent,
      title: "Pendências do caso",
      summary: snapshot.missingItems.length > 0
        ? `Ainda faltam ${snapshot.missingItems.join(" • ")}.${leadContextSentence}`
        : `Não há pendências explícitas; posso seguir pelo próximo passo principal.${leadContextSentence}`,
      blockers: snapshot.blockers,
      missingItems: snapshot.missingItems,
      primaryAction: snapshot.primaryAction,
      secondaryActions: snapshot.secondaryActions,
      safeFallbackAction: snapshot.safeFallbackAction,
      reasonCode: "RECOVERY_MISSING_ITEMS_READY",
    };
  }

  if (params.intent === "next_step") {
    return {
      version: "1.0",
      intent: params.intent,
      title: "Próximo passo",
      summary: snapshot.primaryAction
        ? `O próximo passo seguro é ${snapshot.primaryAction.label.toLowerCase()}.${leadContextSentence}`
        : `O próximo passo não está explícito; posso abrir o caso para recompor o estado.${leadContextSentence}`,
      blockers: snapshot.blockers,
      missingItems: snapshot.missingItems,
      primaryAction: snapshot.primaryAction,
      secondaryActions: snapshot.secondaryActions,
      safeFallbackAction: snapshot.safeFallbackAction,
      reasonCode: "RECOVERY_NEXT_STEP_READY",
    };
  }

  if (params.intent === "resume_case") {
    return {
      version: "1.0",
      intent: params.intent,
      title: "Retomada do caso",
      summary: snapshot.primaryAction
        ? `Vamos retomar a partir de ${snapshot.primaryAction.label.toLowerCase()}.${leadContextSentence}`
        : `Posso retomar o caso abrindo o resumo operacional mais recente.${leadContextSentence}`,
      blockers: snapshot.blockers,
      missingItems: snapshot.missingItems,
      primaryAction: snapshot.primaryAction,
      secondaryActions: snapshot.secondaryActions,
      safeFallbackAction: snapshot.safeFallbackAction,
      reasonCode: "RECOVERY_RESUME_READY",
    };
  }

  return {
    version: "1.0",
    intent: params.intent,
    title: "Resumo do caso",
    summary: snapshot.blockers.length > 0
      ? `Caso em ${snapshot.stage} com bloqueios ativos e próxima ação já resolvida.${leadContextSentence}`
      : `Caso em ${snapshot.stage} com próxima ação já resolvida.${leadContextSentence}`,
    blockers: snapshot.blockers,
    missingItems: snapshot.missingItems,
    primaryAction: snapshot.primaryAction,
    secondaryActions: snapshot.secondaryActions,
    safeFallbackAction: snapshot.safeFallbackAction,
    reasonCode: "RECOVERY_CASE_SUMMARY_READY",
  };
}
