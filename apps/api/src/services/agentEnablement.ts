import crypto from "node:crypto";
import { runIdempotentDdl } from "./idempotentDdl";
import { COMMERCIAL_SCOPE, readActiveDesignation, readActiveMembershipStatus, writeAuditEvent, type AuditWriter } from "./commercialAuthority";

/**
 * Habilitação comercial verificável de agentes governados (AUTHZ-SCOPE-1).
 *
 * Política + delegação, sozinhas, NÃO tornam um agente governado utilizável: uma política antiga, uma delegação
 * emitida por um publicador, o onboarding ou uma combinação disso não são decisão do domínio. O agente governado só
 * está habilitado quando existe um registro de habilitação VIGENTE que o liga a:
 *   - a decisão humana (evento de `GuardrailAuditLedger` + designação `holder` que a fundamentou);
 *   - o tenant, o workspace e o item do Marketplace contratados;
 *   - a delegação específica que a sustenta, nas MESMAS condições aceitas (escopo e trustMin) e ainda vigente.
 * Delegação nova, alterada pelo publicador, expirada ou revogada não herda a habilitação anterior.
 *
 * "Governado" = agente que declara capacidades transversais (`AGENT_CAPABILITY_DECLARATIONS`). Outros agentes só entram
 * quando declararem. A escrita acontece SOMENTE na contratação governada (`POST /marketplace/:id/subscribe`); a leitura
 * não cria tabela, não escreve e nega por padrão (tabela ausente ou erro de consulta = nenhum agente governado
 * habilitado).
 */
type Prisma = any;

export type EnablementRow = {
  id: string;
  agentKey: string;
  marketplaceItemId: string;
  delegationId: string;
  scope: string;
  trustMin: number;
  validUntil: Date | string;
  designationId: string | null;
  decisionAuditEventId: string | null;
};

export type ActiveDelegationRef = {
  id: string;
  marketplaceId?: string | null;
  scope: string;
  trustMin?: number | null;
  validUntil: Date | string;
};

let storePromise: Promise<void> | null = null;
export async function ensureAgentEnablementStore(prisma: Prisma) {
  if (!storePromise) {
    storePromise = (async () => {
      await runIdempotentDdl(prisma, `
        CREATE TABLE IF NOT EXISTS eiah_agent_commercial_enablements (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          agent_key TEXT NOT NULL,
          marketplace_item_id TEXT NOT NULL,
          delegation_id TEXT NOT NULL,
          scope TEXT NOT NULL,
          trust_min DOUBLE PRECISION NOT NULL,
          designation_id TEXT NOT NULL,
          decided_by_user_id TEXT NOT NULL,
          decision_audit_event_id TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          valid_until TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          revoked_by_user_id TEXT,
          revoke_reason TEXT,
          revoke_audit_event_id TEXT
        );
      `);
      await runIdempotentDdl(prisma, `
        CREATE UNIQUE INDEX IF NOT EXISTS eiah_agent_commercial_enablements_active_uidx
        ON eiah_agent_commercial_enablements (tenant_id, workspace_id, agent_key)
        WHERE revoked_at IS NULL;
      `);
    })().catch((error) => {
      storePromise = null;
      throw error;
    });
  }
  return storePromise;
}

export function resetAgentEnablementStoreCache() {
  storePromise = null;
}

function asTime(value: unknown): number {
  const time = value instanceof Date ? value.getTime() : new Date(String(value ?? "")).getTime();
  return Number.isNaN(time) ? Number.NaN : time;
}

/**
 * Chaves (normalizadas) de agentes governados com habilitação VIGENTE e vinculada a uma das delegações ativas.
 * SOMENTE LEITURA. Falha propaga: quem chama deve tratar como "nenhuma habilitação" (fail-closed).
 */
export async function readVerifiedEnablementKeys(
  prisma: Prisma,
  scope: { tenantId: string; workspaceId: string; activeDelegations: readonly ActiveDelegationRef[]; now?: Date },
): Promise<Set<string>> {
  const now = scope.now ?? new Date();
  const rows = (await prisma.$queryRaw`
    SELECT
      id,
      agent_key AS "agentKey",
      marketplace_item_id AS "marketplaceItemId",
      delegation_id AS "delegationId",
      scope,
      trust_min AS "trustMin",
      valid_until AS "validUntil",
      designation_id AS "designationId",
      decision_audit_event_id AS "decisionAuditEventId"
    FROM eiah_agent_commercial_enablements
    WHERE tenant_id = ${scope.tenantId}
      AND workspace_id = ${scope.workspaceId}
      AND revoked_at IS NULL
      AND valid_until > ${now}
  `) as EnablementRow[];
  const delegations = new Map(scope.activeDelegations.map((delegation) => [delegation.id, delegation] as const));
  const verified = new Set<string>();
  for (const row of rows) {
    // Evidência obrigatória: sem decisão e sem designação registradas, não há habilitação.
    if (!row.designationId || !row.decisionAuditEventId) continue;
    const delegation = delegations.get(row.delegationId);
    if (!delegation) continue; // delegação nova/diferente/expirada/revogada não herda a habilitação
    if (delegation.marketplaceId !== row.marketplaceItemId) continue;
    // As condições aceitas na decisão precisam ser as da delegação: o publicador não as altera por fora.
    if (String(delegation.scope) !== String(row.scope)) continue;
    if (Number(delegation.trustMin ?? Number.NaN) !== Number(row.trustMin)) continue;
    if (!(asTime(delegation.validUntil) > now.getTime())) continue;
    verified.add(row.agentKey);
  }
  return verified;
}

export type RecordEnablementInput = {
  tenantId: string;
  workspaceId: string;
  agentKey: string;
  marketplaceItemId: string;
  delegationId: string;
  scope: string;
  trustMin: number;
  validUntil: Date;
  designationId: string;
  decidedByUserId: string;
  decisionAuditEventId: string;
};

/** Registra a habilitação (idempotente por agente ativo). Chamada somente pela contratação governada, após a decisão. */
export async function recordAgentEnablement(prisma: Prisma, input: RecordEnablementInput, now: Date = new Date()): Promise<string> {
  await prisma.$executeRaw`
    UPDATE eiah_agent_commercial_enablements
    SET revoked_at = valid_until, revoke_reason = 'expired'
    WHERE tenant_id = ${input.tenantId} AND workspace_id = ${input.workspaceId} AND agent_key = ${input.agentKey}
      AND revoked_at IS NULL AND valid_until <= ${now}
  `;
  const id = `cae_${crypto.randomUUID()}`;
  // Mesmo agente já habilitado e vigente: a decisão mais recente substitui a anterior (revoga a anterior como substituída).
  await prisma.$executeRaw`
    UPDATE eiah_agent_commercial_enablements
    SET revoked_at = ${now}, revoke_reason = 'superseded'
    WHERE tenant_id = ${input.tenantId} AND workspace_id = ${input.workspaceId} AND agent_key = ${input.agentKey}
      AND revoked_at IS NULL
  `;
  await prisma.$executeRaw`
    INSERT INTO eiah_agent_commercial_enablements
      (id, tenant_id, workspace_id, agent_key, marketplace_item_id, delegation_id, scope, trust_min, designation_id,
       decided_by_user_id, decision_audit_event_id, created_at, valid_until)
    VALUES
      (${id}, ${input.tenantId}, ${input.workspaceId}, ${input.agentKey}, ${input.marketplaceItemId}, ${input.delegationId},
       ${input.scope}, ${input.trustMin}, ${input.designationId}, ${input.decidedByUserId}, ${input.decisionAuditEventId},
       ${now}, ${input.validUntil})
  `;
  return id;
}

export type RevokeEnablementInput = {
  tenantId: string;
  workspaceId: string;
  actorUserId: string;
  actorTokenId?: string | null;
  enablementId: string;
  reason: string;
  evidenceRef: string;
  /** Designação (holder ou grantor) que legitima o ato. */
  actorDesignationId: string;
};

export type RevokeEnablementResult =
  | { ok: true; enablementId: string }
  | { ok: false; status: number; code: string; message: string };

/**
 * Revoga a habilitação comercial e nega explicitamente a política do agente no workspace ("revogar = allowed:false",
 * nunca apagar). Habilitação, política e evento de auditoria são gravados na MESMA transação; falha desfaz tudo.
 */
export async function revokeAgentEnablement(
  prisma: Prisma,
  input: RevokeEnablementInput,
  options: { now?: Date; audit?: AuditWriter } = {},
): Promise<RevokeEnablementResult> {
  const now = options.now ?? new Date();
  const audit = options.audit ?? writeAuditEvent;
  let row: { id: string; agentKey: string; marketplaceItemId: string; delegationId: string } | undefined;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT id, agent_key AS "agentKey", marketplace_item_id AS "marketplaceItemId", delegation_id AS "delegationId"
      FROM eiah_agent_commercial_enablements
      WHERE id = ${input.enablementId} AND tenant_id = ${input.tenantId} AND workspace_id = ${input.workspaceId}
        AND revoked_at IS NULL
      LIMIT 1
    `) as Array<NonNullable<typeof row>>;
    row = rows[0];
  } catch {
    return { ok: false, status: 503, code: "ENABLEMENT_CHECK_UNAVAILABLE", message: "Não foi possível consultar a habilitação." };
  }
  if (!row) return { ok: false, status: 404, code: "ENABLEMENT_NOT_FOUND", message: "Habilitação vigente não encontrada neste workspace." };
  const found = row;
  try {
    await prisma.$transaction(async (tx: Prisma) => {
      const auditEventId = await audit(tx, {
        eventType: "commercial_authority.enablement_revoke.authorized",
        severity: "info",
        message: "commercial_authority.enablement_revoke authorized",
        metadata: {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          actorUserId: input.actorUserId,
          tokenId: input.actorTokenId ?? null,
          actorDesignationId: input.actorDesignationId,
          enablementId: found.id,
          agentKey: found.agentKey,
          marketplaceItemId: found.marketplaceItemId,
          delegationId: found.delegationId,
          reason: input.reason.trim(),
          evidenceRef: input.evidenceRef,
          decisionRef: "AUTHZ-SCOPE-1/2026-10-12",
          formalRatification: "pending",
          decision: "revoke",
          outcome: "authorized",
          reasonCode: "ENABLEMENT_REVOKE_AUTHORIZED",
          decidedAt: now.toISOString(),
        },
      });
      await tx.$executeRaw`
        UPDATE eiah_agent_commercial_enablements
        SET revoked_at = ${now}, revoked_by_user_id = ${input.actorUserId}, revoke_reason = ${input.reason.trim()},
            revoke_audit_event_id = ${auditEventId}
        WHERE id = ${found.id} AND revoked_at IS NULL
      `;
      // Política do agente no workspace: negada de forma explícita (a contratação futura exige nova decisão).
      await tx.$executeRaw`
        UPDATE tenant_action_policy
        SET allowed = false
        WHERE tenant_id = ${input.tenantId} AND workspace_id = ${input.workspaceId}
          AND regexp_replace(lower(action_name), '[^a-z0-9]', '', 'g') = ${found.agentKey}
      `;
    });
    return { ok: true, enablementId: found.id };
  } catch {
    return { ok: false, status: 503, code: "ENABLEMENT_RECORD_UNAVAILABLE", message: "Não foi possível registrar a decisão e a revogação. Nada foi revogado." };
  }
}

/**
 * Revogação pela PESSOA com autoridade: membership ativa + designação `holder` (decide contratar, logo pode desfazer) ou
 * `grantor` (autoridade de revogar) vigente, revalidada agora. Token de serviço nunca revoga. Negações são registradas
 * em melhor esforço; a revogação em si é atômica com o registro (ver `revokeAgentEnablement`).
 */
export async function revokeAgentEnablementAs(
  prisma: Prisma,
  input: Omit<RevokeEnablementInput, "actorDesignationId" | "actorUserId"> & { actorUserId: string | null | undefined },
  options: { now?: Date; audit?: AuditWriter } = {},
): Promise<RevokeEnablementResult> {
  const now = options.now ?? new Date();
  const userId = typeof input.actorUserId === "string" ? input.actorUserId.trim() : "";
  const deny = async (status: number, code: string, message: string): Promise<RevokeEnablementResult> => {
    try {
      await (options.audit ?? writeAuditEvent)(prisma, {
        eventType: "commercial_authority.enablement_revoke.denied",
        severity: "warn",
        message: "commercial_authority.enablement_revoke denied",
        metadata: { tenantId: input.tenantId, workspaceId: input.workspaceId, actorUserId: userId || null, tokenId: input.actorTokenId ?? null, enablementId: input.enablementId, outcome: "denied", reasonCode: code, scope: COMMERCIAL_SCOPE, decidedAt: now.toISOString() },
      });
    } catch { /* melhor esforço */ }
    return { ok: false, status, code, message };
  };
  if (!userId) return deny(403, "IDENTITY_REQUIRED", "A revogação exige uma pessoa autenticada.");
  if (typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.length > 300) {
    return { ok: false, status: 400, code: "REASON_REQUIRED", message: "Informe o motivo da revogação (3 a 300 caracteres)." };
  }
  if (typeof input.evidenceRef !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/#@-]{2,119}$/.test(input.evidenceRef)) {
    return { ok: false, status: 400, code: "EVIDENCE_REF_REQUIRED", message: "Informe uma referência de evidência da decisão (3 a 120 caracteres, sem espaços)." };
  }
  let designationId: string | null = null;
  try {
    const membership = await readActiveMembershipStatus(prisma, { tenantId: input.tenantId, workspaceId: input.workspaceId, userId });
    if (!membership || String(membership.status ?? "").trim().toLowerCase() !== "active") {
      return deny(403, "ACTOR_MEMBERSHIP_NOT_ACTIVE", "Somente membros ativos do workspace podem revogar uma habilitação comercial.");
    }
    const scope = { tenantId: input.tenantId, workspaceId: input.workspaceId, userId, now };
    const holder = await readActiveDesignation(prisma, { ...scope, role: "holder" });
    const grantor = holder ? null : await readActiveDesignation(prisma, { ...scope, role: "grantor" });
    designationId = (holder ?? grantor)?.id ?? null;
  } catch {
    return deny(503, "AUTHORITY_CHECK_UNAVAILABLE", "Não foi possível verificar a autoridade comercial.");
  }
  if (!designationId) return deny(403, "COMMERCIAL_AUTHORITY_REQUIRED", "Revogar uma habilitação comercial exige autoridade comercial vigente neste workspace.");
  return revokeAgentEnablement(prisma, { ...input, actorUserId: userId, actorDesignationId: designationId }, options);
}
