import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const ccPath = path.resolve(import.meta.dirname ?? __dirname, "./ImobCommandCenter.tsx");
const heroPath = path.resolve(import.meta.dirname ?? __dirname, "./ImobDashboardHero.tsx");
const dashPath = path.resolve(
  import.meta.dirname ?? __dirname,
  "../../pages/app/imob/dashboard.tsx",
);

const ccSource = fs.readFileSync(ccPath, "utf8");
const heroSource = fs.readFileSync(heroPath, "utf8");
const dashSource = fs.readFileSync(dashPath, "utf8");

// --- Command Center: chip de bloqueios ---

test("ImobCommandCenter chip de bloqueios inclui rótulo de janela '7d'", () => {
  assert.ok(
    ccSource.includes("7d"),
    "ImobCommandCenter deve exibir '7d' no chip de bloqueios (health.summary.blockedTotal é janela operacional fixa)",
  );
});

test("ImobCommandCenter chip de bloqueios não exibe número sem contexto de janela", () => {
  const bareLabel = /Bloqueios:\s*\{health\?\.summary\.blockedTotal[^}]*\}(?!\s*·\s*7d|[^<]*7d)/;
  assert.ok(
    !bareLabel.test(ccSource),
    "chip de bloqueios não deve expor o número sem indicar a janela temporal",
  );
});

test("ImobCommandCenter card de bloqueios inclui rótulo (7d)", () => {
  assert.ok(
    ccSource.includes("(7d)"),
    "card de bloqueios deve incluir '(7d)' para distinguir de snapshot total",
  );
});

// --- Dashboard: totalCostLabel com janela ---

test("dashboard.tsx totalCostLabel inclui kpiWindowDays na string", () => {
  assert.ok(
    dashSource.includes("kpiWindowDays}d)"),
    "totalCostLabel deve incluir '${kpiWindowDays}d' para comunicar a janela analítica do custo",
  );
});

test("dashboard.tsx totalCostLabel não usa currencyFromCents sem indicar janela", () => {
  const barePattern = /totalCostLabel=\{kpiLoading \? "\.\.\."\s*:\s*currencyFromCents\(totalImobRunCostCents\)\}/;
  assert.ok(
    !barePattern.test(dashSource),
    "totalCostLabel não deve exibir custo bruto sem label de janela — custo deriva de kpiFunnel que usa kpiWindowDays",
  );
});

// --- Hero: bloqueados atuais ---

test("ImobDashboardHero diferencia bloqueios snapshot como 'atuais'", () => {
  assert.ok(
    heroSource.includes("bloqueados atuais"),
    "Hero deve rotular o snapshot total como 'bloqueados atuais' para distinguir de 'Bloqueios recentes' do CC (7d)",
  );
});

test("ImobDashboardHero não usa label genérico 'bloqueados' sem qualificador", () => {
  const hasQualified = heroSource.includes("bloqueados atuais");
  const hasBareBloqueados = /label="bloqueados"/.test(heroSource);
  assert.ok(
    hasQualified && !hasBareBloqueados,
    "Hero deve usar 'bloqueados atuais', não 'bloqueados' sem qualificador",
  );
});

// --- Confirmação: endpoints não alterados ---

test("dashboard.tsx não alterou endpoint de kpiFunnel", () => {
  assert.ok(
    dashSource.includes("apiGetImobKpiFunnel({ windowDays: kpiWindowDays })"),
    "endpoint apiGetImobKpiFunnel deve permanecer inalterado com windowDays: kpiWindowDays",
  );
});

test("dashboard.tsx passa window: '7d' explicitamente para apiGetImobFunnelHealth", () => {
  assert.ok(
    dashSource.includes(`apiGetImobFunnelHealth({ workspaceId: session.workspaceId, window: "7d" })`),
    "A1-follow-up: window deve ser passado explicitamente para evitar drift se o default do backend mudar",
  );
});
