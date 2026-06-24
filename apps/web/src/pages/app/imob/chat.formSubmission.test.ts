import test from "node:test";
import assert from "node:assert/strict";
import type { ImobPresentationForm } from "@/lib/api";
import { buildPresentationFormSubmission } from "./chat";

test("buildPresentationFormSubmission serializes proposal forms", () => {
  const form: ImobPresentationForm = {
    entity: "proposta",
    action: "create",
    label: "Proposta",
    description: "Continuar proposta comercial.",
    fields: [
      { name: "propertyId", label: "Imóvel da proposta", type: "text", required: true, value: "4455" },
      { name: "buyerName", label: "Nome do comprador", type: "text", required: true, value: "Maria" },
      { name: "buyerPhone", label: "Telefone do comprador", type: "tel", required: true, value: "47999998888" },
      { name: "buyerEmail", label: "E-mail do comprador", type: "email", value: "maria@gmail.com" },
      { name: "offerAmount", label: "Valor da proposta", type: "text", required: true, value: "100000" },
      { name: "contractType", label: "Tipo de proposta", type: "text", required: true, value: "venda" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Continuar proposta", kind: "primary" },
    ],
  };

  const payload = buildPresentationFormSubmission(form, {});

  assert.match(payload, /continuar proposta/i);
  assert.match(payload, /imóvel da proposta 4455/i);
  assert.match(payload, /nome do comprador Maria/i);
  assert.match(payload, /telefone do comprador 47999998888/i);
  assert.match(payload, /e-mail do comprador maria@gmail\.com/i);
  assert.match(payload, /valor da proposta 100000/i);
  assert.match(payload, /tipo de proposta venda/i);
});
