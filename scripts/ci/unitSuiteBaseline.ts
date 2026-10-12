// Parser e validador puro do baseline versionado da suíte unitária (unit-tests-baseline.v1).
//
// Recebe o texto JSON e os arquivos esperados (os do inventário). Não lê disco, não cria processos,
// não usa rede, ambiente nem relógio, e não lança: qualquer problema vira issue e `ok` só é `true`
// quando não há nenhuma issue.
//
// Formato (todas as chaves obrigatórias; nenhuma outra é aceita):
//   {
//     "schemaVersion": "unit-tests-baseline.v1",
//     "provenance": { "status": "declared", "recordedAt": "YYYY-MM-DD", "recordedCommit": "<40 hex>",
//                     "method": "<texto>", "nodeVersion": "vX.Y.Z" },
//     "files": [ { "file": "<caminho canônico>", "tests": n>=1, "skipped": n, "todo": n,
//                  "sha256": "<64 hex minúsculos>" }, ... ]   // ordenado por caminho, sem repetição
//   }
//
// O que este módulo garante e o que NÃO garante:
//   - Validade estrutural: sim (tipos estritos, chaves exatas, chaves duplicadas rejeitadas).
//   - Correspondência com o inventário: sim (mesmo conjunto de arquivos, ausentes e adicionais).
//   - Integridade criptográfica: NÃO. `sha256` é validado só como representação; compará-lo com os
//     bytes reais do arquivo de teste (e registrar o SHA-256 do próprio baseline) é papel do lançador.
//   - Origem das contagens: NÃO. `provenance` é uma declaração (`status: "declared"`), não uma prova;
//     nada aqui indica que as contagens vieram de uma execução completa.
// Contagens esperadas nunca são derivadas de resultados de execução por este módulo.

import { parseUnitSuiteManifest } from "./unitSuiteInventory";
import type { ExpectedFileBaseline } from "./unitSuiteVerdict";

export const UNIT_SUITE_BASELINE_SCHEMA_VERSION = "unit-tests-baseline.v1";

export const UNIT_SUITE_BASELINE_ISSUE_CODES = [
  "UNIT_SUITE_BASELINE_INTERNAL_ERROR",
  "UNIT_SUITE_BASELINE_OPTIONS_INVALID",
  "UNIT_SUITE_BASELINE_TEXT_INVALID",
  "UNIT_SUITE_BASELINE_JSON_INVALID",
  "UNIT_SUITE_BASELINE_DUPLICATE_KEY",
  "UNIT_SUITE_BASELINE_SCHEMA_VERSION_INVALID",
  "UNIT_SUITE_BASELINE_KEY_MISSING",
  "UNIT_SUITE_BASELINE_KEY_UNEXPECTED",
  "UNIT_SUITE_BASELINE_TYPE_INVALID",
  "UNIT_SUITE_BASELINE_PROVENANCE_STATUS_INVALID",
  "UNIT_SUITE_BASELINE_FORMAT_INVALID",
  "UNIT_SUITE_BASELINE_FILES_EMPTY",
  "UNIT_SUITE_BASELINE_FILE_PATH_INVALID",
  "UNIT_SUITE_BASELINE_FILE_DUPLICATE",
  "UNIT_SUITE_BASELINE_FILES_NOT_SORTED",
  "UNIT_SUITE_BASELINE_COUNT_INVALID",
  "UNIT_SUITE_BASELINE_TESTS_BELOW_ONE",
  "UNIT_SUITE_BASELINE_SKIP_TODO_EXCEEDS_TESTS",
  "UNIT_SUITE_BASELINE_SHA256_INVALID",
  "UNIT_SUITE_BASELINE_FILE_MISSING_FROM_BASELINE",
  "UNIT_SUITE_BASELINE_FILE_NOT_IN_INVENTORY",
] as const;

export type BaselineIssueCode = (typeof UNIT_SUITE_BASELINE_ISSUE_CODES)[number];

export type BaselineIssue = Readonly<{
  code: BaselineIssueCode;
  /** Caminho no documento, p. ex. "$.files[3].tests". "$" para a raiz ou para o texto inteiro. */
  path: string;
  detail?: string;
}>;

export type BaselineProvenance = Readonly<{
  status: "declared";
  recordedAt: string;
  recordedCommit: string;
  method: string;
  nodeVersion: string;
}>;

export type BaselineDigest = Readonly<{ file: string; sha256: string }>;

export type BaselineParseOptions = Readonly<{
  /** Arquivos do inventário (caminhos canônicos, sem repetição). O baseline deve cobrir exatamente este conjunto. */
  expectedFiles: readonly string[];
}>;

export type BaselineParseResult =
  | Readonly<{
      ok: true;
      version: typeof UNIT_SUITE_BASELINE_SCHEMA_VERSION;
      provenance: BaselineProvenance;
      /** Compatível com `evaluateUnitSuite({ expected })`, em ordem determinística. */
      files: readonly ExpectedFileBaseline[];
      /** Digests declarados por arquivo, ainda não verificados contra os bytes dos testes. */
      digests: readonly BaselineDigest[];
    }>
  | Readonly<{
      ok: false;
      version: typeof UNIT_SUITE_BASELINE_SCHEMA_VERSION;
      issues: readonly BaselineIssue[];
    }>;

// ---------------------------------------------------------------------------------------------
// Leitor JSON estrito (sem JSON.parse: JSON.parse mantém a última de duas chaves iguais, o que
// tornaria o baseline ambíguo). Mantém o texto bruto dos números para rejeitar "12.0", "1e2", "-0".
// ---------------------------------------------------------------------------------------------

type JsonNode =
  | { kind: "object"; entries: ReadonlyArray<{ key: string; node: JsonNode }> }
  | { kind: "array"; items: readonly JsonNode[] }
  | { kind: "string"; value: string }
  | { kind: "number"; raw: string }
  | { kind: "literal"; value: boolean | null };

type ParseOutcome = { ok: true; node: JsonNode } | { ok: false; position: number; reason: string };

const MAX_DEPTH = 16;
const NUMBER_GRAMMAR = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/;

class JsonFailure extends Error {
  constructor(readonly position: number, readonly reason: string) {
    super(reason);
  }
}

function readJson(text: string, duplicateKeys: BaselineIssue[]): ParseOutcome {
  let index = 0;

  const fail = (reason: string): never => {
    throw new JsonFailure(index, reason);
  };
  const skipWhitespace = () => {
    while (index < text.length && (text[index] === " " || text[index] === "\n" || text[index] === "\r" || text[index] === "\t")) index += 1;
  };
  const expect = (char: string) => {
    if (text[index] !== char) fail(`expected '${char}'`);
    index += 1;
  };

  const readString = (): string => {
    expect('"');
    let out = "";
    for (;;) {
      if (index >= text.length) fail("unterminated string");
      const char = text[index];
      if (char === '"') {
        index += 1;
        return out;
      }
      if (char < " ") fail("control character in string");
      if (char !== "\\") {
        out += char;
        index += 1;
        continue;
      }
      index += 1;
      const escape = text[index];
      const simple: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (escape !== undefined && Object.prototype.hasOwnProperty.call(simple, escape)) {
        out += simple[escape];
        index += 1;
      } else if (escape === "u") {
        const hex = text.slice(index + 1, index + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("invalid unicode escape");
        out += String.fromCharCode(parseInt(hex, 16));
        index += 5;
      } else {
        fail("invalid escape");
      }
    }
  };

  const readValue = (path: string, depth: number): JsonNode => {
    if (depth > MAX_DEPTH) fail("nesting too deep");
    skipWhitespace();
    const char = text[index];
    if (char === "{") {
      index += 1;
      const entries: Array<{ key: string; node: JsonNode }> = [];
      const seen = new Set<string>();
      skipWhitespace();
      if (text[index] === "}") {
        index += 1;
        return { kind: "object", entries };
      }
      for (;;) {
        skipWhitespace();
        const key = readString();
        skipWhitespace();
        expect(":");
        if (seen.has(key)) duplicateKeys.push({ code: "UNIT_SUITE_BASELINE_DUPLICATE_KEY", path, detail: `key "${key}" repeated` });
        seen.add(key);
        entries.push({ key, node: readValue(`${path}.${key}`, depth + 1) });
        skipWhitespace();
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        expect("}");
        return { kind: "object", entries };
      }
    }
    if (char === "[") {
      index += 1;
      const items: JsonNode[] = [];
      skipWhitespace();
      if (text[index] === "]") {
        index += 1;
        return { kind: "array", items };
      }
      for (;;) {
        items.push(readValue(`${path}[${items.length}]`, depth + 1));
        skipWhitespace();
        if (text[index] === ",") {
          index += 1;
          continue;
        }
        expect("]");
        return { kind: "array", items };
      }
    }
    if (char === '"') return { kind: "string", value: readString() };
    for (const [word, value] of [["true", true], ["false", false], ["null", null]] as const) {
      if (text.startsWith(word, index)) {
        index += word.length;
        return { kind: "literal", value };
      }
    }
    const number = NUMBER_GRAMMAR.exec(text.slice(index, index + 64));
    if (number) {
      index += number[0].length;
      return { kind: "number", raw: number[0] };
    }
    return fail("unexpected token");
  };

  try {
    const node = readValue("$", 0);
    skipWhitespace();
    if (index < text.length) fail("unexpected content after the document");
    return { ok: true, node };
  } catch (error) {
    if (error instanceof JsonFailure) return { ok: false, position: error.position, reason: error.reason };
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------------------------

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const NODE_VERSION = /^v\d+\.\d+\.\d+$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const COUNT = /^(0|[1-9]\d*)$/;
const METHOD_MAX = 500;

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= lengths[month - 1];
}

function canonicalFilePath(value: string): boolean {
  if (value === "" || /\s/.test(value)) return false;
  const parsed = parseUnitSuiteManifest(value);
  return parsed.ok && parsed.files.length === 1 && parsed.files[0] === value;
}

type Issues = BaselineIssue[];

function issue(issues: Issues, code: BaselineIssueCode, path: string, detail?: string): void {
  issues.push(detail === undefined ? { code, path } : { code, path, detail });
}

/** Exige objeto com exatamente as chaves dadas; devolve os nós por chave quando é objeto. */
function exactObject(node: JsonNode, path: string, keys: readonly string[], issues: Issues): Map<string, JsonNode> | null {
  if (node.kind !== "object") {
    issue(issues, "UNIT_SUITE_BASELINE_TYPE_INVALID", path, "expected object");
    return null;
  }
  const fields = new Map<string, JsonNode>();
  for (const { key, node: child } of node.entries) {
    if (!keys.includes(key)) issue(issues, "UNIT_SUITE_BASELINE_KEY_UNEXPECTED", `${path}.${key}`);
    else if (!fields.has(key)) fields.set(key, child);
  }
  for (const key of keys) if (!fields.has(key)) issue(issues, "UNIT_SUITE_BASELINE_KEY_MISSING", `${path}.${key}`);
  return fields;
}

function stringField(fields: Map<string, JsonNode>, key: string, path: string, issues: Issues): string | null {
  const node = fields.get(key);
  if (node === undefined) return null;
  if (node.kind !== "string") {
    issue(issues, "UNIT_SUITE_BASELINE_TYPE_INVALID", `${path}.${key}`, "expected string");
    return null;
  }
  return node.value;
}

function countField(fields: Map<string, JsonNode>, key: string, path: string, issues: Issues): number | null {
  const node = fields.get(key);
  if (node === undefined) return null;
  if (node.kind !== "number") {
    issue(issues, "UNIT_SUITE_BASELINE_COUNT_INVALID", `${path}.${key}`, "expected a number");
    return null;
  }
  const value = COUNT.test(node.raw) ? Number(node.raw) : Number.NaN;
  if (!Number.isSafeInteger(value)) {
    issue(issues, "UNIT_SUITE_BASELINE_COUNT_INVALID", `${path}.${key}`, `not a non-negative safe integer: ${node.raw}`);
    return null;
  }
  return value;
}

function validateProvenance(node: JsonNode, issues: Issues): BaselineProvenance | null {
  const path = "$.provenance";
  const before = issues.length;
  const fields = exactObject(node, path, ["status", "recordedAt", "recordedCommit", "method", "nodeVersion"], issues);
  if (fields === null) return null;
  const status = stringField(fields, "status", path, issues);
  if (status !== null && status !== "declared") {
    issue(issues, "UNIT_SUITE_BASELINE_PROVENANCE_STATUS_INVALID", `${path}.status`, 'only "declared" is accepted');
  }
  const recordedAt = stringField(fields, "recordedAt", path, issues);
  if (recordedAt !== null && !isCalendarDate(recordedAt)) issue(issues, "UNIT_SUITE_BASELINE_FORMAT_INVALID", `${path}.recordedAt`, "expected a calendar date YYYY-MM-DD");
  const recordedCommit = stringField(fields, "recordedCommit", path, issues);
  if (recordedCommit !== null && !COMMIT.test(recordedCommit)) issue(issues, "UNIT_SUITE_BASELINE_FORMAT_INVALID", `${path}.recordedCommit`, "expected 40 lowercase hex characters");
  const method = stringField(fields, "method", path, issues);
  if (method !== null && (method === "" || method !== method.trim() || method.length > METHOD_MAX || /[\u0000-\u001f\u007f]/.test(method))) {
    issue(issues, "UNIT_SUITE_BASELINE_FORMAT_INVALID", `${path}.method`, `expected 1..${METHOD_MAX} characters, trimmed, without control characters`);
  }
  const nodeVersion = stringField(fields, "nodeVersion", path, issues);
  if (nodeVersion !== null && !NODE_VERSION.test(nodeVersion)) issue(issues, "UNIT_SUITE_BASELINE_FORMAT_INVALID", `${path}.nodeVersion`, "expected vMAJOR.MINOR.PATCH");
  if (issues.length !== before || status === null || recordedAt === null || recordedCommit === null || method === null || nodeVersion === null) return null;
  return { status: "declared", recordedAt, recordedCommit, method, nodeVersion };
}

type ParsedEntry = ExpectedFileBaseline & { sha256: string };

/** `present`: caminhos válidos e únicos, mesmo que outro campo da entrada seja inválido (a ausência depende só do caminho). */
function validateFiles(node: JsonNode, issues: Issues): { entries: ParsedEntry[]; present: string[] } | null {
  const path = "$.files";
  if (node.kind !== "array") {
    issue(issues, "UNIT_SUITE_BASELINE_TYPE_INVALID", path, "expected array");
    return null;
  }
  if (node.items.length === 0) {
    issue(issues, "UNIT_SUITE_BASELINE_FILES_EMPTY", path);
    return null;
  }
  const entries: ParsedEntry[] = [];
  const present: string[] = [];
  const seen = new Set<string>();
  let previous: string | null = null;
  node.items.forEach((item, index) => {
    const entryPath = `${path}[${index}]`;
    const before = issues.length;
    const fields = exactObject(item, entryPath, ["file", "tests", "skipped", "todo", "sha256"], issues);
    if (fields === null) return;
    const file = stringField(fields, "file", entryPath, issues);
    let validFile: string | null = null;
    if (file !== null) {
      if (!canonicalFilePath(file)) {
        issue(issues, "UNIT_SUITE_BASELINE_FILE_PATH_INVALID", `${entryPath}.file`, "expected a canonical repo-relative *.test.ts[x] path");
      } else if (seen.has(file)) {
        issue(issues, "UNIT_SUITE_BASELINE_FILE_DUPLICATE", `${entryPath}.file`, file);
      } else {
        validFile = file;
        seen.add(file);
        present.push(file);
        if (previous !== null && compareCodeUnits(previous, file) > 0) {
          issue(issues, "UNIT_SUITE_BASELINE_FILES_NOT_SORTED", `${entryPath}.file`, `${file} should come before ${previous}`);
        }
        previous = file;
      }
    }
    const tests = countField(fields, "tests", entryPath, issues);
    const skipped = countField(fields, "skipped", entryPath, issues);
    const todo = countField(fields, "todo", entryPath, issues);
    if (tests !== null && tests < 1) issue(issues, "UNIT_SUITE_BASELINE_TESTS_BELOW_ONE", `${entryPath}.tests`, `tests=${tests}`);
    if (tests !== null && skipped !== null && todo !== null && skipped + todo > tests) {
      issue(issues, "UNIT_SUITE_BASELINE_SKIP_TODO_EXCEEDS_TESTS", entryPath, `skipped(${skipped}) + todo(${todo}) > tests(${tests})`);
    }
    const sha256 = stringField(fields, "sha256", entryPath, issues);
    if (sha256 !== null && !SHA256.test(sha256)) issue(issues, "UNIT_SUITE_BASELINE_SHA256_INVALID", `${entryPath}.sha256`, "expected 64 lowercase hex characters");
    if (issues.length === before && validFile !== null && tests !== null && skipped !== null && todo !== null && sha256 !== null) {
      entries.push({ file: validFile, tests, skipped, todo, sha256 });
    }
  });
  return { entries, present };
}

function validateExpectedFiles(expectedFiles: unknown, issues: Issues): string[] | null {
  if (!Array.isArray(expectedFiles) || expectedFiles.length === 0) {
    issue(issues, "UNIT_SUITE_BASELINE_OPTIONS_INVALID", "$", "expectedFiles must be a non-empty array");
    return null;
  }
  const seen = new Set<string>();
  for (const entry of expectedFiles as unknown[]) {
    if (typeof entry !== "string" || entry === "" || seen.has(entry)) {
      issue(issues, "UNIT_SUITE_BASELINE_OPTIONS_INVALID", "$", "expectedFiles must contain unique, non-empty strings");
      return null;
    }
    seen.add(entry);
  }
  return [...seen];
}

function parse(text: unknown, options: unknown): BaselineParseResult {
  const issues: Issues = [];
  const expectedFiles = validateExpectedFiles((options as { expectedFiles?: unknown } | null | undefined)?.expectedFiles, issues);

  if (typeof text !== "string") {
    issue(issues, "UNIT_SUITE_BASELINE_TEXT_INVALID", "$", "baseline text must be a string");
    return { ok: false, version: UNIT_SUITE_BASELINE_SCHEMA_VERSION, issues };
  }
  const duplicateKeys: Issues = [];
  const outcome = readJson(text, duplicateKeys);
  if (!outcome.ok) {
    issue(issues, "UNIT_SUITE_BASELINE_JSON_INVALID", "$", `${outcome.reason} at offset ${outcome.position}`);
    return { ok: false, version: UNIT_SUITE_BASELINE_SCHEMA_VERSION, issues };
  }
  issues.push(...duplicateKeys);

  const root = exactObject(outcome.node, "$", ["schemaVersion", "provenance", "files"], issues);
  let provenance: BaselineProvenance | null = null;
  let validated: { entries: ParsedEntry[]; present: string[] } | null = null;
  if (root !== null) {
    const version = root.get("schemaVersion");
    if (version !== undefined && !(version.kind === "string" && version.value === UNIT_SUITE_BASELINE_SCHEMA_VERSION)) {
      issue(issues, "UNIT_SUITE_BASELINE_SCHEMA_VERSION_INVALID", "$.schemaVersion", `expected "${UNIT_SUITE_BASELINE_SCHEMA_VERSION}"`);
    }
    const provenanceNode = root.get("provenance");
    if (provenanceNode !== undefined) provenance = validateProvenance(provenanceNode, issues);
    const filesNode = root.get("files");
    if (filesNode !== undefined) validated = validateFiles(filesNode, issues);
  }

  if (expectedFiles !== null && validated !== null) {
    const present = new Set(validated.present);
    const expected = new Set(expectedFiles);
    for (const file of [...expectedFiles].sort(compareCodeUnits)) {
      if (!present.has(file)) issue(issues, "UNIT_SUITE_BASELINE_FILE_MISSING_FROM_BASELINE", "$.files", file);
    }
    for (const file of [...present].sort(compareCodeUnits)) {
      if (!expected.has(file)) issue(issues, "UNIT_SUITE_BASELINE_FILE_NOT_IN_INVENTORY", "$.files", file);
    }
  }

  if (issues.length > 0 || provenance === null || validated === null || expectedFiles === null) {
    if (issues.length === 0) issue(issues, "UNIT_SUITE_BASELINE_INTERNAL_ERROR", "$", "inconsistent validation state");
    return { ok: false, version: UNIT_SUITE_BASELINE_SCHEMA_VERSION, issues };
  }
  return {
    ok: true,
    version: UNIT_SUITE_BASELINE_SCHEMA_VERSION,
    provenance,
    files: validated.entries.map(({ file, tests, skipped, todo }) => ({ file, tests, skipped, todo })),
    digests: validated.entries.map(({ file, sha256 }) => ({ file, sha256 })),
  };
}

export function parseUnitSuiteBaseline(text: string, options: BaselineParseOptions): BaselineParseResult {
  try {
    return parse(text, options);
  } catch {
    return {
      ok: false,
      version: UNIT_SUITE_BASELINE_SCHEMA_VERSION,
      issues: [{ code: "UNIT_SUITE_BASELINE_INTERNAL_ERROR", path: "$" }],
    };
  }
}
