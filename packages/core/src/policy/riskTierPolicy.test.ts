import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RISK_TIER_POLICY_SOURCE,
  getRiskTier,
  listRiskTierRulesAtOrAbove,
  parseRiskTierPolicy,
  riskTierPolicy,
} from "./riskTierPolicy.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

// Baseline imutável capturado da matriz original de
// docs/ops/risk-tiering-by-action.md antes de ela virar documentação derivada.
const ORIGINAL_MARKDOWN_BASELINE = Object.freeze([
  { action: "runs.execute", scope: "execute", tier: "medium", txIdRequired: false },
  { action: "runs.approve", scope: "admin", tier: "medium", txIdRequired: false },
  {
    action: "realestate.generate_monthly",
    scope: "execute",
    tier: "medium",
    txIdRequired: false,
  },
  {
    action: "realestate.register_property",
    scope: "execute",
    tier: "high",
    txIdRequired: true,
  },
  {
    action: "realestate.create_contract",
    scope: "execute",
    tier: "high",
    txIdRequired: true,
  },
  {
    action: "realestate.apply_adjustment",
    scope: "execute",
    tier: "high",
    txIdRequired: true,
  },
  {
    action: "realestate.release_commission",
    scope: "execute",
    tier: "high",
    txIdRequired: true,
  },
  {
    action: "realestate.review_deal",
    scope: "execute",
    tier: "high",
    txIdRequired: true,
  },
] as const);

test("risk tier policy preserves the immutable original markdown baseline item by item", () => {
  assert.equal(riskTierPolicy.rules.length, ORIGINAL_MARKDOWN_BASELINE.length);
  for (const baseline of ORIGINAL_MARKDOWN_BASELINE) {
    const rule = riskTierPolicy.rules.find((item) => item.action === baseline.action);
    assert.ok(rule, `missing policy rule for ${baseline.action}`);
    assert.equal(rule.scope, baseline.scope, `${baseline.action} scope`);
    assert.equal(rule.tier, baseline.tier, `${baseline.action} tier`);
    assert.equal(rule.txIdRequired, baseline.txIdRequired, `${baseline.action} txId`);
    assert.equal(getRiskTier(baseline.action), baseline.tier, `${baseline.action} lookup`);
  }
});

test("risk tier policy loads the canonical JSON without embedding the matrix in TypeScript", () => {
  const sourcePath = path.join(repoRoot, RISK_TIER_POLICY_SOURCE);
  const rawPolicy = JSON.parse(fs.readFileSync(sourcePath, "utf8")) as {
    rules: Array<{ action: string }>;
  };
  assert.deepEqual(riskTierPolicy, rawPolicy);

  const loaderSource = fs.readFileSync(
    path.join(repoRoot, "packages/core/src/policy/riskTierPolicy.ts"),
    "utf8",
  );
  for (const rule of rawPolicy.rules) {
    assert.equal(loaderSource.includes(rule.action), false, `${rule.action} duplicated in loader`);
  }
});

test("risk tier policy fails closed for unknown actions and malformed policy", () => {
  assert.equal(getRiskTier("unknown.action"), "critical");
  assert.equal(getRiskTier("action.unknown.action"), "critical");
  assert.throws(
    () =>
      parseRiskTierPolicy({
        ...riskTierPolicy,
        unknownActionTier: "medium",
      }),
    /unknown_action_must_be_critical/,
  );
});

test("high-risk gate inventory is derived from validated policy rules", () => {
  assert.deepEqual(
    listRiskTierRulesAtOrAbove("high").map((rule) => [rule.action, rule.tier]),
    ORIGINAL_MARKDOWN_BASELINE.filter(
      (rule) => rule.tier === "high" || (rule.tier as string) === "critical",
    ).map((rule) => [rule.action, rule.tier]),
  );
});
