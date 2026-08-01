import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CHECK = "check:p3-settlement-support-by-env";
const MATRIX_FILE = "ops/contracts/settlement-provider-support-matrix.v1.json";
const RUNBOOK_FILE = "docs/ops/settlement-provider-runbook.md";
const ENVIRONMENT = String(process.env.SETTLEMENT_ENV ?? "staging").toLowerCase();

export type SettlementSupportMatrix = {
  name?: string;
  version?: string;
  environments?: Record<string, Record<string, string[]>>;
  // Required only for providers advertised as full/live. The module must be a
  // single, versioned implementation that is independent from the local stub.
  providerAdapters?: Record<string, { module?: string }>;
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

export type ProviderAdapterGroundingViolation = {
  provider: string;
  modes: string[];
  criterion: 1 | 2 | 3;
  code: string;
  message: string;
  module?: string;
  candidates?: string[];
};

type GroundingOptions = {
  repositoryRoot: string;
  versionedFiles: ReadonlySet<string>;
};

const LOCAL_STUB_MODULE = "apps/api/src/services/settlementProviders.ts";
const MODULE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs", ".cjs"];

function toRepoRelative(repositoryRoot: string, absolutePath: string) {
  return path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
}

function moduleCandidates(repositoryRoot: string, declaredModule: string) {
  const base = path.resolve(repositoryRoot, declaredModule);
  const candidates = path.extname(base)
    ? [base]
    : [
        base,
        ...MODULE_EXTENSIONS.map((extension) => `${base}${extension}`),
        ...MODULE_EXTENSIONS.map((extension) => path.join(base, `index${extension}`)),
      ];
  return [...new Set(candidates)].filter((candidate) => {
    try {
      return fs.statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function importsOrReexportsLocalStub(source: string) {
  if (/\b(?:import|export)\s+[^;]*\bsettleWithProvider\b[^;]*(?:;|$)/ms.test(source)) {
    return true;
  }
  const specifiers = [
    ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*["']([^"']+)["']/g),
  ].map((match) => match[1].replace(/\\/g, "/"));
  return specifiers.some((specifier) =>
    /(?:^|\/)settlementProviders(?:\.[cm]?[jt]sx?)?$/.test(specifier),
  );
}

export function validateFullLiveProviderGrounding(
  matrix: SettlementSupportMatrix,
  options: GroundingOptions,
): ProviderAdapterGroundingViolation[] {
  const repositoryRoot = path.resolve(options.repositoryRoot);
  const versionedFiles = new Set(
    [...options.versionedFiles].map((file) => path.posix.normalize(file.replace(/^\.\//, ""))),
  );
  const elevatedModes = new Map<string, Set<string>>();

  for (const envSpec of Object.values(matrix.environments ?? {})) {
    for (const [provider, modes] of Object.entries(envSpec)) {
      for (const rawMode of modes ?? []) {
        const mode = String(rawMode).trim().toLowerCase();
        if (mode !== "full" && mode !== "live") continue;
        const providerModes = elevatedModes.get(provider) ?? new Set<string>();
        providerModes.add(mode);
        elevatedModes.set(provider, providerModes);
      }
    }
  }

  const violations: ProviderAdapterGroundingViolation[] = [];
  for (const [provider, providerModes] of elevatedModes) {
    const modes = [...providerModes].sort();
    const declaredModule = String(matrix.providerAdapters?.[provider]?.module ?? "").trim();
    if (!declaredModule) {
      violations.push({
        provider,
        modes,
        criterion: 1,
        code: "provider_adapter_module_not_declared",
        message: `providerAdapters.${provider}.module is required for full/live support`,
      });
      continue;
    }

    const resolvedBase = path.resolve(repositoryRoot, declaredModule);
    const relativeBase = toRepoRelative(repositoryRoot, resolvedBase);
    if (
      path.isAbsolute(declaredModule)
      || relativeBase === ".."
      || relativeBase.startsWith("../")
      || path.isAbsolute(relativeBase)
    ) {
      violations.push({
        provider,
        modes,
        criterion: 2,
        code: "provider_adapter_module_not_versioned_existing",
        message: "adapter module must resolve to an existing versioned file inside the repository",
        module: declaredModule,
      });
      continue;
    }

    const existingCandidates = moduleCandidates(repositoryRoot, declaredModule);
    const versionedCandidates = existingCandidates.filter((candidate) =>
      versionedFiles.has(path.posix.normalize(toRepoRelative(repositoryRoot, candidate))),
    );
    if (versionedCandidates.length === 0) {
      violations.push({
        provider,
        modes,
        criterion: 2,
        code: "provider_adapter_module_not_versioned_existing",
        message: "adapter module must resolve to an existing versioned file inside the repository",
        module: declaredModule,
        candidates: existingCandidates.map((candidate) => toRepoRelative(repositoryRoot, candidate)),
      });
      continue;
    }

    if (existingCandidates.length !== 1 || versionedCandidates.length !== 1) {
      violations.push({
        provider,
        modes,
        criterion: 3,
        code: "provider_adapter_module_resolution_ambiguous",
        message: "adapter module resolution must be unambiguous",
        module: declaredModule,
        candidates: existingCandidates.map((candidate) => toRepoRelative(repositoryRoot, candidate)),
      });
      continue;
    }

    const adapterFile = versionedCandidates[0];
    const localStubFile = path.resolve(repositoryRoot, LOCAL_STUB_MODULE);
    let resolvesToLocalStub = path.resolve(adapterFile) === localStubFile;
    try {
      resolvesToLocalStub ||= fs.realpathSync(adapterFile) === fs.realpathSync(localStubFile);
    } catch {
      // The direct path comparison remains authoritative when realpath is unavailable.
    }
    const source = fs.readFileSync(adapterFile, "utf8");
    if (resolvesToLocalStub || importsOrReexportsLocalStub(source)) {
      violations.push({
        provider,
        modes,
        criterion: 3,
        code: "provider_adapter_module_resolves_to_local_stub",
        message: "adapter module must not resolve to, import, or re-export the local settlement stub",
        module: declaredModule,
        candidates: [toRepoRelative(repositoryRoot, adapterFile)],
      });
    }
  }

  return violations;
}

function collectVersionedFiles(repositoryRoot: string) {
  try {
    return new Set(
      execFileSync("git", ["ls-files", "-z"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).split("\0").filter(Boolean),
    );
  } catch (error) {
    fail("versioned_file_inventory_unavailable", {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function runCheck() {
  const matrix = readJson<SettlementSupportMatrix>(MATRIX_FILE);
  const evidenceFile = findLatestEvidenceFile(/^settlement-provider-e2e-\d{4}-\d{2}-\d{2}\.json$/);
  const evidence = readJson<Evidence>(path.relative(process.cwd(), evidenceFile));
  if (!fs.existsSync(path.resolve(RUNBOOK_FILE))) {
    fail("missing_runbook", { file: RUNBOOK_FILE });
  }
  const runbook = fs.readFileSync(path.resolve(RUNBOOK_FILE), "utf8");

  if (matrix.version !== "1.0.0") {
    fail("unsupported_matrix_version", { expected: "1.0.0", got: matrix.version ?? null });
  }

  const groundingViolations = validateFullLiveProviderGrounding(matrix, {
    repositoryRoot: process.cwd(),
    versionedFiles: collectVersionedFiles(process.cwd()),
  });
  if (groundingViolations.length > 0) {
    fail("full_live_provider_adapter_grounding_failed", { violations: groundingViolations });
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
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runCheck();
