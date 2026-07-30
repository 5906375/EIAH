import type { RegisteredAction } from "@eiah/core";
import { EXECUTION_EVIDENCE_REASON_CODES } from "../services/executionEvidence";

export const MCP_TOOL_CONTRACT_MISSING_REASON_CODE =
  EXECUTION_EVIDENCE_REASON_CODES.missingToolContract;
export const AUDIT_WRITE_FAILED_REASON_CODE =
  EXECUTION_EVIDENCE_REASON_CODES.auditWriteFailed;
export const MCP_RUNTIME_ACTIVE_DENY_REASON_CODES = [
  MCP_TOOL_CONTRACT_MISSING_REASON_CODE,
  "DB_SCOPE_MISSING",
  "DB_MODEL_NOT_ALLOWLISTED",
  "DB_INPUT_INVALID",
] as const;
export type McpRuntimeActiveDenyReasonCode =
  (typeof MCP_RUNTIME_ACTIVE_DENY_REASON_CODES)[number];

export type MissingToolContractBlockedResult = {
  ok: false;
  status: "error";
  reasonCode: typeof MCP_TOOL_CONTRACT_MISSING_REASON_CODE;
  action: string;
  version: string;
};

export class MissingToolContractError extends Error {
  readonly reasonCode = MCP_TOOL_CONTRACT_MISSING_REASON_CODE;

  constructor(readonly result: MissingToolContractBlockedResult) {
    super(`ToolContract missing: ${result.action}@${result.version}`);
    this.name = "MissingToolContractError";
  }
}

export class AuditWriteFailedError extends Error {
  readonly reasonCode = AUDIT_WRITE_FAILED_REASON_CODE;

  constructor(readonly auditError: unknown) {
    super("Critical MCP audit write failed");
    this.name = "AuditWriteFailedError";
  }
}

function normalizeActionName(value: string) {
  return value.trim().toLowerCase();
}

export function resolveDeclaredActionNames(
  declaredActionNames: string[] | undefined,
  canonicalByNormalized: Map<string, string>,
  definitions: Record<string, RegisteredAction>
) {
  return (declaredActionNames ?? [])
    .map((name) => canonicalByNormalized.get(normalizeActionName(name)) ?? name.trim())
    .filter((name): name is string => Boolean(name))
    .filter((name) => Boolean(definitions[name]));
}

export function mergeActionsForExecution(params: {
  configured: Record<string, RegisteredAction>;
  definitions: Record<string, RegisteredAction>;
  dbAllowedCanonical: string[];
  dbAllowedRaw: string[];
  declaredAgentActions?: string[];
}) {
  const { configured, definitions, dbAllowedCanonical, dbAllowedRaw, declaredAgentActions } = params;
  const merged: Record<string, RegisteredAction> = { ...configured };

  for (const actionName of dbAllowedCanonical) {
    const def = definitions[actionName];
    if (def) {
      merged[actionName] = def;
    }
  }

  for (const actionName of declaredAgentActions ?? []) {
    const def = definitions[actionName];
    if (def) {
      merged[actionName] = def;
    }
  }

  for (const rawName of dbAllowedRaw) {
    if (merged[rawName]) continue;
    if (definitions[rawName]) {
      merged[rawName] = definitions[rawName];
      continue;
    }
    merged[rawName] = {
      name: rawName,
      version: "1.0.0",
      description: "Tenant policy allowed action",
      handler: async () => ({ status: "error", error: `Action ${rawName} not registered in core catalog` }),
    };
  }

  return merged;
}

export function resolveLocallyExecutableAction(
  actionName: string,
  catalog: Record<string, RegisteredAction> | undefined,
  toolContract: unknown
) {
  if (!catalog || !toolContract) return null;
  return catalog[actionName] ?? null;
}

export function resolveMissingToolContractFallback(
  actionName: string,
  version: string,
  _effectivePayload: unknown
): MissingToolContractBlockedResult {
  return {
    ok: false,
    status: "error",
    reasonCode: MCP_TOOL_CONTRACT_MISSING_REASON_CODE,
    action: actionName,
    version,
  };
}

export function resolveMissingToolContractDecision(
  toolContract: unknown,
  actionName: string,
  version: string,
  effectivePayload: unknown
) {
  return toolContract
    ? null
    : resolveMissingToolContractFallback(actionName, version, effectivePayload);
}

export function resolveMissingToolContractRunFailure(error: unknown) {
  if (error instanceof AuditWriteFailedError) {
    return {
      status: "error" as const,
      reasonCode: error.reasonCode,
      result: null,
    };
  }
  if (!(error instanceof MissingToolContractError)) return null;
  return {
    status: "error" as const,
    reasonCode: error.reasonCode,
    result: error.result,
  };
}

export function resolveActiveMcpDenyRunFailure(error: unknown) {
  const knownFailure = resolveMissingToolContractRunFailure(error);
  if (knownFailure) return knownFailure;
  if (!error || typeof error !== "object" || !("reasonCode" in error)) {
    return null;
  }

  const reasonCode = (error as { reasonCode?: unknown }).reasonCode;
  if (
    reasonCode !== "DB_SCOPE_MISSING" &&
    reasonCode !== "DB_MODEL_NOT_ALLOWLISTED" &&
    reasonCode !== "DB_INPUT_INVALID"
  ) {
    return null;
  }

  return {
    status: "error" as const,
    reasonCode,
    result: null,
  };
}

export async function recordDbInputInvalidAudit(params: {
  actionName: string;
  version: string;
  runId: string;
  tenantId: string;
  stepId?: string;
  reasonCode: "DB_INPUT_INVALID";
  record: (audit: {
    eventType: "mcp.tool.failed";
    severity: "warn";
    message: string;
    metadata: {
      tool: string;
      version: string;
      stepId?: string;
      reasonCode: "DB_INPUT_INVALID";
    };
  }) => Promise<void>;
  logFailure: (context: {
    err: unknown;
    runId: string;
    tenantId: string;
    action: string;
    version: string;
    reasonCode: typeof AUDIT_WRITE_FAILED_REASON_CODE;
  }) => void;
}) {
  const audit = {
    eventType: "mcp.tool.failed" as const,
    severity: "warn" as const,
    message: `MCP tool failed: ${params.reasonCode}`,
    metadata: {
      tool: params.actionName,
      version: params.version,
      stepId: params.stepId,
      reasonCode: params.reasonCode,
    },
  };

  await recordCriticalMcpAudit({
    runId: params.runId,
    tenantId: params.tenantId,
    action: params.actionName,
    version: params.version,
    record: () => params.record(audit),
    logFailure: params.logFailure,
  });
}

export async function recordCriticalMcpAudit(params: {
  runId: string;
  tenantId: string;
  action: string;
  version: string;
  record: () => Promise<void>;
  logFailure: (context: {
    err: unknown;
    runId: string;
    tenantId: string;
    action: string;
    version: string;
    reasonCode: typeof AUDIT_WRITE_FAILED_REASON_CODE;
  }) => void;
}) {
  try {
    await params.record();
  } catch (err) {
    params.logFailure({
      err,
      runId: params.runId,
      tenantId: params.tenantId,
      action: params.action,
      version: params.version,
      reasonCode: AUDIT_WRITE_FAILED_REASON_CODE,
    });
    throw new AuditWriteFailedError(err);
  }
}

export async function recordMissingToolContractAudit(params: {
  actionName: string;
  version: string;
  runId: string;
  tenantId: string;
  stepId?: string;
  record: (audit: {
    eventType: "mcp.tool.missing_contract";
    severity: "warn";
    message: string;
    metadata: {
      tool: string;
      version: string;
      stepId?: string;
      reasonCode: typeof MCP_TOOL_CONTRACT_MISSING_REASON_CODE;
    };
  }) => Promise<void>;
  logFailure: (context: {
    err: unknown;
    runId: string;
    tenantId: string;
    action: string;
    version: string;
    reasonCode: typeof AUDIT_WRITE_FAILED_REASON_CODE;
  }) => void;
}) {
  const audit = {
    eventType: "mcp.tool.missing_contract" as const,
    severity: "warn" as const,
    message: `ToolContract missing: ${params.actionName}@${params.version}`,
    metadata: {
      tool: params.actionName,
      version: params.version,
      stepId: params.stepId,
      reasonCode: MCP_TOOL_CONTRACT_MISSING_REASON_CODE,
    },
  };

  await recordCriticalMcpAudit({
    runId: params.runId,
    tenantId: params.tenantId,
    action: params.actionName,
    version: params.version,
    record: () => params.record(audit),
    logFailure: params.logFailure,
  });
}
