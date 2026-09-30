import assert from "node:assert/strict";
import test from "node:test";
import {
  SOURCE_MATERIAL_VERSION, SOURCE_DIAGNOSTIC_VERSION, SourceMaterialError,
  sourceContentDigest, validateSourceMaterial, validateSourceDiagnostic, describeSourceMaterial,
} from "../lib/p1SourceMaterial.js";
import { describePackageGuarantees, validatePackageManifest, OPERATIONAL_PACKAGE_SCHEMA_VERSION } from "../lib/p1OperationalPackage.js";

function seal<T extends Record<string, unknown>>(value: T): T & { digest: string } {
  return { ...value, digest: sourceContentDigest(value) };
}
function fixture() {
  const run = seal({ id: "run-synthetic", createdAt: "2026-09-20T12:00:00Z", finishedAt: null as string | null });
  const fact = seal({ id: "fact-synthetic", kind: "usage", createdAt: "2026-09-25T12:00:00Z",
    link: { status: "linked", runId: run.id, runDigest: run.digest } });
  return seal({ schemaVersion: SOURCE_MATERIAL_VERSION, kind: "rows_included",
    scope: { tenantId: "tenant-synthetic", workspaceId: "workspace-synthetic", domain: "billing" },
    window: { from: "2026-09-14T00:00:00Z", to: "2026-09-21T00:00:00Z" },
    cutoffAt: "2026-09-28T00:00:00Z", generatedAt: "2026-09-28T00:00:00Z",
    runs: [run], facts: [fact], counts: { runs: 1, facts: 1, unresolvedLinks: 0 },
    semantics: { operationMapping: "unresolved", duplicateKey: "unresolved", denominators: "unresolved" } });
}
function manifest() {
  return validatePackageManifest({ schemaVersion: OPERATIONAL_PACKAGE_SCHEMA_VERSION,
    packagedAt: "2026-09-28T01:00:00Z", scope: fixture().scope,
    codeProvenance: { scriptPath: "synthetic.ts", trackedInGit: false, repoCommitSha: null, scriptContentHash: null },
    transport: { mechanism: "manual_local_file", retrievedAt: null } });
}

test("identity projections validate without claiming metrics, mapping or completeness", () => {
  const raw = fixture(); const before = JSON.stringify(raw);
  const material = validateSourceMaterial(raw);
  const diagnostic = describePackageGuarantees({ manifest: manifest(), cycles: [], sourceMaterial: material });
  assert.deepEqual(validateSourceDiagnostic(diagnostic), diagnostic);
  assert.equal(diagnostic.schemaVersion, SOURCE_DIAGNOSTIC_VERSION);
  assert.equal(diagnostic.sourceMaterial, "rows_included");
  assert.equal(diagnostic.recomputation.status, "not_run");
  assert.equal(diagnostic.independentSourceVerification.status, "not_demonstrated");
  assert.equal(diagnostic.completenessAndAuthenticityOfInputs.status, "not_demonstrated");
  assert.equal(JSON.stringify(raw), before);
});

test("legacy bytes preserved, metadata never upgraded even with package-level claims", () => {
  const bytes = JSON.stringify({ manifest: manifest(), cycles: [],
    sourceSnapshot: { description: "synthetic metadata", sourceQueryDescription: "not executed", capturedAt: "2026-09-28T00:00:00Z", rowCount: 99 },
    recomputation: { status: "passed" }, independentSourceVerification: { status: "passed" } });
  const input = JSON.parse(bytes); Object.freeze(input.sourceSnapshot); Object.freeze(input);
  const d = describePackageGuarantees(input);
  assert.equal(d.sourceMaterial, "metadata_only"); assert.equal(d.recomputation.status, "not_run");
  assert.equal(d.independentSourceVerification.status, "not_demonstrated"); assert.equal(JSON.stringify(input), bytes);
});

test("versioned metadata and absent input have explicit statuses", () => {
  assert.equal(describeSourceMaterial().sourceMaterial, "absent");
  const d = describeSourceMaterial({ schemaVersion: SOURCE_MATERIAL_VERSION, kind: "metadata_only",
    metadata: { description: "synthetic", sourceQueryDescription: "not executed", capturedAt: "2026-09-28T00:00:00Z", rowCount: 1 } });
  assert.equal(d.sourceMaterial, "metadata_only"); assert.deepEqual(validateSourceDiagnostic(d), d);
});

const invalid: ReadonlyArray<readonly [string, (raw: ReturnType<typeof fixture>) => unknown]> = [
  ["unknown version", r => ({ ...r, schemaVersion: "unknown" })],
  ["missing structure", () => ({ schemaVersion: SOURCE_MATERIAL_VERSION, kind: "rows_included" })],
  ["duplicate run identity even with new envelope hash", r => seal({ ...r, runs: [r.runs[0], r.runs[0]], counts: { ...r.counts, runs: 2 } })],
  ["duplicate fact identity", r => seal({ ...r, facts: [r.facts[0], r.facts[0]], counts: { ...r.counts, facts: 2 } })],
  ["dangling reference", r => seal({ ...r, facts: [seal({ ...r.facts[0], link: { ...r.facts[0].link, runId: "missing" } })] })],
  ["wrong referenced digest", r => seal({ ...r, facts: [seal({ ...r.facts[0], link: { ...r.facts[0].link, runDigest: "0".repeat(64) } })] })],
  ["forged row digest", r => seal({ ...r, runs: [{ ...r.runs[0], digest: "0".repeat(64) }] })],
  ["forged envelope digest", r => ({ ...r, digest: "0".repeat(64) })],
  ["derived count mismatch", r => seal({ ...r, counts: { ...r.counts, facts: 5 } })],
  ["unsafe count", r => seal({ ...r, counts: { ...r.counts, runs: Number.MAX_SAFE_INTEGER + 1 } })],
  ["calendar rollover", r => seal({ ...r, cutoffAt: "2026-02-30T00:00:00Z" })],
  ["non-UTC timestamp", r => seal({ ...r, generatedAt: "2026-09-28T00:00:00-03:00" })],
  ["cutoff after generation", r => seal({ ...r, cutoffAt: "2026-09-29T00:00:00Z" })],
  ["run at excluded upper boundary", r => seal({ ...r, runs: [seal({ ...r.runs[0], createdAt: r.window.to })] })],
  ["finish after cutoff", r => seal({ ...r, runs: [seal({ ...r.runs[0], finishedAt: "2026-09-29T00:00:00Z" })] })],
  ["fact after cutoff", r => seal({ ...r, facts: [seal({ ...r.facts[0], createdAt: "2026-09-29T00:00:00Z" })] })],
  ["approved billing semantics invented", r => seal({ ...r, semantics: { ...r.semantics, denominators: "approved" } })],
  ["successful recomputation claim", r => seal({ ...r, recomputation: { status: "passed" } })],
];
for (const [name, mutate] of invalid) test(`rejects ${name}`, () => {
  assert.throws(() => validateSourceMaterial(mutate(fixture())), SourceMaterialError);
});

test("unresolved orphan retained explicitly, counts derived, no completeness upgrade", () => {
  const r = fixture();
  const raw = seal({ ...r, facts: [seal({ ...r.facts[0], link: { status: "unresolved", runId: null, reason: "missing_reference" } })],
    counts: { ...r.counts, unresolvedLinks: 1 } });
  assert.equal(describeSourceMaterial(raw).recomputation.status, "not_run");
  assert.throws(() => validateSourceMaterial(seal({ ...raw, counts: { ...raw.counts, unresolvedLinks: 0 } })), /counts mismatch/);
});

test("same source id in different fact tables is not semantic deduplication", () => {
  const r = fixture(); const second = seal({ ...r.facts[0], kind: "ledger" });
  assert.equal(describeSourceMaterial(seal({ ...r, facts: [...r.facts, second], counts: { ...r.counts, facts: 2 } })).sourceMaterial, "rows_included");
});

test("empty included projection is not an executed measurement", () => {
  const r = fixture();
  const d = describeSourceMaterial(seal({ ...r, runs: [], facts: [], counts: { runs: 0, facts: 0, unresolvedLinks: 0 } }));
  assert.equal(d.sourceMaterial, "rows_included"); assert.equal(d.recomputation.status, "not_run");
});

for (const status of ["passed", "failed", "recomputed_against_included_snapshot"]) test(`diagnostic rejects unverified execution ${status}`, () => {
  const d = describeSourceMaterial();
  assert.throws(() => validateSourceDiagnostic({ ...d, recomputation: { ...d.recomputation, status } }), /execution claims/);
});
test("diagnostic rejects unknown version and independent approval boolean", () => {
  const d = describeSourceMaterial();
  assert.throws(() => validateSourceDiagnostic({ ...d, schemaVersion: "v999" }), /version/);
  assert.throws(() => validateSourceDiagnostic({ ...d, independentSourceVerification: { status: "passed" } }), /not demonstrated/);
});

test("package rejects source scope/time mismatch and ambiguous legacy plus new material", () => {
  const material = validateSourceMaterial(fixture()); const m = manifest();
  assert.throws(() => describePackageGuarantees({ manifest: { ...m, scope: { ...m.scope, tenantId: "other" } }, cycles: [], sourceMaterial: material }), /scope mismatch/);
  assert.throws(() => describePackageGuarantees({ manifest: { ...m, packagedAt: "2026-09-27T00:00:00Z" }, cycles: [], sourceMaterial: material }), /postdates/);
  assert.throws(() => describePackageGuarantees({ manifest: m, cycles: [], sourceMaterial: material,
    sourceSnapshot: { description: "legacy", sourceQueryDescription: "none", rowCount: 1, capturedAt: m.packagedAt } }), /coexist/);
});

test("malformed legacy metadata is rejected rather than promoted", () => {
  assert.throws(() => describePackageGuarantees({ manifest: manifest(), cycles: [],
    sourceSnapshot: { description: "legacy", sourceQueryDescription: "none", capturedAt: "yesterday", rowCount: -1 } }), SourceMaterialError);
});

test("full package diagnostic cannot claim internal consistency or completeness", () => {
  const d = describePackageGuarantees({ manifest: manifest(), cycles: [] });
  assert.deepEqual(validateSourceDiagnostic(d), d);
  assert.throws(() => validateSourceDiagnostic({ ...d, completenessAndAuthenticityOfInputs: { status: "passed", reason: "self declared" } }), /not demonstrated/);
  assert.throws(() => validateSourceDiagnostic({ ...d, internalConsistency: { status: "passed", note: "self declared" } }), /not evaluated/);
});
