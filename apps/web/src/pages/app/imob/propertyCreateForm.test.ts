import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImobOwnerOptions,
  buildPropertyBatchConfirmationText,
  buildPropertyBatchForm,
  buildPropertyBatchRequests,
  buildPropertyCreateConfirmationText,
  buildPropertyCreateRequest,
  findDuplicateProperty,
  isPropertyBatchForm,
  isPropertyCreateForm,
  matchOptionByName,
  planPropertyCreate,
  toPropertyBatchBaseValues,
} from "./propertyCreateForm";

const base = { propertyType: "kitnet", goal: "locacao", city: "Itapema", address: "Rua A, 100" };

test("campo híbrido pede intake, nunca converte frase livre em uma unidade", () => {
  for (const unitLabel of ["Tenho três kitnets de teste, da 102 à 104.", "São as salas 1, 2 e 3 desse endereço.", "Cadastre os apartamentos 301 até 305.", "unidade do fundo"]) {
    const plan = planPropertyCreate({ ...base, unitLabel });
    assert.equal(plan.ok, false);
    assert.equal(!plan.ok && plan.needsIntake, true);
  }
  const resolved = planPropertyCreate({ ...base, unitLabel: "Tenho três kitnets de teste, da 102 à 104." }, ["Kitnet 102", "Kitnet 103", "Kitnet 104"]);
  assert.ok(resolved.ok && resolved.mode === "batch");
  assert.equal("request" in resolved, false, "lote ainda exige confirmação");
  assert.equal(planPropertyCreate({ ...base, unitLabel: "Kitnet 102" }).ok, true);
});

test("CEP ausente é válido; CEP informado inválido não desaparece como ausência", () => {
  assert.equal(buildPropertyCreateRequest(base).ok, true);
  for (const cep of ["abc", "123", "123456789", "88220-00x"]) {
    const result = buildPropertyCreateRequest({ ...base, cep });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.cep);
  }
  assert.equal(buildPropertyCreateRequest({ ...base, cep: "88220-000" }).ok, true);
});

test("property form is recognized by its submit target", () => {
  assert.equal(isPropertyCreateForm({ submitTarget: "imob.properties.create" }), true);
  assert.equal(isPropertyCreateForm({ submitTarget: "imob.rentals.create" }), false);
  assert.equal(isPropertyCreateForm({}), false);
});

test("builds the structured request with unit label, occupancy and counts", () => {
  const result = buildPropertyCreateRequest({
    ...base,
    unitLabel: " Kitnet 01 ",
    ownerId: "owner-1",
    occupancy: "em_obra",
    cep: "88220-000",
    neighborhood: "Centro",
    areaM2: "25",
    bedrooms: "1",
    bathrooms: "1",
    garageSpots: "",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request, {
    ownerId: "owner-1",
    propertyType: "kitnet",
    goal: "locacao",
    city: "Itapema",
    address: "Rua A, 100",
    neighborhood: "Centro",
    areaM2: 25,
    bedrooms: 1,
    bathrooms: 1,
    status: "ready",
    metadata: {
      source: "imob_chat_property_form_v1",
      externalPropertyRef: "Kitnet 01",
      cep: "88220000",
      occupancy: { value: "em_obra", origin: "informed_by_manager" },
      underConstruction: true,
    },
  });
});

test("blank occupancy stays unknown and owner is optional", () => {
  const result = buildPropertyCreateRequest(base);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal("ownerId" in result.request, false);
  assert.deepEqual(result.request.metadata.occupancy, { value: null, origin: "unknown" });
});

test("reports required and numeric field errors", () => {
  const result = buildPropertyCreateRequest({ address: "Rua", areaM2: "25,5", bedrooms: "x", cep: "123" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  // Destinação é opcional: não aparece entre os obrigatórios.
  assert.deepEqual(Object.keys(result.errors).sort(), ["address", "areaM2", "bedrooms", "cep", "city", "propertyType"]);
});

test("destinação é opcional: vazio não grava; escolha explícita 'sem destinação' grava; texto livre é normalizado", () => {
  const withoutGoal = { propertyType: base.propertyType, city: base.city, address: base.address };
  const empty = buildPropertyCreateRequest(withoutGoal);
  assert.equal(empty.ok, true);
  if (empty.ok) assert.equal("goal" in empty.request, false);
  const explicit = buildPropertyCreateRequest({ ...base, goal: "sem_destinacao" });
  assert.equal(explicit.ok && explicit.request.goal, "sem_destinacao");
  const free = buildPropertyCreateRequest({ ...base, goal: "Permuta" });
  assert.equal(free.ok && free.request.goal, "permuta");
  const invalid = buildPropertyCreateRequest({ ...base, goal: "xpto" });
  assert.equal(invalid.ok, false);
  if (!invalid.ok) assert.equal(invalid.errors.goal, "Destinação inválida.");
});

test("cadastro de uma unidade recusa várias unidades na identificação (lote tem confirmação própria)", () => {
  const result = buildPropertyCreateRequest({ ...base, unitLabel: "Kitnets 101 a 103" });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.errors.unitLabel, /cadastro em lote/);
  assert.equal(buildPropertyCreateRequest({ ...base, unitLabel: "Apto 301 bloco B" }).ok, true);
});

test("plano: uma unidade grava direto; várias abrem o lote sem montar requisição; faixa inválida bloqueia", () => {
  const single = planPropertyCreate({ ...base, unitLabel: "Kitnet 01" });
  assert.equal(single.ok && single.mode, "single");
  const batch = planPropertyCreate({ ...base, unitLabel: "Kitnets 101 a 105 e Salas 01 e 02" });
  assert.equal(batch.ok && batch.mode, "batch");
  if (batch.ok && batch.mode === "batch") assert.equal(batch.units.length, 7);
  const bad = planPropertyCreate({ ...base, unitLabel: "Kitnets 105 a 101" });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.errors.unitLabel, /Faixa inválida/);
  // campos comuns inválidos também bloqueiam antes da confirmação
  const missing = planPropertyCreate({ propertyType: "kitnet", unitLabel: "Kitnets 101 e 102" });
  assert.equal(missing.ok, false);
});

// ---- confirmação do lote

const batchBase = { ...base, ownerId: "owner-1", unitLabel: "Kitnets 101 a 103" };
const batchForm = () => {
  const plan = planPropertyCreate(batchBase);
  assert.ok(plan.ok && plan.mode === "batch");
  if (!(plan.ok && plan.mode === "batch")) throw new Error("lote esperado");
  return buildPropertyBatchForm(plan.units, batchBase, plan.duplicatesInInput, "b1");
};
const batchValues = (overrides: Record<string, string> = {}) => ({
  ...toPropertyBatchBaseValues(batchBase),
  generalDestination: "locacao",
  unit_0: "Kitnet 101", dest_0: "",
  unit_1: "Kitnet 102", dest_1: "",
  unit_2: "Kitnet 103", dest_2: "",
  extraUnits: "",
  ...overrides,
});

test("formulário do lote: destinação geral opcional + destinação por unidade + adicionar; action único por lote", () => {
  const form = batchForm();
  assert.equal(isPropertyBatchForm(form), true);
  assert.equal(isPropertyCreateForm(form), false, "não confunde com o cadastro de uma unidade");
  assert.equal(form.action, "create_batch:b1");
  assert.deepEqual(form.fields.map((field) => field.name), ["generalDestination", "unit_0", "dest_0", "unit_1", "dest_1", "unit_2", "dest_2", "extraUnits"]);
  assert.equal(form.fields.find((field) => field.name === "generalDestination")?.required, undefined);
  assert.equal(form.fields.find((field) => field.name === "generalDestination")?.value, "locacao");
  assert.equal(form.fields.find((field) => field.name === "dest_1")?.placeholder, "Usar a destinação de todas");
  assert.equal(form.fields.find((field) => field.name === "dest_1")?.options?.length, 7);
});

test("lote: destinação geral vale para todas e o override individual vence", () => {
  const result = buildPropertyBatchRequests(batchValues({ dest_1: "venda", dest_2: "sem_destinacao" }), []);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.items.map((item) => [item.label, item.destination]), [
    ["Kitnet 101", "locacao"], ["Kitnet 102", "venda"], ["Kitnet 103", "sem_destinacao"],
  ]);
  assert.deepEqual(result.items.map((item) => item.request.goal), ["locacao", "venda", "sem_destinacao"]);
  assert.ok(result.items.every((item) => item.request.ownerId === "owner-1" && item.request.address === "Rua A, 100"));
  assert.deepEqual(result.items.map((item) => item.request.metadata.externalPropertyRef), ["Kitnet 101", "Kitnet 102", "Kitnet 103"]);
});

test("lote: sem destinação geral nem individual, nada de destinação é gravado", () => {
  const result = buildPropertyBatchRequests(batchValues({ generalDestination: "" }), []);
  assert.equal(result.ok, true);
  if (result.ok) assert.ok(result.items.every((item) => item.destination === null && !("goal" in item.request)));
});

test("lote: editar, remover e adicionar antes de gravar", () => {
  const result = buildPropertyBatchRequests(batchValues({ unit_0: "Kitnet 101A", unit_1: "", extraUnits: "Kitnets 106 e 107" }), []);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.items.map((item) => item.label), ["Kitnet 101A", "Kitnet 103", "Kitnet 106", "Kitnet 107"]);
  assert.deepEqual(result.items.map((item) => item.field), ["unit_0", "unit_2", "extraUnits", "extraUnits"]);
  assert.ok(result.items.slice(2).every((item) => item.destination === "locacao"), "adicionadas entram com a destinação geral");
});

test("lote: pré-validação bloqueia repetida, já cadastrada, destinação inválida, faixa inválida e lote vazio", () => {
  const repeated = buildPropertyBatchRequests(batchValues({ unit_1: "kitnet 101" }), []);
  assert.equal(repeated.ok, false);
  if (!repeated.ok) assert.match(repeated.errors.unit_1, /mais de uma vez/);

  const existing = [{ id: "p9", status: "ready", address: "rua a, 100", city: "Itapema", metadata: { externalPropertyRef: "Kitnet 102" } }];
  const dup = buildPropertyBatchRequests(batchValues(), existing);
  assert.equal(dup.ok, false);
  if (!dup.ok) assert.match(dup.errors.unit_1, /Já existe/);
  assert.equal(buildPropertyBatchRequests(batchValues(), [{ ...existing[0], status: "archived" }]).ok, true);

  const badDest = buildPropertyBatchRequests(batchValues({ dest_0: "xpto" }), []);
  assert.equal(badDest.ok === false && badDest.errors.dest_0, "Destinação inválida.");
  const badGeneral = buildPropertyBatchRequests(batchValues({ generalDestination: "xpto" }), []);
  assert.equal(badGeneral.ok === false && badGeneral.errors.generalDestination, "Destinação inválida.");
  const badRange = buildPropertyBatchRequests(batchValues({ extraUnits: "Kitnets 109 a 106" }), []);
  assert.equal(badRange.ok === false && /Faixa inválida/.test(badRange.errors.extraUnits), true);
  const noUnits = buildPropertyBatchRequests(batchValues({ extraUnits: "qualquer coisa" }), []);
  assert.equal(noUnits.ok === false && /Quais unidades/.test(noUnits.errors.extraUnits), true);
  const empty = buildPropertyBatchRequests(batchValues({ unit_0: "", unit_1: "", unit_2: "" }), []);
  assert.equal(empty.ok === false && /Nenhuma unidade/.test(empty.errors._form), true);
});

test("lote: confirmação lista o que gravou e o que ficou pendente", () => {
  assert.equal(
    buildPropertyBatchConfirmationText({ created: [{ label: "Kitnet 101" }, { label: "Kitnet 102" }], failed: [], place: "Rua A, 100, Itapema", ownerName: "Fulano" }),
    "2 imóveis cadastrados em Rua A, 100, Itapema: Kitnet 101, Kitnet 102. Proprietário: Fulano.",
  );
  assert.match(buildPropertyBatchConfirmationText({ created: [{ label: "Kitnet 101" }], failed: [{ label: "Kitnet 102" }] }), /Não foi possível cadastrar: Kitnet 102\. Os demais já estão gravados/);
  assert.equal(buildPropertyBatchConfirmationText({ created: [], failed: [{ label: "Kitnet 101" }] }).startsWith("Nenhum imóvel foi cadastrado."), true);
});

test("duplicate check matches address, city and unit label ignoring case and accents", () => {
  const built = buildPropertyCreateRequest({ ...base, unitLabel: "Kitnet 01" });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const items = [
    { id: "p1", status: "ready", address: "rua a, 100", city: "ITAPEMA", metadata: { externalPropertyRef: "kitnet 01" } },
    { id: "p2", status: "ready", address: "Rua A, 100", city: "Itapema", metadata: { externalPropertyRef: "Kitnet 02" } },
  ];
  assert.equal(findDuplicateProperty(built.request, items)?.id, "p1");
  assert.equal(findDuplicateProperty(built.request, [items[1]!]), null);
  assert.equal(findDuplicateProperty(built.request, [{ ...items[0]!, status: "archived" }]), null);
});

test("confirmation text and owner options", () => {
  assert.equal(
    buildPropertyCreateConfirmationText({ label: "Kitnet 01 — Rua A, 100 · Itapema", ownerName: "Fulano", occupancyLabel: "Locado" }),
    'Imóvel cadastrado: Kitnet 01 — Rua A, 100 · Itapema. Proprietário: Fulano. Situação: Locado.',
  );
  assert.deepEqual(
    buildImobOwnerOptions([
      { id: "o2", name: "Bruno", status: "ready" },
      { id: "o1", name: "Ana", status: "pending_data" },
      { id: "o3", name: "Lixo", status: "archived" },
    ]),
    [{ value: "o1", label: "Ana" }, { value: "o2", label: "Bruno" }],
  );
});

test("matchOptionByName acha o proprietário citado no chat só quando há um único compatível", () => {
  const options = [
    { value: "o1", label: "Carlos Alberto Merlo" },
    { value: "o2", label: "Carla Souza" },
    { value: "o3", label: "Maria da Silva" },
    { value: "o4", label: "Maria Souza" },
  ];
  assert.equal(matchOptionByName(options, "carlos a merlo"), "o1");
  assert.equal(matchOptionByName(options, "Maria Silva"), "o3");
  assert.equal(matchOptionByName(options, "maria"), null);
  assert.equal(matchOptionByName(options, "João"), null);
  assert.equal(matchOptionByName(options, ""), null);
});
