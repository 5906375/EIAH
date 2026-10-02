import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";
import { ensureWorkspaceResponsibilityStore, PRODUCT_ACTIVATION_PERMISSION } from "../workspaceResponsibility";
import { ensureTenantProductInstallationTable } from "./productActivation";
import {
  scoreVerticalAccess,
  type VerticalAccessRecommendation,
  type VerticalAccessScore,
  type VerticalAccessScoreFacts,
} from "./verticalAccessScore";

/**
 * ADR-011 §2.1–2.4 e §2.6: liberação de vertical pela EIAH por tenant + workspace + vertical.
 *
 * - O cliente (Founder ou `products.activate`) pede; o agente verificador calcula o score (só lê);
 *   um administrador da plataforma EIAH aprova ou recusa. O score nunca aprova sozinho.
 * - Sem liberação aprovada, nenhuma ativação acontece (barreira em `activateProductInstallation`).
 * - Quem já usava uma vertical antes da barreira fica "aprovado na migração" (idempotente).
 * - Toda mudança de estado gera um evento de auditoria.
 */

export const VERTICAL_ACCESS_STATUSES = [
  "pendente",
  "em_analise",
  "aguardando_humano",
  "aprovado",
  "recusado",
  "revogado",
] as const;
export type VerticalAccessStatus = (typeof VERTICAL_ACCESS_STATUSES)[number];

/** Estados em que o pedido já está com a EIAH e não precisa ser feito de novo. */
const OPEN_REQUEST_STATUSES: VerticalAccessStatus[] = ["pendente", "em_analise", "aguardando_humano"];

export const MIGRATION_ACTOR = "system:migration";
export const SCORING_ACTOR = "agent:vertical-access-reviewer";

export type VerticalAccessRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  vertical: string;
  status: VerticalAccessStatus;
  source: "request" | "migration";
  revocationMode: string | null;
  requestedByUserId: string | null;
  requestedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  note: string | null;
  score: number | null;
  recommendation: VerticalAccessRecommendation | null;
  scoreReasons: VerticalAccessScore["reasons"] | null;
  scoreRuleVersion: string | null;
  updatedAt: Date;
};

const SELECT_COLUMNS = `
  id,
  tenant_id AS "tenantId",
  workspace_id AS "workspaceId",
  vertical,
  status,
  source,
  revocation_mode AS "revocationMode",
  requested_by_user_id AS "requestedByUserId",
  requested_at AS "requestedAt",
  decided_by AS "decidedBy",
  decided_at AS "decidedAt",
  note,
  score,
  recommendation,
  score_reasons AS "scoreReasons",
  score_rule_version AS "scoreRuleVersion",
  updated_at AS "updatedAt"
`;

let storeReady = false;
let migrationBackfillDone = false;

/** Cria as tabelas se faltarem (mesmo SQL da migration) e marca, uma vez, quem já usava. */
export async function ensureVerticalAccessStore(prisma: PrismaClient) {
  if (!storeReady) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "vertical_access_approvals" (
        "id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "workspace_id" TEXT NOT NULL,
        "vertical" TEXT NOT NULL,
        "status" TEXT NOT NULL,
        "source" TEXT NOT NULL,
        "revocation_mode" TEXT,
        "requested_by_user_id" TEXT,
        "requested_at" TIMESTAMP(3),
        "decided_by" TEXT,
        "decided_at" TIMESTAMP(3),
        "note" TEXT,
        "score" INTEGER,
        "recommendation" TEXT,
        "score_reasons" JSONB,
        "score_rule_version" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vertical_access_approvals_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "vertical_access_approvals_status_check" CHECK (
          "status" IN ('pendente', 'em_analise', 'aguardando_humano', 'aprovado', 'recusado', 'revogado')
        ),
        CONSTRAINT "vertical_access_approvals_source_check" CHECK ("source" IN ('request', 'migration')),
        CONSTRAINT "vertical_access_approvals_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE UNIQUE INDEX IF NOT EXISTS "vertical_access_approvals_scope_key"
        ON "vertical_access_approvals"("tenant_id", "workspace_id", "vertical");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "vertical_access_approvals_status_idx"
        ON "vertical_access_approvals"("status", "updated_at");
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "vertical_access_approval_events" (
        "id" TEXT NOT NULL,
        "approval_id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "workspace_id" TEXT NOT NULL,
        "vertical" TEXT NOT NULL,
        "from_status" TEXT,
        "to_status" TEXT NOT NULL,
        "actor" TEXT NOT NULL,
        "note" TEXT,
        "score" INTEGER,
        "recommendation" TEXT,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vertical_access_approval_events_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS "vertical_access_approval_events_approval_idx"
        ON "vertical_access_approval_events"("approval_id", "created_at");
    `);
    storeReady = true;
  }
  if (!migrationBackfillDone) {
    await backfillMigratedApprovals(prisma);
    migrationBackfillDone = true;
  }
}

/**
 * ADR-011 §2.6: cada instalação ativa sem liberação vira "aprovado na migração" (sem score,
 * decisor sistema), só para aquele workspace. Quem ativou recebe `products.activate` ali, apenas
 * quando a liberação é criada agora — rodar de novo não devolve uma chave que o Founder tirou.
 */
export async function backfillMigratedApprovals(prisma: PrismaClient) {
  await ensureTenantProductInstallationTable(prisma);
  await ensureWorkspaceResponsibilityStore(prisma);
  await prisma.$executeRawUnsafe(`
    WITH inserted AS (
      INSERT INTO vertical_access_approvals (
        id, tenant_id, workspace_id, vertical, status, source, decided_by, decided_at, note, created_at, updated_at
      )
      SELECT
        gen_random_uuid()::text, i.tenant_id, i.workspace_id, i.product, 'aprovado', 'migration',
        '${MIGRATION_ACTOR}', NOW(), 'Aprovado na migração: vertical já ativa antes da liberação pela EIAH.', NOW(), NOW()
      FROM tenant_product_installations i
      WHERE i.status = 'active'
      ON CONFLICT (tenant_id, workspace_id, vertical) DO NOTHING
      RETURNING id, tenant_id, workspace_id, vertical
    ),
    audited AS (
      INSERT INTO vertical_access_approval_events (
        id, approval_id, tenant_id, workspace_id, vertical, from_status, to_status, actor, note, created_at
      )
      SELECT gen_random_uuid()::text, id, tenant_id, workspace_id, vertical, NULL, 'aprovado', '${MIGRATION_ACTOR}',
        'Aprovado na migração.', NOW()
      FROM inserted
      RETURNING approval_id
    )
    UPDATE eiah_workspace_memberships m
    SET permissions = m.permissions || '["${PRODUCT_ACTIVATION_PERMISSION}"]'::jsonb, updated_at = NOW()
    FROM inserted ins
    JOIN tenant_product_installations i
      ON i.tenant_id = ins.tenant_id AND i.workspace_id = ins.workspace_id AND i.product = ins.vertical
    WHERE m.user_id = i.activated_by_user_id
      AND m.tenant_id = ins.tenant_id
      AND m.workspace_id = ins.workspace_id
      AND NOT (m.permissions ? '${PRODUCT_ACTIVATION_PERMISSION}');
  `);
}

async function insertEvent(
  prisma: PrismaClient,
  row: Pick<VerticalAccessRow, "id" | "tenantId" | "workspaceId" | "vertical">,
  event: { from: VerticalAccessStatus | null; to: VerticalAccessStatus; actor: string; note?: string | null; score?: number | null; recommendation?: string | null },
) {
  await prisma.$executeRaw`
    INSERT INTO vertical_access_approval_events (
      id, approval_id, tenant_id, workspace_id, vertical, from_status, to_status, actor, note, score, recommendation, created_at
    )
    VALUES (
      ${crypto.randomUUID()}, ${row.id}, ${row.tenantId}, ${row.workspaceId}, ${row.vertical},
      ${event.from}, ${event.to}, ${event.actor}, ${event.note ?? null}, ${event.score ?? null}, ${event.recommendation ?? null}, NOW()
    )
  `;
}

export async function readVerticalAccess(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  vertical: string;
}): Promise<VerticalAccessRow | null> {
  await ensureVerticalAccessStore(params.prisma);
  const rows = await params.prisma.$queryRawUnsafe<VerticalAccessRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM vertical_access_approvals WHERE tenant_id = $1 AND workspace_id = $2 AND vertical = $3 LIMIT 1`,
    params.tenantId,
    params.workspaceId,
    params.vertical,
  );
  return rows[0] ?? null;
}

async function readVerticalAccessById(prisma: PrismaClient, id: string) {
  const rows = await prisma.$queryRawUnsafe<VerticalAccessRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM vertical_access_approvals WHERE id = $1 LIMIT 1`,
    id,
  );
  return rows[0] ?? null;
}

/** Barreira (ADR-011 §2.4): só ativa com liberação aprovada. */
export async function isVerticalAccessApproved(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  vertical: string;
}) {
  const row = await readVerticalAccess(params);
  return row?.status === "aprovado";
}

/** Sinais objetivos para o score; qualquer falha de leitura vira "sem score" (nunca aprovação). */
export async function collectVerticalAccessScoreFacts(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
}): Promise<VerticalAccessScoreFacts> {
  const { prisma, tenantId, workspaceId } = params;
  const count = (rows: Array<{ total: bigint | number }>) => Number(rows[0]?.total ?? 0);
  const [account, disputes, succeeded, failed, revocations, responsible] = await Promise.all([
    prisma.$queryRaw<Array<{ status: string }>>`
      SELECT status FROM tenant_billing_account WHERE tenant_id = ${tenantId} LIMIT 1
    `,
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total FROM billing_disputes WHERE tenant_id = ${tenantId} AND status = 'open'
    `,
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total FROM payment_intents
      WHERE tenant_id = ${tenantId} AND status = 'succeeded' AND updated_at >= NOW() - INTERVAL '90 days'
    `,
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total FROM payment_intents
      WHERE tenant_id = ${tenantId} AND status = 'failed' AND updated_at >= NOW() - INTERVAL '30 days'
    `,
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total FROM vertical_access_approval_events
      WHERE tenant_id = ${tenantId} AND to_status = 'revogado'
    `,
    prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*)::bigint AS total FROM eiah_workspace_memberships
      WHERE tenant_id = ${tenantId} AND workspace_id = ${workspaceId} AND status = 'active'
        AND (role_key = 'founder' OR permissions ? ${PRODUCT_ACTIVATION_PERMISSION})
    `,
  ]);
  return {
    billingAccountStatus: account[0]?.status ?? null,
    openDisputes: count(disputes),
    succeededPayments90d: count(succeeded),
    failedPayments30d: count(failed),
    priorRevocations: count(revocations),
    hasActivationResponsible: count(responsible) > 0,
  };
}

export type VerticalAccessRequestResult =
  | { outcome: "already_approved" | "already_requested"; approval: VerticalAccessRow }
  | { outcome: "requested"; approval: VerticalAccessRow };

/**
 * Pedido de liberação (ADR-011 §2.4). Quem pode pedir é verificado pela rota (Founder ou
 * `products.activate`). Pedido aberto não é duplicado; recusado ou revogado pode ser pedido de novo.
 */
export async function requestVerticalAccess(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  vertical: string;
  userId: string;
}): Promise<VerticalAccessRequestResult> {
  const { prisma, tenantId, workspaceId, vertical, userId } = params;
  const existing = await readVerticalAccess({ prisma, tenantId, workspaceId, vertical });
  if (existing?.status === "aprovado") return { outcome: "already_approved", approval: existing };
  if (existing && OPEN_REQUEST_STATUSES.includes(existing.status)) return { outcome: "already_requested", approval: existing };

  const id = existing?.id ?? crypto.randomUUID();
  const scope = { id, tenantId, workspaceId, vertical };
  if (existing) {
    await prisma.$executeRaw`
      UPDATE vertical_access_approvals
      SET status = 'pendente', source = 'request', revocation_mode = NULL, requested_by_user_id = ${userId},
          requested_at = NOW(), decided_by = NULL, decided_at = NULL, note = NULL, score = NULL,
          recommendation = NULL, score_reasons = NULL, score_rule_version = NULL, updated_at = NOW()
      WHERE id = ${id}
    `;
  } else {
    await prisma.$executeRaw`
      INSERT INTO vertical_access_approvals (
        id, tenant_id, workspace_id, vertical, status, source, requested_by_user_id, requested_at, created_at, updated_at
      )
      VALUES (${id}, ${tenantId}, ${workspaceId}, ${vertical}, 'pendente', 'request', ${userId}, NOW(), NOW(), NOW())
    `;
  }
  await insertEvent(prisma, scope, { from: existing?.status ?? null, to: "pendente", actor: `user:${userId}` });

  // Agente verificador: só lê e pontua. Falha de leitura = "sem score", nunca aprovação.
  let scored: VerticalAccessScore | null = null;
  try {
    scored = scoreVerticalAccess(await collectVerticalAccessScoreFacts({ prisma, tenantId, workspaceId }));
  } catch {
    scored = null;
  }
  await prisma.$executeRaw`
    UPDATE vertical_access_approvals
    SET status = 'aguardando_humano',
        score = ${scored?.score ?? null},
        recommendation = ${scored?.recommendation ?? null},
        score_reasons = ${scored ? JSON.stringify(scored.reasons) : null}::jsonb,
        score_rule_version = ${scored?.ruleVersion ?? null},
        updated_at = NOW()
    WHERE id = ${id}
  `;
  await insertEvent(prisma, scope, {
    from: "pendente",
    to: "aguardando_humano",
    actor: SCORING_ACTOR,
    note: scored ? null : "Sem score: não foi possível ler os sinais de billing.",
    score: scored?.score ?? null,
    recommendation: scored?.recommendation ?? null,
  });

  const approval = await readVerticalAccessById(prisma, id);
  if (!approval) throw new Error("VERTICAL_ACCESS_WRITE_FAILED");
  return { outcome: "requested", approval };
}

export type VerticalAccessDecision = "aprovar" | "recusar";

export type VerticalAccessDecisionResult =
  | { ok: true; approval: VerticalAccessRow }
  | { ok: false; code: "VERTICAL_ACCESS_NOT_FOUND" | "VERTICAL_ACCESS_NOT_AWAITING_DECISION" | "VERTICAL_ACCESS_NOTE_REQUIRED" };

/** A observação é obrigatória ao recusar e ao decidir contra a recomendação do agente (ADR-011 §2.3). */
export function decisionRequiresNote(decision: VerticalAccessDecision, recommendation: VerticalAccessRecommendation | null) {
  if (decision === "recusar") return true;
  return recommendation === "nao_recomendado";
}

/** Decisão humana do administrador da plataforma EIAH. Só decide pedido que aguarda humano. */
export async function decideVerticalAccess(params: {
  prisma: PrismaClient;
  approvalId: string;
  adminEmail: string;
  decision: VerticalAccessDecision;
  note?: string | null;
}): Promise<VerticalAccessDecisionResult> {
  const { prisma, approvalId, adminEmail, decision } = params;
  await ensureVerticalAccessStore(prisma);
  const current = await readVerticalAccessById(prisma, approvalId);
  if (!current) return { ok: false, code: "VERTICAL_ACCESS_NOT_FOUND" };
  if (!OPEN_REQUEST_STATUSES.includes(current.status)) return { ok: false, code: "VERTICAL_ACCESS_NOT_AWAITING_DECISION" };
  const note = params.note?.trim() || null;
  if (decisionRequiresNote(decision, current.recommendation) && !note) return { ok: false, code: "VERTICAL_ACCESS_NOTE_REQUIRED" };

  const nextStatus: VerticalAccessStatus = decision === "aprovar" ? "aprovado" : "recusado";
  const actor = `admin:${adminEmail}`;
  // Só muda se ainda estiver aberto (duas decisões simultâneas não passam as duas).
  const updated = await prisma.$executeRaw`
    UPDATE vertical_access_approvals
    SET status = ${nextStatus}, decided_by = ${actor}, decided_at = NOW(), note = ${note}, updated_at = NOW()
    WHERE id = ${approvalId} AND status IN ('pendente', 'em_analise', 'aguardando_humano')
  `;
  if (!updated) return { ok: false, code: "VERTICAL_ACCESS_NOT_AWAITING_DECISION" };
  await insertEvent(prisma, current, {
    from: current.status,
    to: nextStatus,
    actor,
    note,
    score: current.score,
    recommendation: current.recommendation,
  });
  const approval = await readVerticalAccessById(prisma, approvalId);
  return approval ? { ok: true, approval } : { ok: false, code: "VERTICAL_ACCESS_NOT_FOUND" };
}

export type AdminVerticalAccessItem = {
  id: string;
  tenantName: string;
  workspaceName: string;
  vertical: string;
  status: VerticalAccessStatus;
  source: "request" | "migration";
  requestedBy: string | null;
  requestedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  note: string | null;
  score: number | null;
  recommendation: VerticalAccessRecommendation | null;
  scoreReasons: VerticalAccessScore["reasons"] | null;
  scoreRuleVersion: string | null;
};

/**
 * Fila do administrador EIAH (ADR-011 §2.3): pedidos aguardando decisão primeiro, por score.
 * Mostra só dados do pedido e sinais do score — nunca dados de negócio ou PII do cliente.
 */
export async function listVerticalAccessForAdmin(params: { prisma: PrismaClient; limit?: number }) {
  await ensureVerticalAccessStore(params.prisma);
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  return params.prisma.$queryRawUnsafe<AdminVerticalAccessItem[]>(
    `
    SELECT
      a.id,
      COALESCE(t.name, a.tenant_id) AS "tenantName",
      COALESCE(w.name, a.workspace_id) AS "workspaceName",
      a.vertical,
      a.status,
      a.source,
      u.display_name AS "requestedBy",
      a.requested_at AS "requestedAt",
      a.decided_by AS "decidedBy",
      a.decided_at AS "decidedAt",
      a.note,
      a.score,
      a.recommendation,
      a.score_reasons AS "scoreReasons",
      a.score_rule_version AS "scoreRuleVersion"
    FROM vertical_access_approvals a
    LEFT JOIN tenants t ON t.id = a.tenant_id
    LEFT JOIN workspaces w ON w.id = a.workspace_id
    LEFT JOIN users u ON u.id = a.requested_by_user_id
    ORDER BY
      CASE WHEN a.status IN ('pendente', 'em_analise', 'aguardando_humano') THEN 0 ELSE 1 END,
      a.score DESC NULLS LAST,
      a.updated_at DESC
    LIMIT $1
    `,
    limit,
  );
}

