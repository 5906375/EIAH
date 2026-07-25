import assert from "node:assert/strict";
import test from "node:test";

import { findVolatileEvidenceRefs } from "../checkEvidenceIndex.js";

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
