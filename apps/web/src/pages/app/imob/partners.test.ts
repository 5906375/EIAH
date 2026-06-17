import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

// Non-regression: partners.tsx must not use the old misleading label
test("partners.tsx does not contain 'Casos em parceria'", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !source.includes("Casos em parceria"),
    "KPI label 'Casos em parceria' should be renamed — it counts delegation policies, not CRM cases",
  );
});

test("partners.tsx uses 'Políticas delegadas' as KPI label", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes("Políticas delegadas"),
    "partners.tsx must use 'Políticas delegadas' as the KPI label for delegation policy count",
  );
});

test("partners.tsx does not use activeCases field name", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !source.includes("activeCases"),
    "partners.tsx must use delegationPoliciesCount instead of activeCases",
  );
});

test("partners.tsx uses delegationPoliciesCount field name", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes("delegationPoliciesCount"),
    "partners.tsx must use delegationPoliciesCount to make semantics explicit",
  );
});

// --- A5: remoção de syntheticPartners e fallback sintético ---

test("partners.tsx não declara syntheticPartners", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !source.includes("syntheticPartners"),
    "syntheticPartners foi removido — fallback sintético não deve existir em surface operacional",
  );
});

test("partners.tsx não usa IDs sintéticos de parceiro", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !source.includes("partner-prime") && !source.includes("partner-litoral") && !source.includes("partner-atlantica"),
    "IDs sintéticos (partner-prime, partner-litoral, partner-atlantica) não devem existir em partners.tsx",
  );
});

test("partners.tsx inicializa partners como array vazio", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes("useState<PartnerRow[]>([])"),
    "estado inicial de partners deve ser [] — não syntheticPartners",
  );
});

test("partners.tsx usa source 'empty' para API vazia (não fallback)", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes(`setSource("empty")`),
    "API sem delegações deve resultar em source='empty', não 'fallback'",
  );
});

test("partners.tsx usa source 'error' para falha de API (não fallback)", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes(`setSource("error")`),
    "erro de API deve resultar em source='error', não 'fallback'",
  );
});

test("partners.tsx não usa 'fallback' como valor de source", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !source.includes(`"fallback"`),
    "source='fallback' foi substituído por 'empty' e 'error' — semântica explícita",
  );
});

test("partners.tsx não usa delegateeId como fallback de nome de parceiro", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    !source.includes("|| item.delegateeId ||"),
    "delegateeId não deve aparecer na cadeia de fallback de partnerName — UUIDs não são nomes de parceiro",
  );
});

test("partners.tsx usa fallback de nome 'Parceiro sem nome cadastrado'", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes("Parceiro sem nome cadastrado"),
    "fallback de nome deve ser 'Parceiro sem nome cadastrado', não o UUID do delegateeId",
  );
});

test("partners.tsx badge de fonte distingue 'delegações marketplace' de 'sem delegações'", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes("delegações marketplace") && source.includes("sem delegações"),
    "badge de fonte deve comunicar origem (delegações marketplace) e estado vazio (sem delegações)",
  );
});

test("partners.tsx não alterou apiListDelegations", () => {
  const filePath = path.resolve(import.meta.dirname ?? __dirname, "./partners.tsx");
  const source = fs.readFileSync(filePath, "utf8");
  assert.ok(
    source.includes(`apiListDelegations({ role: "all", workspaceScoped: true })`),
    "apiListDelegations deve permanecer inalterado — A5 é patch de label e estado, não de dados",
  );
});
