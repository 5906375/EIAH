export function inferApprovalStatusFromMetadata(
  metadata: unknown
): "pending" | "not_required" {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "not_required";
  }
  const record = metadata as Record<string, unknown>;
  const requiresApproval =
    record.requiresApproval === true ||
    record.requires_confirmation === true ||
    record.approvalRequired === true;
  const riskTier =
    typeof record.riskTier === "string" ? record.riskTier.toLowerCase() : null;
  const isHighTier = riskTier === "high" || riskTier === "critical";
  return requiresApproval || isHighTier ? "pending" : "not_required";
}

export function isSimulateMode(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  return (metadata as Record<string, unknown>).mode === "simulate";
}
