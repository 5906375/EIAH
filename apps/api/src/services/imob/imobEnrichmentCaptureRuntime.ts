import { createHash, randomUUID } from "node:crypto";

import {
  buildImobAsyncJobMetrics,
  completeImobAsyncJob,
  createImobAsyncJobState,
  dequeueImobAsyncJob,
  enqueueImobAsyncJob,
  type ImobAsyncJobState,
} from "./imobAsyncJobRuntime";
import { resolveImobCapabilityGate } from "./imobCapabilityGate";

export type ImobEnrichmentCaptureCapabilityId =
  | "lead.enrichment_public"
  | "active_capture.scouting";

export type ImobLeadEnrichmentRequest = {
  capabilityId: "lead.enrichment_public";
  leadId: string;
  source: string;
  sourceTimestamp: string;
  confidence: number;
  consentBasis: string;
  piiMasking: "masked" | "minimized" | "full_authorized";
  reconciliationStatus: "pending" | "matched" | "conflict";
  payload?: Record<string, unknown> | null;
  consentProvided?: boolean;
  humanApprovalGranted?: boolean;
  evidenceRefsCount?: number;
  policyAccepted?: boolean;
  idempotencyKey?: string | null;
  now?: string | null;
};

export type ImobScoutingOpportunityRequest = {
  capabilityId: "active_capture.scouting";
  sourceUrl: string;
  sourceId: string;
  address?: string | null;
  ownerName?: string | null;
  ownerPhone?: string | null;
  propertyType?: string | null;
  askingPriceCents?: number | null;
  payload?: Record<string, unknown> | null;
  evidenceRefsCount?: number;
  policyAccepted?: boolean;
  now?: string | null;
};

export type ImobEnrichmentRecord = {
  enrichmentId: string;
  capabilityId: "lead.enrichment_public";
  leadId: string;
  source: string;
  sourceTimestamp: string;
  confidence: number;
  consentBasis: string;
  piiMasking: "masked" | "minimized" | "full_authorized";
  reconciliationStatus: "pending" | "matched" | "conflict";
  payload: Record<string, unknown> | null;
  trackingId: string;
  jobId: string;
  status: "queued" | "completed";
  sandbox: true;
  generatedAt: string;
  result?: Record<string, unknown> | null;
};

export type ImobScoutingOpportunityRecord = {
  scoutingId: string;
  capabilityId: "active_capture.scouting";
  sourceUrl: string;
  sourceId: string;
  address: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  propertyType: string | null;
  askingPriceCents: number | null;
  dedupeKey: string;
  dedupeApplied: boolean;
  rankingScore: number;
  sandbox: true;
  generatedAt: string;
  payload: Record<string, unknown> | null;
};

export type ImobEnrichmentCaptureState = {
  enrichmentJobs: ImobAsyncJobState;
  enrichments: ImobEnrichmentRecord[];
  scouting: ImobScoutingOpportunityRecord[];
};

export function createImobEnrichmentCaptureState() {
  return {
    enrichmentJobs: createImobAsyncJobState(),
    enrichments: [],
    scouting: [],
  } satisfies ImobEnrichmentCaptureState;
}

function buildTrackingId(jobId: string) {
  return `tracking-${jobId}`;
}

function normalizeLooseText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function buildEvidencePack(params: {
  capabilityId: ImobEnrichmentCaptureCapabilityId;
  generatedAt: string;
  sourceRef: string;
  trackingId?: string | null;
}) {
  return {
    capabilityId: params.capabilityId,
    sourceRef: params.sourceRef,
    trackingId: params.trackingId ?? null,
    sandbox: true as const,
    generatedAt: params.generatedAt,
  };
}

function buildScoutingDedupeKey(request: ImobScoutingOpportunityRequest) {
  const address = normalizeLooseText(request.address);
  const ownerName = normalizeLooseText(request.ownerName);
  const ownerPhone = normalizeLooseText(request.ownerPhone);
  const hash = createHash("sha256");
  hash.update(`${address}|${ownerName}|${ownerPhone}`);
  return hash.digest("hex");
}

function buildScoutingRankingScore(request: ImobScoutingOpportunityRequest) {
  let score = 20;
  if (normalizeLooseText(request.address)) score += 25;
  if (normalizeLooseText(request.ownerPhone)) score += 20;
  if (normalizeLooseText(request.ownerName)) score += 15;
  if (normalizeLooseText(request.propertyType)) score += 10;
  if (typeof request.askingPriceCents === "number" && request.askingPriceCents > 0) score += 10;
  return Math.min(score, 100);
}

export function queueImobLeadEnrichment(params: {
  state: ImobEnrichmentCaptureState;
  request: ImobLeadEnrichmentRequest;
}) {
  const gate = resolveImobCapabilityGate({
    capabilityId: params.request.capabilityId,
    consentProvided: params.request.consentProvided,
    humanApprovalGranted: params.request.humanApprovalGranted,
    evidenceRefsCount: params.request.evidenceRefsCount,
    policyAccepted: params.request.policyAccepted,
  });

  if (!gate.allowed || !gate.capability) {
    return {
      status: "blocked" as const,
      gate,
    };
  }

  const queued = enqueueImobAsyncJob({
    state: params.state.enrichmentJobs,
    capabilityId: params.request.capabilityId,
    payload: {
      leadId: params.request.leadId,
      source: params.request.source,
      sourceTimestamp: params.request.sourceTimestamp,
      confidence: params.request.confidence,
      consentBasis: params.request.consentBasis,
      piiMasking: params.request.piiMasking,
      reconciliationStatus: params.request.reconciliationStatus,
      payload: params.request.payload ?? null,
    },
    idempotencyKey: params.request.idempotencyKey ?? null,
    now: params.request.now ?? null,
  });

  const generatedAt = params.request.now ?? new Date().toISOString();
  const trackingId = buildTrackingId(queued.job.jobId);
  const existing = params.state.enrichments.find((item) => item.jobId === queued.job.jobId);
  if (!existing) {
    params.state.enrichments.push({
      enrichmentId: `enrichment-${randomUUID()}`,
      capabilityId: "lead.enrichment_public",
      leadId: params.request.leadId,
      source: params.request.source,
      sourceTimestamp: params.request.sourceTimestamp,
      confidence: params.request.confidence,
      consentBasis: params.request.consentBasis,
      piiMasking: params.request.piiMasking,
      reconciliationStatus: params.request.reconciliationStatus,
      payload: params.request.payload ?? null,
      trackingId,
      jobId: queued.job.jobId,
      status: "queued",
      sandbox: true,
      generatedAt,
      result: null,
    });
  }

  return {
    status: "queued" as const,
    duplicate: queued.duplicate,
    capability: gate.capability,
    job: queued.job,
    trackingId,
    evidencePack: buildEvidencePack({
      capabilityId: "lead.enrichment_public",
      generatedAt,
      sourceRef: `${params.request.source}@${params.request.sourceTimestamp}`,
      trackingId,
    }),
  };
}

export function processNextImobLeadEnrichment(params: {
  state: ImobEnrichmentCaptureState;
  now?: string | null;
}) {
  const now = params.now ?? new Date().toISOString();
  const job = dequeueImobAsyncJob({
    state: params.state.enrichmentJobs,
    now,
  });
  if (!job || job.capabilityId !== "lead.enrichment_public") return null;

  const completed = completeImobAsyncJob({
    state: params.state.enrichmentJobs,
    jobId: job.jobId,
    now,
  });
  const record = params.state.enrichments.find((item) => item.jobId === job.jobId);
  const result = {
    provider: "public_source_shadow",
    reconciliationStatus: String((job.payload as Record<string, unknown> | null)?.reconciliationStatus ?? "pending"),
    source: String((job.payload as Record<string, unknown> | null)?.source ?? "unknown"),
    leadId: String((job.payload as Record<string, unknown> | null)?.leadId ?? ""),
    completedAt: now,
  };

  if (record) {
    record.status = "completed";
    record.result = result;
  }

  return {
    status: "completed" as const,
    job: completed ?? job,
    trackingId: buildTrackingId(job.jobId),
    result,
    evidencePack: buildEvidencePack({
      capabilityId: "lead.enrichment_public",
      generatedAt: now,
      sourceRef: `${String((job.payload as Record<string, unknown> | null)?.source ?? "unknown")}@${String((job.payload as Record<string, unknown> | null)?.sourceTimestamp ?? now)}`,
      trackingId: buildTrackingId(job.jobId),
    }),
  };
}

export function ingestImobScoutingOpportunity(params: {
  state: ImobEnrichmentCaptureState;
  request: ImobScoutingOpportunityRequest;
}) {
  const gate = resolveImobCapabilityGate({
    capabilityId: params.request.capabilityId,
    evidenceRefsCount: params.request.evidenceRefsCount,
    policyAccepted: params.request.policyAccepted,
  });

  if (!gate.allowed || !gate.capability) {
    return {
      status: "blocked" as const,
      gate,
    };
  }

  const dedupeKey = buildScoutingDedupeKey(params.request);
  const duplicate = params.state.scouting.find((item) => item.dedupeKey === dedupeKey) ?? null;
  const generatedAt = params.request.now ?? new Date().toISOString();

  if (duplicate) {
    return {
      status: "duplicate" as const,
      duplicateOf: duplicate.scoutingId,
      dedupeKey,
      evidencePack: buildEvidencePack({
        capabilityId: "active_capture.scouting",
        generatedAt,
        sourceRef: `${params.request.sourceUrl}#${params.request.sourceId}`,
      }),
    };
  }

  const record = {
    scoutingId: `scouting-${randomUUID()}`,
    capabilityId: "active_capture.scouting",
    sourceUrl: params.request.sourceUrl,
    sourceId: params.request.sourceId,
    address: params.request.address ?? null,
    ownerName: params.request.ownerName ?? null,
    ownerPhone: params.request.ownerPhone ?? null,
    propertyType: params.request.propertyType ?? null,
    askingPriceCents: params.request.askingPriceCents ?? null,
    dedupeKey,
    dedupeApplied: true,
    rankingScore: buildScoutingRankingScore(params.request),
    sandbox: true,
    generatedAt,
    payload: params.request.payload ?? null,
  } satisfies ImobScoutingOpportunityRecord;
  params.state.scouting.push(record);

  return {
    status: "ingested" as const,
    opportunity: record,
    evidencePack: buildEvidencePack({
      capabilityId: "active_capture.scouting",
      generatedAt,
      sourceRef: `${params.request.sourceUrl}#${params.request.sourceId}`,
    }),
  };
}

export function getImobEnrichmentCaptureMetrics(state: ImobEnrichmentCaptureState) {
  return {
    enrichmentQueue: buildImobAsyncJobMetrics(state.enrichmentJobs),
    enrichmentTotal: state.enrichments.length,
    enrichmentCompleted: state.enrichments.filter((item) => item.status === "completed").length,
    scoutingTotal: state.scouting.length,
    scoutingAverageRanking: state.scouting.length === 0
      ? 0
      : Math.round(state.scouting.reduce((sum, item) => sum + item.rankingScore, 0) / state.scouting.length),
  };
}
