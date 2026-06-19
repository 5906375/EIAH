import { createLogger } from "@eiah/core/logging/logger";
import {
  cleanupExpiredUploadedDocuments,
  uploadCleanupDryRun,
  uploadCleanupEnabled,
  uploadCleanupIntervalMs,
} from "../services/uploadRetentionService";

const logger = createLogger({ component: "upload-retention-worker" });

let uploadRetentionTimer: NodeJS.Timeout | null = null;
let uploadRetentionRunning = false;

async function runUploadRetentionSweep() {
  if (uploadRetentionRunning) {
    logger.info({ worker: "uploadRetention" }, "worker.upload-retention.already_running");
    return;
  }
  uploadRetentionRunning = true;
  try {
    const result = await cleanupExpiredUploadedDocuments({
      enabled: uploadCleanupEnabled(),
      dryRun: uploadCleanupDryRun(),
    });
    logger.info(
      {
        worker: "uploadRetention",
        mode: result.mode,
        scanned: result.scanned,
        deleted: result.deleted,
        wouldDelete: result.wouldDelete,
        failed: result.failed,
        notFound: result.notFound,
      },
      "worker.upload-retention.completed",
    );
  } catch (error) {
    logger.error(
      {
        worker: "uploadRetention",
        error: error instanceof Error ? error.message : String(error),
      },
      "worker.upload-retention.failed",
    );
  } finally {
    uploadRetentionRunning = false;
  }
}

export function startUploadRetentionWorker() {
  if (!uploadCleanupEnabled()) {
    logger.info({ worker: "uploadRetention", reason: "disabled" }, "worker.upload-retention.skipped");
    return null;
  }
  if (uploadRetentionTimer) return uploadRetentionTimer;
  void runUploadRetentionSweep();
  uploadRetentionTimer = setInterval(() => {
    void runUploadRetentionSweep();
  }, uploadCleanupIntervalMs());
  logger.info(
    {
      worker: "uploadRetention",
      dryRun: uploadCleanupDryRun(),
      intervalMs: uploadCleanupIntervalMs(),
    },
    "worker.upload-retention.started",
  );
  return uploadRetentionTimer;
}

export function stopUploadRetentionWorker() {
  if (uploadRetentionTimer) {
    clearInterval(uploadRetentionTimer);
    uploadRetentionTimer = null;
  }
}
