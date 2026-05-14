import fs from "node:fs";
import path from "node:path";

const CHECK = "check:interop-matrix";
const required = [
  "contracts/interop-discovery.v1.baseline.json",
  "contracts/agent-protocol.v1.baseline.json",
  "contracts/agent-protocol.v1.schema.json",
  "contracts/examples/agent-protocol.v1.example.json",
  "ops/contracts/agent-protocol-versioning-policy.md",
  "docs/ops/agent-protocol-api-contract.md",
];

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

const missing = required.filter((file) => !fs.existsSync(file));
if (missing.length > 0) {
  fail("interop_matrix_baseline_missing", { missing });
}

const interopBaseline = JSON.parse(
  fs.readFileSync(path.resolve("contracts/interop-discovery.v1.baseline.json"), "utf8")
) as {
  specVersion?: string;
  compatibility?: string;
  scenarios?: string[];
  publicContract?: string;
  versioningPolicyRef?: string;
};

if (interopBaseline.specVersion !== "v1") {
  fail("unsupported_interop_spec_version", { expected: "v1", got: interopBaseline.specVersion ?? null });
}

if (interopBaseline.compatibility !== "N,N-1") {
  fail("unsupported_interop_compatibility_window", {
    expected: "N,N-1",
    got: interopBaseline.compatibility ?? null,
  });
}

const scenarios = Array.isArray(interopBaseline.scenarios) ? interopBaseline.scenarios : [];
for (const scenario of ["discovery", "negotiate", "execute"]) {
  if (!scenarios.includes(scenario)) {
    fail("interop_scenario_missing_from_baseline", { scenario, scenarios });
  }
}

if (interopBaseline.publicContract !== "agent-protocol.v1") {
  fail("interop_public_contract_mismatch", {
    expected: "agent-protocol.v1",
    got: interopBaseline.publicContract ?? null,
  });
}

if (interopBaseline.versioningPolicyRef !== "ops/contracts/agent-protocol-versioning-policy.md") {
  fail("interop_versioning_policy_ref_mismatch", {
    expected: "ops/contracts/agent-protocol-versioning-policy.md",
    got: interopBaseline.versioningPolicyRef ?? null,
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      files: required,
      baseline: interopBaseline,
    },
    null,
    2
  )
);
