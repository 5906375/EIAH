import crypto from "node:crypto";
import type { PrismaClient } from "@repo/db";

/**
 * ADR-011 §2.4: fila de avisos da liberação, independente de canal. O app mostra agora; o WhatsApp
 * (PR 2e) lê a mesma fila quando a API estiver pronta. O aviso diz só o estado da liberação: nunca
 * score, sinais de billing ou a observação do administrador. A leitura é por pessoa.
 * As tabelas são criadas por `ensureVerticalAccessStore`.
 */

export const VERTICAL_ACCESS_NOTICE_KINDS = [
  "aprovado",
  "recusado",
  "revogado_somente_leitura",
  "revogado_bloqueio_total",
  "revogado_sem_nova_ativacao",
  "restaurado",
] as const;
export type VerticalAccessNoticeKind = (typeof VERTICAL_ACCESS_NOTICE_KINDS)[number];

const PRESERVED = "Os dados estão preservados.";

export function verticalAccessNoticeMessage(kind: VerticalAccessNoticeKind, vertical: string) {
  switch (kind) {
    case "aprovado":
      return `A EIAH liberou o ${vertical} neste workspace. Quem pode ativar produtos já pode ativar o módulo.`;
    case "recusado":
      return `A EIAH não liberou o ${vertical} neste workspace. Fale com a EIAH para entender o motivo.`;
    case "revogado_somente_leitura":
      return `A EIAH revogou a liberação do ${vertical} neste workspace: o acesso está em somente leitura. ${PRESERVED}`;
    case "revogado_bloqueio_total":
      return `A EIAH revogou a liberação do ${vertical} neste workspace: o acesso está bloqueado. ${PRESERVED}`;
    case "revogado_sem_nova_ativacao":
      return `A EIAH revogou a liberação do ${vertical} neste workspace: o uso atual continua, mas não há nova ativação.`;
    case "restaurado":
      return `A EIAH restaurou a liberação do ${vertical} neste workspace. O uso volta ao normal.`;
  }
}

export async function recordVerticalAccessNotice(
  prisma: PrismaClient,
  approval: { id: string; tenantId: string; workspaceId: string; vertical: string },
  kind: VerticalAccessNoticeKind,
) {
  await prisma.$executeRaw`
    INSERT INTO vertical_access_notices (id, approval_id, tenant_id, workspace_id, vertical, kind, message, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${approval.id}, ${approval.tenantId}, ${approval.workspaceId}, ${approval.vertical},
      ${kind}, ${verticalAccessNoticeMessage(kind, approval.vertical)}, NOW()
    )
  `;
}

export type VerticalAccessNotice = {
  id: string;
  vertical: string;
  kind: VerticalAccessNoticeKind;
  message: string;
  createdAt: Date;
};

/** Avisos do workspace ainda não lidos por esta pessoa, mais recentes primeiro. */
export async function listUnreadVerticalAccessNotices(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId: string;
  limit?: number;
}) {
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  return params.prisma.$queryRaw<VerticalAccessNotice[]>`
    SELECT n.id, n.vertical, n.kind, n.message, n.created_at AS "createdAt"
    FROM vertical_access_notices n
    WHERE n.tenant_id = ${params.tenantId} AND n.workspace_id = ${params.workspaceId}
      AND NOT EXISTS (
        SELECT 1 FROM vertical_access_notice_reads r WHERE r.notice_id = n.id AND r.user_id = ${params.userId}
      )
    ORDER BY n.created_at DESC
    LIMIT ${limit}
  `;
}

/** Marca como lido só se o aviso for deste tenant + workspace (aviso de outro escopo: não encontrado). */
export async function markVerticalAccessNoticeRead(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId: string;
  noticeId: string;
}) {
  const inserted = await params.prisma.$executeRaw`
    INSERT INTO vertical_access_notice_reads (notice_id, user_id, read_at)
    SELECT n.id, ${params.userId}, NOW()
    FROM vertical_access_notices n
    WHERE n.id = ${params.noticeId} AND n.tenant_id = ${params.tenantId} AND n.workspace_id = ${params.workspaceId}
    ON CONFLICT (notice_id, user_id) DO NOTHING
  `;
  if (inserted) return true;
  const exists = await params.prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM vertical_access_notices
    WHERE id = ${params.noticeId} AND tenant_id = ${params.tenantId} AND workspace_id = ${params.workspaceId}
  `;
  return exists.length > 0;
}
