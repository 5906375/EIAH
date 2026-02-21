import { getPrismaForTenant } from "@repo/db";
import type { PrismaClient } from "@repo/db/client";

function resolveClient(tenantId: string, workspaceId: string, client?: PrismaClient) {
  return client ?? (getPrismaForTenant(tenantId, workspaceId) as PrismaClient);
}

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
  prisma?: PrismaClient;
  tenantId: string;
  workspaceId: string;
  agentSlug: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  url?: string;
}) {
  const client = resolveClient(data.tenantId, data.workspaceId, data.prisma);
  const record = await client.uploadedDocument.create({
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

export async function findDocumentById(params: {
  prisma?: PrismaClient;
  id: string;
  tenantId: string;
  workspaceId: string;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  return client.uploadedDocument.findFirst({
    where: { id: params.id, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
}

export async function updateDocumentUrl(params: {
  prisma?: PrismaClient;
  id: string;
  tenantId: string;
  workspaceId: string;
  url: string;
}) {
  const client = resolveClient(params.tenantId, params.workspaceId, params.prisma);
  const doc = await findDocumentById({ ...params, prisma: client });
  if (!doc) return null;

  return client.uploadedDocument.update({
    where: { id: doc.id },
    data: { url: params.url },
  });
}
