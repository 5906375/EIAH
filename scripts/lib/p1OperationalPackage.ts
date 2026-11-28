/**
 * Operational package wrapper for the local P1 `ape.weekly-cycle.v3`
 * checker (Entrega 2 of M1, ADR-009 §14). Proposes a versioned, minimal
 * envelope around the cycles already handled by p1CycleSelection.ts, adding:
 *
 *   - a manifest (scope, packaging timestamp, code/execution provenance);
 *   - OPTIONAL legacy source metadata or versioned identity projections;
 *   - retention/read-failure handling for transport.
 *
 * No Prisma, storage-provider or network import here — same discipline as
 * p1CycleSelection.ts, and for the same reason: this must remain callable
 * from a context with no live service access.
 *
 * Central discipline (do not weaken this file without updating the
 * docblocks that explain it): a manifest or a hash never authenticates its
 * own origin, and an included source snapshot can enable recomputation but
 * never proves completeness of that snapshot. This module is built to make
 * both limits impossible to silently paper over — see
 * `describePackageGuarantees()`.
 */

import { describeSourceMaterial, validateSourceMaterial, validateSnapshotMetadata, SOURCE_MATERIAL_VERSION, type SourceMaterial, type SourceDiagnostic } from "./p1SourceMaterial.js";
import type { LoadedCycle } from "./p1CycleSelection.js";

export const OPERATIONAL_PACKAGE_SCHEMA_VERSION = "p1-ape-weekly-cycle-v3-operational-package.v1";

export type TransportMechanism = "manual_local_file" | "ci_artifact" | "object_storage";

/**
 * Self-declared code/execution provenance. Distinguishes what is actually
 * demonstrable from what merely sounds like it is:
 *   - `repoCommitSha` identifies the repository's HEAD at execution time —
 *     it does NOT prove the executed script's content when `trackedInGit`
 *     is false (an untracked script is invisible to `commitSha`).
 *   - `scriptContentHash`, when present, identifies the exact bytes of the
 *     script that ran — but a hash alone does not prove WHEN it ran or that
 *     it really executed; it only proves that two byte-strings are equal
 *     (see ADR-009 §14.7's correction of the earlier, overstated claim).
 */
export type CodeProvenance = Readonly<{
  scriptPath: string;
  trackedInGit: boolean;
  repoCommitSha: string | null;
  scriptContentHash: string | null;
}>;

export type PackageManifest = Readonly<{
  schemaVersion: typeof OPERATIONAL_PACKAGE_SCHEMA_VERSION;
  /** When this package was assembled for transport — distinct from any individual cycle's own `generatedAt`. */
  packagedAt: string;
  scope: Readonly<{ tenantId: string; workspaceId: string; domain: string }>;
  codeProvenance: CodeProvenance;
  transport: Readonly<{ mechanism: TransportMechanism; retrievedAt: string | null }>;
  /** Self-declared, optional. When present and in the past relative to a read instant, the package is reported (not silently dropped) as retention-expired. */
  retentionExpiresAt?: string | null;
}>;

/** Legacy metadata only: no source rows or metric execution are represented here. */
export type SourceSnapshotInput = Readonly<{
  description: string;
  sourceQueryDescription: string;
  capturedAt: string;
  rowCount: number;
}>;

export type OperationalPackage = Readonly<{
  manifest: PackageManifest;
  cycles: readonly LoadedCycle[];
  sourceSnapshot?: SourceSnapshotInput | null;
  /** Versioned local projection. Cannot coexist with legacy sourceSnapshot. */
  sourceMaterial?: SourceMaterial | null;
}>;

export class OperationalPackageError extends Error {}

const TRANSPORT_MECHANISMS: readonly TransportMechanism[] = ["manual_local_file", "ci_artifact", "object_storage"];

export function validatePackageManifest(raw: unknown): PackageManifest {
  if (typeof raw !== "object" || raw === null) throw new OperationalPackageError("manifest must be an object");
  const m = raw as Record<string, unknown>;
  if (m.schemaVersion !== OPERATIONAL_PACKAGE_SCHEMA_VERSION) {
    throw new OperationalPackageError(`manifest.schemaVersion must be "${OPERATIONAL_PACKAGE_SCHEMA_VERSION}", got: ${String(m.schemaVersion)}`);
  }
  if (typeof m.packagedAt !== "string" || Number.isNaN(Date.parse(m.packagedAt))) {
    throw new OperationalPackageError("manifest.packagedAt is required and must be a valid ISO timestamp");
  }
  const scope = m.scope as Record<string, unknown> | undefined;
  if (!scope || typeof scope.tenantId !== "string" || typeof scope.workspaceId !== "string" || typeof scope.domain !== "string") {
    throw new OperationalPackageError("manifest.scope.{tenantId,workspaceId,domain} are required strings");
  }
  const cp = m.codeProvenance as Record<string, unknown> | undefined;
  if (!cp || typeof cp.scriptPath !== "string" || typeof cp.trackedInGit !== "boolean") {
    throw new OperationalPackageError("manifest.codeProvenance.{scriptPath,trackedInGit} are required");
  }
  const repoCommitSha = typeof cp.repoCommitSha === "string" ? cp.repoCommitSha : null;
  const scriptContentHash = typeof cp.scriptContentHash === "string" ? cp.scriptContentHash : null;
  // Self-consistency, not authentication: an untracked script cannot claim
  // its content is identified by the repo commit alone (see docblock).
  if (!cp.trackedInGit && repoCommitSha && !scriptContentHash) {
    throw new OperationalPackageError(
      "manifest.codeProvenance: trackedInGit=false with only repoCommitSha and no scriptContentHash overstates provenance — repoCommitSha alone does not identify an untracked script's content",
    );
  }
  const transport = m.transport as Record<string, unknown> | undefined;
  if (!transport || typeof transport.mechanism !== "string" || !TRANSPORT_MECHANISMS.includes(transport.mechanism as TransportMechanism)) {
    throw new OperationalPackageError(`manifest.transport.mechanism is required and must be one of ${TRANSPORT_MECHANISMS.join("|")}`);
  }
  const retrievedAt = typeof transport.retrievedAt === "string" ? transport.retrievedAt : null;
  const retentionExpiresAt = typeof m.retentionExpiresAt === "string" ? m.retentionExpiresAt : null;

  return {
    schemaVersion: OPERATIONAL_PACKAGE_SCHEMA_VERSION,
    packagedAt: m.packagedAt,
    scope: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, domain: scope.domain },
    codeProvenance: { scriptPath: cp.scriptPath, trackedInGit: cp.trackedInGit, repoCommitSha, scriptContentHash },
    transport: { mechanism: transport.mechanism as TransportMechanism, retrievedAt },
    retentionExpiresAt,
  };
}

export type RetentionCheck = Readonly<{ status: "within_retention" | "expired" | "not_declared"; retentionExpiresAt: string | null }>;

export function checkRetention(manifest: PackageManifest, readNow: Date): RetentionCheck {
  if (!manifest.retentionExpiresAt) return { status: "not_declared", retentionExpiresAt: null };
  const expiresMs = Date.parse(manifest.retentionExpiresAt);
  if (Number.isNaN(expiresMs)) return { status: "not_declared", retentionExpiresAt: manifest.retentionExpiresAt };
  return {
    status: readNow.getTime() > expiresMs ? "expired" : "within_retention",
    retentionExpiresAt: manifest.retentionExpiresAt,
  };
}

/** Output v2 is a breaking diagnostic change; the persisted manifest remains readable v1. */
export type PackageGuarantees = SourceDiagnostic;

export function describePackageGuarantees(pkg: OperationalPackage): PackageGuarantees {
  const manifest = validatePackageManifest(pkg.manifest);
  if (pkg.sourceSnapshot != null && pkg.sourceMaterial != null) {
    throw new OperationalPackageError("ambiguous source material: legacy and versioned inputs coexist");
  }
  const material = pkg.sourceMaterial != null ? validateSourceMaterial(pkg.sourceMaterial)
    : pkg.sourceSnapshot != null ? {
      schemaVersion: SOURCE_MATERIAL_VERSION, kind: "metadata_only" as const,
      metadata: validateSnapshotMetadata(pkg.sourceSnapshot),
    } : null;
  if (material) {
    const observedAt = material.kind === "metadata_only" ? material.metadata.capturedAt : material.generatedAt;
    if (Date.parse(observedAt) > Date.parse(manifest.packagedAt)) {
      throw new OperationalPackageError("source material postdates package");
    }
    if (material.kind === "rows_included" &&
      (material.scope.tenantId !== manifest.scope.tenantId || material.scope.workspaceId !== manifest.scope.workspaceId || material.scope.domain !== manifest.scope.domain)) {
      throw new OperationalPackageError("source material scope mismatch");
    }
  }
  return describeSourceMaterial(material);
}
