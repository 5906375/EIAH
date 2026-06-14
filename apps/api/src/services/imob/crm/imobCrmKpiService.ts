import type { PrismaClient } from "@repo/db";
import { resolveImobBrokerAssignment, type ImobBrokerAssignmentSource } from "./imobBrokerAssignmentResolver";

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
  threadId: string | null;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible: string | null;
  pendingItems: unknown;
  createdAt: Date;
  updatedAt: Date;
  property: { askingPriceCents: number | null } | null;
};

type KpiRunRow = {
  caseId: string | null;
  threadId: string | null;
  agent: string;
  request: unknown;
  costCents: number;
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

function stagesUpTo(stage: FunnelStage): FunnelStage[] {
  if (stage === "opened") return ["opened"];
  if (stage === "qualified") return ["opened", "qualified"];
  if (stage === "visit") return ["opened", "qualified", "visit"];
  if (stage === "proposal") return ["opened", "qualified", "visit", "proposal"];
  return ["opened", "qualified", "visit", "proposal", "closing"];
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

function hoursBetween(later: Date, earlier: Date) {
  return Math.max(0, (later.getTime() - earlier.getTime()) / 36e5);
}

function isTerminalEvent(event: Pick<KpiEventRow, "type" | "payload">) {
  const type = normalize(event.type);
  const payload = asObject(event.payload);
  const stage = normalize(asString(payload?.stage));
  const toStage = normalize(asString(payload?.toStage));
  const status = normalize(asString(payload?.status));

  return (
    type === "commission.settlement.completed"
    || type === "case.closing.completed"
    || type === "case.completed"
    || type === "imob.case.completed"
    || (type === "stage_changed" && (toStage === "closing" || toStage === "settled"))
    || stage === "closing"
    || stage === "settled"
    || status === "done"
    || status === "completed"
    || status === "success"
  );
}

function isTerminalCaseStatus(statusRaw: string | null | undefined) {
  const status = normalize(statusRaw);
  return status === "done" || status === "completed" || status === "success";
}

function isTerminalCaseStage(stageRaw: string | null | undefined) {
  const stage = normalize(stageRaw);
  return stage.includes("closing") || stage.includes("settled");
}

function resolveClosingTimestamp(params: {
  caseRow: Pick<KpiCaseRow, "createdAt" | "updatedAt" | "stage" | "status">;
  explicitClosingAt?: Date | null;
}) {
  if (params.explicitClosingAt) {
    return {
      at: params.explicitClosingAt,
      source: "event" as const,
    };
  }

  const hasTerminalCase = isTerminalCaseStatus(params.caseRow.status) || isTerminalCaseStage(params.caseRow.stage);
  if (
    hasTerminalCase
    && params.caseRow.updatedAt.getTime() > params.caseRow.createdAt.getTime()
  ) {
    return {
      at: params.caseRow.updatedAt,
      source: "updated_at_proxy" as const,
    };
  }

  return null;
}

function resolveJourneyLabelFromKey(keyRaw: string | null | undefined) {
  const key = normalize(keyRaw);
  if (!key) return null;
  if (
    key === "realestate.owner.create"
    || key === "owner.create"
    || key === "property.create"
    || key === "realestate.register_property"
  ) return "Captação";
  if (key === "lead.qualify" || key === "realestate.lead.qualify") return "Qualificação";
  if (key === "visit.schedule") return "Visita";
  if (key === "proposal.create") return "Proposta";
  if (key === "documents.collect") return "Documentação";
  if (key === "contract.prepare" || key === "realestate.create_contract") return "Contrato";
  if (key === "commission.settle") return "Comissão";
  if (key === "property.market_scan" || key === "property_market_scan" || key === "realestate.market_scan") return "Varredura de mercado";
  if (key === "listing.activate") return "Captação";
  if (key === "deal.review") return "Fechamento";
  if (key === "rules.configure") return "Configuração";
  if (key === "adjustment.apply" || key === "realestate.apply_adjustment") return "Ajustes";
  if (key === "property.link_owner") return "Captação";
  if (key === "case.review") return "Revisão";
  return null;
}

function resolveRunJourneyLabel(
  run: Pick<KpiRunRow, "agent" | "request">,
  linkedCase?: Pick<KpiCaseRow, "flow"> | null,
) {
  const request = asObject(run.request);
  const metadata = asObject(request?.metadata);
  const executionInput = asObject(metadata?.executionInput);
  const action = asString(request?.action);
  const metadataAction = asString(metadata?.action);
  const requestFlow = asString(request?.flow) ?? asString(metadata?.flow) ?? asString(executionInput?.flow);
  const linkedFlow = asString(linkedCase?.flow);
  const agent = asString(run.agent);

  return (
    resolveJourneyLabelFromKey(action)
    ?? resolveJourneyLabelFromKey(metadataAction)
    ?? resolveJourneyLabelFromKey(requestFlow)
    ?? resolveJourneyLabelFromKey(linkedFlow)
    ?? resolveJourneyLabelFromKey(agent)
    ?? "Outros"
  );
}

function resolveCaseJourneyLabel(flowRaw: string | null | undefined) {
  const label = resolveJourneyLabelFromKey(flowRaw);
  return label ?? "Outros";
}

function prioritizeJourneyLabel(
  currentLabel: string,
  fallbackLabel: string,
) {
  if (currentLabel === "Outros" && fallbackLabel !== "Outros") return fallbackLabel;
  return currentLabel;
}

function resolveRunJourneyLabelWithCase(
  run: Pick<KpiRunRow, "agent" | "request">,
  linkedCase?: Pick<KpiCaseRow, "flow"> | null,
) {
  const runLabel = resolveRunJourneyLabel(run, linkedCase);
  const caseLabel = resolveCaseJourneyLabel(linkedCase?.flow);
  return prioritizeJourneyLabel(runLabel, caseLabel);
}

export class ImobCrmKpiService {
  constructor(private readonly prisma: PrismaClient) {}

  private async readCaseCostData(
    scope: Scope,
    params?: WindowInput & { caseIds?: string[] | null },
  ) {
    const { from, to } = resolveWindow(params);
    const requestedCaseIds = Array.from(
      new Set((params?.caseIds ?? []).map((item) => item.trim()).filter(Boolean)),
    );
    const [cases, runs] = await Promise.all([
      this.prisma.imobCase.findMany({
        where: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          ...(requestedCaseIds.length > 0 ? { id: { in: requestedCaseIds } } : {}),
        },
        select: {
          id: true,
          threadId: true,
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
      this.prisma.run.findMany({
        where: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          createdAt: { gte: from, lte: to },
        },
        select: {
          caseId: true,
          threadId: true,
          agent: true,
          request: true,
          costCents: true,
        },
      }),
    ]);
    return {
      from,
      to,
      requestedCaseIds,
      cases: cases as KpiCaseRow[],
      runs: runs as KpiRunRow[],
    };
  }

  private async readData(scope: Scope, input?: WindowInput) {
    const { from, to } = resolveWindow(input);
    const [cases, events, runs] = await Promise.all([
      this.prisma.imobCase.findMany({
        where: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          createdAt: { gte: from, lte: to },
        },
        select: {
          id: true,
          threadId: true,
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
      this.prisma.run.findMany({
        where: {
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          createdAt: { gte: from, lte: to },
        },
        select: {
          caseId: true,
          threadId: true,
          agent: true,
          request: true,
          costCents: true,
        },
      }),
    ]);
    return {
      from,
      to,
      cases: cases as KpiCaseRow[],
      events: events as KpiEventRow[],
      runs: runs as KpiRunRow[],
    };
  }

  async buildFunnelKpis(scope: Scope, input?: WindowInput) {
    const { from, to, cases, events, runs } = await this.readData(scope, input);
    const reachedByCase = new Map<string, Set<FunnelStage>>();
    const firstEventByCaseStage = new Map<string, Date>();
    const explicitTerminalEventByCase = new Map<string, Date>();
    const allowedCaseIds = new Set(cases.map((item) => item.id));
    const caseById = new Map(cases.map((item) => [item.id, item]));

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
      if (!allowedCaseIds.has(event.caseId)) continue;
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
      if (isTerminalEvent(event)) {
        mark(event.caseId, "closing", event.createdAt);
        const existing = explicitTerminalEventByCase.get(event.caseId);
        if (!existing || event.createdAt.getTime() < existing.getTime()) {
          explicitTerminalEventByCase.set(event.caseId, event.createdAt);
        }
      }
    }

    for (const [caseId, stages] of reachedByCase.entries()) {
      let highest: FunnelStage = "opened";
      for (const stage of stages) {
        if (stageOrder(stage) > stageOrder(highest)) {
          highest = stage;
        }
      }
      reachedByCase.set(caseId, new Set(stagesUpTo(highest)));
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
      const caseRow = caseById.get(caseId);
      const closingInfo = caseRow
        ? resolveClosingTimestamp({
            caseRow,
            explicitClosingAt: explicitTerminalEventByCase.get(caseId) ?? null,
          })
        : null;
      if (openAt && closingInfo && closingInfo.at.getTime() >= openAt.getTime()) {
        durations.push(hoursBetween(closingInfo.at, openAt));
      }

      const docsAt = firstEventByCaseStage.get(`${caseId}:proposal`) ?? firstEventByCaseStage.get(`${caseId}:visit`);
      if (docsAt && closingInfo && stages.has("closing") && closingInfo.at.getTime() >= docsAt.getTime()) {
        docResolutionHours.push(hoursBetween(closingInfo.at, docsAt));
      }
    }

    const durationSampleSize = durations.length;
    const resolutionSampleSize = docResolutionHours.length;
    const avgDurationHours =
      durationSampleSize > 0 ? Number((durations.reduce((acc, value) => acc + value, 0) / durationSampleSize).toFixed(2)) : null;
    const docsResolved48hPct =
      resolutionSampleSize > 0 ? pct(docResolutionHours.filter((h) => h <= 48).length, resolutionSampleSize) : 0;

    const latestCaseByThreadId = new Map<string, KpiCaseRow>();
    for (const item of [...cases].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) {
      const threadId = asString(item.threadId);
      if (threadId && !latestCaseByThreadId.has(threadId)) latestCaseByThreadId.set(threadId, item);
    }

    const costByJourney = new Map<string, { label: string; cases: Set<string>; costCents: number; runs: number }>();
    const casesWithRun = new Set<string>();
    let runsCount = 0;
    let linkedRunsCount = 0;
    let unlinkedRunsCount = 0;
    let totalRunCostCents = 0;
    for (const run of runs) {
      runsCount += 1;
      const linkedCase =
        (run.caseId ? caseById.get(run.caseId) : null)
        ?? (run.threadId ? latestCaseByThreadId.get(run.threadId) : null)
        ?? null;
      if (!linkedCase) {
        unlinkedRunsCount += 1;
        continue;
      }
      linkedRunsCount += 1;
      totalRunCostCents += Number(run.costCents ?? 0);
      casesWithRun.add(linkedCase.id);
      const label = resolveRunJourneyLabelWithCase(run, linkedCase);
      const current = costByJourney.get(label) ?? { label, cases: new Set<string>(), costCents: 0, runs: 0 };
      current.cases.add(linkedCase.id);
      current.costCents += Number(run.costCents ?? 0);
      current.runs += 1;
      costByJourney.set(label, current);
    }

    const costByJourneyItems = Array.from(costByJourney.values())
      .map((item) => ({
        label: item.label,
        cases: item.cases.size,
        costCents: item.costCents,
        runs: item.runs,
      }))
      .sort((a, b) => b.costCents - a.costCents || b.cases - a.cases || a.label.localeCompare(b.label));

    const steps = [
      { id: "opened", label: "Casos criados no período", count: totals.opened, conversionPct: 100 },
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
      totalRunCostCents,
      casesWithRunCount: casesWithRun.size,
      costByJourney: costByJourneyItems,
      costCoverage: {
        runsCount,
        linkedRunsCount,
        unlinkedRunsCount,
      },
      averageDurationHours: avgDurationHours,
      docsResolved48hPct,
      coverage: {
        durationSampleSize,
        resolutionSampleSize,
      },
      steps,
      generatedAt: new Date().toISOString(),
    };
  }

  async buildCaseCostSnapshot(
    scope: Scope,
    params?: WindowInput & { caseIds?: string[] | null },
  ) {
    const { from, to, requestedCaseIds, cases, runs } = await this.readCaseCostData(scope, params);
    const caseById = new Map(cases.map((item) => [item.id, item]));
    const latestCaseByThreadId = new Map<string, KpiCaseRow>();
    for (const item of [...cases].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())) {
      const threadId = asString(item.threadId);
      if (threadId && !latestCaseByThreadId.has(threadId)) latestCaseByThreadId.set(threadId, item);
    }

    const itemsByCaseId = new Map<string, {
      caseId: string;
      threadId: string | null;
      costCents: number;
      runs: number;
    }>();
    for (const item of cases) {
      itemsByCaseId.set(item.id, {
        caseId: item.id,
        threadId: item.threadId ?? null,
        costCents: 0,
        runs: 0,
      });
    }

    let runsCount = 0;
    let linkedRunsCount = 0;
    let unlinkedRunsCount = 0;
    for (const run of runs) {
      runsCount += 1;
      const linkedCase =
        (run.caseId ? caseById.get(run.caseId) : null)
        ?? (run.threadId ? latestCaseByThreadId.get(run.threadId) : null)
        ?? null;
      if (!linkedCase) {
        unlinkedRunsCount += 1;
        continue;
      }
      const current = itemsByCaseId.get(linkedCase.id);
      if (!current) {
        unlinkedRunsCount += 1;
        continue;
      }
      linkedRunsCount += 1;
      current.costCents += Number(run.costCents ?? 0);
      current.runs += 1;
      itemsByCaseId.set(linkedCase.id, current);
    }

    const items = (requestedCaseIds.length > 0 ? requestedCaseIds : Array.from(itemsByCaseId.keys()))
      .map((caseId) => itemsByCaseId.get(caseId))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => b.costCents - a.costCents || b.runs - a.runs || a.caseId.localeCompare(b.caseId));

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      items,
      coverage: {
        runsCount,
        linkedRunsCount,
        unlinkedRunsCount,
      },
    };
  }

  async buildPerformanceKpis(scope: Scope, input?: WindowInput) {
    const { from, to, cases } = await this.readData(scope, input);
    const resolvedWindowDays = input?.from
      ? Math.max(1, Math.ceil((to.getTime() - from.getTime()) / 36e5 / 24))
      : Number.isFinite(Number(input?.windowDays))
        ? Math.max(1, Math.min(365, Number(input?.windowDays)))
        : 30;
    const byBroker = new Map<string, {
      cases: number;
      closings: number;
      pendingItems: number;
      cycleHoursTotal: number;
      estimatedListingValueCents: number;
      updatedAt: Date;
      assignmentSource: ImobBrokerAssignmentSource;
    }>();
    const unassigned = {
      cases: 0,
      closings: 0,
      estimatedListingValueCents: 0,
      assignmentSource: "unassigned_internal" as const,
    };

    for (const item of cases) {
      const brokerAssignment = resolveImobBrokerAssignment(item.ownerResponsible);
      const isClosing = classifyFunnelByFlow(item.flow) === "closing" || classifyFunnelByStatus(item.status) === "closing";

      if (!brokerAssignment.broker) {
        unassigned.cases += 1;
        if (isClosing) {
          unassigned.closings += 1;
          unassigned.estimatedListingValueCents += item.property?.askingPriceCents ?? 0;
        }
        continue;
      }

      const current = byBroker.get(brokerAssignment.broker) ?? {
        cases: 0,
        closings: 0,
        pendingItems: 0,
        cycleHoursTotal: 0,
        estimatedListingValueCents: 0,
        updatedAt: item.updatedAt,
        assignmentSource: brokerAssignment.assignmentSource,
      };
      current.cases += 1;
      if (isClosing) {
        current.closings += 1;
        current.estimatedListingValueCents += item.property?.askingPriceCents ?? 0;
      }
      current.pendingItems += asStringList(item.pendingItems).length;
      current.cycleHoursTotal += hoursBetween(item.updatedAt, item.createdAt);
      if (item.updatedAt.getTime() > current.updatedAt.getTime()) current.updatedAt = item.updatedAt;
      byBroker.set(brokerAssignment.broker, current);
    }

    const items = Array.from(byBroker.entries())
      .map(([broker, value]) => ({
        broker,
        cases: value.cases,
        closings: value.closings,
        closingRatePct: pct(value.closings, value.cases || 1),
        avgPendingItems: Number((value.pendingItems / Math.max(1, value.cases)).toFixed(2)),
        avgCycleHours: Number((value.cycleHoursTotal / Math.max(1, value.cases)).toFixed(2)),
        estimatedListingValueCents: value.estimatedListingValueCents,
        assignmentSource: value.assignmentSource,
        updatedAt: value.updatedAt.toISOString(),
      }))
      .sort(
        (a, b) =>
          b.closings - a.closings
          || b.estimatedListingValueCents - a.estimatedListingValueCents
          || a.broker.localeCompare(b.broker),
      );

    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      windowDays: resolvedWindowDays,
      metricSource: "derived" as const,
      totals: {
        brokers: items.length,
        cases: items.reduce((acc, item) => acc + item.cases, 0) + unassigned.cases,
        closings: items.reduce((acc, item) => acc + item.closings, 0) + unassigned.closings,
        estimatedListingValueCents:
          items.reduce((acc, item) => acc + item.estimatedListingValueCents, 0) + unassigned.estimatedListingValueCents,
      },
      unassigned: {
        ...unassigned,
        label: "Corretor não atribuído",
      },
      ranking: items,
      generatedAt: new Date().toISOString(),
    };
  }
}
