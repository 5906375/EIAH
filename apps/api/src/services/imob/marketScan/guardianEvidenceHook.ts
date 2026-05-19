import { createHash } from "node:crypto";
import type { ImobMarketScanResultSnapshot, ImobOperationalOpportunity } from "../imobConversationContract";

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj).sort().map((key) => `${JSON.stringify(key)}:${stableJson(obj[key])}`).join(",")}}`;
}

export function sha256MarketScanEvidence(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export type MarketScanGuardianEvidenceBundle = {
  evidenceBundleId: string;
  queryHash: string;
  sourceSnapshotHash: string;
  normalizedListingsHash: string;
  recommendationHash: string;
  createdAt: string;
};

export function createMarketScanGuardianEvidence(params: {
  runId: string;
  queryHash: string;
  sourceSnapshot: unknown;
  normalizedListings: ImobMarketScanResultSnapshot | null;
  recommendation: ImobOperationalOpportunity | null;
  createdAt?: Date;
}): MarketScanGuardianEvidenceBundle {
  const sourceSnapshotHash = sha256MarketScanEvidence(params.sourceSnapshot ?? null);
  const normalizedListingsHash = sha256MarketScanEvidence(params.normalizedListings ?? null);
  const recommendationHash = sha256MarketScanEvidence(params.recommendation ?? null);
  const evidenceBundleId = `mse_${sha256MarketScanEvidence({
    runId: params.runId,
    queryHash: params.queryHash,
    sourceSnapshotHash,
    normalizedListingsHash,
    recommendationHash,
  }).slice(0, 24)}`;

  return {
    evidenceBundleId,
    queryHash: params.queryHash,
    sourceSnapshotHash,
    normalizedListingsHash,
    recommendationHash,
    createdAt: (params.createdAt ?? new Date()).toISOString(),
  };
}
