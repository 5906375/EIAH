/**
 * 🧠 EIAH_BUILDER — Intent Validator de Infraestrutura
 * Fase 2 do Roadmap Unificado: validação cognitiva de ambiente
 * Autor: Sistema Agentic Corporativo (EIAH_Builder)
 */

import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";

// ---------------------------------------------------------------------------
// 0. Carrega .env manualmente (evita dependências extras)
// ---------------------------------------------------------------------------
const envPath = path.resolve(process.cwd(), ".env");
if (!fs.existsSync(envPath)) {
  console.error("❌ Arquivo .env não encontrado no diretório raiz.");
  process.exit(1);
}

const envData = fs.readFileSync(envPath, "utf-8");
for (const line of envData.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const [key, ...rest] = trimmed.split("=");
  if (!key || rest.length === 0) continue;
  const value = rest.join("=").trim().replace(/^\"|\"$/g, "");
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

// ---------------------------------------------------------------------------
// 1. Validação manual das variáveis obrigatórias
// ---------------------------------------------------------------------------
const validators: Record<string, (val: string | undefined) => string | null> = {
  DATABASE_URL: (v) => (isUrl(v) ? null : "DATABASE_URL inválida"),
  REDIS_URL: (v) => (isUrl(v) ? null : "REDIS_URL inválida"),
  OPENAI_API_KEY: (v) => (v && v.length >= 8 ? null : "OPENAI_API_KEY ausente ou curta"),
  PORT: (v) => (/^\d+$/.test(v ?? "") ? null : "PORT deve ser numérica"),
  ADMIN_API_TOKEN: (v) => (v && v.length >= 3 ? null : "ADMIN_API_TOKEN ausente ou curta"),
  NEXT_PUBLIC_API_URL: (v) => (isUrl(v) ? null : "NEXT_PUBLIC_API_URL inválida"),
  UPLOADS_DIR: (v) => (v ? null : "UPLOADS_DIR ausente"),
  MAX_UPLOAD_BYTES: (v) => (/^\d+$/.test(v ?? "") ? null : "MAX_UPLOAD_BYTES deve ser numérica"),
  MAX_UPLOAD_FILES: (v) => (/^\d+$/.test(v ?? "") ? null : "MAX_UPLOAD_FILES deve ser numérica"),
  ALLOWED_UPLOAD_MIMES: (v) => (v ? null : "ALLOWED_UPLOAD_MIMES ausente"),
  RUN_QUEUE_WORKER: () => null, // opcional
};

function isUrl(value?: string) {
  if (!value) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

const errors: string[] = [];
for (const [key, validate] of Object.entries(validators)) {
  const err = validate(process.env[key]);
  if (err) errors.push(`- ${key}: ${err}`);
}

if (errors.length > 0) {
  console.error("❌ Falha na validação do ambiente:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("✅ Ambiente validado com sucesso.");

// ---------------------------------------------------------------------------
// 3. Geração do hash SHA-256 do .env ativo
// ---------------------------------------------------------------------------
const envHash = crypto.createHash("sha256").update(envData).digest("hex");
console.log(`🔐 Hash SHA256 (.env): ${envHash}`);

// ---------------------------------------------------------------------------
// 4. Registro no GuardrailLedger (repo logs, fallback em /tmp)
// ---------------------------------------------------------------------------
const primaryLedgerDir = path.resolve(process.cwd(), "logs");
const primaryLedgerPath = path.join(primaryLedgerDir, "guardrail-ledger.log");
const fallbackLedgerDir = path.join(os.tmpdir(), "eiah-guardrail");
const fallbackLedgerPath = path.join(fallbackLedgerDir, "guardrail-ledger.log");

const ledgerEvent = {
  type: "env_validation",
  phase: "F2",
  hash: envHash,
  validated_by: "scripts/env:validate.ts",
  result: "success",
  timestamp: new Date().toISOString(),
};

let ledgerPathUsed = primaryLedgerPath;
try {
  fs.mkdirSync(primaryLedgerDir, { recursive: true });
  fs.appendFileSync(primaryLedgerPath, JSON.stringify(ledgerEvent) + "\n");
} catch (err) {
  console.warn("⚠️ Falha ao gravar em logs/guardrail-ledger.log, usando fallback em /tmp", err?.message ?? err);
  fs.mkdirSync(fallbackLedgerDir, { recursive: true });
  fs.appendFileSync(fallbackLedgerPath, JSON.stringify(ledgerEvent) + "\n");
  ledgerPathUsed = fallbackLedgerPath;
}
console.log(`🪶 Registro salvo em ${ledgerPathUsed}`);

// ---------------------------------------------------------------------------
// 5. Trust Score inicial
// ---------------------------------------------------------------------------
const baseTrust = 0.8;
const trustAdjustment = 0.05; // bônus por validação bem-sucedida
const trustScore = baseTrust + trustAdjustment;

console.log(`✨ Trust Score Inicial (infra): ${trustScore.toFixed(2)}\n`);

// ---------------------------------------------------------------------------
// 6. Saída para CI/CD
// ---------------------------------------------------------------------------
console.log("✅ Ambiente pronto para execução (Fase 2 – Intent Validator).");
process.exit(0);
