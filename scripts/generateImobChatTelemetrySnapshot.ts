#!/usr/bin/env node
/**
 * IMOB Chat Telemetry Snapshot Generator
 *
 * Coleta métricas do endpoint GET /api/imob/chat/telemetry/summary em staging
 * e grava um snapshot em ops/evidence/latest/imob-chat-telemetry-snapshot-{date}.json.
 *
 * Requisitos (secrets de CI ou .env local):
 *   STAGING_API_BASE_URL  — URL base da API em staging (sem trailing slash)
 *   STAGING_API_TOKEN     — Bearer token com permissão de leitura em staging
 *   E2E_TENANT_ID         — tenantId do tenant de teste dedicado
 *   E2E_WORKSPACE_ID      — workspaceId do workspace de teste dedicado
 *
 * Sem as variáveis de ambiente, cria snapshot com valores null (modo offline).
 *
 * Saída: ops/evidence/latest/imob-chat-telemetry-snapshot-{date}.json
 */

import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_URL = (process.env.STAGING_API_BASE_URL ?? "").replace(/\/$/, "");
const TOKEN = process.env.STAGING_API_TOKEN ?? "";
const TENANT_ID = process.env.E2E_TENANT_ID ?? "";
const WORKSPACE_ID = process.env.E2E_WORKSPACE_ID ?? "";
const WINDOW_HOURS = 168; // 7 days — alinhado com cadência semanal do APE

const EVIDENCE_DIR = path.resolve("ops/evidence/latest");
const OUTPUT_DATE = new Date().toISOString().split("T")[0];
const OUTPUT_FILE = path.join(EVIDENCE_DIR, `imob-chat-telemetry-snapshot-${OUTPUT_DATE}.json`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(obj: Record<string, unknown>) {
  console.log(JSON.stringify(obj, null, 2));
}

function hasApiAccess(): boolean {
  return Boolean(BASE_URL && TOKEN && TENANT_ID && WORKSPACE_ID);
}

async function fetchTelemetrySummary(): Promise<Record<string, unknown> | null> {
  const url = `${BASE_URL}/api/imob/chat/telemetry/summary?windowHours=${WINDOW_HOURS}`;
  log({ step: "fetch-telemetry", url, windowHours: WINDOW_HOURS });

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "x-tenant-id": TENANT_ID,
      "x-workspace-id": WORKSPACE_ID,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    log({ step: "fetch-telemetry-error", status: response.status, url });
    return null;
  }

  const body = await response.json() as Record<string, unknown>;
  if (!body.ok) {
    log({ step: "fetch-telemetry-nok", body });
    return null;
  }

  return (body.data as Record<string, unknown>) ?? null;
}

function findPreviousSnapshot(): string | null {
  if (!fs.existsSync(EVIDENCE_DIR)) return null;
  const files = fs
    .readdirSync(EVIDENCE_DIR)
    .filter((f) => f.startsWith("imob-chat-telemetry-snapshot-") && f.endsWith(".json"))
    .sort()
    .reverse();
  return files.length ? path.join(EVIDENCE_DIR, files[0]) : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });

let apiData: Record<string, unknown> | null = null;
let source: string;

if (hasApiAccess()) {
  try {
    apiData = await fetchTelemetrySummary();
    source = apiData ? "api-response" : "api-error-fallback";
  } catch (err) {
    log({ step: "fetch-error", error: String(err) });
    source = "api-error-fallback";
  }
} else {
  source = "no-api-access";
  log({
    step: "skip-api",
    reason: "STAGING_API_BASE_URL / STAGING_API_TOKEN / E2E_TENANT_ID / E2E_WORKSPACE_ID not set",
    note: "snapshot will have null values — run with staging secrets for real data",
  });
}

const totals = apiData
  ? {
      chatToRunCoveragePct: (apiData.totals as any)?.chatToRunCoveragePct ?? null,
      persistSuccessRatePct: (apiData.totals as any)?.persistSuccessRatePct ?? null,
      messageToPlanAvgMs: (apiData.totals as any)?.messageToPlanAvgMs ?? null,
      planToExecuteAvgMs: (apiData.totals as any)?.planToExecuteAvgMs ?? null,
    }
  : {
      chatToRunCoveragePct: null,
      persistSuccessRatePct: null,
      messageToPlanAvgMs: null,
      planToExecuteAvgMs: null,
    };

const commercial = apiData
  ? {
      businessExports: (apiData.commercial as any)?.businessExports ?? null,
    }
  : { businessExports: null };

const sampleCount: number = apiData
  ? ((apiData.totals as any)?.events ?? 0)
  : 0;

const previousSnapshot = findPreviousSnapshot();

const snapshot = {
  specVersion: "imob-chat-telemetry.v1",
  generatedAt: new Date().toISOString(),
  windowHours: WINDOW_HOURS,
  source,
  previousSnapshot: previousSnapshot ? path.basename(previousSnapshot) : null,
  sampleCount,
  warnOnly: true,
  totals,
  commercial,
  thresholds: {
    chatToRunCoveragePct: { warn: 90, noGo: 80 },
    persistSuccessRatePct: { warn: 95, noGo: 85 },
    note: "warnOnly:true — thresholds registrados mas não bloqueantes até ratificação (IMOB-04)",
  },
};

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(snapshot, null, 2));

log({
  ok: true,
  step: "snapshot-written",
  file: OUTPUT_FILE,
  source,
  sampleCount,
  totals,
});
