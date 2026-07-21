export const IMOB_CONFIDENCE_THRESHOLDS = {
  high: 80,
  medium: 50,
} as const;

export const IMOB_CONFIDENCE_WEIGHTS = {
  verticalEvidence: {
    explicit: 60,
    contextual: 35,
    absent: 0,
  },
  capabilityEvidence: {
    explicit: 30,
    contextual: 15,
    absent: 0,
  },
  competingIntentPenalty: 40,
} as const;

export type ImobConfidenceLevel = "high" | "medium" | "low";
export type ImobConfidenceEvidence = "explicit" | "contextual" | "absent";

export type ImobConfidenceSignals = {
  verticalEvidence: ImobConfidenceEvidence;
  capabilityEvidence: ImobConfidenceEvidence;
  competingIntent: boolean;
};

export type ImobConfidenceAssessment = {
  level: ImobConfidenceLevel;
  score: number;
  sideEffects: 0;
};

function evidenceWeight(
  evidence: ImobConfidenceEvidence,
  weights: Record<ImobConfidenceEvidence, number>,
): number {
  return weights[evidence] ?? 0;
}

function hasValidSignals(signals: ImobConfidenceSignals | null | undefined): signals is ImobConfidenceSignals {
  const evidenceValues: ImobConfidenceEvidence[] = ["explicit", "contextual", "absent"];
  return signals !== null &&
    signals !== undefined &&
    evidenceValues.includes(signals.verticalEvidence) &&
    evidenceValues.includes(signals.capabilityEvidence) &&
    typeof signals.competingIntent === "boolean";
}

export function classifyImobConfidenceScore(score: number): ImobConfidenceLevel {
  if (!Number.isFinite(score)) return "low";
  if (score >= IMOB_CONFIDENCE_THRESHOLDS.high) return "high";
  if (score >= IMOB_CONFIDENCE_THRESHOLDS.medium) return "medium";
  return "low";
}

export function scoreChatVerticalImobConfidence(input: {
  verticalId: string | null;
  capabilityId: string | null;
  signals: ImobConfidenceSignals | null | undefined;
}): ImobConfidenceAssessment {
  if (input.verticalId !== "imob" || !hasValidSignals(input.signals)) {
    return { level: "low", score: 0, sideEffects: 0 };
  }

  const verticalScore = evidenceWeight(
    input.signals.verticalEvidence,
    IMOB_CONFIDENCE_WEIGHTS.verticalEvidence,
  );
  const capabilityScore = input.capabilityId === "inventory.preview"
    ? evidenceWeight(input.signals.capabilityEvidence, IMOB_CONFIDENCE_WEIGHTS.capabilityEvidence)
    : 0;
  const ambiguityPenalty = input.signals.competingIntent
    ? IMOB_CONFIDENCE_WEIGHTS.competingIntentPenalty
    : 0;
  const score = Math.max(0, Math.min(100, verticalScore + capabilityScore - ambiguityPenalty));

  return {
    level: classifyImobConfidenceScore(score),
    score,
    sideEffects: 0,
  };
}
