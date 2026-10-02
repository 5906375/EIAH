import type { ImobPresentationForm, ImobSaleContractGenerateRequest, ImobSaleContractPrefill } from "@/lib/api";
import { isValidCpf, parseBrlToCents } from "./rentalLeaseForm";

/**
 * "Contrato de venda": o formulário abre com o imóvel; ao escolher, o
 * vendedor vem do proprietário e o imóvel do cadastro. O comprador e as
 * condições são preenchidos aqui e ficam no negócio de venda (`sale.deal`).
 * Nada disso vai para o texto da conversa.
 */

export const SALE_CONTRACT_SUBMIT_TARGET = "imob.contracts.sale";

export function isSaleContractForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === SALE_CONTRACT_SUBMIT_TARGET;
}

const text = (name: string, label: string, extra: Record<string, unknown> = {}) => ({ name, label, type: "text" as const, value: "", ...extra });
const select = (name: string, label: string, options: Array<{ value: string; label: string }>, extra: Record<string, unknown> = {}) => ({
  name,
  label,
  type: "select" as const,
  placeholder: "Selecione",
  value: "",
  options,
  ...extra,
});

export function buildSaleContractForm(): ImobPresentationForm {
  return {
    entity: "contrato",
    action: "sale",
    submitTarget: SALE_CONTRACT_SUBMIT_TARGET,
    label: "Gerar contrato de compra e venda",
    description: "Escolha o imóvel: o vendedor vem do proprietário e o imóvel do cadastro. Preencha o comprador e as condições. A minuta sai em PDF e fica anexada ao imóvel.",
    fields: [
      select("propertyId", "Imóvel", [], { required: true, optionsSource: "imob_properties" }),
      text("sellerName", "Vendedor (nome)", { required: true, maxLength: 160 }),
      text("sellerDocument", "CPF/CNPJ do vendedor", { required: true, inputMode: "numeric", maxLength: 18 }),
      text("buyerName", "Comprador (nome)", { required: true, maxLength: 160 }),
      text("buyerDocument", "CPF/CNPJ do comprador", { required: true, inputMode: "numeric", maxLength: 18 }),
      text("propertyAddress", "Endereço do imóvel", { required: true, maxLength: 400 }),
      text("registryNumber", "Matrícula (opcional)", { maxLength: 60 }),
      text("priceValue", "Preço (R$)", { required: true, placeholder: "450.000,00", maxLength: 18 }),
      text("downPayment", "Sinal / arras (R$, opcional)", { placeholder: "45.000,00", maxLength: 18 }),
      select("paymentMethod", "Pagamento do saldo", [
        { value: "a_vista", label: "À vista na escritura" },
        { value: "financiamento", label: "Financiamento bancário" },
        { value: "parcelado", label: "Parcelado direto com o vendedor" },
      ], { required: true }),
      text("balanceTerms", "Condições do saldo (opcional)", { maxLength: 1000, placeholder: "Ex.: 10 parcelas mensais de R$ 20.000,00" }),
      text("deedDeadlineDays", "Prazo para a escritura (dias)", { required: true, inputMode: "numeric", placeholder: "60", maxLength: 4 }),
      select("possession", "Entrega da posse", [
        { value: "assinatura", label: "Na assinatura deste contrato" },
        { value: "escritura", label: "Na escritura" },
        { value: "quitacao", label: "Após a quitação" },
      ], { required: true }),
      text("commissionPercent", "Corretagem (% sobre o preço, opcional)", { inputMode: "numeric", placeholder: "6", maxLength: 5 }),
      text("forumCity", "Foro (cidade)", { required: true, maxLength: 120 }),
      text("extraClause", "Disposições especiais (opcional)", { maxLength: 2000 }),
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Gerar minuta de venda", kind: "primary" },
    ],
  };
}

const centsToBr = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const known = (value: string | null, allowed: string[]) => (value && allowed.includes(value) ? value : "");

export function saleContractPrefillToValues(prefill: ImobSaleContractPrefill): Record<string, string> {
  return {
    sellerName: prefill.sellerName ?? "",
    sellerDocument: prefill.sellerDocument ?? "",
    buyerName: prefill.buyerName ?? "",
    buyerDocument: prefill.buyerDocument ?? "",
    propertyAddress: prefill.propertyAddress ?? "",
    registryNumber: prefill.registryNumber ?? "",
    priceValue: centsToBr(prefill.priceCents),
    downPayment: centsToBr(prefill.downPaymentCents),
    paymentMethod: known(prefill.paymentMethod, ["a_vista", "financiamento", "parcelado"]),
    balanceTerms: prefill.balanceTerms ?? "",
    deedDeadlineDays: prefill.deedDeadlineDays ? String(prefill.deedDeadlineDays) : "",
    possession: known(prefill.possession, ["assinatura", "escritura", "quitacao"]),
    commissionPercent: prefill.commissionPercent ? String(prefill.commissionPercent).replace(".", ",") : "",
    forumCity: prefill.forumCity ?? "",
  };
}

export type SaleContractFormResult =
  | { ok: true; request: ImobSaleContractGenerateRequest }
  | { ok: false; errors: Record<string, string> };

const clean = (value: string | undefined) => (value ?? "").trim();
const digits = (value: string | undefined) => clean(value).replace(/\D/g, "");
const validDocument = (value: string) => value.length === 14 || (value.length === 11 && isValidCpf(value));

export function buildSaleContractRequest(values: Record<string, string>): SaleContractFormResult {
  const errors: Record<string, string> = {};
  const required = (name: string, message: string) => {
    if (!clean(values[name])) errors[name] = message;
  };
  required("propertyId", "Selecione o imóvel.");
  required("sellerName", "Informe o nome do vendedor.");
  required("buyerName", "Informe o nome do comprador.");
  required("propertyAddress", "Informe o endereço do imóvel.");
  required("paymentMethod", "Escolha como o saldo será pago.");
  required("possession", "Escolha quando a posse é entregue.");
  required("forumCity", "Informe a cidade do foro.");

  const sellerDocument = digits(values.sellerDocument);
  if (!validDocument(sellerDocument)) errors.sellerDocument = "CPF ou CNPJ do vendedor inválido.";
  const buyerDocument = digits(values.buyerDocument);
  if (!validDocument(buyerDocument)) errors.buyerDocument = "CPF ou CNPJ do comprador inválido.";

  const priceCents = parseBrlToCents(values.priceValue);
  if (!priceCents || Number.isNaN(priceCents)) errors.priceValue = "Preço inválido.";
  const downPaymentCents = parseBrlToCents(values.downPayment);
  if (Number.isNaN(downPaymentCents)) errors.downPayment = "Valor do sinal inválido.";
  else if (downPaymentCents && priceCents && !Number.isNaN(priceCents) && downPaymentCents > priceCents) errors.downPayment = "O sinal não pode ser maior que o preço.";
  const deedDeadlineDays = /^\d{1,4}$/.test(clean(values.deedDeadlineDays)) ? Number(clean(values.deedDeadlineDays)) : Number.NaN;
  if (!(deedDeadlineDays >= 1)) errors.deedDeadlineDays = "Prazo em dias inválido.";
  const commissionRaw = clean(values.commissionPercent).replace(",", ".");
  const commissionPercent = commissionRaw ? Number(commissionRaw) : null;
  if (commissionPercent !== null && !(commissionPercent >= 0.1 && commissionPercent <= 20)) errors.commissionPercent = "Corretagem entre 0,1% e 20%.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    request: {
      propertyId: clean(values.propertyId),
      sellerName: clean(values.sellerName),
      sellerDocument,
      buyerName: clean(values.buyerName),
      buyerDocument,
      propertyAddress: clean(values.propertyAddress),
      registryNumber: clean(values.registryNumber) || null,
      priceCents: priceCents as number,
      downPaymentCents: downPaymentCents ?? null,
      paymentMethod: clean(values.paymentMethod) as ImobSaleContractGenerateRequest["paymentMethod"],
      balanceTerms: clean(values.balanceTerms) || null,
      deedDeadlineDays,
      possession: clean(values.possession) as ImobSaleContractGenerateRequest["possession"],
      commissionPercent,
      forumCity: clean(values.forumCity),
      extraClause: clean(values.extraClause) || null,
    },
  };
}

export function buildSaleContractConfirmationText(params: { propertyLabel: string; fileName: string; writtenBack: string[] }) {
  return [
    `Minuta de compra e venda gerada e anexada ao imóvel ${params.propertyLabel}: ${params.fileName}.`,
    params.writtenBack.length > 0 ? `Atualizado no cadastro: ${params.writtenBack.join(", ")}.` : null,
    "Revise a minuta antes de assinar; depois anexe o contrato assinado em Imóveis → Anexar documento.",
  ].filter(Boolean).join(" ");
}

export function describeSaleContractError(status: number, code: string | undefined) {
  if (code === "PROPERTY_NOT_FOUND") return "Imóvel não encontrado (pode ter sido arquivado). Nada foi gerado.";
  if (code === "INVALID_BUYER_DOCUMENT") return "CPF do comprador inválido. Nada foi gerado.";
  if (code === "INVALID_SELLER_DOCUMENT") return "CPF do vendedor inválido. Nada foi gerado.";
  if (code === "DOWN_PAYMENT_ABOVE_PRICE") return "O sinal não pode ser maior que o preço. Nada foi gerado.";
  if (status === 403) return "Sua função atual não pode gerar contratos neste workspace. Nada foi gerado.";
  return `Não foi possível gerar a minuta agora${status ? ` (HTTP ${status})` : ""}. Nada foi gerado; tente de novo.`;
}
