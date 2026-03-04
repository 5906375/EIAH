import fs from "node:fs";
import path from "node:path";

const CHECK = "check:provider-pricing-recency";
const maxAgeDays = Number(process.env.PROVIDER_PRICING_MAX_AGE_DAYS || 14);
const files = [
  "artifacts/ape/provider-pricing-snapshot.json",
  "artifacts/ape/infra-provider-pricing-snapshot.json",
];

function fail(message: string, details?: unknown): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

const ages: Record<string, number> = {};
for (const rel of files) {
  const abs = path.resolve(rel);
  if (!fs.existsSync(abs)) fail("Missing pricing snapshot", { file: rel });
  const data = JSON.parse(fs.readFileSync(abs, "utf8"));
  const ts = new Date(data.generatedAt || data.timestamp || 0);
  if (Number.isNaN(ts.getTime())) fail("Invalid generatedAt in snapshot", { file: rel });
  const age = (Date.now() - ts.getTime()) / (1000 * 60 * 60 * 24);
  ages[rel] = Number(age.toFixed(3));
  if (age > maxAgeDays) fail("Pricing snapshot too old", { file: rel, ageDays: age, maxAgeDays });
}

console.log(JSON.stringify({ ok: true, check: CHECK, maxAgeDays, ages }, null, 2));
