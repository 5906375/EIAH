import fs from "node:fs";

const CHECK = "check:interop-spec-governance";
const file = "docs/ops/interop-runbook.md";
if (!fs.existsSync(file)) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "interop governance doc missing", file }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, check: CHECK, file }, null, 2));
