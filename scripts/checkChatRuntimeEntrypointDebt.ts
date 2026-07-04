import fs from "node:fs";
import path from "node:path";

const CHECK = "check:chat-runtime-entrypoint-debt";
const TARGET_FILE = path.resolve("apps/web/src/components/agents/ChatAgentLauncher.tsx");

type Violation = {
  pattern: string;
  message: string;
  line: number;
};

function fail(reasonCode: string, violations: Violation[]): never {
  console.error(
    JSON.stringify(
      {
        ok: false,
        check: CHECK,
        reasonCode,
        checkedFile: "apps/web/src/components/agents/ChatAgentLauncher.tsx",
        violations,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

function readTarget() {
  if (!fs.existsSync(TARGET_FILE)) {
    fail("CHAT_RUNTIME_ENTRYPOINT_FILE_MISSING", [
      {
        pattern: "file_missing",
        message: `required file not found: ${TARGET_FILE}`,
        line: 1,
      },
    ]);
  }
  return fs.readFileSync(TARGET_FILE, "utf8");
}

function findLine(lines: string[], pattern: RegExp) {
  const index = lines.findIndex((line) => pattern.test(line));
  return index >= 0 ? index + 1 : null;
}

function pushViolation(
  violations: Violation[],
  lines: string[],
  pattern: string,
  matcher: RegExp,
  message: string,
) {
  const line = findLine(lines, matcher);
  if (line !== null) {
    violations.push({ pattern, message, line });
  }
}

const launcherRaw = readTarget();
const lines = launcherRaw.split(/\r?\n/);
const violations: Violation[] = [];

const forbiddenDeepImports = [
  "imobContextResolver",
  "legalContextResolver",
  "proposalDomainResolver",
  "specialistDecisionResolver",
  "specialistExplainCatalog",
  "platformHelpResolver",
  "agentPresentationResolver",
  "helpDictionaryResolver",
  "eiahTutorContracts",
];

for (const importName of forbiddenDeepImports) {
  pushViolation(
    violations,
    lines,
    importName,
    new RegExp(String.raw`from\s+["'][^"']*${importName}[^"']*["']`),
    `direct import from '${importName}' is forbidden in ChatAgentLauncher; route through chatLauncherEngine instead`,
  );
}

pushViolation(
  violations,
  lines,
  "defaultNextStep",
  /\bdefaultNextStep\b/,
  "defaultNextStep must not be hardcoded in ChatAgentLauncher",
);

pushViolation(
  violations,
  lines,
  "quickReplies literal property",
  /\bquickReplies\s*:\s*\[/,
  "generic local quickReplies arrays are forbidden in ChatAgentLauncher",
);

pushViolation(
  violations,
  lines,
  "local quick replies const",
  /\bconst\s+\w*quickReplies\w*\s*=\s*\[/,
  "generic local quickReplies builders are forbidden in ChatAgentLauncher",
);

const forbiddenDirectCalls = [
  "resolveSpecialistAvailability",
  "canSuggestAgent",
  "canHandoffToAgent",
  "buildSuggestedAgentReply",
  "buildSpecialistExplainReply",
  "resolveSpecialistExplainTarget",
  "resolveImobJourneyStage",
  "resolveLegalJourneyStage",
  "resolveImobVerticalContext",
  "resolveLegalVerticalContext",
  "shouldRouteToImob",
  "isLegalRoutingQuestion",
];

for (const callName of forbiddenDirectCalls) {
  pushViolation(
    violations,
    lines,
    callName,
    new RegExp(String.raw`\b${callName}\s*\(`),
    `behavioral decision '${callName}(...)' must stay outside ChatAgentLauncher`,
  );
}

if (violations.length > 0) {
  fail("CHAT_RUNTIME_ENTRYPOINT_DEBT_VIOLATION", violations);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      checkedFile: "apps/web/src/components/agents/ChatAgentLauncher.tsx",
      violations: [],
      summary: {
        deepImportsBlocked: forbiddenDeepImports,
        directDecisionCallsBlocked: forbiddenDirectCalls,
        literalPatternsBlocked: ["defaultNextStep", "quickReplies: [", "const ...quickReplies... = ["],
      },
    },
    null,
    2,
  ),
);
