import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CHECK = "check:gate-waiver-expiry";
const CONTRACT_FILE = "ops/contracts/gate-waivers.v1.json";
const WORKFLOW_DIRECTORY = ".github/workflows";
const INFORMATIONAL_JOB_SUFFIX = "Informative";
const DAY_MS = 24 * 60 * 60 * 1_000;

export type Clock = Readonly<{ now(): Date }>;

export type GateWaiver = Readonly<{
  gateId: string;
  workflow: string;
  jobId: string;
  reason: string;
  grantedAt: string;
  expiresAt: string;
  restoreFront: string;
  approvedBy: string;
}>;

export type GateWaiverContract = Readonly<{
  schemaVersion: "gate-waivers.v1";
  waivers: readonly GateWaiver[];
}>;

export type WorkflowJob = Readonly<{
  workflow: string;
  jobId: string;
  gateId: string;
  continueOnError: boolean;
}>;

export type GateWaiverDiagnostic = Readonly<{
  criterion: string;
  code: string;
  message: string;
  gateId: string;
  workflow: string;
  jobId: string;
  expiresAt?: string;
  daysRemaining?: number;
}>;

export type GateWaiverResult = Readonly<{
  ok: boolean;
  check: typeof CHECK;
  clockDate: string;
  contract: typeof CONTRACT_FILE;
  warnings: readonly GateWaiverDiagnostic[];
  violations: readonly GateWaiverDiagnostic[];
}>;

function stripYamlComment(line: string): string {
  let singleQuoted = false;
  let doubleQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === "'" && !doubleQuoted) {
      if (singleQuoted && line[index + 1] === "'") {
        index += 1;
      } else {
        singleQuoted = !singleQuoted;
      }
      continue;
    }
    if (character === '"' && !singleQuoted && line[index - 1] !== "\\") {
      doubleQuoted = !doubleQuoted;
      continue;
    }
    if (character === "#" && !singleQuoted && !doubleQuoted) {
      return line.slice(0, index);
    }
  }

  return line;
}

function splitMappingEntry(content: string): [string, string] | undefined {
  let singleQuoted = false;
  let doubleQuoted = false;

  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (character === "'" && !doubleQuoted) {
      singleQuoted = !singleQuoted;
      continue;
    }
    if (character === '"' && !singleQuoted && content[index - 1] !== "\\") {
      doubleQuoted = !doubleQuoted;
      continue;
    }
    if (character === ":" && !singleQuoted && !doubleQuoted) {
      return [unquote(content.slice(0, index).trim()), content.slice(index + 1).trim()];
    }
  }

  return undefined;
}

function unquote(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function yamlBoolean(value: string): boolean {
  return unquote(value).toLowerCase() === "true";
}

/**
 * Parses the workflow mapping by indentation and YAML scalar boundaries. Job-level
 * fields are kept separate from nested step fields, and comments are discarded only
 * when they occur outside quoted scalars.
 */
export function parseWorkflowJobs(workflow: string, source: string): WorkflowJob[] {
  const jobs: Array<{ workflow: string; jobId: string; name?: string; continueOnError: boolean }> = [];
  let jobsIndent: number | undefined;
  let currentJob: (typeof jobs)[number] | undefined;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = stripYamlComment(rawLine).replace(/\s+$/, "");
    if (line.trim().length === 0) continue;
    if (line.includes("\t")) throw new Error(`${workflow}: tabs are not supported in YAML indentation`);

    const indent = line.length - line.trimStart().length;
    const entry = splitMappingEntry(line.trimStart());
    if (!entry) continue;
    const [key, value] = entry;

    if (jobsIndent === undefined) {
      if (indent === 0 && key === "jobs" && value === "") jobsIndent = indent;
      continue;
    }

    if (indent <= jobsIndent) break;
    if (indent === jobsIndent + 2 && value === "") {
      currentJob = { workflow, jobId: key, continueOnError: false };
      jobs.push(currentJob);
      continue;
    }
    if (!currentJob || indent !== jobsIndent + 4) continue;
    if (key === "name") currentJob.name = unquote(value);
    if (key === "continue-on-error") currentJob.continueOnError = yamlBoolean(value);
  }

  return jobs.map((job) => ({
    workflow: job.workflow,
    jobId: job.jobId,
    gateId: job.name || job.jobId,
    continueOnError: job.continueOnError,
  }));
}

function dateOnly(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new Error("clock returned an invalid date");
  return value.toISOString().slice(0, 10);
}

function dateValue(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return dateOnly(parsed) === value ? parsed.getTime() : undefined;
}

function keyOf(value: Pick<GateWaiver, "workflow" | "jobId">): string {
  return `${value.workflow}#${value.jobId}`;
}

function diagnostic(
  value: Pick<GateWaiver, "gateId" | "workflow" | "jobId">,
  criterion: string,
  code: string,
  message: string,
  details: Pick<GateWaiverDiagnostic, "expiresAt" | "daysRemaining"> = {},
): GateWaiverDiagnostic {
  return { criterion, code, message, ...value, ...details };
}

function compareDiagnostics(left: GateWaiverDiagnostic, right: GateWaiverDiagnostic): number {
  return `${left.workflow}#${left.jobId}#${left.code}`.localeCompare(
    `${right.workflow}#${right.jobId}#${right.code}`,
  );
}

export function validateGateWaiverContract(contract: GateWaiverContract): GateWaiverDiagnostic[] {
  const violations: GateWaiverDiagnostic[] = [];
  const seen = new Set<string>();
  const requiredFields: Array<keyof GateWaiver> = [
    "gateId",
    "workflow",
    "jobId",
    "reason",
    "grantedAt",
    "expiresAt",
    "restoreFront",
    "approvedBy",
  ];

  if (contract.schemaVersion !== "gate-waivers.v1" || !Array.isArray(contract.waivers)) {
    return [diagnostic(
      { gateId: "contract", workflow: CONTRACT_FILE, jobId: "contract" },
      "contract_shape",
      "GATE_WAIVER_CONTRACT_INVALID",
      "gate waiver contract must use schemaVersion gate-waivers.v1 and contain a waivers array",
    )];
  }

  for (const waiver of contract.waivers) {
    const missing = requiredFields.filter((field) =>
      typeof waiver[field] !== "string" || String(waiver[field]).trim().length === 0,
    );
    if (missing.length > 0) {
      violations.push(diagnostic(
        waiver,
        "contract_required_fields",
        "GATE_WAIVER_CONTRACT_INVALID",
        `waiver is missing non-empty fields: ${missing.join(", ")}`,
      ));
      continue;
    }
    if (dateValue(waiver.grantedAt) === undefined || dateValue(waiver.expiresAt) === undefined) {
      violations.push(diagnostic(
        waiver,
        "contract_date_format",
        "GATE_WAIVER_CONTRACT_INVALID",
        "grantedAt and expiresAt must be valid YYYY-MM-DD dates",
      ));
    } else if ((dateValue(waiver.grantedAt) as number) > (dateValue(waiver.expiresAt) as number)) {
      violations.push(diagnostic(
        waiver,
        "contract_date_order",
        "GATE_WAIVER_CONTRACT_INVALID",
        "grantedAt must not be after expiresAt",
      ));
    }
    const key = keyOf(waiver);
    if (seen.has(key)) {
      violations.push(diagnostic(
        waiver,
        "contract_unique_job",
        "GATE_WAIVER_CONTRACT_INVALID",
        "only one waiver may exist for a workflow job",
      ));
    }
    seen.add(key);
  }

  return violations.sort(compareDiagnostics);
}

export function evaluateGateWaivers(
  contract: GateWaiverContract,
  jobs: readonly WorkflowJob[],
  clock: Clock,
): GateWaiverResult {
  const warnings: GateWaiverDiagnostic[] = [];
  const violations = validateGateWaiverContract(contract);
  const today = dateOnly(clock.now());
  const todayValue = dateValue(today) as number;
  const waivers = new Map(contract.waivers.map((waiver) => [keyOf(waiver), waiver]));
  const jobsByKey = new Map(jobs.map((job) => [keyOf(job), job]));

  for (const job of jobs) {
    const waiver = waivers.get(keyOf(job));
    if (!job.continueOnError || job.gateId.endsWith(INFORMATIONAL_JOB_SUFFIX)) continue;
    if (!waiver) {
      violations.push(diagnostic(
        job,
        "continue_on_error_requires_declared_waiver",
        "GATE_WAIVER_UNDECLARED",
        "job has continue-on-error enabled but no waiver is declared",
      ));
      continue;
    }

    const expiresAtValue = dateValue(waiver.expiresAt);
    if (expiresAtValue === undefined) continue;
    const daysRemaining = Math.round((expiresAtValue - todayValue) / DAY_MS);
    if (daysRemaining < 0) {
      violations.push(diagnostic(
        waiver,
        "declared_waiver_must_not_be_expired",
        waiver.gateId === "P3SettlementSupportByEnv"
          ? "P3_SETTLEMENT_SUPPORT_WAIVER_EXPIRED"
          : "GATE_WAIVER_EXPIRED",
        `waiver expired ${Math.abs(daysRemaining)} day(s) ago; remove continue-on-error or renew through an approved change`,
        { expiresAt: waiver.expiresAt, daysRemaining },
      ));
    } else {
      warnings.push(diagnostic(
        waiver,
        "declared_waiver_expiry_is_in_the_future",
        "GATE_WAIVER_ACTIVE",
        `continue-on-error waiver is active with ${daysRemaining} day(s) remaining`,
        { expiresAt: waiver.expiresAt, daysRemaining },
      ));
    }
  }

  for (const waiver of contract.waivers) {
    const job = jobsByKey.get(keyOf(waiver));
    if (!job || !job.continueOnError) {
      violations.push(diagnostic(
        waiver,
        "declared_waiver_requires_continue_on_error",
        "GATE_WAIVER_STALE",
        job
          ? "waiver is stale because the job no longer has continue-on-error enabled; remove the waiver"
          : "waiver is stale because the workflow job does not exist; remove the waiver",
      ));
    }
  }

  warnings.sort(compareDiagnostics);
  violations.sort(compareDiagnostics);
  return {
    ok: violations.length === 0,
    check: CHECK,
    clockDate: today,
    contract: CONTRACT_FILE,
    warnings,
    violations,
  };
}

function workflowFiles(root: string): string[] {
  const directory = path.resolve(root, WORKFLOW_DIRECTORY);
  return fs.readdirSync(directory)
    .filter((entry) => entry.endsWith(".yml") || entry.endsWith(".yaml"))
    .map((entry) => path.posix.join(WORKFLOW_DIRECTORY, entry))
    .sort();
}

function readContract(root: string): GateWaiverContract {
  return JSON.parse(fs.readFileSync(path.resolve(root, CONTRACT_FILE), "utf8")) as GateWaiverContract;
}

function systemClock(): Clock {
  const override = process.env.GATE_WAIVER_CLOCK;
  return {
    now: () => override ? new Date(`${override}T00:00:00.000Z`) : new Date(),
  };
}

export function runCheck(root = process.cwd(), clock: Clock = systemClock()): GateWaiverResult {
  const contract = readContract(root);
  const jobs = workflowFiles(root).flatMap((workflow) =>
    parseWorkflowJobs(workflow, fs.readFileSync(path.resolve(root, workflow), "utf8")),
  );
  const result = evaluateGateWaivers(contract, jobs, clock);
  const output = JSON.stringify(result, null, 2);
  if (result.ok) console.log(output);
  else {
    console.error(output);
    process.exitCode = 1;
  }
  return result;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) runCheck();
