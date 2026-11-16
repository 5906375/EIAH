// Read-only verification of the moved tests' package boundary, not a build/typecheck.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const owner = path.resolve("packages/providers");
const configPath = path.join(owner, "tsconfig.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, owner);
assert.equal(parsed.errors.length, 0);
const adapterTest = "packages/providers/tests/openai-provider-failure.test.ts";
const apiTest = "apps/api/src/tests/llm-provider-failure.test.ts";
assert.ok(parsed.fileNames.includes(path.join(owner, "src/OpenAIProvider.ts")));
assert.ok(parsed.fileNames.every(file => !file.startsWith(path.join(owner, "tests") + path.sep)));
const resolution = ts.resolveModuleName("node-fetch", path.resolve(adapterTest), parsed.options, ts.sys).resolvedModule;
assert.ok(resolution, "adapter's transport dependency resolves from its owning package");
const script = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts["test:llm-provider-failure"];
for (const file of [adapterTest, apiTest]) {
  assert.ok(fs.existsSync(file));
  assert.ok(script.includes(file), `${file} belongs to the official aggregate command`);
}
assert.match(fs.readFileSync(".github/workflows/ci.yml", "utf8"), /run: pnpm test:llm-provider-failure/);
assert.ok(fs.existsSync("packages/providers/tests/fixtures/openai-credit-balance-exhausted.json"));
console.log(JSON.stringify({
  ok: true,
  scope: "package configuration and test registration paths only; no build or typecheck",
  productionSourceEntries: parsed.fileNames.length,
  testsOutsideProductionInputs: true,
  transportDependencyResolves: true,
  bothFilesInOfficialCommand: true,
  existingCiStepPreserved: true,
}));
