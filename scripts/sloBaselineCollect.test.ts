import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { collectBaselineData } from "./sloBaselineCollect.ts";

function writeTempManifest(data: unknown): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slo-test-"));
  const file = path.join(dir, "high-e2e-manifest.json");
  fs.writeFileSync(file, JSON.stringify(data));
  return file;
}

test("scenario-latency: returns per-scenario samples when latencyMs present", () => {
  const manifestPath = writeTempManifest({
    scenarioResults: [
      { name: "pou_finalize", status: "PASS", latencyMs: 320 },
      { name: "on_chain_confirm", status: "PASS", latencyMs: 850 },
    ],
  });
  const result = collectBaselineData(manifestPath);
  assert.equal(result.sampleSource, "scenario-latency");
  assert.deepEqual(result.samples, [320, 850]);
  assert.equal(result.aggregateP95Ms, null);
  assert.equal(result.aggregateP99Ms, null);
});

test("aggregate-latency: falls back to manifest.latency when no per-scenario latencyMs", () => {
  const manifestPath = writeTempManifest({
    scenarioResults: [{ name: "webhook_to_pou", status: "PASS" }],
    latency: { p95Ms: 410, p99Ms: 850 },
  });
  const result = collectBaselineData(manifestPath);
  assert.equal(result.sampleSource, "aggregate-latency");
  assert.deepEqual(result.samples, []);
  assert.equal(result.aggregateP95Ms, 410);
  assert.equal(result.aggregateP99Ms, 850);
});

test("none: returns no samples when neither per-scenario nor aggregate latency present", () => {
  const manifestPath = writeTempManifest({
    scenarioResults: [{ name: "webhook_to_pou", status: "PASS" }],
  });
  const result = collectBaselineData(manifestPath);
  assert.equal(result.sampleSource, "none");
  assert.deepEqual(result.samples, []);
  assert.equal(result.aggregateP95Ms, null);
  assert.equal(result.aggregateP99Ms, null);
});

test("none: returns no samples when manifest file does not exist", () => {
  const result = collectBaselineData("/tmp/does-not-exist-high-e2e-manifest.json");
  assert.equal(result.sampleSource, "none");
  assert.deepEqual(result.samples, []);
  assert.equal(result.aggregateP95Ms, null);
  assert.equal(result.aggregateP99Ms, null);
});

test("extracts manifestCommitSha from manifest data", () => {
  const manifestPath = writeTempManifest({
    commitSha: "abc123def456",
    scenarioResults: [{ name: "pou_finalize", status: "PASS", latencyMs: 300 }],
  });
  const result = collectBaselineData(manifestPath);
  assert.equal(result.manifestCommitSha, "abc123def456");

  // recovery-local sentinel is preserved (gate check responsibility)
  const recoveryPath = writeTempManifest({
    commitSha: "recovery-local",
    scenarioResults: [{ name: "webhook_to_pou", status: "PASS" }],
    latency: { p95Ms: 410, p99Ms: 850 },
  });
  const recovered = collectBaselineData(recoveryPath);
  assert.equal(recovered.manifestCommitSha, "recovery-local");
});

test("scenario-latency wins over aggregate when both are present", () => {
  const manifestPath = writeTempManifest({
    scenarioResults: [
      { name: "pou_finalize", status: "PASS", latencyMs: 200 },
    ],
    latency: { p95Ms: 999, p99Ms: 1500 },
  });
  const result = collectBaselineData(manifestPath);
  // Per-scenario latencyMs takes priority
  assert.equal(result.sampleSource, "scenario-latency");
  assert.deepEqual(result.samples, [200]);
  // Aggregate NOT used when scenario samples exist
  assert.equal(result.aggregateP95Ms, null);
  assert.equal(result.aggregateP99Ms, null);
});
