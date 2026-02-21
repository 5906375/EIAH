import { getCriticalLatencyPercentiles } from "@eiah/core";

function toNumber(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function envNumber(name: string, fallback: number) {
  return toNumber(process.env[name], fallback);
}

type CriticalMetricRow = {
  metric: string;
  value: number;
  labels: Record<string, string>;
};

type PouSloPrismaLike = {
  guardrailAuditLedger: {
    findFirst: (args: {
      where: { eventType: string };
      orderBy: { createdAt: "desc" };
      select: { metadata: true };
    }) => Promise<{ metadata: unknown } | null>;
  };
  proofOfUsage: {
    count: (args: { where: { status: "PENDING" | "PENDING_TRUST" } }) => Promise<number>;
  };
};

export type PouSloSnapshot = {
  availability: number;
  p95Ms: number | null;
  p99Ms: number | null;
  mismatchRate: number;
  mismatchCount: number;
  checkedTotal: number;
  backlogPending: number;
  backlogPendingTrust: number;
  backlogTotal: number;
  alerts: {
    availability: boolean;
    latencyP95: boolean;
    latencyP99: boolean;
    mismatchRate: boolean;
    backlog: boolean;
    any: boolean;
  };
  timestamp: string;
};

function metricValue(rows: CriticalMetricRow[], metric: string, labels?: Record<string, string>) {
  const found = rows.find((row) => {
    if (row.metric !== metric) return false;
    if (!labels) return true;
    return Object.entries(labels).every(([key, value]) => row.labels[key] === value);
  });
  return found?.value ?? 0;
}

export async function collectPouSloSnapshot(params: {
  criticalMetrics: CriticalMetricRow[];
  prisma: PouSloPrismaLike;
}): Promise<PouSloSnapshot> {
  const prisma = params.prisma;
  const requestTotal = metricValue(params.criticalMetrics, "pou_endpoint_requests_total");
  const errorTotal = metricValue(params.criticalMetrics, "pou_endpoint_errors_total");
  const successTotal = Math.max(0, requestTotal - errorTotal);
  const availability = requestTotal > 0 ? Number((successTotal / requestTotal).toFixed(6)) : 1;

  const latency = await getCriticalLatencyPercentiles("pou_endpoint_latency_ms", [0.95, 0.99]);
  const p95Ms = latency.p95 ?? null;
  const p99Ms = latency.p99 ?? null;

  const latestReconcile = await prisma.guardrailAuditLedger.findFirst({
    where: { eventType: "ledger.reconcile" },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
  });

  const metadata =
    latestReconcile?.metadata && typeof latestReconcile.metadata === "object"
      ? (latestReconcile.metadata as Record<string, unknown>)
      : null;

  const checkedTotal =
    toNumber(metadata?.checkedGuardrail, 0) + toNumber(metadata?.checkedScl, 0);
  const mismatchCount =
    toNumber(metadata?.missingInSclCount, 0) +
    toNumber(metadata?.missingInGuardrailCount, 0) +
    toNumber(metadata?.mismatchedTxCount, 0);
  const mismatchRate =
    checkedTotal > 0 ? Number((mismatchCount / checkedTotal).toFixed(6)) : 0;

  const [backlogPending, backlogPendingTrust] = await Promise.all([
    prisma.proofOfUsage.count({ where: { status: "PENDING" } }),
    prisma.proofOfUsage.count({ where: { status: "PENDING_TRUST" } }),
  ]);
  const backlogTotal = backlogPending + backlogPendingTrust;

  const thresholds = {
    availabilityMin: envNumber("POU_SLO_AVAILABILITY_MIN", 0.99),
    p95MaxMs: envNumber("POU_SLO_P95_MAX_MS", 1200),
    p99MaxMs: envNumber("POU_SLO_P99_MAX_MS", 2500),
    mismatchRateMax: envNumber("POU_SLO_MISMATCH_RATE_MAX", 0.02),
    backlogMax: envNumber("POU_SLO_BACKLOG_MAX", 100),
  };

  const alerts = {
    availability: availability < thresholds.availabilityMin,
    latencyP95: p95Ms !== null && p95Ms > thresholds.p95MaxMs,
    latencyP99: p99Ms !== null && p99Ms > thresholds.p99MaxMs,
    mismatchRate: mismatchRate > thresholds.mismatchRateMax,
    backlog: backlogTotal > thresholds.backlogMax,
    any: false,
  };
  alerts.any =
    alerts.availability ||
    alerts.latencyP95 ||
    alerts.latencyP99 ||
    alerts.mismatchRate ||
    alerts.backlog;

  return {
    availability,
    p95Ms,
    p99Ms,
    mismatchRate,
    mismatchCount,
    checkedTotal,
    backlogPending,
    backlogPendingTrust,
    backlogTotal,
    alerts,
    timestamp: new Date().toISOString(),
  };
}
