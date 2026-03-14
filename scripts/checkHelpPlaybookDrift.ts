import fs from "node:fs";
import path from "node:path";

const CHECK = "check:help-playbook-drift";
const PLAYBOOK_FILE = path.resolve("apps/web/src/pages/app/agents/index.tsx");
const ROADMAP_FILE = path.resolve("ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-10.md");
const EVIDENCE_FILE = path.resolve("docs/EVIDENCE_INDEX.md");

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function read(target: string) {
  if (!fs.existsSync(target)) fail("required file not found", { file: target });
  return fs.readFileSync(target, "utf8");
}

function extractEiahBlock(content: string) {
  const blockMatch = content.match(/eiah\s*:\s*\{([\s\S]*?)\n\s*\},\n\s*fallback\s*:/m);
  if (!blockMatch) return "";
  return blockMatch[1];
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const playbookRaw = read(PLAYBOOK_FILE);
const roadmapRaw = read(ROADMAP_FILE);
const evidenceRaw = read(EVIDENCE_FILE);

const eiahBlock = extractEiahBlock(playbookRaw);
if (!eiahBlock) {
  fail("could not extract playbook block 'eiah' from agents index", {
    file: "apps/web/src/pages/app/agents/index.tsx",
  });
}

const playbookNorm = normalize(eiahBlock);
const missingPlaybookAnchors = [
  { id: "mode-help", ok: playbookNorm.includes("help") },
  { id: "mode-proposal", ok: playbookNorm.includes("proposal") },
  { id: "page-runs", ok: playbookNorm.includes("runs") },
  { id: "page-agentes", ok: playbookNorm.includes("agentes") },
  { id: "page-billing", ok: playbookNorm.includes("billing") },
  { id: "page-marketplace", ok: playbookNorm.includes("marketplace") },
  { id: "page-imob", ok: playbookNorm.includes("imob") },
  { id: "page-selfservice", ok: playbookNorm.includes("self-service") || playbookNorm.includes("selfservice") },
  { id: "page-perfil", ok: playbookNorm.includes("perfil") },
]
  .filter((anchor) => !anchor.ok)
  .map((anchor) => anchor.id);
if (missingPlaybookAnchors.length > 0) {
  fail("playbook eiah block is missing required anchors", {
    missingPlaybookAnchors,
  });
}

const missingRoadmapAnchors = ["## P0", "## P1", "## P2", "## P3", "## P4"].filter(
  (anchor) => !roadmapRaw.includes(anchor),
);
if (missingRoadmapAnchors.length > 0) {
  fail("roadmap v8 missing P0-P4 anchors", {
    missingRoadmapAnchors,
    file: "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-10.md",
  });
}

const missingEvidenceAnchors = [
  "Roadmap atual (fonte da verdade): `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-10.md`",
  "apps/web/src/pages/app/agents/index.tsx",
  "apps/api/src/services/eiahHelpKnowledge.ts",
  "apps/api/src/routes/help.ts",
].filter((anchor) => !evidenceRaw.includes(anchor));
if (missingEvidenceAnchors.length > 0) {
  fail("evidence index is not aligned with help playbook stack", {
    missingEvidenceAnchors,
    file: "docs/EVIDENCE_INDEX.md",
  });
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      playbookFile: "apps/web/src/pages/app/agents/index.tsx",
      roadmapFile: "ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-10.md",
      evidenceFile: "docs/EVIDENCE_INDEX.md",
      playbookAnchorsChecked: 9,
      roadmapAnchorsChecked: 5,
      evidenceAnchorsChecked: 4,
    },
    null,
    2,
  ),
);
