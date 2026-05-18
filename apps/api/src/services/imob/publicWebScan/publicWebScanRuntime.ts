import { decideSourceAccess } from "../marketScan/sourceAccessPolicyGate";
import { extractManualPublicListings } from "./publicListingExtractor";
import { publicWebScanPolicy } from "./publicWebScanPolicy";
import type { PublicWebManualListingInput, PublicWebScanResult } from "./publicWebScanTypes";

export function runPublicWebScanMockManual(params: {
  tenantId: string;
  workspaceId: string;
  listings: PublicWebManualListingInput[];
  requestedPages?: number;
}) {
  const decision = decideSourceAccess({
    sourceId: "public_web_assisted",
    requestedMode: "public_web_assisted",
    operation: "public_web_assisted_scan",
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    requestedPages: params.requestedPages ?? 1,
    requestedResultsPerSource: params.listings.length,
    collectsPii: false,
    bulkCollection: false,
  });

  if (!decision.allowed) {
    return {
      allowed: false as const,
      decision,
      result: null,
    };
  }

  const result: PublicWebScanResult = {
    mode: "mock_manual",
    confidenceCap: publicWebScanPolicy.confidenceCap,
    disclosure: {
      coverage: "limited_public_web_sample",
      limitations: [...publicWebScanPolicy.limitations],
    },
    listings: extractManualPublicListings(params.listings),
    piiExcluded: true,
  };

  return {
    allowed: true as const,
    decision,
    result,
  };
}
