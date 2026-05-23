import type {
  SideEffectCommand,
  SideEffectDispatchGuardResult,
} from "./imobMissionTypes";

export function reserveSideEffectCommand(params: {
  operationHasOwner: boolean;
  existingIdempotencyKeys: ReadonlySet<string>;
  command: SideEffectCommand;
}): SideEffectDispatchGuardResult {
  if (!params.operationHasOwner) {
    return { ok: false, reasonCode: "NO_AGENT_FOR_OPERATION" };
  }

  if (!params.command.idempotencyKey) {
    return { ok: false, reasonCode: "MISSING_IDEMPOTENCY_KEY" };
  }

  if (params.existingIdempotencyKeys.has(params.command.idempotencyKey)) {
    return { ok: false, reasonCode: "DUPLICATE_SIDE_EFFECT_BLOCKED" };
  }

  return { ok: true, reservedCommand: params.command };
}
