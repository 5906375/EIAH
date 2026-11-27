/** Local files only; no .env, provider, Prisma, service or implicit gate approval. */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { recomputeFinancialProjection } from "./lib/p1FinancialRecomputation.js";
const files = ["scripts/recomputeP1Financial.ts", "scripts/lib/p1FinancialRecomputation.ts", "scripts/lib/p1FinancialProjection.ts", "scripts/lib/p1SourceMaterial.ts", "packages/core/src/billing/reconciliation.ts", "packages/core/src/utils/canonicalDigest.ts"];
try {
  if (process.argv.length !== 3) throw new Error("usage: node --import tsx scripts/recomputeP1Financial.ts <local-projection.json>");
  const result = recomputeFinancialProjection(JSON.parse(readFileSync(process.argv[2], "utf8")));
  const root = new URL("../", import.meta.url);
  const sourceFiles = files.map(path => ({ path, sha256: createHash("sha256").update(readFileSync(fileURLToPath(new URL(path, root)))).digest("hex") }));
  console.log(JSON.stringify({ ...result, codeProvenance: { sourceFiles, attestation: "not_demonstrated", note: "hashes identify current TypeScript bytes, not an independent execution attestation" } }, null, 2));
  process.exitCode = result.execution === "error" ? 2 : result.execution === "not_run" ? 1 : 0;
} catch (error) {
  console.error(JSON.stringify({ execution: "error", message: error instanceof Error ? error.message : "input_error" })); process.exitCode = 2;
}
