import fs from "node:fs";
import path from "node:path";

const CHECK = "check:ledger-bundle-smoke";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readWithFallback(files: string[]) {
  const resolved = files.map((file) => path.resolve(file));
  const existing = resolved.find((file) => fs.existsSync(file));
  if (!existing) {
    fail("file_not_found", {
      file: resolved[0],
      candidates: resolved,
    });
  }
  return fs.readFileSync(existing, "utf8");
}

const governanceSrc = read(path.resolve("apps/api/src/routes/governance.ts"));
const runsSrc = read(path.resolve("apps/api/src/routes/runs.ts"));
const ledgerContract = readWithFallback([
  "docs/ops/ledger-txid-api-contract.md",
  "ops/contracts/ledger-txid-api-contract.md",
]);
const bundleContract = readWithFallback([
  "docs/ops/run-bundle-api-contract.md",
  "ops/contracts/run-bundle-api-contract.md",
]);

const requiredChecks = [
  {
    key: "ledger_route_exists",
    ok: governanceSrc.includes('get("/ledger/:txId"'),
  },
  {
    key: "ledger_invalid_txid_code",
    ok: governanceSrc.includes('code: "INVALID_TXID"'),
  },
  {
    key: "ledger_not_found_code",
    ok: governanceSrc.includes('code: "NOT_FOUND"'),
  },
  {
    key: "ledger_inconsistent_code",
    ok: governanceSrc.includes('code: "RECEIPT_CANON_INCONSISTENT"'),
  },
  {
    key: "bundle_route_exists",
    ok: runsSrc.includes('get("/runs/:id/bundle"'),
  },
  {
    key: "bundle_not_found_code",
    ok: runsSrc.includes('code: "NOT_FOUND", message: "run"'),
  },
  {
    key: "ledger_contract_exists",
    ok: ledgerContract.includes("GET /api/ledger/:txId"),
  },
  {
    key: "bundle_contract_exists",
    ok: bundleContract.includes("GET /api/runs/:id/bundle"),
  },
];

const failures = requiredChecks.filter((item) => !item.ok);
if (failures.length > 0) {
  fail("smoke_contract_failed", {
    failures: failures.map((item) => item.key),
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      checks: requiredChecks.map((item) => item.key),
    },
    null,
    2
  )
);
