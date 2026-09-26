import fs from "node:fs";
import path from "node:path";
import {
  STRUCTURAL_GATE_BOUNDARY_SHA,
  STRUCTURAL_GATE_BOUNDARY_NOTE,
} from "./apeStructuralGateBoundary";

const CHECK = "check:w4-non-regression";

function fail(message: string, details?: Record<string, unknown>): never {
  console.error(JSON.stringify({ ok: false, check: CHECK, message, details }, null, 2));
  process.exit(1);
}

const root = process.cwd();
const sessionRouteFile = path.join(root, "apps/api/src/routes/session.ts");
const marketplaceRouteFile = path.join(root, "apps/api/src/routes/marketplace.ts");
const templateFile = path.join(root, "ops/verticals/template/vertical-template.md");
const onboardingFile = path.join(root, "ops/verticals/vertical-onboarding-checklist.md");

for (const [label, file] of [
  ["session route", sessionRouteFile],
  ["marketplace route", marketplaceRouteFile],
  ["vertical template", templateFile],
  ["onboarding checklist", onboardingFile],
] as const) {
  if (!fs.existsSync(file)) fail(`missing ${label}`, { file });
}

const sessionSource = fs.readFileSync(sessionRouteFile, "utf8");
const marketplaceSource = fs.readFileSync(marketplaceRouteFile, "utf8");

type Invariant = { id: string; description: string };
const invariants: Invariant[] = [];
function checkInvariant(id: string, description: string, run: () => void) {
  run();
  invariants.push({ id, description });
}

checkInvariant(
  "session.imob_installed_token",
  "session context exposes IMOB_INSTALLED",
  () => {
    if (!sessionSource.includes("IMOB_INSTALLED")) {
      fail("session context missing required W4 token", { token: "IMOB_INSTALLED" });
    }
  }
);
checkInvariant(
  "session.product_installations_token",
  "session context exposes productInstallations",
  () => {
    if (!sessionSource.includes("productInstallations")) {
      fail("session context missing required W4 token", { token: "productInstallations" });
    }
  }
);

const requiredMarketplaceTokens = [
  "/marketplace/installations/activate",
  "/marketplace/installations",
  "tenant_product_installations",
];
checkInvariant(
  "marketplace.installation_routes_and_model",
  "marketplace routes expose install/activate endpoints and the tenant_product_installations model",
  () => {
    const missing = requiredMarketplaceTokens.filter((token) => !marketplaceSource.includes(token));
    if (missing.length > 0) {
      fail("marketplace routes missing required W4 tokens", { missing });
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
      template: path.relative(root, templateFile),
      onboarding: path.relative(root, onboardingFile),
      note:
        "Este check valida somente estrutura de código (rotas de sessão/marketplace) e " +
        "depende de uma suíte de testes reais executada antes dele no mesmo job " +
        "(instalação de marketplace, idempotência de ativação). Não lê mais o antigo " +
        "arquivo de KPIs declarativos consumido pela versão anterior deste check.",
    },
    null,
    2
  )
);
