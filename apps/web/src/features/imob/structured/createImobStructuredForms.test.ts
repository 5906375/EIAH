import test from "node:test";
import assert from "node:assert/strict";
import { IMOB_ACTION_MENUS, type ImobActionMenuItem } from "@/features/imob/imobActionMenus";
import { createImobStructuredForms } from "./createImobStructuredForms";
import type { ImobFormState } from "./useImobFormState";
import type { ImobStructuredFormsHost, StructuredMessage } from "./types";

/** Estado de formulário em memória (sem React), como um chat qualquer manteria. */
function fakeState() {
  let values: Record<string, Record<string, string>> = {};
  let errors: Record<string, Record<string, string>> = {};
  const state = {
    formValuesByMessageId: values,
    setFormValuesByMessageId: (update: unknown) => {
      values = typeof update === "function" ? (update as (prev: typeof values) => typeof values)(values) : (update as typeof values);
    },
    formErrorsByMessageId: errors,
    setFormErrorsByMessageId: (update: unknown) => {
      errors = typeof update === "function" ? (update as (prev: typeof errors) => typeof errors)(errors) : (update as typeof errors);
    },
    formLookupLoadingByMessageId: {},
    imobPropertyOptions: [],
    imobOwnerOptions: [],
    formSubmittingRef: { current: new Set<string>() },
    ownerNameConfirmedRef: { current: {} },
    ownerRecordsRef: { current: [] },
    ownerArchiveConfirmedRef: { current: {} },
    formFilesRef: { current: {} },
    pendingFormPrefillRef: { current: null as { submitTarget: string; values: Record<string, string> } | null },
    contractAfterLeaseRef: { current: null },
    propertyRecordsRef: { current: [] },
    resolveFormFieldOptions: () => [],
    resolveFormValuesForMessage: (message: StructuredMessage) => values[message.id] ?? {},
    updateFormFieldValue: () => undefined,
    applyCepLookupToForm: async () => null,
    prepareIncomingMessage: <M,>(message: M) => message,
  };
  return { state: state as unknown as ImobFormState, getValues: () => values, getErrors: () => errors, raw: state };
}

function fakeHost() {
  const appended: StructuredMessage[] = [];
  const updated: Array<[string, Partial<StructuredMessage>]> = [];
  const sent: Array<[string, string]> = [];
  const host: ImobStructuredFormsHost = {
    activeThreadId: "thread-1",
    appendMessage: (message) => appended.push(message),
    updateMessage: (id, patch) => updated.push([id, patch]),
    patchMessage: () => undefined,
    persistMessage: () => undefined,
    sendText: (text, options) => sent.push([text, options.displayText]),
  };
  return { host, appended, updated, sent };
}

const localItems = IMOB_ACTION_MENUS.flatMap((menu) => menu.items).filter(
  (item): item is Extract<ImobActionMenuItem, { kind: "local" }> => item.kind === "local",
);

test("todo item local dos menus abre um formulário estruturado na thread ativa do chat hospedeiro", () => {
  for (const item of localItems) {
    const { state } = fakeState();
    const { host, appended } = fakeHost();
    createImobStructuredForms(state, host).handleActionMenuSelect(item);
    assert.equal(appended.length, 1, item.id);
    assert.ok(appended[0].form?.submitTarget, `${item.id} sem submitTarget`);
    assert.equal(appended[0].thread?.id, "thread-1", item.id);
  }
});

test("itens de pedido (cadastrar) viram texto para o chat, com o rótulo exibido", () => {
  const { state } = fakeState();
  const { host, sent } = fakeHost();
  const forms = createImobStructuredForms(state, host);
  forms.handleActionMenuSelect({ id: "owner-create", label: "Cadastrar proprietário", kind: "prompt", prompt: "cadastrar proprietário" });
  assert.deepEqual(sent, [["cadastrar proprietário", "Cadastrar proprietário"]]);
});

test("próximo passo prepara o formulário seguinte já ligado ao cadastro", () => {
  const { state, raw } = fakeState();
  const { host, sent } = fakeHost();
  createImobStructuredForms(state, host).startPropertyCreateFor("owner-9");
  assert.deepEqual(raw.pendingFormPrefillRef.current, { submitTarget: "imob.properties.create", values: { ownerId: "owner-9" } });
  assert.deepEqual(sent, [["cadastrar imóvel", "Cadastrar imóvel"]]);
});

test("formulário que não é do IMOB estruturado fica com o chat; cancelar um estruturado fecha sem gravar", async () => {
  const { state } = fakeState();
  const { host, appended, updated } = fakeHost();
  const forms = createImobStructuredForms(state, host);
  const generic: StructuredMessage = {
    id: "m1",
    role: "assistant",
    text: "",
    form: { entity: "anuncio", action: "publish", fields: [], actions: [] },
  };
  assert.equal(await forms.handleStructuredFormAction(generic, "submit"), false);

  forms.openRentalLifecycleForm("rental_history");
  const history = appended[0];
  assert.equal(await forms.handleStructuredFormAction(history, "cancel"), true);
  assert.deepEqual(updated, [[history.id, { form: undefined }]]);
  assert.equal(appended.at(-1)?.text, "Histórico fechado.");
});

test("enviar sem escolher o imóvel mostra o erro no campo, sem chamar a API", async () => {
  const { state, getErrors } = fakeState();
  const { host, appended } = fakeHost();
  const forms = createImobStructuredForms(state, host);
  forms.openRentalLifecycleForm("rental_history");
  assert.equal(await forms.handleStructuredFormAction(appended[0], "submit"), true);
  assert.deepEqual(getErrors()[appended[0].id], { propertyId: "Selecione o imóvel." });
});
