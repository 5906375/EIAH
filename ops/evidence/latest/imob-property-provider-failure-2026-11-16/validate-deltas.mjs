// Local evidence runner for the authorized Δ1–Δ3 scope. Never loads credentials or calls a provider.
import { spawnSync } from "node:child_process";
import { openSync, closeSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
const dir = path.dirname(new URL(import.meta.url).pathname);
const commands = {
  consumers: ["pnpm", ["test:llm-provider-failure"]],
  ids: ["node", ["--import", "tsx", "--test-name-pattern=^(runtime: rate limit|IDs:)", "apps/api/src/tests/llm-provider-failure.test.ts"], { TSX_TSCONFIG_PATH: "tsconfig.base.json" }],
  capability: ["node", ["--import", "tsx", "--test-name-pattern=^executeCapability", "apps/api/src/tests/capability-execution.test.ts"],
    { TSX_TSCONFIG_PATH: "tsconfig.base.json", DATABASE_URL: "postgresql://synthetic:synthetic@127.0.0.1:1/synthetic" }],
  types: ["node", [`${dir}/typecheck-deltas.mjs`]],
  "types-final": ["node", [`${dir}/typecheck-deltas.mjs`, "--reuse-baseline"]],
  ci: ["node", ["--import", "tsx", "scripts/checkOrphanTests.ts"], { ORPHAN_TESTS_COMPARE_REF: "70e66db4e7eea727f0f3567d8291595b1f86243b" }],
  index: ["node", ["--import", "tsx", "scripts/checkEvidenceIndex.ts"]],
  whitespace: ["git", ["diff", "--check"]],
  contracts: ["pnpm", ["--filter", "@eiah/contracts", "exec", "tsc", "-p", "tsconfig.json", "--noEmit"]],
  core: ["pnpm", ["--filter", "@eiah/core", "build"]],
  providers: ["pnpm", ["--filter", "@eiah/providers", "build"]],
  package: ["node", [`${dir}/package-smoke.mjs`]],
};
const [name, label = name] = process.argv.slice(2);
if (!Object.hasOwn(commands, name) || !/^[a-z0-9-]+$/.test(label)) throw new Error("Unknown validation");
const log = path.join(dir, `delta-${label}.log`);
if (existsSync(log)) throw new Error("Preserve the existing log; choose a new label");
const [command, args, env = {}] = commands[name];
const startedAt = new Date().toISOString();
const fd = openSync(log, "wx");
const result = spawnSync(command, args, { stdio: ["ignore", fd, fd], env: { ...process.env, ...env, NO_COLOR: "1" } });
closeSync(fd);
const file = path.join(dir, "delta-executions.json");
const records = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
const record = { name, label, command, args, env, log: path.basename(log), startedAt, finishedAt: new Date().toISOString(), exitCode: result.status, signal: result.signal, error: result.error?.message ?? null };
records.push(record); writeFileSync(file, JSON.stringify(records, null, 2) + "\n");
console.log(JSON.stringify(record)); process.exitCode = result.status ?? 1;
