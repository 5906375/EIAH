import type { J360LegalReport, RecipeOrchestration } from "@eiah/core";
import { buildJ360LegalReport } from "../services/runAtivoUniversalAgent/interpreters/j360LegalInterpreter";
import { loadStoredObject } from "../services/storage";
import { extractPdfDocumentEvidenceFromBuffer, type ExtractedPdfDocument } from "../services/documents/pdfTextExtractor";

type BuildJ360StructuredOutputParams = {
  agentId: string;
  metadata: Record<string, unknown>;
  outputText: string | null | undefined;
  outputs?: Array<{ stepId: string; data: unknown }> | null;
  recipeOrchestration?: RecipeOrchestration | null;
  documentEvidence?: ExtractedPdfDocument | null;
};

type CollectJ360DocumentEvidenceParams = {
  metadata: Record<string, unknown>;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectDocumentCandidates(metadata: Record<string, unknown>) {
  // `name` não é consumido por collectJ360DocumentEvidence (só id/mimeType são usados
  // para resolver o documento real via banco) — mantido apenas como metadado descritivo,
  // por isso nunca deve fabricar um nome de documento inexistente.
  const fromEntry = (item: unknown) => {
    if (!isPlainObject(item)) return null;
    const id = typeof item.id === "string" ? item.id : null;
    const name = typeof item.name === "string" ? item.name : null;
    const mimeType = typeof item.mimeType === "string" ? item.mimeType : null;
    return id ? { id, name, mimeType } : null;
  };

  const documents = Array.isArray(metadata.documents) ? metadata.documents.map(fromEntry).filter(Boolean) : [];
  const form = isPlainObject(metadata.form) ? metadata.form : null;
  const supportingDocs = Array.isArray(form?.supportingDocs) ? form.supportingDocs.map(fromEntry).filter(Boolean) : [];
  const seen = new Set<string>();
  return [...documents, ...supportingDocs].filter((item): item is { id: string; name: string | null; mimeType: string | null } => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function resolvePrimaryJ360Output(
  outputs: Array<{ stepId: string; data: unknown }> | null | undefined,
  fallbackText: string | null | undefined
) {
  const candidate = outputs
    ?.slice()
    .reverse()
    .find((entry) => entry && entry.data != null);
  return {
    rawOutput: candidate?.data ?? fallbackText ?? null,
    outputText:
      typeof candidate?.data === "string"
        ? candidate.data
        : typeof fallbackText === "string"
        ? fallbackText
        : null,
  };
}

export function buildJ360StructuredOutput(
  params: BuildJ360StructuredOutputParams
): J360LegalReport | null {
  const normalizedAgent = params.agentId.trim().toLowerCase();
  if (normalizedAgent !== "j_360" && normalizedAgent !== "j360") {
    return null;
  }
  const source = resolvePrimaryJ360Output(params.outputs ?? null, params.outputText);
  if (source.rawOutput == null && !source.outputText?.trim()) return null;

  return buildJ360LegalReport({
    outputText: source.outputText,
    rawOutput: source.rawOutput,
    metadata: params.metadata,
    recipeOrchestration: params.recipeOrchestration ?? null,
    documentEvidence: params.documentEvidence ?? null,
  });
}

export async function collectJ360DocumentEvidence(
  params: CollectJ360DocumentEvidenceParams
): Promise<ExtractedPdfDocument | null> {
  const { prismaGlobal } = await import("@repo/db");
  const candidates = collectDocumentCandidates(params.metadata);
  const tenantId = typeof params.metadata.tenantId === "string" ? params.metadata.tenantId : null;
  const workspaceId = typeof params.metadata.workspaceId === "string" ? params.metadata.workspaceId : null;
  for (const candidate of candidates) {
    if (candidate.mimeType && candidate.mimeType !== "application/pdf") continue;
    const record = await prismaGlobal.uploadedDocument.findFirst({
      where: {
        id: candidate.id,
        ...(tenantId ? { tenantId } : {}),
        ...(workspaceId ? { workspaceId } : {}),
      },
      select: {
        storageKey: true,
        fileName: true,
        mimeType: true,
      },
    });
    if (!record || record.mimeType !== "application/pdf") continue;
    const buffer = await loadStoredObject(record.storageKey);
    if (!buffer) continue;
    try {
      return extractPdfDocumentEvidenceFromBuffer(buffer, record.fileName);
    } catch {
      continue;
    }
  }
  return null;
}
