import type { PrismaClient } from "@repo/db";

type Scope = {
  tenantId: string;
  workspaceId: string;
};

type WindowInput = {
  from?: Date | null;
  to?: Date | null;
  windowDays?: number | null;
};

type KpiCaseRow = {
  id: string;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible: string | null;
  pendingItems: unknown;
  createdAt: Date;
  updatedAt: Date;
  property: { askingPriceCents: number | null } | null;
};

type KpiEventRow = {
  caseId: string;
  type: string;
  payload: unknown;
  createdAt: Date;
};

type FunnelStage = "opened" | "qualified" | "visit" | "proposal" | "closing";

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function resolveWindow(input?: WindowInput) {
  const to = input?.to ?? new Date();
  if (input?.from) return { from: input.from, to };
  const days = Number.isFinite(Number(input?.windowDays)) ? Math.max(1, Math.min(365, Number(input?.windowDays))) : 30;
  return { from: new Date(to.getTime() - days * 24 * 36e5), to };
}

function classifyFunnelByFlow(flowRaw: string | null | undefined): FunnelStage | null {
  const flow = normalize(flowRaw);
  if (!flow) return null;
  if (flow === "owner.create" || flow === "property.create" || flow === "listing.activate") return "opened";
  if (flow === "lead.qualify") return "qualified";
  if (flow === "visit.schedule") return "visit";
  if (flow === "proposal.create") return "proposal";
  if (flow === "contract.prepare" || flow === "commission.settle" || flow === "deal.review") return "closing";
  return null;
}

function classifyFunnelByStage(stageRaw: string | null | undefined): FunnelStage | null {
  const stage = normalize(stageRaw);
  if (!stage) return null;
  if (stage.includes("lead") || stage === "qualified") return "qualified";
  if (stage.includes("visit")) return "visit";
  if (stage.includes("proposal")) return "proposal";
  if (stage.includes("closing") || stage.includes("contract") || stage.includes("fechamento")) return "closing";
  return null;
}

function classifyFunnelByStatus(statusRaw: string | null | undefined): FunnelStage | null {
  const status = normalize(statusRaw);
  if (status === "qualified") return "qualified";
  if (status === "done" || status === "success" || status === "completed") return "closing";
  return null;
}

function stageOrder(stage: FunnelStage) {
  if (stage === "opened") return 1;
  if (stage === "qualified") return 2;
  if (stage === "visit") return 3;
  if (stage === "proposal") return 4;
  return 5;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function hoursBetween(later: Date, earlier: Date) {
  return Math.max(0, (later.getTime() - earlier.getTime()) / 36e5);
}

export class ImobCrmKpiService {
  constructor(private readonly prisma: PrismaClient) {}

  private async readData(scope: Scope, input?: WindowInput) {
    const { from, to } = resolveWindow(input);
    const [cases, events] = await Promise.all([
      this.prisma.imobCase.findMany({
        where: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          createdAt: { lte: to },
        },
        select: {
          id: true,
          flow: true,
          stage: true,
          status: true,
          ownerResponsible: true,
          pendingItems: true,
          createdAt: true,
          updatedAt: true,
          property: { select: { askingPriceCents: true } },
        },
      }),
      this.prisma.imobCaseEvent.findMany({
        where: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          createdAt: { gte: from, lte: to },
        },
        select: { caseId: true, type: true, payload: true, createdAt: true },
      }),
    ]);
    return { from, to, cases: cases as KpiCaseRow[], events: events as KpiEventRow[] };
  }

  async buildFunnelKpis(scope: Scope, input?: WindowInput) {
    const { from, to, cases, events } = await this.readData(scope, input);
    const reachedByCase = new Map<string, Set<FunnelStage>>();
    const firstEventByCaseStage = new Map<string, Date>();

    const mark = (caseId: string, stage: FunnelStage, at?: Date) => {
      const current = reachedByCase.get(caseId) ?? new Set<FunnelStage>();
      current.add(stage);
      reachedByCase.set(caseId, current);
      if (!at) return;
      const key = `${caseId}:${stage}`;
      const existing = firstEventByCaseStage.get(key);
      if (!existing || at.getTime() < existing.getTime()) {
        firstEventByCaseStage.set(key, at);
      }
    };

    for (const item of cases) {
      mark(item.id, "opened", item.createdAt);
      const flowStage = classifyFunnelByFlow(item.flow);
      if (flowStage) mark(item.id, flowStage, item.updatedAt);
      const stageStage = classifyFunnelByStage(item.stage);
      if (stageStage) mark(item.id, stageStage, item.updatedAt);
      const statusStage = classifyFunnelByStatus(item.status);
      if (statusStage) mark(item.id, statusStage, item.updatedAt);
    }

    for (const event of events) {
      const payload = asObject(event.payload);
      const flow = asString(payload?.flow);
      const stage = asString(payload?.stage);
      const status = asString(payload?.status);
      const fromFlow = classifyFunnelByFlow(flow);
      const fromStage = classifyFunnelByStage(stage);
      const fromStatus = classifyFunnelByStatus(status);
      if (fromFlow) mark(event.caseId, fromFlow, event.createdAt);
      if (fromStage) mark(event.caseId, fromStage, event.createdAt);
      if (fromStatus) mark(event.caseId, fromStatus, event.createdAt);
    }

    const totals = {
      opened: 0,
      qualified: 0,
      visit: 0,
      proposal: 0,
      closing: 0,
    };
    for (const stages of reachedByCase.values()) {
      if (stages.has("opened")) totals.opened += 1;
      if (stages.has("qualified")) totals.qualified += 1;
      if (stages.has("visit")) totals.visit += 1;
      if (stages.has("proposal")) totals.proposal += 1;
      if (stages.has("closing")) totals.closing += 1;
    }

    const durations: Array<number> = [];
    const docResolutionHours: Array<number> = [];
    for (const [caseId, stages] of reachedByCase.entries()) {
      const openAt = firstEventByCaseStage.get(`${caseId}:opened`);
      const closeAt = firstEventByCaseStage.get(`${caseId}:closing`);
      if (openAt && closeAt && closeAt.getTime() >= openAt.getTime()) {
        durations.push(hoursBetween(closeAt, openAt));
      }

      const docsAt = firstEventByCaseStage.get(`${caseId}:proposal`) ?? firstEventByCaseStage.get(`${caseId}:visit`);
      const closedAt = firstEventByCaseStage.get(`${caseId}:closing`);
      if (docsAt && closedAt && stages.has("closing") && closedAt.getTime() >= docsAt.getTime()) {
        docResolutionHours.push(hoursBetween(closedAt, docsAt));
      }
    }

    const avgDurationHours =
      durations.length > 0 ? Number((durations.reduce((acc, value) => acc + value, 0) / durations.length).toFixed(2)) : null;
    const docsResolved48hPct =
      docResolutionHours.length > 0 ? pct(docResolutionHours.filter((h) => h <= 48).length, docResolutionHours.length) : 0;

    const steps = [
      { id: "opened", label: "Conversa/Caso", count: totals.opened, conversionPct: 100 },
      { id: "qualified", label: "Lead qualificado", count: totals.qualified, conversionPct: pct(totals.qualified, totals.opened || 1) },
      { id: "visit", label: "Visita", count: totals.visit, conversionPct: pct(totals.visit, totals.qualified || 1) },
      { id: "proposal", label: "Proposta", count: totals.proposal, conversionPct: pct(totals.proposal, totals.visit || 1) },
      { id: "closing", label: "Fechamento", count: totals.closing, conversionPct: pct(totals.closing, totals.proposal || 1) },
    ];

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        cases: totals.opened,
        qualified: totals.qualified,
        visits: totals.visit,
        proposals: totals.proposal,
        closings: totals.closing,
      },
      conversions: {
        caseToQualifiedPct: pct(totals.qualified, totals.opened || 1),
        qualifiedToVisitPct: pct(totals.visit, totals.qualified || 1),
        visitToProposalPct: pct(totals.proposal, totals.visit || 1),
        proposalToClosingPct: pct(totals.closing, totals.proposal || 1),
      },
      averageDurationHours: avgDurationHours,
      docsResolved48hPct,
      steps,
      generatedAt: new Date().toISOString(),
    };
  }

  async buildPerformanceKpis(scope: Scope, input?: WindowInput) {
    const { from, to, cases } = await this.readData(scope, input);
    const byBroker = new Map<string, {
      cases: number;
      closings: number;
      pendingItems: number;
      cycleHoursTotal: number;
      revenueCents: number;
      updatedAt: Date;
    }>();

    for (const item of cases) {
      const broker = asString(item.ownerResponsible) ?? "Corretor não atribuído";
      const current = byBroker.get(broker) ?? {
        cases: 0,
        closings: 0,
        pendingItems: 0,
        cycleHoursTotal: 0,
        revenueCents: 0,
        updatedAt: item.updatedAt,
      };
      current.cases += 1;
      const isClosing = classifyFunnelByFlow(item.flow) === "closing" || classifyFunnelByStatus(item.status) === "closing";
      if (isClosing) {
        current.closings += 1;
        current.revenueCents += item.property?.askingPriceCents ?? 0;
      }
      current.pendingItems += asStringList(item.pendingItems).length;
      current.cycleHoursTotal += hoursBetween(item.updatedAt, item.createdAt);
      if (item.updatedAt.getTime() > current.updatedAt.getTime()) current.updatedAt = item.updatedAt;
      byBroker.set(broker, current);
    }

    const items = Array.from(byBroker.entries())
      .map(([broker, value]) => ({
        broker,
        cases: value.cases,
        closings: value.closings,
        closingRatePct: pct(value.closings, value.cases || 1),
        avgPendingItems: Number((value.pendingItems / Math.max(1, value.cases)).toFixed(2)),
        avgCycleHours: Number((value.cycleHoursTotal / Math.max(1, value.cases)).toFixed(2)),
        revenueCents: value.revenueCents,
        updatedAt: value.updatedAt.toISOString(),
      }))
      .sort((a, b) => b.closings - a.closings || b.revenueCents - a.revenueCents || a.broker.localeCompare(b.broker));

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: {
        brokers: items.length,
        cases: items.reduce((acc, item) => acc + item.cases, 0),
        closings: items.reduce((acc, item) => acc + item.closings, 0),
        revenueCents: items.reduce((acc, item) => acc + item.revenueCents, 0),
      },
      ranking: items,
      generatedAt: new Date().toISOString(),
    };
  }
}

