import { createHash } from "node:crypto";
import { ORACULO_UPLOAD_AGENT, oraculoEvidenceV1Schema, type OraculoEvidenceV1, type OraculoEvidenceLinkV1, type OraculoEvidenceCheckV1, type OraculoPreparationScope } from "@eiah/contracts";
import type { PrismaClient } from "@repo/db";
import { findDocumentById } from "../../uploads";
import { assertSafeStorageKey, loadStoredObject } from "../../storage";

export class PreparationEvidenceError extends Error {
  constructor(readonly status: 400 | 404 | 409, readonly subreason: string) { super(subreason); }
}
const digest = (buffer: Buffer) => createHash("sha256").update(buffer).digest("hex");
function validStorageScope(storageKey: string, scope: OraculoPreparationScope) {
  try { return assertSafeStorageKey(storageKey).startsWith(`${scope.tenantId}/${scope.workspaceId}/`); }
  catch { return false; }
}
export async function createPreparationEvidence(db: PrismaClient, scope: OraculoPreparationScope, actorRef: string, input: OraculoEvidenceLinkV1): Promise<OraculoEvidenceV1> {
  const document = await findDocumentById({ prisma: db, ...scope, id: input.documentId });
  if (!document || document.agentSlug !== ORACULO_UPLOAD_AGENT) throw new PreparationEvidenceError(404, "document_not_found");
  if (!validStorageScope(document.storageKey, scope)) throw new PreparationEvidenceError(409, "storage_scope_mismatch");
  const buffer = await loadStoredObject(document.storageKey);
  if (!buffer) throw new PreparationEvidenceError(409, "file_unavailable");
  if (buffer.length !== document.sizeBytes) throw new PreparationEvidenceError(409, "size_mismatch");
  return oraculoEvidenceV1Schema.parse({
    documentId: document.id, kind: input.kind, sourceDescription: input.sourceDescription,
    ...(input.documentDate ? { documentDate: input.documentDate } : {}),
    fileName: document.fileName, mimeType: document.mimeType, sizeBytes: buffer.length,
    sha256: digest(buffer), uploadedAt: document.createdAt.toISOString(), linkedAt: new Date().toISOString(), linkedBy: actorRef,
    reviewStatus: "unreviewed",
  });
}
export async function inspectPreparationEvidence(db: PrismaClient, scope: OraculoPreparationScope, evidence: OraculoEvidenceV1): Promise<{ check: OraculoEvidenceCheckV1; buffer: Buffer | null }> {
  const result = (integrity: OraculoEvidenceCheckV1["integrity"], buffer: Buffer | null = null) => ({ check: { evidence, integrity }, buffer });
  const document = await findDocumentById({ prisma: db, ...scope, id: evidence.documentId });
  if (!document || document.agentSlug !== ORACULO_UPLOAD_AGENT) return result("document_not_found");
  if (!validStorageScope(document.storageKey, scope) || document.fileName !== evidence.fileName || document.mimeType !== evidence.mimeType
    || document.sizeBytes !== evidence.sizeBytes || document.createdAt.toISOString() !== evidence.uploadedAt) return result("integrity_mismatch");
  const buffer = await loadStoredObject(document.storageKey);
  if (!buffer) return result("file_unavailable");
  if (buffer.length !== evidence.sizeBytes || digest(buffer) !== evidence.sha256) return result("integrity_mismatch");
  return result("available", buffer);
}
