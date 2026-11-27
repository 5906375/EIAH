import type {
  ImobActiveRentalLease,
  ImobPresentationForm,
  ImobRentalCloseReason,
  ImobRentalHistoryItem,
} from "@/lib/api";
import { buildRentalLeaseRequest, parseBrDate, type RentalLeaseFormResult } from "./rentalLeaseForm";

/**
 * Ciclo da locação no menu Locações: "Editar locação", "Encerrar locação" e
 * "Histórico de locações". Formulários locais enviados direto para a API
 * (`PATCH /imob/rentals/active`, `POST /imob/rentals/close`,
 * `GET /imob/rentals/history`), sem virar texto de conversa.
 */

export const RENTAL_EDIT_SUBMIT_TARGET = "imob.rentals.update";
export const RENTAL_CLOSE_SUBMIT_TARGET = "imob.rentals.close";
export const RENTAL_HISTORY_SUBMIT_TARGET = "imob.rentals.history";

export const isRentalEditForm = (form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) =>
  form?.submitTarget === RENTAL_EDIT_SUBMIT_TARGET;
export const isRentalCloseForm = (form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) =>
  form?.submitTarget === RENTAL_CLOSE_SUBMIT_TARGET;
export const isRentalHistoryForm = (form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) =>
  form?.submitTarget === RENTAL_HISTORY_SUBMIT_TARGET;

const propertyPicker = (label: string) => ({
  name: "propertyId",
  label,
  type: "select" as const,
  required: true,
  placeholder: "Selecione o imóvel",
  value: "",
  optionsSource: "imob_properties" as const,
  options: [],
});

const CHARGE_PAYER_OPTIONS = [
  { value: "inquilino", label: "Inquilino paga" },
  { value: "proprietario", label: "Proprietário paga" },
  { value: "dispensado", label: "Dispensado" },
  { value: "nao_existe", label: "Não existe" },
  { value: "desconhecido", label: "Não sei" },
];

const MONTH_OPTIONS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
].map((label, index) => ({ value: String(index + 1), label }));

export function buildRentalEditForm(): ImobPresentationForm {
  const text = (name: string, label: string, extra: Record<string, unknown> = {}) => ({ name, label, type: "text" as const, value: "", ...extra });
  return {
    entity: "locacao_edicao",
    action: "update",
    submitTarget: RENTAL_EDIT_SUBMIT_TARGET,
    label: "Editar locação",
    description: "Escolha o imóvel: os dados da locação ativa aparecem nos campos. Corrija o que precisar e salve. Documentos anexados continuam na locação.",
    fields: [
      propertyPicker("Imóvel da locação"),
      text("tenantName", "Nome do inquilino", { required: true, maxLength: 160 }),
      text("tenantDocument", "CPF ou CNPJ do inquilino", { inputMode: "numeric", maxLength: 18, placeholder: "000.000.000-00" }),
      { name: "tenantPhone", label: "Telefone do inquilino", type: "tel" as const, placeholder: "(47) 99999-9999", value: "" },
      { name: "tenantEmail", label: "E-mail do inquilino", type: "email" as const, placeholder: "inquilino@email.com", value: "" },
      {
        name: "agreementType",
        label: "Contrato",
        type: "select" as const,
        value: "",
        placeholder: "Selecione",
        options: [
          { value: "escrito", label: "Escrito (assinado)" },
          { value: "verbal", label: "Verbal" },
          { value: "desconhecido", label: "Não sei" },
        ],
      },
      text("startDate", "Início da locação", { placeholder: "DD/MM/AAAA", inputMode: "numeric", maxLength: 10 }),
      text("endDate", "Fim do contrato", { placeholder: "DD/MM/AAAA", inputMode: "numeric", maxLength: 10 }),
      text("rent", "Aluguel mensal (R$)", { placeholder: "1.200,00", inputMode: "numeric" }),
      text("dueDay", "Dia do vencimento", { placeholder: "10", inputMode: "numeric", maxLength: 2 }),
      {
        name: "adjustmentIndex",
        label: "Índice de reajuste",
        type: "select" as const,
        placeholder: "Não informado",
        value: "",
        options: ["IGPM", "IPCA", "INPC", "IVAR"].map((value) => ({ value, label: value })),
      },
      { name: "adjustmentMonth", label: "Mês do reajuste", type: "select" as const, placeholder: "Não informado", value: "", options: MONTH_OPTIONS },
      {
        name: "guaranteeType",
        label: "Garantia",
        type: "select" as const,
        value: "",
        placeholder: "Selecione",
        options: [
          { value: "caucao", label: "Caução" },
          { value: "fiador", label: "Fiador" },
          { value: "seguro_fianca", label: "Seguro-fiança" },
          { value: "titulo_capitalizacao", label: "Título de capitalização" },
          { value: "nenhuma", label: "Sem garantia" },
          { value: "desconhecido", label: "Não sei" },
        ],
      },
      text("guaranteeAmount", "Valor da garantia (R$)", { placeholder: "2.400,00", inputMode: "numeric" }),
      { name: "iptu", label: "IPTU", type: "select" as const, value: "", placeholder: "Selecione", options: CHARGE_PAYER_OPTIONS },
      { name: "condominio", label: "Condomínio", type: "select" as const, value: "", placeholder: "Selecione", options: CHARGE_PAYER_OPTIONS },
      text("condominioAmount", "Valor do condomínio (R$/mês)", { placeholder: "350,00", inputMode: "numeric" }),
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Salvar alterações", kind: "primary" },
    ],
  };
}

const isoToBr = (value: string | null | undefined) => {
  const match = (value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};
const centsToBr = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Locação ativa → valores do formulário de edição. */
export function activeLeaseToFormValues(lease: ImobActiveRentalLease): Record<string, string> {
  const v = lease.values;
  return {
    tenantName: v.tenantName ?? "",
    tenantDocument: v.tenantDocument ?? "",
    tenantPhone: v.tenantPhone ?? "",
    tenantEmail: v.tenantEmail ?? "",
    agreementType: v.agreementType ?? "desconhecido",
    startDate: isoToBr(v.startDate),
    endDate: isoToBr(v.endDate),
    rent: centsToBr(v.rentCents),
    dueDay: v.dueDay ? String(v.dueDay) : "",
    adjustmentIndex: (v.adjustmentIndex ?? "").toUpperCase().replace("-", ""),
    adjustmentMonth: v.adjustmentMonth ? String(v.adjustmentMonth) : "",
    guaranteeType: v.guaranteeType ?? "desconhecido",
    guaranteeAmount: centsToBr(v.guaranteeAmountCents),
    iptu: v.iptu ?? "desconhecido",
    condominio: v.condominio ?? "desconhecido",
    condominioAmount: centsToBr(v.condominioAmountCents),
  };
}

/** Mesma validação do cadastro de locação. */
export function buildRentalEditRequest(values: Record<string, string>): RentalLeaseFormResult {
  return buildRentalLeaseRequest(values);
}

const FIELD_LABELS: Record<string, string> = {
  tenantName: "nome do inquilino",
  tenantDocument: "CPF/CNPJ do inquilino",
  tenantPhone: "telefone",
  tenantEmail: "e-mail",
  agreementType: "tipo de contrato",
  startDate: "início",
  endDate: "fim do contrato",
  rentCents: "aluguel",
  dueDay: "vencimento",
  adjustmentIndex: "índice de reajuste",
  adjustmentMonth: "mês do reajuste",
  guaranteeType: "garantia",
  guaranteeAmountCents: "valor da garantia",
  iptu: "IPTU",
  condominio: "condomínio",
  condominioAmountCents: "valor do condomínio",
  notes: "observações",
};

const PENDING_LABELS: Record<string, string> = {
  aluguel: "valor do aluguel",
  inicio: "data de início",
  vencimento_dia: "dia do vencimento",
  inquilino_documento: "CPF do inquilino",
  vincular_contrato_pdf: "anexar o PDF do contrato",
};

export function buildRentalEditConfirmationText(params: { propertyLabel: string; changed: string[]; pendingItems: string[]; unchanged: boolean }) {
  if (params.unchanged) return `Nada mudou na locação de ${params.propertyLabel}.`;
  const pending = params.pendingItems.map((item) => PENDING_LABELS[item] ?? item);
  return [
    `Locação de ${params.propertyLabel} corrigida: ${params.changed.map((field) => FIELD_LABELS[field] ?? field).join(", ")}.`,
    pending.length > 0 ? `Pendências: ${pending.join(", ")}.` : "Sem pendências.",
  ].join(" ");
}

export const RENTAL_CLOSE_REASON_OPTIONS: Array<{ value: ImobRentalCloseReason; label: string }> = [
  { value: "fim_contrato", label: "Fim do contrato" },
  { value: "rescisao_locatario", label: "Rescisão pelo inquilino" },
  { value: "rescisao_locador", label: "Rescisão pelo proprietário" },
  { value: "inadimplencia", label: "Inadimplência" },
  { value: "venda_imovel", label: "Venda do imóvel" },
  { value: "outro", label: "Outro" },
];

export const rentalCloseReasonLabel = (reason: string | null | undefined) =>
  RENTAL_CLOSE_REASON_OPTIONS.find((option) => option.value === reason)?.label ?? "Motivo não informado";

export function buildRentalCloseForm(): ImobPresentationForm {
  return {
    entity: "locacao_encerramento",
    action: "close",
    submitTarget: RENTAL_CLOSE_SUBMIT_TARGET,
    label: "Encerrar locação",
    description: "Informe a data de saída e o motivo. A locação vai para o histórico (com os documentos) e o imóvel volta a vago. Anexe aqui a vistoria de saída ou o termo de entrega das chaves, se tiver.",
    fields: [
      propertyPicker("Imóvel da locação"),
      { name: "endedOn", label: "Data de saída", type: "text", required: true, placeholder: "DD/MM/AAAA", inputMode: "numeric", maxLength: 10, value: "" },
      { name: "reason", label: "Motivo", type: "select", required: true, placeholder: "Selecione", value: "", options: RENTAL_CLOSE_REASON_OPTIONS },
      { name: "notes", label: "Observação (opcional)", type: "text", maxLength: 500, placeholder: "Ex.: chaves entregues, caução devolvida", value: "" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Encerrar locação", kind: "primary" },
    ],
  };
}

export type RentalCloseFormResult =
  | { ok: true; request: { propertyId: string; endedOn: string; reason: ImobRentalCloseReason; notes: string | null } }
  | { ok: false; errors: Record<string, string> };

export function buildRentalCloseRequest(values: Record<string, string>, todayIso: string): RentalCloseFormResult {
  const errors: Record<string, string> = {};
  const propertyId = (values.propertyId ?? "").trim();
  if (!propertyId) errors.propertyId = "Selecione o imóvel.";
  const endedOn = parseBrDate(values.endedOn);
  if (!endedOn) errors.endedOn = endedOn === null ? "Informe a data de saída." : "Use o formato DD/MM/AAAA.";
  else if (endedOn > todayIso) errors.endedOn = "A data de saída não pode ser futura. Encerre no dia da entrega das chaves.";
  const reason = (values.reason ?? "").trim() as ImobRentalCloseReason;
  if (!RENTAL_CLOSE_REASON_OPTIONS.some((option) => option.value === reason)) errors.reason = "Escolha o motivo.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, request: { propertyId, endedOn: endedOn as string, reason, notes: (values.notes ?? "").trim() || null } };
}

export function buildRentalCloseConfirmationText(params: { propertyLabel: string; endedOn: string; reason: string; documentsNote?: string | null }) {
  return [
    `Locação de ${params.propertyLabel} encerrada em ${isoToBr(params.endedOn)} (${rentalCloseReasonLabel(params.reason)}).`,
    "O imóvel voltou a vago e a locação está no histórico.",
    params.documentsNote ?? null,
  ].filter(Boolean).join(" ");
}

export function buildRentalHistoryForm(): ImobPresentationForm {
  return {
    entity: "locacao_historico",
    action: "history",
    submitTarget: RENTAL_HISTORY_SUBMIT_TARGET,
    label: "Histórico de locações",
    description: "Escolha o imóvel para ver a locação atual e as anteriores, com os documentos de cada uma.",
    fields: [propertyPicker("Imóvel")],
    actions: [
      { id: "cancel", label: "Fechar", kind: "secondary" },
      { id: "submit", label: "Ver histórico", kind: "primary" },
    ],
  };
}

/** Uma linha por locação, mais recente primeiro. Só CPF mascarado. */
export function buildRentalHistoryLines(items: ImobRentalHistoryItem[]) {
  return items.map((item) => {
    const tenant = item.tenantName
      ? item.tenantDocumentMasked ? `${item.tenantName} (${item.tenantDocumentMasked})` : item.tenantName
      : "Inquilino não informado";
    const period = item.status === "active"
      ? item.startDate ? `desde ${isoToBr(item.startDate)}` : "início não informado"
      : `${item.startDate ? isoToBr(item.startDate) : "?"} a ${isoToBr(item.endedOn ?? item.endDate) || "?"} · ${rentalCloseReasonLabel(item.closeReason)}`;
    const rent = item.rentCents ? `R$ ${centsToBr(item.rentCents)}` : null;
    const docs = item.documents.length === 0 ? "sem documentos" : item.documents.length === 1 ? "1 documento" : `${item.documents.length} documentos`;
    return [item.status === "active" ? "Ativa" : "Encerrada", tenant, period, rent, docs].filter(Boolean).join(" · ");
  });
}

export function buildRentalHistoryText(propertyLabel: string, items: ImobRentalHistoryItem[]) {
  if (items.length === 0) return `${propertyLabel} ainda não tem locações cadastradas.`;
  const closed = items.filter((item) => item.status === "closed").length;
  const active = items.length - closed;
  return `Histórico de ${propertyLabel}: ${active ? "1 locação ativa" : "nenhuma locação ativa"}${closed ? ` e ${closed} encerrada${closed > 1 ? "s" : ""}` : ""}.`;
}

export function describeRentalLifecycleError(status: number, code: string | undefined, verb: "alterar" | "encerrar" | "consultar") {
  if (code === "RENTAL_LEASE_NOT_FOUND") return "Este imóvel não tem locação ativa. Veja o histórico ou cadastre a locação em Locações → Cadastrar locação.";
  if (code === "INVALID_TENANT_DOCUMENT") return "CPF do inquilino inválido. Nada foi alterado.";
  if (code === "ENDED_BEFORE_START") return "A data de saída é anterior ao início da locação. Nada foi encerrado.";
  if (code === "ENDED_IN_FUTURE") return "A data de saída não pode ser futura. Nada foi encerrado.";
  if (code === "PROPERTY_NOT_FOUND") return "Imóvel não encontrado.";
  if (status === 403) return `Sua função atual não pode ${verb} locações neste workspace.`;
  return `Não foi possível ${verb} a locação agora${status ? ` (HTTP ${status})` : ""}. Tente de novo.`;
}

