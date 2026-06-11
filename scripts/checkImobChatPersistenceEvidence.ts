#!/usr/bin/env node
/**
 * IMOB Chat Persistence Evidence Gate
 *
 * Valida que existe evidência recente do teste de contrato de persistência IMOB chat.
 *
 * Comportamento progressivo:
 *   Fase 1 (warnOnly: true)  — registra aviso, sai 0 (APE continua)
 *   Fase 2 (warnOnly: false) — evidência stale ou ausente causa NO_GO (sai 1)
 *
 * Para ativar Fase 2: setar IMOB_CHAT_EVIDENCE_ENFORCE=true após 2 ciclos APE limpos.
 */

import fs from "node:fs";
import path from "node:path";

const CHECK = "check:imob-chat-persistence";
const EVIDENCE_DIR = "ops/evidence/latest";
const MAX_EVIDENCE_AGE_DAYS = 90;
const WARN_ONLY = process.env.IMOB_CHAT_EVIDENCE_ENFORCE !== "true";

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

function gate(message: string, extra?: Record<string, unknown>): void {
  if (WARN_ONLY) {
    warn(message, { ...extra, warnOnly: true });
  } else {
    fail(message, extra);
  }
}

function findLatestEvidence(): { file: string; date: string } | null {
  if (!fs.existsSync(EVIDENCE_DIR)) return null;
  const files = fs
    .readdirSync(EVIDENCE_DIR)
    .filter((f) => f.startsWith("imob-chat-persistence-smoke-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (!files.length) return null;
  const file = files[0];
  const dateMatch = file.match(/imob-chat-persistence-smoke-(\d{4}-\d{2}-\d{2})\.json/);
  return dateMatch ? { file: path.join(EVIDENCE_DIR, file), date: dateMatch[1] } : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const evidence = findLatestEvidence();

if (!evidence) {
  gate("No imob-chat-persistence-smoke evidence found", {
    expected: `${EVIDENCE_DIR}/imob-chat-persistence-smoke-YYYY-MM-DD.json`,
  });
  if (WARN_ONLY) process.exit(0);
}

const { file, date } = evidence!;
const ageMs = Date.now() - new Date(date).getTime();
const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

if (ageDays > MAX_EVIDENCE_AGE_DAYS) {
  gate(`IMOB chat persistence evidence is ${ageDays} days old (max ${MAX_EVIDENCE_AGE_DAYS})`, {
    file: path.basename(file),
    date,
    ageDays,
    maxAgeDays: MAX_EVIDENCE_AGE_DAYS,
  });
  if (WARN_ONLY) process.exit(0);
}

const data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
const testResult = (data.test as any)?.result ?? (data.validation as any)?.contract_test ?? null;

if (testResult && testResult !== "pass") {
  gate(`IMOB chat persistence evidence shows non-pass result: ${testResult}`, {
    file: path.basename(file),
    testResult,
  });
  if (WARN_ONLY) process.exit(0);
}

pass(`IMOB chat persistence evidence OK — ${ageDays} days old`, {
  file: path.basename(file),
  date,
  ageDays,
  testResult: testResult ?? "not-recorded",
  warnOnly: WARN_ONLY,
});
