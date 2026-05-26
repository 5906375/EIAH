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

function isCaptureMission(mission: ImobCaseMission) {
  return (
    mission === "capture_seasonal_property"
    || mission === "capture_rental_property"
    || mission === "capture_sale_property"
  );
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
      label: nextAction.reasonCode === "DEDUPE_REVIEW_PENDING" ? "Revisar dedupe" : "Cadastrar proprietário",
      nextMessage: nextAction.reasonCode === "DEDUPE_REVIEW_PENDING" ? "revisar dedupe deste caso" : "cadastrar proprietário",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "property") {
    const isLinking = nextAction.reasonCode === "OWNER_PROPERTY_LINK_REQUIRED";
    const isMarketScanCapture = nextAction.reasonCode === "MARKET_SCAN_CAPTURE_RECOMMENDED";
    return action({
      operation: isLinking ? "property.link_owner" : "property.create",
      label: isLinking ? "Concluir vínculo" : isMarketScanCapture ? "Seguir com captação" : "Cadastrar imóvel",
      nextMessage: isLinking
        ? "concluir vínculo proprietário-imóvel"
        : isMarketScanCapture
          ? "confirmar captação do scan"
          : "cadastrar imóvel",
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

    if (
      nextAction.reasonCode === "PROPOSAL_REQUIRED"
      || nextAction.reasonCode === "PROPOSAL_DATA_REQUIRED"
      || nextAction.reasonCode === "PROPOSAL_REVIEW_REQUIRED"
    ) {
      return action({
        operation: "proposal.create",
        label:
          nextAction.reasonCode === "PROPOSAL_REVIEW_REQUIRED"
            ? "Revisar proposta"
            : nextAction.reasonCode === "PROPOSAL_DATA_REQUIRED"
              ? "Completar proposta"
              : "Preparar proposta",
        nextMessage:
          nextAction.reasonCode === "PROPOSAL_REVIEW_REQUIRED"
            ? "revisar proposta deste caso"
            : nextAction.reasonCode === "PROPOSAL_DATA_REQUIRED"
              ? "completar proposta deste caso"
              : "preparar proposta deste caso",
        reasonCode: nextAction.reasonCode,
      });
    }

    if (nextAction.reasonCode === "VISIT_FOLLOW_UP_REQUIRED") {
      return action({
        operation: "lead.qualify",
        label: "Retomar pós-visita",
        nextMessage: "retomar follow-up pós-visita deste caso",
        reasonCode: nextAction.reasonCode,
      });
    }

    if (nextAction.reasonCode === "VISIT_REENGAGEMENT_REQUIRED") {
      return action({
        operation: "lead.qualify",
        label: "Reengajar lead após visita",
        nextMessage: "reengajar lead após a visita deste caso",
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
      label: nextAction.reasonCode === "MARKET_SCAN_DOCUMENT_REQUIRED"
        ? "Pedir documentação"
        : nextAction.reasonCode === "DOCUMENT_CHECKLIST_REQUIRED"
          ? (
            context.documentChecklist?.operation === "venda"
              ? "Completar checklist documental de venda"
              : context.documentChecklist?.operation === "locacao"
                ? "Completar checklist documental de locação"
                : context.documentChecklist?.operation === "temporada"
                  ? "Completar checklist documental de temporada"
                  : "Revisar documentos"
          )
          : "Revisar documentos",
      nextMessage: nextAction.reasonCode === "MARKET_SCAN_DOCUMENT_REQUIRED"
        ? "pedir documentação deste caso"
        : nextAction.reasonCode === "DOCUMENT_CHECKLIST_REQUIRED"
          ? "revisar checklist documental deste caso"
        : "revisar documentos deste caso",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "visit") {
    return action({
      operation: "visit.schedule",
      label: nextAction.reasonCode === "VISIT_REQUIRED"
        ? "Avançar para visita"
        : nextAction.reasonCode === "VISIT_RESCHEDULE_REQUIRED"
          ? "Remarcar visita"
        : nextAction.reasonCode === "VISIT_CANCELLATION_REVIEW_REQUIRED"
            ? "Confirmar cancelamento da visita"
            : nextAction.reasonCode === "VISIT_OUTCOME_REQUIRED"
              ? "Registrar resultado da visita"
            : "Confirmar agenda da visita",
      nextMessage: nextAction.reasonCode === "VISIT_REQUIRED"
        ? "vamos avançar para visita"
        : nextAction.reasonCode === "VISIT_RESCHEDULE_REQUIRED"
          ? "remarcar visita deste caso"
          : nextAction.reasonCode === "VISIT_CANCELLATION_REVIEW_REQUIRED"
            ? "confirmar cancelamento da visita deste caso"
            : nextAction.reasonCode === "VISIT_OUTCOME_REQUIRED"
              ? "registrar resultado da visita deste caso"
            : "confirmar agenda da visita deste caso",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "contract") {
    return action({
      operation: "contract.prepare",
      label: nextAction.reasonCode === "LEGAL_HANDOFF_REQUIRED" ? "Encaminhar para jurídico" : "Preparar contrato",
      nextMessage: nextAction.reasonCode === "LEGAL_HANDOFF_REQUIRED"
        ? "encaminhar contrato deste caso para o jurídico"
        : "preparar contrato deste caso",
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
      label: nextAction.reasonCode === "MARKET_SCAN_COMMERCIAL_ACTIVATION_RECOMMENDED"
        ? "Preparar campanha do scan"
        : "Preparar ativação comercial",
      nextMessage: nextAction.reasonCode === "MARKET_SCAN_COMMERCIAL_ACTIVATION_RECOMMENDED"
        ? "preparar campanha deste scan"
        : "preparar ativação comercial deste caso",
      reasonCode: nextAction.reasonCode,
    });
  }

  if (nextAction.operation === "case") {
    if (nextAction.reasonCode === "MARKET_SCAN_PRICE_REVIEW_REQUIRED") {
      return action({
        operation: "case.review",
        label: "Revisar estratégia de preço",
        nextMessage: context.caseId ? `consultar caso ${context.caseId}` : "consultar caso",
        reasonCode: nextAction.reasonCode,
      });
    }

    if (nextAction.reasonCode === "MARKET_SCAN_HUMAN_AUTHORIZATION_REQUIRED") {
      return action({
        operation: "case.review",
        label: "Pedir autorização",
        nextMessage: context.caseId ? `consultar caso ${context.caseId}` : "consultar caso",
        reasonCode: nextAction.reasonCode,
      });
    }

    if (nextAction.reasonCode === "MARKET_SCAN_DO_NOT_PROCEED") {
      return action({
        operation: "case.review",
        label: "Revisar decisão do scan",
        nextMessage: context.caseId ? `consultar caso ${context.caseId}` : "consultar caso",
        reasonCode: nextAction.reasonCode,
      });
    }
  }

  return fallbackCaseReview;
}

function buildMissingItems(context: ImobCaseContextV1) {
  const canonicalItems = context.canonicalCaseState?.pendingFields?.map((item) => item.label ?? item.field) ?? [];
  const evidenceItems = context.evidence?.status === "missing"
    ? [
        context.evidence.missingProof.length > 0
          ? `proof mínima pendente (${context.evidence.missingProof.join(", ")})`
          : "proof mínima pendente",
      ]
    : [];
  const dedupeItems = context.dedupe?.status === "pending_review"
    ? [`revisão de dedupe de ${context.dedupe.entity}`]
    : [];
  const marketScanMissingItems = isCaptureMission(context.missionContext?.mission ?? "case_review") && context.marketScanRecommendation
    ? (() => {
        switch (context.marketScanRecommendation.recommendedAction) {
          case "pedir_documento":
            return ["documentação ou evidência adicional do scan"];
          case "pedir_autorizacao":
            return ["autorização ou fonte adicional para seguir com o scan"];
          case "ajustar_preco":
            return ["revisão da estratégia de preço antes de captar"];
          case "campanha":
            return ["preparação da campanha comercial recomendada pelo scan"];
          case "nao_seguir":
            return ["revisão humana da recomendação de não seguir agora"];
          case "captar":
          default:
            return [];
        }
      })()
    : [];
  const visitMissingItems = context.missionContext?.mission === "schedule_visit" && context.visitScheduling
    ? (() => {
        if (context.visitScheduling.status === "cancel_requested") return ["confirmação do cancelamento da visita"];
        if (context.visitScheduling.status === "awaiting_reschedule") return ["remarcação da visita"];
        if (context.visitScheduling.status === "pending_confirmation") return ["confirmação da agenda da visita"];
        if (context.visitOutcome?.status === "pending_result") return ["resultado da visita"];
        if (context.visitOutcome?.status === "follow_up_required") return ["follow-up pós-visita"];
        if (context.visitOutcome?.status === "reengagement_required") return ["reengajamento comercial pós-visita"];
        return [];
      })()
    : [];
  const commercialFollowUpItems = context.commercialFollowUp
    ? [
        context.commercialFollowUp.status === "follow_up_required"
          ? "follow-up comercial pendente"
          : context.commercialFollowUp.status === "reengagement_required"
            ? "reengajamento comercial pendente"
            : "resposta comercial pendente",
      ]
    : [];
  const blockerItems = context.blockers
    .filter((item) => item.severity === "blocking" || item.severity === "warning")
    .filter((item) => !item.code.startsWith("market_scan_"))
    .map((item) => item.message);
  return [...new Set([...canonicalItems, ...evidenceItems, ...dedupeItems, ...marketScanMissingItems, ...visitMissingItems, ...commercialFollowUpItems, ...blockerItems])];
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
  const commercialFollowUpSummary = params.context.commercialFollowUp?.summary ?? null;
  const leadLifecycleSummary = params.context.missionContext?.mission === "qualify_lead" && !commercialFollowUpSummary
    ? params.context.leadLifecycle?.summary
    : null;
  const marketScanSummary = isCaptureMission(params.context.missionContext?.mission ?? "case_review")
    ? params.context.marketScanRecommendation?.summary
    : null;
  const documentChecklistSummary = (
    params.context.missionContext?.mission === "collect_documents"
    || params.context.missionContext?.mission === "prepare_contract"
  )
    ? params.context.documentChecklist?.summary
    : null;
  const visitSchedulingSummary = params.context.missionContext?.mission === "schedule_visit"
    ? params.context.visitScheduling?.summary
    : null;
  const visitOutcomeSummary = params.context.missionContext?.mission === "schedule_visit" && !commercialFollowUpSummary
    ? params.context.visitOutcome?.summary
    : null;
  const documentSufficiencySummary = params.context.missionContext?.mission === "prepare_contract"
    ? params.context.documentSufficiency?.summary
    : null;
  const evidenceSummary = params.context.evidence?.summary ?? null;
  const dedupeSummary = params.context.dedupe?.status === "pending_review"
    ? params.context.dedupe.summary
    : null;
  const leadContextSuffix = [leadMatchingSummary, leadLifecycleSummary, commercialFollowUpSummary].filter(Boolean).join(" ");
  const leadContextSentence = leadContextSuffix ? ` ${leadContextSuffix}` : "";
  const evidenceSentence = evidenceSummary ? ` ${evidenceSummary}` : "";
  const dedupeSentence = dedupeSummary ? ` ${dedupeSummary}` : "";
  const marketScanSentence = marketScanSummary ? ` ${marketScanSummary}` : "";
  const visitSchedulingSentence = visitSchedulingSummary ? ` ${visitSchedulingSummary}` : "";
  const visitOutcomeSentence = visitOutcomeSummary ? ` ${visitOutcomeSummary}` : "";
  const documentChecklistSentence = documentChecklistSummary ? ` ${documentChecklistSummary}` : "";
  const documentSufficiencySentence = documentSufficiencySummary ? ` ${documentSufficiencySummary}` : "";

  if (params.intent === "what_is_missing") {
    return {
      version: "1.0",
      intent: params.intent,
      title: "Pendências do caso",
      summary: snapshot.missingItems.length > 0
        ? `Ainda faltam ${snapshot.missingItems.join(" • ")}.${leadContextSentence}${evidenceSentence}${dedupeSentence}${marketScanSentence}${visitSchedulingSentence}${visitOutcomeSentence}${documentChecklistSentence}${documentSufficiencySentence}`
        : `Não há pendências explícitas; posso seguir pelo próximo passo principal.${leadContextSentence}${evidenceSentence}${dedupeSentence}${marketScanSentence}${visitSchedulingSentence}${visitOutcomeSentence}${documentChecklistSentence}${documentSufficiencySentence}`,
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
        ? `O próximo passo seguro é ${snapshot.primaryAction.label.toLowerCase()}.${leadContextSentence}${evidenceSentence}${dedupeSentence}${marketScanSentence}${visitSchedulingSentence}${visitOutcomeSentence}${documentChecklistSentence}${documentSufficiencySentence}`
        : `O próximo passo não está explícito; posso abrir o caso para recompor o estado.${leadContextSentence}${evidenceSentence}${dedupeSentence}${marketScanSentence}${visitSchedulingSentence}${visitOutcomeSentence}${documentChecklistSentence}${documentSufficiencySentence}`,
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
        ? `Vamos retomar a partir de ${snapshot.primaryAction.label.toLowerCase()}.${leadContextSentence}${evidenceSentence}${dedupeSentence}${marketScanSentence}${visitSchedulingSentence}${visitOutcomeSentence}${documentChecklistSentence}${documentSufficiencySentence}`
        : `Posso retomar o caso abrindo o resumo operacional mais recente.${leadContextSentence}${evidenceSentence}${dedupeSentence}${marketScanSentence}${visitSchedulingSentence}${visitOutcomeSentence}${documentChecklistSentence}${documentSufficiencySentence}`,
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
      ? `Caso em ${snapshot.stage} com bloqueios ativos e próxima ação já resolvida.${leadContextSentence}${evidenceSentence}${dedupeSentence}${marketScanSentence}${visitSchedulingSentence}${visitOutcomeSentence}${documentChecklistSentence}${documentSufficiencySentence}`
      : `Caso em ${snapshot.stage} com próxima ação já resolvida.${leadContextSentence}${evidenceSentence}${dedupeSentence}${marketScanSentence}${visitSchedulingSentence}${visitOutcomeSentence}${documentChecklistSentence}${documentSufficiencySentence}`,
    blockers: snapshot.blockers,
    missingItems: snapshot.missingItems,
    primaryAction: snapshot.primaryAction,
    secondaryActions: snapshot.secondaryActions,
    safeFallbackAction: snapshot.safeFallbackAction,
    reasonCode: "RECOVERY_CASE_SUMMARY_READY",
  };
}
