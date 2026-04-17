import type { ImobControlSurface } from "./imobControlSurface";
import { IMOB_REASON_CODE_CATALOG, type ImobReasonCode } from "./imobReasonCodeCatalog";

export type ImobPriorityQueueItem = {
  caseId: string;
  threadId?: string | null;
  title: string;
  priorityScore: number;
  urgency?: ImobControlSurface["urgency"];
  followUpRisk?: ImobControlSurface["followUpRisk"];
  waitingOn?: ImobControlSurface["waitingOn"];
  agingHours?: number | null;
  currentObjective?: string | null;
  nextStep?: string | null;
  autoprompt: string;
};

export type ImobWaitingOnBucket = {
  waitingOn: NonNullable<ImobControlSurface["waitingOn"]>;
  total: number;
  items: ImobPriorityQueueItem[];
};

export type ImobHeatmapCell = {
  phase: NonNullable<ImobControlSurface["humanJourneyPhase"]>;
  reasonCode: ImobReasonCode;
  waitingOn?: NonNullable<ImobControlSurface["waitingOn"]> | null;
  total: number;
  weightedScore: number;
};

export type ImobSpecialistLoadMetric = {
  specialistId: string;
  reasonCode: ImobReasonCode;
  total: number;
  weightedScore: number;
};

export type ImobRescueMetric = {
  scope: "phase";
  key: string;
  rescued: number;
  totalCritical: number;
  rescueRate: number;
};

export type ImobApprovalContextItem = {
  caseId: string;
  threadId?: string | null;
  specialistId: string;
  reasonCode: ImobReasonCode;
  reasonLabel: string;
  category: "commercial" | "operations" | "legal" | "financial" | "audit";
  requiresApproval: boolean;
  requiresEvidence: boolean;
  evidenceCount: number;
  humanJourneyPhase?: ImobControlSurface["humanJourneyPhase"];
  waitingOn?: ImobControlSurface["waitingOn"];
  urgency?: ImobControlSurface["urgency"];
  agingHours?: number | null;
  currentObjective?: string | null;
  nextStep?: string | null;
  suggestedAction?: string | null;
  priorityScore: number;
  autoprompt: string;
};

function urgencyScore(value: ImobControlSurface["urgency"]) {
  if (value === "critical") return 6;
  if (value === "high") return 4;
  if (value === "medium") return 2;
  return 0;
}

function followUpRiskScore(value: ImobControlSurface["followUpRisk"]) {
  if (value === "high") return 4;
  if (value === "medium") return 2;
  return 0;
}

function phaseScore(value: ImobControlSurface["humanJourneyPhase"]) {
  if (value === "fechamento") return 3;
  if (value === "documentacao") return 3;
  if (value === "negociacao") return 2;
  if (value === "proposta") return 2;
  return 1;
}

function waitingOnScore(value: ImobControlSurface["waitingOn"]) {
  if (value === "lead" || value === "broker") return 2;
  if (value === "legal" || value === "finance") return 3;
  return 1;
}

function buildPriorityScore(item: ImobControlSurface) {
  const agingHours = item.agingHours ?? 0;
  const agingScore = Math.min(4, Math.floor(agingHours / 24));
  return (
    urgencyScore(item.urgency) +
    followUpRiskScore(item.followUpRisk) +
    phaseScore(item.humanJourneyPhase) +
    waitingOnScore(item.waitingOn) +
    agingScore
  );
}

function buildQueueTitle(item: ImobControlSurface) {
  if (item.currentObjective?.trim()) return item.currentObjective.trim();
  if (item.nextStep?.trim()) return item.nextStep.trim();
  if (item.humanJourneyPhase?.trim()) return `Caso em ${item.humanJourneyPhase}`;
  return `Caso ${item.caseId}`;
}

function buildAutoprompt(item: ImobControlSurface) {
  const parts = [
    item.currentObjective ? `objetivo atual: ${item.currentObjective}` : null,
    typeof item.agingHours === "number" ? `tempo parado: ${item.agingHours.toFixed(1)} horas` : null,
    item.waitingOn ? `waiting on: ${item.waitingOn}` : null,
    item.specialists[0]?.suggestedAction ? `abordagem sugerida: ${item.specialists[0].suggestedAction}` : null,
  ].filter((value): value is string => Boolean(value));
  return parts.length > 0 ? parts.join(" • ") : "mostrar próximo passo deste caso";
}

function toPriorityQueueItem(item: ImobControlSurface): ImobPriorityQueueItem {
  return {
    caseId: item.caseId,
    threadId: item.threadId ?? null,
    title: buildQueueTitle(item),
    priorityScore: buildPriorityScore(item),
    urgency: item.urgency,
    followUpRisk: item.followUpRisk,
    waitingOn: item.waitingOn,
    agingHours: item.agingHours ?? null,
    currentObjective: item.currentObjective ?? null,
    nextStep: item.nextStep ?? null,
    autoprompt: buildAutoprompt(item),
  };
}

export function buildImobPriorityQueue(items: ImobControlSurface[]): ImobPriorityQueueItem[] {
  return items
    .map(toPriorityQueueItem)
    .sort((a, b) => b.priorityScore - a.priorityScore || (b.agingHours ?? 0) - (a.agingHours ?? 0));
}

export function buildImobWaitingOnBoard(items: ImobControlSurface[]): ImobWaitingOnBucket[] {
  const queue = buildImobPriorityQueue(items).filter(
    (item): item is ImobPriorityQueueItem & { waitingOn: NonNullable<ImobControlSurface["waitingOn"]> } =>
      Boolean(item.waitingOn)
  );
  const grouped = new Map<NonNullable<ImobControlSurface["waitingOn"]>, ImobPriorityQueueItem[]>();
  for (const item of queue) {
    const current = grouped.get(item.waitingOn) ?? [];
    current.push(item);
    grouped.set(item.waitingOn, current);
  }

  return Array.from(grouped.entries())
    .map(([waitingOn, bucketItems]) => ({
      waitingOn,
      total: bucketItems.length,
      items: bucketItems.slice(0, 5),
    }))
    .sort((a, b) => b.total - a.total || (b.items[0]?.priorityScore ?? 0) - (a.items[0]?.priorityScore ?? 0));
}

export function buildImobBottleneckHeatmap(items: ImobControlSurface[]): ImobHeatmapCell[] {
  const grouped = new Map<string, ImobHeatmapCell>();
  for (const item of items) {
    const phase = item.humanJourneyPhase;
    if (!phase) continue;
    const waitingOn = item.waitingOn ?? null;
    const priorityScore = buildPriorityScore(item);
    for (const specialist of item.specialists) {
      const key = `${phase}::${specialist.reasonCode}::${waitingOn ?? "none"}`;
      const current = grouped.get(key) ?? {
        phase,
        reasonCode: specialist.reasonCode,
        waitingOn,
        total: 0,
        weightedScore: 0,
      };
      current.total += 1;
      current.weightedScore += priorityScore;
      grouped.set(key, current);
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => b.weightedScore - a.weightedScore || b.total - a.total
  );
}

export function buildImobSpecialistLoadBoard(items: ImobControlSurface[]): ImobSpecialistLoadMetric[] {
  const grouped = new Map<string, ImobSpecialistLoadMetric>();
  for (const item of items) {
    const priorityScore = buildPriorityScore(item);
    for (const specialist of item.specialists) {
      const key = `${specialist.specialistId}::${specialist.reasonCode}`;
      const current = grouped.get(key) ?? {
        specialistId: specialist.specialistId,
        reasonCode: specialist.reasonCode,
        total: 0,
        weightedScore: 0,
      };
      current.total += 1;
      current.weightedScore += priorityScore;
      grouped.set(key, current);
    }
  }

  return Array.from(grouped.values()).sort(
    (a, b) => b.weightedScore - a.weightedScore || b.total - a.total
  );
}

export function buildImobRescueIndex(params: {
  items: ImobControlSurface[];
  recentTriggeredCaseIds: Set<string>;
}): ImobRescueMetric[] {
  const grouped = new Map<string, { rescued: number; totalCritical: number }>();

  for (const item of params.items) {
    const phase = item.humanJourneyPhase ?? "sem_fase";
    const current = grouped.get(phase) ?? { rescued: 0, totalCritical: 0 };
    const isCriticalNow = item.urgency === "high" || item.urgency === "critical" || item.followUpRisk === "high";
    const hadTrigger = params.recentTriggeredCaseIds.has(item.caseId);

    if (hadTrigger || isCriticalNow) {
      current.totalCritical += 1;
    }
    if (hadTrigger && item.urgency !== "high" && item.urgency !== "critical" && item.followUpRisk !== "high") {
      current.rescued += 1;
    }

    grouped.set(phase, current);
  }

  return Array.from(grouped.entries())
    .map(([key, value]) => ({
      scope: "phase" as const,
      key,
      rescued: value.rescued,
      totalCritical: value.totalCritical,
      rescueRate: value.totalCritical > 0 ? value.rescued / value.totalCritical : 0,
    }))
    .sort((a, b) => b.rescueRate - a.rescueRate || b.totalCritical - a.totalCritical);
}

export function buildImobApprovalContext(params: {
  items: ImobControlSurface[];
  evidenceCountByCaseId?: Map<string, number>;
  limit?: number;
}): ImobApprovalContextItem[] {
  const result: ImobApprovalContextItem[] = [];

  for (const item of params.items) {
    const priorityScore = buildPriorityScore(item);
    const evidenceCount = params.evidenceCountByCaseId?.get(item.caseId) ?? 0;
    for (const specialist of item.specialists) {
      const spec = IMOB_REASON_CODE_CATALOG[specialist.reasonCode];
      if (!spec.requiresApproval && !spec.requiresEvidence) continue;

      result.push({
        caseId: item.caseId,
        threadId: item.threadId ?? null,
        specialistId: specialist.specialistId,
        reasonCode: specialist.reasonCode,
        reasonLabel: spec.label,
        category: spec.category,
        requiresApproval: spec.requiresApproval,
        requiresEvidence: spec.requiresEvidence,
        evidenceCount,
        humanJourneyPhase: item.humanJourneyPhase,
        waitingOn: item.waitingOn,
        urgency: item.urgency,
        agingHours: item.agingHours ?? null,
        currentObjective: item.currentObjective ?? null,
        nextStep: item.nextStep ?? null,
        suggestedAction: specialist.suggestedAction ?? null,
        priorityScore,
        autoprompt: buildAutoprompt(item),
      });
    }
  }

  const unique = new Map<string, ImobApprovalContextItem>();
  for (const item of result) {
    const key = `${item.caseId}::${item.reasonCode}::${item.specialistId}`;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, item);
      continue;
    }
    if (item.priorityScore > existing.priorityScore) {
      unique.set(key, item);
    }
  }

  const requestedLimit = typeof params.limit === "number" && Number.isFinite(params.limit) ? params.limit : 12;
  const limit = Math.max(1, Math.floor(requestedLimit));
  return Array.from(unique.values())
    .sort((a, b) => {
      const evidencePendingA = a.requiresEvidence && a.evidenceCount <= 0 ? 1 : 0;
      const evidencePendingB = b.requiresEvidence && b.evidenceCount <= 0 ? 1 : 0;
      return (
        evidencePendingB - evidencePendingA ||
        b.priorityScore - a.priorityScore ||
        (b.agingHours ?? 0) - (a.agingHours ?? 0)
      );
    })
    .slice(0, limit);
}
