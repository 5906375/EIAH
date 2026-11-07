import test from "node:test";
import assert from "node:assert/strict";
import { IMOB_ACTION_MENUS, listImobActionMenuPrompts } from "@/features/imob/imobActionMenus";
import { buildOwnerEditForm } from "./ownerEditForm";
import {
  buildPropertyEditForm,
  buildPropertyUpdateRequest,
  isPropertyEditForm,
  propertyToEditValues,
} from "./propertyEditForm";

const property = {
  id: "p1",
  status: "ready",
  ownerId: "o1",
  propertyType: "kitnet",
  goal: "locacao",
  address: "Rua A, 100",
  city: "Itapema",
  neighborhood: "Centro",
  areaM2: 25,
  bedrooms: 1,
  bathrooms: 1,
  garageSpots: null,
  metadata: { externalPropertyRef: "Kitnet 01", occupancy: { value: "locado", origin: "informed_by_manager" }, importKey: "K01", cep: "88220000" },
};

test("menus group actions by subject and only list working actions", () => {
  assert.deepEqual(IMOB_ACTION_MENUS.map((menu) => menu.label), ["Gestão", "Proprietários", "Imóveis", "Locações", "Negócios"]);
  const labels = IMOB_ACTION_MENUS.flatMap((menu) => menu.items.map((item) => item.label));
  for (const label of ["Cadastrar proprietário", "Editar proprietário", "Arquivar proprietário", "Cadastrar imóvel", "Editar imóvel", "Arquivar imóvel", "Captar imóvel", "Cadastrar locação", "Gerar proposta", "Contrato de locação", "Contrato de venda", "Gerar contrato"]) {
    assert.ok(labels.includes(label), label);
  }
  assert.ok(listImobActionMenuPrompts().some((item) => item.prompt === "cadastrar locatário"));
});

test("archive modes only ask which record", () => {
  const ownerArchive = buildOwnerEditForm("archive");
  assert.deepEqual(ownerArchive.fields.map((field) => field.name), ["ownerId"]);
  assert.deepEqual(ownerArchive.actions?.map((action) => action.id), ["cancel", "archive"]);
  const propertyArchive = buildPropertyEditForm("archive");
  assert.equal(isPropertyEditForm(propertyArchive), true);
  assert.deepEqual(propertyArchive.fields.map((field) => field.name), ["propertyId"]);
});

test("current property values prefill the edit form", () => {
  const values = propertyToEditValues(property);
  assert.equal(values.unitLabel, "Kitnet 01");
  assert.equal(values.occupancy, "locado");
  assert.equal(values.garageSpots, "");
  assert.equal(values.cep, "88220000");
});

test("update keeps unrelated metadata, changes edited fields and can clear numbers", () => {
  const result = buildPropertyUpdateRequest(
    { ...propertyToEditValues(property), occupancy: "vago", unitLabel: "", bedrooms: "", ownerId: "" },
    [property],
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.propertyId, "p1");
  assert.equal(result.request.ownerId, null);
  assert.equal(result.request.bedrooms, null);
  assert.equal(result.request.areaM2, 25);
  assert.equal(result.request.metadata.importKey, "K01", "unrelated metadata is kept");
  assert.deepEqual(result.request.metadata.occupancy, { value: "vago", origin: "informed_by_manager" });
  assert.equal("externalPropertyRef" in result.request.metadata, false, "cleared unit label is removed");
});

test("update refuses unknown record and duplicates of another property", () => {
  assert.equal(buildPropertyUpdateRequest({ ...propertyToEditValues(property), propertyId: "nope" }, [property]).ok, false);
  const other = { ...property, id: "p2", metadata: { externalPropertyRef: "Kitnet 02" } };
  const clash = buildPropertyUpdateRequest({ ...propertyToEditValues(other), unitLabel: "Kitnet 01" }, [property, other]);
  assert.equal(clash.ok, false);
});

// ---- destinação na edição

test("edição oferece as 7 destinações e em branco mantém a atual (não envia goal)", () => {
  const form = buildPropertyEditForm("edit");
  const goal = form.fields.find((field) => field.name === "goal");
  assert.equal(goal?.required, undefined);
  assert.deepEqual(goal?.options?.map((option) => option.value), [
    "venda", "locacao", "aluguel_por_temporada", "permuta", "uso_proprio", "manutencao", "sem_destinacao",
  ]);
  const values = { ...propertyToEditValues(property), goal: "" };
  const kept = buildPropertyUpdateRequest(values, [property]);
  assert.equal(kept.ok, true);
  if (kept.ok) assert.equal("goal" in kept.request, false);
  const changed = buildPropertyUpdateRequest({ ...values, goal: "permuta" }, [property]);
  assert.equal(changed.ok && changed.request.goal, "permuta");
});

test("edição: destinação legada desconhecida não bloqueia nem é sobrescrita", () => {
  const legacy = { ...property, goal: "outro_legado" };
  const values = propertyToEditValues(legacy);
  assert.equal(values.goal, "");
  const result = buildPropertyUpdateRequest(values, [legacy]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal("goal" in result.request, false);
  assert.equal(propertyToEditValues({ ...property, goal: "temporada" }).goal, "aluguel_por_temporada");
});
