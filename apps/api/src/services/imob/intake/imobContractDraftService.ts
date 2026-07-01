import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { requireRedisUrl } from "@eiah/core";
import type { ImobContractClassification } from "./imobContractClassifier";
import type { ImobExtractedLease } from "./imobLeaseExtractor";
import {
  IMOB_INTAKE_OBSERVABILITY_COUNTER,
  recordImobIntakeObservabilityEvent,
} from "./imobIntakeObservability";

export const DRAFT_TTL_MS = Number(process.env.DRAFT_TTL_MS ?? 30 * 60 * 1000);
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const REDIS_KEY_PREFIX = "imob:intake:draft";

export type DraftStoreMode = "memory" | "redis";

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

type DraftScope = {
  tenantId: string;
  workspaceId: string;
};

type ConsumeDraftResult =
  | { status: "consumed"; draft: ImobContractIntakeDraftOutput }
  | { status: "missing" }
  | { status: "scope_mismatch" };

interface DraftStore {
  kind: DraftStoreMode;
  putDraft(draft: ImobContractIntakeDraftOutput, ttlMs: number): Promise<void>;
  getDraft(draftId: string): Promise<ImobContractIntakeDraftOutput | null>;
  consumeDraft(draftId: string, scope: DraftScope): Promise<ConsumeDraftResult>;
  deleteDraft(draftId: string): Promise<void>;
  expireDraft(draftId: string, ttlMs: number): Promise<void>;
  getDraftCount(): Promise<number>;
  clearAllForTesting(): Promise<void>;
  dispose?(): Promise<void> | void;
}

type StoredDraft = {
  draft: ImobContractIntakeDraftOutput;
  expiresAt: number;
};

class InMemoryDraftStore implements DraftStore {
  readonly kind = "memory" as const;

  private readonly drafts = new Map<string, StoredDraft>();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  private startCleanup() {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [draftId, entry] of this.drafts) {
        if (entry.expiresAt <= now) {
          this.drafts.delete(draftId);
          recordImobIntakeObservabilityEvent({
            event: "draft_expired",
            payload: { source: "memory_gc", store: this.kind },
            counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.DRAFTS_EXPIRED,
            counterLabels: { source: "memory_gc" },
          });
        }
      }
    }, CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  private readEntry(draftId: string) {
    const entry = this.drafts.get(draftId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.drafts.delete(draftId);
      return null;
    }
    return entry;
  }

  async putDraft(draft: ImobContractIntakeDraftOutput, ttlMs: number) {
    this.startCleanup();
    this.drafts.set(draft.draftId, { draft, expiresAt: Date.now() + ttlMs });
  }

  async getDraft(draftId: string) {
    return this.readEntry(draftId)?.draft ?? null;
  }

  async consumeDraft(draftId: string, scope: DraftScope): Promise<ConsumeDraftResult> {
    const entry = this.readEntry(draftId);
    if (!entry) return { status: "missing" };
    if (entry.draft.tenantId !== scope.tenantId || entry.draft.workspaceId !== scope.workspaceId) {
      recordImobIntakeObservabilityEvent({
        event: "draft_scope_mismatch",
        payload: { store: this.kind },
        level: "warn",
        counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.DRAFTS_SCOPE_MISMATCH,
      });
      return { status: "scope_mismatch" };
    }
    this.drafts.delete(draftId);
    recordImobIntakeObservabilityEvent({
      event: "draft_consumed",
      payload: { store: this.kind },
      counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.DRAFTS_CONSUMED,
    });
    return { status: "consumed", draft: entry.draft };
  }

  async deleteDraft(draftId: string) {
    this.drafts.delete(draftId);
  }

  async expireDraft(draftId: string, ttlMs: number) {
    if (ttlMs <= 0) {
      this.drafts.delete(draftId);
      return;
    }
    const entry = this.drafts.get(draftId);
    if (!entry) return;
    entry.expiresAt = Date.now() + ttlMs;
    entry.draft.draftExpiresAt = new Date(entry.expiresAt).toISOString();
  }

  async getDraftCount() {
    return this.drafts.size;
  }

  async clearAllForTesting() {
    this.drafts.clear();
  }

  async dispose() {
    if (!this.cleanupTimer) return;
    clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }
}

function resolveRedisUrl(): string {
  return requireRedisUrl(
    process.env.DRAFT_STORE_REDIS_URL ?? process.env.REDIS_URL,
    "imobContractDraftService:resolveRedisUrl"
  );
}

function draftRedisKey(draftId: string) {
  return `${REDIS_KEY_PREFIX}:${draftId}`;
}

let redisClient: Redis | null = null;

function getRedisClient() {
  if (!redisClient) {
    redisClient = new Redis(resolveRedisUrl(), {
      lazyConnect: true,
      maxRetriesPerRequest: null,
    });
    redisClient.on("error", (error) => {
      console.error("[imob-draft-store] Redis client error", error);
    });
  }
  return redisClient;
}

async function closeRedisClient() {
  if (!redisClient) return;
  const current = redisClient;
  redisClient = null;
  try {
    await current.quit();
  } catch {
    current.disconnect();
    return;
  }
  current.disconnect();
}

class RedisDraftStore implements DraftStore {
  readonly kind = "redis" as const;

  private async client() {
    const client = getRedisClient();
    if (client.status === "wait") {
      await client.connect();
    }
    return client;
  }

  async putDraft(draft: ImobContractIntakeDraftOutput, ttlMs: number) {
    const client = await this.client();
    await client.set(draftRedisKey(draft.draftId), JSON.stringify(draft), "PX", ttlMs);
  }

  async getDraft(draftId: string) {
    const client = await this.client();
    const raw = await client.get(draftRedisKey(draftId));
    return raw ? (JSON.parse(raw) as ImobContractIntakeDraftOutput) : null;
  }

  async consumeDraft(draftId: string, scope: DraftScope): Promise<ConsumeDraftResult> {
    const client = await this.client();
    const raw = await client.eval(
      `
        local raw = redis.call("GET", KEYS[1])
        if not raw then
          return {0}
        end
        local payload = cjson.decode(raw)
        if payload.tenantId ~= ARGV[1] or payload.workspaceId ~= ARGV[2] then
          return {-1}
        end
        redis.call("DEL", KEYS[1])
        return {1, raw}
      `,
      1,
      draftRedisKey(draftId),
      scope.tenantId,
      scope.workspaceId,
    );

    if (!Array.isArray(raw) || raw.length === 0) {
      return { status: "missing" };
    }

    const status = Number(raw[0]);
    if (status === 1 && typeof raw[1] === "string") {
      recordImobIntakeObservabilityEvent({
        event: "draft_consumed",
        payload: { store: this.kind },
        counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.DRAFTS_CONSUMED,
      });
      return { status: "consumed", draft: JSON.parse(raw[1]) as ImobContractIntakeDraftOutput };
    }
    if (status === -1) {
      recordImobIntakeObservabilityEvent({
        event: "draft_scope_mismatch",
        payload: { store: this.kind },
        level: "warn",
        counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.DRAFTS_SCOPE_MISMATCH,
      });
      return { status: "scope_mismatch" };
    }
    return { status: "missing" };
  }

  async deleteDraft(draftId: string) {
    const client = await this.client();
    await client.del(draftRedisKey(draftId));
  }

  async expireDraft(draftId: string, ttlMs: number) {
    const client = await this.client();
    if (ttlMs <= 0) {
      await client.del(draftRedisKey(draftId));
      return;
    }
    await client.pexpire(draftRedisKey(draftId), ttlMs);
  }

  async getDraftCount() {
    const client = await this.client();
    const keys = await client.keys(`${REDIS_KEY_PREFIX}:*`);
    return keys.length;
  }

  async clearAllForTesting() {
    const client = await this.client();
    const keys = await client.keys(`${REDIS_KEY_PREFIX}:*`);
    if (keys.length === 0) return;
    await client.del(...keys);
  }
}

let storeInstance: DraftStore | null = null;
let storeMode: DraftStoreMode | null = null;

function resolveDraftStoreMode(): DraftStoreMode {
  const configured = (process.env.DRAFT_STORE ?? "").trim().toLowerCase();
  if (configured === "memory" || configured === "redis") {
    return configured;
  }
  if (process.env.NODE_ENV === "test" || process.execArgv.includes("--test")) {
    return "memory";
  }
  return "redis";
}

function getDraftStore() {
  const mode = resolveDraftStoreMode();
  if (!storeInstance || storeMode !== mode) {
    storeInstance = mode === "redis" ? new RedisDraftStore() : new InMemoryDraftStore();
    storeMode = mode;
    recordImobIntakeObservabilityEvent({
      event: "draft_store_mode",
      payload: { mode },
      counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.DRAFT_STORE_MODE,
      counterLabels: { mode },
      onceKey: `draft-store-mode:${mode}`,
    });
  }
  return storeInstance;
}

export function getConfiguredDraftStoreMode() {
  return resolveDraftStoreMode();
}

export async function createDraft(params: {
  tenantId: string;
  workspaceId: string;
  extractedLease: ImobExtractedLease;
  classification: ImobContractClassification;
  evidenceDrafts: ImobContractIntakeEvidenceDraft[];
  pendingItems: string[];
  riskFlags: string[];
}): Promise<ImobContractIntakeDraftOutput> {
  const draftId = randomUUID();
  const expiresAt = Date.now() + DRAFT_TTL_MS;
  const draft: ImobContractIntakeDraftOutput = {
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    source: "chat-imob",
    actionId: "imob.contract.intake",
    draftId,
    draftExpiresAt: new Date(expiresAt).toISOString(),
    extractedLease: params.extractedLease,
    classification: params.classification,
    evidenceDrafts: params.evidenceDrafts,
    pendingItems: params.pendingItems,
    riskFlags: params.riskFlags,
    requiresConfirmation: true,
  };
  await getDraftStore().putDraft(draft, DRAFT_TTL_MS);
  recordImobIntakeObservabilityEvent({
    event: "draft_created",
    payload: { store: getConfiguredDraftStoreMode() },
    counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.DRAFTS_CREATED,
  });
  return draft;
}

export async function restoreDraft(draft: ImobContractIntakeDraftOutput) {
  const ttlMs = Math.max(new Date(draft.draftExpiresAt).getTime() - Date.now(), 1);
  await getDraftStore().putDraft(draft, ttlMs);
}

export async function getDraft(draftId: string) {
  return getDraftStore().getDraft(draftId);
}

export async function consumeDraft(draftId: string, scope: DraftScope) {
  return getDraftStore().consumeDraft(draftId, scope);
}

export async function isDraftExpired(draftId: string) {
  return (await getDraft(draftId)) === null;
}

export async function deleteDraft(draftId: string) {
  await getDraftStore().deleteDraft(draftId);
}

export async function expireDraft(draftId: string, ttlMs = 0) {
  await getDraftStore().expireDraft(draftId, ttlMs);
  if (ttlMs <= 0) {
    recordImobIntakeObservabilityEvent({
      event: "draft_expired",
      payload: { source: "manual", store: getConfiguredDraftStoreMode() },
      counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.DRAFTS_EXPIRED,
      counterLabels: { source: "manual" },
    });
  }
}

export async function getDraftCount() {
  return getDraftStore().getDraftCount();
}

export async function _clearAllDraftsForTesting() {
  await getDraftStore().clearAllForTesting();
}

export async function closeDraftStoreResources() {
  await storeInstance?.dispose?.();
  storeInstance = null;
  storeMode = null;
  await closeRedisClient();
}
