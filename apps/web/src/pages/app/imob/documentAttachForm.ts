import type { ImobDocumentLinkRequest, ImobPresentationForm } from "@/lib/api";

/**
 * "Anexar documento" nos menus Proprietários, Imóveis e Locações.
 *
 * O arquivo sobe por `/uploads` e depois é vinculado ao cadastro escolhido
 * por `POST /imob/documents/link` — sem execução de agente e sem leitura do
 * conteúdo. Na locação, o imóvel identifica a locação ativa; "Contrato
 * assinado" baixa a pendência de contrato.
 */

export const DOCUMENT_ATTACH_SUBMIT_TARGET = "imob.documents.link";
export const DOCUMENT_ATTACH_ACCEPT = ".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg";
export const DOCUMENT_ATTACH_MAX_FILES = 8;

export type DocumentAttachSubject = "owners" | "properties" | "rentals";

export function isDocumentAttachForm(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined) {
  return form?.submitTarget === DOCUMENT_ATTACH_SUBMIT_TARGET;
}

const CATEGORY_OPTIONS: Record<DocumentAttachSubject, Array<{ value: string; label: string }>> = {
  owners: [
    { value: "documento_identidade", label: "Documento de identidade (RG/CNH)" },
    { value: "comprovante_endereco", label: "Comprovante de endereço" },
    { value: "procuracao", label: "Procuração" },
    { value: "contrato_social", label: "Contrato social (pessoa jurídica)" },
    { value: "outro", label: "Outro" },
  ],
  properties: [
    { value: "matricula", label: "Matrícula" },
    { value: "iptu", label: "IPTU" },
    { value: "escritura", label: "Escritura" },
    { value: "planta", label: "Planta" },
    { value: "habite_se", label: "Habite-se" },
    { value: "fotos", label: "Fotos" },
    { value: "outro", label: "Outro" },
  ],
  rentals: [
    { value: "contrato_assinado", label: "Contrato assinado" },
    { value: "minuta_contrato", label: "Minuta de contrato" },
    { value: "aditivo", label: "Aditivo" },
    { value: "vistoria", label: "Vistoria" },
    { value: "garantia", label: "Garantia (fiador, seguro, caução)" },
    { value: "comprovante_pagamento", label: "Comprovante de pagamento" },
    { value: "outro", label: "Outro" },
  ],
};

const SUBJECT_TYPE: Record<DocumentAttachSubject, ImobDocumentLinkRequest["subjectType"]> = {
  owners: "owner",
  properties: "property",
  rentals: "rental",
};

const SUBJECT_FIELD: Record<DocumentAttachSubject, "ownerId" | "propertyId"> = {
  owners: "ownerId",
  properties: "propertyId",
  rentals: "propertyId",
};

export function documentCategoryLabel(subject: DocumentAttachSubject, category: string) {
  return CATEGORY_OPTIONS[subject].find((option) => option.value === category)?.label ?? category;
}

export function buildDocumentAttachForm(subject: DocumentAttachSubject): ImobPresentationForm {
  const picker = subject === "owners"
    ? { name: "ownerId", label: "Proprietário", optionsSource: "imob_owners" as const }
    : { name: "propertyId", label: subject === "rentals" ? "Imóvel da locação" : "Imóvel", optionsSource: "imob_properties" as const };
  return {
    entity: "documento",
    action: subject,
    submitTarget: DOCUMENT_ATTACH_SUBMIT_TARGET,
    label: subject === "owners" ? "Anexar documento do proprietário" : subject === "properties" ? "Anexar documento do imóvel" : "Anexar documento da locação",
    description: subject === "rentals"
      ? "O documento fica na locação ativa do imóvel. \"Contrato assinado\" resolve a pendência de contrato."
      : "O arquivo fica guardado no cadastro. Só quem tem acesso ao IMOB neste workspace consegue abrir.",
    fields: [
      {
        ...picker,
        type: "select",
        required: true,
        placeholder: "Selecione",
        value: "",
        options: [],
      },
      {
        name: "category",
        label: "Tipo de documento",
        type: "select",
        required: true,
        placeholder: "Selecione",
        value: "",
        options: CATEGORY_OPTIONS[subject],
      },
      {
        name: "file",
        label: "Arquivo",
        type: "file",
        required: true,
        value: "",
        helperText: "PDF, Word, texto ou imagem, até 5 MB cada.",
      },
      { name: "notes", label: "Observação (opcional)", type: "text", maxLength: 300, placeholder: "Ex.: versão com reconhecimento de firma", value: "" },
    ],
    actions: [
      { id: "cancel", label: "Cancelar", kind: "secondary" },
      { id: "submit", label: "Anexar", kind: "primary" },
    ],
  };
}

export function validateDocumentAttachValues(subject: DocumentAttachSubject, values: Record<string, string>, fileCount: number) {
  const errors: Record<string, string> = {};
  const subjectField = SUBJECT_FIELD[subject];
  if (!(values[subjectField] ?? "").trim()) {
    errors[subjectField] = subject === "owners" ? "Selecione o proprietário." : "Selecione o imóvel.";
  }
  if (!(values.category ?? "").trim()) errors.category = "Escolha o tipo de documento.";
  if (fileCount === 0) errors.file = "Escolha o arquivo.";
  else if (fileCount > DOCUMENT_ATTACH_MAX_FILES) errors.file = `Envie no máximo ${DOCUMENT_ATTACH_MAX_FILES} arquivos por vez.`;
  return errors;
}

export function buildDocumentLinkRequest(
  subject: DocumentAttachSubject,
  values: Record<string, string>,
  documentIds: string[],
): ImobDocumentLinkRequest {
  const notes = (values.notes ?? "").trim();
  return {
    subjectType: SUBJECT_TYPE[subject],
    subjectId: (values[SUBJECT_FIELD[subject]] ?? "").trim(),
    category: (values.category ?? "").trim(),
    documentIds,
    ...(notes ? { notes } : {}),
  };
}

export function buildDocumentAttachConfirmationText(params: {
  subject: DocumentAttachSubject;
  subjectLabel: string;
  category: string;
  fileNames: string[];
  alreadyLinked: number;
  contractPendingCleared?: boolean;
}) {
  const target = params.subject === "rentals" ? `à locação de ${params.subjectLabel}` : `a ${params.subjectLabel}`;
  const files = params.fileNames.join(", ");
  const lines = [
    params.fileNames.length > 0
      ? `Anexado ${target} como ${documentCategoryLabel(params.subject, params.category)}: ${files}.`
      : `Nenhum arquivo novo: ${params.alreadyLinked === 1 ? "este arquivo já estava anexado" : "estes arquivos já estavam anexados"} ${target}.`,
  ];
  if (params.contractPendingCleared) lines.push("Pendência de contrato resolvida.");
  return lines.join(" ");
}

export function describeDocumentAttachError(subject: DocumentAttachSubject, status: number, code: string | undefined) {
  if (status === 403) return "Sua função atual não pode anexar documentos do IMOB neste workspace. Nada foi anexado.";
  if (status === 413) return "Arquivo grande demais (limite de 5 MB). Nada foi anexado.";
  if (status === 415) return "Tipo de arquivo não aceito. Use PDF, Word, texto ou imagem. Nada foi anexado.";
  if (code === "RENTAL_LEASE_NOT_FOUND") return "Este imóvel não tem locação ativa. Cadastre a locação antes (Locações → Cadastrar locação).";
  if (code === "SUBJECT_NOT_FOUND") {
    return subject === "owners"
      ? "Proprietário não encontrado (pode ter sido arquivado). Nada foi anexado."
      : "Imóvel não encontrado (pode ter sido arquivado). Nada foi anexado.";
  }
  if (code === "TOO_MANY_DOCUMENTS") return "Este cadastro atingiu o limite de documentos. Nada foi anexado.";
  return `Não foi possível anexar agora${status ? ` (HTTP ${status})` : ""}. Nada foi anexado; tente de novo.`;
}

/**
 * Documentos dentro dos formulários de cadastro (proprietário, imóvel,
 * locação e contrato): os campos entram no fim do formulário e os arquivos
 * são vinculados ao cadastro logo depois de salvar.
 */
export const INLINE_DOCUMENT_CATEGORY_FIELD = "documentCategory";
export const INLINE_DOCUMENT_FILE_FIELD = "documents";

const INLINE_DOCUMENT_SUBJECT_BY_TARGET: Record<string, DocumentAttachSubject> = {
  "imob.owners.create": "owners",
  "imob.properties.create": "properties",
  "imob.rentals.create": "rentals",
  "imob.contracts.rental": "rentals",
};

export function inlineDocumentSubjectFor(form: Pick<ImobPresentationForm, "submitTarget"> | null | undefined): DocumentAttachSubject | null {
  return (form?.submitTarget && INLINE_DOCUMENT_SUBJECT_BY_TARGET[form.submitTarget]) || null;
}

export function withInlineDocumentFields(form: ImobPresentationForm): ImobPresentationForm {
  const subject = inlineDocumentSubjectFor(form);
  if (!subject || form.fields.some((field) => field.name === INLINE_DOCUMENT_FILE_FIELD)) return form;
  return {
    ...form,
    fields: [
      ...form.fields,
      {
        name: INLINE_DOCUMENT_CATEGORY_FIELD,
        label: "Tipo de documento (se for anexar)",
        type: "select",
        placeholder: "Selecione",
        value: "",
        options: CATEGORY_OPTIONS[subject],
      },
      {
        name: INLINE_DOCUMENT_FILE_FIELD,
        label: "Anexar documentos (opcional)",
        type: "file",
        value: "",
        helperText: "PDF, Word, texto ou imagem, até 5 MB cada. Ficam guardados no cadastro.",
      },
    ],
  };
}

/** Antes de salvar: com arquivo escolhido, o tipo é obrigatório. */
export function validateInlineDocuments(values: Record<string, string>, fileCount: number): Record<string, string> {
  if (fileCount === 0) return {};
  if (fileCount > DOCUMENT_ATTACH_MAX_FILES) return { [INLINE_DOCUMENT_FILE_FIELD]: `Envie no máximo ${DOCUMENT_ATTACH_MAX_FILES} arquivos por vez.` };
  if (!(values[INLINE_DOCUMENT_CATEGORY_FIELD] ?? "").trim()) return { [INLINE_DOCUMENT_CATEGORY_FIELD]: "Escolha o tipo do documento." };
  return {};
}

export function buildInlineDocumentsNote(params: { linked: number; contractPendingCleared?: boolean; failed?: string | null }) {
  if (params.failed) return `O cadastro foi salvo, mas os documentos não foram anexados (${params.failed}). Use o menu → Anexar documento.`;
  if (params.linked === 0) return null;
  return [
    params.linked === 1 ? "1 documento anexado." : `${params.linked} documentos anexados.`,
    params.contractPendingCleared ? "Pendência de contrato resolvida." : null,
  ].filter(Boolean).join(" ");
}
