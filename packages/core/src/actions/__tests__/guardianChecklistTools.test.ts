import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  getGuardianEdgeProtectionArtifactPaths,
  getGuardianEnvironmentSegregationArtifactPaths,
  getGuardianGoLiveArtifactPaths,
  resolveGuardianRepoRoot,
} from "../guardianChecklistTools";

test("guardian checklist tools resolve repository root from workspace", () => {
  const root = resolveGuardianRepoRoot(process.cwd());
  assert.ok(existsSync(path.join(root, "docs", "EVIDENCE_INDEX.md")));
});

test("guardian checklist tools expose canonical go-live artifacts", () => {
  const artifacts = getGuardianGoLiveArtifactPaths(resolveGuardianRepoRoot(process.cwd()));
  const paths = artifacts.map((item) => item.relativePath);

  assert.ok(paths.includes("docs/adr/ADR-001-domain-runtime-stack.md"));
  assert.ok(paths.includes("ops/evidence/latest/domain-go-live/rollback-plan.md"));
  assert.ok(paths.includes("ops/evidence/latest/domain-go-live/tenant-policy-fail-closed-403.md"));
});

test("guardian checklist tools expose environment segregation and edge protection artifacts", () => {
  const root = resolveGuardianRepoRoot(process.cwd());
  const segregationPaths = getGuardianEnvironmentSegregationArtifactPaths(root).map((item) => item.relativePath);
  const edgePaths = getGuardianEdgeProtectionArtifactPaths(root).map((item) => item.relativePath);

  assert.ok(segregationPaths.includes("ops/evidence/latest/domain-go-live/dns-cloudflare-snapshot.md"));
  assert.ok(segregationPaths.includes("ops/evidence/latest/domain-go-live/staging-dns-tls-smoke.md"));
  assert.ok(edgePaths.includes("ops/evidence/2026-W09/base/waf-rate-limit-evidence.md"));
  assert.ok(edgePaths.includes("ops/evidence/latest/domain-go-live/tenant-policy-fail-closed-403.md"));
});
