import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const GO_LIVE_REQUIRED_ARTIFACTS = [
  "docs/adr/ADR-001-domain-runtime-stack.md",
  "ops/evidence/latest/domain-go-live/api-health-response.json",
  "ops/evidence/latest/domain-go-live/production-dns-tls-smoke.md",
  "ops/evidence/latest/domain-go-live/rollback-plan.md",
  "ops/evidence/latest/domain-go-live/tenant-policy-fail-closed-403.md",
] as const;

const GO_LIVE_ENVIRONMENT_SEGREGATION_ARTIFACTS = [
  "ops/evidence/latest/domain-go-live/dns-cloudflare-snapshot.md",
  "ops/evidence/latest/domain-go-live/staging-dns-tls-smoke.md",
  "ops/evidence/latest/domain-go-live/production-dns-tls-smoke.md",
] as const;

const GO_LIVE_EDGE_PROTECTION_ARTIFACTS = [
  "ops/evidence/latest/domain-go-live/production-dns-tls-smoke.md",
  "ops/evidence/2026-W09/base/waf-rate-limit-evidence.md",
  "ops/evidence/latest/domain-go-live/tenant-policy-fail-closed-403.md",
] as const;

export function resolveGuardianRepoRoot(cwd = process.cwd()) {
  const candidates = [
    cwd,
    path.resolve(cwd, ".."),
    path.resolve(cwd, "../.."),
    path.resolve(cwd, "../../.."),
  ];

  for (const candidate of candidates) {
    const marker = path.join(candidate, "docs", "EVIDENCE_INDEX.md");
    if (existsSync(marker)) {
      return candidate;
    }
  }

  return path.resolve(cwd, "../..");
}

export function getGuardianGoLiveArtifactPaths(root = resolveGuardianRepoRoot()) {
  return GO_LIVE_REQUIRED_ARTIFACTS.map((relativePath) => ({
    relativePath,
    absolutePath: path.join(root, relativePath),
  }));
}

export function getGuardianEnvironmentSegregationArtifactPaths(root = resolveGuardianRepoRoot()) {
  return GO_LIVE_ENVIRONMENT_SEGREGATION_ARTIFACTS.map((relativePath) => ({
    relativePath,
    absolutePath: path.join(root, relativePath),
  }));
}

export function getGuardianEdgeProtectionArtifactPaths(root = resolveGuardianRepoRoot()) {
  return GO_LIVE_EDGE_PROTECTION_ARTIFACTS.map((relativePath) => ({
    relativePath,
    absolutePath: path.join(root, relativePath),
  }));
}

export async function readGuardianFileIfExists(filePath: string) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function guardianPathExists(filePath: string) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
