import assert from "node:assert/strict";
import test from "node:test";

import { CONTRACT_SCHEMAS } from "./contractSchemas";
import {
  applyContractInterviewAnswer,
  createInitialContractInterviewState,
  getContractChoiceOptions,
  getContractTypeByText,
} from "./contractInterviewEngine";

test("tipo de contrato vira botões e o rótulo com acento é aceito", () => {
  const options = getContractChoiceOptions(createInitialContractInterviewState());
  assert.deepEqual(options.map((option) => option.label), ["Locação", "Compra e Venda", "Administração", "Temporada"]);
  for (const option of options) assert.ok(getContractTypeByText(option.reply), option.reply);
  assert.equal(getContractTypeByText("Locação"), "locacao");
  assert.equal(getContractTypeByText("administração"), "administracao");
  assert.equal(getContractTypeByText("2"), "compra_venda");
});

const locacaoAt = (fieldId: string) => {
  const picked = applyContractInterviewAnswer(createInitialContractInterviewState(), "Locação");
  assert.equal(picked.ok, true);
  const index = CONTRACT_SCHEMAS.locacao.fields.findIndex((field) => field.id === fieldId);
  assert.ok(index >= 0, fieldId);
  return { ...picked.state, currentStep: index };
};

test("pergunta de escolha mostra as opções e o clique é aceito pelo parser", () => {
  const state = locacaoAt("property_type");
  const options = getContractChoiceOptions(state);
  assert.deepEqual(options.map((option) => option.label), ["Residencial", "Comercial"]);
  const answered = applyContractInterviewAnswer(state, options[1].reply);
  assert.equal(answered.ok, true);
  assert.equal(answered.state.answers.property_type, "Comercial");
});

test("pergunta aberta não tem botões; sim/não tem dois botões que o parser aceita", () => {
  assert.deepEqual(getContractChoiceOptions(locacaoAt("landlord_name")), []);
  const consent = locacaoAt("lgpd_consent");
  const options = getContractChoiceOptions(consent);
  assert.deepEqual(options.map((option) => option.label), ["Sim", "Não"]);
  assert.equal(applyContractInterviewAnswer(consent, options[0].reply).ok, true);
  assert.equal(applyContractInterviewAnswer(consent, options[1].reply).ok, true);
  assert.deepEqual(getContractChoiceOptions({ ...consent, status: "review" }), []);
  assert.deepEqual(getContractChoiceOptions(null), []);
});
