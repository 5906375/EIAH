import type {
  ImobCaseActionId,
  ImobCaseContextV1,
  ImobCrmCaseCardV1,
  ImobCrmCaseProjectionV1,
  ImobCrmQueueItemV1,
} from "../crm/imobCaseContextContract";
import type { ImobNextAction, ImobOperation } from "./imobMissionTypes";
import { resolveImobOperationRoute } from "./imobOperationRouter";

function mapActionIdToOperation(action?: ImobCaseActionId | null): ImobOperation {
  switch (action) {
    case "owner.create":
      return "owner";
    case "property.create":
    case "property.link_owner":
    case "rules.configure":
      return "property";
    case "lead.qualify":
    case "proposal.create":
      return "lead";
    case "visit.schedule":
      return "visit";
    case "documents.collect":
      return "documents";
    case "contract.prepare":
      return "contract";
    case "commission.settle":
      return "commission";
    case "case.review":
    default:
      return "case";
  }
}

function deriveNextActionFromRecovery(context: ImobCaseContextV1): ImobNextAction | null {
  const primaryAction = context.recoverySnapshot?.primaryAction;
  if (!primaryAction) return null;
  const operation = mapActionIdToOperation(primaryAction.operation);
  const route = resolveImobOperationRoute(
    operation,
    context.legacyCompatibility?.sourceFlow ?? null,
  );

  return {
    id: primaryAction.id,
    label: primaryAction.label,
    operation,
    targetAgent: route.dispatchedAgentId,
    reasonCode: primaryAction.reasonCode ?? "RECOVERY_PRIMARY_ACTION",
  };
}

function buildQueues(params: {
  caseId: string;
  targetAgentId?: string;
  proofStatus: ImobCrmCaseCardV1["proofStatus"];
  blockers: ImobCrmCaseCardV1["blockers"];
  nextAction: ImobCrmCaseCardV1["nextAction"];
  sourceFlow?: string | null;
}): ImobCrmQueueItemV1[] {
  const queues: ImobCrmQueueItemV1[] = [];

  if (params.targetAgentId === "IMOB_DedupeAgent" || params.sourceFlow === "owner.dedupe_review") {
    queues.push({
      queueId: "dedupe_queue",
      caseId: params.caseId,
      reasonCode: "DEDUPE_REVIEW_PENDING",
      summary: "Caso aguardando revisão governada de dedupe.",
    });
  }

  if (params.proofStatus === "missing") {
    queues.push({
      queueId: "proof_queue",
      caseId: params.caseId,
      reasonCode: "MISSING_REQUIRED_PROOF",
      summary: "Caso com proof obrigatória pendente.",
    });
  }

  if (!params.nextAction) {
    queues.push({
      queueId: "next_action_queue",
      caseId: params.caseId,
      reasonCode: "NEXT_ACTION_UNRESOLVED",
      summary: "Caso sem próxima ação canônica resolvida.",
    });
  }

  if (params.blockers.length > 0) {
    queues.push({
      queueId: "blocker_queue",
      caseId: params.caseId,
      reasonCode: params.blockers[0]?.code ?? "CASE_BLOCKED",
      summary: params.blockers[0]?.message ?? "Caso com blockers ativos.",
    });
  }

  return queues;
}

export function buildImobCrmCaseProjection(context: ImobCaseContextV1): ImobCrmCaseProjectionV1 {
  const canonical = context.canonicalCaseState;
  const mission = canonical?.mission ?? "case_review";
  const missionStatus = canonical?.missionStatus ?? "draft";
  const currentOperation = canonical?.currentOperation
    ?? (context.recoverySnapshot?.primaryAction ? mapActionIdToOperation(context.recoverySnapshot.primaryAction.operation) : "case");
  const route = resolveImobOperationRoute(currentOperation, context.legacyCompatibility?.sourceFlow ?? null);
  const nextAction = canonical?.nextAction ?? deriveNextActionFromRecovery(context);
  const proofStatus: ImobCrmCaseCardV1["proofStatus"] = !canonical?.proof.required
    ? "not_required"
    : canonical.proof.minimumProofSatisfied
      ? "satisfied"
      : "missing";
  const blockers = canonical?.blockers ?? context.blockers.map((item) => ({
    code: item.code,
    message: item.message,
  }));

  const caseCard: ImobCrmCaseCardV1 = {
    tenantId: context.tenantId,
    workspaceId: context.workspaceId,
    caseId: context.caseId,
    mission,
    missionStatus,
    currentOperation,
    ownerAgent: "IMOB_Orchestrator",
    targetAgent: route.dispatchedAgentId,
    readiness: canonical?.readiness ?? {
      owner: context.readiness.ownerReady ? "ready" : "incomplete",
      property: context.readiness.propertyReady ? "ready" : "incomplete",
      documents: context.readiness.documentsReady ? "ready" : "incomplete",
      proof: canonical?.proof.required ? (proofStatus === "satisfied" ? "ready" : "blocked") : "not_applicable",
    },
    blockers,
    nextAction,
    proofStatus,
    lastActivityAt: canonical?.audit.lastUpdatedAt ?? new Date().toISOString(),
  };

  return {
    version: "1.0",
    caseCard,
    queues: buildQueues({
      caseId: context.caseId,
      targetAgentId: route.dispatchedAgentId,
      proofStatus,
      blockers: caseCard.blockers,
      nextAction: caseCard.nextAction,
      sourceFlow: context.legacyCompatibility?.sourceFlow ?? null,
    }),
    derivedFrom: "canonical_case_state",
  };
}
