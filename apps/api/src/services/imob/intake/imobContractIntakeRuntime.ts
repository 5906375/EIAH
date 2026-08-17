import { UnrecoverableError } from "bullmq";
import {
  resolveTenantCapabilityFlag,
  type TenantCapabilityFlagBackend,
  type TenantCapabilityFlagScope,
} from "@eiah/core/security/killSwitch";
import { recordGuardrailAudit } from "@eiah/core/services/guardrailLedgerStore";

import { IMOB_CONTRACT_INTAKE_RUNTIME_POLICY } from "../imobAgentContract";

type GuardrailAuditPrisma = Parameters<typeof recordGuardrailAudit>[0]["prisma"];

export type ImobContractIntakeBlockedOperation = "upload" | "confirm" | "worker";
export type ImobContractIntakeBlockingCondition =
  | "pending_pr1c_atomic_dispatch"
  | "explicitly_disabled"
  | "flag_backend_unavailable";

export type ImobContractIntakeRuntimeDecision = {
  actionId: "imob.contract.intake";
  enabled: boolean;
  operationalState: "enabled" | "blocked";
  reasonCode: "VERTICAL_CAPABILITY_NOT_AVAILABLE";
  blockingCondition: ImobContractIntakeBlockingCondition | null;
  flagSource: "explicit" | "default" | "backend_error";
  retryable: false;
  httpStatus: 503;
  message: string;
};

export const IMOB_CONTRACT_INTAKE_FLAG_SCOPE = {
  capabilityId: IMOB_CONTRACT_INTAKE_RUNTIME_POLICY.actionId,
} as const;

export async function resolveImobContractIntakeRuntimePolicy(params: {
  tenantId: string;
  workspaceId: string;
  backend?: TenantCapabilityFlagBackend;
}): Promise<ImobContractIntakeRuntimeDecision> {
  const scope: TenantCapabilityFlagScope = {
    ...IMOB_CONTRACT_INTAKE_FLAG_SCOPE,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
  };
  const flag = await resolveTenantCapabilityFlag(scope, params.backend);
  const blockingCondition: ImobContractIntakeBlockingCondition | null = flag.enabled
    ? null
    : flag.source === "backend_error"
      ? "flag_backend_unavailable"
      : flag.source === "explicit"
        ? "explicitly_disabled"
        : IMOB_CONTRACT_INTAKE_RUNTIME_POLICY.blockingCondition;

  return {
    actionId: IMOB_CONTRACT_INTAKE_RUNTIME_POLICY.actionId,
    enabled: flag.enabled,
    operationalState: flag.enabled ? "enabled" : "blocked",
    reasonCode: IMOB_CONTRACT_INTAKE_RUNTIME_POLICY.reasonCode,
    blockingCondition,
    flagSource: flag.source,
    retryable: IMOB_CONTRACT_INTAKE_RUNTIME_POLICY.retryable,
    httpStatus: IMOB_CONTRACT_INTAKE_RUNTIME_POLICY.httpStatus,
    message: IMOB_CONTRACT_INTAKE_RUNTIME_POLICY.message,
  };
}

export async function recordImobContractIntakeBlocked(params: {
  prisma: GuardrailAuditPrisma;
  tenantId: string;
  workspaceId: string;
  operation: ImobContractIntakeBlockedOperation;
  policy: ImobContractIntakeRuntimeDecision;
  runId?: string | null;
}) {
  try {
    await recordGuardrailAudit({
      prisma: params.prisma,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      runId: params.runId ?? null,
      eventType: "imob.contract_intake.blocked",
      severity: "warn",
      message: "IMOB contract intake blocked by its tenant runtime policy.",
      metadata: {
        actionId: params.policy.actionId,
        reasonCode: params.policy.reasonCode,
        blockingCondition: params.policy.blockingCondition,
        flagSource: params.policy.flagSource,
        operation: params.operation,
      },
    });
  } catch {
    // Audit unavailability must never turn the denial into authorization.
  }
}

export class ImobContractIntakeTemporarilyBlockedError extends UnrecoverableError {
  readonly reasonCode: ImobContractIntakeRuntimeDecision["reasonCode"];
  readonly blockingCondition: ImobContractIntakeRuntimeDecision["blockingCondition"];

  constructor(policy: ImobContractIntakeRuntimeDecision) {
    super(policy.message);
    this.reasonCode = policy.reasonCode;
    this.blockingCondition = policy.blockingCondition;
  }
}
