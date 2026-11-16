// Reuses the recorded focal compiler comparison without rewriting its historical outputs.
// Same 16 roots/settings, plus the provider-owned test moved by ProviderBoundary.
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url);
const parent = new URL("../typecheck-deltas.mjs", import.meta.url);
const source = readFileSync(parent, "utf8");
const directory = fileURLToPath(new URL(".", import.meta.url));
const replacements = [
  ['from "typescript"', `from ${JSON.stringify(pathToFileURL(require.resolve("typescript")).href)}`],
  ['const dir = path.dirname(new URL(import.meta.url).pathname);', `const dir = ${JSON.stringify(directory)};`],
  ['const roots = [', 'const roots = ["packages/providers/tests/openai-provider-failure.test.ts", '],
  ['16 selected roots', '17 selected roots'],
];
let adapted = source;
for (const [before, after] of replacements) {
  if (!adapted.includes(before)) throw new Error("Historical checker changed; review adaptation before running");
  adapted = adapted.replace(before, after);
}
adapted = adapted.replaceAll('"delta-typecheck.json"', '"preparation-typecheck.json"')
  .replaceAll('"delta-typecheck-final.json"', '"preparation-typecheck-final.json"');
await import(`data:text/javascript;base64,${Buffer.from(adapted).toString("base64")}`);
const output = new URL("preparation-typecheck.json", import.meta.url);
const result = JSON.parse(readFileSync(output, "utf8"));
result.baselineHead = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
result.reusedChecker = { path: "../typecheck-deltas.mjs", sha256: createHash("sha256").update(source).digest("hex"),
  changes: "output directory/names, package resolution for in-memory module, 17th root only; fresh virtual HEAD baseline" };
writeFileSync(output, JSON.stringify(result, null, 2) + "\n");
