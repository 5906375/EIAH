import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  type SettlementSupportMatrix,
  validateFullLiveProviderGrounding,
} from "../checkP3SettlementSupportByEnv.js";

function fixtureRoot(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "p3-settlement-grounding-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function matrix(mode: "full" | "simulated", module?: string): SettlementSupportMatrix {
  return {
    environments: {
      staging: { stripe: [mode] },
    },
    ...(module ? { providerAdapters: { stripe: { module } } } : {}),
  };
}

test("full without providerAdapters fails criterion 1", (t) => {
  const violations = validateFullLiveProviderGrounding(matrix("full"), {
    repositoryRoot: fixtureRoot(t),
    versionedFiles: new Set(),
  });

  assert.deepEqual(
    violations.map(({ criterion, code }) => ({ criterion, code })),
    [{ criterion: 1, code: "provider_adapter_module_not_declared" }],
  );
});

test("full with a declared missing module fails criterion 2", (t) => {
  const violations = validateFullLiveProviderGrounding(
    matrix("full", "adapters/stripeExternalAdapter.ts"),
    {
      repositoryRoot: fixtureRoot(t),
      versionedFiles: new Set(),
    },
  );

  assert.deepEqual(
    violations.map(({ criterion, code }) => ({ criterion, code })),
    [{ criterion: 2, code: "provider_adapter_module_not_versioned_existing" }],
  );
});

test("full module resolving to the local stub fails criterion 3", (t) => {
  const root = fixtureRoot(t);
  const stub = "apps/api/src/services/settlementProviders.ts";
  fs.mkdirSync(path.dirname(path.join(root, stub)), { recursive: true });
  fs.writeFileSync(path.join(root, stub), "export async function settleWithProvider() {}\n");

  const violations = validateFullLiveProviderGrounding(matrix("full", stub), {
    repositoryRoot: root,
    versionedFiles: new Set([stub]),
  });

  assert.deepEqual(
    violations.map(({ criterion, code }) => ({ criterion, code })),
    [{ criterion: 3, code: "provider_adapter_module_resolves_to_local_stub" }],
  );
});

test("simulated without providerAdapters passes", (t) => {
  const violations = validateFullLiveProviderGrounding(matrix("simulated"), {
    repositoryRoot: fixtureRoot(t),
    versionedFiles: new Set(),
  });

  assert.deepEqual(violations, []);
});
