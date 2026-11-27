import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";
import { ensureWorkspaceResponsibilityStore, PRODUCT_ACTIVATION_PERMISSION } from "../workspaceResponsibility";
import { runIdempotentDdl } from "../idempotentDdl";
import { ensureTenantProductInstallationTable } from "./productActivation";
import { recordVerticalAccessNotice, type VerticalAccessNoticeKind } from "./verticalAccessNotices";
import {
  AWAITING_DECISION_STATUS_VALUES,
  decisionRequiresNote,
  evaluationPhase,
  PRODUCTION_EVALUATION_DEPS,
  resolveEffectiveVerticalAccess,
  resolveVerticalUsage,
  type VerticalUsage,
  type EvaluationDeps,
  type EvaluationKind,
  type EvaluationPhase,
  type EvaluationRequestContext,
} from "./verticalEvaluationContract";
import { OPEN_REQUEST_STATUS_VALUES, planVerticalAccessRequest } from "./verticalEvaluationPlans";
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
 * - Revogação em três modos (§2.5), sem apagar nada; o modo pode ser trocado ou a liberação restaurada.
 * - Toda mudança de estado gera um evento de auditoria.
 */

export const VERTICAL_ACCESS_STATUSES = [
  "pendente",
  "em_analise",
  "aguardando_humano",
  "aprovado",
  "recusado",
  "revogado",
  // Avaliação gratuita: decisão humana feita, ainda sem ativação (aceite pendente ou aceito). Nenhum leitor que só
  // aceita `aprovado` concede acesso neste estado. `encerrado` é o fim regular (validade vencida), distinto de `revogado`.
  "pre_ativacao",
  "encerrado",
] as const;
export type VerticalAccessStatus = (typeof VERTICAL_ACCESS_STATUSES)[number];

/** Estados em que o pedido aguarda DECISÃO do administrador. */
export const AWAITING_DECISION_STATUSES: VerticalAccessStatus[] = [...AWAITING_DECISION_STATUS_VALUES];
/** Estados em que o pedido já está com a EIAH e não precisa ser feito de novo. */
export const OPEN_REQUEST_STATUSES: VerticalAccessStatus[] = [...OPEN_REQUEST_STATUS_VALUES];

/**
 * ADR-011 §2.5. `somente_leitura` (padrão): consulta sim, nenhuma escrita. `bloqueio_total`: nenhum
 * acesso à vertical. `sem_nova_ativacao`: o uso atual continua, mas não há nova ativação.
 */
export const REVOCATION_MODES = ["somente_leitura", "bloqueio_total", "sem_nova_ativacao"] as const;
export type VerticalRevocationMode = (typeof REVOCATION_MODES)[number];
export const DEFAULT_REVOCATION_MODE: VerticalRevocationMode = "somente_leitura";

/** Uso permitido da vertical, derivado só da liberação (tipo definido no contrato puro; reexportado). */
export type { VerticalUsage };

/** Canal de cada mudança, registrado na auditoria (ADR-011 §2.4). */
export const VERTICAL_ACCESS_CHANNELS = ["marketplace", "tela", "chat"] as const;
export type VerticalAccessChannel = (typeof VERTICAL_ACCESS_CHANNELS)[number];

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
  /** Contexto informado pelo solicitante (qualificação confirmada no chat). Só existe em pedidos de avaliação. */
  requestContext: unknown;
  grantKind: EvaluationKind | null;
  grantTerms: unknown;
  grantTermsHash: string | null;
  grantAcceptedBy: string | null;
  grantAcceptedAt: Date | null;
  grantAcceptedHash: string | null;
  grantStartedAt: Date | null;
  grantValidUntil: Date | null;
  grantClosedReason: string | null;
  evaluationUsedAt: Date | null;
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
  updated_at AS "updatedAt",
  request_context AS "requestContext",
  grant_kind AS "grantKind",
  grant_terms AS "grantTerms",
  grant_terms_hash AS "grantTermsHash",
  grant_accepted_by AS "grantAcceptedBy",
  grant_accepted_at AS "grantAcceptedAt",
  grant_accepted_hash AS "grantAcceptedHash",
  grant_started_at AS "grantStartedAt",
  grant_valid_until AS "grantValidUntil",
  grant_closed_reason AS "grantClosedReason",
  evaluation_used_at AS "evaluationUsedAt"
`;

/**
 * Restrições da avaliação (mesmo SQL da migration `vertical_access_evaluation_grant_v1`). A de integridade impede,
 * no banco, um grant `pre_ativacao`/`aprovado` sem termos e hash, e um `aprovado` sem aceite, início e validade.
 */
export const EVALUATION_CONSTRAINTS_SQL = `
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'vertical_access_approvals_status_check' AND pg_get_constraintdef(oid) LIKE '%pre_ativacao%'
    ) THEN
      ALTER TABLE "vertical_access_approvals" DROP CONSTRAINT IF EXISTS "vertical_access_approvals_status_check";
      ALTER TABLE "vertical_access_approvals" ADD CONSTRAINT "vertical_access_approvals_status_check" CHECK (
        "status" IN ('pendente', 'em_analise', 'aguardando_humano', 'aprovado', 'recusado', 'revogado', 'pre_ativacao', 'encerrado')
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vertical_access_approvals_grant_kind_check') THEN
      ALTER TABLE "vertical_access_approvals" ADD CONSTRAINT "vertical_access_approvals_grant_kind_check" CHECK (
        "grant_kind" IS NULL OR "grant_kind" IN ('evaluation')
      );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vertical_access_approvals_grant_integrity_check') THEN
      ALTER TABLE "vertical_access_approvals" ADD CONSTRAINT "vertical_access_approvals_grant_integrity_check" CHECK (
        "grant_kind" IS NULL
        OR "status" NOT IN ('pre_ativacao', 'aprovado')
        OR (
          "grant_terms" IS NOT NULL AND "grant_terms_hash" IS NOT NULL
          AND (
            "status" <> 'aprovado'
            OR ("grant_accepted_hash" IS NOT NULL AND "grant_started_at" IS NOT NULL AND "grant_valid_until" IS NOT NULL)
          )
        )
      );
    END IF;
  END $$;
`;

let storeReady = false;
let migrationBackfillDone = false;

/** Cria as tabelas se faltarem (mesmo SQL da migration) e marca, uma vez, quem já usava. */
export async function ensureVerticalAccessStore(prisma: PrismaClient) {
  if (!storeReady) {
    await runIdempotentDdl(prisma, `
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
          "status" IN ('pendente', 'em_analise', 'aguardando_humano', 'aprovado', 'recusado', 'revogado', 'pre_ativacao', 'encerrado')
        ),
        CONSTRAINT "vertical_access_approvals_source_check" CHECK ("source" IN ('request', 'migration')),
        CONSTRAINT "vertical_access_approvals_score_check" CHECK ("score" IS NULL OR ("score" >= 0 AND "score" <= 100))
      );
    `);
    await runIdempotentDdl(prisma, `
      CREATE UNIQUE INDEX IF NOT EXISTS "vertical_access_approvals_scope_key"
        ON "vertical_access_approvals"("tenant_id", "workspace_id", "vertical");
    `);
    await runIdempotentDdl(prisma, `
      CREATE INDEX IF NOT EXISTS "vertical_access_approvals_status_idx"
        ON "vertical_access_approvals"("status", "updated_at");
    `);
    await runIdempotentDdl(prisma, `
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
    await runIdempotentDdl(prisma, `
      CREATE INDEX IF NOT EXISTS "vertical_access_approval_events_approval_idx"
        ON "vertical_access_approval_events"("approval_id", "created_at");
    `);
    await runIdempotentDdl(prisma, `
      ALTER TABLE "vertical_access_approval_events" ADD COLUMN IF NOT EXISTS "revocation_mode" TEXT;
    `);
    await runIdempotentDdl(prisma, `
      ALTER TABLE "vertical_access_approval_events" ADD COLUMN IF NOT EXISTS "channel" TEXT;
    `);
    await runIdempotentDdl(prisma, `
      CREATE TABLE IF NOT EXISTS "vertical_access_notices" (
        "id" TEXT NOT NULL,
        "approval_id" TEXT NOT NULL,
        "tenant_id" TEXT NOT NULL,
        "workspace_id" TEXT NOT NULL,
        "vertical" TEXT NOT NULL,
        "kind" TEXT NOT NULL,
        "message" TEXT NOT NULL,
        "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vertical_access_notices_pkey" PRIMARY KEY ("id")
      );
    `);
    await runIdempotentDdl(prisma, `
      CREATE INDEX IF NOT EXISTS "vertical_access_notices_scope_idx"
        ON "vertical_access_notices"("tenant_id", "workspace_id", "created_at");
    `);
    await runIdempotentDdl(prisma, `
      CREATE TABLE IF NOT EXISTS "vertical_access_notice_reads" (
        "notice_id" TEXT NOT NULL,
        "user_id" TEXT NOT NULL,
        "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "vertical_access_notice_reads_pkey" PRIMARY KEY ("notice_id", "user_id")
      );
    `);
    // Avaliação gratuita: colunas aditivas (todas nulas) + restrições. Linhas existentes não mudam.
    await runIdempotentDdl(prisma, `
      ALTER TABLE "vertical_access_approvals"
        ADD COLUMN IF NOT EXISTS "request_context" JSONB,
        ADD COLUMN IF NOT EXISTS "grant_kind" TEXT,
        ADD COLUMN IF NOT EXISTS "grant_terms" JSONB,
        ADD COLUMN IF NOT EXISTS "grant_terms_hash" TEXT,
        ADD COLUMN IF NOT EXISTS "grant_accepted_by" TEXT,
        ADD COLUMN IF NOT EXISTS "grant_accepted_at" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "grant_accepted_hash" TEXT,
        ADD COLUMN IF NOT EXISTS "grant_started_at" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "grant_valid_until" TIMESTAMP(3),
        ADD COLUMN IF NOT EXISTS "grant_closed_reason" TEXT,
        ADD COLUMN IF NOT EXISTS "evaluation_used_at" TIMESTAMP(3);
    `);
    await runIdempotentDdl(prisma, `
      ALTER TABLE "vertical_access_approval_events" ADD COLUMN IF NOT EXISTS "detail" JSONB;
    `);
    await runIdempotentDdl(prisma, EVALUATION_CONSTRAINTS_SQL);
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

export async function insertVerticalAccessEvent(
  prisma: PrismaClient,
  row: Pick<VerticalAccessRow, "id" | "tenantId" | "workspaceId" | "vertical">,
  event: {
    from: VerticalAccessStatus | null;
    to: VerticalAccessStatus;
    actor: string;
    note?: string | null;
    score?: number | null;
    recommendation?: string | null;
    revocationMode?: VerticalRevocationMode | null;
    channel?: VerticalAccessChannel | null;
    /** Snapshot estruturado da transição (termos, hash, motivo). Preserva o histórico quando a linha é reescrita. */
    detail?: Record<string, unknown> | null;
  },
) {
  await prisma.$executeRaw`
    INSERT INTO vertical_access_approval_events (
      id, approval_id, tenant_id, workspace_id, vertical, from_status, to_status, actor, note, score, recommendation,
      revocation_mode, channel, detail, created_at
    )
    VALUES (
      ${crypto.randomUUID()}, ${row.id}, ${row.tenantId}, ${row.workspaceId}, ${row.vertical},
      ${event.from}, ${event.to}, ${event.actor}, ${event.note ?? null}, ${event.score ?? null}, ${event.recommendation ?? null},
      ${event.revocationMode ?? null}::text, ${event.channel ?? null}::text,
      ${event.detail ? JSON.stringify(event.detail) : null}::jsonb, NOW()
    )
  `;
}
const insertEvent = insertVerticalAccessEvent;

/**
 * Leitura do registro de liberação, já com o ACESSO EFETIVO (avaliação gratuita): um grant `aprovado` cujos termos/aceite
 * estão inconsistentes ou cuja validade venceu é devolvido como `encerrado`, mesmo que a escrita de fechamento falhe.
 * Linhas sem `grant_kind` voltam exatamente como estão no banco. `now` é injetável para teste.
 */
export async function readVerticalAccess(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  vertical: string;
  now?: Date;
}): Promise<VerticalAccessRow | null> {
  await ensureVerticalAccessStore(params.prisma);
  const rows = await params.prisma.$queryRawUnsafe<VerticalAccessRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM vertical_access_approvals WHERE tenant_id = $1 AND workspace_id = $2 AND vertical = $3 LIMIT 1`,
    params.tenantId,
    params.workspaceId,
    params.vertical,
  );
  const now = params.now ?? new Date();
  const raw = rows[0] ?? null;
  const effective = resolveEffectiveVerticalAccess(raw, now);
  if (raw && effective.closure) {
    // Persistir o fechamento é opcional para a negação (que já vale acima): falha aqui não reabre o acesso.
    await materializeEvaluationClosure(params.prisma, raw, now).catch(() => undefined);
  }
  return effective.row;
}

export const EVALUATION_EXPIRY_ACTOR = "system:evaluation-expiry";

/**
 * Fechamento regular, protegido contra concorrência. Dentro de uma transação: (1) relê a linha com `FOR UPDATE`;
 * (2) REAVALIA a condição de encerramento sobre a linha relida (um grant renovado, reiniciado ou já fechado por outro
 * processo não é fechado por uma avaliação antiga); (3) faz o UPDATE só se a VERSÃO do grant avaliado ainda for a gravada
 * (hash dos termos, início e validade) e, no caso de validade, se ela já venceu; (4) grava evento e aviso só se o UPDATE
 * alterou a linha. Não é revogação disciplinar: o status é `encerrado` e o modo vem dos termos.
 */
async function materializeEvaluationClosure(prisma: PrismaClient, evaluated: VerticalAccessRow, now: Date) {
  await prisma.$transaction(async (tx) => {
    const client = tx as unknown as PrismaClient;
    const locked = await lockVerticalAccessRow(client, { id: evaluated.id });
    if (!locked) return;
    const closure = resolveEffectiveVerticalAccess(locked, now).closure;
    if (!closure) return;
    const updated = await client.$executeRaw`
      UPDATE vertical_access_approvals
      SET status = 'encerrado', revocation_mode = ${closure.mode}::text, grant_closed_reason = ${closure.reason}, updated_at = NOW()
      WHERE id = ${locked.id} AND status = 'aprovado' AND grant_kind = 'evaluation'
        AND grant_terms_hash IS NOT DISTINCT FROM ${locked.grantTermsHash}::text
        AND grant_started_at IS NOT DISTINCT FROM ${locked.grantStartedAt}::timestamp
        AND grant_valid_until IS NOT DISTINCT FROM ${locked.grantValidUntil}::timestamp
        AND (${closure.reason}::text <> 'expired' OR grant_valid_until <= ${now}::timestamp)
    `;
    if (!updated) return;
    await insertVerticalAccessEvent(client, locked, {
      from: "aprovado",
      to: "encerrado",
      actor: EVALUATION_EXPIRY_ACTOR,
      revocationMode: closure.mode,
      note: closure.reason === "expired" ? "Validade da avaliação vencida." : "Termos inconsistentes: acesso encerrado por segurança.",
      detail: { reason: closure.reason, termsHash: locked.grantTermsHash, validUntil: locked.grantValidUntil?.toISOString?.() ?? null },
    });
    await recordVerticalAccessNotice(client, locked, "avaliacao_encerrada");
  });
}

/** Leitura crua por id (sem acesso efetivo): para a fila administrativa e para as transições. */
export async function readVerticalAccessRowById(prisma: PrismaClient, id: string) {
  await ensureVerticalAccessStore(prisma);
  return readVerticalAccessById(prisma, id);
}

/**
 * Releitura com trava de linha (`FOR UPDATE`) DENTRO de uma transação: a transição reavalia as condições sobre a versão
 * que de fato vai alterar. Dois processos na mesma linha se serializam; o segundo vê o resultado do primeiro.
 */
export async function lockVerticalAccessRow(
  client: PrismaClient,
  by: { id: string } | { tenantId: string; workspaceId: string; vertical: string },
): Promise<VerticalAccessRow | null> {
  const rows =
    "id" in by
      ? await client.$queryRawUnsafe<VerticalAccessRow[]>(`SELECT ${SELECT_COLUMNS} FROM vertical_access_approvals WHERE id = $1 FOR UPDATE`, by.id)
      : await client.$queryRawUnsafe<VerticalAccessRow[]>(
          `SELECT ${SELECT_COLUMNS} FROM vertical_access_approvals WHERE tenant_id = $1 AND workspace_id = $2 AND vertical = $3 FOR UPDATE`,
          by.tenantId,
          by.workspaceId,
          by.vertical,
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

/**
 * Uso permitido pela liberação (ADR-011 §2.5): regra PURA em `verticalEvaluationContract` (testável sem banco), reexportada
 * aqui para os consumidores existentes. Linhas sem grant de avaliação mantêm o comportamento legado; com grant, o uso nunca é
 * `full` antes da ativação efetiva (pendente, recusado, termos propostos/aceitos).
 */
export { resolveVerticalUsage };

export async function readVerticalUsage(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  vertical: string;
}): Promise<{ usage: VerticalUsage; approval: VerticalAccessRow | null }> {
  const approval = await readVerticalAccess(params);
  return { usage: resolveVerticalUsage(approval), approval };
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
      SELECT COUNT(DISTINCT approval_id)::bigint AS total FROM vertical_access_approval_events
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
  | { outcome: "already_approved" | "already_requested" | "evaluation_already_used"; approval: VerticalAccessRow }
  | { outcome: "requested"; approval: VerticalAccessRow }
  /** Oferta de avaliação desligada, bloqueada ou incompleta (checado AQUI, também para chamadas internas). Nada foi gravado. */
  | { outcome: "evaluation_unavailable" };

/**
 * Pedido de liberação (ADR-011 §2.4). Quem pode pedir é verificado pela rota (Founder ou
 * `products.activate`). Pedido aberto não é duplicado; recusado ou revogado pode ser pedido de novo.
 * Um novo pedido depois de revogação mantém o modo de revogação até a EIAH aprovar.
 */
export type VerticalAccessRequestParams = {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  vertical: string;
  userId: string;
  channel?: VerticalAccessChannel;
  /** Pedido de AVALIAÇÃO (contexto já validado pela rota). Ausente = pedido padrão, como sempre. */
  evaluation?: EvaluationRequestContext | null;
};

/** Operação real: oferta e relógio de produção (decisões obrigatórias reais). Nenhum parâmetro público os substitui. */
export function requestVerticalAccess(params: VerticalAccessRequestParams): Promise<VerticalAccessRequestResult> {
  return requestVerticalAccessCore(params, PRODUCTION_EVALUATION_DEPS);
}

/** Núcleo com dependências explícitas: composição de testes. Pedido de avaliação com oferta não habilitada não grava nada. */
export async function requestVerticalAccessCore(params: VerticalAccessRequestParams, deps: EvaluationDeps): Promise<VerticalAccessRequestResult> {
  const { prisma, tenantId, workspaceId, vertical, userId } = params;
  const channel = params.channel ?? "marketplace";
  const evaluation = params.evaluation ?? null;
  const now = deps.clock();
  // Barreira no serviço (não só na rota): pedido de avaliação sem oferta habilitada (também chamada interna) não grava nada.
  if (evaluation && planVerticalAccessRequest({ existing: null, evaluation: true, vertical, offer: deps.offer() }).ok === false) {
    return { outcome: "evaluation_unavailable" };
  }
  const existing = await readVerticalAccess({ prisma, tenantId, workspaceId, vertical, now });
  const plan = planVerticalAccessRequest({ existing, evaluation: Boolean(evaluation), vertical, offer: deps.offer() });
  if (!plan.ok) {
    if (plan.outcome === "evaluation_unavailable" || !existing) return { outcome: "evaluation_unavailable" };
    return { outcome: plan.outcome, approval: existing };
  }
  const evaluationJson = evaluation ? JSON.stringify(evaluation) : null;
  // Histórico: o pedido reescreve a linha; o grant anterior (termos, aceite, início, validade, motivo) fica no evento.
  const archivedGrant = existing?.grantKind
    ? {
        archivedGrant: {
          kind: existing.grantKind,
          status: existing.status,
          terms: existing.grantTerms ?? null,
          termsHash: existing.grantTermsHash,
          acceptedAt: existing.grantAcceptedAt?.toISOString?.() ?? null,
          startedAt: existing.grantStartedAt?.toISOString?.() ?? null,
          validUntil: existing.grantValidUntil?.toISOString?.() ?? null,
          closedReason: existing.grantClosedReason,
        },
      }
    : null;

  const id = existing?.id ?? crypto.randomUUID();
  const scope = { id, tenantId, workspaceId, vertical };
  // A escrita perdeu uma disputa (a linha mudou, ou outro pedido criou a linha do escopo, depois da leitura): o resultado segue o
  // MESMO planejador sobre a leitura nova (aprovada ⇒ already_approved, aberta ⇒ already_requested, avaliação já iniciada ⇒
  // evaluation_already_used). Se ainda estiver "pedível" mas a escrita não a alterou, é falha explícita: nunca se devolve um
  // resultado que não corresponde ao estado real.
  const settleLostWrite = async (): Promise<VerticalAccessRequestResult> => {
    const current = await readVerticalAccess({ prisma, tenantId, workspaceId, vertical, now });
    const again = planVerticalAccessRequest({ existing: current, evaluation: Boolean(evaluation), vertical, offer: deps.offer() });
    if (!again.ok && again.outcome !== "evaluation_unavailable" && current) return { outcome: again.outcome, approval: current };
    if (!again.ok && again.outcome === "evaluation_unavailable") return { outcome: "evaluation_unavailable" };
    throw new Error("VERTICAL_ACCESS_WRITE_FAILED");
  };
  if (existing) {
    // O UPDATE só vale sobre uma linha ainda "pedível" (nunca sobre uma aprovada/aberta que mudou depois da leitura) ou sobre
    // um grant cuja validade já venceu. `revocation_mode` grava o modo EFETIVO lido: uma avaliação encerrada (cujo
    // fechamento pode não ter sido persistido) mantém a restrição enquanto o novo pedido aguarda, nunca volta ao uso pleno.
    // A 3ª condição cobre o grant lido como ENCERRADO (validade vencida ou termos inconsistentes) cujo fechamento ainda não foi
    // persistido: a linha crua continua 'aprovado'. Só é reescrita se ainda for a MESMA versão do grant avaliado (hash, início e
    // validade); um grant renovado ou alterado depois da leitura nunca é sobrescrito por um pedido baseado em leitura antiga.
    const updated = await prisma.$executeRaw`
      UPDATE vertical_access_approvals
      SET status = 'pendente', source = 'request', requested_by_user_id = ${userId},
          requested_at = NOW(), decided_by = NULL, decided_at = NULL, note = NULL, score = NULL,
          recommendation = NULL, score_reasons = NULL, score_rule_version = NULL, updated_at = NOW(),
          revocation_mode = ${existing.revocationMode ?? null}::text,
          grant_kind = ${evaluation ? "evaluation" : null}::text, request_context = ${evaluationJson}::jsonb,
          grant_terms = NULL, grant_terms_hash = NULL, grant_accepted_by = NULL, grant_accepted_at = NULL,
          grant_accepted_hash = NULL, grant_started_at = NULL, grant_valid_until = NULL, grant_closed_reason = NULL
      WHERE id = ${id}
        AND (
          status IN ('recusado', 'revogado', 'encerrado')
          OR (
            ${existing.status}::text = 'encerrado' AND status = 'aprovado' AND grant_kind = 'evaluation'
            AND grant_terms_hash IS NOT DISTINCT FROM ${existing.grantTermsHash ?? null}::text
            AND grant_started_at IS NOT DISTINCT FROM ${existing.grantStartedAt ?? null}::timestamp
            AND grant_valid_until IS NOT DISTINCT FROM ${existing.grantValidUntil ?? null}::timestamp
          )
        )
    `;
    if (!updated) return settleLostWrite();
  } else {
    // Primeiro pedido do escopo. A disputa de unicidade do MESMO escopo (outro pedido criou a linha entre a leitura e este INSERT)
    // não é erro: nada é gravado aqui (o vencedor já gravou linha e evento) e o resultado vem da releitura. O ON CONFLICT nomeia só
    // as colunas do índice do escopo; qualquer outra violação de unicidade (ex.: a chave primária) continua propagando.
    const inserted = await prisma.$executeRaw`
      INSERT INTO vertical_access_approvals (
        id, tenant_id, workspace_id, vertical, status, source, requested_by_user_id, requested_at, created_at, updated_at,
        grant_kind, request_context
      )
      VALUES (
        ${id}, ${tenantId}, ${workspaceId}, ${vertical}, 'pendente', 'request', ${userId}, NOW(), NOW(), NOW(),
        ${evaluation ? "evaluation" : null}::text, ${evaluationJson}::jsonb
      )
      ON CONFLICT (tenant_id, workspace_id, vertical) DO NOTHING
    `;
    if (!inserted) return settleLostWrite();
  }
  await insertEvent(prisma, scope, {
    from: existing?.status ?? null,
    to: "pendente",
    actor: `user:${userId}`,
    channel,
    revocationMode: (existing?.revocationMode ?? null) as VerticalRevocationMode | null,
    detail: evaluation || archivedGrant ? { requestedKind: evaluation ? "evaluation" : "standard", ...(archivedGrant ?? {}) } : null,
  });

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
  | {
      ok: false;
      code:
        | "VERTICAL_ACCESS_NOT_FOUND"
        | "VERTICAL_ACCESS_NOT_AWAITING_DECISION"
        | "VERTICAL_ACCESS_NOTE_REQUIRED"
        | "VERTICAL_ACCESS_EVALUATION_REQUIRES_TERMS";
    };

/** A observação é obrigatória ao recusar e ao decidir contra a recomendação do agente (ADR-011 §2.3): regra pura no contrato. */
export { decisionRequiresNote };

/** Decisão humana do administrador da plataforma EIAH. Só decide pedido que aguarda humano. */
export async function decideVerticalAccess(params: {
  prisma: PrismaClient;
  approvalId: string;
  adminEmail: string;
  decision: VerticalAccessDecision;
  note?: string | null;
  channel?: VerticalAccessChannel;
}): Promise<VerticalAccessDecisionResult> {
  const { prisma, approvalId, adminEmail, decision } = params;
  await ensureVerticalAccessStore(prisma);
  const current = await readVerticalAccessById(prisma, approvalId);
  if (!current) return { ok: false, code: "VERTICAL_ACCESS_NOT_FOUND" };
  if (!AWAITING_DECISION_STATUSES.includes(current.status)) return { ok: false, code: "VERTICAL_ACCESS_NOT_AWAITING_DECISION" };
  // Um pedido de avaliação nunca vira aprovação padrão (permanente): aprovar exige os termos (caminho próprio).
  if (current.grantKind && decision === "aprovar") return { ok: false, code: "VERTICAL_ACCESS_EVALUATION_REQUIRES_TERMS" };
  const note = params.note?.trim() || null;
  if (decisionRequiresNote(decision, current.recommendation) && !note) return { ok: false, code: "VERTICAL_ACCESS_NOTE_REQUIRED" };

  const nextStatus: VerticalAccessStatus = decision === "aprovar" ? "aprovado" : "recusado";
  const actor = `admin:${adminEmail}`;
  // Só muda se ainda estiver aberto (duas decisões simultâneas não passam as duas).
  const updated = await prisma.$executeRaw`
    UPDATE vertical_access_approvals
    SET status = ${nextStatus}, decided_by = ${actor}, decided_at = NOW(), note = ${note},
        revocation_mode = CASE WHEN ${nextStatus}::text = 'aprovado' THEN NULL ELSE revocation_mode END,
        updated_at = NOW()
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
    revocationMode: nextStatus === "aprovado" ? null : (current.revocationMode as VerticalRevocationMode | null),
    channel: params.channel ?? "tela",
  });
  await recordVerticalAccessNotice(prisma, current, decision === "aprovar" ? "aprovado" : "recusado");
  const approval = await readVerticalAccessById(prisma, approvalId);
  return approval ? { ok: true, approval } : { ok: false, code: "VERTICAL_ACCESS_NOT_FOUND" };
}

export type VerticalAccessRevocationAction = "revogar" | "alterar_modo" | "restaurar";

export type VerticalAccessRevocationResult =
  | { ok: true; approval: VerticalAccessRow }
  | {
      ok: false;
      code: "VERTICAL_ACCESS_NOT_FOUND" | "VERTICAL_ACCESS_INVALID_TRANSITION" | "VERTICAL_ACCESS_NOTE_REQUIRED" | "VERTICAL_ACCESS_MODE_UNCHANGED";
    };

/** Observação obrigatória ao revogar e ao trocar o modo (ADR-011 §2.3); restaurar não exige. */
export function revocationRequiresNote(action: VerticalAccessRevocationAction) {
  return action !== "restaurar";
}

/**
 * ADR-011 §2.5: revogar (só o que está aprovado), trocar o modo (só o que está revogado) ou restaurar
 * (revogado volta a aprovado). Nada é apagado; cada mudança gera evento com o modo.
 */
export async function changeVerticalAccessRevocation(params: {
  prisma: PrismaClient;
  approvalId: string;
  adminEmail: string;
  action: VerticalAccessRevocationAction;
  mode?: VerticalRevocationMode | null;
  note?: string | null;
  channel?: VerticalAccessChannel;
}): Promise<VerticalAccessRevocationResult> {
  const { prisma, approvalId, adminEmail, action } = params;
  await ensureVerticalAccessStore(prisma);
  const current = await readVerticalAccessById(prisma, approvalId);
  if (!current) return { ok: false, code: "VERTICAL_ACCESS_NOT_FOUND" };
  const expected: VerticalAccessStatus = action === "revogar" ? "aprovado" : "revogado";
  if (current.status !== expected) return { ok: false, code: "VERTICAL_ACCESS_INVALID_TRANSITION" };
  // Restaurar devolveria `aprovado` sem termos novos: avaliação não é restaurável; renovar exige nova decisão com termos.
  if (action === "restaurar" && current.grantKind) return { ok: false, code: "VERTICAL_ACCESS_INVALID_TRANSITION" };
  const note = params.note?.trim() || null;
  if (revocationRequiresNote(action) && !note) return { ok: false, code: "VERTICAL_ACCESS_NOTE_REQUIRED" };

  const mode: VerticalRevocationMode | null = action === "restaurar" ? null : (params.mode ?? DEFAULT_REVOCATION_MODE);
  if (action === "alterar_modo" && mode === current.revocationMode) return { ok: false, code: "VERTICAL_ACCESS_MODE_UNCHANGED" };
  const nextStatus: VerticalAccessStatus = action === "restaurar" ? "aprovado" : "revogado";
  const actor = `admin:${adminEmail}`;
  // Só muda se o estado ainda for o lido (duas ações simultâneas não passam as duas).
  const updated = await prisma.$executeRaw`
    UPDATE vertical_access_approvals
    SET status = ${nextStatus}, revocation_mode = ${mode}::text, decided_by = ${actor}, decided_at = NOW(), note = ${note},
        updated_at = NOW()
    WHERE id = ${approvalId} AND status = ${expected}::text
      AND revocation_mode IS NOT DISTINCT FROM ${current.revocationMode}::text
  `;
  if (!updated) return { ok: false, code: "VERTICAL_ACCESS_INVALID_TRANSITION" };
  await insertEvent(prisma, current, {
    from: current.status,
    to: nextStatus,
    actor,
    note,
    score: current.score,
    recommendation: current.recommendation,
    revocationMode: mode,
    channel: params.channel ?? "tela",
  });
  const noticeKind: VerticalAccessNoticeKind = mode === null ? "restaurado" : `revogado_${mode}`;
  await recordVerticalAccessNotice(prisma, current, noticeKind);
  const approval = await readVerticalAccessById(prisma, approvalId);
  return approval ? { ok: true, approval } : { ok: false, code: "VERTICAL_ACCESS_NOT_FOUND" };
}

/**
 * ADR-011 §2.6: depois do deploy, o agente calcula o score das liberações aprovadas na migração para a
 * revisão humana. Só lê e pontua: o estado não muda. Falha numa liberação deixa ela sem score e tenta de
 * novo na próxima leitura da fila.
 */
export async function scoreMigratedApprovals(params: { prisma: PrismaClient; limit?: number }) {
  const { prisma } = params;
  await ensureVerticalAccessStore(prisma);
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
  const rows = await prisma.$queryRawUnsafe<VerticalAccessRow[]>(
    `SELECT ${SELECT_COLUMNS} FROM vertical_access_approvals
     WHERE source = 'migration' AND score IS NULL ORDER BY created_at ASC LIMIT $1`,
    limit,
  );
  let scoredCount = 0;
  for (const row of rows) {
    let scored: VerticalAccessScore;
    try {
      scored = scoreVerticalAccess(await collectVerticalAccessScoreFacts({ prisma, tenantId: row.tenantId, workspaceId: row.workspaceId }));
    } catch {
      continue;
    }
    const updated = await prisma.$executeRaw`
      UPDATE vertical_access_approvals
      SET score = ${scored.score}, recommendation = ${scored.recommendation},
          score_reasons = ${JSON.stringify(scored.reasons)}::jsonb, score_rule_version = ${scored.ruleVersion}, updated_at = NOW()
      WHERE id = ${row.id} AND score IS NULL
    `;
    if (!updated) continue;
    scoredCount += 1;
    await insertEvent(prisma, row, {
      from: row.status,
      to: row.status,
      actor: SCORING_ACTOR,
      note: "Score calculado para revisão do aprovado na migração.",
      score: scored.score,
      recommendation: scored.recommendation,
      revocationMode: row.revocationMode as VerticalRevocationMode | null,
    });
  }
  return { scored: scoredCount };
}

export type AdminVerticalAccessItem = {
  id: string;
  tenantName: string;
  workspaceName: string;
  vertical: string;
  status: VerticalAccessStatus;
  source: "request" | "migration";
  revocationMode: VerticalRevocationMode | null;
  requestedBy: string | null;
  requestedAt: Date | null;
  decidedBy: string | null;
  decidedAt: Date | null;
  note: string | null;
  score: number | null;
  recommendation: VerticalAccessRecommendation | null;
  scoreReasons: VerticalAccessScore["reasons"] | null;
  scoreRuleVersion: string | null;
  grantKind: EvaluationKind | null;
  evaluationPhase: EvaluationPhase | null;
  requestContext: unknown;
  grantTerms: unknown;
  grantAcceptedAt: Date | null;
  grantStartedAt: Date | null;
  grantValidUntil: Date | null;
  grantClosedReason: string | null;
};

/**
 * Fila do administrador EIAH (ADR-011 §2.3): pedidos aguardando decisão primeiro, por score.
 * Mostra só dados do pedido e sinais do score — nunca dados de negócio ou PII do cliente.
 */
export async function listVerticalAccessForAdmin(params: { prisma: PrismaClient; limit?: number }) {
  await ensureVerticalAccessStore(params.prisma);
  // O agente pontua os aprovados na migração antes de a fila ser mostrada; falha não impede a leitura.
  await scoreMigratedApprovals({ prisma: params.prisma }).catch(() => undefined);
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 500);
  const rows = await params.prisma.$queryRawUnsafe<AdminVerticalAccessItem[]>(
    `
    SELECT
      a.id,
      COALESCE(t.name, a.tenant_id) AS "tenantName",
      COALESCE(w.name, a.workspace_id) AS "workspaceName",
      a.vertical,
      a.status,
      a.source,
      a.revocation_mode AS "revocationMode",
      u.display_name AS "requestedBy",
      a.requested_at AS "requestedAt",
      a.decided_by AS "decidedBy",
      a.decided_at AS "decidedAt",
      a.note,
      a.score,
      a.recommendation,
      a.score_reasons AS "scoreReasons",
      a.score_rule_version AS "scoreRuleVersion",
      a.grant_kind AS "grantKind",
      a.request_context AS "requestContext",
      a.grant_terms AS "grantTerms",
      a.grant_accepted_at AS "grantAcceptedAt",
      a.grant_started_at AS "grantStartedAt",
      a.grant_valid_until AS "grantValidUntil",
      a.grant_closed_reason AS "grantClosedReason"
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
  // Fase derivada no servidor (nunca confiada ao cliente). A fila mostra o estado gravado; o acesso efetivo é decidido na leitura de uso.
  return rows.map((row) => ({
    ...row,
    evaluationPhase: evaluationPhase({ status: row.status, grantKind: row.grantKind, grantAcceptedAt: row.grantAcceptedAt } as Parameters<typeof evaluationPhase>[0]),
  }));
}

