import type { PrismaClient } from "@repo/db";
import { IMOB_CRM_SLA_RULES, type ImobCrmSlaRuleId, type ImobCrmSlaSeverity } from "./imobCrmSlaPolicy";

type Scope = {
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
};

type FollowUpCaseRecord = {
  id: string;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible: string | null;
  nextStep: string | null;
  pendingItems: unknown;
  blockers: unknown;
  threadId: string | null;
  updatedAt: Date;
};

export type ImobCrmFollowUpItem = {
  caseId: string;
  threadId: string | null;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible: string | null;
  ruleId: ImobCrmSlaRuleId;
  title: string;
  severity: ImobCrmSlaSeverity;
  reason: string;
  nextAction: string;
  suggestedMessage: string;
  dueAt: string;
  overdueHours: number;
  isOverdue: boolean;
};

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function toHoursFrom(date: Date, now: Date) {
  return Math.max(0, (now.getTime() - date.getTime()) / 36e5);
}

function toIso(date: Date) {
  return date.toISOString();
}

export class ImobCrmFollowUpService {
  constructor(private readonly prisma: PrismaClient) {}

  private async listCases(scope: Scope, params?: { caseId?: string | null; limit?: number }) {
    return this.prisma.imobCase.findMany({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        ...(params?.caseId ? { id: params.caseId } : {}),
      },
      orderBy: { updatedAt: "asc" },
      take: Math.min(400, Math.max(1, params?.limit ?? 200)),
      select: {
        id: true,
        flow: true,
        stage: true,
        status: true,
        ownerResponsible: true,
        nextStep: true,
        pendingItems: true,
        blockers: true,
        threadId: true,
        updatedAt: true,
      },
    });
  }

  private evaluateCase(record: FollowUpCaseRecord, now: Date): ImobCrmFollowUpItem[] {
    const pendingItems = asStringList(record.pendingItems);
    const ageHours = toHoursFrom(record.updatedAt, now);
    const items: ImobCrmFollowUpItem[] = [];
    for (const rule of IMOB_CRM_SLA_RULES) {
      if (!rule.matches({
        flow: record.flow,
        stage: record.stage,
        status: record.status,
        pendingItems,
      })) {
        continue;
      }
      const dueAtDate = new Date(record.updatedAt.getTime() + rule.thresholdHours * 36e5);
      const overdueHours = Math.max(0, ageHours - rule.thresholdHours);
      items.push({
        caseId: record.id,
        threadId: record.threadId ?? null,
        flow: record.flow,
        stage: record.stage,
        status: record.status,
        ownerResponsible: record.ownerResponsible ?? null,
        ruleId: rule.id,
        title: rule.title,
        severity: rule.severity,
        reason:
          pendingItems.length > 0
            ? `Caso com pendências (${pendingItems.slice(0, 4).join(", ")}) sem avanço dentro do SLA.`
            : "Caso sem atualização dentro do SLA definido para esta etapa.",
        nextAction: rule.nextAction,
        suggestedMessage: rule.suggestedMessage,
        dueAt: toIso(dueAtDate),
        overdueHours: Number(overdueHours.toFixed(2)),
        isOverdue: ageHours >= rule.thresholdHours,
      });
    }
    return items;
  }

  async listPending(scope: Scope, params?: { onlyOverdue?: boolean; limit?: number; caseId?: string | null }) {
    const now = new Date();
    const cases = await this.listCases(scope, { caseId: params?.caseId ?? null, limit: params?.limit });
    const items = cases
      .flatMap((item) => this.evaluateCase(item, now))
      .filter((item) => (params?.onlyOverdue ?? true) ? item.isOverdue : true)
      .sort((a, b) => b.overdueHours - a.overdueHours || new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
      .slice(0, Math.min(200, Math.max(1, params?.limit ?? 80)));

    return {
      generatedAt: now.toISOString(),
      totals: {
        items: items.length,
        overdue: items.filter((item) => item.isOverdue).length,
        highSeverity: items.filter((item) => item.severity === "high").length,
      },
      items,
    };
  }

  async run(scope: Scope, params?: { dryRun?: boolean; onlyOverdue?: boolean; limit?: number; caseId?: string | null }) {
    const now = new Date();
    const pending = await this.listPending(scope, {
      onlyOverdue: params?.onlyOverdue ?? true,
      limit: params?.limit ?? 80,
      caseId: params?.caseId ?? null,
    });
    if (params?.dryRun) {
      return {
        dryRun: true,
        scanned: pending.items.length,
        triggered: 0,
        suppressed: 0,
        items: pending.items,
      };
    }

    let triggered = 0;
    let suppressed = 0;
    const emitted: ImobCrmFollowUpItem[] = [];
    for (const item of pending.items) {
      const rule = IMOB_CRM_SLA_RULES.find((entry) => entry.id === item.ruleId);
      if (!rule) continue;
      const cooldownSince = new Date(now.getTime() - rule.cooldownHours * 36e5);
      const dedupeSummary = `SLA:${item.ruleId}:case:${item.caseId}`;
      const existing = await this.prisma.imobCaseEvent.findFirst({
        where: {
          caseId: item.caseId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          type: "case.followup.sla.triggered",
          summary: dedupeSummary,
          createdAt: { gte: cooldownSince },
        },
        select: { id: true },
      });
      if (existing) {
        suppressed += 1;
        continue;
      }

      await this.prisma.imobCaseEvent.create({
        data: {
          caseId: item.caseId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          runId: null,
          type: "case.followup.sla.triggered",
          actorType: "system",
          actorRef: scope.userId ?? null,
          summary: dedupeSummary,
          evidenceRef: null,
          payload: {
            ruleId: item.ruleId,
            title: item.title,
            severity: item.severity,
            reason: item.reason,
            nextAction: item.nextAction,
            suggestedMessage: item.suggestedMessage,
            dueAt: item.dueAt,
            overdueHours: item.overdueHours,
            threadId: item.threadId,
            flow: item.flow,
            stage: item.stage,
            status: item.status,
          },
        },
      });

      triggered += 1;
      emitted.push(item);
    }

    return {
      dryRun: false,
      scanned: pending.items.length,
      triggered,
      suppressed,
      items: emitted,
    };
  }
}

