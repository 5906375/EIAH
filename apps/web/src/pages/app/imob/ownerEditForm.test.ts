import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOwnerEditForm,
  buildOwnerUpdateConfirmationText,
  buildOwnerUpdateRequest,
  isOwnerEditForm,
  ownerToEditValues,
} from "./ownerEditForm";

const owners = [
  { id: "o1", name: "Carlos", personType: "person", document: "47999674434", phone: null, email: null, status: "ready" },
  { id: "o2", name: "Outra Pessoa", personType: "person", document: "52998224725", phone: "47988887777", email: null, status: "ready" },
];

test("edit form: owner picker from CRM, archive action, recognized by submit target", () => {
  const form = buildOwnerEditForm();
  assert.equal(isOwnerEditForm(form), true);
  assert.equal(form.fields[0]?.optionsSource, "imob_owners");
  assert.deepEqual(form.actions?.map((action) => action.id), ["cancel", "archive", "submit"]);
});

test("current values prefill the form, including a wrong document as stored", () => {
  assert.deepEqual(ownerToEditValues(owners[0]!), {
    ownerId: "o1", personType: "person", ownerName: "Carlos", ownerDocument: "47999674434", ownerPhone: "", ownerEmail: "",
  });
});

test("a phone stored as document is refused until a valid CPF is typed", () => {
  const stored = buildOwnerUpdateRequest(ownerToEditValues(owners[0]!), owners);
  assert.equal(stored.ok, false);
  if (!stored.ok) assert.match(stored.errors.ownerDocument, /CPF inválido/);

  const fixed = buildOwnerUpdateRequest(
    { ...ownerToEditValues(owners[0]!), ownerDocument: "111.444.777-35", ownerPhone: "(47) 99967-4434" },
    owners,
  );
  assert.equal(fixed.ok, true);
  if (!fixed.ok) return;
  assert.equal(fixed.ownerId, "o1");
  assert.equal("metadata" in fixed.request, false, "PATCH never replaces existing metadata");
  assert.equal(fixed.request.document, "11144477735");
  assert.equal(fixed.request.phone, "47999674434");
  assert.equal(fixed.request.status, "ready");
});

test("another owner's document blocks the edit; the owner's own data does not", () => {
  const clash = buildOwnerUpdateRequest({ ...ownerToEditValues(owners[0]!), ownerDocument: "529.982.247-25" }, owners);
  assert.equal(clash.ok, false);
  if (!clash.ok) assert.match(clash.errors._form, /Outra Pessoa/);
  const self = buildOwnerUpdateRequest(ownerToEditValues(owners[1]!), owners);
  assert.equal(self.ok, true);
});

test("owner must be selected; confirmation hides the document", () => {
  const none = buildOwnerUpdateRequest({ ownerName: "X" }, owners);
  assert.equal(none.ok, false);
  assert.equal(buildOwnerUpdateConfirmationText({ name: "Carlos", personType: "person", document: "11144477735" }), "Proprietário atualizado: Carlos (CPF final 35).");
});
