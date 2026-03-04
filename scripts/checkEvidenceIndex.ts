import fs from "node:fs";
import path from "node:path";

const CHECK = "check:evidence-index";
const file = path.resolve("docs/EVIDENCE_INDEX.md");

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

if (!fs.existsSync(file)) fail("EVIDENCE_INDEX not found", { file });

const content = fs.readFileSync(file, "utf8");
if (content.trim().length < 400) fail("EVIDENCE_INDEX too small", { minChars: 400, file });

const required = [
  "# EVIDENCE INDEX",
  "Roadmap atual",
  "Entry points",
  "Status do Roadmap",
];
const missing = required.filter((token) => !content.includes(token));
if (missing.length) fail("EVIDENCE_INDEX missing required sections", { missing, file });

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      file: "docs/EVIDENCE_INDEX.md",
      sizeChars: content.length,
    },
    null,
    2,
  ),
);
