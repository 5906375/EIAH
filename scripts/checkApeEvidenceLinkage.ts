import fs from "node:fs";

const CHECK = "check:ape-evidence-linkage";
const required = [
  "weekly-cycle-payload.json",
  "weekly-cycle-response.json",
  "weekly-cycle-decision.json",
  "weekly-report.md",
];

const base = "artifacts/ape";
const missing = required.filter((f) => !fs.existsSync(`${base}/${f}`));
if (missing.length) {
  console.error(JSON.stringify({ ok: false, check: CHECK, missing }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, check: CHECK, artifacts: required }, null, 2));
