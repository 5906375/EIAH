import fs from "node:fs";
import path from "node:path";

const CHECK = "check:agent-protocol-compat-matrix";
const MATRIX_FILE = path.resolve("docs/ops/agent-protocol-compatibility-matrix.md");
const PACKAGE_FILE = path.resolve("package.json");

type MatrixRow = {
  version: string;
  status: "evidenciado" | "parcial" | "proposta" | "nao_suportado";
  schema: string | null;
  baseline: string | null;
  example: string | null;
  policy: string | null;
  apiContract: string | null;
  changelog: string | null;
  ciChecks: string[];
  evidence: string[];
};

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function extractMatrix(content: string) {
  const start = "<!-- AGENT_PROTOCOL_COMPAT_MATRIX:START -->";
  const end = "<!-- AGENT_PROTOCOL_COMPAT_MATRIX:END -->";
  const startIdx = content.indexOf(start);
  const endIdx = content.indexOf(end);
  if (startIdx < 0 || endIdx < 0 || endIdx <= startIdx) {
    fail("matrix_block_missing", { file: path.relative(process.cwd(), MATRIX_FILE) });
  }

  const block = content.slice(startIdx + start.length, endIdx);
  const jsonMatch = block.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    fail("matrix_json_missing", { file: path.relative(process.cwd(), MATRIX_FILE) });
  }

  try {
    return JSON.parse(jsonMatch[0]) as {
      currentVersion?: string;
      rows?: MatrixRow[];
    };
  } catch (error) {
    fail("matrix_json_invalid", {
      file: path.relative(process.cwd(), MATRIX_FILE),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

if (!fs.existsSync(MATRIX_FILE)) {
  fail("matrix_file_missing", { file: path.relative(process.cwd(), MATRIX_FILE) });
}

if (!fs.existsSync(PACKAGE_FILE)) {
  fail("package_file_missing", { file: path.relative(process.cwd(), PACKAGE_FILE) });
}

const matrix = extractMatrix(fs.readFileSync(MATRIX_FILE, "utf8"));
const pkg = JSON.parse(fs.readFileSync(PACKAGE_FILE, "utf8")) as {
  scripts?: Record<string, string>;
};

if (matrix.currentVersion !== "agent-protocol.v1") {
  fail("unsupported_current_version", { expected: "agent-protocol.v1", got: matrix.currentVersion ?? null });
}

if (!Array.isArray(matrix.rows) || matrix.rows.length === 0) {
  fail("matrix_rows_missing");
}

const evidenced = matrix.rows.filter((row) => row.status === "evidenciado");
if (evidenced.length === 0) {
  fail("no_evidenced_version_declared");
}

const missingFiles: Array<{ version: string; field: string; file: string }> = [];
const missingScripts: Array<{ version: string; check: string }> = [];

for (const row of matrix.rows) {
  for (const [field, ref] of Object.entries({
    schema: row.schema,
    baseline: row.baseline,
    example: row.example,
    policy: row.policy,
    apiContract: row.apiContract,
    changelog: row.changelog,
  })) {
    if (ref && !fs.existsSync(path.resolve(ref))) {
      missingFiles.push({ version: row.version, field, file: ref });
    }
  }

  for (const ref of row.evidence) {
    if (!fs.existsSync(path.resolve(ref))) {
      missingFiles.push({ version: row.version, field: "evidence", file: ref });
    }
  }

  if (row.status === "evidenciado") {
    for (const requiredField of ["schema", "baseline", "example", "policy", "apiContract", "changelog"] as const) {
      if (!row[requiredField]) {
        fail("evidenced_version_missing_required_ref", {
          version: row.version,
          field: requiredField,
        });
      }
    }

    if (row.evidence.length === 0) {
      fail("evidenced_version_missing_evidence", { version: row.version });
    }

    if (row.ciChecks.length === 0) {
      fail("evidenced_version_missing_ci_checks", { version: row.version });
    }
  }

  for (const check of row.ciChecks) {
    if (!pkg.scripts?.[check]) {
      missingScripts.push({ version: row.version, check });
    }
  }
}

if (missingFiles.length > 0) {
  fail("matrix_references_missing_files", { missingFiles });
}

if (missingScripts.length > 0) {
  fail("matrix_references_missing_package_scripts", { missingScripts });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      matrix: path.relative(process.cwd(), MATRIX_FILE),
      currentVersion: matrix.currentVersion,
      rows: matrix.rows.map((row) => ({
        version: row.version,
        status: row.status,
        ciChecks: row.ciChecks,
      })),
    },
    null,
    2,
  ),
);
