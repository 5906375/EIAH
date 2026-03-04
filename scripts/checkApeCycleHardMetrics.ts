import fs from "node:fs";

const CHECK = "check:ape-hard-metrics";
const decisionPath = "artifacts/ape/weekly-cycle-decision.json";
if (!fs.existsSync(decisionPath)) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "missing decision artifact", file: decisionPath }, null, 2));
  process.exit(1);
}

const decision = JSON.parse(fs.readFileSync(decisionPath, "utf8"));
const hardReasons = Array.isArray(decision.hardReasons) ? decision.hardReasons : [];
const hardGo = Boolean(decision.hardMetricsGo) && hardReasons.length === 0;
if (!hardGo) {
  console.error(JSON.stringify({ ok: false, check: CHECK, hardReasons, decision: decision.decision }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, check: CHECK, decision: decision.decision, hardMetricsGo: true }, null, 2));
