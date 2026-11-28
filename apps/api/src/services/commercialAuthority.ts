import crypto from "node:crypto";
import { COMMERCIAL_AUTHORITY_SCOPES } from "@eiah/core";
import { runIdempotentDdl } from "./idempotentDdl";

/**
 * Autoridade comercial (AUTHZ-SCOPE-1, escopo `marketplace.subscribe`): designação, concessão e revogação governadas.
 *
 * A autoridade NÃO vive nas permissões genéricas da membership nem em papéis: vive numa designação própria, com
 * beneficiário, concedente, limites, validade, revogação e evidência. Assim, papéis personalizados, convites,
 * `actions.admin`, `products.activate` e Founder não produzem autoridade comercial.
 *
 * Duas autoridades distintas (separação de funções):
 *  - `holder`  : pode CONTRATAR agentes (usar `marketplace.subscribe`), dentro dos limites da designação;
 *  - `grantor` : pode CONCEDER e REVOGAR designações de `holder`/`grantor`. Não contrata pelo mesmo vínculo.
 * A mesma pessoa não acumula as duas no mesmo workspace e ninguém concede a si mesmo.
 *
 * "Ninguém concede o que não possui": a concessão exige designação `grantor` ativa do concedente, a validade e os
 * limites concedidos não excedem os do concedente, e o beneficiário é membro ativo do mesmo tenant/workspace.
 *
 * BOOTSTRAP: este módulo NÃO cria a primeira autoridade. A fonte da primeira designação `grantor` de um workspace não
 * está formalmente ratificada; sem ela, toda concessão fica bloqueada com `FIRST_AUTHORITY_SOURCE_NOT_RATIFIED`.
 *
 * Auditoria: concessão e revogação gravam a designação e o evento de `GuardrailAuditLedger` na MESMA transação; falha
 * em qualquer parte desfaz tudo. O ledger não tem encadeamento criptográfico; não se afirma essa propriedade.
 * Nunca se grava token, JWT, senha ou credencial: apenas ids.
 */
export const COMMERCIAL_SCOPE = COMMERCIAL_AUTHORITY_SCOPES.marketplaceSubscribe;
export const AUTHORITY_ROLES = ["holder", "grantor"] as const;
export type AuthorityRole = (typeof AUTHORITY_ROLES)[number];
export const DELEGATION_SCOPES = ["read", "execute", "admin"] as const;
export type DelegationScope = (typeof DELEGATION_SCOPES)[number];

export type AuthorityLimits = { allowedScopes: DelegationScope[]; maxValidityDays: number };
/** Limites padrão quando a designação não os restringe mais: sem escopo `admin` e contratos de até 90 dias. */
export const DEFAULT_AUTHORITY_LIMITS: AuthorityLimits = { allowedScopes: ["read", "execute"], maxValidityDays: 90 };
export const MAX_DESIGNATION_DAYS = 365;

export const BOOTSTRAP_BLOCKED = {
  status: "blocked",
  reasonCode: "FIRST_AUTHORITY_SOURCE_NOT_RATIFIED",
  message:
    "Este workspace não tem nenhuma pessoa com autoridade para conceder a autoridade comercial. A origem da primeira autoridade não foi formalmente ratificada, então nenhuma concessão inicial é criada automaticamente.",
} as const;

export type Designation = {
  id: string;
  tenantId: string;
  workspaceId: string;
  beneficiaryUserId: string;
  role: AuthorityRole;
  limits: AuthorityLimits;
  grantedByUserId: string;
  grantorDesignationId: string | null;
  evidenceRef: string;
  grantedAt: string | null;
  validUntil: string;
  revokedAt: string | null;
};

type Prisma = any;

export type AuthorityFailure = {
  ok: false;
  status: number;
  code: string;
  message: string;
  bootstrap?: typeof BOOTSTRAP_BLOCKED;
};

const SELECT_DESIGNATION = `
  id,
  tenant_id AS "tenantId",
  workspace_id AS "workspaceId",
  beneficiary_user_id AS "beneficiaryUserId",
  authority_role AS "role",
  limits,
  granted_by_user_id AS "grantedByUserId",
  grantor_designation_id AS "grantorDesignationId",
  evidence_ref AS "evidenceRef",
  granted_at AS "grantedAt",
  valid_until AS "validUntil",
  revoked_at AS "revokedAt"
`;

function iso(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Limites vindos do banco: valores inválidos caem no padrão mais restritivo, nunca em algo mais permissivo. */
export function normalizeLimits(value: unknown): AuthorityLimits {
  let source: unknown = value;
  if (typeof source === "string") {
    try {
      source = JSON.parse(source);
    } catch {
      source = null;
    }
  }
  const raw = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
  const scopes = Array.isArray(raw.allowedScopes)
    ? raw.allowedScopes.filter((item): item is DelegationScope => DELEGATION_SCOPES.includes(item as DelegationScope))
    : DEFAULT_AUTHORITY_LIMITS.allowedScopes;
  const days = typeof raw.maxValidityDays === "number" && Number.isInteger(raw.maxValidityDays)
    && raw.maxValidityDays >= 1 && raw.maxValidityDays <= MAX_DESIGNATION_DAYS
    ? raw.maxValidityDays
    : DEFAULT_AUTHORITY_LIMITS.maxValidityDays;
  return { allowedScopes: Array.from(new Set(scopes)), maxValidityDays: days };
}

function toDesignation(row: Record<string, unknown>): Designation {
  return {
    id: String(row.id),
    tenantId: String(row.tenantId),
    workspaceId: String(row.workspaceId),
    beneficiaryUserId: String(row.beneficiaryUserId),
    role: row.role === "grantor" ? "grantor" : "holder",
    limits: normalizeLimits(row.limits),
    grantedByUserId: String(row.grantedByUserId),
    grantorDesignationId: typeof row.grantorDesignationId === "string" ? row.grantorDesignationId : null,
    evidenceRef: String(row.evidenceRef ?? ""),
    grantedAt: iso(row.grantedAt),
    validUntil: iso(row.validUntil) ?? new Date(0).toISOString(),
    revokedAt: iso(row.revokedAt),
  };
}

/** DDL só no caminho de ESCRITA (concessão). Os caminhos de leitura nunca criam tabela. */
let storePromise: Promise<void> | null = null;
export async function ensureCommercialAuthorityStore(prisma: Prisma) {
  if (!storePromise) {
    storePromise = (async () => {
      await runIdempotentDdl(prisma, `
        CREATE TABLE IF NOT EXISTS eiah_commercial_authority_designations (
          id TEXT PRIMARY KEY,
          tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
          beneficiary_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          scope TEXT NOT NULL CHECK (scope = 'marketplace.subscribe'),
          authority_role TEXT NOT NULL CHECK (authority_role IN ('holder', 'grantor')),
          limits JSONB NOT NULL DEFAULT '{}'::jsonb,
          granted_by_user_id TEXT NOT NULL,
          grantor_designation_id TEXT,
          evidence_ref TEXT NOT NULL,
          granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          valid_until TIMESTAMPTZ NOT NULL,
          revoked_at TIMESTAMPTZ,
          revoked_by_user_id TEXT,
          revoke_reason TEXT,
          grant_audit_event_id TEXT,
          revoke_audit_event_id TEXT
        );
      `);
      await runIdempotentDdl(prisma, `
        CREATE UNIQUE INDEX IF NOT EXISTS eiah_commercial_authority_active_uidx
        ON eiah_commercial_authority_designations (tenant_id, workspace_id, beneficiary_user_id, scope, authority_role)
        WHERE revoked_at IS NULL;
      `);
      await runIdempotentDdl(prisma, `
        CREATE INDEX IF NOT EXISTS eiah_commercial_authority_lookup_idx
        ON eiah_commercial_authority_designations (tenant_id, workspace_id, beneficiary_user_id);
      `);
    })().catch((error) => {
      storePromise = null;
      throw error;
    });
  }
  return storePromise;
}

/** Visível para testes de integração que recriam o banco. */
export function resetCommercialAuthorityStoreCache() {
  storePromise = null;
}

/** Membership ATIVA da pessoa no workspace. SOMENTE LEITURA: sem DDL, sem bootstrap, sem promoção. */
export async function readActiveMembershipStatus(
  prisma: Prisma,
  scope: { tenantId: string; workspaceId: string; userId: string },
): Promise<{ status: string | null } | null> {
  const rows = (await prisma.$queryRaw`
    SELECT status
    FROM eiah_workspace_memberships
    WHERE user_id = ${scope.userId}
      AND tenant_id = ${scope.tenantId}
      AND workspace_id = ${scope.workspaceId}
    LIMIT 1
  `) as Array<{ status?: unknown }>;
  const row = rows[0];
  if (!row) return null;
  return { status: typeof row.status === "string" ? row.status : null };
}

/**
 * Designação ATIVA (não revogada e não expirada) da pessoa para um papel. SOMENTE LEITURA, sem cache: a revogação vale
 * na leitura seguinte. Tabela inexistente ou erro de consulta propaga (quem chama nega).
 */
export async function readActiveDesignation(
  prisma: Prisma,
  scope: { tenantId: string; workspaceId: string; userId: string; role: AuthorityRole; now?: Date },
): Promise<Designation | null> {
  const now = scope.now ?? new Date();
  const rows = (await prisma.$queryRaw`
    SELECT
      id,
      tenant_id AS "tenantId",
      workspace_id AS "workspaceId",
      beneficiary_user_id AS "beneficiaryUserId",
      authority_role AS "role",
      limits,
      granted_by_user_id AS "grantedByUserId",
      grantor_designation_id AS "grantorDesignationId",
      evidence_ref AS "evidenceRef",
      granted_at AS "grantedAt",
      valid_until AS "validUntil",
      revoked_at AS "revokedAt"
    FROM eiah_commercial_authority_designations
    WHERE tenant_id = ${scope.tenantId}
      AND workspace_id = ${scope.workspaceId}
      AND beneficiary_user_id = ${scope.userId}
      AND scope = ${COMMERCIAL_SCOPE}
      AND authority_role = ${scope.role}
      AND revoked_at IS NULL
      AND valid_until > ${now}
    LIMIT 1
  `) as Array<Record<string, unknown>>;
  return rows[0] ? toDesignation(rows[0]) : null;
}

async function workspaceHasActiveGrantor(prisma: Prisma, scope: { tenantId: string; workspaceId: string }, now: Date) {
  const rows = (await prisma.$queryRawUnsafe(
    `SELECT 1 AS present
     FROM eiah_commercial_authority_designations
     WHERE tenant_id = $1 AND workspace_id = $2 AND scope = $3 AND authority_role = 'grantor'
       AND revoked_at IS NULL AND valid_until > $4
     LIMIT 1`,
    scope.tenantId, scope.workspaceId, COMMERCIAL_SCOPE, now,
  )) as unknown[];
  return rows.length > 0;
}

/** Os limites pedidos precisam caber nos do concedente ("ninguém concede o que não possui"). */
export function limitsWithin(requested: AuthorityLimits, granted: AuthorityLimits) {
  return requested.allowedScopes.every((scope) => granted.allowedScopes.includes(scope))
    && requested.maxValidityDays <= granted.maxValidityDays;
}

/** Aplica os limites da designação a uma contratação concreta. Retorna o motivo da violação, ou null. */
export function commercialLimitViolation(
  limits: AuthorityLimits,
  request: { scope: string; validUntil: Date; now?: Date },
): "SCOPE_NOT_ALLOWED" | "VALIDITY_EXCEEDS_LIMIT" | "VALIDITY_INVALID" | null {
  const now = request.now ?? new Date();
  if (!limits.allowedScopes.includes(request.scope as DelegationScope)) return "SCOPE_NOT_ALLOWED";
  if (Number.isNaN(request.validUntil.getTime()) || request.validUntil.getTime() <= now.getTime()) return "VALIDITY_INVALID";
  const maxMs = limits.maxValidityDays * 86_400_000;
  // 1 minuto de folga: o prazo padrão (agora + N dias) é calculado antes desta checagem.
  if (request.validUntil.getTime() - now.getTime() > maxMs + 60_000) return "VALIDITY_EXCEEDS_LIMIT";
  return null;
}

const EVIDENCE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/#@-]{2,119}$/;
const REVOKE_REASON_MAX = 300;

/** Nomes reservados de escopo/permissão comercial: nunca podem ser gravados como permissão de papel ou convite. */
export function containsReservedCommercialPermission(values: unknown): boolean {
  const flat: unknown[] = [];
  const walk = (value: unknown, depth: number) => {
    if (depth > 4) return;
    if (Array.isArray(value)) value.forEach((entry) => walk(entry, depth + 1));
    else if (value && typeof value === "object") Object.values(value as Record<string, unknown>).forEach((entry) => walk(entry, depth + 1));
    else flat.push(value);
  };
  walk(values, 0);
  return flat.some((value) => typeof value === "string" && value.trim().toLowerCase() === COMMERCIAL_SCOPE);
}

export const COMMERCIAL_PERMISSION_NOT_GRANTABLE = {
  code: "COMMERCIAL_AUTHORITY_NOT_GRANTABLE_HERE",
  message:
    "A autoridade comercial (marketplace.subscribe) não é concedida por papéis, convites ou permissões de membro. Ela só pode ser designada pelo procedimento governado de designação comercial.",
} as const;

export type AuditWriter = (tx: Prisma, event: { eventType: string; severity: "info" | "warn"; message: string; metadata: Record<string, unknown> }) => Promise<string>;

/** Grava o evento no GuardrailAuditLedger dentro da transação e devolve o id. Falha propaga (desfaz a transação). */
export const writeAuditEvent: AuditWriter = async (tx, event) => {
  const id = crypto.randomUUID();
  await tx.guardrailAuditLedger.create({
    data: {
      id,
      tenantId: String(event.metadata.tenantId),
      workspaceId: String(event.metadata.workspaceId),
      eventType: event.eventType,
      severity: event.severity,
      message: event.message,
      metadata: event.metadata,
    },
  });
  return id;
};

/** Negações são registradas em melhor esforço: a negação nunca depende do registro. */
async function auditDenial(prisma: Prisma, event: { eventType: string; metadata: Record<string, unknown> }) {
  try {
    await writeAuditEvent(prisma, { eventType: event.eventType, severity: "warn", message: `${event.eventType}`, metadata: event.metadata });
  } catch {
    /* melhor esforço */
  }
}

export type GrantInput = {
  tenantId: string;
  workspaceId: string;
  actorUserId: string | null | undefined;
  actorTokenId?: string | null;
  beneficiaryUserId: string;
  role: AuthorityRole;
  limits?: Partial<AuthorityLimits> | null;
  validUntil: string;
  evidenceRef: string;
  decision: string;
};

function fail(status: number, code: string, message: string, extra: Partial<AuthorityFailure> = {}): AuthorityFailure {
  return { ok: false, status, code, message, ...extra };
}

async function requireActiveGrantor(
  prisma: Prisma,
  actor: { tenantId: string; workspaceId: string; userId: string },
  now: Date,
): Promise<{ ok: true; grantor: Designation } | AuthorityFailure> {
  let membership: { status: string | null } | null;
  try {
    membership = await readActiveMembershipStatus(prisma, actor);
  } catch {
    return fail(503, "AUTHORITY_CHECK_UNAVAILABLE", "Não foi possível verificar o vínculo da pessoa com o workspace.");
  }
  if (!membership || String(membership.status ?? "").trim().toLowerCase() !== "active") {
    return fail(403, "ACTOR_MEMBERSHIP_NOT_ACTIVE", "Somente membros ativos do workspace podem conceder ou revogar autoridade comercial.");
  }
  let grantor: Designation | null;
  try {
    grantor = await readActiveDesignation(prisma, { ...actor, role: "grantor", now });
  } catch {
    return fail(503, "AUTHORITY_CHECK_UNAVAILABLE", "Não foi possível verificar a autoridade de concessão.");
  }
  if (grantor) return { ok: true, grantor };
  let anyGrantor = true;
  try {
    anyGrantor = await workspaceHasActiveGrantor(prisma, actor, now);
  } catch {
    anyGrantor = true; // na dúvida, não afirma que o bootstrap é a causa
  }
  return fail(403, "GRANTOR_AUTHORITY_REQUIRED", "Você não tem autoridade para conceder ou revogar autoridade comercial neste workspace.", anyGrantor ? {} : { bootstrap: BOOTSTRAP_BLOCKED });
}

export async function grantCommercialAuthority(
  prisma: Prisma,
  input: GrantInput,
  options: { now?: Date; audit?: AuditWriter } = {},
): Promise<{ ok: true; designation: Designation } | AuthorityFailure> {
  const now = options.now ?? new Date();
  const audit = options.audit ?? writeAuditEvent;
  const tenantId = typeof input.tenantId === "string" ? input.tenantId.trim() : "";
  const workspaceId = typeof input.workspaceId === "string" ? input.workspaceId.trim() : "";
  const actorUserId = typeof input.actorUserId === "string" ? input.actorUserId.trim() : "";
  const beneficiaryUserId = typeof input.beneficiaryUserId === "string" ? input.beneficiaryUserId.trim() : "";
  if (!tenantId || !workspaceId) return fail(400, "AUTH_CONTEXT_INVALID", "Tenant e workspace são obrigatórios.");
  // Token sem pessoa associada (serviço, agente, automação) nunca concede nem revoga.
  if (!actorUserId) return fail(403, "IDENTITY_REQUIRED", "A concessão exige uma pessoa autenticada.");
  const baseMeta = {
    tenantId, workspaceId, actorUserId, tokenId: input.actorTokenId ?? null, beneficiaryUserId,
    scope: COMMERCIAL_SCOPE, role: input.role, evidenceRef: input.evidenceRef,
  };

  if (input.decision !== "grant") return fail(400, "DECISION_REQUIRED", "A decisão de conceder precisa ser explícita (decision: \"grant\").");
  if (!AUTHORITY_ROLES.includes(input.role)) return fail(400, "INVALID_ROLE", "Papel de autoridade inválido.");
  if (!beneficiaryUserId) return fail(400, "BENEFICIARY_REQUIRED", "A pessoa beneficiária é obrigatória.");
  if (typeof input.evidenceRef !== "string" || !EVIDENCE_REF.test(input.evidenceRef)) {
    return fail(400, "EVIDENCE_REF_REQUIRED", "Informe uma referência de evidência da decisão (3 a 120 caracteres, sem espaços).");
  }
  if (beneficiaryUserId === actorUserId) {
    await auditDenial(prisma, { eventType: "commercial_authority.grant.denied", metadata: { ...baseMeta, outcome: "denied", reasonCode: "SELF_GRANT_FORBIDDEN", decidedAt: now.toISOString() } });
    return fail(403, "SELF_GRANT_FORBIDDEN", "Ninguém concede autoridade comercial a si mesmo.");
  }
  const validUntil = new Date(input.validUntil);
  if (Number.isNaN(validUntil.getTime()) || validUntil.getTime() <= now.getTime()) return fail(400, "VALIDITY_INVALID", "A validade precisa ser uma data futura.");
  if (validUntil.getTime() - now.getTime() > MAX_DESIGNATION_DAYS * 86_400_000) return fail(400, "VALIDITY_EXCEEDS_MAXIMUM", `A validade máxima de uma designação é ${MAX_DESIGNATION_DAYS} dias.`);
  const rawLimits = input.limits ?? {};
  const requestedLimits: AuthorityLimits = {
    allowedScopes: Array.isArray(rawLimits.allowedScopes) ? Array.from(new Set(rawLimits.allowedScopes)) as DelegationScope[] : [...DEFAULT_AUTHORITY_LIMITS.allowedScopes],
    maxValidityDays: rawLimits.maxValidityDays ?? DEFAULT_AUTHORITY_LIMITS.maxValidityDays,
  };
  if (requestedLimits.allowedScopes.length === 0 || !requestedLimits.allowedScopes.every((scope) => DELEGATION_SCOPES.includes(scope))) {
    return fail(400, "LIMITS_INVALID", "allowedScopes deve conter ao menos um de: read, execute, admin.");
  }
  if (!Number.isInteger(requestedLimits.maxValidityDays) || requestedLimits.maxValidityDays < 1 || requestedLimits.maxValidityDays > MAX_DESIGNATION_DAYS) {
    return fail(400, "LIMITS_INVALID", `maxValidityDays deve ser um inteiro entre 1 e ${MAX_DESIGNATION_DAYS}.`);
  }

  try {
    await ensureCommercialAuthorityStore(prisma);
  } catch {
    return fail(503, "AUTHORITY_STORE_UNAVAILABLE", "O registro de designações comerciais está indisponível. Nada foi concedido.");
  }

  const grantorCheck = await requireActiveGrantor(prisma, { tenantId, workspaceId, userId: actorUserId }, now);
  if (!grantorCheck.ok) {
    await auditDenial(prisma, { eventType: "commercial_authority.grant.denied", metadata: { ...baseMeta, outcome: "denied", reasonCode: grantorCheck.code, decidedAt: now.toISOString() } });
    return grantorCheck;
  }
  const grantor = grantorCheck.grantor;

  // Ninguém concede o que não possui: validade e limites do concedente são o teto.
  if (validUntil.getTime() > new Date(grantor.validUntil).getTime()) {
    return fail(403, "EXCEEDS_GRANTOR_AUTHORITY", "A validade pedida excede a validade da autoridade de quem concede.");
  }
  if (!limitsWithin(requestedLimits, grantor.limits)) {
    return fail(403, "EXCEEDS_GRANTOR_AUTHORITY", "Os limites pedidos excedem os limites da autoridade de quem concede.");
  }

  let beneficiaryMembership: { status: string | null } | null;
  let otherRole: Designation | null;
  try {
    beneficiaryMembership = await readActiveMembershipStatus(prisma, { tenantId, workspaceId, userId: beneficiaryUserId });
    otherRole = await readActiveDesignation(prisma, { tenantId, workspaceId, userId: beneficiaryUserId, role: input.role === "holder" ? "grantor" : "holder", now });
  } catch {
    return fail(503, "AUTHORITY_CHECK_UNAVAILABLE", "Não foi possível verificar a pessoa beneficiária.");
  }
  if (!beneficiaryMembership || String(beneficiaryMembership.status ?? "").trim().toLowerCase() !== "active") {
    return fail(422, "BENEFICIARY_NOT_WORKSPACE_MEMBER", "A pessoa beneficiária precisa ser membro ativo deste workspace.");
  }
  if (otherRole) {
    return fail(409, "SEPARATION_OF_DUTIES", "Quem concede autoridade comercial não a usa, e vice-versa: a pessoa já tem a autoridade complementar neste workspace.");
  }

  const id = `cad_${crypto.randomUUID()}`;
  try {
    const designation = await prisma.$transaction(async (tx: Prisma) => {
      // Designações vencidas e não revogadas liberam o índice de unicidade.
      await tx.$executeRawUnsafe(
        `UPDATE eiah_commercial_authority_designations
         SET revoked_at = valid_until, revoke_reason = 'expired'
         WHERE tenant_id = $1 AND workspace_id = $2 AND beneficiary_user_id = $3 AND scope = $4 AND authority_role = $5
           AND revoked_at IS NULL AND valid_until <= $6`,
        tenantId, workspaceId, beneficiaryUserId, COMMERCIAL_SCOPE, input.role, now,
      );
      const auditEventId = await audit(tx, {
        eventType: "commercial_authority.grant.authorized",
        severity: "info",
        message: `commercial_authority.grant authorized (${input.role})`,
        metadata: {
          ...baseMeta,
          decisionRef: "AUTHZ-SCOPE-1/2026-10-12",
          formalRatification: "pending",
          designationId: id,
          grantorDesignationId: grantor.id,
          limits: requestedLimits,
          validUntil: validUntil.toISOString(),
          decision: "grant",
          outcome: "authorized",
          reasonCode: "GRANT_AUTHORIZED",
          decidedAt: now.toISOString(),
        },
      });
      await tx.$executeRawUnsafe(
        `INSERT INTO eiah_commercial_authority_designations
           (id, tenant_id, workspace_id, beneficiary_user_id, scope, authority_role, limits,
            granted_by_user_id, grantor_designation_id, evidence_ref, granted_at, valid_until, grant_audit_event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, $10, $11, $12, $13)`,
        id, tenantId, workspaceId, beneficiaryUserId, COMMERCIAL_SCOPE, input.role, JSON.stringify(requestedLimits),
        actorUserId, grantor.id, input.evidenceRef, now, validUntil, auditEventId,
      );
      return {
        id, tenantId, workspaceId, beneficiaryUserId, role: input.role, limits: requestedLimits,
        grantedByUserId: actorUserId, grantorDesignationId: grantor.id, evidenceRef: input.evidenceRef,
        grantedAt: now.toISOString(), validUntil: validUntil.toISOString(), revokedAt: null,
      } satisfies Designation;
    });
    return { ok: true, designation };
  } catch (error) {
    const code = (error as { code?: string; meta?: { code?: string }; message?: string })?.meta?.code ?? (error as { code?: string })?.code;
    if (code === "23505" || /unique|duplicate/i.test(String((error as Error)?.message ?? ""))) {
      return fail(409, "DESIGNATION_ALREADY_ACTIVE", "A pessoa já tem esta autoridade ativa neste workspace.");
    }
    return fail(503, "AUTHORITY_RECORD_UNAVAILABLE", "Não foi possível registrar a decisão e a designação. Nada foi concedido.");
  }
}

export type RevokeInput = {
  tenantId: string;
  workspaceId: string;
  actorUserId: string | null | undefined;
  actorTokenId?: string | null;
  designationId: string;
  reason: string;
  evidenceRef: string;
  /** Também revoga as designações concedidas por esta (útil quando o concedente perdeu a confiança). */
  cascade?: boolean;
};

export async function revokeCommercialAuthority(
  prisma: Prisma,
  input: RevokeInput,
  options: { now?: Date; audit?: AuditWriter } = {},
): Promise<{ ok: true; revokedIds: string[] } | AuthorityFailure> {
  const now = options.now ?? new Date();
  const audit = options.audit ?? writeAuditEvent;
  const tenantId = typeof input.tenantId === "string" ? input.tenantId.trim() : "";
  const workspaceId = typeof input.workspaceId === "string" ? input.workspaceId.trim() : "";
  const actorUserId = typeof input.actorUserId === "string" ? input.actorUserId.trim() : "";
  if (!tenantId || !workspaceId) return fail(400, "AUTH_CONTEXT_INVALID", "Tenant e workspace são obrigatórios.");
  if (!actorUserId) return fail(403, "IDENTITY_REQUIRED", "A revogação exige uma pessoa autenticada.");
  if (typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.length > REVOKE_REASON_MAX) {
    return fail(400, "REASON_REQUIRED", "Informe o motivo da revogação (3 a 300 caracteres).");
  }
  if (typeof input.evidenceRef !== "string" || !EVIDENCE_REF.test(input.evidenceRef)) {
    return fail(400, "EVIDENCE_REF_REQUIRED", "Informe uma referência de evidência da decisão (3 a 120 caracteres, sem espaços).");
  }

  let target: Designation | null;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT ${SELECT_DESIGNATION}
       FROM eiah_commercial_authority_designations
       WHERE id = $1 AND tenant_id = $2 AND workspace_id = $3 LIMIT 1`,
      input.designationId, tenantId, workspaceId,
    )) as Array<Record<string, unknown>>;
    target = rows[0] ? toDesignation(rows[0]) : null;
  } catch {
    return fail(503, "AUTHORITY_CHECK_UNAVAILABLE", "Não foi possível consultar a designação.");
  }
  // Outro tenant/workspace é indistinguível de inexistente.
  if (!target) return fail(404, "DESIGNATION_NOT_FOUND", "Designação não encontrada neste workspace.");
  if (target.revokedAt) return fail(409, "ALREADY_REVOKED", "Esta designação já foi revogada.");

  const baseMeta = {
    tenantId, workspaceId, actorUserId, tokenId: input.actorTokenId ?? null, beneficiaryUserId: target.beneficiaryUserId,
    scope: COMMERCIAL_SCOPE, role: target.role, designationId: target.id, evidenceRef: input.evidenceRef,
  };

  // Quem perde a autoridade pode renunciar; fora isso, só quem tem autoridade de concessão ATIVA revoga.
  let revoker: { designationId: string | null; renounce: boolean };
  if (actorUserId === target.beneficiaryUserId) {
    revoker = { designationId: null, renounce: true };
  } else {
    const check = await requireActiveGrantor(prisma, { tenantId, workspaceId, userId: actorUserId }, now);
    if (!check.ok) {
      await auditDenial(prisma, { eventType: "commercial_authority.revoke.denied", metadata: { ...baseMeta, outcome: "denied", reasonCode: check.code, decidedAt: now.toISOString() } });
      return check;
    }
    revoker = { designationId: check.grantor.id, renounce: false };
  }

  try {
    const revokedIds = await prisma.$transaction(async (tx: Prisma) => {
      const auditEventId = await audit(tx, {
        eventType: "commercial_authority.revoke.authorized",
        severity: "info",
        message: `commercial_authority.revoke authorized (${target!.role})`,
        metadata: {
          ...baseMeta,
          decisionRef: "AUTHZ-SCOPE-1/2026-10-12",
          formalRatification: "pending",
          revokerDesignationId: revoker.designationId,
          renounce: revoker.renounce,
          cascade: input.cascade === true,
          reason: input.reason.trim(),
          decision: "revoke",
          outcome: "authorized",
          reasonCode: "REVOKE_AUTHORIZED",
          decidedAt: now.toISOString(),
        },
      });
      const updated = (await tx.$queryRawUnsafe(
        `UPDATE eiah_commercial_authority_designations
         SET revoked_at = $1, revoked_by_user_id = $2, revoke_reason = $3, revoke_audit_event_id = $4
         WHERE tenant_id = $5 AND workspace_id = $6 AND revoked_at IS NULL
           AND (id = $7 OR ($8::boolean AND grantor_designation_id = $7))
         RETURNING id`,
        now, actorUserId, input.reason.trim(), auditEventId, tenantId, workspaceId, target!.id, input.cascade === true,
      )) as Array<{ id: string }>;
      return updated.map((row) => row.id);
    });
    return { ok: true, revokedIds };
  } catch {
    return fail(503, "AUTHORITY_RECORD_UNAVAILABLE", "Não foi possível registrar a decisão e a revogação. Nada foi revogado.");
  }
}

export async function readCommercialAuthorityStatus(
  prisma: Prisma,
  actor: { tenantId: string; workspaceId: string; userId: string | null | undefined },
  now: Date = new Date(),
) {
  const userId = typeof actor.userId === "string" ? actor.userId.trim() : "";
  if (!userId) return { ok: false as const, status: 403, code: "IDENTITY_REQUIRED", message: "A consulta exige uma pessoa autenticada." };
  try {
    const [holder, grantor, anyGrantor] = await Promise.all([
      readActiveDesignation(prisma, { ...actor, userId, role: "holder", now }),
      readActiveDesignation(prisma, { ...actor, userId, role: "grantor", now }),
      workspaceHasActiveGrantor(prisma, actor, now),
    ]);
    return {
      ok: true as const,
      holder: holder ? { designationId: holder.id, validUntil: holder.validUntil, limits: holder.limits } : null,
      grantor: grantor ? { designationId: grantor.id, validUntil: grantor.validUntil, limits: grantor.limits } : null,
      bootstrap: anyGrantor ? null : BOOTSTRAP_BLOCKED,
    };
  } catch {
    // Tabela ainda inexistente = nenhuma designação existe, e o bootstrap segue bloqueado; nada é afirmado além disso.
    return { ok: true as const, holder: null, grantor: null, bootstrap: BOOTSTRAP_BLOCKED };
  }
}

export async function listCommercialDesignations(
  prisma: Prisma,
  actor: { tenantId: string; workspaceId: string; userId: string | null | undefined },
  now: Date = new Date(),
): Promise<{ ok: true; designations: Designation[] } | AuthorityFailure> {
  const userId = typeof actor.userId === "string" ? actor.userId.trim() : "";
  if (!userId) return fail(403, "IDENTITY_REQUIRED", "A consulta exige uma pessoa autenticada.");
  const check = await requireActiveGrantor(prisma, { tenantId: actor.tenantId, workspaceId: actor.workspaceId, userId }, now);
  if (!check.ok) return check;
  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT ${SELECT_DESIGNATION}
       FROM eiah_commercial_authority_designations
       WHERE tenant_id = $1 AND workspace_id = $2
       ORDER BY granted_at DESC LIMIT 200`,
      actor.tenantId, actor.workspaceId,
    )) as Array<Record<string, unknown>>;
    return { ok: true, designations: rows.map(toDesignation) };
  } catch {
    return fail(503, "AUTHORITY_CHECK_UNAVAILABLE", "Não foi possível listar as designações.");
  }
}
