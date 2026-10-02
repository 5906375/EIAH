import type { ImobPresentationForm, ImobPresentationFormFieldOption, ImobRentalLeaseCreateRequest } from "@/lib/api";

/**
 * Formulário "Cadastrar locação" (locação vigente) do chat IMOB.
 *
 * Diferente dos demais formulários do chat, este é enviado de forma
 * estruturada direto para `POST /imob/rentals`: os campos nunca viram texto
 * de conversa, então nome, CPF e telefone do inquilino não passam pelo
 * pipeline de mensagens.
 */

export const RENTAL_LEASE_FORM_ENTITY = "locacao";

export function isRentalLeaseForm(form: Pick<ImobPresentationForm, "entity"> | null | undefined) {
  return form?.entity === RENTAL_LEASE_FORM_ENTITY;
}

export function isValidCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(value[i]) * (size + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(value[size])) return false;
  }
  return true;
}

const clean = (value: string | undefined) => (value ?? "").trim();
const digitsOf = (value: string | undefined) => clean(value).replace(/\D/g, "");

/** "1.200,00", "R$ 1200", "1200.5" -> centavos; null quando vazio; NaN quando inválido. */
export function parseBrlToCents(value: string | undefined) {
  const raw = clean(value).replace(/^R\$\s*/i, "");
  if (!raw) return null;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return Number.NaN;
  return Math.round(Number(normalized) * 100);
}

/** "01/03/2025" -> "2025-03-01"; null quando vazio; "" quando inválido. */
export function parseBrDate(value: string | undefined) {
  const raw = clean(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return "";
  const [, day, month, year] = match;
  const iso = `${year}-${month}-${day}`;
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.getUTCDate() !== Number(day) || date.getUTCMonth() + 1 !== Number(month)) return "";
  return iso;
}

function parseIntInRange(value: string | undefined, min: number, max: number) {
  const raw = clean(value);
  if (!raw) return null;
  if (!/^\d+$/.test(raw)) return Number.NaN;
  const parsed = Number(raw);
  return parsed >= min && parsed <= max ? parsed : Number.NaN;
}

export type RentalLeaseFormResult =
  | { ok: true; request: ImobRentalLeaseCreateRequest }
  | { ok: false; errors: Record<string, string> };

export function buildRentalLeaseRequest(values: Record<string, string>): RentalLeaseFormResult {
  const errors: Record<string, string> = {};

  const propertyId = clean(values.propertyId);
  if (!propertyId) errors.propertyId = "Selecione o imóvel locado.";
  const tenantName = clean(values.tenantName);
  if (!tenantName) errors.tenantName = "Informe o nome do inquilino.";

  const document = digitsOf(values.tenantDocument);
  if (document && document.length !== 11 && document.length !== 14) {
    errors.tenantDocument = "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).";
  } else if (document.length === 11 && !isValidCpf(document)) {
    errors.tenantDocument = "CPF inválido: confira os dígitos.";
  }

  const phone = digitsOf(values.tenantPhone);
  if (phone && (phone.length < 10 || phone.length > 13)) errors.tenantPhone = "Informe um telefone válido com DDD.";
  const email = clean(values.tenantEmail);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.tenantEmail = "Informe um e-mail válido.";

  const startDate = parseBrDate(values.startDate);
  if (startDate === "") errors.startDate = "Use o formato DD/MM/AAAA.";
  const endDate = parseBrDate(values.endDate);
  if (endDate === "") errors.endDate = "Use o formato DD/MM/AAAA.";
  if (startDate && endDate && endDate < startDate) errors.endDate = "O fim não pode ser antes do início.";

  const rentCents = parseBrlToCents(values.rent);
  if (Number.isNaN(rentCents) || rentCents === 0) errors.rent = "Informe o valor no formato 1.200,00.";
  const guaranteeAmountCents = parseBrlToCents(values.guaranteeAmount);
  if (Number.isNaN(guaranteeAmountCents)) errors.guaranteeAmount = "Informe o valor no formato 1.200,00.";
  const condominioAmountCents = parseBrlToCents(values.condominioAmount);
  if (Number.isNaN(condominioAmountCents) || condominioAmountCents === 0) {
    errors.condominioAmount = "Informe o valor no formato 350,00.";
  } else if (condominioAmountCents && clean(values.condominio) === "nao_existe") {
    errors.condominioAmount = "Condomínio marcado como \"Não existe\": deixe o valor em branco.";
  }

  const dueDay = parseIntInRange(values.dueDay, 1, 31);
  if (Number.isNaN(dueDay)) errors.dueDay = "Informe um dia entre 1 e 31.";
  const adjustmentMonth = parseIntInRange(values.adjustmentMonth, 1, 12);
  if (Number.isNaN(adjustmentMonth)) errors.adjustmentMonth = "Selecione o mês do reajuste.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T =>
    (allowed as readonly string[]).includes(clean(value)) ? (clean(value) as T) : fallback;
  const chargePayers = ["inquilino", "proprietario", "dispensado", "nao_existe", "desconhecido"] as const;

  return {
    ok: true,
    request: {
      propertyId,
      tenantName,
      tenantDocument: document || null,
      tenantPhone: phone || null,
      tenantEmail: email || null,
      agreementType: pick(values.agreementType, ["escrito", "verbal", "desconhecido"] as const, "desconhecido"),
      startDate: startDate || null,
      endDate: endDate || null,
      rentCents: rentCents as number | null,
      dueDay: dueDay as number | null,
      adjustmentIndex: clean(values.adjustmentIndex) || null,
      adjustmentMonth: adjustmentMonth as number | null,
      guaranteeType: pick(
        values.guaranteeType,
        ["caucao", "fiador", "seguro_fianca", "titulo_capitalizacao", "nenhuma", "desconhecido"] as const,
        "desconhecido",
      ),
      guaranteeAmountCents: guaranteeAmountCents as number | null,
      iptu: pick(values.iptu, chargePayers, "desconhecido"),
      condominio: pick(values.condominio, chargePayers, "desconhecido"),
      condominioAmountCents: condominioAmountCents as number | null,
    },
  };
}

const PENDING_LABELS: Record<string, string> = {
  aluguel: "valor do aluguel",
  inicio: "data de início",
  vencimento_dia: "dia do vencimento",
  inquilino_documento: "CPF do inquilino",
  vincular_contrato_pdf: "anexar o PDF do contrato",
};

/** Texto de confirmação exibido no chat: nunca contém CPF completo nem telefone. */
export function buildRentalLeaseConfirmationText(data: {
  propertyLabel: string;
  tenantName: string;
  tenantDocumentMasked: string | null;
  pendingItems: string[];
}) {
  const tenant = data.tenantDocumentMasked ? `${data.tenantName} (${data.tenantDocumentMasked})` : data.tenantName;
  const pending = data.pendingItems.map((item) => PENDING_LABELS[item] ?? item);
  return [
    `Locação cadastrada: ${data.propertyLabel} — inquilino ${tenant}.`,
    pending.length > 0 ? `Pendências: ${pending.join(", ")}.` : "Sem pendências.",
  ].join(" ");
}

const IMOB_PROPERTY_TYPE_LABELS: Record<string, string> = {
  kitnet: "Kitnet",
  sala_comercial: "Sala comercial",
  apartamento: "Apartamento",
  cobertura: "Cobertura",
  casa: "Casa",
};

/** "terreno_residencial" → "Terreno residencial" (tipos sem rótulo próprio). */
function humanizePropertyType(value: string) {
  const text = value.replace(/_/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : value;
}

/** Opções do campo "Imóvel locado": imóveis não arquivados do workspace, rotulados sem dados pessoais. */
export function buildImobPropertyOptions(
  items: Array<{ id: string; status?: string | null; propertyType?: string | null; address?: string | null; city?: string | null; metadata?: unknown }>,
): ImobPresentationFormFieldOption[] {
  return items
    .filter((item) => item.status !== "archived")
    .map((item) => {
      const metadata = item.metadata && typeof item.metadata === "object" ? (item.metadata as Record<string, unknown>) : {};
      const ref = typeof metadata.externalPropertyRef === "string" ? metadata.externalPropertyRef.trim() : "";
      const typeLabel = item.propertyType ? IMOB_PROPERTY_TYPE_LABELS[item.propertyType] ?? humanizePropertyType(item.propertyType) : "Imóvel";
      const place = [item.address, item.city].filter(Boolean).join(" · ");
      const label = [ref || typeLabel, place].filter(Boolean).join(" — ") || item.id;
      return { value: item.id, label };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}
