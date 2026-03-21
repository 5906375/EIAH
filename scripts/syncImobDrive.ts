import { syncImobDriveFromManifest } from "../apps/api/src/services/imob/imobDriveSync";

function readFlag(name: string) {
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  const manifestPath = readFlag("--source") ?? process.env.IMOB_DRIVE_SYNC_SOURCE ?? undefined;
  const outputPath = readFlag("--output") ?? process.env.IMOB_DRIVE_SYNC_LATEST_PATH ?? undefined;
  const snapshot = await syncImobDriveFromManifest({
    manifestPath: manifestPath ?? undefined,
    outputPath: outputPath ?? undefined,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        syncedAt: snapshot.syncedAt,
        sourcePath: snapshot.sourcePath,
        totalDocuments: snapshot.totalDocuments,
        totalsByWorkspace: snapshot.totalsByWorkspace,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2
    )
  );
  process.exit(1);
});
