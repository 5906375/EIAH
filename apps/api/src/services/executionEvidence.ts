export const EXECUTION_EVIDENCE_REASON_CODES = {
  missingToolContract: "MCP_TOOL_CONTRACT_MISSING",
  simulatedOutput: "SIMULATED_OUTPUT_IN_CRITICAL_CHAIN",
  auditWriteFailed: "AUDIT_WRITE_FAILED",
} as const;

export type ExecutionEvidenceState = "real" | "blocked" | "historical_simulated";

export type ExecutionEvidenceMarker = {
  state: ExecutionEvidenceState;
  reasonCodes: string[];
  containsHistoricalSimulatedOutput: boolean;
};

export function containsSimulatedOutput(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => containsSimulatedOutput(item));
  }
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (record.simulated === true) {
    return true;
  }
  return Object.values(record).some((item) => containsSimulatedOutput(item));
}

export function deriveExecutionEvidence(params: {
  status: string | null | undefined;
  errorCode: string | null | undefined;
  response: unknown;
}): ExecutionEvidenceMarker {
  if (containsSimulatedOutput(params.response)) {
    return {
      state: "historical_simulated",
      reasonCodes: [EXECUTION_EVIDENCE_REASON_CODES.simulatedOutput],
      containsHistoricalSimulatedOutput: true,
    };
  }

  if (params.status !== "success") {
    const governedReasonCodes = new Set<string>(
      typeof params.errorCode === "string" && params.errorCode.length > 0
        ? [params.errorCode]
        : ["EXECUTION_FAILED"]
    );
    return {
      state: "blocked",
      reasonCodes: [...governedReasonCodes],
      containsHistoricalSimulatedOutput: false,
    };
  }

  return {
    state: "real",
    reasonCodes: [],
    containsHistoricalSimulatedOutput: false,
  };
}
