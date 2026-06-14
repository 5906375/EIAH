import test from "node:test";
import assert from "node:assert/strict";

import { ImobCrmKpiService } from "../services/imob/crm/imobCrmKpiService";

function buildPrismaMock(params: {
  cases: Array<Record<string, unknown>>;
  events?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
}) {
  return {
    imobCase: {
      findMany: async (args?: { where?: { createdAt?: { gte?: Date; lte?: Date } } }) => {
        const createdAt = args?.where?.createdAt;
        return params.cases.filter((item) => {
          const value = item.createdAt instanceof Date ? item.createdAt : new Date(String(item.createdAt));
          if (createdAt?.gte && value.getTime() < createdAt.gte.getTime()) return false;
          if (createdAt?.lte && value.getTime() > createdAt.lte.getTime()) return false;
          return true;
        });
      },
    },
    imobCaseEvent: {
      findMany: async (args?: { where?: { createdAt?: { gte?: Date; lte?: Date } } }) => {
        const createdAt = args?.where?.createdAt;
        return (params.events ?? []).filter((item) => {
          const value = item.createdAt instanceof Date ? item.createdAt : new Date(String(item.createdAt));
          if (createdAt?.gte && value.getTime() < createdAt.gte.getTime()) return false;
          if (createdAt?.lte && value.getTime() > createdAt.lte.getTime()) return false;
          return true;
        });
      },
    },
    run: {
      findMany: async (args?: { where?: { createdAt?: { gte?: Date; lte?: Date } } }) => {
        const createdAt = args?.where?.createdAt;
        return (params.runs ?? []).filter((item) => {
          const raw = item.createdAt ?? item.updatedAt;
          const value = raw instanceof Date ? raw : new Date(String(raw));
          if (createdAt?.gte && value.getTime() < createdAt.gte.getTime()) return false;
          if (createdAt?.lte && value.getTime() > createdAt.lte.getTime()) return false;
          return true;
        });
      },
    },
  } as any;
}

test("IMOB KPI service moves internal owner labels into unassigned bucket and keeps broker ranking clean", async () => {
  const service = new ImobCrmKpiService(buildPrismaMock({
    cases: [
      {
        id: "case-internal",
        threadId: null,
        flow: "proposal.create",
        stage: "proposal",
        status: "done",
        ownerResponsible: "Financeiro",
        pendingItems: [],
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        updatedAt: new Date("2026-06-02T10:00:00.000Z"),
        property: { askingPriceCents: 500_000_00 },
      },
      {
        id: "case-broker",
        threadId: null,
        flow: "proposal.create",
        stage: "proposal",
        status: "done",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        updatedAt: new Date("2026-06-02T11:00:00.000Z"),
        property: { askingPriceCents: 650_000_00 },
      },
    ],
  }));

  const result = await service.buildPerformanceKpis({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  }, { windowDays: 30 });

  assert.equal(result.metricSource, "derived");
  assert.equal(result.windowDays, 30);
  assert.equal(result.ranking.some((item) => item.broker === "Financeiro"), false);
  assert.equal(result.ranking.some((item) => item.broker === "Corretor não atribuído"), false);
  assert.equal(result.ranking.some((item) => item.broker === "Mariana Souza"), true);
  assert.equal(result.unassigned.label, "Corretor não atribuído");
  assert.equal(result.unassigned.cases, 1);
  assert.equal(result.unassigned.closings, 1);
  assert.equal(result.unassigned.estimatedListingValueCents, 500_000_00);
  assert.equal(result.ranking[0]?.assignmentSource, "owner_responsible_fallback");
});

test("IMOB KPI service aggregates run cost and journey cost beyond page-sized frontend samples", async () => {
  const runs = Array.from({ length: 101 }, (_, index) => ({
    caseId: "case-1",
    threadId: null,
    agent: "flow-orchestrator",
    request: { action: "contract.prepare" },
    costCents: 100 + index,
    createdAt: new Date("2026-06-02T12:00:00.000Z"),
  }));
  const service = new ImobCrmKpiService(buildPrismaMock({
    cases: [
      {
        id: "case-1",
        threadId: null,
        flow: "contract.prepare",
        stage: "closing",
        status: "done",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        updatedAt: new Date("2026-06-02T11:00:00.000Z"),
        property: { askingPriceCents: 900_000_00 },
      },
    ],
    runs,
  }));

  const result = await service.buildFunnelKpis({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  }, { windowDays: 30 });

  const expectedTotal = runs.reduce((sum, item) => sum + Number(item.costCents ?? 0), 0);
  assert.equal(result.totalRunCostCents, expectedTotal);
  assert.equal(result.casesWithRunCount, 1);
  assert.deepEqual(result.costByJourney, [
    {
      label: "Contrato",
      cases: 1,
      costCents: expectedTotal,
      runs: 101,
    },
  ]);
  assert.deepEqual(result.costCoverage, {
    runsCount: 101,
    linkedRunsCount: 101,
    unlinkedRunsCount: 0,
  });
  assert.deepEqual(result.coverage, {
    durationSampleSize: 1,
    resolutionSampleSize: 0,
  });
});

test("IMOB KPI service normalizes equivalent run actions into the same journey bucket and tracks unlinked runs", async () => {
  const service = new ImobCrmKpiService(buildPrismaMock({
    cases: [
      {
        id: "case-1",
        threadId: "thread-1",
        flow: "owner.create",
        stage: "opened",
        status: "running",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        updatedAt: new Date("2026-06-02T11:00:00.000Z"),
        property: { askingPriceCents: 900_000_00 },
      },
    ],
    runs: [
      {
        caseId: "case-1",
        threadId: null,
        agent: "flow-orchestrator",
        request: { action: "realestate.owner.create" },
        costCents: 100,
        createdAt: new Date("2026-06-02T12:00:00.000Z"),
      },
      {
        caseId: "case-1",
        threadId: null,
        agent: "flow-orchestrator",
        request: { action: "owner.create" },
        costCents: 200,
        createdAt: new Date("2026-06-02T12:10:00.000Z"),
      },
      {
        caseId: "case-1",
        threadId: null,
        agent: "flow-orchestrator",
        request: { action: "property.create" },
        costCents: 300,
        createdAt: new Date("2026-06-02T12:20:00.000Z"),
      },
      {
        caseId: null,
        threadId: null,
        agent: "unknown-agent",
        request: { action: "proposal.create" },
        costCents: 999,
        createdAt: new Date("2026-06-02T12:30:00.000Z"),
      },
    ],
  }));

  const result = await service.buildFunnelKpis({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  }, { windowDays: 30 });

  assert.deepEqual(result.costByJourney, [
    {
      label: "Captação",
      cases: 1,
      costCents: 600,
      runs: 3,
    },
  ]);
  assert.deepEqual(result.costCoverage, {
    runsCount: 4,
    linkedRunsCount: 3,
    unlinkedRunsCount: 1,
  });
});

test("IMOB KPI service falls back to metadata.action and linked case flow when request.action is missing", async () => {
  const service = new ImobCrmKpiService(buildPrismaMock({
    cases: [
      {
        id: "case-1",
        threadId: "thread-1",
        flow: "property.create",
        stage: "collecting",
        status: "running",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        updatedAt: new Date("2026-06-02T11:00:00.000Z"),
        property: { askingPriceCents: 900_000_00 },
      },
      {
        id: "case-2",
        threadId: "thread-2",
        flow: "contract.prepare",
        stage: "closing",
        status: "running",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        updatedAt: new Date("2026-06-02T11:00:00.000Z"),
        property: { askingPriceCents: 900_000_00 },
      },
    ],
    runs: [
      {
        caseId: "case-1",
        threadId: "thread-1",
        agent: "fin-nexus",
        request: { metadata: { action: "realestate.register_property" } },
        costCents: 100,
        createdAt: new Date("2026-06-02T12:00:00.000Z"),
      },
      {
        caseId: "case-2",
        threadId: "thread-2",
        agent: "EIAH",
        request: { metadata: { domain: "imob", action: "realestate.create_contract" } },
        costCents: 200,
        createdAt: new Date("2026-06-02T12:10:00.000Z"),
      },
    ],
  }));

  const result = await service.buildFunnelKpis({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  }, { windowDays: 30 });

  assert.deepEqual(result.costByJourney, [
    {
      label: "Contrato",
      cases: 1,
      costCents: 200,
      runs: 1,
    },
    {
      label: "Captação",
      cases: 1,
      costCents: 100,
      runs: 1,
    },
  ]);
});

test("IMOB KPI funnel is monotonic even when cases jump stages out of order", async () => {
  const service = new ImobCrmKpiService(buildPrismaMock({
    cases: [
      {
        id: "case-visit",
        threadId: null,
        flow: "visit.schedule",
        stage: "visit",
        status: "running",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-03T10:00:00.000Z"),
        updatedAt: new Date("2026-06-04T10:00:00.000Z"),
        property: { askingPriceCents: 700_000_00 },
      },
      {
        id: "case-proposal-direct",
        threadId: null,
        flow: "proposal.create",
        stage: "proposal",
        status: "running",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-03T11:00:00.000Z"),
        updatedAt: new Date("2026-06-04T11:00:00.000Z"),
        property: { askingPriceCents: 800_000_00 },
      },
    ],
  }));

  const result = await service.buildFunnelKpis({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  }, {
    from: new Date("2026-06-01T00:00:00.000Z"),
    to: new Date("2026-06-07T23:59:59.000Z"),
  });

  assert.deepEqual(result.steps, [
    { id: "opened", label: "Casos criados no período", count: 2, conversionPct: 100 },
    { id: "qualified", label: "Lead qualificado", count: 2, conversionPct: 100 },
    { id: "visit", label: "Visita", count: 2, conversionPct: 100 },
    { id: "proposal", label: "Proposta", count: 1, conversionPct: 50 },
    { id: "closing", label: "Fechamento", count: 0, conversionPct: 0 },
  ]);
  assert.equal(result.conversions.visitToProposalPct, 50);
});

test("IMOB KPI funnel counts opened only for cases created inside the selected window", async () => {
  const service = new ImobCrmKpiService(buildPrismaMock({
    cases: [
      {
        id: "case-old",
        threadId: null,
        flow: "proposal.create",
        stage: "proposal",
        status: "running",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-05-01T10:00:00.000Z"),
        updatedAt: new Date("2026-06-04T10:00:00.000Z"),
        property: { askingPriceCents: 700_000_00 },
      },
      {
        id: "case-new",
        threadId: null,
        flow: "lead.qualify",
        stage: "qualified",
        status: "qualified",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-03T11:00:00.000Z"),
        updatedAt: new Date("2026-06-04T11:00:00.000Z"),
        property: { askingPriceCents: 800_000_00 },
      },
    ],
    events: [
      {
        caseId: "case-old",
        type: "imob.case.updated",
        payload: { flow: "proposal.create", stage: "proposal" },
        createdAt: new Date("2026-06-05T10:00:00.000Z"),
      },
    ],
  }));

  const result = await service.buildFunnelKpis({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  }, {
    from: new Date("2026-06-01T00:00:00.000Z"),
    to: new Date("2026-06-07T23:59:59.000Z"),
  });

  assert.equal(result.totals.cases, 1);
  assert.equal(result.totals.qualified, 1);
  assert.equal(result.totals.proposals, 0);
  assert.deepEqual(result.coverage, {
    durationSampleSize: 0,
    resolutionSampleSize: 0,
  });
});

test("IMOB KPI service builds case cost snapshot for requested cases without pagination drift", async () => {
  const service = new ImobCrmKpiService(buildPrismaMock({
    cases: [
      {
        id: "case-1",
        threadId: "thread-1",
        flow: "owner.create",
        stage: "opened",
        status: "running",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-03T10:00:00.000Z"),
        updatedAt: new Date("2026-06-04T10:00:00.000Z"),
        property: { askingPriceCents: 700_000_00 },
      },
      {
        id: "case-2",
        threadId: "thread-2",
        flow: "proposal.create",
        stage: "proposal",
        status: "running",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-03T11:00:00.000Z"),
        updatedAt: new Date("2026-06-04T11:00:00.000Z"),
        property: { askingPriceCents: 800_000_00 },
      },
    ],
    runs: [
      {
        caseId: "case-1",
        threadId: null,
        agent: "flow-orchestrator",
        request: { action: "owner.create" },
        costCents: 120,
        createdAt: new Date("2026-06-04T12:00:00.000Z"),
      },
      {
        caseId: null,
        threadId: "thread-2",
        agent: "flow-orchestrator",
        request: { action: "proposal.create" },
        costCents: 240,
        createdAt: new Date("2026-06-04T12:10:00.000Z"),
      },
      {
        caseId: null,
        threadId: null,
        agent: "flow-orchestrator",
        request: { action: "proposal.create" },
        costCents: 999,
        createdAt: new Date("2026-06-04T12:20:00.000Z"),
      },
    ],
  }));

  const result = await service.buildCaseCostSnapshot({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  }, {
    caseIds: ["case-1", "case-2"],
    windowDays: 30,
  });

  assert.deepEqual(result.items, [
    {
      caseId: "case-2",
      threadId: "thread-2",
      costCents: 240,
      runs: 1,
    },
    {
      caseId: "case-1",
      threadId: "thread-1",
      costCents: 120,
      runs: 1,
    },
  ]);
  assert.deepEqual(result.coverage, {
    runsCount: 3,
    linkedRunsCount: 2,
    unlinkedRunsCount: 1,
  });
});

test("IMOB KPI service uses real terminal event as primary duration source when available", async () => {
  const service = new ImobCrmKpiService(buildPrismaMock({
    cases: [
      {
        id: "case-terminal-event",
        threadId: null,
        flow: "commission.settle",
        stage: "settled",
        status: "success",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        updatedAt: new Date("2026-06-01T10:00:00.000Z"),
        property: { askingPriceCents: 700_000_00 },
      },
    ],
    events: [
      {
        caseId: "case-terminal-event",
        type: "commission.settlement.completed",
        payload: null,
        createdAt: new Date("2026-06-01T11:30:00.000Z"),
      },
    ],
  }));

  const result = await service.buildFunnelKpis({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  }, { windowDays: 30 });

  assert.equal(result.totals.closings, 1);
  assert.equal(result.averageDurationHours, 1.5);
  assert.deepEqual(result.coverage, {
    durationSampleSize: 1,
    resolutionSampleSize: 0,
  });
});

test("IMOB KPI service does not use updated_at_proxy when terminal case has identical timestamps", async () => {
  const service = new ImobCrmKpiService(buildPrismaMock({
    cases: [
      {
        id: "case-unreliable-terminal",
        threadId: null,
        flow: "commission.settle",
        stage: "settled",
        status: "success",
        ownerResponsible: "Mariana Souza",
        pendingItems: [],
        createdAt: new Date("2026-06-01T10:00:00.000Z"),
        updatedAt: new Date("2026-06-01T10:00:00.000Z"),
        property: { askingPriceCents: 700_000_00 },
      },
    ],
  }));

  const result = await service.buildFunnelKpis({
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
  }, { windowDays: 30 });

  assert.equal(result.totals.closings, 1);
  assert.equal(result.averageDurationHours, null);
  assert.deepEqual(result.coverage, {
    durationSampleSize: 0,
    resolutionSampleSize: 0,
  });
});
