import type { ImobOwnerCreateRequest, ImobPresentationForm } from "@/lib/api";
import { isValidCpf } from "./rentalLeaseForm";

/**
 * Formulário "Cadastrar proprietário" do chat IMOB, enviado de forma
 * estruturada direto para `POST /imob/owners`: não dispara execução de agente
 * e os campos (nome, documento, telefone) não viram texto de conversa.
 */

export const OWNER_CREATE_SUBMIT_TARGET = "imob.owners.create";
export const OWNER_CREATE_SOURCE = "imob_chat_owner_form_v1";

export function isOwnerCreateForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === OWNER_CREATE_SUBMIT_TARGET;
}

export function isValidCnpj(value: string) {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const digit = (size: number) => {
    const weights = size === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, weight, index) => acc + Number(value[index]) * weight, 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  return digit(12) === Number(value[12]) && digit(13) === Number(value[13]);
}

const clean = (value: string | undefined) => (value ?? "").trim();
const digitsOf = (value: string | null | undefined) => (value ?? "").replace(/\D/g, "");
const normalizeName = (value: string | null | undefined) =>
  (value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export type OwnerCreateFormResult =
  | { ok: true; request: ImobOwnerCreateRequest }
  | { ok: false; errors: Record<string, string> };

export function buildOwnerCreateRequest(values: Record<string, string>): OwnerCreateFormResult {
  const errors: Record<string, string> = {};
  const personType = clean(values.personType) === "company" ? "company" : "person";
  const name = clean(values.ownerName);
  if (!name) errors.ownerName = "Informe o nome ou a razão social.";

  const document = digitsOf(values.ownerDocument);
  if (document) {
    if (personType === "person" && !isValidCpf(document)) {
      errors.ownerDocument = document.length === 11 ? "CPF inválido: confira os dígitos." : "Pessoa física: informe um CPF com 11 dígitos.";
    } else if (personType === "company" && !isValidCnpj(document)) {
      errors.ownerDocument = document.length === 14 ? "CNPJ inválido: confira os dígitos." : "Pessoa jurídica: informe um CNPJ com 14 dígitos.";
    }
  }

  const phone = digitsOf(values.ownerPhone);
  if (phone && (phone.length < 10 || phone.length > 13)) errors.ownerPhone = "Informe um telefone válido com DDD.";
  const email = clean(values.ownerEmail);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.ownerEmail = "Informe um e-mail válido.";

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const pendingItems = [document ? null : personType === "company" ? "cnpj" : "cpf", phone || email ? null : "contato"]
    .filter((item): item is string => Boolean(item));
  return {
    ok: true,
    request: {
      name,
      personType,
      document: document || null,
      phone: phone || null,
      email: email || null,
      status: pendingItems.length ? "pending_data" : "ready",
      pendingItems,
      metadata: { source: OWNER_CREATE_SOURCE },
    },
  };
}

type OwnerLike = { id: string; name: string; status?: string | null; document?: string | null; phone?: string | null; email?: string | null };

/**
 * Identificador forte (documento, telefone ou e-mail) bloqueia o cadastro.
 * Só o nome igual nunca bloqueia nem funde: pede confirmação explícita
 * (mesma regra do dedupe do CRM, imobCrmDedupe).
 */
export function findOwnerDuplicate(request: ImobOwnerCreateRequest, items: OwnerLike[]) {
  const active = items.filter((item) => item.status !== "archived");
  const strong = active.find((item) => {
    if (request.document && digitsOf(item.document) === request.document) return true;
    if (request.phone && digitsOf(item.phone) === request.phone) return true;
    if (request.email && (item.email ?? "").trim().toLowerCase() === request.email.toLowerCase()) return true;
    return false;
  });
  if (strong) return { kind: "strong" as const, owner: strong };
  const sameName = active.find((item) => normalizeName(item.name) === normalizeName(request.name));
  if (sameName) return { kind: "name" as const, owner: sameName };
  return null;
}

const PENDING_LABELS: Record<string, string> = { cpf: "CPF", cnpj: "CNPJ", contato: "telefone ou e-mail" };

/** Confirmação no chat: nunca mostra o documento completo nem o telefone. */
export function buildOwnerCreateConfirmationText(data: { name: string; personType: string; document: string | null; pendingItems: string[] }) {
  const doc = data.document ? ` (${data.personType === "company" ? "CNPJ" : "CPF"} final ${data.document.slice(-2)})` : "";
  const pending = data.pendingItems.map((item) => PENDING_LABELS[item] ?? item);
  return [
    `Proprietário cadastrado: ${data.name}${doc}.`,
    pending.length ? `Pendências: ${pending.join(", ")}.` : "Sem pendências.",
    "Ele já aparece na lista do \"Cadastrar imóvel\".",
  ].join(" ");
}
