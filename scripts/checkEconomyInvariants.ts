import fs from "node:fs";

const CHECK = "check:economy-invariants";
const file = "ops/evidence/latest/economy-invariants.json";
if (!fs.existsSync(file)) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "economy invariants evidence missing", file }, null, 2));
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(file, "utf8"));
const required = ["conservation", "stateMonotonicity", "deterministicReconciliation"];
const missing = required.filter((k) => data[k] !== true);
if (missing.length) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "invariant failed", missing }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, check: CHECK, file }, null, 2));
