import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(process.cwd());
const contractPaths = [
  "contracts/imob/market-scan-agent.v1.schema.json",
  "contracts/imob/market-scan-model-policy.v1.schema.json",
  "contracts/imob/market-scan-run.v1.schema.json",
  "contracts/imob/market-scan-result.v1.schema.json",
  "contracts/imob/operational-opportunity.v1.schema.json",
  "contracts/imob/source-access-decision.v1.schema.json",
  "contracts/imob/market-scan-router-output.v1.schema.json",
  "contracts/imob/market-scan-query-builder-output.v1.schema.json",
  "contracts/imob/market-scan-llm-judge.v1.schema.json",
];

test("market scan contract schemas are valid JSON and carry stable ids", () => {
  for (const contractPath of contractPaths) {
    const schema = JSON.parse(fs.readFileSync(path.join(repoRoot, contractPath), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(schema.$id, /https:\/\/eiah\.local\/contracts\/imob\//);
    assert.equal(typeof schema.title, "string");
  }
});

