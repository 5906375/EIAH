import crypto from "node:crypto";

// `@repo/db` e o gravador do ledger são carregados sob demanda: a decisão pura roda (e é testada) sem banco nem client Prisma.
const loadPrisma = async () => (await import("@repo/db")).prismaGlobal;

/**
 * EIAH-AUTHZ-SESSION-WORKSPACE-G2 — avaliação em MODO SOMBRA da troca de workspace (`POST /session/workspace`).
 *
 * Estritamente observacional: calcula o que a regra FUTURA decidiria e registra a diferença para com o comportamento atual da
 * rota. Nunca bloqueia, nunca concede, nunca altera a resposta da rota e só LÊ: não cria vínculo, não promove, não semeia
 * catálogo, não grava papel, designação, política ou instalação. Uma decisão favorável do modo sombra NÃO é autorização.
 *
 * Desligado por padrão (mesmo padrão de `preDuimpRuntimeShadowGate.ts`): só liga com a variável explícita e fora de produção.
 * Falha de observabilidade (consulta ou ledger) nunca altera a resposta: o evento deixa de existir, com aviso em log.
 */
export const WORKSPACE_SWITCH_SHADOW_ENV_KEY = "EIAH_WORKSPACE_SWITCH_SHADOW_ENABLED" as const;
export const WORKSPACE_SWITCH_POLICY_VERSION = "workspace-switch-authz/1" as const;
export const WORKSPACE_SWITCH_SHADOW_EVENT_TYPE = "session.workspace_switch.shadow_observation" as const;

/** Liga somente com `"true"` explícito E em ambiente local (`NODE_ENV` development|test). Nunca em produção/staging. */
export function isWorkspaceSwitchShadowEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env[WORKSPACE_SWITCH_SHADOW_ENV_KEY] !== "true") return false;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

export type WorkspaceSwitchReasonCode =
  | "MEMBERSHIP_ACTIVE"
  | "LEGACY_ASSIGNMENT"
  | "IDENTITY_REQUIRED"
  | "TARGET_INVALID"
  | "WORKSPACE_FORBIDDEN"
  | "MEMBERSHIP_NOT_ACTIVE"
  | "MEMBERSHIP_REQUIRED"
  | "EVALUATION_UNAVAILABLE";

export type WorkspaceSwitchShadowDecision = {
  mode: "shadow";
  /** O que a regra futura decidiria. NÃO é autorização operacional. */
  wouldAllow: boolean;
  reasonCode: WorkspaceSwitchReasonCode;
  evidence: "membership" | "legacy_assignment" | "none";
  tenantId: string;
  /** Workspace de destino pedido (`null` quando o identificador é inválido). */
  workspaceId: string | null;
  fromWorkspaceId: string;
  correlationId: string;
  policyVersion: typeof WORKSPACE_SWITCH_POLICY_VERSION;
};

export type WorkspaceSwitchLegacyOutcome = {
  outcome: "allowed" | "rejected_payload" | "forbidden_workspace";
  /** Só quando `allowed`: criou token novo, reutilizou token da própria troca ou de outra origem. */
  tokenAction?: "created" | "reused_switch_token" | "reused_other_origin";
};

export type WorkspaceSwitchEvaluationInput = {
  tenantId: string;
  fromWorkspaceId: string;
  /** Pessoa do token; ausente em token de serviço/automação. */
  userId?: string | null;
  targetWorkspaceId: unknown;
  correlationId?: string;
};

/** Leituras (somente SELECT) usadas pela avaliação; injetáveis para teste. */
export type WorkspaceSwitchReaders = {
  readWorkspaceTenant(workspaceId: string): Promise<{ tenantId: string } | null>;
  readMembershipStatus(scope: { tenantId: string; workspaceId: string; userId: string }): Promise<{ status: string | null } | null>;
  readLegacyAssignment(scope: { tenantId: string; workspaceId: string; userId: string }): Promise<boolean>;
};

const OPAQUE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** Tabela ainda não criada = nenhum registro (leitura nunca cria tabela). */
export function isMissingRelation(error: unknown) {
  const code = (error as { code?: string; meta?: { code?: string } })?.meta?.code ?? (error as { code?: string })?.code;
  return code === "42P01" || /does not exist|relation .* does not exist/i.test(String((error as Error)?.message ?? ""));
}

export const defaultWorkspaceSwitchReaders: WorkspaceSwitchReaders = {
  async readWorkspaceTenant(workspaceId) {
    const prismaGlobal = await loadPrisma();
    const row = await prismaGlobal.workspace.findUnique({ where: { id: workspaceId }, select: { tenantId: true } });
    return row ? { tenantId: row.tenantId } : null;
  },
  async readMembershipStatus({ tenantId, workspaceId, userId }) {
    try {
      const prismaGlobal = await loadPrisma();
      const rows = await prismaGlobal.$queryRaw<Array<{ status: string | null }>>`
        SELECT status FROM eiah_workspace_memberships
        WHERE user_id = ${userId} AND tenant_id = ${tenantId} AND workspace_id = ${workspaceId} LIMIT 1`;
      return rows[0] ? { status: typeof rows[0].status === "string" ? rows[0].status : null } : null;
    } catch (error) {
      if (isMissingRelation(error)) return null;
      throw error;
    }
  },
  async readLegacyAssignment({ tenantId, workspaceId, userId }) {
    try {
      const prismaGlobal = await loadPrisma();
      const rows = await prismaGlobal.$queryRaw<Array<{ present: number }>>`
        SELECT 1 AS present FROM eiah_workspace_role_assignments
        WHERE user_id = ${userId} AND tenant_id = ${tenantId} AND workspace_id = ${workspaceId} LIMIT 1`;
      return rows.length > 0;
    } catch (error) {
      if (isMissingRelation(error)) return false;
      throw error;
    }
  },
};

/** Normaliza o identificador pedido; `null` quando não é um identificador opaco válido. */
export function sanitizeTargetWorkspaceId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return OPAQUE_ID.test(trimmed) ? trimmed : null;
}

/**
 * Decisão da regra futura (somente leitura, sem bootstrap). Ordem: identidade → identificador → tenant/existência →
 * vínculo ativo → atribuição legada explícita → nada. Vínculo existente porém não ativo NEGA (a revogação vence a atribuição).
 * Função, perfil, `products.activate` e vínculo criado por bootstrap NUNCA entram: só `status='active'` registrado e a
 * atribuição legada explícita contam.
 */
export async function evaluateWorkspaceSwitchShadow(
  input: WorkspaceSwitchEvaluationInput,
  readers: WorkspaceSwitchReaders = defaultWorkspaceSwitchReaders,
): Promise<WorkspaceSwitchShadowDecision> {
  const target = sanitizeTargetWorkspaceId(input.targetWorkspaceId);
  const base = {
    mode: "shadow" as const,
    tenantId: input.tenantId,
    workspaceId: target,
    fromWorkspaceId: input.fromWorkspaceId,
    correlationId: input.correlationId ?? crypto.randomUUID(),
    policyVersion: WORKSPACE_SWITCH_POLICY_VERSION,
  };
  const deny = (reasonCode: WorkspaceSwitchReasonCode): WorkspaceSwitchShadowDecision => ({ ...base, wouldAllow: false, reasonCode, evidence: "none" });
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!userId) return deny("IDENTITY_REQUIRED");
  if (!target) return deny("TARGET_INVALID");
  try {
    const workspace = await readers.readWorkspaceTenant(target);
    // Inexistente e de outro tenant são indistinguíveis (sem enumeração).
    if (!workspace || workspace.tenantId !== input.tenantId) return deny("WORKSPACE_FORBIDDEN");
    const membership = await readers.readMembershipStatus({ tenantId: input.tenantId, workspaceId: target, userId });
    if (membership) {
      return String(membership.status ?? "").trim().toLowerCase() === "active"
        ? { ...base, wouldAllow: true, reasonCode: "MEMBERSHIP_ACTIVE", evidence: "membership" }
        : deny("MEMBERSHIP_NOT_ACTIVE");
    }
    if (await readers.readLegacyAssignment({ tenantId: input.tenantId, workspaceId: target, userId })) {
      return { ...base, wouldAllow: true, reasonCode: "LEGACY_ASSIGNMENT", evidence: "legacy_assignment" };
    }
    return deny("MEMBERSHIP_REQUIRED");
  } catch {
    // Dúvida ou falha de leitura nunca vira permissão.
    return deny("EVALUATION_UNAVAILABLE");
  }
}

export type WorkspaceSwitchShadowRecorder = (event: {
  tenantId: string;
  workspaceId: string;
  eventType: string;
  severity: "info";
  message: string;
  metadata: Record<string, unknown>;
}) => Promise<void>;

const defaultRecorder: WorkspaceSwitchShadowRecorder = async (event) => {
  const { recordGuardrailAudit } = await import("@eiah/core/services/guardrailLedgerStore");
  await recordGuardrailAudit({ prisma: (await loadPrisma()) as never, ...event });
};

export type ObserveWorkspaceSwitchParams = {
  actor: { tenantId: string; workspaceId: string; userId?: string | null };
  targetWorkspaceId: unknown;
  legacy: WorkspaceSwitchLegacyOutcome;
  env?: NodeJS.ProcessEnv;
  readers?: WorkspaceSwitchReaders;
  record?: WorkspaceSwitchShadowRecorder;
  logger?: { warn?: (...args: unknown[]) => void };
  timeoutMs?: number;
  correlationId?: string;
};

/**
 * Executa a avaliação sombra e registra UMA observação no ledger (evento observacional, não decisão nem concessão).
 * Retorna a decisão sombra, ou `null` se desligado/indisponível. NUNCA lança e nunca atrasa a rota além de `timeoutMs`.
 */
export async function observeWorkspaceSwitchShadow(params: ObserveWorkspaceSwitchParams): Promise<WorkspaceSwitchShadowDecision | null> {
  if (!isWorkspaceSwitchShadowEnabled(params.env)) return null;
  try {
    const work = (async () => {
      const decision = await evaluateWorkspaceSwitchShadow({
        tenantId: params.actor.tenantId,
        fromWorkspaceId: params.actor.workspaceId,
        userId: params.actor.userId ?? null,
        targetWorkspaceId: params.targetWorkspaceId,
        correlationId: params.correlationId,
      }, params.readers);
      await (params.record ?? defaultRecorder)({
        tenantId: params.actor.tenantId,
        // FK do ledger: o workspace do próprio token (o destino pode não existir ou ser de outro tenant).
        workspaceId: params.actor.workspaceId,
        eventType: WORKSPACE_SWITCH_SHADOW_EVENT_TYPE,
        severity: "info",
        message: "Observação em modo sombra da troca de workspace: não é decisão operacional nem concessão.",
        metadata: {
          kind: "shadow_observation",
          operational: false,
          enforced: false,
          policyVersion: decision.policyVersion,
          correlationId: decision.correlationId,
          actorUserId: params.actor.userId ?? null,
          tenantId: decision.tenantId,
          fromWorkspaceId: decision.fromWorkspaceId,
          targetWorkspaceId: decision.workspaceId,
          shadow: { wouldAllow: decision.wouldAllow, reasonCode: decision.reasonCode, evidence: decision.evidence },
          legacy: { outcome: params.legacy.outcome, ...(params.legacy.tokenAction ? { tokenAction: params.legacy.tokenAction } : {}) },
          observedAt: new Date().toISOString(),
        },
      });
      return decision;
    })();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), params.timeoutMs ?? 3000); });
    const result = await Promise.race([work, timeout]);
    if (timer) clearTimeout(timer);
    if (!result) params.logger?.warn?.({ event: "workspace_switch.shadow_timeout" }, "workspace_switch.shadow_unavailable");
    work.catch(() => undefined);
    return result;
  } catch (error) {
    params.logger?.warn?.({ event: "workspace_switch.shadow_failed", error: String((error as Error)?.message ?? error).slice(0, 120) }, "workspace_switch.shadow_unavailable");
    return null;
  }
}
