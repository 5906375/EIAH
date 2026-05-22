import type { ImobMarketScanResultSnapshot, ImobMarketScanRunSnapshot, ImobOperationalOpportunity } from "../imobConversationContract";

export type MarketScanPolicyJudgeDecision =
  | {
      allowed: true;
      reasonCode: "MARKET_SCAN_POLICY_OK";
    }
  | {
      allowed: false;
      reasonCode:
        | "MARKET_SCAN_EVIDENCE_REQUIRED"
        | "MARKET_SCAN_PII_BLOCKED"
        | "MARKET_SCAN_LISTING_NOT_IN_RUN"
        | "MARKET_SCAN_INTERNAL_ID_LEAK"
        | "MARKET_SCAN_HUMAN_APPROVAL_REQUIRED";
      message: string;
    };

const PII_KEYS = new Set(["phone", "email", "whatsapp", "ownerName", "document"]);
const INTERNAL_ID_PATTERN = /\b(?:cmp[a-z0-9]{8,}|prop-[a-z0-9:_-]+|public_[a-f0-9]{8,}|scanId|sourceId|sourceUrlHash|dedupeKey|clusterHash|evidenceBundleId)\b/i;

function hasPii(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasPii);
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) => PII_KEYS.has(key) && Boolean(nested) || hasPii(nested));
}

export function judgeMarketScanPolicy(params: {
  run: ImobMarketScanRunSnapshot;
  resultSnapshot?: ImobMarketScanResultSnapshot | null;
  opportunity?: ImobOperationalOpportunity | null;
  referencedSourceIds?: string[];
  visibleText?: string | null;
  visibleLines?: string[];
}): MarketScanPolicyJudgeDecision {
  if (!params.run.evidenceBundleId) {
    return {
      allowed: false,
      reasonCode: "MARKET_SCAN_EVIDENCE_REQUIRED",
      message: "Market scan recommendation requires evidenceBundleId.",
    };
  }

  if (hasPii(params.resultSnapshot) || hasPii(params.opportunity)) {
    return {
      allowed: false,
      reasonCode: "MARKET_SCAN_PII_BLOCKED",
      message: "Market scan response contains PII fields.",
    };
  }

  const visibleOutput = [params.visibleText ?? "", ...(params.visibleLines ?? [])].join("\n");
  if (INTERNAL_ID_PATTERN.test(visibleOutput)) {
    return {
      allowed: false,
      reasonCode: "MARKET_SCAN_INTERNAL_ID_LEAK",
      message: "Market scan visible response contains internal identifiers.",
    };
  }

  const availableSourceIds = new Set(params.resultSnapshot?.groups.flatMap((group) => group.items.map((item) => item.sourceId)) ?? []);
  const missingSourceId = params.referencedSourceIds?.find((sourceId) => !availableSourceIds.has(sourceId));
  if (missingSourceId) {
    return {
      allowed: false,
      reasonCode: "MARKET_SCAN_LISTING_NOT_IN_RUN",
      message: `Referenced listing ${missingSourceId} is not present in the MarketScanRun resultSnapshot.`,
    };
  }

  if (params.opportunity && params.opportunity.requiresHumanApproval !== true) {
    return {
      allowed: false,
      reasonCode: "MARKET_SCAN_HUMAN_APPROVAL_REQUIRED",
      message: "Operational opportunity must require human approval.",
    };
  }

  return {
    allowed: true,
    reasonCode: "MARKET_SCAN_POLICY_OK",
  };
}
