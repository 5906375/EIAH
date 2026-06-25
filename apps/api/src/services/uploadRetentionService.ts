import { createLogger } from "@eiah/core/logging/logger";
import { assertSafeStorageKey } from "./storageProvider";
import { deleteStoredObject, storedObjectExists } from "./storage";
import {
  IMOB_INTAKE_OBSERVABILITY_COUNTER,
  recordImobIntakeObservabilityEvent,
} from "./imob/intake/imobIntakeObservability";

const logger = createLogger({ component: "upload-retention" });

const DEFAULT_RETENTION_DAYS = Number(process.env.UPLOAD_RETENTION_DAYS ?? 30);
const DEFAULT_BATCH_SIZE = 100;
const INTAKE_AGENT_SLUG = "imob-intake";

export type UploadCleanupMode = "disabled" | "dry-run" | "delete";

export type UploadRetentionCandidate = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentSlug: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  createdAt: Date;
};

export type UploadCleanupItemResult =
  | {
      documentId: string;
      tenantId: string;
      workspaceId: string;
      storageKey: string;
      outcome: "would_delete";
    }
  | {
      documentId: string;
      tenantId: string;
      workspaceId: string;
      storageKey: string;
      outcome: "deleted";
    }
  | {
      documentId: string;
      tenantId: string;
      workspaceId: string;
      storageKey: string;
      outcome: "not_found";
    }
  | {
      documentId: string;
      tenantId: string;
      workspaceId: string;
      storageKey: string;
      outcome: "failed";
      error: string;
    };

export type UploadCleanupBatchResult = {
  mode: UploadCleanupMode;
  retentionDays: number;
  cutoff: string;
  scanned: number;
  deleted: number;
  wouldDelete: number;
  failed: number;
  notFound: number;
  items: UploadCleanupItemResult[];
};

type UploadRecordStore = {
  findMany(args: {
    where: {
      agentSlug: string;
      createdAt: { lte: Date };
      tenantId?: string;
      workspaceId?: string;
    };
    orderBy: { createdAt: "asc" };
    take: number;
  }): Promise<UploadRetentionCandidate[]>;
  deleteMany(args: {
    where: {
      id: string;
      tenantId: string;
      workspaceId: string;
    };
  }): Promise<{ count: number }>;
};

type UploadRetentionServiceClient = {
  uploadedDocument: UploadRecordStore;
};

type UploadRetentionDeps = {
  objectExists: typeof storedObjectExists;
  deleteObject: typeof deleteStoredObject;
};

type CleanupParams = {
  prisma?: UploadRetentionServiceClient;
  tenantId?: string;
  workspaceId?: string;
  limit?: number;
  now?: Date;
  enabled?: boolean;
  dryRun?: boolean;
  retentionDays?: number;
  deps?: Partial<UploadRetentionDeps>;
};

async function resolveClient(client?: UploadRetentionServiceClient) {
  if (client) return client as UploadRetentionServiceClient;
  const { prismaGlobal } = await import("@repo/db");
  return prismaGlobal as unknown as UploadRetentionServiceClient;
}

function resolveBooleanEnv(value: string | undefined, fallback: boolean) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function uploadCleanupEnabled() {
  return resolveBooleanEnv(process.env.UPLOAD_CLEANUP_ENABLED, false);
}

export function uploadCleanupDryRun() {
  return resolveBooleanEnv(process.env.UPLOAD_CLEANUP_DRY_RUN, true);
}

export function uploadCleanupIntervalMs() {
  const raw = Number(process.env.UPLOAD_CLEANUP_INTERVAL_MS ?? 6 * 60 * 60 * 1000);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 6 * 60 * 60 * 1000;
}

export function uploadRetentionDays() {
  return Number.isFinite(DEFAULT_RETENTION_DAYS) && DEFAULT_RETENTION_DAYS > 0 ? DEFAULT_RETENTION_DAYS : 30;
}

export function uploadRetentionCutoff(now: Date, retentionDays = uploadRetentionDays()) {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

export function isUploadRetentionCandidate(
  document: Pick<UploadRetentionCandidate, "agentSlug" | "createdAt">,
  now = new Date(),
  retentionDays = uploadRetentionDays(),
) {
  return document.agentSlug === INTAKE_AGENT_SLUG && document.createdAt.getTime() <= uploadRetentionCutoff(now, retentionDays).getTime();
}

export async function listExpiredUploadedDocuments(params: {
  prisma?: UploadRetentionServiceClient;
  tenantId?: string;
  workspaceId?: string;
  limit?: number;
  now?: Date;
  retentionDays?: number;
}) {
  const client = await resolveClient(params.prisma);
  const retentionDays = params.retentionDays ?? uploadRetentionDays();
  const cutoff = uploadRetentionCutoff(params.now ?? new Date(), retentionDays);
  return client.uploadedDocument.findMany({
    where: {
      agentSlug: INTAKE_AGENT_SLUG,
      createdAt: { lte: cutoff },
      ...(params.tenantId ? { tenantId: params.tenantId } : {}),
      ...(params.workspaceId ? { workspaceId: params.workspaceId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: Math.max(1, Math.min(params.limit ?? DEFAULT_BATCH_SIZE, 500)),
  });
}

export async function cleanupExpiredUploadedDocuments(params: CleanupParams = {}): Promise<UploadCleanupBatchResult> {
  const client = await resolveClient(params.prisma);
  const now = params.now ?? new Date();
  const retentionDays = params.retentionDays ?? uploadRetentionDays();
  const cutoff = uploadRetentionCutoff(now, retentionDays);
  const enabled = params.enabled ?? uploadCleanupEnabled();
  const dryRun = params.dryRun ?? uploadCleanupDryRun();
  const mode: UploadCleanupMode = !enabled ? "disabled" : dryRun ? "dry-run" : "delete";
  const deps: UploadRetentionDeps = {
    objectExists: params.deps?.objectExists ?? storedObjectExists,
    deleteObject: params.deps?.deleteObject ?? deleteStoredObject,
  };
  const candidates = await listExpiredUploadedDocuments({
    prisma: client,
    tenantId: params.tenantId,
    workspaceId: params.workspaceId,
    limit: params.limit,
    now,
    retentionDays,
  });

  if (!enabled) {
    recordImobIntakeObservabilityEvent({
      event: "upload_retention_skipped",
      payload: { mode },
      counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.CLEANUP_SKIPPED,
      counterLabels: { mode },
    });
    return {
      mode,
      retentionDays,
      cutoff: cutoff.toISOString(),
      scanned: candidates.length,
      deleted: 0,
      wouldDelete: 0,
      failed: 0,
      notFound: 0,
      items: [],
    };
  }

  const items: UploadCleanupItemResult[] = [];

  if (dryRun && candidates.length > 0) {
    recordImobIntakeObservabilityEvent({
      event: "upload_retention_candidates",
      payload: { mode, count: candidates.length },
      counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.CLEANUP_CANDIDATES,
      counterLabels: { mode },
      counterAmount: candidates.length,
    });
  }

  for (const document of candidates) {
    const storageKey = assertSafeStorageKey(document.storageKey);

    if (dryRun) {
      items.push({
        documentId: document.id,
        tenantId: document.tenantId,
        workspaceId: document.workspaceId,
        storageKey,
        outcome: "would_delete",
      });
      continue;
    }

    try {
      const existedBeforeDelete = await deps.objectExists(storageKey);
      if (!existedBeforeDelete) {
        const deletedRecord = await client.uploadedDocument.deleteMany({
          where: {
            id: document.id,
            tenantId: document.tenantId,
            workspaceId: document.workspaceId,
          },
        });
        if (deletedRecord.count !== 1) {
          throw new Error("UPLOAD_RETENTION_RECORD_DELETE_FAILED");
        }
        logger.warn(
          {
            documentId: document.id,
            tenantId: document.tenantId,
            workspaceId: document.workspaceId,
            agentSlug: document.agentSlug,
          },
          "upload-retention.storage_missing",
        );
        items.push({
          documentId: document.id,
          tenantId: document.tenantId,
          workspaceId: document.workspaceId,
          storageKey,
          outcome: "not_found",
        });
        continue;
      }

      await deps.deleteObject(storageKey);

      if (await deps.objectExists(storageKey)) {
        throw new Error("UPLOAD_RETENTION_DELETE_NOT_CONFIRMED");
      }

      const deletedRecord = await client.uploadedDocument.deleteMany({
        where: {
          id: document.id,
          tenantId: document.tenantId,
          workspaceId: document.workspaceId,
        },
      });
      if (deletedRecord.count !== 1) {
        throw new Error("UPLOAD_RETENTION_RECORD_DELETE_FAILED");
      }

      logger.info(
        {
          documentId: document.id,
          tenantId: document.tenantId,
          workspaceId: document.workspaceId,
          agentSlug: document.agentSlug,
        },
        "upload-retention.deleted",
      );
      items.push({
        documentId: document.id,
        tenantId: document.tenantId,
        workspaceId: document.workspaceId,
        storageKey,
        outcome: "deleted",
      });
      recordImobIntakeObservabilityEvent({
        event: "upload_retention_deleted",
        payload: { mode, count: 1 },
        counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.CLEANUP_DELETED,
        counterLabels: { mode },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        {
          documentId: document.id,
          tenantId: document.tenantId,
          workspaceId: document.workspaceId,
          agentSlug: document.agentSlug,
          error: message,
        },
        "upload-retention.failed",
      );
      items.push({
        documentId: document.id,
        tenantId: document.tenantId,
        workspaceId: document.workspaceId,
        storageKey,
        outcome: "failed",
        error: message,
      });
      recordImobIntakeObservabilityEvent({
        event: "upload_retention_failed",
        payload: { mode, reasonCode: message === "UPLOAD_RETENTION_DELETE_NOT_CONFIRMED" ? "DELETE_NOT_CONFIRMED" : "DELETE_FAILED" },
        level: "error",
        counterName: IMOB_INTAKE_OBSERVABILITY_COUNTER.CLEANUP_FAILED,
        counterLabels: {
          mode,
          reasonCode: message === "UPLOAD_RETENTION_DELETE_NOT_CONFIRMED" ? "DELETE_NOT_CONFIRMED" : "DELETE_FAILED",
        },
      });
    }
  }

  return {
    mode,
    retentionDays,
    cutoff: cutoff.toISOString(),
    scanned: candidates.length,
    deleted: items.filter((item) => item.outcome === "deleted").length,
    wouldDelete: items.filter((item) => item.outcome === "would_delete").length,
    failed: items.filter((item) => item.outcome === "failed").length,
    notFound: items.filter((item) => item.outcome === "not_found").length,
    items,
  };
}
