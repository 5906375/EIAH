import {
  buildPreDuimpContextContract,
  evaluatePreDuimpIsolation,
  type PreDuimpContextContract,
  type TenantWorkspaceScope,
} from "../../../types/preDuimpContextContract";

// Catalogo canonico de Actions do recorte PRE_DUIMP (Comex/DUIMP),
// interno a vertical publica Logistica (roadmap v8.1 secao 15).
//
// Todas as actions deste catalogo operam em modo shadow, sobre fixtures
// sinteticas, sem efeito externo real e sem transmissao ao Portal
// Unico/Siscomex. Qualquer action fora do catalogo, ou que solicite
// modo nao-shadow / transmissao externa, e rejeitada fail-closed.

export const PRE_DUIMP_ACTIONS = [
  "log.duimp_context.create",
  "log.duimp_context.review",
] as const;

export type PreDuimpAction = (typeof PRE_DUIMP_ACTIONS)[number];

const PRE_DUIMP_ACTION_SET = new Set<string>(PRE_DUIMP_ACTIONS);

export function isKnownPreDuimpAction(action: string): action is PreDuimpAction {
  return PRE_DUIMP_ACTION_SET.has(action);
}

export type PreDuimpExternalTransmissionSubreason =
  | "mode_not_shadow"
  | "external_transmission_requested";

export type PreDuimpActionReasonCode =
  | "PRE_DUIMP_ACTION_UNKNOWN"
  | "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED"
  | "PRE_DUIMP_ISOLATION_VIOLATION";

export class PreDuimpActionRejectedError extends Error {
  constructor(
    message: string,
    readonly reasonCode: PreDuimpActionReasonCode,
    readonly context: Record<string, unknown>,
    readonly subreason?: PreDuimpExternalTransmissionSubreason,
  ) {
    super(message);
    this.name = "PreDuimpActionRejectedError";
  }
}

export type PreDuimpActionRequest = {
  action: string;
  context: unknown;
  requester: TenantWorkspaceScope;
};

export type PreDuimpActionAuthorization = {
  action: PreDuimpAction;
  context: PreDuimpContextContract;
};

function asRecord(input: unknown): Record<string, unknown> | null {
  return input && typeof input === "object" && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : null;
}

// Resolve e autoriza uma action do catalogo PRE_DUIMP fail-closed, nesta ordem:
// 1) a action precisa estar no catalogo canonico (PRE_DUIMP_ACTION_UNKNOWN);
// 2) o contexto nao pode solicitar modo nao-shadow nem transmissao externa
//    (PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED, com subreason);
// 3) o contexto precisa satisfazer o contrato de dominio completo
//    (buildPreDuimpContextContract, erro de forma propaga como ZodError);
// 4) o requester precisa estar isolado no mesmo tenant/workspace do
//    contexto (PRE_DUIMP_ISOLATION_VIOLATION).
export function authorizePreDuimpAction(
  request: PreDuimpActionRequest,
): PreDuimpActionAuthorization {
  if (!isKnownPreDuimpAction(request.action)) {
    throw new PreDuimpActionRejectedError(
      `Unknown PRE_DUIMP action: ${request.action}`,
      "PRE_DUIMP_ACTION_UNKNOWN",
      { attemptedAction: request.action },
    );
  }

  const raw = asRecord(request.context);

  if (raw && raw.mode !== undefined && raw.mode !== "shadow") {
    throw new PreDuimpActionRejectedError(
      `PRE_DUIMP context requested a non-shadow mode: ${String(raw.mode)}`,
      "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED",
      { attemptedAction: request.action, mode: raw.mode },
      "mode_not_shadow",
    );
  }

  if (raw && raw.externalTransmissionAllowed === true) {
    throw new PreDuimpActionRejectedError(
      "PRE_DUIMP context requested externalTransmissionAllowed=true",
      "PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED",
      { attemptedAction: request.action },
      "external_transmission_requested",
    );
  }

  const context = buildPreDuimpContextContract(request.context);

  const isolation = evaluatePreDuimpIsolation(context, request.requester);
  if (!isolation.allowed) {
    throw new PreDuimpActionRejectedError(
      `PRE_DUIMP isolation violation: ${isolation.reason}`,
      "PRE_DUIMP_ISOLATION_VIOLATION",
      { reason: isolation.reason, requester: request.requester },
    );
  }

  return { action: request.action, context };
}
