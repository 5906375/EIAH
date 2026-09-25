import assert from "node:assert/strict";
import test from "node:test";

import { findVolatileEvidenceRefs, collectEvidenceReferences } from "../checkEvidenceIndex.js";

test("rejects local and temporary evidenceRef locations", () => {
  const content = [
    "evidenceRef{artifactId: TMP, location: /tmp/output.log, hash: abc}",
    "evidenceRef{artifactId: HOME, location: ~/output.log, hash: def}",
    "evidenceRef{artifactId: FILE, location: file:///var/tmp/output.log, hash: ghi}",
    "evidenceRef{artifactId: REL_TMP, location: .tmp/output.log, hash: jkl}",
    String.raw`evidenceRef{artifactId: WIN, location: C:\Users\runner\AppData\Local\Temp\output.log, hash: mno}`,
  ].join("\n");

  assert.deepEqual(findVolatileEvidenceRefs(content), [
    { artifactId: "TMP", location: "/tmp/output.log" },
    { artifactId: "HOME", location: "~/output.log" },
    { artifactId: "FILE", location: "file:///var/tmp/output.log" },
    { artifactId: "REL_TMP", location: ".tmp/output.log" },
    {
      artifactId: "WIN",
      location: String.raw`C:\Users\runner\AppData\Local\Temp\output.log`,
    },
  ]);
});

test("allows repository paths, commit anchors, and remote HTTP artifacts", () => {
  const content = [
    "evidenceRef{artifactId: REPO, location: ops/evidence/latest/result.json, hash: abc}",
    "evidenceRef{artifactId: SOURCE, location: scripts/checkEvidenceIndex.ts@abc123, hash: def}",
    "evidenceRef{artifactId: REMOTE, location: https://github.example/artifacts/123, hash: ghi}",
  ].join("\n");

  assert.deepEqual(findVolatileEvidenceRefs(content), []);
});

test("checks artifact cells, not historical path mentions in proof prose",()=>{
  const refs=collectEvidenceReferences("| Assunto | Arquivo | O que prova |\n| --- | --- | --- |\n| histórico | `ops/real.md` | erro antigo em `packages/core/node_modules/@eiah` |\n");
  assert.deepEqual([...refs],["ops/real.md"]);
});
test("still checks a missing artifact and explicit links inside proof prose",()=>{
  const refs=collectEvidenceReferences("| Assunto | Arquivo | O que prova |\n| --- | --- | --- |\n| teste | `ops/missing.json` | [evidência](ops/also-missing.md) |\n");
  assert(refs.has("ops/missing.json"));assert(refs.has("ops/also-missing.md"));
});
test("unrecognized tables and references outside tables stay fail-closed",()=>{
  assert.deepEqual([...collectEvidenceReferences("| Tipo | Caminho |\n| teste | `ops/required.json` |\n\n`docs/required.md`")],["ops/required.json","docs/required.md"]);
});
test("table parser preserves pipes within code and resets between tables",()=>{
  const refs=collectEvidenceReferences("| Assunto | Arquivo | O que prova |\n| --- | --- | --- |\n| `A|B` | `ops/a.json` | `packages/old` |\n\n| Tipo | Caminho |\n| novo | `ops/b.json` |");
  assert.deepEqual([...refs],["ops/a.json","ops/b.json"]);
});
test("explicit evidenceRef locations remain checked inside narrative cells",()=>{
  const refs=collectEvidenceReferences("| Assunto | Arquivo | O que prova |\n| --- | --- | --- |\n| caso | `ops/a.json` | evidenceRef{artifactId: A, location: ops/b.json, hash: abc} |");
  assert(refs.has("ops/b.json"));
});

test("commit-pinned references are checked against the named Git object", async () => {
  const { historicalReferenceExists } = await import("../checkEvidenceIndex.js");
  const { execFileSync } = await import("node:child_process");
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(historicalReferenceExists(process.cwd(), `package.json@${head}`), true);
  assert.equal(historicalReferenceExists(process.cwd(), `missing-ci1-evidence.json@${head}`), false);
  assert.equal(historicalReferenceExists(process.cwd(), `package.json@${"0".repeat(40)}`), false);
  assert.equal(historicalReferenceExists(process.cwd(), "package.json"), undefined);
});
