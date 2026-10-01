import assert from "node:assert/strict";
import test from "node:test";

import { IMOB_ACTION_MENUS } from "@/features/imob/imobActionMenus";
import {
  DOCUMENT_ATTACH_SUBMIT_TARGET,
  buildDocumentAttachConfirmationText,
  buildDocumentAttachForm,
  buildDocumentLinkRequest,
  describeDocumentAttachError,
  isDocumentAttachForm,
  validateDocumentAttachValues,
} from "./documentAttachForm";

test("Anexar documento aparece em Proprietários, Imóveis e Locações", () => {
  for (const menuId of ["owners", "properties", "rentals"]) {
    const menu = IMOB_ACTION_MENUS.find((item) => item.id === menuId)!;
    assert.ok(menu.items.some((item) => item.label === "Anexar documento" && item.kind === "local"), menuId);
  }
  const deals = IMOB_ACTION_MENUS.find((item) => item.id === "deals")!;
  assert.equal(deals.items.some((item) => item.label === "Anexar documento"), false);
});

test("formulário grava direto na rota de vínculo, com arquivo obrigatório", () => {
  for (const subject of ["owners", "properties", "rentals"] as const) {
    const form = buildDocumentAttachForm(subject);
    assert.equal(form.submitTarget, DOCUMENT_ATTACH_SUBMIT_TARGET);
    assert.ok(isDocumentAttachForm(form));
    const file = form.fields.find((field) => field.name === "file")!;
    assert.equal(file.type, "file");
    assert.equal(file.required, true);
  }
  assert.equal(buildDocumentAttachForm("owners").fields[0].optionsSource, "imob_owners");
  assert.equal(buildDocumentAttachForm("rentals").fields[0].optionsSource, "imob_properties");
});

test("categorias de cada assunto", () => {
  const categories = (subject: "owners" | "properties" | "rentals") =>
    buildDocumentAttachForm(subject).fields.find((field) => field.name === "category")!.options!.map((option) => option.value);
  assert.ok(categories("rentals").includes("contrato_assinado"));
  assert.ok(categories("properties").includes("matricula"));
  assert.ok(categories("owners").includes("documento_identidade"));
  assert.equal(categories("properties").includes("contrato_assinado"), false);
});

test("validação pede cadastro, tipo e arquivo", () => {
  assert.deepEqual(Object.keys(validateDocumentAttachValues("owners", {}, 0)).sort(), ["category", "file", "ownerId"]);
  assert.deepEqual(Object.keys(validateDocumentAttachValues("rentals", { propertyId: "p", category: "vistoria" }, 9)), ["file"]);
  assert.deepEqual(validateDocumentAttachValues("properties", { propertyId: "p", category: "iptu" }, 1), {});
});

test("pedido de vínculo usa o tipo certo e omite observação vazia", () => {
  assert.deepEqual(buildDocumentLinkRequest("rentals", { propertyId: " p1 ", category: "contrato_assinado", notes: " " }, ["d1"]), {
    subjectType: "rental",
    subjectId: "p1",
    category: "contrato_assinado",
    documentIds: ["d1"],
  });
  assert.equal(buildDocumentLinkRequest("owners", { ownerId: "o1", category: "outro", notes: "frente e verso" }, ["d1"]).notes, "frente e verso");
});

test("confirmação e erros em português", () => {
  const text = buildDocumentAttachConfirmationText({
    subject: "rentals",
    subjectLabel: "Kitnet 01",
    category: "contrato_assinado",
    fileNames: ["contrato.pdf"],
    alreadyLinked: 0,
    contractPendingCleared: true,
  });
  assert.match(text, /Anexado à locação de Kitnet 01 como Contrato assinado: contrato\.pdf\./);
  assert.match(text, /Pendência de contrato resolvida/);
  assert.match(
    buildDocumentAttachConfirmationText({ subject: "properties", subjectLabel: "Sala 2", category: "iptu", fileNames: [], alreadyLinked: 1 }),
    /já estava anexado/,
  );
  assert.match(describeDocumentAttachError("rentals", 404, "RENTAL_LEASE_NOT_FOUND"), /não tem locação ativa/);
  assert.match(describeDocumentAttachError("owners", 403, "IMOB_WORKSPACE_PERMISSION_FORBIDDEN"), /Sua função atual/);
  assert.match(describeDocumentAttachError("owners", 413, undefined), /5 MB/);
});
