import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export type UploadedDocumentRecord = {
  id: string;
  tenantId: string;
  workspaceId: string;
  agentSlug: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  url: string;
  createdAt: Date;
};

export async function createUploadedDocument(data: {
  tenantId: string;
  workspaceId: string;
  agentSlug: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  url?: string;
}) {
  const record = await prisma.uploadedDocument.create({
    data: {
      tenantId: data.tenantId,
      workspaceId: data.workspaceId,
      agentSlug: data.agentSlug,
      fileName: data.fileName,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      storageKey: data.storageKey,
      url: data.url ?? "",
    },
  });

  return record;
}

export async function findDocumentById(id: string) {
  return prisma.uploadedDocument.findUnique({ where: { id } });
}

export async function updateDocumentUrl(id: string, url: string) {
  return prisma.uploadedDocument.update({
    where: { id },
    data: { url },
  });
}
