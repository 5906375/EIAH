import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCepValue, planImobCepAutofill } from "./types";
import type { StructuredMessage } from "./types";
import { createImobCepLookup } from "./useImobFormState";

function lookupHarness(t: import("node:test").TestContext) {
  const values: Record<string, string> = {};
  const errors: string[] = [];
  let current = true;
  let loading = false;
  const pending: Array<(data: Record<string, string>, status?: number) => void> = [];
  t.mock.method(globalThis, "fetch", (url: string, init?: RequestInit) => {
    assert.match(url, /\/imob\/lookup\/cep\//, "lookup passa pela API interna");
    assert.equal(init?.method, "GET");
    return new Promise<Response>((resolve) => pending.push((data, status = 200) => resolve(new Response(JSON.stringify({ ok: status === 200, data }), { status }))));
  });
  const message: StructuredMessage = { id: "cep-form", role: "assistant", text: "", form: {
    label: "Imóvel", entity: "imovel", action: "create", fields: [
      { name: "city", label: "Cidade", type: "text" }, { name: "address", label: "Endereço", type: "text" },
      { name: "neighborhood", label: "Bairro", type: "text" },
      { name: "cep", label: "CEP", type: "text", lookup: { kind: "cep", autoFillTargets: { city: "city", address: "address", neighborhood: "neighborhood" } } },
    ], actions: [],
  } };
  const lookup = createImobCepLookup({ resolveValues: () => values, isCurrent: () => current,
    updateValue: (_id, field, value) => { values[field] = value; }, setLoading: (_id, _field, value) => { loading = value; },
    setError: (_id, _field, text) => { errors.push(text); },
  });
  return { values, errors, pending, lookup: (cep: string) => lookup(message, "cep", cep), close: () => { current = false; }, loading: () => loading };
}

test("lookup fora de ordem ignora CEP antigo e mantém a edição mais recente", async (t) => {
  const h = lookupHarness(t);
  const old = h.lookup("01001000");
  const recent = h.lookup("89201000");
  h.pending[1]({ cep: "89201-000", city: "Joinville", street: "Rua Nova", neighborhood: "Centro" });
  await recent;
  const snapshot = { ...h.values };
  h.pending[0]({ cep: "01001-000", city: "São Paulo", street: "Praça da Sé", neighborhood: "Sé" });
  assert.equal(await old, null);
  assert.deepEqual(h.values, snapshot);
  assert.equal(h.values.city, "Joinville");
  assert.equal(h.loading(), false);
});

test("edição humana durante lookup é preservada e divergência aparece no formulário", async (t) => {
  const h = lookupHarness(t);
  const pending = h.lookup("01001000");
  Object.assign(h.values, { city: "Itapema", address: "Rua A, 783", neighborhood: "Centro" });
  h.pending[0]({ cep: "01001-000", city: "São Paulo", street: "Praça da Sé", neighborhood: "Sé" });
  await pending;
  assert.deepEqual(h.values, { cep: "01001-000", city: "Itapema", address: "Rua A, 783", neighborhood: "Centro" });
  assert.match(h.errors[0], /Cidade: São Paulo.*Endereço: Praça da Sé.*Mantive o que você informou/);
});

test("limpar CEP ou fechar formulário invalida inclusive erro de lookup pendente", async (t) => {
  const h = lookupHarness(t);
  const old = h.lookup("01001000");
  h.values.cep = "";
  h.pending[0]({}, 404);
  assert.equal(await old, null);
  assert.deepEqual(h.values, { cep: "" });
  assert.deepEqual(h.errors, []);
  const closed = h.lookup("89201000");
  h.close();
  h.pending[1]({ cep: "89201-000", city: "Joinville", street: "Rua Antiga" });
  assert.equal(await closed, null);
  assert.equal("city" in h.values, false);
  await h.lookup("inválido");
  assert.equal(h.pending.length, 2);
  assert.equal(h.loading(), false);
});

test("lookup de CEP completa lacunas e preserva dados humanos equivalentes", () => {
  const result = planImobCepAutofill({ city: "São Paulo", address: "" }, [["cep", "01001-000"], ["city", "SAO PAULO"], ["address", "Praça da Sé"], ["neighborhood", "Sé"]], "cep");
  assert.deepEqual(result.applied, { cep: "01001-000", address: "Praça da Sé", neighborhood: "Sé" });
  assert.deepEqual(result.conflicts, []);
  assert.equal(normalizeCepValue("01001000"), "01001-000");
  assert.equal(normalizeCepValue("abc"), "abc", "inválido continua visível para validação");
  assert.equal(normalizeCepValue("123456789"), "123456789", "não truncar dado inválido em CEP válido");
});

test("lookup divergente não substitui cidade, endereço ou número informado", () => {
  const result = planImobCepAutofill({ city: "Itapema", address: "Rua A, 783", neighborhood: "Centro" }, [["cep", "88220-000"], ["city", "Outra cidade"], ["address", "Rua A"], ["neighborhood", "Bairro B"]], "cep");
  assert.deepEqual(result.applied, { cep: "88220-000" });
  assert.deepEqual(result.conflicts.map((item) => item.informed), ["Itapema", "Rua A, 783", "Centro"]);
  assert.deepEqual(result.conflicts.map((item) => item.lookup), ["Outra cidade", "Rua A", "Bairro B"]);
});
