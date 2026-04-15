import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const selfServiceRoot = path.join(repoRoot, "apps/web/src/pages/self-service");

const allowedSelfServiceDuplicateBaseNames = new Set([
  "config",
  "fin-nexus",
  "generic",
  "index",
  "j360",
  "mkt",
  "pitch",
  "router",
  "components/AgentFormShell",
  "components/EstimateBadge",
  "components/NeedMoreInfoDialog",
  "components/RunStatusCard",
  "components/SelfServiceNav",
]);

type FileEntry = {
  absPath: string;
  relPath: string;
};

function listFilesRecursively(root: string): FileEntry[] {
  const output: FileEntry[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const absPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absPath);
        continue;
      }
      output.push({
        absPath,
        relPath: path.relative(root, absPath).replace(/\\/g, "/"),
      });
    }
  }

  return output;
}

function collectSelfServiceDuplicateBaseNames(): string[] {
  const files = listFilesRecursively(selfServiceRoot).filter((entry) =>
    /\.(js|ts|tsx)$/.test(entry.relPath)
  );

  const map = new Map<string, Set<string>>();
  for (const file of files) {
    const ext = path.extname(file.relPath).slice(1);
    const base = file.relPath.replace(/\.(js|ts|tsx)$/, "");
    if (!map.has(base)) map.set(base, new Set<string>());
    map.get(base)?.add(ext);
  }

  const duplicates: string[] = [];
  for (const [base, exts] of map.entries()) {
    if (exts.has("js") && (exts.has("ts") || exts.has("tsx"))) {
      duplicates.push(base);
    }
  }
  duplicates.sort();
  return duplicates;
}

type ForbiddenRule = {
  file: string;
  helperNames: string[];
};

const forbiddenLocalHelpers: ForbiddenRule[] = [
  {
    file: "apps/web/src/pages/app/billing/index.tsx",
    helperNames: [
      "formatBRL",
      "getRecord",
      "getStringValue",
      "extractImobContextFromRun",
      "countShadowExecutionsByStage",
    ],
  },
  {
    file: "apps/web/src/pages/app/runs/index.tsx",
    helperNames: ["getRecord", "getStringValue", "extractImobContextFromRun", "formatReconciliationIssue"],
  },
  {
    file: "apps/web/src/pages/app/economy/index.tsx",
    helperNames: ["formatBRL"],
  },
  {
    file: "apps/web/src/pages/app/marketplace/index.tsx",
    helperNames: ["formatBRL"],
  },
  {
    file: "apps/web/src/pages/app/marketplace/imob.tsx",
    helperNames: ["formatBRL"],
  },
  {
    file: "apps/web/src/pages/app/imob/processes.tsx",
    helperNames: ["formatBRL"],
  },
  {
    file: "apps/web/src/pages/profile.tsx",
    helperNames: ["formatBRL", "countShadowExecutionsByStage"],
  },
  {
    file: "apps/web/src/pages/self-service/index.tsx",
    helperNames: ["formatBRL"],
  },
  {
    file: "apps/web/src/pages/app/imob/chat.tsx",
    helperNames: ["formatPct", "formatReconciliationIssue"],
  },
  {
    file: "apps/web/src/pages/app/imob/dashboard.tsx",
    helperNames: ["formatPct"],
  },
];

function findForbiddenHelperDeclarations(rule: ForbiddenRule): string[] {
  const abs = path.join(repoRoot, rule.file);
  if (!fs.existsSync(abs)) return [];
  const content = fs.readFileSync(abs, "utf8");
  const lines = content.split(/\r?\n/);
  const findings: string[] = [];

  rule.helperNames.forEach((name) => {
    const pattern = new RegExp(`^\\s*(?:function|const)\\s+${name}\\b`);
    lines.forEach((line, index) => {
      if (pattern.test(line)) {
        findings.push(`${rule.file}:${index + 1} -> ${name}`);
      }
    });
  });

  return findings;
}

const errors: string[] = [];

const currentDuplicates = collectSelfServiceDuplicateBaseNames();
const unexpectedDuplicates = currentDuplicates.filter(
  (item) => !allowedSelfServiceDuplicateBaseNames.has(item)
);
if (unexpectedDuplicates.length > 0) {
  errors.push(
    [
      "Novos pares duplicados .js + .ts/.tsx detectados em self-service:",
      ...unexpectedDuplicates.map((item) => `- ${item}`),
    ].join("\n")
  );
}

const forbiddenFindings = forbiddenLocalHelpers.flatMap(findForbiddenHelperDeclarations);
if (forbiddenFindings.length > 0) {
  errors.push(
    [
      "Helpers locais proibidos detectados (use src/lib canônico):",
      ...forbiddenFindings.map((item) => `- ${item}`),
    ].join("\n")
  );
}

if (errors.length > 0) {
  console.error(errors.join("\n\n"));
  process.exit(1);
}

console.log("check:frontend-duplication OK");
