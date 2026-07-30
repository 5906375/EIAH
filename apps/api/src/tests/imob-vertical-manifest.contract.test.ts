import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const manifestPath = path.join(repoRoot, "ops/verticals/imob/vertical.manifest.v1.json");
const riskTieringDocPath = path.join(repoRoot, "docs/ops/risk-tiering-by-action.md");
const riskTierPolicyPath = path.join(repoRoot, "contracts/risk-tier-policy.v1.json");
const riskTierPolicyLoaderPath = path.join(
  repoRoot,
  "packages/core/src/policy/riskTierPolicy.ts",
);
const p1CriticalChainPath = path.join(repoRoot, "scripts/checkP1CriticalChain.ts");
const agentProtocolSchemaPath = path.join(repoRoot, "contracts/agent-protocol.v1.schema.json");
const receiptCanonBaselinePath = path.join(repoRoot, "contracts/receipt-canon.v1.baseline.json");

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

test("IMOB vertical manifest binds the chat vertical to the platform proof chain", () => {
  const manifest = readJson(manifestPath);
  const agentProtocolSchema = readJson(agentProtocolSchemaPath);
  const receiptCanonBaseline = readJson(receiptCanonBaselinePath);
  const riskTieringDoc = fs.readFileSync(riskTieringDocPath, "utf8");
  const riskTierPolicy = readJson(riskTierPolicyPath);
  const riskTierPolicyLoader = fs.readFileSync(riskTierPolicyLoaderPath, "utf8");
  const p1CriticalChain = fs.readFileSync(p1CriticalChainPath, "utf8");

  assert.equal(manifest.vertical, "IMOB");
  assert.equal(manifest.frontDoorAgent, "EIAH");
  assert.equal(manifest.visibleAgentId, "IMOB");
  assert.equal(manifest.launcherPolicy, "render_only");
  assert.equal(manifest.threadIdRequired, true);
  assert.equal(manifest.bundleExportRequired, true);
  assert.equal(manifest.receiptRequired, true);
  assert.equal(manifest.txIdRequiredWhenPolicyRequires, true);
  assert.deepEqual(manifest.governanceChain, [
    "intent",
    "scope",
    "policy",
    "approval",
    "run",
    "receipt",
    "bundle",
    "ledger",
  ]);

  assert.ok(Array.isArray(agentProtocolSchema.required));
  assert.ok(agentProtocolSchema.required.includes("txIdRequired"));
  assert.ok(agentProtocolSchema.required.includes("receiptSchema"));
  assert.equal(agentProtocolSchema.properties?.receiptSchema?.properties?.specVersion?.const, "receipt.canon.v1");

  assert.equal(receiptCanonBaseline.schemaVersion, "1.0.0");
  assert.ok((receiptCanonBaseline.requiredReceipts ?? []).includes("TxLinkReceipt"));

  const criticalActions = manifest.criticalActions as Array<Record<string, unknown>>;
  assert.equal(criticalActions.length, 4);
  for (const action of criticalActions) {
    assert.equal(action.tier, "HIGH");
    assert.equal(action.txIdRequired, true);
    assert.equal(action.receiptSchema, "receipt.canon.v1");
    assert.equal(action.bundleExportRequired, true);
    assert.match(String(action.action ?? ""), /^realestate\./);
    assert.match(String(action.chatSurface ?? ""), /^[a-z_]+$/);
    assert.match(String(action.governanceOwnerAgent ?? ""), /^(IMOB|J_360|FinNexus)$/);

    const policyRule = (
      riskTierPolicy.rules as Array<Record<string, unknown>>
    ).find((rule) => rule.action === action.action);
    assert.ok(policyRule, `missing canonical risk rule for ${String(action.action)}`);
    assert.equal(policyRule.tier, "high");
    assert.equal(policyRule.txIdRequired, true);
  }

  assert.match(riskTieringDoc, /contracts\/risk-tier-policy\.v1\.json/);
  assert.match(riskTieringDoc, /Documentação derivada/);
  assert.match(riskTierPolicyLoader, /contracts\/risk-tier-policy\.v1\.json/);
  assert.doesNotMatch(riskTierPolicyLoader, /realestate\.register_property/);
  assert.match(p1CriticalChain, /listRiskTierRulesAtOrAbove\("high"\)/);
  assert.doesNotMatch(p1CriticalChain, /readFile\("docs\/ops\/risk-tiering-by-action\.md"\)/);
});
