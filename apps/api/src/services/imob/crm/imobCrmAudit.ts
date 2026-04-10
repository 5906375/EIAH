import type { PrismaClient } from "@repo/db";

export const IMOB_CHAT_AUDIT_AGENT_ID = "imob-chat-audit";

export type ImobCrmAuditSubjectType = "owner" | "property" | "lead" | "case";
export type ImobCrmAuditAction = "created" | "updated" | "deleted";

export async function recordImobCrmAuditEvent(params: {
  prisma: PrismaClient;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
  subjectType: ImobCrmAuditSubjectType;
  subjectId: string;
  action: ImobCrmAuditAction;
  summary: string;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
}) {
  await params.prisma.memoryEvent.create({
    data: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      agentId: IMOB_CHAT_AUDIT_AGENT_ID,
      runId: null,
      key: "crm.audit",
      content: params.summary,
      metadata: {
        domain: "imob",
        subjectType: params.subjectType,
        subjectId: params.subjectId,
        action: params.action,
        userId: params.userId ?? null,
        before: params.before ?? null,
        after: params.after ?? null,
        ...params.metadata,
      },
    },
  });
}
