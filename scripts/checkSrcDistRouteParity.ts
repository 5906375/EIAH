import fs from "node:fs";
import path from "node:path";

const CHECK = "check:src-dist-route-parity";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function read(file: string) {
  if (!fs.existsSync(file)) fail("file_not_found", { file });
  return fs.readFileSync(file, "utf8");
}

const srcGovernance = read(path.resolve("apps/api/src/routes/governance.ts"));
const srcRuns = read(path.resolve("apps/api/src/routes/runs.ts"));
const distGovernance = read(path.resolve("apps/api/dist/apps/api/src/routes/governance.js"));
const distRuns = read(path.resolve("apps/api/dist/apps/api/src/routes/runs.js"));

const checks = [
  {
    key: "ledger_txid_route",
    src: srcGovernance.includes('get("/ledger/:txId"'),
    dist: distGovernance.includes('get("/ledger/:txId"'),
  },
  {
    key: "run_bundle_route",
    src: srcRuns.includes('get("/runs/:id/bundle"'),
    dist: distRuns.includes('get("/runs/:id/bundle"'),
  },
];

const failures = checks.filter((item) => !item.src || !item.dist);
if (failures.length > 0) {
  fail("route_parity_failed", {
    failures,
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      routes: checks,
    },
    null,
    2
  )
);
