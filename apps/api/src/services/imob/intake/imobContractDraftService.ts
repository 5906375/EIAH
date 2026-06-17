// In-memory draft store for IMOB contract intake.
// Drafts expire after DRAFT_TTL_MS (30 min).
// Cleanup interval purges expired entries automatically.
// No ImobCase mutation happens before confirm — drafts are ephemeral.

import { randomUUID } from "node:crypto";
import type { ImobExtractedLease } from "./imobLeaseExtractor";
import type { ImobContractClassification } from "./imobContractClassifier";

export const DRAFT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;  // check every 5 minutes

export type ImobContractIntakeEvidenceDraft = {
  documentHash: string;
  documentKind: "lease_contract" | "identity_document" | "other";
  storageRef?: string;
  piiMasked: true;
};

export type ImobContractIntakeDraftOutput = {
  tenantId: string;
  workspaceId: string;
  source: "chat-imob";
  actionId: "imob.contract.intake";
  draftId: string;
  draftExpiresAt: string;
  extractedLease: ImobExtractedLease;
  classification: ImobContractClassification;
  evidenceDrafts: ImobContractIntakeEvidenceDraft[];
  pendingItems: string[];
  riskFlags: string[];
  requiresConfirmation: true;
};

type StoredDraft = {
  draft: ImobContractIntakeDraftOutput;
  expiresAt: number;
};

const drafts = new Map<string, StoredDraft>();

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [id, entry] of drafts) {
      if (entry.expiresAt <= now) {
        drafts.delete(id);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow process to exit even if timer is running
  if (cleanupTimer.unref) cleanupTimer.unref();
}

export function createDraft(params: {
  tenantId: string;
  workspaceId: string;
  extractedLease: ImobExtractedLease;
  classification: ImobContractClassification;
  evidenceDrafts: ImobContractIntakeEvidenceDraft[];
  pendingItems: string[];
  riskFlags: string[];
}): ImobContractIntakeDraftOutput {
  startCleanup();

  const draftId = randomUUID();
  const expiresAt = Date.now() + DRAFT_TTL_MS;
  const draftExpiresAt = new Date(expiresAt).toISOString();

  const draft: ImobContractIntakeDraftOutput = {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    source: "chat-imob",
    actionId: "imob.contract.intake",
    draftId,
    draftExpiresAt,
    extractedLease: params.extractedLease,
    classification: params.classification,
    evidenceDrafts: params.evidenceDrafts,
    pendingItems: params.pendingItems,
    riskFlags: params.riskFlags,
    requiresConfirmation: true,
  };

  drafts.set(draftId, { draft, expiresAt });
  return draft;
}

export function getDraft(draftId: string): ImobContractIntakeDraftOutput | null {
  const entry = drafts.get(draftId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    drafts.delete(draftId);
    return null;
  }
  return entry.draft;
}

export function isDraftExpired(draftId: string): boolean {
  const entry = drafts.get(draftId);
  if (!entry) return true;
  return entry.expiresAt <= Date.now();
}

export function deleteDraft(draftId: string): void {
  drafts.delete(draftId);
}

export function getDraftCount(): number {
  return drafts.size;
}

// For testing only
export function _clearAllDraftsForTesting(): void {
  drafts.clear();
}
