#!/usr/bin/env node
/**
 * IMOB Chat Export Evidence Gate
 *
 * Valida que existe evidência recente do teste de contrato de exportação IMOB chat.
 * Aceita tanto imob-chat-f4-audit-export-smoke-*.json (legado)
 * quanto imob-chat-export-contract-*.json (contrato formal do IMOB-02).
 *
 * Comportamento progressivo:
 *   Fase 1 (warnOnly: true)  — registra aviso, sai 0 (APE continua)
 *   Fase 2 (warnOnly: false) — evidência stale ou ausente causa NO_GO (sai 1)
 *
 * Para ativar Fase 2: setar IMOB_CHAT_EVIDENCE_ENFORCE=true após 2 ciclos APE limpos.
 */

import fs from "node:fs";
import path from "node:path";

const CHECK = "check:imob-chat-export";
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

function findLatestEvidence(): { file: string; date: string; kind: string } | null {
  if (!fs.existsSync(EVIDENCE_DIR)) return null;

  // Prefer formal contract evidence (IMOB-02) over legacy smoke
  const prefixes = [
    { prefix: "imob-chat-export-contract-", kind: "contract" },
    { prefix: "imob-chat-f4-audit-export-smoke-", kind: "smoke" },
  ];

  for (const { prefix, kind } of prefixes) {
    const files = fs
      .readdirSync(EVIDENCE_DIR)
      .filter((f) => f.startsWith(prefix) && f.endsWith(".json"))
      .sort()
      .reverse();
    if (files.length) {
      const file = files[0];
      const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})\.json$/);
      if (dateMatch) return { file: path.join(EVIDENCE_DIR, file), date: dateMatch[1], kind };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const evidence = findLatestEvidence();

if (!evidence) {
  gate("No imob-chat export evidence found", {
    expected: [
      `${EVIDENCE_DIR}/imob-chat-export-contract-YYYY-MM-DD.json`,
      `${EVIDENCE_DIR}/imob-chat-f4-audit-export-smoke-YYYY-MM-DD.json`,
    ],
  });
  if (WARN_ONLY) process.exit(0);
}

const { file, date, kind } = evidence!;
const ageMs = Date.now() - new Date(date).getTime();
const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

if (ageDays > MAX_EVIDENCE_AGE_DAYS) {
  gate(`IMOB chat export evidence is ${ageDays} days old (max ${MAX_EVIDENCE_AGE_DAYS})`, {
    file: path.basename(file),
    kind,
    date,
    ageDays,
    maxAgeDays: MAX_EVIDENCE_AGE_DAYS,
  });
  if (WARN_ONLY) process.exit(0);
}

const data = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
const testResult =
  (data.validation as any)?.contract_test ??
  (data.validation as any)?.web_build ??
  null;

if (testResult && testResult !== "pass") {
  gate(`IMOB chat export evidence shows non-pass result: ${testResult}`, {
    file: path.basename(file),
    testResult,
  });
  if (WARN_ONLY) process.exit(0);
}

pass(`IMOB chat export evidence OK — ${ageDays} days old (${kind})`, {
  file: path.basename(file),
  kind,
  date,
  ageDays,
  testResult: testResult ?? "not-recorded",
  warnOnly: WARN_ONLY,
});
