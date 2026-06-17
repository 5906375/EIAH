#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { collectBaselineData, percentile } from "./sloBaselineCollect.ts";

/**
 * SLO Baseline Generator — economy.slo.baseline
 *
 * Coleta amostras de latência para derivar p50/p95/p99 do PoU finalize.
 * Fase 1: deriva do manifesto E2E HIGH (latencyMs por cenário ou agregado via Caminho B).
 * Fase futura: query direta ao GuardrailLedger com janela de tempo.
 *
 * Output: ops/evidence/latest/economy-slo-baseline-{YYYY-MM-DD}.json
 *
 * sampleSource no output:
 *   "scenario-latency"  — amostras reais por cenário (preferido, conta para ratificação)
 *   "aggregate-latency" — fallback manifest.latency aggregate; samplesCount=0 (não conta)
 *   "none"              — sem dados de latência disponíveis
 */

const EVIDENCE_DIR = path.resolve("ops/evidence/latest");
const OUTPUT_DATE = new Date().toISOString().split("T")[0];
const OUTPUT_FILE = path.join(EVIDENCE_DIR, `economy-slo-baseline-${OUTPUT_DATE}.json`);
const MANIFEST_FILE = path.join(EVIDENCE_DIR, "high-e2e-manifest.json");

function collectSamplesFromApeHistory(): number[] {
  // Fase 1: retorna vazio — implementação futura via GuardrailLedger
  return [];
}

const collected = collectBaselineData(MANIFEST_FILE);
const histSamples = collectSamplesFromApeHistory();

// Only raw samples (scenario-latency) merge with APE history
const allSamples = [...collected.samples, ...histSamples].sort((a, b) => a - b);

function buildPouFinalize() {
  if (allSamples.length > 0) {
    return {
      p50Ms: percentile(allSamples, 50),
      p95Ms: percentile(allSamples, 95),
      p99Ms: percentile(allSamples, 99),
      note: "derived from scenarioResults.latencyMs — full GuardrailLedger query pending staging access",
    };
  }
  if (collected.sampleSource === "aggregate-latency") {
    return {
      p50Ms: null,
      p95Ms: collected.aggregateP95Ms,
      p99Ms: collected.aggregateP99Ms,
      note: "Caminho B fallback: derived from manifest.latency aggregate — no per-scenario latencyMs present; p50Ms unavailable; samplesCount=0 (does not satisfy minSamplesRequired for ratification)",
    };
  }
  return {
    p50Ms: null,
    p95Ms: null,
    p99Ms: null,
    note: "no samples collected yet — run after E2E HIGH manifest has real staging data",
  };
}

const baseline = {
  generatedAt: new Date().toISOString(),
  scope: "economy-slo-baseline",
  sampleSource: collected.sampleSource,
  manifestCommitSha: collected.manifestCommitSha,
  source: {
    type: "e2e-manifest-latency",
    environment: process.env.ENVIRONMENT ?? "ci",
    queryWindow: "last-e2e-high-manifest",
    note: "Phase 1: samples derived from scenarioResults.latencyMs (or manifest.latency aggregate via Caminho B). Phase 2 will query GuardrailLedger pou.finalized events directly.",
  },
  samplesCount: allSamples.length,
  pouFinalize: buildPouFinalize(),
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
  sampleSource: baseline.sampleSource,
  samplesCount: baseline.samplesCount,
  pouFinalizeP95Ms: baseline.pouFinalize.p95Ms,
}, null, 2));
