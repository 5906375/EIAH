#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

/**
 * SLO Baseline Generator — economy.slo.baseline
 *
 * Coleta amostras de latência para derivar p50/p95/p99 do PoU finalize.
 * Fase 1: deriva do manifesto E2E HIGH existente (latencyMs por cenário).
 * Fase futura: query direta ao GuardrailLedger com janela de tempo.
 *
 * Output: ops/evidence/latest/economy-slo-baseline-{YYYY-MM-DD}.json
 */

const EVIDENCE_DIR = path.resolve("ops/evidence/latest");
const OUTPUT_DATE = new Date().toISOString().split("T")[0];
const OUTPUT_FILE = path.join(EVIDENCE_DIR, `economy-slo-baseline-${OUTPUT_DATE}.json`);

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function collectSamplesFromManifest(): number[] {
  const manifest = path.join(EVIDENCE_DIR, "high-e2e-manifest.json");
  if (!fs.existsSync(manifest)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(manifest, "utf8"));
    const results: unknown[] = Array.isArray(data.scenarioResults) ? data.scenarioResults : [];
    return results
      .map((r) => (r && typeof r === "object" && "latencyMs" in r ? Number((r as Record<string, unknown>).latencyMs) : NaN))
      .filter((v) => Number.isFinite(v) && v > 0);
  } catch {
    return [];
  }
}

function collectSamplesFromApeHistory(): number[] {
  // Lê arquivos ape-weekly-cycle-run*.md e extrai latências se disponíveis
  // Fase 1: retorna vazio — implementação futura via GuardrailLedger
  return [];
}

const manifestSamples = collectSamplesFromManifest();
const histSamples = collectSamplesFromApeHistory();
const allSamples = [...manifestSamples, ...histSamples].sort((a, b) => a - b);

const baseline = {
  generatedAt: new Date().toISOString(),
  scope: "economy-slo-baseline",
  source: {
    type: "e2e-manifest-latency",
    // Será "guardrail-ledger" quando query DB for implementada em staging
    environment: process.env.ENVIRONMENT ?? "ci",
    queryWindow: "last-e2e-high-manifest",
    note: "Phase 1: samples derived from scenarioResults.latencyMs. Phase 2 will query GuardrailLedger pou.finalized events directly.",
  },
  samplesCount: allSamples.length,
  pouFinalize: allSamples.length > 0
    ? {
        p50Ms: percentile(allSamples, 50),
        p95Ms: percentile(allSamples, 95),
        p99Ms: percentile(allSamples, 99),
        note: "derived from scenarioResults.latencyMs — full GuardrailLedger query pending staging access",
      }
    : {
        p50Ms: null,
        p95Ms: null,
        p99Ms: null,
        note: "no samples collected yet — run after E2E HIGH manifest has real staging data",
      },
  onChainConfirmation: {
    p95Ms: null,
    status: "awaiting-full-provider",
    reason: "crypto and bank providers are simulated-only — target undefined until provider mode = full",
  },
};

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(baseline, null, 2));
console.log(JSON.stringify({
  ok: true,
  file: OUTPUT_FILE,
  samplesCount: allSamples.length,
  pouFinalizeP95Ms: baseline.pouFinalize.p95Ms,
}, null, 2));
