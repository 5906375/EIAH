import { createLogger } from "@eiah/core";
import { syncImobDriveFromManifest } from "../../../../apps/api/src/services/imob/imobDriveSync";

const logger = createLogger({ component: "maintenance-worker-imob-drive-sync" });

function envFlag(value: string | undefined, fallback = false) {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "on";
}

export async function scheduleImobDriveSyncWorker() {
  const enabled = envFlag(process.env.IMOB_DRIVE_SYNC_ENABLED, false);
  if (!enabled) {
    logger.info("maintenance.imob_drive_sync.disabled");
    return;
  }

  const intervalMinutes = Number(process.env.IMOB_DRIVE_SYNC_INTERVAL_MINUTES ?? "60");
  const everyMs = Number.isFinite(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes * 60 * 1000 : 60 * 60 * 1000;
  const manifestPath = process.env.IMOB_DRIVE_SYNC_SOURCE;
  const outputPath = process.env.IMOB_DRIVE_SYNC_LATEST_PATH;

  const runOnce = async () => {
    try {
      const snapshot = await syncImobDriveFromManifest({
        manifestPath,
        outputPath,
      });
      logger.info(
        {
          syncedAt: snapshot.syncedAt,
          totalDocuments: snapshot.totalDocuments,
          sourcePath: snapshot.sourcePath,
        },
        "maintenance.imob_drive_sync.completed"
      );
    } catch (error) {
      logger.error({ err: error }, "maintenance.imob_drive_sync.failed");
    }
  };

  await runOnce();
  setInterval(() => {
    void runOnce();
  }, everyMs);

  logger.info(
    {
      intervalMinutes: everyMs / 60000,
      manifestPath: manifestPath ?? null,
      outputPath: outputPath ?? null,
    },
    "maintenance.imob_drive_sync.scheduled"
  );
}
