import {
  ApiError,
  PRE_DUIMP_ACCESS_DENIAL_REASON_CODES,
  type PreDuimpActionRequest,
  type PreDuimpAuthorizedShadowResponse,
  type PreDuimpShadowCapability,
  type SessionContextResponse,
} from "@/lib/api";

const VITE_ENV = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

export const PRE_DUIMP_FRONTEND_ENV_KEY = "VITE_PRE_DUIMP_FRONTEND_ENABLED" as const;
export const PRE_DUIMP_CREATE_ACTION = "log.duimp_context.create" as const;

export const PRE_DUIMP_REASON_MESSAGES = {
  UNAUTHORIZED: "Sua sessão não está autenticada. Entre novamente para continuar.",
  PRE_DUIMP_SCOPE_DENIED: "Sua identidade não possui permissão para criar este contexto.",
  PRE_DUIMP_ENTITLEMENT_DENIED: "A instalação de Logística não está habilitada para esta operação.",
  PRE_DUIMP_ISOLATION_VIOLATION: "O contexto não pertence ao tenant e workspace da sessão atual.",
  PRE_DUIMP_ACTION_UNKNOWN: "A ação solicitada não faz parte do catálogo PRE_DUIMP.",
  PRE_DUIMP_HITL_REQUIRED: "Esta ação exige uma aprovação HITL persistida, ainda indisponível neste ambiente.",
  PRE_DUIMP_EXTERNAL_TRANSMISSION_BLOCKED: "A operação foi bloqueada para preservar o modo shadow sem transmissão externa.",
  PRE_DUIMP_RUNTIME_DISABLED: "O runtime shadow do PRE_DUIMP está desabilitado.",
  PRE_DUIMP_PILOT_ACCESS_DENIED: "Este workspace não integra o piloto PRE_DUIMP.",
  VALIDATION_ERROR: "Revise o identificador do contexto e tente novamente.",
} as const;

export type PreDuimpReasonCode = keyof typeof PRE_DUIMP_REASON_MESSAGES;

export type PreDuimpErrorPresentation = {
  message: string;
  reasonCode: PreDuimpReasonCode | null;
};

export function isPreDuimpFrontendEnabled(
  env: Record<string, string | undefined> = VITE_ENV,
): boolean {
  return env[PRE_DUIMP_FRONTEND_ENV_KEY] === "true";
}

export type PreDuimpAccessState = {
  status: "idle" | "loading" | "ready" | "error";
  capability?: PreDuimpShadowCapability;
};

const PRE_DUIMP_ACCESS_DENIAL_REASON_SET = new Set<string>(
  PRE_DUIMP_ACCESS_DENIAL_REASON_CODES,
);

export function parsePreDuimpShadowCapability(input: unknown): PreDuimpShadowCapability | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  if (
    value.version !== "v1" ||
    typeof value.allowed !== "boolean" ||
    value.mode !== "shadow" ||
    value.externalTransmissionAllowed !== false
  ) {
    return null;
  }

  if (value.allowed) {
    if (value.reasonCode !== null) return null;
    if (
      (value.pilotPolicyVersion !== undefined && typeof value.pilotPolicyVersion !== "string") ||
      (value.actionPolicyVersion !== undefined && typeof value.actionPolicyVersion !== "string")
    ) {
      return null;
    }
    return value as PreDuimpShadowCapability;
  }

  if (
    typeof value.reasonCode !== "string" ||
    !PRE_DUIMP_ACCESS_DENIAL_REASON_SET.has(value.reasonCode)
  ) {
    return null;
  }
  return value as PreDuimpShadowCapability;
}

export function isPreDuimpAccessAllowed(
  globalKillSwitchEnabled: boolean,
  access: PreDuimpAccessState,
): boolean {
  return (
    globalKillSwitchEnabled &&
    access.status === "ready" &&
    parsePreDuimpShadowCapability(access.capability)?.allowed === true
  );
}

export function getPreDuimpDirectAccessRedirect(
  globalKillSwitchEnabled: boolean,
  access: PreDuimpAccessState = { status: "idle" },
): "/app/runs" | null {
  return isPreDuimpAccessAllowed(globalKillSwitchEnabled, access) ? null : "/app/runs";
}

export async function loadPreDuimpSessionContext(
  load: (signal: AbortSignal) => Promise<SessionContextResponse>,
  timeoutMs = 5_000,
): Promise<{
  access: PreDuimpAccessState;
  context?: SessionContextResponse;
  error?: unknown;
}> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const context = await load(controller.signal);
    const capability = parsePreDuimpShadowCapability(
      context.ok && context.data ? context.data.capabilities?.preDuimpShadow : undefined,
    );
    return capability
      ? { access: { status: "ready", capability }, context }
      : { access: { status: "error" }, context };
  } catch (error) {
    return { access: { status: "error" }, error };
  } finally {
    clearTimeout(timer);
  }
}

export function buildPreDuimpCreateRequest(input: {
  tenantId: string;
  workspaceId: string;
  recordId: string;
}): PreDuimpActionRequest {
  const tenantId = input.tenantId.trim();
  const workspaceId = input.workspaceId.trim();
  const recordId = input.recordId.trim();

  if (!tenantId || !workspaceId || !recordId) {
    throw new Error(PRE_DUIMP_REASON_MESSAGES.VALIDATION_ERROR);
  }

  return {
    action: PRE_DUIMP_CREATE_ACTION,
    context: {
      tenantId,
      workspaceId,
      verticalId: "log",
      recordType: "log.comex_duimp_context",
      recordId,
      mode: "shadow",
      externalTransmissionAllowed: false,
    },
  };
}

export function isAuthorizedShadowResponse(
  response: unknown,
): response is PreDuimpAuthorizedShadowResponse {
  if (!response || typeof response !== "object") return false;
  const value = response as Record<string, unknown>;

  return (
    value.decision === "authorized_shadow" &&
    value.mode === "shadow" &&
    value.externalTransmissionAllowed === false
  );
}

function readCanonicalReasonCode(body: unknown): PreDuimpReasonCode | null {
  if (!body || typeof body !== "object") return null;
  const payload = body as Record<string, unknown>;
  const error = payload.error;
  const candidates = [
    payload.reasonCode,
    error && typeof error === "object" ? (error as Record<string, unknown>).reasonCode : undefined,
    error && typeof error === "object" ? (error as Record<string, unknown>).code : undefined,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate in PRE_DUIMP_REASON_MESSAGES) {
      return candidate as PreDuimpReasonCode;
    }
  }

  return null;
}

export function presentPreDuimpError(error: unknown): PreDuimpErrorPresentation {
  const reasonCode =
    error instanceof ApiError && error.status === 401
      ? "UNAUTHORIZED"
      : error instanceof ApiError
        ? readCanonicalReasonCode(error.body)
        : null;

  if (reasonCode) {
    return { reasonCode, message: PRE_DUIMP_REASON_MESSAGES[reasonCode] };
  }

  return {
    reasonCode: null,
    message: "Não foi possível concluir a operação. Tente novamente ou contate o suporte.",
  };
}
