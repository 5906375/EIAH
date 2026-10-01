import test from "node:test";
import assert from "node:assert/strict";
import {
  buildImobOwnerOptions,
  buildPropertyCreateConfirmationText,
  buildPropertyCreateRequest,
  findDuplicateProperty,
  isPropertyCreateForm,
} from "./propertyCreateForm";

const base = { propertyType: "kitnet", goal: "locacao", city: "Itapema", address: "Rua A, 100" };

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
  assert.deepEqual(Object.keys(result.errors).sort(), ["address", "areaM2", "bedrooms", "cep", "city", "goal", "propertyType"]);
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
