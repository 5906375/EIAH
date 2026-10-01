import type {
  ImobPresentationForm,
  ImobRentalContractGenerateRequest,
  ImobRentalContractPrefill,
} from "@/lib/api";
import { isValidCpf, parseBrDate, parseBrlToCents } from "./rentalLeaseForm";

/**
 * "Gerar contrato de locação": o formulário abre com o imóvel da locação; ao
 * escolher, os campos vêm dos cadastros (proprietário → locador, imóvel,
 * locação → locatário e valores). O usuário só completa o que falta.
 * Os dados ficam no formulário e no cadastro — nunca no texto da conversa.
 */

export const RENTAL_CONTRACT_SUBMIT_TARGET = "imob.contracts.rental";

export function isRentalContractForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === RENTAL_CONTRACT_SUBMIT_TARGET;
}

const PAYER_OPTIONS = [
  { value: "inquilino", label: "Locatário" },
  { value: "proprietario", label: "Locador" },
  { value: "dispensado", label: "Dispensado" },
  { value: "nao_existe", label: "Não existe" },
];

const MONTH_OPTIONS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
  .map((label, index) => ({ value: String(index + 1), label }));

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

export function buildRentalContractForm(): ImobPresentationForm {
  return {
    entity: "contrato",
    action: "rental",
    submitTarget: RENTAL_CONTRACT_SUBMIT_TARGET,
    label: "Gerar contrato de locação",
    description: "Escolha o imóvel: os dados vêm do proprietário, do imóvel e da locação. Complete o que faltar. A minuta sai em PDF e fica anexada à locação.",
    fields: [
      { ...select("propertyId", "Imóvel da locação", [], { required: true, optionsSource: "imob_properties" }) },
      text("landlordName", "Locador (nome)", { required: true, maxLength: 160 }),
      text("landlordDocument", "CPF/CNPJ do locador", { required: true, inputMode: "numeric", maxLength: 18 }),
      text("tenantName", "Locatário (nome)", { required: true, maxLength: 160 }),
      text("tenantDocument", "CPF/CNPJ do locatário", { required: true, inputMode: "numeric", maxLength: 18 }),
      text("propertyAddress", "Endereço do imóvel", { required: true, maxLength: 400 }),
      select("purpose", "Finalidade", [{ value: "residencial", label: "Residencial" }, { value: "comercial", label: "Comercial" }], { required: true }),
      text("registryNumber", "Matrícula (opcional)", { maxLength: 60 }),
      text("startDate", "Início (DD/MM/AAAA)", { required: true, placeholder: "01/03/2025", maxLength: 10 }),
      text("durationMonths", "Prazo (meses)", { required: true, inputMode: "numeric", placeholder: "30", maxLength: 3 }),
      text("rentValue", "Aluguel (R$)", { required: true, placeholder: "1.200,00", maxLength: 16 }),
      text("dueDay", "Dia do vencimento", { required: true, inputMode: "numeric", placeholder: "10", maxLength: 2 }),
      select("adjustmentIndex", "Reajuste anual", [
        { value: "IPCA", label: "IPCA" },
        { value: "IGP-M", label: "IGP-M" },
        { value: "INPC", label: "INPC" },
        { value: "sem_reajuste", label: "Sem reajuste" },
      ], { required: true }),
      select("adjustmentMonth", "Mês do reajuste", MONTH_OPTIONS),
      select("guaranteeType", "Garantia", [
        { value: "caucao", label: "Caução" },
        { value: "fiador", label: "Fiador" },
        { value: "seguro_fianca", label: "Seguro-fiança" },
        { value: "titulo_capitalizacao", label: "Título de capitalização" },
        { value: "nenhuma", label: "Sem garantia" },
      ], { required: true }),
      text("guaranteeAmount", "Valor da garantia (R$, opcional)", { placeholder: "2.400,00", maxLength: 16 }),
      text("guarantorName", "Nome do fiador (se for fiador)", { maxLength: 160 }),
      select("iptu", "IPTU pago por", PAYER_OPTIONS, { required: true }),
      select("condominio", "Condomínio pago por", PAYER_OPTIONS, { required: true }),
      text("condominioAmount", "Valor do condomínio (R$, opcional)", { maxLength: 16 }),
      text("forumCity", "Foro (cidade)", { required: true, maxLength: 120 }),
      text("extraClause", "Disposições especiais (opcional)", { maxLength: 2000, placeholder: "Ex.: não é permitido animal de grande porte" }),
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Gerar minuta", kind: "primary" },
    ],
  };
}

const centsToBr = (cents: number | null) =>
  cents === null ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const isoToBr = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "");
const known = (value: string | null, allowed: string[]) => (value && allowed.includes(value) ? value : "");

/** Cadastro → valores do formulário. Campos sem dado ficam vazios (o usuário completa). */
export function rentalContractPrefillToValues(prefill: ImobRentalContractPrefill): Record<string, string> {
  return {
    landlordName: prefill.landlordName ?? "",
    landlordDocument: prefill.landlordDocument ?? "",
    tenantName: prefill.tenantName ?? "",
    tenantDocument: prefill.tenantDocument ?? "",
    propertyAddress: prefill.propertyAddress ?? "",
    purpose: prefill.purpose ?? "",
    registryNumber: prefill.registryNumber ?? "",
    startDate: isoToBr(prefill.startDate),
    durationMonths: prefill.durationMonths ? String(prefill.durationMonths) : "",
    rentValue: centsToBr(prefill.rentCents),
    dueDay: prefill.dueDay ? String(prefill.dueDay) : "",
    adjustmentIndex: known(prefill.adjustmentIndex, ["IPCA", "IGP-M", "INPC"]),
    adjustmentMonth: prefill.adjustmentMonth ? String(prefill.adjustmentMonth) : "",
    guaranteeType: known(prefill.guaranteeType, ["caucao", "fiador", "seguro_fianca", "titulo_capitalizacao", "nenhuma"]),
    guaranteeAmount: centsToBr(prefill.guaranteeAmountCents),
    guarantorName: prefill.guarantorName ?? "",
    iptu: known(prefill.iptu, ["inquilino", "proprietario", "dispensado", "nao_existe"]),
    condominio: known(prefill.condominio, ["inquilino", "proprietario", "dispensado", "nao_existe"]),
    condominioAmount: centsToBr(prefill.condominioAmountCents),
    forumCity: prefill.forumCity ?? "",
  };
}

export type RentalContractFormResult =
  | { ok: true; request: ImobRentalContractGenerateRequest }
  | { ok: false; errors: Record<string, string> };

const clean = (value: string | undefined) => (value ?? "").trim();
const digits = (value: string | undefined) => clean(value).replace(/\D/g, "");

function validDocument(value: string) {
  return value.length === 14 || (value.length === 11 && isValidCpf(value));
}

export function buildRentalContractRequest(values: Record<string, string>): RentalContractFormResult {
  const errors: Record<string, string> = {};
  const required = (name: string, message: string) => {
    if (!clean(values[name])) errors[name] = message;
  };
  required("propertyId", "Selecione o imóvel.");
  required("landlordName", "Informe o nome do locador.");
  required("tenantName", "Informe o nome do locatário.");
  required("propertyAddress", "Informe o endereço do imóvel.");
  required("purpose", "Escolha a finalidade.");
  required("adjustmentIndex", "Escolha o reajuste.");
  required("guaranteeType", "Escolha a garantia.");
  required("iptu", "Informe quem paga o IPTU.");
  required("condominio", "Informe quem paga o condomínio.");
  required("forumCity", "Informe a cidade do foro.");

  const landlordDocument = digits(values.landlordDocument);
  if (!validDocument(landlordDocument)) errors.landlordDocument = "CPF ou CNPJ do locador inválido.";
  const tenantDocument = digits(values.tenantDocument);
  if (!validDocument(tenantDocument)) errors.tenantDocument = "CPF ou CNPJ do locatário inválido.";

  const startDate = parseBrDate(values.startDate);
  if (!startDate) errors.startDate = "Data de início inválida (DD/MM/AAAA).";
  const durationMonths = /^\d{1,3}$/.test(clean(values.durationMonths)) ? Number(clean(values.durationMonths)) : Number.NaN;
  if (!(durationMonths >= 1 && durationMonths <= 600)) errors.durationMonths = "Prazo em meses inválido.";
  const rentCents = parseBrlToCents(values.rentValue);
  if (!rentCents || Number.isNaN(rentCents)) errors.rentValue = "Valor do aluguel inválido.";
  const dueDay = /^\d{1,2}$/.test(clean(values.dueDay)) ? Number(clean(values.dueDay)) : Number.NaN;
  if (!(dueDay >= 1 && dueDay <= 31)) errors.dueDay = "Dia do vencimento entre 1 e 31.";
  const guaranteeAmountCents = parseBrlToCents(values.guaranteeAmount);
  if (Number.isNaN(guaranteeAmountCents)) errors.guaranteeAmount = "Valor da garantia inválido.";
  const condominioAmountCents = parseBrlToCents(values.condominioAmount);
  if (Number.isNaN(condominioAmountCents)) errors.condominioAmount = "Valor do condomínio inválido.";
  if (clean(values.guaranteeType) === "fiador" && !clean(values.guarantorName)) errors.guarantorName = "Informe o nome do fiador.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const adjustment = clean(values.adjustmentIndex);
  const adjustmentMonth = clean(values.adjustmentMonth);
  return {
    ok: true,
    request: {
      propertyId: clean(values.propertyId),
      landlordName: clean(values.landlordName),
      landlordDocument,
      tenantName: clean(values.tenantName),
      tenantDocument,
      propertyAddress: clean(values.propertyAddress),
      purpose: clean(values.purpose) as "residencial" | "comercial",
      registryNumber: clean(values.registryNumber) || null,
      startDate: startDate as string,
      durationMonths,
      rentCents: rentCents as number,
      dueDay,
      adjustmentIndex: adjustment === "sem_reajuste" ? null : (adjustment as "IPCA" | "IGP-M" | "INPC"),
      adjustmentMonth: adjustment !== "sem_reajuste" && adjustmentMonth ? Number(adjustmentMonth) : null,
      guaranteeType: clean(values.guaranteeType) as ImobRentalContractGenerateRequest["guaranteeType"],
      guaranteeAmountCents: guaranteeAmountCents ?? null,
      guarantorName: clean(values.guarantorName) || null,
      iptu: clean(values.iptu),
      condominio: clean(values.condominio),
      condominioAmountCents: condominioAmountCents ?? null,
      forumCity: clean(values.forumCity),
      extraClause: clean(values.extraClause) || null,
    },
  };
}

export function buildRentalContractConfirmationText(params: { propertyLabel: string; fileName: string; writtenBack: string[] }) {
  return [
    `Minuta de contrato de locação gerada e anexada à locação de ${params.propertyLabel}: ${params.fileName}.`,
    params.writtenBack.length > 0 ? `Atualizado no cadastro: ${params.writtenBack.join(", ")}.` : null,
    "Revise a minuta antes de assinar; depois anexe o contrato assinado em Locações → Anexar documento.",
  ].filter(Boolean).join(" ");
}

export function describeRentalContractError(status: number, code: string | undefined) {
  if (code === "RENTAL_LEASE_NOT_FOUND") return "Este imóvel não tem locação ativa. Cadastre a locação antes (Locações → Cadastrar locação).";
  if (code === "INVALID_TENANT_DOCUMENT") return "CPF do locatário inválido. Nada foi gerado.";
  if (code === "INVALID_LANDLORD_DOCUMENT") return "CPF do locador inválido. Nada foi gerado.";
  if (status === 403) return "Sua função atual não pode gerar contratos neste workspace. Nada foi gerado.";
  return `Não foi possível gerar a minuta agora${status ? ` (HTTP ${status})` : ""}. Nada foi gerado; tente de novo.`;
}

/** PDF simples da minuta (texto puro, A4). jsPDF só é carregado no clique. */
export async function buildContractPdfFile(contractText: string, fileName: string) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 48;
  const lineHeight = 15;
  const pageHeight = doc.internal.pageSize.getHeight();
  const maxWidth = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;
  // A fonte padrão do jsPDF (WinAnsi) não tem travessão; usa hífen.
  for (const paragraph of contractText.replace(/[—–]/g, "-").split("\n")) {
    const isTitle = /^(MINUTA|CONTRATO DE LOCAÇÃO|CLÁUSULA)/.test(paragraph);
    doc.setFont("helvetica", isTitle ? "bold" : "normal");
    doc.setFontSize(isTitle ? 11 : 10);
    const lines = paragraph ? (doc.splitTextToSize(paragraph, maxWidth) as string[]) : [""];
    for (const line of lines) {
      if (y > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.text(line, margin, y);
      y += lineHeight;
    }
  }
  return new File([doc.output("blob")], fileName, { type: "application/pdf" });
}
