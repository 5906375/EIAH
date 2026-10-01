import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOwnerCreateConfirmationText,
  buildOwnerCreateRequest,
  findOwnerDuplicate,
  isOwnerCreateForm,
  isValidCnpj,
} from "./ownerCreateForm";

const VALID_CNPJ = "11222333000181";

test("owner form is recognized by its submit target", () => {
  assert.equal(isOwnerCreateForm({ submitTarget: "imob.owners.create" }), true);
  assert.equal(isOwnerCreateForm({ submitTarget: "imob.properties.create" }), false);
});

test("CNPJ checksum", () => {
  assert.equal(isValidCnpj(VALID_CNPJ), true);
  assert.equal(isValidCnpj("11222333000180"), false);
  assert.equal(isValidCnpj("11111111111111"), false);
});

test("person: valid CPF, digits-only contact, ready when complete", () => {
  const result = buildOwnerCreateRequest({
    personType: "person",
    ownerName: " Fulano de Tal ",
    ownerDocument: "529.982.247-25",
    ownerPhone: "(47) 99999-0000",
    ownerEmail: "fulano@email.com",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.request, {
    name: "Fulano de Tal",
    personType: "person",
    document: "52998224725",
    phone: "47999990000",
    email: "fulano@email.com",
    status: "ready",
    pendingItems: [],
    metadata: { source: "imob_chat_owner_form_v1" },
  });
});

test("company requires CNPJ, person requires CPF; blanks become pending", () => {
  const company = buildOwnerCreateRequest({ personType: "company", ownerName: "Imob X", ownerDocument: "11.222.333/0001-81" });
  assert.equal(company.ok, true);
  if (company.ok) {
    assert.equal(company.request.personType, "company");
    assert.deepEqual(company.request.pendingItems, ["contato"]);
    assert.equal(company.request.status, "pending_data");
  }
  const wrongKind = buildOwnerCreateRequest({ personType: "person", ownerName: "A", ownerDocument: VALID_CNPJ });
  assert.equal(wrongKind.ok, false);
  if (!wrongKind.ok) assert.match(wrongKind.errors.ownerDocument, /CPF com 11 dígitos/);
  const badCpf = buildOwnerCreateRequest({ personType: "person", ownerName: "A", ownerDocument: "529.982.247-00" });
  assert.equal(badCpf.ok, false);
  const onlyName = buildOwnerCreateRequest({ ownerName: "Só Nome" });
  assert.equal(onlyName.ok, true);
  if (onlyName.ok) assert.deepEqual(onlyName.request.pendingItems, ["cpf", "contato"]);
  const noName = buildOwnerCreateRequest({});
  assert.equal(noName.ok, false);
});

test("duplicates: strong identifiers block, same name only asks for confirmation", () => {
  const built = buildOwnerCreateRequest({ ownerName: "Fulano de Tal", ownerDocument: "529.982.247-25", ownerPhone: "47999990000" });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  const owners = [
    { id: "o1", name: "Outro Nome", document: "529.982.247-25", status: "ready" },
    { id: "o2", name: "FULANO DE TÁL", status: "ready" },
  ];
  assert.deepEqual(findOwnerDuplicate(built.request, owners), { kind: "strong", owner: owners[0] });
  assert.deepEqual(findOwnerDuplicate(built.request, [owners[1]!]), { kind: "name", owner: owners[1] });
  assert.equal(findOwnerDuplicate(built.request, [{ ...owners[0]!, status: "archived" }]), null);
});

test("confirmation never shows the full document", () => {
  const text = buildOwnerCreateConfirmationText({ name: "Fulano", personType: "person", document: "52998224725", pendingItems: ["contato"] });
  assert.equal(text, 'Proprietário cadastrado: Fulano (CPF final 25). Pendências: telefone ou e-mail. Ele já aparece na lista do "Cadastrar imóvel".');
  assert.doesNotMatch(text, /52998224725/);
});
