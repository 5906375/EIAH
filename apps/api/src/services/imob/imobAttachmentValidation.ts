import { readFile } from "node:fs/promises";
import type { UploadedDocument } from "@repo/db";
import { z } from "zod";
import { loadFileAbsolutePath } from "../storage";
import {
  IMOB_IDENTITY_ATTACHMENT_VALIDATION_CONTRACT,
  type ImobAttachmentCrmSuggestion,
  type ImobAttachmentCrmSuggestionField,
  type ImobAttachmentValidationComparisonStatus,
  type ImobAttachmentValidationDecision,
  type ImobAttachmentValidationFieldResult,
} from "./imobConversationContract";

type ImobOwnerLike = {
  id: string;
  name: string;
  document?: string | null;
  phone?: string | null;
  metadata?: unknown;
};

type ImobCaseLike = {
  id: string;
  flow: string;
  stage: string;
  status: string;
  threadId?: string | null;
  ownerId?: string | null;
  owner?: ImobOwnerLike | null;
  pendingItems?: unknown;
};

type UploadedDocumentLike = Pick<UploadedDocument, "id" | "fileName" | "mimeType" | "sizeBytes" | "storageKey">;

type ExtractedIdentity = {
  name: string | null;
  cpf: string | null;
  rg: string | null;
  legible: boolean;
  notes: string[];
  source: "text_plain" | "pdf_text" | "multimodal_openai" | "unsupported" | "heuristic";
};

type ValidationField = "nome" | "cpf" | "rg";

type ProviderDocumentInput = {
  document: UploadedDocumentLike;
  buffer: Buffer;
};

const DOCUMENT_VALIDATION_TIMEOUT_MS = Number(process.env.IMOB_DOCUMENT_VALIDATION_TIMEOUT_MS ?? 15000);

const ExtractedIdentityResponseSchema = z.object({
  name: z.string().trim().min(1).nullable().optional(),
  cpf: z.string().trim().min(1).nullable().optional(),
  rg: z.string().trim().min(1).nullable().optional(),
  legible: z.boolean().optional(),
  notes: z.array(z.string().trim().min(1)).max(6).optional(),
});

const ExtractedIdentityJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: { type: ["string", "null"] },
    cpf: { type: ["string", "null"] },
    rg: { type: ["string", "null"] },
    legible: { type: "boolean" },
    notes: {
      type: "array",
      items: { type: "string" },
      maxItems: 6,
    },
  },
  required: ["name", "cpf", "rg", "legible", "notes"],
} as const;

export type ImobAttachmentValidationExecution = {
  contract: typeof IMOB_IDENTITY_ATTACHMENT_VALIDATION_CONTRACT;
  handled: boolean;
  decision: ImobAttachmentValidationDecision;
  resolved: boolean;
  document: UploadedDocumentLike | null;
  photo: UploadedDocumentLike | null;
  extracted: ExtractedIdentity;
  fields: ImobAttachmentValidationFieldResult[];
  summary: string;
  nextStep: string;
  card: {
    title: string;
    lines: string[];
  };
  crmSuggestion: ImobAttachmentCrmSuggestion | null;
  dedupeKey: string;
  eventType: string;
  eventSummary: string;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function digitsOnly(value?: string | null) {
  return (value ?? "").replace(/\D/g, "");
}

function normalizeRg(value?: string | null) {
  return (value ?? "")
    .toUpperCase()
    .replace(/[^0-9X]/g, "")
    .trim();
}

function prettifyStatus(status: ImobAttachmentValidationComparisonStatus) {
  if (status === "confere") return "Confere";
  if (status === "diverge") return "Diverge";
  return "Ilegível";
}

function extractRgFromMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const rg = (metadata as Record<string, unknown>).rg;
  return typeof rg === "string" && rg.trim().length > 0 ? rg.trim() : null;
}

function getOwnerCpf(owner: ImobOwnerLike) {
  const digits = digitsOnly(owner.document);
  const phoneDigits = digitsOnly(owner.phone);
  if (digits && phoneDigits && digits === phoneDigits) return null;
  return digits.length === 11 ? digits : null;
}

function getOwnerRg(owner: ImobOwnerLike) {
  const metadataRg = normalizeRg(extractRgFromMetadata(owner.metadata));
  if (metadataRg) return metadataRg;
  const doc = normalizeRg(owner.document);
  if (doc && digitsOnly(owner.document) !== digitsOnly(owner.phone) && digitsOnly(owner.document).length !== 11) return doc;
  return null;
}

function classifyUploads(docs: UploadedDocumentLike[]) {
  const imageDocs = docs.filter((item) => item.mimeType.startsWith("image/"));
  const photoHints = /(selfie|foto|photo|rosto|perfil|face)/i;
  const documentHints = /(rg|cpf|cnh|identidade|documento|doc|frente|verso|pdf)/i;

  const photo = imageDocs.find((item) => photoHints.test(item.fileName)) ?? null;
  let documentPages = docs
    .filter((item) => item.id !== photo?.id)
    .filter((item) => documentHints.test(item.fileName) || item.mimeType === "application/pdf" || item.mimeType === "text/plain");

  if (documentPages.length === 0) {
    documentPages = docs.filter((item) => item.id !== photo?.id);
  }

  return {
    document: documentPages[0] ?? null,
    documentPages,
    photo,
  };
}

function extractCpf(text: string) {
  const labeled = text.match(/(?:cpf|documento)\s*[:\-]?\s*(\d{3}\.?\d{3}\.?\d{3}\-?\d{2})/i);
  if (labeled) return digitsOnly(labeled[1]);
  const plain = text.match(/\b\d{3}\.?\d{3}\.?\d{3}\-?\d{2}\b/);
  if (plain) return digitsOnly(plain[0]);
  return null;
}

function extractRg(text: string) {
  const labeled = text.match(/(?:rg|identidade)\s*[:\-]?\s*([0-9.\-xX]{5,20})/i);
  if (labeled) return normalizeRg(labeled[1]);
  return null;
}

function extractName(text: string) {
  const labeled = text.match(/(?:nome|nome completo)\s*[:\-]\s*([^\n\r]+)/i);
  if (labeled) return labeled[1].trim();

  const candidates = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 6)
    .filter((line) => /[A-Za-zÀ-ÿ]{2,}/.test(line))
    .filter((line) => !/(cpf|rg|identidade|documento|nascimento|validade)/i.test(line))
    .filter((line) => digitsOnly(line).length < 6)
    .sort((a, b) => b.length - a.length);

  return candidates[0] ?? null;
}

function buildUnsupportedIdentity(notes: string[]): ExtractedIdentity {
  return {
    name: null,
    cpf: null,
    rg: null,
    legible: false,
    notes,
    source: "unsupported",
  };
}

function isGenericUnsupportedIdentityNote(note: string) {
  return normalizeText(note) === normalizeText("Não identifiquei anexos elegíveis para validação automática.");
}

function dedupeNotes(notes: string[]) {
  return [...new Set(notes.map((item) => item.trim()).filter(Boolean))].slice(0, 6);
}

function buildCrmSuggestionField(field: "name" | "document" | "rg", label: string, currentValue?: string | null, suggestedValue?: string | null): ImobAttachmentCrmSuggestionField | null {
  if (!suggestedValue) return null;
  if ((currentValue ?? null) === suggestedValue) return null;
  return {
    field,
    label,
    currentValue: currentValue ?? null,
    suggestedValue,
  };
}

function buildOwnerCrmSuggestion(params: {
  owner: ImobOwnerLike;
  documentIds: string[];
  extracted: ExtractedIdentity;
}) : ImobAttachmentCrmSuggestion | null {
  const ownerDocument = getOwnerCpf(params.owner);
  const ownerRg = extractRgFromMetadata(params.owner.metadata);
  const fields = [
    buildCrmSuggestionField("name", "Nome", params.owner.name, params.extracted.name),
    buildCrmSuggestionField("document", "CPF", ownerDocument, params.extracted.cpf),
    buildCrmSuggestionField("rg", "RG", ownerRg, params.extracted.rg),
  ].filter(Boolean) as ImobAttachmentCrmSuggestionField[];

  if (fields.length === 0) return null;
  return {
    entityType: "owner",
    ownerId: params.owner.id,
    ownerName: params.owner.name,
    fields,
    documentIds: params.documentIds,
    availableModes: ["include", "edit", "discard"],
  };
}

function normalizeStructuredExtractedIdentity(raw: unknown, source: ExtractedIdentity["source"]): ExtractedIdentity {
  const parsed = ExtractedIdentityResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return buildUnsupportedIdentity(["Resposta estruturada inválida para validação documental."]);
  }
  const data = parsed.data;
  const normalizeMaybeText = (value?: string | null) => {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (["null", "undefined", "nao identificado", "não identificado", "ilegivel", "ilegível"].includes(normalizeText(trimmed))) {
      return null;
    }
    return trimmed;
  };
  const name = normalizeMaybeText(data.name);
  const cpf = normalizeMaybeText(data.cpf);
  const rg = normalizeMaybeText(data.rg);
  return {
    name,
    cpf: cpf ? digitsOnly(cpf) || null : null,
    rg: rg ? normalizeRg(rg) || null : null,
    legible: data.legible === true || Boolean(name || cpf || rg),
    notes: dedupeNotes(data.notes ?? []),
    source,
  };
}

function extractIdentityFromPlainText(text: string, source: ExtractedIdentity["source"] = "text_plain"): ExtractedIdentity {
  const name = extractName(text);
  const cpf = extractCpf(text);
  const rg = extractRg(text);
  const notes: string[] = [];
  if (!name) notes.push("Não consegui extrair o nome do documento.");
  if (!cpf) notes.push("Não consegui extrair o CPF do documento.");
  if (!rg) notes.push("Não consegui extrair o RG do documento.");
  return normalizeStructuredExtractedIdentity(
    {
      name,
      cpf,
      rg,
      legible: Boolean(name || cpf || rg),
      notes,
    },
    source
  );
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Document validation returned no JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

function decodePdfLiteral(value: string) {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\r/g, " ")
    .replace(/\\n/g, " ")
    .replace(/\\t/g, " ");
}

function extractTextFromPdfBuffer(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  const literalMatches = [...raw.matchAll(/\((?:\\.|[^\\()])+\)/g)]
    .map((match) => decodePdfLiteral(match[0].slice(1, -1)).trim())
    .filter((value) => value.length >= 3);
  const hexMatches = [...raw.matchAll(/<([0-9A-Fa-f]{8,})>/g)]
    .map((match) => {
      try {
        return Buffer.from(match[1], "hex").toString("utf8").replace(/\u0000/g, "").trim();
      } catch {
        return "";
      }
    })
    .filter((value) => value.length >= 3);
  const merged = [...literalMatches, ...hexMatches]
    .filter((value) => /[A-Za-z0-9À-ÿ]/.test(value))
    .join("\n");
  return merged.trim();
}

function isIdentitySufficient(identity: ExtractedIdentity) {
  return Boolean(identity.name && (identity.cpf || identity.rg));
}

function mergeExtractedIdentities(primary: ExtractedIdentity, secondary: ExtractedIdentity): ExtractedIdentity {
  const mergedNotes = dedupeNotes([...primary.notes, ...secondary.notes]);
  const merged: ExtractedIdentity = {
    name: primary.name ?? secondary.name,
    cpf: primary.cpf ?? secondary.cpf,
    rg: primary.rg ?? secondary.rg,
    legible: primary.legible || secondary.legible,
    notes: mergedNotes,
    source: primary.legible ? primary.source : secondary.source,
  };
  if (!merged.name) merged.name = secondary.name ?? primary.name;
  if (!merged.cpf) merged.cpf = secondary.cpf ?? primary.cpf;
  if (!merged.rg) merged.rg = secondary.rg ?? primary.rg;
  if (!merged.legible && (merged.name || merged.cpf || merged.rg)) {
    merged.legible = true;
  }
  return merged;
}

function extractResponseText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text;
  }

  const parts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === "string" && content.text.trim()) {
        parts.push(content.text);
      }
      if (typeof content?.output_text === "string" && content.output_text.trim()) {
        parts.push(content.output_text);
      }
    }
  }
  return parts.join("\n").trim();
}

async function extractIdentityFromProvider(documents: ProviderDocumentInput[]): Promise<ExtractedIdentity> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return buildUnsupportedIdentity(["Validação visual indisponível: OPENAI_API_KEY não configurada."]);
  }
  if (documents.length === 0) {
    return buildUnsupportedIdentity(["Nenhum arquivo elegível foi enviado para validação multimodal."]);
  }

  const model = process.env.IMOB_DOCUMENT_VALIDATION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOCUMENT_VALIDATION_TIMEOUT_MS);

  const userContent: Array<Record<string, unknown>> = [
    {
      type: "input_text",
      text:
        "Os anexos podem representar páginas diferentes do mesmo documento brasileiro de identificação, incluindo PDF escaneado, frente e verso em imagens separadas e documento com foto separada. " +
        "Extraia nome, CPF e RG consolidando todos os anexos relevantes. Não invente valores. Se um campo não estiver legível, retorne null. " +
        "Se os anexos não forem suficientes para identificar o documento com segurança, retorne legible=false e explique brevemente em notes.",
    },
  ];

  for (const item of documents) {
    if (item.document.mimeType === "application/pdf") {
      userContent.push({
        type: "input_file",
        filename: item.document.fileName,
        file_data: item.buffer.toString("base64"),
      });
      continue;
    }
    if (item.document.mimeType === "image/png" || item.document.mimeType === "image/jpeg") {
      userContent.push({
        type: "input_image",
        image_url: `data:${item.document.mimeType};base64,${item.buffer.toString("base64")}`,
        detail: "high",
      });
    }
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "developer",
            content: [
              {
                type: "input_text",
                text:
                  "Você extrai campos de documento de identificação brasileiro. Responda apenas no schema solicitado com name, cpf, rg, legible e notes. " +
                  "Considere que múltiplas páginas e múltiplas imagens podem pertencer ao mesmo documento.",
              },
            ],
          },
          {
            role: "user",
            content: userContent,
          },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "imob_identity_extraction",
            strict: true,
            schema: ExtractedIdentityJsonSchema,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      return buildUnsupportedIdentity([
        `Validação visual temporariamente indisponível: provedor respondeu ${response.status}.`,
      ]);
    }

    const json = (await response.json()) as any;
    const content = extractResponseText(json);
    const parsed = extractJsonObject(content || JSON.stringify({}));
    return normalizeStructuredExtractedIdentity(parsed, "multimodal_openai");
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? `Validação visual temporariamente indisponível: timeout após ${DOCUMENT_VALIDATION_TIMEOUT_MS}ms.`
      : "Validação visual temporariamente indisponível: não consegui consultar o provedor agora.";
    return buildUnsupportedIdentity([message]);
  } finally {
    clearTimeout(timeout);
  }
}

async function loadProviderDocuments(documents: UploadedDocumentLike[]) {
  const supported = documents.filter((item) => item.mimeType === "application/pdf" || item.mimeType === "image/png" || item.mimeType === "image/jpeg");
  const loaded: ProviderDocumentInput[] = [];
  for (const item of supported) {
    const absolutePath = await loadFileAbsolutePath(item.storageKey);
    if (!absolutePath) continue;
    loaded.push({
      document: item,
      buffer: await readFile(absolutePath),
    });
  }
  return loaded;
}

async function extractDocumentIdentity(documents: UploadedDocumentLike[]): Promise<ExtractedIdentity> {
  if (documents.length === 0) {
    return buildUnsupportedIdentity(["Nenhum documento principal foi identificado entre os anexos."]);
  }

  let combinedTextIdentity: ExtractedIdentity | null = null;
  const providerCandidateDocs: UploadedDocumentLike[] = [];
  const notes: string[] = [];

  for (const document of documents) {
    const absolutePath = await loadFileAbsolutePath(document.storageKey);
    if (!absolutePath) {
      notes.push(`O arquivo ${document.fileName} não está mais disponível no storage.`);
      continue;
    }

    const buffer = await readFile(absolutePath);
    if (document.mimeType === "text/plain") {
      const extracted = extractIdentityFromPlainText(buffer.toString("utf8"), "text_plain");
      combinedTextIdentity = combinedTextIdentity ? mergeExtractedIdentities(combinedTextIdentity, extracted) : extracted;
      continue;
    }

    if (document.mimeType === "application/pdf") {
      const extractedPdfText = extractTextFromPdfBuffer(buffer);
      if (extractedPdfText) {
        const extracted = extractIdentityFromPlainText(extractedPdfText, "pdf_text");
        combinedTextIdentity = combinedTextIdentity ? mergeExtractedIdentities(combinedTextIdentity, extracted) : extracted;
      }
      providerCandidateDocs.push(document);
      continue;
    }

    if (document.mimeType === "image/png" || document.mimeType === "image/jpeg") {
      providerCandidateDocs.push(document);
      continue;
    }

    notes.push(`Mime type ${document.mimeType} ainda não suportado nesta etapa para leitura automática.`);
  }

  const fallbackTextIdentity = combinedTextIdentity
    ? {
        ...combinedTextIdentity,
        notes: dedupeNotes([...combinedTextIdentity.notes, ...notes]),
      }
    : buildUnsupportedIdentity(notes.length > 0 ? notes : ["Não identifiquei anexos elegíveis para validação automática."]);

  if (isIdentitySufficient(fallbackTextIdentity)) {
    return fallbackTextIdentity;
  }

  if (providerCandidateDocs.length === 0) {
    return fallbackTextIdentity;
  }

  const providerDocuments = await loadProviderDocuments(providerCandidateDocs);
  const providerIdentity = await extractIdentityFromProvider(providerDocuments);
  const mergedIdentity = mergeExtractedIdentities(providerIdentity, fallbackTextIdentity);
  mergedIdentity.notes = dedupeNotes(mergedIdentity.notes.filter((note) => !isGenericUnsupportedIdentityNote(note)));

  if (!mergedIdentity.legible && providerCandidateDocs.some((item) => item.mimeType === "application/pdf")) {
    mergedIdentity.notes = dedupeNotes([
      ...mergedIdentity.notes,
      "PDF escaneado ou imagem multipágina encaminhado para revisão por falta de leitura automática suficiente.",
    ]);
  }

  return mergedIdentity;
}

function compareField(params: {
  field: ValidationField;
  extractedValue: string | null;
  caseValue: string | null;
  prettyExtracted?: string | null;
  prettyCase?: string | null;
  missingCaseNote: string;
  illegibleNote: string;
}): ImobAttachmentValidationFieldResult {
  if (!params.extractedValue) {
    return {
      field: params.field,
      label: params.field.toUpperCase() === "NOME" ? "Nome" : params.field.toUpperCase(),
      status: "ilegivel",
      extractedValue: params.prettyExtracted ?? null,
      caseValue: params.prettyCase ?? null,
      note: params.illegibleNote,
    };
  }
  if (!params.caseValue) {
    return {
      field: params.field,
      label: params.field.toUpperCase() === "NOME" ? "Nome" : params.field.toUpperCase(),
      status: "ilegivel",
      extractedValue: params.prettyExtracted ?? params.extractedValue,
      caseValue: params.prettyCase ?? null,
      note: params.missingCaseNote,
    };
  }
  return {
    field: params.field,
    label: params.field.toUpperCase() === "NOME" ? "Nome" : params.field.toUpperCase(),
    status: params.extractedValue === params.caseValue ? "confere" : "diverge",
    extractedValue: params.prettyExtracted ?? params.extractedValue,
    caseValue: params.prettyCase ?? params.caseValue,
  };
}

function compareName(extractedName: string | null, ownerName: string): ImobAttachmentValidationFieldResult {
  if (!extractedName) {
    return {
      field: "nome",
      label: "Nome",
      status: "ilegivel",
      extractedValue: null,
      caseValue: ownerName,
      note: "Não consegui ler o nome do documento com segurança.",
    };
  }
  const extractedNormalized = normalizeText(extractedName);
  const caseNormalized = normalizeText(ownerName);
  const matches = extractedNormalized === caseNormalized || extractedNormalized.includes(caseNormalized) || caseNormalized.includes(extractedNormalized);
  return {
    field: "nome",
    label: "Nome",
    status: matches ? "confere" : "diverge",
    extractedValue: extractedName,
    caseValue: ownerName,
  };
}

function buildCardLines(
  fields: ImobAttachmentValidationFieldResult[],
  photo: UploadedDocumentLike | null,
  extracted: ExtractedIdentity,
  decision: ImobAttachmentValidationDecision
) {
  const lines = fields.map((field) => {
    const details = [
      `${field.label}: ${prettifyStatus(field.status)}`,
      field.extractedValue ? `extraído ${field.extractedValue}` : null,
      field.caseValue ? `caso ${field.caseValue}` : null,
      field.note ?? null,
    ].filter(Boolean);
    return details.join(" • ");
  });

  lines.unshift(decision === "approved" ? "Decisão: aprovado automaticamente." : "Decisão: encaminhado para revisão humana.");
  lines.push(
    photo
      ? `Foto: recebida (${photo.fileName}) • Sem biometria automática nesta etapa.`
      : "Foto: não enviada • Sem biometria automática nesta etapa."
  );

  if (extracted.notes.length > 0) {
    lines.push(...extracted.notes.slice(0, 3).map((item) => `Observação: ${item}`));
  }

  return lines;
}

function decideValidation(fields: ImobAttachmentValidationFieldResult[]) {
  const nameField = fields.find((field) => field.field === "nome");
  const documentFields = fields.filter((field) => field.field === "cpf" || field.field === "rg");
  const hasCriticalDivergence = fields.some((field) => field.status === "diverge");
  const hasApprovedDocumentField = documentFields.some((field) => field.status === "confere");
  const decision: ImobAttachmentValidationDecision = !hasCriticalDivergence && nameField?.status === "confere" && hasApprovedDocumentField
    ? "approved"
    : "review_needed";
  return {
    decision,
    resolved: decision === "approved",
  };
}

export async function validateImobIdentityAttachmentAgainstCase(params: {
  docs: UploadedDocumentLike[];
  caseItem: ImobCaseLike;
}): Promise<ImobAttachmentValidationExecution> {
  const owner = params.caseItem.owner;
  const { document, documentPages, photo } = classifyUploads(params.docs);

  if (!owner) {
    return {
      contract: IMOB_IDENTITY_ATTACHMENT_VALIDATION_CONTRACT,
      handled: false,
      decision: "review_needed",
      resolved: false,
      document,
      photo,
      extracted: buildUnsupportedIdentity(["Caso sem proprietário associado para validação."]),
      fields: [],
      summary: "Ainda preciso do proprietário correto para validar o documento automaticamente.",
      nextStep: "Abra o caso do proprietário correto e tente anexar novamente.",
      card: {
        title: "Validação documental",
        lines: ["Decisão: encaminhado para revisão humana.", "Caso sem proprietário associado para validação."],
      },
      crmSuggestion: null,
      dedupeKey: `crm.owner.identity_validation:${params.caseItem.id}:${document?.id ?? "none"}`,
      eventType: "case.identity_document_review_needed",
      eventSummary: "Validação documental não executada por falta de proprietário associado.",
    };
  }

  const extracted = await extractDocumentIdentity(documentPages);
  const ownerCpf = getOwnerCpf(owner);
  const ownerRg = getOwnerRg(owner);

  const nameField = compareName(extracted.name, owner.name);
  const cpfField = compareField({
    field: "cpf",
    extractedValue: digitsOnly(extracted.cpf),
    caseValue: ownerCpf,
    prettyExtracted: extracted.cpf,
    prettyCase: owner.document ?? ownerCpf,
    missingCaseNote: "O caso ainda não tem CPF cadastrado para confronto automático.",
    illegibleNote: "Não consegui ler o CPF do documento.",
  });
  const rgField = compareField({
    field: "rg",
    extractedValue: normalizeRg(extracted.rg),
    caseValue: ownerRg,
    prettyExtracted: extracted.rg,
    prettyCase: extractRgFromMetadata(owner.metadata) ?? (ownerRg && ownerRg !== ownerCpf ? ownerRg : null),
    missingCaseNote: "O caso ainda não tem RG cadastrado para confronto automático.",
    illegibleNote: "Não consegui ler o RG do documento.",
  });

  const fields = [nameField, cpfField, rgField];
  const crmSuggestion = buildOwnerCrmSuggestion({
    owner,
    documentIds: documentPages.map((item) => item.id),
    extracted,
  });
  const { decision, resolved } = decideValidation(fields);

  const summary = decision === "approved"
    ? `Documento do proprietário ${owner.name} aprovado automaticamente com os dados do caso.`
    : extracted.legible
      ? `Documento do proprietário ${owner.name} encaminhado para revisão. Encontrei divergências ou base insuficiente para aprovação automática.`
      : `Documento do proprietário ${owner.name} encaminhado para revisão porque a extração automática ficou insuficiente.`;
  const nextStep = decision === "approved"
    ? "Seguir com o cadastro do proprietário e a próxima etapa operacional."
    : extracted.legible
      ? "Revise nome, CPF/RG do caso e solicite novo documento ou ajuste cadastral se necessário."
      : "Solicite PDF mais nítido, frente/verso completos ou revise manualmente até nova validação.";

  return {
    contract: IMOB_IDENTITY_ATTACHMENT_VALIDATION_CONTRACT,
    handled: true,
    decision,
    resolved,
    document,
    photo,
    extracted,
    fields,
    summary,
    nextStep,
    card: {
      title: decision === "approved" ? "Validação documental aprovada" : "Validação documental em revisão",
      lines: buildCardLines(fields, photo, extracted, decision),
    },
    crmSuggestion,
    dedupeKey: `crm.owner.identity_validation:${owner.id}:${document?.id ?? "none"}`,
    eventType: decision === "approved" ? "case.identity_document_validated" : "case.identity_document_review_needed",
    eventSummary: decision === "approved"
      ? `Documento do proprietário ${owner.name} aprovado automaticamente contra os dados do caso.`
      : `Documento do proprietário ${owner.name} precisa de revisão documental.`,
  };
}