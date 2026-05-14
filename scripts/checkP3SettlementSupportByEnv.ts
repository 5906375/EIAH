import fs from "node:fs";
import path from "node:path";

const CHECK = "check:p3-settlement-support-by-env";
const MATRIX_FILE = "ops/contracts/settlement-provider-support-matrix.v1.json";
const RUNBOOK_FILE = "docs/ops/settlement-provider-runbook.md";
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

function findLatestEvidenceFile(pattern: RegExp): string {
  const dir = path.resolve("ops/evidence/latest");
  if (!fs.existsSync(dir)) fail("missing_evidence_dir", { dir: path.relative(process.cwd(), dir) });
  const files = fs.readdirSync(dir).filter((file) => pattern.test(file)).sort().reverse();
  if (files.length === 0) {
    fail("missing_evidence_file", { pattern: pattern.source, dir: path.relative(process.cwd(), dir) });
  }
  return path.join(dir, files[0]);
}

const matrix = readJson<Matrix>(MATRIX_FILE);
const evidenceFile = findLatestEvidenceFile(/^settlement-provider-e2e-\d{4}-\d{2}-\d{2}\.json$/);
const evidence = readJson<Evidence>(path.relative(process.cwd(), evidenceFile));
if (!fs.existsSync(path.resolve(RUNBOOK_FILE))) {
  fail("missing_runbook", { file: RUNBOOK_FILE });
}
const runbook = fs.readFileSync(path.resolve(RUNBOOK_FILE), "utf8");

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

for (const needle of [
  "modo suportado por ambiente",
  "pnpm check:p3-settlement-support-by-env",
  "ops/contracts/settlement-provider-support-matrix.v1.json",
]) {
  if (!runbook.includes(needle)) {
    fail("runbook_missing_settlement_env_support_invariant", { file: RUNBOOK_FILE, needle });
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      environment: ENVIRONMENT,
      providers,
      matrix: MATRIX_FILE,
      evidence: path.relative(process.cwd(), evidenceFile),
      runbook: RUNBOOK_FILE,
    },
    null,
    2
  )
);
