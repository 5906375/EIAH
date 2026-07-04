import fs from "node:fs";
import path from "node:path";

const CHECK = "check:redis-fail-closed";
const ROOTS = ["packages", "apps"];
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const FORBIDDEN_PATTERNS = [
  { regex: /\b127\.0\.0\.1\b/, reason: "redis_localhost_ipv4_fallback" },
  { regex: /\blocalhost\b/, reason: "redis_localhost_name_fallback" },
  { regex: /\bREDIS_HOST\b/, reason: "redis_host_env_fallback" },
  { regex: /\bREDIS_PORT\b/, reason: "redis_port_env_fallback" },
];

type Violation = {
  file: string;
  line: number;
  reason: string;
  snippet: string;
};

function fail(message: string, violations: Violation[]): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, violations }, null, 2));
  process.exit(1);
}

function shouldSkip(filePath: string): boolean {
  const normalized = filePath.split(path.sep).join("/");
  if (!SOURCE_EXTENSIONS.has(path.extname(filePath))) return true;
  if (normalized.includes("/dist/")) return true;
  if (normalized.includes("/generated/")) return true;
  if (normalized.includes("/node_modules/")) return true;
  if (normalized.includes("/src/tests/")) return true;
  if (normalized.endsWith(".test.ts") || normalized.endsWith(".test.tsx")) return true;
  if (normalized.endsWith(".spec.ts") || normalized.endsWith(".spec.tsx")) return true;
  return false;
}

function walk(dir: string, acc: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "generated") continue;
      walk(absolute, acc);
      continue;
    }
    if (!shouldSkip(absolute)) {
      acc.push(absolute);
    }
  }
}

function gatherSourceFiles(): string[] {
  const files: string[] = [];
  for (const root of ROOTS) {
    const absoluteRoot = path.resolve(root);
    if (fs.existsSync(absoluteRoot)) {
      walk(absoluteRoot, files);
    }
  }
  return files;
}

function braceDelta(line: string): number {
  let delta = 0;
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;
  let escaping = false;

  for (const char of line) {
    if (escaping) {
      escaping = false;
      continue;
    }
    if (char === "\\") {
      escaping = true;
      continue;
    }
    if (!inDouble && !inTemplate && char === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && char === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && char === "`") {
      inTemplate = !inTemplate;
      continue;
    }
    if (inSingle || inDouble || inTemplate) continue;
    if (char === "{") delta += 1;
    if (char === "}") delta -= 1;
  }

  return delta;
}

function scanFile(filePath: string): Violation[] {
  const relativePath = path.relative(process.cwd(), filePath);
  const content = fs.readFileSync(filePath, "utf8");
  if (!/(Redis|redis:\/\/|RUN_EVENTS_REDIS_URL|REDIS_URL|REDIS_HOST|REDIS_PORT)/.test(content)) {
    return [];
  }

  const violations: Violation[] = [];
  const lines = content.split(/\r?\n/);
  let depth = 0;

  lines.forEach((line, index) => {
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (!pattern.regex.test(line)) continue;
      violations.push({
        file: relativePath,
        line: index + 1,
        reason: pattern.reason,
        snippet: line.trim(),
      });
    }

    const currentDepth = depth;
    const isLazyFactoryDeclaration = /=>\s*new Redis\(/.test(line);
    if (line.includes("new Redis(") && currentDepth <= 0 && !isLazyFactoryDeclaration) {
      violations.push({
        file: relativePath,
        line: index + 1,
        reason: "top_level_new_redis_forbidden",
        snippet: line.trim(),
      });
    }

    depth += braceDelta(line);
  });

  return violations;
}

const violations = gatherSourceFiles().flatMap(scanFile);

if (violations.length > 0) {
  fail("redis_fail_closed_violations_detected", violations);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      scannedRoots: ROOTS,
      scannedFiles: gatherSourceFiles().length,
      summary: {
        localhostFallbacksDetected: 0,
        topLevelRedisConstructorsDetected: 0,
      },
    },
    null,
    2
  )
);
