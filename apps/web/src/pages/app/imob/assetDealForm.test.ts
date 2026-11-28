import test from "node:test";
import assert from "node:assert/strict";
import {
  assetDealKindOf,
  buildAssetDealConfirmationText,
  buildAssetDealForm,
  buildAssetDealRequest,
  describeAssetDealError,
  isAssetDealForm,
} from "./assetDealForm";

test("formulário de venda: imóvel e situação obrigatórios; sem campos de permuta", () => {
  const form = buildAssetDealForm("venda");
  assert.equal(isAssetDealForm(form), true);
  assert.equal(assetDealKindOf(form), "venda");
  assert.deepEqual(form.fields.filter((field) => field.required).map((field) => field.name), ["propertyId", "state"]);
  assert.equal(form.fields.some((field) => field.name === "torna"), false);
  assert.equal(form.fields.find((field) => field.name === "propertyId")?.optionsSource, "imob_properties");
});

test("formulário de permuta: bem recebido, valor atribuído e torna", () => {
  const form = buildAssetDealForm("permuta");
  assert.equal(assetDealKindOf(form), "permuta");
  assert.deepEqual(
    form.fields.map((field) => field.name),
    ["propertyId", "state", "counterpartyName", "askingPrice", "receivedAssetDescription", "receivedValue", "torna", "notes"],
  );
});

test("venda: monta a requisição com valores em centavos; vazio vira null", () => {
  const result = buildAssetDealRequest("venda", { propertyId: "p1", state: "em_andamento", askingPrice: "250.000,00", counterpartyName: " Comprador " });
  assert.deepEqual(result, {
    ok: true,
    request: { propertyId: "p1", kind: "venda", state: "em_andamento", askingPriceCents: 25_000_000, counterpartyName: "Comprador", notes: null },
  });
  const blank = buildAssetDealRequest("venda", { propertyId: "p1", state: "concluida" });
  assert.equal(blank.ok && blank.request.askingPriceCents, null);
});

test("permuta: inclui bem recebido, valor e torna", () => {
  const result = buildAssetDealRequest("permuta", {
    propertyId: "p1", state: "em_andamento", askingPrice: "300.000,00", receivedAssetDescription: "Terreno 300 m²", receivedValue: "250.000,00", torna: "50.000,00",
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.request.kind, "permuta");
  assert.equal(result.request.receivedAssetDescription, "Terreno 300 m²");
  assert.equal(result.request.receivedValueCents, 25_000_000);
  assert.equal(result.request.tornaCents, 5_000_000);
});

test("validação: imóvel, situação e valores", () => {
  const result = buildAssetDealRequest("permuta", { askingPrice: "abc", torna: "1,234", receivedValue: "x" });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(Object.keys(result.errors).sort(), ["askingPrice", "propertyId", "receivedValue", "state", "torna"]);
  // campos de permuta são ignorados na venda
  assert.equal(buildAssetDealRequest("venda", { propertyId: "p1", state: "concluida", torna: "lixo" }).ok, true);
});

test("confirmação: sem nome da contraparte; avisa quando o valor ficou só no negócio", () => {
  const text = buildAssetDealConfirmationText({ propertyLabel: "Kitnet 101", kind: "venda", state: "em_andamento", askingPriceCents: 25_000_000, propertyProjection: "applied" });
  assert.match(text, /^Venda registrada: Kitnet 101 — em andamento\. Valor: R\$\s?250\.000,00\.$/);
  assert.match(
    buildAssetDealConfirmationText({ propertyLabel: "Sala 02", kind: "permuta", state: "concluida", askingPriceCents: 1, propertyProjection: "kept_in_deal_only" }),
    /^Permuta registrada: Sala 02 — concluída\..*só no negócio/,
  );
});

test("erros da API viram mensagens claras", () => {
  assert.match(describeAssetDealError(409, "ASSET_DEAL_ALREADY_ACTIVE"), /já tem um negócio deste tipo em andamento/);
  assert.match(describeAssetDealError(404, "PROPERTY_NOT_FOUND"), /Imóvel não encontrado/);
  assert.match(describeAssetDealError(403, undefined), /não pode registrar negócios/);
  assert.match(describeAssetDealError(500, undefined), /HTTP 500/);
});
