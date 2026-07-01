import fs from "node:fs";
import path from "node:path";

const CHECK = "check:worker-topology";
const REASON_CODE = "WORKER_TOPOLOGY_STATIC_GATE_FAILED";

type Violation = {
  file: string;
  rule: string;
  message: string;
};

const violations: Violation[] = [];

function read(file: string) {
  const absolute = path.resolve(file);
  if (!fs.existsSync(absolute)) {
    violations.push({ file, rule: "file_exists", message: "required file is missing" });
    return "";
  }
  return fs.readFileSync(absolute, "utf8");
}

function requireText(file: string, source: string, text: string, rule: string) {
  if (!source.includes(text)) {
    violations.push({ file, rule, message: `required text not found: ${text}` });
  }
}

function forbid(file: string, source: string, pattern: RegExp, rule: string, message: string) {
  if (pattern.test(source)) {
    violations.push({ file, rule, message });
  }
}

function serviceBlock(compose: string, service: string) {
  const lines = compose.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${service}:`);
  if (start < 0) return "";
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index++) {
    if (/^  [a-zA-Z0-9_-]+:\s*$/.test(lines[index] ?? "")) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

function listTypeScriptFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (["dist", "node_modules"].includes(entry.name)) return [];
      return listTypeScriptFiles(target);
    }
    return entry.isFile() && target.endsWith(".ts") ? [target] : [];
  });
}

const envTemplateFile = ".env.template";
const composeFile = "docker-compose.dev.yml";
const apiFile = "apps/api/src/index.ts";
const standaloneFile = "apps/workers/run-worker/src/index.ts";
const maintenanceFile = "apps/workers/maintenance-worker/src/index.ts";
const universalFile = "apps/workers/maintenance-worker/src/jobs/runAtivoUniversalJob.ts";
const topologyFile = "packages/core/src/queue/workerTopology.ts";
const topologyDocFile = "docs/architecture/worker-topology.md";

const envTemplate = read(envTemplateFile);
const compose = read(composeFile);
const api = read(apiFile);
const standalone = read(standaloneFile);
const maintenance = read(maintenanceFile);
const universal = read(universalFile);
const topology = read(topologyFile);
read(topologyDocFile);

forbid(
  envTemplateFile,
  envTemplate,
  /^RUN_QUEUE_WORKER=/m,
  "legacy_default_removed",
  "legacy RUN_QUEUE_WORKER must not be present",
);
for (const text of [
  "EIAH_ENVIRONMENT_ID=eiah-dev",
  "SERVICE_ROLE=api",
  "RUN_QUEUE_CONSUMER_MODE=api-embedded",
  "RUN_ATIVO_CONSUMER_MODE=disabled",
]) {
  requireText(envTemplateFile, envTemplate, text, "explicit_template_topology");
}

const apiCompose = serviceBlock(compose, "api");
const maintenanceCompose = serviceBlock(compose, "maintenance-worker");
for (const text of [
  "EIAH_ENVIRONMENT_ID=eiah-dev",
  "SERVICE_ROLE=api",
  "RUN_QUEUE_CONSUMER_MODE=api-embedded",
  "RUN_ATIVO_CONSUMER_MODE=disabled",
]) {
  requireText(composeFile, apiCompose, text, "api_compose_topology");
}
for (const text of [
  "EIAH_ENVIRONMENT_ID=eiah-dev",
  "SERVICE_ROLE=maintenance-worker",
  "RUN_QUEUE_CONSUMER_MODE=disabled",
  "RUN_ATIVO_CONSUMER_MODE=maintenance",
]) {
  requireText(composeFile, maintenanceCompose, text, "maintenance_compose_topology");
}

requireText(apiFile, api, "resolveWorkerTopology(process.env)", "api_resolves_topology");
requireText(apiFile, api, "workerTopology.consumes.runs", "api_governed_consumer");
forbid(
  apiFile,
  api,
  /RUN_QUEUE_WORKER/,
  "api_legacy_default_removed",
  "API must not use legacy permissive RUN_QUEUE_WORKER",
);

requireText(
  standaloneFile,
  standalone,
  "resolveWorkerTopology(process.env)",
  "standalone_resolves_topology",
);
requireText(
  standaloneFile,
  standalone,
  "topology.consumes.runs",
  "standalone_governed_consumer",
);
forbid(
  standaloneFile,
  standalone,
  /RUN_ATIVO_UNIVERSAL_QUEUE_NAME|RunAtivoUniversalJobPayload|run-ativo-universal|consumeUniversalQueue/,
  "standalone_universal_forbidden",
  "standalone must never consume run-ativo-universal",
);
forbid(
  standaloneFile,
  standalone,
  /new\s+Worker\s*</,
  "standalone_direct_worker_forbidden",
  "standalone may only consume runs through the governed runQueue consumer",
);

requireText(
  maintenanceFile,
  maintenance,
  "resolveWorkerTopology(process.env)",
  "maintenance_resolves_topology",
);
requireText(
  maintenanceFile,
  maintenance,
  "topology.consumes.runAtivoUniversal",
  "maintenance_governed_consumer",
);
forbid(
  maintenanceFile,
  maintenance,
  /import\s+["']\.\/jobs\/runAtivoUniversalJob["']/,
  "maintenance_side_effect_import_forbidden",
  "maintenance must not start the universal worker through a side-effect import",
);
requireText(
  universalFile,
  universal,
  "export function startRunAtivoUniversalWorker()",
  "universal_lazy_start",
);

const allowedCriticalWorkerFiles = new Set([
  "apps/api/src/workers/runWorker.ts",
  "apps/workers/maintenance-worker/src/jobs/runAtivoUniversalJob.ts",
  "packages/core/src/queue/runQueue.ts",
]);
for (const file of [...listTypeScriptFiles("apps"), ...listTypeScriptFiles("packages")]) {
  const normalizedFile = file.split(path.sep).join("/");
  const source = fs.readFileSync(file, "utf8");
  const createsCriticalWorker =
    /new\s+Worker(?:<|\s*\()/.test(source) &&
    (source.includes("QueueName.RUNS") || source.includes("RUN_ATIVO_UNIVERSAL_QUEUE_NAME"));
  if (createsCriticalWorker && !allowedCriticalWorkerFiles.has(normalizedFile)) {
    violations.push({
      file: normalizedFile,
      rule: "critical_worker_path_allowed",
      message: "critical queue Worker may only be created by a governed canonical module",
    });
  }
}

for (const reasonCode of [
  "WORKER_TOPOLOGY_ENVIRONMENT_ID_REQUIRED",
  "WORKER_TOPOLOGY_SERVICE_ROLE_REQUIRED",
  "WORKER_TOPOLOGY_RUN_QUEUE_MODE_REQUIRED",
  "WORKER_TOPOLOGY_RUN_ATIVO_MODE_REQUIRED",
  "WORKER_TOPOLOGY_ROLE_RUN_QUEUE_CONFLICT",
  "WORKER_TOPOLOGY_ROLE_RUN_ATIVO_CONFLICT",
]) {
  requireText(topologyFile, topology, reasonCode, "topology_reason_codes");
}

if (violations.length > 0) {
  console.error(JSON.stringify({ ok: false, check: CHECK, reasonCode: REASON_CODE, violations }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      topology: {
        runs: ["api-embedded", "standalone"],
        runAtivoUniversal: ["maintenance-worker"],
      },
      p0b2Required: true,
    },
    null,
    2,
  ),
);
