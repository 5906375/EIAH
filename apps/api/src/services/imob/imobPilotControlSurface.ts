import type { ImobCrmCaseContext } from "./crm/imobCrmAgentContract";
import type { ImobPilotControlStateSnapshot } from "./imobConversationContract";
import { createImobPilotControlState, runImobPilotControl } from "./imobPilotControlRuntime";

function buildAvailableActions(status: ImobPilotControlStateSnapshot["status"]) {
  switch (status) {
    case "approval_required":
      return [
        { action: "approve" as const, label: "Registrar approval" },
        { action: "read_status" as const, label: "Consultar status" },
      ];
    case "inactive":
      return [
        { action: "start_pilot" as const, label: "Iniciar piloto" },
        { action: "read_status" as const, label: "Consultar status" },
      ];
    case "pilot_active":
      return [
        { action: "read_status" as const, label: "Consultar status" },
        { action: "hold_pilot" as const, label: "Manter em shadow" },
        { action: "regress_to_shadow" as const, label: "Regredir para shadow" },
      ];
    case "shadow":
      return [
        { action: "read_status" as const, label: "Consultar status" },
        { action: "approve" as const, label: "Registrar novo approval" },
      ];
    case "blocked":
      return [
        { action: "read_status" as const, label: "Consultar status" },
        { action: "hold_pilot" as const, label: "Segurar piloto" },
      ];
    case "approval_recorded":
      return [
        { action: "start_pilot" as const, label: "Iniciar piloto" },
        { action: "read_status" as const, label: "Consultar status" },
      ];
  }
}

function buildSummary(status: ImobPilotControlStateSnapshot["status"], nextHumanAction: string) {
  switch (status) {
    case "approval_required":
      return "Piloto de agenda ainda não começou: approval operacional auditável é obrigatório antes do start.";
    case "inactive":
      return "Piloto de agenda aprovado, mas ainda não iniciado operacionalmente.";
    case "pilot_active":
      return "Piloto de agenda ativo em runtime governado, com acompanhamento operacional pelo IMOB.";
    case "shadow":
      return "Piloto de agenda mantido em shadow para observação e nova revisão operacional.";
    case "blocked":
      return `Piloto de agenda bloqueado: ${nextHumanAction}`;
    case "approval_recorded":
      return "Approval do piloto foi registrado e o flow está pronto para start explícito.";
  }
}

export function buildImobPilotControlSurface(params: {
  caseContext: ImobCrmCaseContext;
  generatedAt?: string | null;
}) {
  const flow = String(params.caseContext?.flow ?? "");
  if (flow !== "visit.schedule") return undefined;

  const generatedAt = params.generatedAt ?? new Date().toISOString();
  const state = createImobPilotControlState();
  const result = runImobPilotControl({
    action: "read_status",
    state,
    flowType: "assisted_calendar_flow",
    caseContext: params.caseContext,
    generatedAt,
  });

  return {
    flowType: "assisted_calendar_flow",
    status: result.status,
    rolloutStage: result.rolloutStage,
    approvalRef: result.approvalRef,
    trackingId: result.trackingId,
    jobId: result.jobId,
    summary: buildSummary(result.status, result.nextHumanAction),
    nextHumanAction: result.nextHumanAction,
    availableActions: buildAvailableActions(result.status),
    evidenceRefs: [...result.evidenceRefs],
    visibleAgentId: result.visibleAgentId,
    generatedAt: result.generatedAt,
  } satisfies ImobPilotControlStateSnapshot;
}
