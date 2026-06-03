import assert from "node:assert/strict";
import test from "node:test";
import {
  getGuardianGoLiveArtifactPaths,
  resolveGuardianRepoRoot,
} from "../guardianChecklistTools";

test("guardian checklist tools resolve repository root from workspace", () => {
  const root = resolveGuardianRepoRoot(process.cwd());
  assert.ok(root.endsWith("EIAH_BUILDER"));
});

test("guardian checklist tools expose canonical go-live artifacts", () => {
  const artifacts = getGuardianGoLiveArtifactPaths(resolveGuardianRepoRoot(process.cwd()));
  const paths = artifacts.map((item) => item.relativePath);

  assert.ok(paths.includes("docs/adr/ADR-001-domain-runtime-stack.md"));
  assert.ok(paths.includes("ops/evidence/latest/domain-go-live/rollback-plan.md"));
  assert.ok(paths.includes("ops/evidence/latest/domain-go-live/tenant-policy-fail-closed-403.md"));
});
