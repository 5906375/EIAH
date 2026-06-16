import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const ccPath = path.resolve(import.meta.dirname ?? __dirname, "./ImobCommandCenter.tsx");
const dashPath = path.resolve(
  import.meta.dirname ?? __dirname,
  "../../pages/app/imob/dashboard.tsx",
);

const ccSource = fs.readFileSync(ccPath, "utf8");
const dashSource = fs.readFileSync(dashPath, "utf8");

// --- Prop caseCostWindowDays ---

test("ImobCommandCenter define prop caseCostWindowDays no tipo", () => {
  assert.ok(
    ccSource.includes("caseCostWindowDays?: number"),
    "ImobCommandCenterProps deve declarar caseCostWindowDays?: number",
  );
});

test("ImobCommandCenter usa caseCostWindowDays com default 30", () => {
  assert.ok(
    ccSource.includes("caseCostWindowDays = 30"),
    "destructuring deve conter caseCostWindowDays = 30 como default",
  );
});

// --- costLabel com janela explícita ---

test("ImobCommandCenter inclui janela no costLabel por caso", () => {
  assert.ok(
    ccSource.includes("`${formatCents(costCents)} (${caseCostWindowDays}d)`"),
    "costLabel deve incluir '(${caseCostWindowDays}d)' para comunicar a janela de custo por caso",
  );
});

test("ImobCommandCenter não exibe custo por caso sem indicação de janela", () => {
  const barePattern = /costLabel = hasConsolidatedCost \? formatCents\(costCents\) : null/;
  assert.ok(
    !barePattern.test(ccSource),
    "costLabel não deve usar formatCents puro sem indicar janela — caseCostMap usa windowDays fixo de 30d",
  );
});

// --- dashboard.tsx passa caseCostWindowDays explícito ---

test("dashboard.tsx passa caseCostWindowDays={30} explicitamente para ImobCommandCenter", () => {
  assert.ok(
    dashSource.includes("caseCostWindowDays={30}"),
    "dashboard deve passar caseCostWindowDays={30} para deixar explícita a janela fixa de caseCostMap",
  );
});

// --- Invariantes: endpoints e queries inalterados ---

test("dashboard.tsx mantém apiListImobCaseCosts com windowDays: 30 fixo", () => {
  assert.ok(
    dashSource.includes("apiListImobCaseCosts({ windowDays: 30,"),
    "apiListImobCaseCosts deve continuar com windowDays: 30 — A3 é patch de label, não de dados",
  );
});

test("dashboard.tsx não adicionou kpiWindowDays na chamada de apiListImobCaseCosts", () => {
  const dynamicWindow = /apiListImobCaseCosts\(\{[^}]*kpiWindowDays/;
  assert.ok(
    !dynamicWindow.test(dashSource),
    "apiListImobCaseCosts não deve depender de kpiWindowDays — janela de custo por caso é independente da janela analítica",
  );
});

test("dashboard.tsx mantém apiGetImobKpiFunnel com windowDays: kpiWindowDays", () => {
  assert.ok(
    dashSource.includes("apiGetImobKpiFunnel({ windowDays: kpiWindowDays })"),
    "apiGetImobKpiFunnel deve permanecer inalterado",
  );
});
