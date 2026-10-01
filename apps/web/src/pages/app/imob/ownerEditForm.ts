import type { ImobOwnerUpdateRequest, ImobPresentationForm } from "@/lib/api";
import { buildOwnerCreateRequest, findOwnerDuplicate } from "./ownerCreateForm";

/**
 * Formulário "Editar proprietário" do chat IMOB. Aberto por um atalho
 * explícito (não por interpretação de texto) e enviado de forma estruturada
 * para `PATCH /imob/owners/:id`; "Arquivar" usa `DELETE /imob/owners/:id`.
 */

export const OWNER_EDIT_SUBMIT_TARGET = "imob.owners.update";

export function isOwnerEditForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === OWNER_EDIT_SUBMIT_TARGET;
}

export function buildOwnerEditForm(): ImobPresentationForm {
  return {
    entity: "proprietario",
    action: "update",
    submitTarget: OWNER_EDIT_SUBMIT_TARGET,
    label: "Editar proprietário",
    description: "Escolha o proprietário; os dados atuais aparecem nos campos para você corrigir.",
    fields: [
      {
        name: "ownerId",
        label: "Proprietário",
        type: "select",
        required: true,
        placeholder: "Selecione o proprietário",
        value: "",
        optionsSource: "imob_owners",
        options: [],
      },
      {
        name: "personType",
        label: "Tipo de pessoa",
        type: "select",
        value: "person",
        options: [
          { value: "person", label: "Pessoa física (CPF)" },
          { value: "company", label: "Pessoa jurídica (CNPJ)" },
        ],
      },
      { name: "ownerName", label: "Nome completo", type: "text", required: true, value: "" },
      { name: "ownerDocument", label: "CPF ou CNPJ", type: "text", inputMode: "numeric", maxLength: 18, value: "" },
      { name: "ownerPhone", label: "Telefone", type: "tel", value: "" },
      { name: "ownerEmail", label: "E-mail", type: "email", value: "" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "archive", label: "Arquivar", kind: "neutral" },
      { id: "submit", label: "Salvar alterações", kind: "primary" },
    ],
  };
}

type OwnerRecord = {
  id: string;
  name: string;
  personType?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: string | null;
};

/** Valores atuais do proprietário para preencher o formulário. */
export function ownerToEditValues(owner: OwnerRecord): Record<string, string> {
  return {
    ownerId: owner.id,
    personType: owner.personType === "company" ? "company" : "person",
    ownerName: owner.name ?? "",
    ownerDocument: owner.document ?? "",
    ownerPhone: owner.phone ?? "",
    ownerEmail: owner.email ?? "",
  };
}

export type OwnerEditFormResult =
  | { ok: true; ownerId: string; request: ImobOwnerUpdateRequest }
  | { ok: false; errors: Record<string, string> };

export function buildOwnerUpdateRequest(values: Record<string, string>, owners: OwnerRecord[]): OwnerEditFormResult {
  const ownerId = (values.ownerId ?? "").trim();
  if (!ownerId) return { ok: false, errors: { ownerId: "Selecione o proprietário." } };
  const built = buildOwnerCreateRequest(values);
  if (!built.ok) return built;
  // Sem metadata: o PATCH substituiria a metadata existente inteira.
  const { metadata: _metadata, ...request } = built.request;
  const duplicate = findOwnerDuplicate(built.request, owners.filter((item) => item.id !== ownerId));
  if (duplicate?.kind === "strong") {
    return {
      ok: false,
      errors: { _form: `Já existe outro proprietário com este documento, telefone ou e-mail: ${duplicate.owner.name}. Nada foi alterado.` },
    };
  }
  return { ok: true, ownerId, request };
}

export function buildOwnerUpdateConfirmationText(data: { name: string; personType: string; document: string | null }) {
  const doc = data.document ? ` (${data.personType === "company" ? "CNPJ" : "CPF"} final ${data.document.slice(-2)})` : "";
  return `Proprietário atualizado: ${data.name}${doc}.`;
}
