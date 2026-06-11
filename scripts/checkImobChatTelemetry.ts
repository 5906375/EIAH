#!/usr/bin/env node
/**
 * IMOB Chat Telemetry Gate
 *
 * Comportamento progressivo:
 *   Fase 1 (warnOnly: true no snapshot) — registra aviso, sai 0 (APE continua)
 *   Fase 2 (warnOnly: false)            — aplica thresholds, sai 1 se violado
 *
 * Thresholds (Fase 2):
 *   chatToRunCoveragePct >= 90  → PASS
 *   chatToRunCoveragePct  < 80  → NO_GO
 *   persistSuccessRatePct < 85  → NO_GO
 *
 * Para ativar Fase 2: setar warnOnly: false no snapshot após 2 ciclos APE limpos.
 */

import fs from "node:fs";
import path from "node:path";

const CHECK = "check:imob-chat-telemetry";
const EVIDENCE_DIR = "ops/evidence/latest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function warn(message: string, extra?: Record<string, unknown>): void {
  console.warn(JSON.stringify({ ok: false, check: CHECK, warn: true, message, ...extra }, null, 2));
}

function fail(message: string, extra?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, ...extra }, null, 2));
  process.exit(1);
}

function pass(message: string, extra?: Record<string, unknown>): void {
  console.log(JSON.stringify({ ok: true, check: CHECK, message, ...extra }, null, 2));
}

function findLatestSnapshot(): string | null {
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

const snapshotPath = findLatestSnapshot();

if (!snapshotPath) {
  warn("No imob-chat-telemetry-snapshot found — warn-only until first snapshot is generated", {
    expected: `${EVIDENCE_DIR}/imob-chat-telemetry-snapshot-YYYY-MM-DD.json`,
    hint: "Run pnpm generate:imob-chat-telemetry-snapshot with staging secrets",
  });
  process.exit(0);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as Record<string, unknown>;
const totals = (snapshot.totals as Record<string, unknown>) ?? {};
const thresholds = (snapshot.thresholds as Record<string, unknown>) ?? {};

const coveragePct: number | null = totals.chatToRunCoveragePct != null ? Number(totals.chatToRunCoveragePct) : null;
const persistPct: number | null = totals.persistSuccessRatePct != null ? Number(totals.persistSuccessRatePct) : null;
const sampleCount = Number(snapshot.sampleCount ?? 0);
const warnOnly = snapshot.warnOnly !== false; // defaults to true unless explicitly false

// Fase 1 — warn-only: registrar estado e sair limpo
if (warnOnly) {
  if (sampleCount === 0 || coveragePct === null) {
    warn("IMOB chat telemetry snapshot has no samples — cannot evaluate coverage", {
      snapshot: path.basename(snapshotPath),
      sampleCount,
      warnOnly,
      hint: "Ensure generate:imob-chat-telemetry-snapshot runs with staging secrets",
    });
  } else {
    const coverageWarnThreshold = Number((thresholds as any)?.chatToRunCoveragePct?.warn ?? 90);
    if (coveragePct < coverageWarnThreshold) {
      warn(`IMOB chat coverage ${coveragePct.toFixed(1)}% is below warn threshold ${coverageWarnThreshold}%`, {
        snapshot: path.basename(snapshotPath),
        chatToRunCoveragePct: coveragePct,
        warnThreshold: coverageWarnThreshold,
        warnOnly,
      });
    } else {
      pass(`IMOB chat telemetry OK (warn-only phase) — coverage ${coveragePct.toFixed(1)}%`, {
        snapshot: path.basename(snapshotPath),
        chatToRunCoveragePct: coveragePct,
        persistSuccessRatePct: persistPct,
        sampleCount,
        warnOnly,
      });
    }
  }
  process.exit(0);
}

// Fase 2 — bloqueante: thresholds rígidos
if (sampleCount === 0 || coveragePct === null) {
  fail("IMOB chat telemetry snapshot has no samples — cannot evaluate coverage in enforced phase", {
    snapshot: path.basename(snapshotPath),
    sampleCount,
  });
}

const coverageNoGoThreshold = Number((thresholds as any)?.chatToRunCoveragePct?.noGo ?? 80);
const coverageWarnThreshold = Number((thresholds as any)?.chatToRunCoveragePct?.warn ?? 90);
const persistNoGoThreshold = Number((thresholds as any)?.persistSuccessRatePct?.noGo ?? 85);

const violations: string[] = [];

if (coveragePct! < coverageNoGoThreshold) {
  violations.push(`chatToRunCoveragePct ${coveragePct!.toFixed(1)}% < NO_GO threshold ${coverageNoGoThreshold}%`);
} else if (coveragePct! < coverageWarnThreshold) {
  warn(`IMOB chat coverage ${coveragePct!.toFixed(1)}% is below warn threshold ${coverageWarnThreshold}%`, {
    snapshot: path.basename(snapshotPath),
    chatToRunCoveragePct: coveragePct,
    warnThreshold: coverageWarnThreshold,
  });
}

if (persistPct !== null && persistPct < persistNoGoThreshold) {
  violations.push(`persistSuccessRatePct ${persistPct.toFixed(1)}% < NO_GO threshold ${persistNoGoThreshold}%`);
}

if (violations.length > 0) {
  fail(`IMOB chat telemetry gate violated: ${violations.join("; ")}`, {
    snapshot: path.basename(snapshotPath),
    chatToRunCoveragePct: coveragePct,
    persistSuccessRatePct: persistPct,
    sampleCount,
    violations,
  });
}

pass(`IMOB chat telemetry gate PASS`, {
  snapshot: path.basename(snapshotPath),
  chatToRunCoveragePct: coveragePct,
  persistSuccessRatePct: persistPct,
  sampleCount,
});
