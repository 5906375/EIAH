import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

type MarkerRule = {
  minBytes: number;
  allOf?: string[];
  anyOf?: string[];
  description: string;
};

const CONTENT_RULES: Record<string, MarkerRule> = {
  "docs/EVIDENCE_INDEX.md": {
    minBytes: 64,
    allOf: ["# EVIDENCE INDEX", "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md"],
    description: "Evidence Index must point to the canonical roadmap and keep its main heading.",
  },
  "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md": {
    minBytes: 64,
    allOf: ["Data de referência desta revisão"],
    description: "Canonical roadmap must expose its reference date marker.",
  },
  "scripts/checkP1CriticalChain.ts": {
    minBytes: 64,
    allOf: ["approvalStatus RunApprovalStatus", "approval.policy.v1", "failClosedEvidence"],
    description: "Critical chain gate must still validate approval, receipt policy and fail-closed evidence.",
  },
  "scripts/checkP1ReconciliationRecurring.ts": {
    minBytes: 64,
    allOf: ["auditGap", "duplicateSideEffects"],
    description: "Recurring reconciliation gate must still track auditGap and duplicateSideEffects.",
  },
  "packages/core/src/queue/workerOwnershipLease.ts": {
    minBytes: 64,
    allOf: ["ttlMs", "ownerId", "resolveLeaseKey"],
    description: "Worker ownership lease must still expose lease TTL, owner identity and lease key resolution.",
  },
  "packages/core/src/config/redis.ts": {
    minBytes: 32,
    allOf: ["requireRedisUrl", "REDIS_URL_REQUIRED", "Localhost fallback is forbidden in runtime."],
    description: "Redis config must still require explicit URL and block localhost fallback.",
  },
};

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--") && i + 1 < argv.length) {
      args[arg.slice(2)] = argv[++i];
    }
  }
  return args;
}

function fail(message: string): never {
  console.error(`[audit:criticality] FAIL — ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

const outPath = args["out"];
const allowlistPath = args["allowlist"];

if (!outPath) {
  fail("--out is required");
}

if (!allowlistPath) {
  fail("--allowlist is required");
}

const allowlistAbsolute = resolve(allowlistPath);
if (!existsSync(allowlistAbsolute)) {
  fail(`allowlist file not found: ${allowlistPath}`);
}

const raw = readFileSync(allowlistAbsolute, "utf-8");
const entries = raw
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.length > 0 && !line.startsWith("#"));

if (entries.length === 0) {
  fail(`allowlist is empty (no effective entries after filtering): ${allowlistPath}`);
}

const missing: string[] = [];
const invalidContent: Array<{
  file: string;
  reason: string;
  sizeBytes?: number;
  minBytes?: number;
  missingMarkers?: string[];
}> = [];

for (const entry of entries) {
  const absolute = resolve(entry);
  if (!existsSync(absolute)) {
    missing.push(entry);
    continue;
  }

  const content = readFileSync(absolute, "utf-8");
  const sizeBytes = Buffer.byteLength(content, "utf8");
  const rule = CONTENT_RULES[entry];

  if (!rule) {
    invalidContent.push({
      file: entry,
      reason: "missing_content_rule",
    });
    continue;
  }

  if (sizeBytes < rule.minBytes) {
    invalidContent.push({
      file: entry,
      reason: "content_too_small",
      sizeBytes,
      minBytes: rule.minBytes,
    });
    continue;
  }

  const missingMarkers = (rule.allOf ?? []).filter((marker) => !content.includes(marker));
  if (missingMarkers.length > 0) {
    invalidContent.push({
      file: entry,
      reason: "missing_required_markers",
      missingMarkers,
    });
    continue;
  }

  if (rule.anyOf && !rule.anyOf.some((marker) => content.includes(marker))) {
    invalidContent.push({
      file: entry,
      reason: "missing_any_equivalent_marker",
      missingMarkers: rule.anyOf,
    });
  }
}

const result = {
  ok: missing.length === 0 && invalidContent.length === 0,
  check: "audit:criticality",
  allowlist: allowlistPath,
  allowlistedCount: entries.length,
  existingCount: entries.length - missing.length,
  missingCount: missing.length,
  missing,
  contentRulesCount: Object.keys(CONTENT_RULES).length,
  invalidContentCount: invalidContent.length,
  invalidContent,
  validatedFiles: entries
    .filter((entry) => !missing.includes(entry))
    .map((entry) => ({
      file: entry,
      markers: CONTENT_RULES[entry]?.allOf ?? [],
      minBytes: CONTENT_RULES[entry]?.minBytes ?? 0,
    })),
  generatedAt: new Date().toISOString(),
};

const outAbsolute = resolve(outPath);
mkdirSync(dirname(outAbsolute), { recursive: true });
writeFileSync(outAbsolute, JSON.stringify(result, null, 2) + "\n", "utf-8");

if (missing.length > 0) {
  console.error(
    `[audit:criticality] FAIL — ${missing.length} allowlisted file(s) missing:`
  );
  for (const m of missing) {
    console.error(`  - ${m}`);
  }
  process.exit(1);
}

if (invalidContent.length > 0) {
  console.error(
    `[audit:criticality] FAIL — ${invalidContent.length} allowlisted file(s) failed content validation:`
  );
  for (const item of invalidContent) {
    console.error(`  - ${item.file}: ${item.reason}`);
    if (item.missingMarkers?.length) {
      for (const marker of item.missingMarkers) {
        console.error(`      marker: ${marker}`);
      }
    }
  }
  process.exit(1);
}

console.log(
  `[audit:criticality] OK — ${entries.length} allowlisted file(s) verified with content markers.`
);
console.log(`[audit:criticality] output written to: ${outPath}`);
