import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CHECK = "check:structural-circularity";
export const CONTRACT_FILE = "ops/contracts/circularity-exceptions.v1.json";
export const GOVERNED_ARTIFACT_ROOTS = [
  "ops/evidence/",
  "docs/ops/evidence/",
  "artifacts/",
] as const;
export const WORKFLOWS_IN_SCOPE = [".github/workflows/ci.yml"] as const;
export const SUPPORTED_SHELL_SYNTAX = [
  "one package target per inline run command",
  "multiline run blocks",
  "newline-separated package targets",
  "package targets chained by &&",
] as const;
export const SUPPORTED_DESTINATION_TEMPLATE_PATTERNS = [
  "path.join(CONST, var) resolved through at most one intermediate const identifier assignment",
  "var bound by a for...of loop, direct or destructured, over a const array literal in the same source",
  "array element values that are template literals with a literal prefix and one or more interpolations, each interpolation treated as a single wildcard segment",
] as const;

const INFORMATIONAL_DATE_PATTERN = "YYYY-MM-DD";
const DAY_MS = 24 * 60 * 60 * 1_000;
const SCRIPT_PATH_PATTERN = /(?:^|[\s"'])(?<script>(?:scripts|apps|packages)\/[A-Za-z0-9_./:-]+\.(?:ts|js|cjs|mjs))(?=$|[\s"'])/g;
const PACKAGE_TARGET_PATTERN = /\bpnpm\s+(?:run\s+)?([A-Za-z0-9:_-]+)/g;

export type Clock = Readonly<{ now(): Date }>;

export type CircularityException = Readonly<{
  jobId: string;
  generatorTarget: string;
  checkTarget: string;
  reason: string;
  grantedAt: string;
  expiresAt: string;
  restoreFront: string;
  approvedBy: string;
}>;

export type CircularityExceptionContract = Readonly<{
  schemaVersion: "circularity-exceptions.v1";
  exceptions: readonly CircularityException[];
}>;

export type RepositoryAnalysisInput = Readonly<{
  packageScripts: Readonly<Record<string, string>>;
  workflowSources: Readonly<Record<string, string>>;
  scriptSources: Readonly<Record<string, string>>;
  contract: CircularityExceptionContract;
  clock: Clock;
}>;

export type ArtifactAccess = Readonly<{
  path: string;
  source: string;
  extraction: "literal" | "template" | "pattern";
}>;

export type UndeterminedPath = Readonly<{
  target: string;
  source: string;
  operation: "read" | "write" | "target-expansion";
  expression: string;
  reason: string;
}>;

export type StructuralPair = Readonly<{
  workflow: string;
  jobId: string;
  jobName: string;
  generatorTarget: string;
  checkTarget: string;
  generatorOrder: number;
  checkOrder: number;
  artifacts: readonly string[];
  state: "excepted" | "undeclared" | "expired";
}>;

export type ExceptedPair = Readonly<{
  workflow: string;
  jobId: string;
  generatorTarget: string;
  checkTarget: string;
  artifacts: readonly string[];
  code: "STRUCTURAL_CIRCULARITY_EXCEPTION_ACTIVE";
  grantedAt: string;
  expiresAt: string;
  daysRemaining: number;
  restoreFront: string;
  approvedBy: string;
  reason: string;
}>;

export type StructuralCircularityDiagnostic = Readonly<{
  criterion: string;
  code: string;
  message: string;
  workflow?: string;
  jobId?: string;
  generatorTarget?: string;
  checkTarget?: string;
  expiresAt?: string;
}>;

export type StructuralCircularityResult = Readonly<{
  ok: boolean;
  check: typeof CHECK;
  clockDate: string;
  contract: typeof CONTRACT_FILE;
  scope: Readonly<{
    artifactRoots: typeof GOVERNED_ARTIFACT_ROOTS;
    workflows: typeof WORKFLOWS_IN_SCOPE;
    supportedShellSyntax: typeof SUPPORTED_SHELL_SYNTAX;
    supportedDestinationTemplatePatterns: typeof SUPPORTED_DESTINATION_TEMPLATE_PATTERNS;
  }>;
  pairsDetected: readonly StructuralPair[];
  pairsExcepted: readonly ExceptedPair[];
  undetermined: readonly UndeterminedPath[];
  violations: readonly StructuralCircularityDiagnostic[];
}>;

type WorkflowTarget = Readonly<{ target: string; order: number }>;
type WorkflowJob = Readonly<{
  workflow: string;
  jobId: string;
  jobName: string;
  targets: readonly WorkflowTarget[];
}>;
type TargetAnalysis = Readonly<{
  writes: readonly ArtifactAccess[];
  reads: readonly ArtifactAccess[];
  undetermined: readonly UndeterminedPath[];
}>;

function dateOnly(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new Error("clock returned an invalid date");
  return value.toISOString().slice(0, 10);
}

function dateValue(value: string): number | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return dateOnly(parsed) === value ? parsed.getTime() : undefined;
}

function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function governed(value: string): boolean {
  const normalized = normalizeSlashes(value);
  return GOVERNED_ARTIFACT_ROOTS.some((root) => normalized.startsWith(root));
}

function splitTopLevel(value: string, separator = ","): string[] {
  const entries: string[] = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === separator && depth === 0) {
      entries.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  entries.push(value.slice(start).trim());
  return entries.filter(Boolean);
}

function callArguments(source: string, names: readonly string[]): Array<{ name: string; args: string[]; raw: string }> {
  const calls: Array<{ name: string; args: string[]; raw: string }> = [];
  const pattern = new RegExp(`\\b(${names.join("|")})\\s*\\(`, "g");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    const open = source.indexOf("(", match.index);
    let depth = 1;
    let quote = "";
    let escaped = false;
    let index = open + 1;
    for (; index < source.length && depth > 0; index += 1) {
      const character = source[index];
      if (quote) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === quote) quote = "";
        continue;
      }
      if (character === '"' || character === "'" || character === "`") {
        quote = character;
        continue;
      }
      if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
    }
    if (depth !== 0) continue;
    const raw = source.slice(open + 1, index - 1);
    calls.push({ name: match[1], args: splitTopLevel(raw), raw });
    pattern.lastIndex = index;
  }
  return calls;
}

function scalarValue(expression: string): string | undefined {
  const value = expression.trim();
  if (value.length < 2) return undefined;
  const quote = value[0];
  if ((quote === '"' || quote === "'" || quote === "`") && value[value.length - 1] === quote) {
    return value.slice(1, -1);
  }
  if (value.startsWith("/") && value.lastIndexOf("/") > 0) {
    return value.slice(1, value.lastIndexOf("/"));
  }
  return undefined;
}

function resolvePathExpression(expression: string, constants: ReadonlyMap<string, string>): string | undefined {
  const value = expression.trim();
  const scalar = scalarValue(value);
  if (scalar !== undefined) return scalar;
  if (/^[A-Za-z_$][\w$]*$/.test(value)) return constants.get(value);

  const pathCall = value.match(/^path\.(?:resolve|join)\(([\s\S]*)\)$/);
  if (!pathCall) return undefined;
  const parts = splitTopLevel(pathCall[1]).map((part) => {
    if (part === "process.cwd()") return "";
    return resolvePathExpression(part, constants);
  });
  const firstGoverned = parts.findIndex((part) => part !== undefined && governed(part));
  if (firstGoverned >= 0 && parts.slice(firstGoverned).every((part) => part !== undefined)) {
    return path.posix.join(...parts.slice(firstGoverned).map((part) => part as string));
  }
  if (parts.length > 0 && parts.every((part) => part !== undefined)) {
    return path.posix.join(...parts.map((part) => part as string));
  }
  return undefined;
}

function pathConstants(source: string): Map<string, string> {
  const constants = new Map<string, string>();
  const assignments = [...source.matchAll(/\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+);/g)];
  for (let pass = 0; pass < assignments.length + 1; pass += 1) {
    let changed = false;
    for (const assignment of assignments) {
      if (constants.has(assignment[1])) continue;
      const resolved = resolvePathExpression(assignment[2], constants);
      if (resolved === undefined) continue;
      constants.set(assignment[1], normalizeSlashes(resolved));
      changed = true;
    }
    if (!changed) break;
  }
  return constants;
}

function canonicalArtifact(value: string, root?: string): ArtifactAccess | undefined {
  let normalized = value.trim();
  const wasPattern = normalized.includes("*") || normalized.includes("\\d") || normalized.startsWith("^");
  const wasTemplate = normalized.includes("${");
  normalized = normalized.replace(/^\^/, "").replace(/\$$/, "");
  normalized = normalized
    .replace(/\\d\{4\}-\\d\{2\}-\\d\{2\}/g, INFORMATIONAL_DATE_PATTERN)
    .replace(/\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}/g, INFORMATIONAL_DATE_PATTERN)
    .replace(/\\\./g, ".")
    .replace(/\\\//g, "/")
    .replace(/\$\{(?:TODAY|today|timestamp|date|DATE)\}/g, INFORMATIONAL_DATE_PATTERN)
    .replace(/\$\{[^}]+\}/g, "*")
    .replace(/\*/g, INFORMATIONAL_DATE_PATTERN);
  normalized = normalizeSlashes(normalized);
  if (!governed(normalized) && root) normalized = path.posix.join(normalizeSlashes(root), normalized);
  if (!governed(normalized)) return undefined;
  if (!/\.(?:json|md|log|txt|xml|csv|html)$/.test(normalized)) return undefined;
  return {
    path: normalized,
    source: value,
    extraction: wasPattern ? "pattern" : wasTemplate ? "template" : "literal",
  };
}

// Scope documented in SUPPORTED_DESTINATION_TEMPLATE_PATTERNS: this resolver
// closes the gap found in generateP3EconomyEvidence.ts, where path.join(CONST,
// var) is reached through one intermediate const identifier and var is bound
// by a for...of loop over a const array literal. It is a targeted pattern
// match, not a general dataflow analyzer — anything else (spread, computed
// index, reassignment, external/env data) is left undetermined.
type ForOfArrayLiteralBinding = Readonly<{ arrayBody: string; destructured: boolean }>;

function identifierAssignment(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`\\bconst\\s+${name}\\s*=\\s*([^;\\n]+);`));
  return match?.[1]?.trim();
}

function forOfArrayLiteralBinding(source: string, loopVar: string): ForOfArrayLiteralBinding | undefined {
  let arrayName: string | undefined;
  let destructured = false;

  const destructuredPattern = /for\s*\(\s*const\s*\{([^}]*)\}\s*of\s+([A-Za-z_$][\w$]*)\s*\)/g;
  let destructuredMatch: RegExpExecArray | null;
  while ((destructuredMatch = destructuredPattern.exec(source)) !== null) {
    const props = destructuredMatch[1].split(",").map((entry) => entry.trim().split(":")[0].trim());
    if (props.includes(loopVar)) {
      arrayName = destructuredMatch[2];
      destructured = true;
      break;
    }
  }

  if (!arrayName) {
    const directMatch = source.match(new RegExp(`for\\s*\\(\\s*const\\s+${loopVar}\\s+of\\s+([A-Za-z_$][\\w$]*)\\s*\\)`));
    if (directMatch) arrayName = directMatch[1];
  }

  if (!arrayName) return undefined;

  const declaration = source.match(new RegExp(`\\bconst\\s+${arrayName}\\s*=\\s*\\[`));
  if (!declaration || declaration.index === undefined) return undefined;

  const openIndex = declaration.index + declaration[0].length - 1;
  let depth = 0;
  let quote = "";
  let escaped = false;
  let index = openIndex;
  for (; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === "[") depth += 1;
    else if (character === "]") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  if (depth !== 0) return undefined;

  return { arrayBody: source.slice(openIndex + 1, index), destructured };
}

function quotedPropertyValues(source: string, property: string): string[] {
  const pattern = new RegExp(`\\b${property}\\s*:\\s*([\\x60"'])((?:\\\\.|(?!\\1)[\\s\\S])*)\\1`, "g");
  return [...source.matchAll(pattern)].map((match) => match[2]);
}

function arrayLiteralElementValues(arrayBody: string): string[] {
  return splitTopLevel(arrayBody)
    .map((element) => scalarValue(element))
    .filter((value): value is string => value !== undefined);
}

function forOfArrayLiteralCandidates(source: string, loopVar: string): string[] {
  const binding = forOfArrayLiteralBinding(source, loopVar);
  if (!binding) return [];
  return binding.destructured
    ? quotedPropertyValues(binding.arrayBody, loopVar)
    : arrayLiteralElementValues(binding.arrayBody);
}

function functionParameter(source: string, name: string): string | undefined {
  const match = source.match(new RegExp(`function\\s+${name}\\s*\\(\\s*([A-Za-z_$][\\w$]*)`));
  return match?.[1];
}

function defaultArtifactRoot(constants: ReadonlyMap<string, string>): string | undefined {
  return [...constants.values()].find((value) => governed(value) && !/\.[A-Za-z0-9]+$/.test(value));
}

function uniqueAccesses(values: readonly ArtifactAccess[]): ArtifactAccess[] {
  return [...new Map(values.map((value) => [value.path, value])).values()]
    .sort((left, right) => left.path.localeCompare(right.path));
}

function extractWrites(target: string, scriptPath: string, source: string): {
  accesses: ArtifactAccess[];
  undetermined: UndeterminedPath[];
} {
  const constants = pathConstants(source);
  const root = defaultArtifactRoot(constants);
  const accesses: ArtifactAccess[] = [];
  const undetermined: UndeterminedPath[] = [];
  const writeCalls = callArguments(source, ["writeFileSync", "appendFileSync"]);

  for (const call of writeCalls) {
    const expression = call.args[0] ?? "";
    const resolved = resolvePathExpression(expression, constants);
    const access = resolved === undefined ? undefined : canonicalArtifact(resolved);
    if (access) {
      accesses.push(access);
      continue;
    }

    const joinExpression = /^[A-Za-z_$][\w$]*$/.test(expression)
      ? identifierAssignment(source, expression) ?? expression
      : expression;
    const joinedVariable = joinExpression.match(/^path\.(?:join|resolve)\(\s*([A-Za-z_$][\w$]*)\s*,\s*([A-Za-z_$][\w$]*)\s*\)$/);
    if (joinedVariable) {
      const joinedRoot = constants.get(joinedVariable[1]);
      const candidates = forOfArrayLiteralCandidates(source, joinedVariable[2]);
      if (joinedRoot && candidates.length > 0) {
        for (const candidate of candidates) {
          const candidateAccess = canonicalArtifact(candidate, joinedRoot);
          if (candidateAccess) accesses.push(candidateAccess);
        }
        continue;
      }
    }

    const enclosingWrapper = [...source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)/g)]
      .find((match) => expression.includes(match[2]));
    if (enclosingWrapper && root) {
      const wrapperCalls = callArguments(source, [enclosingWrapper[1]])
        .filter((wrapperCall) => scalarValue(wrapperCall.args[0] ?? "") !== undefined);
      if (wrapperCalls.length > 0) {
        for (const wrapperCall of wrapperCalls) {
          const candidate = scalarValue(wrapperCall.args[0] ?? "");
          if (!candidate) continue;
          const candidateAccess = canonicalArtifact(candidate, root);
          if (candidateAccess) accesses.push(candidateAccess);
        }
        continue;
      }
    }

    if (root || GOVERNED_ARTIFACT_ROOTS.some((artifactRoot) => call.raw.includes(artifactRoot))) {
      undetermined.push({
        target,
        source: scriptPath,
        operation: "write",
        expression,
        reason: "write destination under a governed root is dynamic",
      });
    }
  }

  const wrappers = [...source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(\s*([A-Za-z_$][\w$]*)/g)];
  for (const wrapper of wrappers) {
    if (!root || !source.includes(`path.join(${[...constants.entries()].find(([, value]) => value === root)?.[0] ?? ""}, ${wrapper[2]})`)) continue;
    for (const call of callArguments(source, [wrapper[1]])) {
      const candidate = scalarValue(call.args[0] ?? "");
      if (!candidate) continue;
      const access = canonicalArtifact(candidate, root);
      if (access) accesses.push(access);
    }
  }

  return { accesses: uniqueAccesses(accesses), undetermined };
}

function extractReads(target: string, scriptPath: string, source: string): {
  accesses: ArtifactAccess[];
  undetermined: UndeterminedPath[];
} {
  const constants = pathConstants(source);
  const root = defaultArtifactRoot(constants);
  const accesses: ArtifactAccess[] = [];
  const undetermined: UndeterminedPath[] = [];
  const readNames = [
    "readFileSync",
    "readFile",
    "readJson",
    "findLatestEvidenceFile",
    "findLatestEvidenceByPattern",
    "findLatestEvidence",
  ];

  for (const call of callArguments(source, readNames)) {
    const expression = call.args[0] ?? "";
    const scalar = scalarValue(expression);
    const resolved = resolvePathExpression(expression, constants);
    const finder = call.name.startsWith("findLatestEvidence");
    const access = scalar !== undefined
      ? canonicalArtifact(scalar, finder ? root : undefined)
      : resolved !== undefined
        ? canonicalArtifact(resolved)
        : undefined;
    if (access) accesses.push(access);
    else if (finder && root && !functionParameter(source, call.name)?.includes(expression)) {
      undetermined.push({
        target,
        source: scriptPath,
        operation: "read",
        expression,
        reason: "evidence finder receives a dynamic path or pattern",
      });
    }
  }

  if (root) {
    for (const match of source.matchAll(/\/(\^[^/\n]+\\\.(?:json|md|log|txt)\$?)\/[gimsuy]*/g)) {
      const access = canonicalArtifact(match[1], root);
      if (access) accesses.push(access);
    }
  }

  return { accesses: uniqueAccesses(accesses), undetermined };
}

function packageTargets(command: string, packageScripts: Readonly<Record<string, string>>): string[] {
  const targets: string[] = [];
  for (const match of command.matchAll(PACKAGE_TARGET_PATTERN)) {
    if (Object.hasOwn(packageScripts, match[1])) targets.push(match[1]);
  }
  return targets;
}

function localScriptPaths(command: string): string[] {
  return [...command.matchAll(SCRIPT_PATH_PATTERN)]
    .map((match) => normalizeSlashes(match.groups?.script ?? ""))
    .filter(Boolean);
}

function analyzeTarget(
  target: string,
  input: RepositoryAnalysisInput,
  memo: Map<string, TargetAnalysis>,
  stack: readonly string[] = [],
): TargetAnalysis {
  const cached = memo.get(target);
  if (cached) return cached;
  if (stack.includes(target)) {
    return {
      writes: [],
      reads: [],
      undetermined: [{
        target,
        source: "package.json",
        operation: "target-expansion",
        expression: [...stack, target].join(" -> "),
        reason: "cycle detected while recursively expanding package targets",
      }],
    };
  }

  const command = input.packageScripts[target] ?? "";
  const writes: ArtifactAccess[] = [];
  const reads: ArtifactAccess[] = [];
  const undetermined: UndeterminedPath[] = [];
  for (const scriptPath of localScriptPaths(command)) {
    const source = input.scriptSources[scriptPath];
    if (source === undefined) continue;
    const writeResult = extractWrites(target, scriptPath, source);
    const readResult = extractReads(target, scriptPath, source);
    writes.push(...writeResult.accesses);
    reads.push(...readResult.accesses);
    undetermined.push(...writeResult.undetermined, ...readResult.undetermined);
  }

  for (const outMatch of command.matchAll(/(?:--out(?:put)?(?:=|\s+))([^\s;&|]+)/g)) {
    const access = canonicalArtifact(outMatch[1].replace(/["']/g, ""));
    if (access) writes.push(access);
  }

  for (const invokedTarget of packageTargets(command, input.packageScripts)) {
    if (invokedTarget === target && !stack.includes(target)) continue;
    const nested = analyzeTarget(invokedTarget, input, memo, [...stack, target]);
    writes.push(...nested.writes);
    reads.push(...nested.reads);
    undetermined.push(...nested.undetermined);
  }

  const result = {
    writes: uniqueAccesses(writes),
    reads: uniqueAccesses(reads),
    undetermined,
  };
  memo.set(target, result);
  return result;
}

function yamlScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'")))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseWorkflowTargets(
  workflow: string,
  source: string,
  packageScripts: Readonly<Record<string, string>>,
): WorkflowJob[] {
  const lines = source.split(/\r?\n/);
  const jobs: Array<{ workflow: string; jobId: string; jobName: string; commands: string[] }> = [];
  let current: (typeof jobs)[number] | undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const indent = raw.length - raw.trimStart().length;
    const jobMatch = raw.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (jobMatch) {
      current = { workflow, jobId: jobMatch[1], jobName: jobMatch[1], commands: [] };
      jobs.push(current);
      continue;
    }
    if (!current) continue;
    if (indent === 4 && raw.trimStart().startsWith("name:")) {
      current.jobName = yamlScalar(raw.trimStart().slice("name:".length));
      continue;
    }
    if (indent !== 8 || !raw.trimStart().startsWith("run:")) continue;
    const runValue = raw.trimStart().slice("run:".length).trim();
    if (runValue === "|" || runValue === ">" || runValue === "|-" || runValue === ">-") {
      const commandLines: string[] = [];
      for (index += 1; index < lines.length; index += 1) {
        const nested = lines[index];
        const nestedIndent = nested.length - nested.trimStart().length;
        if (nested.trim().length > 0 && nestedIndent <= 8) {
          index -= 1;
          break;
        }
        commandLines.push(nested.trim());
      }
      current.commands.push(commandLines.join("\n"));
    } else {
      current.commands.push(runValue);
    }
  }

  return jobs.map((job) => {
    const targets: WorkflowTarget[] = [];
    for (const command of job.commands) {
      for (const target of packageTargets(command, packageScripts)) {
        targets.push({ target, order: targets.length });
      }
    }
    return { workflow: job.workflow, jobId: job.jobId, jobName: job.jobName, targets };
  });
}

function pairKey(value: Pick<StructuralPair | CircularityException, "jobId" | "generatorTarget" | "checkTarget">): string {
  return `${value.jobId}#${value.generatorTarget}#${value.checkTarget}`;
}

function pairOrder(left: Pick<StructuralPair, "workflow" | "jobId" | "generatorTarget" | "checkTarget">, right: Pick<StructuralPair, "workflow" | "jobId" | "generatorTarget" | "checkTarget">): number {
  return `${left.workflow}#${left.jobId}#${left.generatorTarget}#${left.checkTarget}`.localeCompare(
    `${right.workflow}#${right.jobId}#${right.generatorTarget}#${right.checkTarget}`,
  );
}

function validateContract(contract: CircularityExceptionContract): StructuralCircularityDiagnostic[] {
  const violations: StructuralCircularityDiagnostic[] = [];
  if (contract.schemaVersion !== "circularity-exceptions.v1" || !Array.isArray(contract.exceptions)) {
    return [{
      criterion: "contract_shape",
      code: "STRUCTURAL_CIRCULARITY_CONTRACT_INVALID",
      message: "contract must use schemaVersion circularity-exceptions.v1 and contain an exceptions array",
    }];
  }
  const required: Array<keyof CircularityException> = [
    "jobId",
    "generatorTarget",
    "checkTarget",
    "reason",
    "grantedAt",
    "expiresAt",
    "restoreFront",
    "approvedBy",
  ];
  const seen = new Set<string>();
  for (const exception of contract.exceptions) {
    const missing = required.filter((field) => typeof exception[field] !== "string" || exception[field].trim().length === 0);
    if (missing.length > 0) {
      violations.push({
        criterion: "contract_required_fields",
        code: "STRUCTURAL_CIRCULARITY_CONTRACT_INVALID",
        message: `exception is missing non-empty fields: ${missing.join(", ")}`,
        jobId: exception.jobId,
        generatorTarget: exception.generatorTarget,
        checkTarget: exception.checkTarget,
      });
      continue;
    }
    const grantedAt = dateValue(exception.grantedAt);
    const expiresAt = dateValue(exception.expiresAt);
    if (grantedAt === undefined || expiresAt === undefined || grantedAt > expiresAt) {
      violations.push({
        criterion: "contract_dates",
        code: "STRUCTURAL_CIRCULARITY_CONTRACT_INVALID",
        message: "grantedAt and expiresAt must be valid YYYY-MM-DD dates in chronological order",
        jobId: exception.jobId,
        generatorTarget: exception.generatorTarget,
        checkTarget: exception.checkTarget,
      });
    }
    const key = pairKey(exception);
    if (seen.has(key)) {
      violations.push({
        criterion: "contract_unique_pair",
        code: "STRUCTURAL_CIRCULARITY_CONTRACT_INVALID",
        message: "only one exception may exist for a structural pair",
        jobId: exception.jobId,
        generatorTarget: exception.generatorTarget,
        checkTarget: exception.checkTarget,
      });
    }
    seen.add(key);
  }
  return violations;
}

function detectPairs(jobs: readonly WorkflowJob[], input: RepositoryAnalysisInput, memo: Map<string, TargetAnalysis>): Omit<StructuralPair, "state">[] {
  const pairs: Array<Omit<StructuralPair, "state">> = [];
  for (const job of jobs) {
    for (let generatorIndex = 0; generatorIndex < job.targets.length; generatorIndex += 1) {
      const generator = job.targets[generatorIndex];
      const generatorAnalysis = analyzeTarget(generator.target, input, memo);
      if (generatorAnalysis.writes.length === 0) continue;
      for (let checkIndex = generatorIndex + 1; checkIndex < job.targets.length; checkIndex += 1) {
        const check = job.targets[checkIndex];
        const checkAnalysis = analyzeTarget(check.target, input, memo);
        const readPaths = new Set(checkAnalysis.reads.map((access) => access.path));
        const artifacts = generatorAnalysis.writes
          .map((access) => access.path)
          .filter((artifact) => readPaths.has(artifact))
          .sort();
        if (artifacts.length === 0) continue;
        pairs.push({
          workflow: job.workflow,
          jobId: job.jobId,
          jobName: job.jobName,
          generatorTarget: generator.target,
          checkTarget: check.target,
          generatorOrder: generator.order,
          checkOrder: check.order,
          artifacts,
        });
      }
    }
  }
  return pairs.sort(pairOrder);
}

export function analyzeStructuralCircularity(input: RepositoryAnalysisInput): StructuralCircularityResult {
  const today = dateOnly(input.clock.now());
  const todayValue = dateValue(today) as number;
  const memo = new Map<string, TargetAnalysis>();
  const jobs = Object.entries(input.workflowSources).flatMap(([workflow, source]) =>
    parseWorkflowTargets(workflow, source, input.packageScripts),
  );
  const rawPairs = detectPairs(jobs, input, memo);
  const exceptions = new Map(input.contract.exceptions.map((exception) => [pairKey(exception), exception]));
  const violations = validateContract(input.contract);
  const pairsDetected: StructuralPair[] = [];
  const pairsExcepted: ExceptedPair[] = [];

  for (const pair of rawPairs) {
    const exception = exceptions.get(pairKey(pair));
    const expiresAtValue = exception ? dateValue(exception.expiresAt) : undefined;
    if (!exception) {
      pairsDetected.push({ ...pair, state: "undeclared" });
      violations.push({
        criterion: "structural_pair_requires_exception",
        code: "STRUCTURAL_CIRCULARITY_UNDECLARED",
        message: "structural circularity pair has no declared exception",
        workflow: pair.workflow,
        jobId: pair.jobId,
        generatorTarget: pair.generatorTarget,
        checkTarget: pair.checkTarget,
      });
    } else if (expiresAtValue === undefined || expiresAtValue < todayValue) {
      pairsDetected.push({ ...pair, state: "expired" });
      violations.push({
        criterion: "declared_exception_must_not_be_expired",
        code: "STRUCTURAL_CIRCULARITY_EXCEPTION_EXPIRED",
        message: "structural circularity exception is expired",
        workflow: pair.workflow,
        jobId: pair.jobId,
        generatorTarget: pair.generatorTarget,
        checkTarget: pair.checkTarget,
        expiresAt: exception.expiresAt,
      });
    } else {
      const daysRemaining = Math.round((expiresAtValue - todayValue) / DAY_MS);
      pairsDetected.push({ ...pair, state: "excepted" });
      pairsExcepted.push({
        workflow: pair.workflow,
        jobId: pair.jobId,
        generatorTarget: pair.generatorTarget,
        checkTarget: pair.checkTarget,
        artifacts: pair.artifacts,
        code: "STRUCTURAL_CIRCULARITY_EXCEPTION_ACTIVE",
        grantedAt: exception.grantedAt,
        expiresAt: exception.expiresAt,
        daysRemaining,
        restoreFront: exception.restoreFront,
        approvedBy: exception.approvedBy,
        reason: exception.reason,
      });
    }
  }

  const detectedKeys = new Set(rawPairs.map(pairKey));
  for (const exception of input.contract.exceptions) {
    if (detectedKeys.has(pairKey(exception))) continue;
    violations.push({
      criterion: "declared_exception_requires_structural_pair",
      code: "STRUCTURAL_CIRCULARITY_EXCEPTION_STALE",
      message: "exception is stale because its structural pair does not exist",
      jobId: exception.jobId,
      generatorTarget: exception.generatorTarget,
      checkTarget: exception.checkTarget,
    });
  }

  const targetsInScope = new Set(jobs.flatMap((job) => job.targets.map(({ target }) => target)));
  const undetermined = [...targetsInScope]
    .flatMap((target) => analyzeTarget(target, input, memo).undetermined)
    .filter((value, index, values) => values.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(value)) === index)
    .sort((left, right) => `${left.target}#${left.source}#${left.expression}`.localeCompare(`${right.target}#${right.source}#${right.expression}`));
  for (const value of undetermined) {
    violations.push({
      criterion: "governed_path_must_be_determinable",
      code: "STRUCTURAL_CIRCULARITY_UNDETERMINED",
      message: `${value.operation} path is undetermined: ${value.expression}`,
    });
  }

  return {
    ok: violations.length === 0,
    check: CHECK,
    clockDate: today,
    contract: CONTRACT_FILE,
    scope: {
      artifactRoots: GOVERNED_ARTIFACT_ROOTS,
      workflows: WORKFLOWS_IN_SCOPE,
      supportedShellSyntax: SUPPORTED_SHELL_SYNTAX,
      supportedDestinationTemplatePatterns: SUPPORTED_DESTINATION_TEMPLATE_PATTERNS,
    },
    pairsDetected,
    pairsExcepted: pairsExcepted.sort(pairOrder),
    undetermined,
    violations: violations.sort((left, right) => `${left.code}#${left.jobId ?? ""}`.localeCompare(`${right.code}#${right.jobId ?? ""}`)),
  };
}

function systemClock(): Clock {
  const override = process.env.STRUCTURAL_CIRCULARITY_CLOCK;
  return { now: () => override ? new Date(`${override}T00:00:00.000Z`) : new Date() };
}

function repositoryInput(root: string, clock: Clock): RepositoryAnalysisInput {
  const packageFile = path.resolve(root, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageFile, "utf8")) as { scripts?: Record<string, string> };
  const packageScripts = packageJson.scripts ?? {};
  const workflowSources = Object.fromEntries(WORKFLOWS_IN_SCOPE.map((workflow) => [
    workflow,
    fs.readFileSync(path.resolve(root, workflow), "utf8"),
  ]));
  const scriptPaths = new Set(Object.values(packageScripts).flatMap(localScriptPaths));
  const scriptSources = Object.fromEntries([...scriptPaths]
    .filter((scriptPath) => fs.existsSync(path.resolve(root, scriptPath)))
    .map((scriptPath) => [scriptPath, fs.readFileSync(path.resolve(root, scriptPath), "utf8")]));
  const contract = JSON.parse(fs.readFileSync(path.resolve(root, CONTRACT_FILE), "utf8")) as CircularityExceptionContract;
  return { packageScripts, workflowSources, scriptSources, contract, clock };
}

export function runCheck(root = process.cwd(), clock: Clock = systemClock()): StructuralCircularityResult {
  const result = analyzeStructuralCircularity(repositoryInput(root, clock));
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
