import { readFile } from "node:fs/promises";
import type { UploadedDocument } from "@repo/db";
import { loadFileAbsolutePath } from "../storage";
import {
  IMOB_IDENTITY_ATTACHMENT_VALIDATION_CONTRACT,
  type ImobAttachmentValidationComparisonStatus,
  type ImobAttachmentValidationFieldResult,
} from "./imobConversationContract";

type ImobOwnerLike = {
  id: string;
  name: string;
  document?: string | null;
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
  source: "text_plain" | "multimodal_openai" | "unsupported" | "heuristic";
};

type ValidationField = "nome" | "cpf" | "rg";

export type ImobAttachmentValidationExecution = {
  contract: typeof IMOB_IDENTITY_ATTACHMENT_VALIDATION_CONTRACT;
  handled: boolean;
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
  return digits.length === 11 ? digits : null;
}

function getOwnerRg(owner: ImobOwnerLike) {
  const metadataRg = normalizeRg(extractRgFromMetadata(owner.metadata));
  if (metadataRg) return metadataRg;
  const doc = normalizeRg(owner.document);
  if (doc && digitsOnly(owner.document).length !== 11) return doc;
  return null;
}

function classifyUploads(docs: UploadedDocumentLike[]) {
  const imageDocs = docs.filter((item) => item.mimeType.startsWith("image/"));
  const photoHints = /(selfie|foto|photo|rosto|perfil|face)/i;
  const documentHints = /(rg|cpf|cnh|identidade|documento|doc|frente|verso)/i;

  let photo = imageDocs.find((item) => photoHints.test(item.fileName)) ?? null;
  let document = docs.find((item) => documentHints.test(item.fileName)) ?? null;

  if (!document) {
    document = docs.find((item) => item.id !== photo?.id) ?? docs[0] ?? null;
  }
  if (!photo) {
    photo = imageDocs.find((item) => item.id !== document?.id) ?? null;
  }

  return { document, photo };
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

function extractIdentityFromPlainText(text: string): ExtractedIdentity {
  const name = extractName(text);
  const cpf = extractCpf(text);
  const rg = extractRg(text);
  const notes: string[] = [];
  if (!name) notes.push("Não consegui extrair o nome do documento.");
  if (!cpf) notes.push("Não consegui extrair o CPF do documento.");
  if (!rg) notes.push("Não consegui extrair o RG do documento.");
  return {
    name,
    cpf,
    rg,
    legible: Boolean(name || cpf || rg),
    notes,
    source: "text_plain",
  };
}

function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Document validation returned no JSON object");
  }
  return JSON.parse(text.slice(start, end + 1));
}

async function extractIdentityFromImage(buffer: Buffer, mimeType: string): Promise<ExtractedIdentity> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      name: null,
      cpf: null,
      rg: null,
      legible: false,
      notes: ["Validação visual indisponível: OPENAI_API_KEY não configurada."],
      source: "unsupported",
    };
  }

  const model = process.env.IMOB_DOCUMENT_VALIDATION_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const dataUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "Você extrai campos de documento de identificação brasileiro. Retorne JSON apenas com: name, cpf, rg, legible, notes. " +
            "Não invente valores. Se não conseguir ler um campo, retorne null para ele. notes deve ser um array curto de strings.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Extraia nome, CPF e RG do documento de identificação mostrado na imagem. Se a imagem não for um documento legível, retorne legible=false.",
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
    }),
  });

  const json = (await response.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(typeof content === "string" ? content : JSON.stringify(content ?? {}));

  return {
    name: typeof parsed?.name === "string" && parsed.name.trim().length > 0 ? parsed.name.trim() : null,
    cpf: typeof parsed?.cpf === "string" ? digitsOnly(parsed.cpf) || null : null,
    rg: typeof parsed?.rg === "string" ? normalizeRg(parsed.rg) || null : null,
    legible: parsed?.legible === true || Boolean(parsed?.name || parsed?.cpf || parsed?.rg),
    notes: Array.isArray(parsed?.notes) ? parsed.notes.filter((item: unknown) => typeof item === "string").slice(0, 4) : [],
    source: "multimodal_openai",
  };
}

async function extractDocumentIdentity(document: UploadedDocumentLike | null): Promise<ExtractedIdentity> {
  if (!document) {
    return {
      name: null,
      cpf: null,
      rg: null,
      legible: false,
      notes: ["Nenhum documento principal foi identificado entre os anexos."],
      source: "unsupported",
    };
  }

  const absolutePath = await loadFileAbsolutePath(document.storageKey);
  if (!absolutePath) {
    return {
      name: null,
      cpf: null,
      rg: null,
      legible: false,
      notes: ["O arquivo anexado não está mais disponível no storage."],
      source: "unsupported",
    };
  }

  const buffer = await readFile(absolutePath);
  if (document.mimeType === "text/plain") {
    return extractIdentityFromPlainText(buffer.toString("utf8"));
  }
  if (document.mimeType === "image/png" || document.mimeType === "image/jpeg") {
    return extractIdentityFromImage(buffer, document.mimeType);
  }

  return {
    name: null,
    cpf: null,
    rg: null,
    legible: false,
    notes: [`Mime type ${document.mimeType} ainda não suportado nesta etapa para leitura automática.`],
    source: "unsupported",
  };
}

function compareField(params: {
  field: ValidationField;
  extractedValue: string | null;
  caseValue: string | null;
  prettyExtracted?: string | null;
  prettyCase?: string | null;
  missingCaseNote: string;
  illegibleNote: string;
}) : ImobAttachmentValidationFieldResult {
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

function buildCardLines(fields: ImobAttachmentValidationFieldResult[], photo: UploadedDocumentLike | null, extracted: ExtractedIdentity) {
  const lines = fields.map((field) => {
    const details = [
      `${field.label}: ${prettifyStatus(field.status)}`,
      field.extractedValue ? `extraído ${field.extractedValue}` : null,
      field.caseValue ? `caso ${field.caseValue}` : null,
      field.note ?? null,
    ].filter(Boolean);
    return details.join(" • ");
  });

  lines.push(
    photo
      ? `Foto: recebida (${photo.fileName}) • Sem biometria automática nesta etapa.`
      : "Foto: não enviada • Sem biometria automática nesta etapa."
  );

  if (extracted.notes.length > 0) {
    lines.push(...extracted.notes.slice(0, 2).map((item) => `Observação: ${item}`));
  }

  return lines;
}

export async function validateImobIdentityAttachmentAgainstCase(params: {
  docs: UploadedDocumentLike[];
  caseItem: ImobCaseLike;
}): Promise<ImobAttachmentValidationExecution> {
  const owner = params.caseItem.owner;
  const { document, photo } = classifyUploads(params.docs);

  if (!owner) {
    return {
      contract: IMOB_IDENTITY_ATTACHMENT_VALIDATION_CONTRACT,
      handled: false,
      resolved: false,
      document,
      photo,
      extracted: {
        name: null,
        cpf: null,
        rg: null,
        legible: false,
        notes: ["Caso sem proprietário associado para validação."],
        source: "unsupported",
      },
      fields: [],
      summary: "Ainda preciso do proprietário correto para validar o documento automaticamente.",
      nextStep: "Abra o caso do proprietário correto e tente anexar novamente.",
      card: {
        title: "Validação documental",
        lines: ["Caso sem proprietário associado para validação."],
      },
      dedupeKey: `crm.owner.identity_validation:${params.caseItem.id}:${document?.id ?? "none"}`,
      eventType: "case.identity_document_review_needed",
      eventSummary: "Validação documental não executada por falta de proprietário associado.",
    };
  }

  const extracted = await extractDocumentIdentity(document);
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
  const documentField = ownerCpf ? cpfField : ownerRg ? rgField : cpfField.status === "confere" ? cpfField : rgField;
  const resolved = nameField.status === "confere" && documentField.status === "confere";

  const summary = resolved
    ? `Documento do proprietário ${owner.name} validado com os dados do caso.`
    : extracted.legible
      ? `Revise o documento anexado de ${owner.name}. Encontrei divergências ou falta de base cadastral para validação automática.`
      : `Não consegui validar automaticamente o documento anexado de ${owner.name}.`;
  const nextStep = resolved
    ? "Seguir com o cadastro do proprietário e a próxima etapa operacional."
    : extracted.legible
      ? "Revise nome, CPF/RG do caso e solicite novo documento ou ajuste cadastral se necessário."
      : "Solicite uma imagem mais legível do documento ou envie um arquivo suportado para validação automática.";

  return {
    contract: IMOB_IDENTITY_ATTACHMENT_VALIDATION_CONTRACT,
    handled: true,
    resolved,
    document,
    photo,
    extracted,
    fields,
    summary,
    nextStep,
    card: {
      title: resolved ? "Validação documental concluída" : "Validação documental pendente",
      lines: buildCardLines(fields, photo, extracted),
    },
    dedupeKey: `crm.owner.identity_validation:${owner.id}:${document?.id ?? "none"}`,
    eventType: resolved ? "case.identity_document_validated" : "case.identity_document_review_needed",
    eventSummary: resolved
      ? `Documento do proprietário ${owner.name} validado contra os dados do caso.`
      : `Documento do proprietário ${owner.name} precisa de revisão documental.`,
  };
}
