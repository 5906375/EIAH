import fs from "node:fs";
import path from "node:path";
import {
  STRUCTURAL_GATE_BOUNDARY_SHA,
  STRUCTURAL_GATE_BOUNDARY_NOTE,
} from "./apeStructuralGateBoundary";

const CHECK = "check:p4-trackp-rollout";
const CHECKLIST_FILE = "ops/verticals/vertical-onboarding-checklist.md";
const IMOB_ROUTE_FILE = "apps/api/src/routes/imob.ts";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

function readText(relativePath: string): string {
  const file = path.resolve(relativePath);
  if (!fs.existsSync(file)) fail("missing_file", { file: relativePath });
  return fs.readFileSync(file, "utf8");
}

const checklist = readText(CHECKLIST_FILE).toLowerCase();
const imobRoutes = readText(IMOB_ROUTE_FILE);

type Invariant = { id: string; description: string };
const invariants: Invariant[] = [];
function checkInvariant(id: string, description: string, run: () => void) {
  run();
  invariants.push({ id, description });
}

const rolloutChecklistItems = [
  "critério `shadow` explícito e documentado",
  "critério `pilot` explícito e documentado",
  "critério `small` explícito e documentado",
  "evidência semanal da vertical publicada",
  "command center da vertical expõe prova por run",
];
checkInvariant(
  "checklist.rollout_phases_documented",
  "vertical onboarding checklist documents shadow/pilot/small criteria and Command Center proof",
  () => {
    const missing = rolloutChecklistItems.filter((item) => !checklist.includes(item.toLowerCase()));
    if (missing.length > 0) {
      fail("vertical_checklist_missing_rollout_item", { missing, file: CHECKLIST_FILE });
    }
  }
);

const trackPRoutes = [
  'get("/command-center/funnel-health"',
  'get("/command-center/blocked-runs"',
  'get("/chat/conversations/:conversationId/export"',
  'get("/cases/:caseId/receipt"',
];
checkInvariant(
  "imob.trackp_command_center_routes",
  "IMOB routes expose Command Center funnel/blocked-runs and export/receipt endpoints",
  () => {
    const missing = trackPRoutes.filter((needle) => !imobRoutes.includes(needle));
    if (missing.length > 0) {
      fail("imob_route_missing_trackp_surface", { missing, file: IMOB_ROUTE_FILE });
    }
  }
);

const proofSignals = ["receiptPath", "bundlePath", "verifyUrl"];
checkInvariant(
  "imob.proof_export_signals",
  "IMOB export/receipt routes carry receiptPath/bundlePath/verifyUrl proof signals",
  () => {
    const missing = proofSignals.filter((needle) => !imobRoutes.includes(needle));
    if (missing.length > 0) {
      fail("imob_route_missing_proof_export_signal", { missing, file: IMOB_ROUTE_FILE });
    }
  }
);

if (invariants.length === 0) {
  fail("invariant_set_empty");
}

console.log(
  JSON.stringify(
    {
      ok: true,
      check: CHECK,
      invariants: invariants.map((item) => item.id),
      invariantCount: invariants.length,
      structuralGateBoundary: {
        sha: STRUCTURAL_GATE_BOUNDARY_SHA,
        note: STRUCTURAL_GATE_BOUNDARY_NOTE,
      },
      checklistFile: CHECKLIST_FILE,
      routeFile: IMOB_ROUTE_FILE,
      note:
        "Este check valida somente estrutura de código (checklist de rollout e rotas IMOB " +
        "de Command Center/receipt/export) e depende de uma suíte de testes reais executada " +
        "antes dele no mesmo job (pilot rollout state, Command Center smoke, receipt canon). " +
        "Não lê mais nenhum arquivo de KPIs declarativos, relatório de rollout em Markdown, " +
        "nem execuções do ciclo semanal de telemetria como prova operacional.",
    },
    null,
    2
  )
);
