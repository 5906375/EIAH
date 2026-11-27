import type { PrismaClient } from "@repo/db";
import {
  ensureVerticalAccessStore,
  insertVerticalAccessEvent,
  lockVerticalAccessRow,
  readVerticalAccess,
  type VerticalAccessChannel,
  type VerticalAccessRow,
} from "./verticalAccessApproval";
import { recordVerticalAccessNotice } from "./verticalAccessNotices";
import { PRODUCTION_EVALUATION_DEPS, type EvaluationDeps, type EvaluationGrantGate } from "./verticalEvaluationContract";
import {
  computeEvaluationGrantGate,
  planEvaluationAcceptance,
  planEvaluationDecision,
  planEvaluationDecline,
  type EvaluationAcceptErrorCode,
  type EvaluationDecisionErrorCode,
} from "./verticalEvaluationPlans";

/**
 * Aplicação das transições da avaliação (decisão humana com termos, aceite, recusa) e o gate de uso dos caminhos diferidos.
 * Toda transição roda numa transação: relê a linha com `FOR UPDATE`, PLANEJA sobre a linha relida (módulo puro
 * `verticalEvaluationPlans`) e faz um UPDATE condicional (status/aceite esperados); evento e aviso só são gravados se o UPDATE
 * alterou a linha. A oferta é checada AQUI (não só na rota): chamada interna com oferta desligada, bloqueada ou incompleta não
 * concede nada. As operações reais usam sempre `PRODUCTION_EVALUATION_DEPS`; os `…Core` recebem dependências explícitas e
 * existem para a composição de testes (nenhuma rota os usa).
 */

const inTransaction = <T>(prisma: PrismaClient, work: (client: PrismaClient) => Promise<T>) =>
  prisma.$transaction(async (tx: unknown) => work(tx as unknown as PrismaClient)) as Promise<T>;

export type { EvaluationAcceptErrorCode, EvaluationDecisionErrorCode };

// ─── Decisão ─────────────────────────────────────────────────────────────────────────────────────────────────
export type EvaluationDecisionResult =
  | { ok: true; approval: VerticalAccessRow | null; outcome: "terms_proposed" | "refused"; termsHash?: string }
  | { ok: false; code: EvaluationDecisionErrorCode; issues?: string[] };

export type EvaluationDecisionParams = {
  prisma: PrismaClient;
  approvalId: string;
  adminEmail: string;
  adminUserId: string | null;
  decision: "aprovar" | "recusar";
  note?: string | null;
  input?: unknown;
  channel?: VerticalAccessChannel;
};

/** Operação real: oferta e relógio de produção. Nenhum parâmetro público substitui as decisões obrigatórias. */
export function decideEvaluationGrant(params: EvaluationDecisionParams): Promise<EvaluationDecisionResult> {
  return decideEvaluationGrantCore(params, PRODUCTION_EVALUATION_DEPS);
}

/** Núcleo com dependências explícitas (composição de testes). */
export async function decideEvaluationGrantCore(params: EvaluationDecisionParams, deps: EvaluationDeps): Promise<EvaluationDecisionResult> {
  const { prisma, approvalId, decision } = params;
  const offer = deps.offer();
  await ensureVerticalAccessStore(prisma);
  const note = params.note?.trim() || null;
  const actor = `admin:${params.adminEmail}`;
  return inTransaction(prisma, async (client): Promise<EvaluationDecisionResult> => {
    const row = await lockVerticalAccessRow(client, { id: approvalId });
    // A hora da decisão é capturada DEPOIS da trava da linha (não antes de possíveis esperas).
    const plan = planEvaluationDecision(row, { decision, adminUserId: params.adminUserId, note, decisionInput: params.input, actor, decidedAt: deps.clock(), offer });
    if (!plan.ok || !row) return plan.ok ? { ok: false, code: "NOT_FOUND" } : { ok: false, code: plan.code, ...(plan.issues ? { issues: plan.issues } : {}) };

    if (plan.kind === "refuse") {
      const updated = await client.$executeRaw`
        UPDATE vertical_access_approvals
        SET status = 'recusado', decided_by = ${actor}, decided_at = NOW(), note = ${note}, updated_at = NOW()
        WHERE id = ${row.id} AND status = ${row.status}::text AND grant_accepted_at IS NULL AND grant_kind = 'evaluation'
      `;
      if (!updated) return { ok: false, code: "CONFLICT" };
      await insertVerticalAccessEvent(client, row, {
        from: row.status, to: "recusado", actor, note, score: row.score, recommendation: row.recommendation,
        revocationMode: row.revocationMode as never, channel: params.channel ?? "tela",
        detail: { evaluation: true, decision: "recusar" },
      });
      await recordVerticalAccessNotice(client, row, "recusado");
      return { ok: true, approval: await lockVerticalAccessRow(client, { id: row.id }), outcome: "refused" };
    }

    // `revocation_mode` NÃO é tocado: uma restrição anterior continua valendo até a ativação efetiva.
    const updated = await client.$executeRaw`
      UPDATE vertical_access_approvals
      SET status = 'pre_ativacao', grant_terms = ${JSON.stringify(plan.terms)}::jsonb, grant_terms_hash = ${plan.hash},
          grant_accepted_by = NULL, grant_accepted_at = NULL, grant_accepted_hash = NULL,
          decided_by = ${actor}, decided_at = NOW(), note = ${note}, updated_at = NOW()
      WHERE id = ${row.id} AND status = ${row.status}::text AND grant_accepted_at IS NULL AND grant_kind = 'evaluation'
    `;
    if (!updated) return { ok: false, code: "CONFLICT" };
    await insertVerticalAccessEvent(client, row, {
      from: row.status, to: "pre_ativacao", actor, note, score: row.score, recommendation: row.recommendation,
      revocationMode: row.revocationMode as never, channel: params.channel ?? "tela",
      detail: {
        evaluation: true, decision: "aprovar", stage: "terms_proposed", termsHash: plan.hash,
        termsVersion: plan.terms.version, conditionsVersion: plan.terms.conditions.version, reproposal: plan.reproposal,
      },
    });
    await recordVerticalAccessNotice(client, row, "avaliacao_termos_propostos");
    return { ok: true, approval: await lockVerticalAccessRow(client, { id: row.id }), outcome: "terms_proposed", termsHash: plan.hash };
  });
}

// ─── Aceite ──────────────────────────────────────────────────────────────────────────────────────────────────
export type EvaluationAcceptResult =
  | { ok: true; outcome: "accepted" | "already_accepted" }
  | { ok: false; code: EvaluationAcceptErrorCode; issues?: string[] };

export type EvaluationAcceptParams = {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId: string;
  termsHash: string;
  vertical?: string;
};

/** Operação real: oferta e relógio de produção. */
export function acceptEvaluationTerms(params: EvaluationAcceptParams): Promise<EvaluationAcceptResult> {
  return acceptEvaluationTermsCore(params, PRODUCTION_EVALUATION_DEPS);
}

/** Núcleo com dependências explícitas (composição de testes). O aceite não ativa nem libera uso. */
export async function acceptEvaluationTermsCore(params: EvaluationAcceptParams, deps: EvaluationDeps): Promise<EvaluationAcceptResult> {
  const { prisma, tenantId, workspaceId, userId, termsHash } = params;
  const offer = deps.offer();
  await ensureVerticalAccessStore(prisma);
  return inTransaction(prisma, async (client): Promise<EvaluationAcceptResult> => {
    const row = await lockVerticalAccessRow(client, { tenantId, workspaceId, vertical: params.vertical ?? "IMOB" });
    const plan = planEvaluationAcceptance(row, { userId, termsHash, offer });
    if (!plan.ok) return { ok: false, code: plan.code, ...(plan.issues ? { issues: plan.issues } : {}) };
    if (plan.outcome === "already_accepted" || !row) return { ok: true, outcome: "already_accepted" };
    const acceptedAt = deps.clock(); // capturado depois da trava da linha, não antes de possíveis esperas
    const updated = await client.$executeRaw`
      UPDATE vertical_access_approvals
      SET grant_accepted_by = ${userId}, grant_accepted_at = ${acceptedAt}::timestamp, grant_accepted_hash = ${termsHash}, updated_at = NOW()
      WHERE id = ${row.id} AND status = 'pre_ativacao' AND grant_kind = 'evaluation'
        AND grant_accepted_at IS NULL AND grant_terms_hash = ${termsHash}
    `;
    if (!updated) return { ok: false, code: "CONFLICT" };
    await insertVerticalAccessEvent(client, row, {
      from: "pre_ativacao", to: "pre_ativacao", actor: `user:${userId}`, channel: "chat",
      revocationMode: row.revocationMode as never,
      detail: { evaluation: true, stage: "terms_accepted", termsHash, conditionsVersion: plan.terms.conditions.version },
    });
    return { ok: true, outcome: "accepted" };
  });
}

// ─── Recusa pelo solicitante ─────────────────────────────────────────────────────────────────────────────────
export type EvaluationDeclineResult =
  | { ok: true; outcome: "declined" | "already_declined" }
  | { ok: false; code: "NOT_FOUND" | "NOT_PENDING" | "NOT_REQUESTER" | "CONFLICT" };

/**
 * O solicitante não aceita (ou retira) as condições antes da ativação. Volta a `recusado` (restrição anterior mantida, pedido
 * novo permitido); nada foi ativado e a avaliação não é marcada como usada.
 */
export async function declineEvaluationTerms(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId: string;
  vertical?: string;
}): Promise<EvaluationDeclineResult> {
  const { prisma, tenantId, workspaceId, userId } = params;
  await ensureVerticalAccessStore(prisma);
  return inTransaction(prisma, async (client): Promise<EvaluationDeclineResult> => {
    const row = await lockVerticalAccessRow(client, { tenantId, workspaceId, vertical: params.vertical ?? "IMOB" });
    const plan = planEvaluationDecline(row, userId);
    if (!plan.ok) return plan;
    if (plan.outcome === "already_declined" || !row) return { ok: true, outcome: "already_declined" };
    const updated = await client.$executeRaw`
      UPDATE vertical_access_approvals
      SET status = 'recusado', grant_closed_reason = 'declined_by_requester', updated_at = NOW()
      WHERE id = ${row.id} AND status = 'pre_ativacao' AND grant_kind = 'evaluation' AND grant_started_at IS NULL
    `;
    if (!updated) return { ok: false, code: "CONFLICT" };
    await insertVerticalAccessEvent(client, row, {
      from: "pre_ativacao", to: "recusado", actor: `user:${userId}`, channel: "chat",
      revocationMode: row.revocationMode as never,
      detail: { evaluation: true, stage: "declined_by_requester", termsHash: row.grantTermsHash },
    });
    return { ok: true, outcome: "declined" };
  });
}

// ─── Gate de uso ─────────────────────────────────────────────────────────────────────────────────────────────
/**
 * Gate de USO para os caminhos que não passam pelo router do IMOB (Agent Protocol, execução de runs, worker pós-run, uploads).
 * Atua em QUALQUER linha com grant de avaliação (pedido, análise, recusado, termos, ativo, encerrado): só permite escrita com o
 * grant ativo e válido AGORA (`aprovado` efetivo, uso pleno). Sem grant: não se aplica (legado). Erro de leitura propaga
 * (nunca vira "permitido").
 */
export async function readEvaluationGrantGate(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  vertical?: string;
  now?: Date;
}): Promise<EvaluationGrantGate> {
  const row = await readVerticalAccess({
    prisma: params.prisma,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    vertical: params.vertical ?? "IMOB",
    now: params.now,
  });
  return computeEvaluationGrantGate(row);
}
