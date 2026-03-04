import { ageDays, fail, hasAll, mustFile, parseIsoDate, pass } from "./checkBaseEvidenceUtils.ts";

const CHECK = "check:backup-restore";
const file = "ops/evidence/2026-W09/base/backup-restore-evidence.md";
const maxAgeDays = Number(process.env.BACKUP_RESTORE_MAX_AGE_DAYS || 7);

try {
  const content = mustFile(file);
  const missing = hasAll(content, ["backup", "restore", "rpo", "rto", "smoke"]);
  if (missing.length) fail(CHECK, "Evidence missing required sections", file, { missing });

  const parsed = parseIsoDate(content);
  if (!parsed) fail(CHECK, "Could not parse any date in evidence", file);
  const age = ageDays(parsed);
  if (age > maxAgeDays) fail(CHECK, `Restore drill too old: ${age.toFixed(2)} days`, file, { maxAgeDays });

  pass(CHECK, "Backup/restore evidence valid", file, { ageDays: Number(age.toFixed(3)) });
} catch (error) {
  fail(CHECK, error instanceof Error ? error.message : String(error), file);
}
