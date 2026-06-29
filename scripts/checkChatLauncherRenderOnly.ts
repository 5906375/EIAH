import fs from "node:fs";
import path from "node:path";

const CHECK = "check:chat-launcher-render-only";
const TARGET_FILE = path.resolve("apps/web/src/components/agents/ChatAgentLauncher.tsx");
const REASON_CODE = "CHAT_LAUNCHER_RENDER_ONLY_VIOLATION";
const SNAPSHOT_CONTEXT_RADIUS = 12;

type Violation = {
  pattern: string;
  message: string;
  line: number;
};

function fail(violations: Violation[]): never {
  console.error(
    JSON.stringify(
      {
        ok: false,
        check: CHECK,
        reasonCode: REASON_CODE,
        checkedFile: "apps/web/src/components/agents/ChatAgentLauncher.tsx",
        violations,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

function read(target: string) {
  if (!fs.existsSync(target)) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          check: CHECK,
          reasonCode: "CHAT_LAUNCHER_RENDER_ONLY_FILE_MISSING",
          checkedFile: "apps/web/src/components/agents/ChatAgentLauncher.tsx",
          violations: [
            {
              pattern: "file_missing",
              message: `required file not found: ${target}`,
              line: 1,
            },
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  return fs.readFileSync(target, "utf8");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findLine(lines: string[], matcher: (line: string) => boolean) {
  const index = lines.findIndex(matcher);
  return index >= 0 ? index + 1 : null;
}

function collectPatternViolation(
  lines: string[],
  violations: Violation[],
  pattern: string,
  matcher: (line: string) => boolean,
  message: string,
) {
  const line = findLine(lines, matcher);
  if (line !== null) {
    violations.push({ pattern, message, line });
  }
}

function buildSnapshotContextRanges(lines: string[]) {
  const ranges: Array<{ start: number; end: number }> = [];
  lines.forEach((line, index) => {
    if (line.includes("presentationSnapshot") || line.includes("createLauncherPresentationSnapshot")) {
      ranges.push({
        start: Math.max(0, index - SNAPSHOT_CONTEXT_RADIUS),
        end: Math.min(lines.length - 1, index + SNAPSHOT_CONTEXT_RADIUS),
      });
    }
  });
  return ranges;
}

function collectContextualFieldViolations(lines: string[], violations: Violation[]) {
  const contextRanges = buildSnapshotContextRanges(lines);
  const backendFields = ["payload", "proofHash", "sourceRefs", "receiptId", "tenantId"];

  for (const field of backendFields) {
    const matcher = new RegExp(`\\b${escapeRegex(field)}\\b`);
    for (const range of contextRanges) {
      for (let index = range.start; index <= range.end; index++) {
        if (!matcher.test(lines[index] ?? "")) continue;
        violations.push({
          pattern: field,
          message: `backend/proof field '${field}' found in frontend presentationSnapshot context`,
          line: index + 1,
        });
        break;
      }
      if (violations.some((entry) => entry.pattern === field)) break;
    }
  }
}

const launcherRaw = read(TARGET_FILE);
const lines = launcherRaw.split(/\r?\n/);
const violations: Violation[] = [];

collectPatternViolation(
  lines,
  violations,
  "import selectLauncherAgentContract",
  (line) => line.includes("selectLauncherAgentContract"),
  "direct selectLauncherAgentContract reference is forbidden in ChatAgentLauncher",
);
collectPatternViolation(
  lines,
  violations,
  "selectLauncherAgentContract(",
  (line) => line.includes("selectLauncherAgentContract("),
  "direct selectLauncherAgentContract call is forbidden in ChatAgentLauncher",
);
collectPatternViolation(
  lines,
  violations,
  "fallbackHelpMarkdown",
  (line) => line.includes("fallbackHelpMarkdown"),
  "fallbackHelpMarkdown must stay outside ChatAgentLauncher",
);
collectPatternViolation(
  lines,
  violations,
  "const decisionTelemetry",
  (line) => /\bconst\s+decisionTelemetry\b/.test(line),
  "semantic decision telemetry must not be created locally in ChatAgentLauncher",
);
collectPatternViolation(
  lines,
  violations,
  "function createPresentationSnapshot",
  (line) => /\bfunction\s+createPresentationSnapshot\b/.test(line),
  "local createPresentationSnapshot function is forbidden in ChatAgentLauncher",
);
collectPatternViolation(
  lines,
  violations,
  "const createPresentationSnapshot",
  (line) => /\bconst\s+createPresentationSnapshot\b/.test(line),
  "local createPresentationSnapshot const is forbidden in ChatAgentLauncher",
);

collectContextualFieldViolations(lines, violations);

if (violations.length > 0) {
  fail(violations);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      checkedFile: "apps/web/src/components/agents/ChatAgentLauncher.tsx",
      violations: [],
    },
    null,
    2,
  ),
);
