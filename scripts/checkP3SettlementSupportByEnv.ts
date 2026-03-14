import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p3-settlement-support-by-env";
const MATRIX_FILE = "ops/contracts/settlement-provider-support-matrix.v1.json";
const EVIDENCE_FILE = "ops/evidence/latest/settlement-provider-e2e-2026-03-09.json";
const ENVIRONMENT = String(process.env.SETTLEMENT_ENV ?? "staging").toLowerCase();

type Matrix = {
  name?: string;
  version?: string;
  environments?: Record<string, Record<string, string[]>>;
};

type Evidence = {
  providers?: Array<{ id?: string; mode?: string }>;
};

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readJson<T>(relativePath: string): T {
  const file = path.resolve(relativePath);
  if (!fs.existsSync(file)) fail("missing_file", { file: relativePath });
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

const matrix = readJson<Matrix>(MATRIX_FILE);
const evidence = readJson<Evidence>(EVIDENCE_FILE);

if (matrix.version !== "1.0.0") {
  fail("unsupported_matrix_version", { expected: "1.0.0", got: matrix.version ?? null });
}

const envSpec = matrix.environments?.[ENVIRONMENT];
if (!envSpec) {
  fail("unsupported_environment", {
    environment: ENVIRONMENT,
    supported: Object.keys(matrix.environments ?? {}),
  });
}

const providers = (evidence.providers ?? []).map((provider) => ({
  id: String(provider.id ?? "").trim(),
  mode: String(provider.mode ?? "").trim().toLowerCase(),
}));

if (providers.length === 0) {
  fail("evidence_has_no_providers");
}

const violations: Array<{ provider: string; mode: string; allowedModes: string[] }> = [];

for (const provider of providers) {
  const allowedModes = envSpec[provider.id];
  if (!allowedModes || allowedModes.length === 0) {
    violations.push({ provider: provider.id, mode: provider.mode, allowedModes: [] });
    continue;
  }
  if (!allowedModes.includes(provider.mode)) {
    violations.push({ provider: provider.id, mode: provider.mode, allowedModes });
  }
}

if (violations.length > 0) {
  fail("provider_mode_not_allowed_for_environment", { environment: ENVIRONMENT, violations });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      environment: ENVIRONMENT,
      providers,
      matrix: MATRIX_FILE,
      evidence: EVIDENCE_FILE,
    },
    null,
    2
  )
);
