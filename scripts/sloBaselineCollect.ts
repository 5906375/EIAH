import fs from "node:fs";

/**
 * Coleta de amostras de latência para o baseline SLO.
 *
 * Prioridade:
 *   1. scenarioResults[].latencyMs — amostras reais por cenário (preferido)
 *   2. manifest.latency.p95Ms / p99Ms — agregado do manifesto (Caminho B fallback)
 *   3. Nenhuma fonte válida → sampleSource "none"
 *
 * Caminho B não satisfaz minSamplesRequired (samplesCount permanece 0) e não deve
 * ser usado para ratificação. Serve apenas para tornar o baseline não-nulo e
 * permitir verificação da fórmula antes de rodar ciclos reais em staging.
 */

export type SampleSource = "scenario-latency" | "aggregate-latency" | "none";

export interface BaselineCollectResult {
  samples: number[];
  aggregateP95Ms: number | null;
  aggregateP99Ms: number | null;
  sampleSource: SampleSource;
  manifestCommitSha: string | null;
}

export function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function collectBaselineData(manifestPath: string): BaselineCollectResult {
  const empty = (src: SampleSource = "none"): BaselineCollectResult => ({
    samples: [],
    aggregateP95Ms: null,
    aggregateP99Ms: null,
    sampleSource: src,
    manifestCommitSha: null,
  });

  if (!fs.existsSync(manifestPath)) return empty();

  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    return empty();
  }

  if (!data || typeof data !== "object") return empty();
  const manifest = data as Record<string, unknown>;
  const manifestCommitSha = typeof manifest.commitSha === "string" ? manifest.commitSha : null;

  // Priority 1: per-scenario latencyMs
  const scenarioResults = Array.isArray(manifest.scenarioResults) ? manifest.scenarioResults : [];
  const scenarioSamples = (scenarioResults as unknown[])
    .map((r) =>
      r && typeof r === "object" && "latencyMs" in r
        ? Number((r as Record<string, unknown>).latencyMs)
        : NaN
    )
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (scenarioSamples.length > 0) {
    return { samples: scenarioSamples, aggregateP95Ms: null, aggregateP99Ms: null, sampleSource: "scenario-latency", manifestCommitSha };
  }

  // Priority 2 (Caminho B): manifest.latency aggregate
  const latency = manifest.latency;
  if (latency && typeof latency === "object") {
    const agg = latency as Record<string, unknown>;
    const p95 = typeof agg.p95Ms === "number" && Number.isFinite(agg.p95Ms) && agg.p95Ms > 0 ? agg.p95Ms : null;
    const p99 = typeof agg.p99Ms === "number" && Number.isFinite(agg.p99Ms) && agg.p99Ms > 0 ? agg.p99Ms : null;
    if (p95 !== null || p99 !== null) {
      return { samples: [], aggregateP95Ms: p95, aggregateP99Ms: p99, sampleSource: "aggregate-latency", manifestCommitSha };
    }
  }

  return { ...empty(), manifestCommitSha };
}
