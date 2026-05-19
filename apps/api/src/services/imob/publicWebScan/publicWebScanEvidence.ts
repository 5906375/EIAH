import { sha256MarketScanEvidence } from "../marketScan/guardianEvidenceHook";
import type { PublicWebScanResult } from "./publicWebScanTypes";

export function createPublicWebScanEvidence(result: PublicWebScanResult) {
  return {
    resultHash: sha256MarketScanEvidence(result),
    piiExcluded: result.piiExcluded,
    confidenceCap: result.confidenceCap,
    listingCount: result.listings.length,
  };
}
