import {
  buildImobBlockedPendingActionResolution,
  buildImobExecuteResolutionFromPendingAction,
  buildImobPendingAction,
  getImobPendingActionSpec,
} from "./imobPendingActionRuntime";

export { IMOB_DISPATCHER_ACTION_IDS } from "./imobPendingActionRuntime";
export type { ImobDispatcherActionId } from "./imobPendingActionRuntime";

export type ImobCrmActionDispatchInput = {
  actionId: string;
  caseId: string;
  threadId: string;
  canonical: Record<string, unknown> | null | undefined;
  message: string;
  timestamp: string;
  source?: "command-center" | "chat";
};

type ImobCrmActionDispatchResult = Record<string, unknown>;

function asStr(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildBlockedResponse(detail: string): ImobCrmActionDispatchResult {
  return buildImobBlockedPendingActionResolution({
    detail,
    reasonCode: "PENDING_ACTION_MISMATCH",
  });
}

/**
 * Validates actionId against case.canonical.recommendedActions and returns an
 * OperationalResolution or null.
 *
 * Returns null in two cases:
 *   - actionType === "consultive": fall through so the engine handles it as consult
 *   - actionId is operational/governed but not in ACTION_EXECUTION_MAP: fall through
 *
 * Returns a blocked response when actionId is not found in recommendedActions.
 * Returns mode="execute" + executionRequest when actionId is valid and mapped.
 *
 * No DB access — caller is responsible for loading canonical from the case.
 */
export function resolveImobCrmActionDispatch(
  params: ImobCrmActionDispatchInput,
): ImobCrmActionDispatchResult | null {
  const { actionId, caseId, canonical, threadId, timestamp } = params;

  const recommendedActions = Array.isArray(
    (canonical as Record<string, unknown> | null | undefined)?.recommendedActions,
  )
    ? ((canonical as Record<string, unknown>).recommendedActions as Record<string, unknown>[])
    : [];

  const matched = recommendedActions.find((a) => asStr(a.id) === actionId);

  if (!matched) {
    return buildBlockedResponse(
      `Ação '${actionId}' não está entre as ações recomendadas para este caso.`,
    );
  }

  const actionType = asStr(matched.actionType) ?? "consultive";

  // Consultive actions produce mode=consult via the normal engine — do not intercept
  if (actionType === "consultive") {
    return null;
  }

  const spec = getImobPendingActionSpec(actionId);
  if (!spec) {
    // Operational/governed but no static execution mapping — fall through to engine
    return null;
  }

  const label = asStr(matched.label) ?? actionId;
  const reasonCode = asStr(matched.reasonCode);
  const pendingAction = buildImobPendingAction({
    actionId,
    sourceActionId: actionId,
    caseId,
    threadId,
    reasonCode: (reasonCode ?? null) as any,
    createdAt: timestamp,
    source: params.source ?? "command-center",
  });
  if (!pendingAction) {
    return buildBlockedResponse(`Ação '${actionId}' não possui binding canônico para confirmação.`);
  }

  return buildImobExecuteResolutionFromPendingAction({
    pendingAction,
    label,
  });
}
