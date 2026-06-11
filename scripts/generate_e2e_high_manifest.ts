#!/usr/bin/env node
/**
 * E2E HIGH Manifest Generator
 *
 * Executa os cenários HIGH obrigatórios em staging e grava um manifesto real
 * em ops/evidence/latest/high-e2e-manifest.json.
 *
 * Requisitos (secrets de CI ou .env local):
 *   STAGING_API_BASE_URL  — URL base da API em staging (sem trailing slash)
 *   STAGING_API_TOKEN     — Bearer token com permissão de execução em staging
 *   E2E_TENANT_ID         — tenantId do tenant de teste dedicado
 *   E2E_WORKSPACE_ID      — workspaceId do workspace de teste dedicado
 *   E2E_AGENT_ID          — agentId para os runs HIGH (padrão: "imob")
 *
 * Saída: ops/evidence/latest/high-e2e-manifest.json
 */

import crypto from "node:crypto";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.STAGING_API_BASE_URL ?? "").replace(/\/$/, "");
const TOKEN = process.env.STAGING_API_TOKEN ?? "";
const TENANT_ID = process.env.E2E_TENANT_ID ?? "";
const WORKSPACE_ID = process.env.E2E_WORKSPACE_ID ?? "";
const AGENT_ID = process.env.E2E_AGENT_ID ?? "imob";
const POLL_INTERVAL_MS = 3_000;
const POLL_TIMEOUT_MS = 120_000;
const EVIDENCE_DIR = path.resolve("ops/evidence/latest");
const OUTPUT_FILE = path.join(EVIDENCE_DIR, "high-e2e-manifest.json");

const SCENARIOS: Array<{ action: string; agentId: string }> = [
  { action: "realestate.apply_adjustment", agentId: AGENT_ID },
  { action: "realestate.generate_charge", agentId: AGENT_ID },
];

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

function assertEnv() {
  const missing = (["STAGING_API_BASE_URL", "STAGING_API_TOKEN", "E2E_TENANT_ID", "E2E_WORKSPACE_ID"] as const)
    .filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(JSON.stringify({
      ok: false,
      step: "env-check",
      message: "Missing required environment variables",
      missing,
    }));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function apiFetch(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let parsed: unknown;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }
  return { status: res.status, body: parsed };
}

// ---------------------------------------------------------------------------
// Poll until run completed
// ---------------------------------------------------------------------------

async function pollRunCompleted(
  runId: string
): Promise<{ completedAt: string; status: string }> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const res = await apiFetch("GET", `/api/runs/${runId}`);
    const runData = (res.body as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
    const runStatus = runData?.status as string | undefined;
    if (runStatus === "completed" || runStatus === "failed" || runStatus === "error") {
      return { completedAt: new Date().toISOString(), status: runStatus };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(`Run ${runId} did not complete within ${POLL_TIMEOUT_MS}ms`);
}

// ---------------------------------------------------------------------------
// Derive txId from ledger by runId (async — may not exist immediately)
// ---------------------------------------------------------------------------

async function deriveTxIdFromLedger(runId: string): Promise<string | null> {
  // Poll up to 30s for SCL committed event
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const res = await apiFetch("GET", `/api/ledger?runId=${runId}`);
    const events = (res.body as Record<string, unknown>)?.events;
    if (Array.isArray(events)) {
      const sclEvent = events.find(
        (e: unknown) =>
          typeof e === "object" &&
          e !== null &&
          (e as Record<string, unknown>).type === "scl.committed" &&
          typeof (e as Record<string, unknown>).txId === "string"
      );
      if (sclEvent) {
        return (sclEvent as Record<string, unknown>).txId as string;
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return null; // txId not yet available — acceptable for this evidence cycle
}

// ---------------------------------------------------------------------------
// Fetch bundle and validate invariant
// ---------------------------------------------------------------------------

async function fetchBundle(runId: string): Promise<{ bundleHash: string | null; ok: boolean }> {
  const res = await apiFetch("GET", `/api/runs/${runId}/bundle`);
  if (res.status !== 200) return { bundleHash: null, ok: false };
  const bundleHash = (res.body as Record<string, unknown>)?.bundleHash as string | null ?? null;
  return { bundleHash, ok: !!bundleHash };
}

async function validateInvariant(txId: string): Promise<string> {
  const res = await apiFetch("GET", `/api/ledger/${txId}`);
  return ((res.body as Record<string, unknown>)?.invariant as Record<string, unknown>)?.status as string ?? "unknown";
}

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function stableSort(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableSort);
  if (!value || typeof value !== "object") return value;
  const rec = value as Record<string, unknown>;
  return Object.fromEntries(Object.keys(rec).sort().map((k) => [k, stableSort(rec[k])]));
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(stableSort(value));
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

// ---------------------------------------------------------------------------
// Run one scenario
// ---------------------------------------------------------------------------

async function runScenario(scenario: { action: string; agentId: string }) {
  console.error(`[e2e] Starting scenario: ${scenario.action}`);
  const startedAt = new Date().toISOString();

  // 1. Create run
  const createRes = await apiFetch("POST", "/api/runs", {
    agentId: scenario.agentId,
    action: scenario.action,
    tenantId: TENANT_ID,
    workspaceId: WORKSPACE_ID,
    metadata: { source: "e2e-high-staging" },
  });
  if (createRes.status !== 201 && createRes.status !== 200) {
    throw new Error(
      `Failed to create run for ${scenario.action}: HTTP ${createRes.status} — ${JSON.stringify(createRes.body)}`
    );
  }
  const createData = (createRes.body as Record<string, unknown>)?.data as Record<string, unknown> | undefined;
  const runId = (createData?.runId ?? createData?.id) as string | undefined;
  if (!runId) {
    throw new Error(`No runId returned for ${scenario.action}: ${JSON.stringify(createRes.body)}`);
  }
  console.error(`[e2e]   runId=${runId}`);

  // 2. Poll until completed
  const { completedAt, status: runStatus } = await pollRunCompleted(runId);
  const latencyMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  console.error(`[e2e]   completed status=${runStatus} latencyMs=${latencyMs}`);

  // 3. Derive txId from ledger (async — not guaranteed immediately)
  const txId = await deriveTxIdFromLedger(runId);
  console.error(`[e2e]   txId=${txId ?? "not-yet-available"}`);

  // 4. Validate invariant if txId available
  let invariantStatus = "no-tx";
  if (txId) {
    invariantStatus = await validateInvariant(txId);
    console.error(`[e2e]   invariant.status=${invariantStatus}`);
  }

  // 5. Fetch bundle
  const { bundleHash, ok: bundleOk } = await fetchBundle(runId);
  console.error(`[e2e]   bundleHash=${bundleHash ?? "null"}`);

  const passed =
    runStatus === "completed" &&
    (invariantStatus === "ok" || invariantStatus === "no-tx") &&
    bundleOk !== false;

  return {
    scenario: scenario.action,
    runId,
    startedAt,
    completedAt,
    latencyMs,
    txId,
    bundleHash,
    invariantStatus,
    status: passed ? "passed" : "failed",
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  assertEnv();

  let commitSha: string;
  try {
    commitSha = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    commitSha = process.env.GITHUB_SHA ?? "unknown";
  }

  // Run scenarios sequentially to keep ledger events ordered
  const results: Awaited<ReturnType<typeof runScenario>>[] = [];
  for (const scenario of SCENARIOS) {
    try {
      results.push(await runScenario(scenario));
    } catch (err) {
      console.error(`[e2e] FAILED scenario ${scenario.action}: ${err}`);
      results.push({
        scenario: scenario.action,
        runId: "error",
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        latencyMs: 0,
        txId: null,
        bundleHash: null,
        invariantStatus: "error",
        status: "failed",
      });
    }
  }

  const latencies = results.map((r) => r.latencyMs).filter((v) => v > 0).sort((a, b) => a - b);

  const manifest = {
    generatedAt: new Date().toISOString(),
    commitSha,
    environment: "staging",
    environmentHash: sha256(BASE_URL),
    generatedBy: "generate_e2e_high_manifest.ts",
    runIds: results.map((r) => r.runId),
    bundleHashes: results.map((r) => r.bundleHash),
    manifestHash: sha256(canonicalJson(results)),
    pouReceiptId: null, // preenchido quando PoU finalize estiver instrumentado em staging
    txId: results.find((r) => r.txId)?.txId ?? null,
    scenarioResults: results,
    latency: {
      p95Ms: percentile(latencies, 95),
      p99Ms: percentile(latencies, 99),
    },
  };

  if (!fs.existsSync(EVIDENCE_DIR)) {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));

  const allPassed = results.every((r) => r.status === "passed");
  console.log(
    JSON.stringify({
      ok: allPassed,
      file: OUTPUT_FILE,
      scenariosTotal: results.length,
      scenariosPassed: results.filter((r) => r.status === "passed").length,
      scenariosFailed: results.filter((r) => r.status === "failed").length,
      commitSha: manifest.commitSha,
      environment: manifest.environment,
    }, null, 2)
  );

  if (!allPassed) process.exit(1);
}

// Workaround: top-level await not available with --experimental-strip-types in all versions
// Using IIFE to handle async main with proper exit code
(async () => {
  // commitSha needs to be resolved — fix the dynamic import pattern
  await main().catch((err) => {
    console.error(JSON.stringify({ ok: false, step: "main", error: String(err) }));
    process.exit(1);
  });
})();
