import fs from "node:fs";

const CHECK = "check:interop-spec-governance";
const file = "docs/ops/interop-runbook.md";
if (!fs.existsSync(file)) {
  console.error(JSON.stringify({ ok: false, check: CHECK, message: "interop governance doc missing", file }, null, 2));
  process.exit(1);
}
const content = fs.readFileSync(file, "utf8");

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

for (const needle of [
  "contracts/agent-protocol.v1.schema.json",
  "contracts/agent-protocol.v1.baseline.json",
  "contracts/interop-discovery.v1.baseline.json",
  "ops/contracts/agent-protocol-versioning-policy.md",
  "docs/ops/agent-protocol-api-contract.md",
  "N,N-1",
  "major bump",
  "discovery -> negotiate -> execute",
  "check:agent-protocol-compat",
  "check:interop-contract-matrix",
  "check:interop-spec-governance",
  "check:p2-audit-interop",
]) {
  if (!content.includes(needle)) {
    fail("interop_governance_invariant_missing", { file, needle });
  }
}

console.log(JSON.stringify({ ok: true, check: CHECK, file }, null, 2));
