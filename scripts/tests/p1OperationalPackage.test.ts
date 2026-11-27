import assert from "node:assert/strict";
import test from "node:test";

import {
  validatePackageManifest,
  checkRetention,
  describePackageGuarantees,
  OperationalPackageError,
  OPERATIONAL_PACKAGE_SCHEMA_VERSION,
  type PackageManifest,
} from "../lib/p1OperationalPackage.js";

function validManifest(overrides: Partial<Record<string, unknown>> = {}): unknown {
  return {
    schemaVersion: OPERATIONAL_PACKAGE_SCHEMA_VERSION,
    packagedAt: "2026-10-12T12:00:00Z",
    scope: { tenantId: "tenant-x", workspaceId: "workspace-x", domain: "billing" },
    codeProvenance: { scriptPath: "apps/api/scripts/run_ape_weekly_cycle_v3_billing.ts", trackedInGit: true, repoCommitSha: "abc123", scriptContentHash: null },
    transport: { mechanism: "manual_local_file", retrievedAt: null },
    ...overrides,
  };
}

test("manifesto válido é aceito", () => {
  const m = validatePackageManifest(validManifest());
  assert.equal(m.schemaVersion, OPERATIONAL_PACKAGE_SCHEMA_VERSION);
  assert.equal(m.codeProvenance.trackedInGit, true);
});

test("schemaVersion ausente/errado falha", () => {
  assert.throws(() => validatePackageManifest(validManifest({ schemaVersion: "wrong" })), OperationalPackageError);
});

test("script untracked alegando proveniência só via repoCommitSha (sem hash do conteúdo) é rejeitado — correção da ADR-009 §14.7", () => {
  assert.throws(
    () =>
      validatePackageManifest(
        validManifest({
          codeProvenance: { scriptPath: "apps/api/scripts/run_ape_weekly_cycle_v3_billing.ts", trackedInGit: false, repoCommitSha: "abc123", scriptContentHash: null },
        }),
      ),
    OperationalPackageError,
    "repoCommitSha sozinho não identifica o conteúdo de um script untracked",
  );
});

test("script untracked com hash do conteúdo do script é aceito (proveniência mais fraca, mas não superestimada)", () => {
  const m = validatePackageManifest(
    validManifest({
      codeProvenance: { scriptPath: "apps/api/scripts/run_ape_weekly_cycle_v3_billing.ts", trackedInGit: false, repoCommitSha: "abc123", scriptContentHash: "af219c50..." },
    }),
  );
  assert.equal(m.codeProvenance.trackedInGit, false);
  assert.equal(m.codeProvenance.scriptContentHash, "af219c50...");
});

test("mecanismo de transporte inválido falha", () => {
  assert.throws(() => validatePackageManifest(validManifest({ transport: { mechanism: "carrier_pigeon", retrievedAt: null } })), OperationalPackageError);
});

// ---------------------------------------------------------------------------
// Retenção — nunca chamada de "imutável"; só um prazo autodeclarado, verificado.
// ---------------------------------------------------------------------------

test("retenção: sem retentionExpiresAt declarado -> not_declared", () => {
  const m = validatePackageManifest(validManifest());
  const check = checkRetention(m, new Date("2026-11-01T00:00:00Z"));
  assert.equal(check.status, "not_declared");
});

test("retenção: dentro do prazo declarado -> within_retention", () => {
  const m = validatePackageManifest(validManifest({ retentionExpiresAt: "2026-12-01T00:00:00Z" }));
  const check = checkRetention(m, new Date("2026-11-01T00:00:00Z"));
  assert.equal(check.status, "within_retention");
});

test("retenção: prazo declarado já vencido -> expired (reportado, não escondido)", () => {
  const m = validatePackageManifest(validManifest({ retentionExpiresAt: "2026-10-01T00:00:00Z" }));
  const check = checkRetention(m, new Date("2026-11-01T00:00:00Z"));
  assert.equal(check.status, "expired");
});

// ---------------------------------------------------------------------------
// As três garantias — completude/autenticidade nunca é promovida, nem com snapshot.
// ---------------------------------------------------------------------------

test("sem snapshot de origem: sourceMaterial=absent; recomputation=not_run; completude sempre not_demonstrated", () => {
  const manifest = validatePackageManifest(validManifest());
  const guarantees = describePackageGuarantees({ manifest, cycles: [] });
  assert.equal(guarantees.sourceMaterial, "absent");
  assert.equal(guarantees.completenessAndAuthenticityOfInputs.status, "not_demonstrated");
});

test("snapshot legado é metadata_only, nunca uma execução de recomputação", () => {
  const manifest = validatePackageManifest(validManifest());
  const guarantees = describePackageGuarantees({
    manifest,
    cycles: [],
    sourceSnapshot: { description: "Run rows for window", sourceQueryDescription: "SELECT * FROM Run WHERE ...", capturedAt: "2026-10-12T12:00:00Z", rowCount: 2 },
  });
  assert.equal(guarantees.sourceMaterial, "metadata_only");
  assert.equal(guarantees.schemaVersion, "p1-source-diagnostic.v2");
  assert.equal(guarantees.recomputation.status, "not_run");
  assert.equal(guarantees.independentSourceVerification.status, "not_demonstrated");
  // The critical assertion this module exists to enforce:
  assert.equal(
    guarantees.completenessAndAuthenticityOfInputs.status,
    "not_demonstrated",
    "a snapshot included in the package can enable recomputation, but never proves by itself that no row was omitted",
  );
});
