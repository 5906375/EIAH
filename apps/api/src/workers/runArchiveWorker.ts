import { createLogger } from "@eiah/core";
import { archiveEligibleRunsBatch } from "../services/runArchiveService";

const logger = createLogger({ component: "run-archive-worker" });

function archiveWorkerEnabled() {
  const raw = (process.env.RUN_ARCHIVE_WORKER ?? "true").trim().toLowerCase();
  return raw !== "false" && raw !== "0" && raw !== "off";
}

function archiveWorkerIntervalMs() {
  const raw = Number(process.env.RUN_ARCHIVE_INTERVAL_MS ?? 60 * 60 * 1000);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : 60 * 60 * 1000;
}

function archiveWorkerBatchSize() {
  const raw = Number(process.env.RUN_ARCHIVE_BATCH_SIZE ?? 100);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, 500) : 100;
}

let archiveWorkerTimer: NodeJS.Timeout | null = null;
let archiveWorkerRunning = false;

async function runArchiveSweep() {
  if (archiveWorkerRunning) {
    logger.info({ worker: "runArchive" }, "worker.archive.already_running");
    return;
  }
  archiveWorkerRunning = true;
  try {
    const results = await archiveEligibleRunsBatch({ limit: archiveWorkerBatchSize() });
    const archived = results.filter((item) => item.status === "archived").length;
    const skipped = results.filter((item) => item.status !== "archived").length;
    logger.info(
      {
        worker: "runArchive",
        scanned: results.length,
        archived,
        skipped,
      },
      "worker.archive.completed",
    );
  } catch (error) {
    logger.error(
      {
        worker: "runArchive",
        error: error instanceof Error ? error.message : String(error),
      },
      "worker.archive.failed",
    );
  } finally {
    archiveWorkerRunning = false;
  }
}

export function startRunArchiveWorker() {
  if (!archiveWorkerEnabled()) {
    logger.info({ worker: "runArchive", reason: "disabled" }, "worker.archive.skipped");
    return null;
  }
  if (archiveWorkerTimer) return archiveWorkerTimer;
  void runArchiveSweep();
  archiveWorkerTimer = setInterval(() => {
    void runArchiveSweep();
  }, archiveWorkerIntervalMs());
  logger.info(
    {
      worker: "runArchive",
      intervalMs: archiveWorkerIntervalMs(),
      batchSize: archiveWorkerBatchSize(),
    },
    "worker.archive.started",
  );
  return archiveWorkerTimer;
}

export function stopRunArchiveWorker() {
  if (archiveWorkerTimer) {
    clearInterval(archiveWorkerTimer);
    archiveWorkerTimer = null;
  }
}
