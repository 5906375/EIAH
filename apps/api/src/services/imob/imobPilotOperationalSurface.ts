import type { ImobCrmCaseContext } from "./crm/imobCrmAgentContract";
import type { ImobEvidenceRef, ImobPilotOperationalSnapshot } from "./imobConversationContract";
import type { ImobPilotApprovalEntry } from "./imobPilotApprovalRuntime";
import type { ImobPilotRolloutStateEntry } from "./imobPilotRolloutState";

export type ImobPilotOperationalLatestFlow = {
  flowRunId?: string | null;
  trackingId?: string | null;
  evidenceRefs?: ImobEvidenceRef[] | null;
  nextHumanAction?: string | null;
};

function mergeEvidenceRefs(...buckets: Array<ImobEvidenceRef[] | null | undefined>) {
  const seen = new Set<string>();
  const merged: ImobEvidenceRef[] = [];
  for (const bucket of buckets) {
    for (const item of bucket ?? []) {
      const key = `${item.kind}:${item.ref}:${String(item.value ?? "")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export function buildImobPilotOperationalSurface(params: {
  caseContext: ImobCrmCaseContext;
  approvalEntry?: ImobPilotApprovalEntry | null;
  rolloutEntry?: ImobPilotRolloutStateEntry | null;
  latestPilotFlow?: ImobPilotOperationalLatestFlow | null;
  generatedAt?: string | null;
}) {
  const flow = String(params.caseContext?.flow ?? "");
  if (flow !== "visit.schedule") return undefined;

  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const approval = params.approvalEntry ?? null;
  const rollout = params.rolloutEntry ?? null;
  const latestPilotFlow = params.latestPilotFlow ?? null;
  const evidenceRefs = mergeEvidenceRefs(
    approval?.evidenceRefs,
    rollout?.lastEvidenceRefs,
    latestPilotFlow?.evidenceRefs,
  );

  if (!approval) {
    return {
      activePilotFlow: "assisted_calendar_flow",
      flowRunId: null,
      rolloutStage: "shadow",
      approvalRef: null,
      approvalDecision: null,
      trackingId: null,
      evidenceRefs: [],
      status: "approval_required",
      nextHumanAction: "registrar approval operacional auditável antes de iniciar o piloto de agenda",
      canRegressToShadow: false,
      visibleAgentId: "IMOB",
      generatedAt,
    } satisfies ImobPilotOperationalSnapshot;
  }

  if (approval.decision === "rejected") {
    return {
      activePilotFlow: "assisted_calendar_flow",
      flowRunId: latestPilotFlow?.flowRunId ?? null,
      rolloutStage: rollout?.currentStage ?? "shadow",
      approvalRef: approval.approvalId,
      approvalDecision: "rejected",
      trackingId: latestPilotFlow?.trackingId ?? null,
      evidenceRefs,
      status: rollout?.currentStage === "pilot" ? "blocked" : "shadow",
      nextHumanAction: "revisar a rejeição auditável e coletar nova evidência antes de reabrir o piloto",
      canRegressToShadow: false,
      visibleAgentId: approval.visibleAgentId,
      generatedAt,
    } satisfies ImobPilotOperationalSnapshot;
  }

  if (!rollout || rollout.currentStage !== "pilot") {
    return {
      activePilotFlow: "assisted_calendar_flow",
      flowRunId: latestPilotFlow?.flowRunId ?? null,
      rolloutStage: rollout?.currentStage ?? "shadow",
      approvalRef: approval.approvalId,
      approvalDecision: "approved",
      trackingId: null,
      evidenceRefs,
      status: "inactive",
      nextHumanAction: "iniciar o piloto controlado a partir do runtime operacional explícito",
      canRegressToShadow: false,
      visibleAgentId: approval.visibleAgentId,
      generatedAt,
    } satisfies ImobPilotOperationalSnapshot;
  }

  return {
    activePilotFlow: "assisted_calendar_flow",
    flowRunId: latestPilotFlow?.flowRunId ?? null,
    rolloutStage: rollout.currentStage,
    approvalRef: approval.approvalId,
    approvalDecision: "approved",
    trackingId: latestPilotFlow?.trackingId ?? null,
    evidenceRefs,
    status: "pilot_active",
    nextHumanAction: latestPilotFlow?.nextHumanAction ?? "acompanhar tracking existente e validar estabilidade do piloto controlado",
    canRegressToShadow: true,
    visibleAgentId: approval.visibleAgentId,
    generatedAt,
  } satisfies ImobPilotOperationalSnapshot;
}
