import test from "node:test";
import assert from "node:assert/strict";
import { IMOB_ACTION_MENUS } from "@/features/imob/imobActionMenus";
import {
  buildTokenizationForm,
  buildTokenizationInterestConfirmationText,
  buildTokenizationInterestRequest,
  isTokenizationForm,
} from "./tokenizationForm";

test("every menu offers 'Tokenização de ativos'", () => {
  for (const menu of IMOB_ACTION_MENUS) {
    assert.ok(menu.items.some((item) => item.label === "Tokenização de ativos"), menu.label);
  }
});

test("form explains it is not available and never mentions issuing a token", () => {
  for (const subject of ["owners", "properties", "rentals", "deals"] as const) {
    const form = buildTokenizationForm(subject);
    assert.equal(isTokenizationForm(form), true);
    assert.match(form.description ?? "", /Ainda não disponível/);
    assert.match(form.description ?? "", /CVM/);
    assert.deepEqual(form.actions?.map((action) => action.label), ["Fechar", "Registrar interesse"]);
    assert.equal(form.fields.some((field) => field.required), false, "nothing is mandatory");
  }
  assert.deepEqual(buildTokenizationForm("deals").fields.map((field) => field.name), ["objective", "notes"]);
  assert.equal(buildTokenizationForm("owners").fields[0]?.optionsSource, "imob_owners");
  assert.equal(buildTokenizationForm("rentals").fields[0]?.optionsSource, "imob_properties");
});

test("interest is a case record with availability not_available", () => {
  const request = buildTokenizationInterestRequest("properties", { propertyId: "p1", objective: "captar_recursos", notes: " só a sala " });
  assert.deepEqual(request, {
    flow: "tokenization.interest",
    stage: "interest",
    status: "open",
    propertyId: "p1",
    nextStep: "Avaliar viabilidade jurídica e regulatória antes de qualquer estruturação.",
    metadata: {
      source: "imob_chat_tokenization_interest_v1",
      subject: "properties",
      objective: "captar_recursos",
      notes: "só a sala",
      availability: "not_available",
    },
  });
  assert.equal("ownerId" in buildTokenizationInterestRequest("deals", {}), false);
  assert.match(buildTokenizationInterestConfirmationText("rentals"), /Nada foi emitido/);
});
