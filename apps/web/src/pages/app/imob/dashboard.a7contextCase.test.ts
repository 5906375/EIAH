import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

const dashPath = path.resolve(import.meta.dirname ?? __dirname, "./dashboard.tsx");
const dashSource = fs.readFileSync(dashPath, "utf8");

// --- contextCaseSource: tipo e derivação ---

test("dashboard.tsx declara contextCaseSource no retorno do useMemo", () => {
  assert.ok(
    dashSource.includes("contextCaseSource"),
    "contextCaseSource deve ser derivado junto com contextCase no mesmo useMemo",
  );
});

test("dashboard.tsx define tipo de contextCaseSource com ramo 'heuristic'", () => {
  assert.ok(
    dashSource.includes('"heuristic"'),
    "contextCaseSource deve incluir o valor 'heuristic' para distinguir o ramo de fallback por texto",
  );
});

test("dashboard.tsx retorna contextCaseSource 'requested' quando requestedCaseId resolve o caso", () => {
  assert.ok(
    dashSource.includes(`contextCaseSource: c ? "requested" : null`),
    "ramo requestedCaseId deve retornar contextCaseSource: 'requested'",
  );
});

test("dashboard.tsx retorna contextCaseSource 'thread' quando threadId resolve o caso", () => {
  assert.ok(
    dashSource.includes(`contextCaseSource: "thread"`),
    "ramo selectedThreadId → case.threadId deve retornar contextCaseSource: 'thread'",
  );
});

test("dashboard.tsx retorna contextCaseSource 'run' quando run resolve o caso", () => {
  assert.ok(
    dashSource.includes(`contextCaseSource: "run"`),
    "ramo run lookup deve retornar contextCaseSource: 'run'",
  );
});

test("dashboard.tsx retorna contextCaseSource 'heuristic' nos três ramos de label matching", () => {
  const matches = (dashSource.match(/contextCaseSource: "heuristic"/g) ?? []).length;
  assert.ok(
    matches >= 3,
    `todos os três ramos de text-match de label (imóvel, lead, document) devem retornar contextCaseSource: 'heuristic'; encontrado: ${matches}`,
  );
});

// --- UI: badge quando heurística ---

test("dashboard.tsx exibe badge 'estimado por contexto da thread' quando contextCaseSource é heuristic", () => {
  assert.ok(
    dashSource.includes("estimado por contexto da thread"),
    "card Caso deve exibir texto qualificador quando caso foi estimado por heurística de label",
  );
});

test("dashboard.tsx condiciona badge a contextCaseSource === 'heuristic'", () => {
  assert.ok(
    dashSource.includes(`contextCaseSource === "heuristic"`),
    "badge de heurística deve ser condicional a contextCaseSource === 'heuristic'",
  );
});

// --- Invariantes: lógica de resolução e deeplinks inalterados ---

test("dashboard.tsx mantém os três ramos de text-match (imóvel, lead, document)", () => {
  const hasImovel = dashSource.includes('threadLabel.includes("imóvel")');
  const hasLead = dashSource.includes('threadLabel.includes("lead")');
  const hasDocument = dashSource.includes('threadLabel.includes("document")');
  assert.ok(
    hasImovel && hasLead && hasDocument,
    "os três ramos de heurística de label (imóvel, lead, document) devem permanecer inalterados",
  );
});

test("dashboard.tsx mantém deeplinks com contextCase.id (lógica inalterada)", () => {
  assert.ok(
    dashSource.includes("caseId: contextCase.id"),
    "deeplinks de ação devem continuar usando contextCase.id — A7 é patch de label, não de lógica",
  );
});

test("dashboard.tsx não alterou endpoint apiGetImobKpiFunnel", () => {
  assert.ok(
    dashSource.includes("apiGetImobKpiFunnel({ windowDays: kpiWindowDays })"),
    "endpoint apiGetImobKpiFunnel deve permanecer inalterado",
  );
});
