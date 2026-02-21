import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { registerAllActions, listRegisteredActions } from "@eiah/core";
import { VersionedActionRegistry } from "@eiah/core";
import {
  auditCriticalityCoverage,
  type CriticalityAuditReport,
} from "@eiah/core";

function getArgValue(flag: string) {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return process.argv[idx + 1] ?? null;
}

function parseAllowlist(value: string | null) {
  if (!value) return new Set<string>();
  return new Set(
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

const outputPath = getArgValue("--out") ?? "artifacts/criticality-coverage.json";
const allowlistPath = getArgValue("--allowlist") ?? null;

const allowlist = (() => {
  if (!allowlistPath) return new Set<string>();
  try {
    const data = fs.readFileSync(allowlistPath, "utf8");
    return parseAllowlist(data);
  } catch {
    return new Set<string>();
  }
})();

const registry = new VersionedActionRegistry();
registerAllActions(registry);

const actions = listRegisteredActions();
const report = auditCriticalityCoverage(actions);

const missing = report.missing.filter((entry) => !allowlist.has(entry.name));
const filteredReport: CriticalityAuditReport = {
  ...report,
  missing,
  explicitCount: report.total - missing.length,
  coveragePct: report.total === 0 ? 0 : Number(((report.total - missing.length) / report.total * 100).toFixed(2)),
};

const outDir = path.dirname(outputPath);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(filteredReport, null, 2));

const summary = [
  `total=${filteredReport.total}`,
  `explicit=${filteredReport.explicitCount}`,
  `coverage=${filteredReport.coveragePct}%`,
  `missing=${filteredReport.missing.length}`,
];
console.log(`criticality-coverage: ${summary.join(" ")}`);

if (filteredReport.missing.length > 0) {
  console.error("Missing criticality assignments:");
  filteredReport.missing.forEach((entry) => {
    console.error(
      `- ${entry.name} (version=${entry.version ?? "?"}) suggested=${entry.suggestedCriticality}`
    );
  });
  process.exit(2);
}

process.exit(0);
