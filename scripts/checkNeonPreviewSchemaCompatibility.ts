import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export type SchemaDiffClassification =
  | "compatible"
  | "incompatible"
  | "indeterminate";

export type SchemaDiffGateResult = {
  ok: boolean;
  check: "check:neon-preview-schema";
  classification: SchemaDiffClassification;
  approved: boolean;
  statementCount: number;
  incompatibleRules: string[];
  indeterminateStatements: number;
  blockingCondition: string | null;
};

const INCOMPATIBLE_RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "drop_schema", pattern: /\bDROP\s+SCHEMA\b/i },
  { id: "drop_table", pattern: /\bDROP\s+TABLE\b/i },
  { id: "drop_column", pattern: /\bDROP\s+COLUMN\b/i },
  { id: "drop_type", pattern: /\bDROP\s+TYPE\b/i },
  { id: "drop_view", pattern: /\bDROP\s+(?:MATERIALIZED\s+)?VIEW\b/i },
  { id: "truncate", pattern: /\bTRUNCATE\b/i },
  { id: "alter_column_type", pattern: /\bALTER\s+COLUMN\b[\s\S]*\bTYPE\b/i },
  { id: "set_not_null", pattern: /\bALTER\s+COLUMN\b[\s\S]*\bSET\s+NOT\s+NULL\b/i },
  { id: "rename_object", pattern: /\bRENAME\s+(?:TO|COLUMN)\b/i },
  { id: "destructive_dml", pattern: /\b(?:DELETE\s+FROM|UPDATE\s+\S+\s+SET)\b/i },
];

const COMPATIBLE_STATEMENTS: RegExp[] = [
  /^CREATE\s+INDEX\b/i,
  /^CREATE\s+TABLE\b/i,
  /^CREATE\s+SEQUENCE\b/i,
  /^CREATE\s+TYPE\b/i,
  /^CREATE\s+EXTENSION\b/i,
  /^ALTER\s+TYPE\b[\s\S]*\bADD\s+VALUE\b/i,
  /^ALTER\s+TABLE\b[\s\S]*\bADD\s+COLUMN\b(?![\s\S]*\bNOT\s+NULL\b)/i,
  /^ALTER\s+TABLE\b[\s\S]*\bADD\s+COLUMN\b[\s\S]*\bDEFAULT\b/i,
  /^COMMENT\s+ON\b/i,
];

function stripSqlComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*--.*$/gm, " ")
    .trim();
}

function splitStatements(sql: string): string[] {
  const normalized = stripSqlComments(sql);
  if (!normalized) return [];

  return normalized
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

export function classifySchemaDiff(sql: string): {
  classification: SchemaDiffClassification;
  statementCount: number;
  incompatibleRules: string[];
  indeterminateStatements: number;
} {
  const statements = splitStatements(sql);
  const incompatibleRules = new Set<string>();
  let indeterminateStatements = 0;

  for (const statement of statements) {
    for (const rule of INCOMPATIBLE_RULES) {
      if (rule.pattern.test(statement)) incompatibleRules.add(rule.id);
    }

    if (
      !INCOMPATIBLE_RULES.some((rule) => rule.pattern.test(statement)) &&
      !COMPATIBLE_STATEMENTS.some((pattern) => pattern.test(statement))
    ) {
      indeterminateStatements += 1;
    }
  }

  const classification: SchemaDiffClassification =
    incompatibleRules.size > 0
      ? "incompatible"
      : indeterminateStatements > 0
        ? "indeterminate"
        : "compatible";

  return {
    classification,
    statementCount: statements.length,
    incompatibleRules: [...incompatibleRules].sort(),
    indeterminateStatements,
  };
}

export function evaluateSchemaDiff(
  sql: string,
  approved: boolean,
): SchemaDiffGateResult {
  const classification = classifySchemaDiff(sql);
  const requiresApproval = classification.classification !== "compatible";
  const ok = !requiresApproval || approved;

  return {
    ok,
    check: "check:neon-preview-schema",
    ...classification,
    approved,
    blockingCondition: ok
      ? null
      : classification.classification === "incompatible"
        ? "schema_diff_incompatible_without_human_approval"
        : "schema_diff_indeterminate_without_human_approval",
  };
}

function parseArgs(argv: string[]): {
  input: string;
  output?: string;
  approved: boolean;
} {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`Invalid argument near ${key ?? "<end>"}`);
    }
    values.set(key, value);
  }

  const input = values.get("--input");
  if (!input) throw new Error("--input is required");

  const approvedRaw = values.get("--approved") ?? "false";
  if (!["true", "false"].includes(approvedRaw)) {
    throw new Error("--approved must be true or false");
  }

  return {
    input,
    output: values.get("--output"),
    approved: approvedRaw === "true",
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const sql = fs.readFileSync(path.resolve(args.input), "utf8");
  const result = evaluateSchemaDiff(sql, args.approved);
  const serialized = `${JSON.stringify(result, null, 2)}\n`;

  if (args.output) {
    const output = path.resolve(args.output);
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, serialized);
  }

  process.stdout.write(serialized);
  if (!result.ok) process.exitCode = 1;
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) main();
