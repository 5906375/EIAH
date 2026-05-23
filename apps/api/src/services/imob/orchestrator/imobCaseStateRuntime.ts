import type {
  CaseStateUpdateCommand,
  CaseStateUpdateResult,
  ImobCaseState,
} from "./imobMissionTypes";

function missingScopeReason(command: Pick<CaseStateUpdateCommand, "tenantId" | "workspaceId" | "caseId">) {
  if (!command.tenantId) return "MISSING_TENANT_ID" as const;
  if (!command.workspaceId) return "MISSING_WORKSPACE_ID" as const;
  if (!command.caseId) return "MISSING_CASE_ID" as const;
  return null;
}

export function applyCaseStateUpdate(
  current: ImobCaseState,
  command: CaseStateUpdateCommand,
): CaseStateUpdateResult {
  const scopeReason = missingScopeReason(command);
  if (scopeReason) return { ok: false, reasonCode: scopeReason, latestState: current };

  if (
    command.tenantId !== current.tenantId
    || command.workspaceId !== current.workspaceId
    || command.caseId !== current.caseId
  ) {
    return { ok: false, reasonCode: "CASE_STATE_INCONSISTENT", latestState: current };
  }

  if (current.audit.version !== command.expectedVersion) {
    return { ok: false, reasonCode: "CASE_VERSION_CONFLICT", latestState: current };
  }

  const next: ImobCaseState = {
    ...current,
    ...command.patch,
    audit: {
      version: current.audit.version + 1,
      lastRunId: command.runId,
      lastUpdatedAt: new Date().toISOString(),
      updatedByAgent: command.updatedByAgent,
    },
  };

  return { ok: true, state: next, newVersion: next.audit.version };
}
