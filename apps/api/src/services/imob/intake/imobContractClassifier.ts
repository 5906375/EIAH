// Classifies a lease contract based on extracted fields.
// Pure function — no I/O, no LLM, no external deps.
// canonicalJourneyType uses only existing values from imobCanonical.ts.

import type { ImobExtractedLease } from "./imobLeaseExtractor";

export type ImobContractClassification = {
  documentType: "lease_contract" | "unknown";
  contractType: "residential_lease" | "commercial_lease" | "seasonal_lease" | "unknown";
  canonicalJourneyType: "documentation";
  suggestedActionId: "imob.contract.intake";
  requiresConfirmation: true;
};

const RESIDENTIAL_KEYWORDS = /residencial|moradia|habitac[aã]o|fins\s+residenciais/i;
const COMMERCIAL_KEYWORDS = /comercial|empresarial|fins\s+comerciais|uso\s+comercial/i;
const SEASONAL_KEYWORDS = /temporada|season|por\s+per[ií]odo|short.?term/i;

function classifyContractType(
  lease: ImobExtractedLease,
  rawText: string
): ImobContractClassification["contractType"] {
  const combined = `${lease.contractPurpose ?? ""} ${rawText}`;
  if (SEASONAL_KEYWORDS.test(combined)) return "seasonal_lease";
  if (COMMERCIAL_KEYWORDS.test(combined)) return "commercial_lease";
  if (RESIDENTIAL_KEYWORDS.test(combined)) return "residential_lease";
  return "unknown";
}

export function classifyImobContract(
  lease: ImobExtractedLease,
  rawText: string
): ImobContractClassification {
  const hasLeaseIndicators =
    lease.monthlyRentCents !== null ||
    /locat[aá]rio|locador|aluguel|loca[çc][aã]o/i.test(rawText);

  const documentType: ImobContractClassification["documentType"] = hasLeaseIndicators
    ? "lease_contract"
    : "unknown";

  const contractType = classifyContractType(lease, rawText);

  return {
    documentType,
    contractType,
    canonicalJourneyType: "documentation",
    suggestedActionId: "imob.contract.intake",
    requiresConfirmation: true,
  };
}
