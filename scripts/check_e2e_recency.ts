import fs from "node:fs";

const CHECK = "check:e2e-recency";
const file = process.env.E2E_MANIFEST_PATH || "ops/evidence/latest/high-e2e-manifest.json";
const maxAgeDays = Number(process.env.E2E_RECENCY_MAX_DAYS || 7);

if (!fs.existsSync(file)) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "manifest not found", file }, null, 2));
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(file, "utf8"));
const ts = new Date(data.generatedAt || data.timestamp || 0);
if (Number.isNaN(ts.getTime())) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "invalid generatedAt", file }, null, 2));
  process.exit(1);
}
const age = (Date.now() - ts.getTime()) / (1000 * 60 * 60 * 24);
const qualityRequired = ["commitSha", "runIds", "bundleHash", "scenarioResults", "latency"];
const missing = qualityRequired.filter((k) => !(k in data));
if (missing.length) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "manifest quality missing fields", missing, file }, null, 2));
  process.exit(1);
}
if (age > maxAgeDays) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "manifest too old", ageDays: age, maxAgeDays, file }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, check: CHECK, ageDays: Number(age.toFixed(3)), maxAgeDays, file }, null, 2));
