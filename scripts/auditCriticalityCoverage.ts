import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
for (const entry of entries) {
  if (!existsSync(resolve(entry))) {
    missing.push(entry);
  }
}

const result = {
  ok: missing.length === 0,
  check: "audit:criticality",
  allowlist: allowlistPath,
  allowlistedCount: entries.length,
  existingCount: entries.length - missing.length,
  missingCount: missing.length,
  missing,
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

console.log(
  `[audit:criticality] OK — ${entries.length} allowlisted file(s) verified, all present.`
);
console.log(`[audit:criticality] output written to: ${outPath}`);
