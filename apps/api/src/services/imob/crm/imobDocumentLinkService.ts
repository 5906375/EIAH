import type { PrismaClient } from "@repo/db";
import { recordImobCrmAuditEvent } from "./imobCrmAudit";
import { RENTAL_LEASE_FLOW } from "./imobRentalLeaseService";

/**
 * "Anexar documento" nos menus do chat IMOB.
 *
 * Vincula arquivos já enviados por `POST /uploads` (agentSlug "imob") a um
 * proprietário, a um imóvel ou à locação ativa de um imóvel. O vínculo fica em
 * `metadata.documents` do registro (só referência: id, categoria, nome, tipo,
 * tamanho, data e quem vinculou) — o arquivo continua no storage de uploads.
 * Não há leitura do conteúdo nem extração de dados (OCR/validação de
 * identidade seguem no fluxo `/attachments/resolve`).
 *
 * Na locação, "Contrato assinado" baixa a pendência `vincular_contrato_pdf`.
 */

export const DOCUMENT_LINK_SOURCE = "imob_chat_document_link_v1";
export const CONTRACT_PENDING_ITEM = "vincular_contrato_pdf";
const MAX_DOCUMENTS_PER_SUBJECT = 50;

export const DOCUMENT_CATEGORIES = {
  owner: ["documento_identidade", "comprovante_endereco", "procuracao", "contrato_social", "outro"],
  property: ["matricula", "iptu", "escritura", "planta", "habite_se", "fotos", "outro"],
  rental: ["contrato_assinado", "minuta_contrato", "aditivo", "vistoria", "garantia", "comprovante_pagamento", "outro"],
} as const;

export type DocumentSubjectType = keyof typeof DOCUMENT_CATEGORIES;

type Scope = { tenantId: string; workspaceId: string; userId?: string | null };

export type DocumentLinkInput = {
  subjectType: DocumentSubjectType;
  /** owner → ownerId; property e rental → propertyId (a locação é a ativa do imóvel). */
  subjectId: string;
  category: string;
  documentIds: string[];
  notes?: string | null;
};

export type LinkedDocumentRef = {
  documentId: string;
  category: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  url: string;
  linkedAt: string;
  linkedByUserId: string | null;
  notes: string | null;
  source: string;
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function readLinkedDocuments(metadata: unknown): LinkedDocumentRef[] {
  const raw = asObject(metadata).documents;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is LinkedDocumentRef => Boolean(item) && typeof (item as LinkedDocumentRef).documentId === "string");
}

export function isAllowedDocumentCategory(subjectType: DocumentSubjectType, category: string) {
  return (DOCUMENT_CATEGORIES[subjectType] as readonly string[]).includes(category);
}

/** Acrescenta referências sem duplicar o mesmo arquivo. */
export function mergeLinkedDocuments(existing: LinkedDocumentRef[], incoming: LinkedDocumentRef[]) {
  const known = new Set(existing.map((item) => item.documentId));
  const added = incoming.filter((item) => !known.has(item.documentId));
  return { documents: [...existing, ...added], added };
}

export class ImobDocumentLinkService {
  constructor(private readonly prisma: PrismaClient) {}

  async link(scope: Scope, input: DocumentLinkInput) {
    if (!isAllowedDocumentCategory(input.subjectType, input.category)) {
      return { status: "invalid_category" as const };
    }

    const uniqueIds = [...new Set(input.documentIds)];
    const uploads = await this.prisma.uploadedDocument.findMany({
      where: {
        id: { in: uniqueIds },
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        agentSlug: "imob",
      },
    });
    if (uploads.length !== uniqueIds.length) return { status: "upload_not_found" as const };

    const linkedAt = new Date().toISOString();
    const incoming: LinkedDocumentRef[] = uploads.map((upload) => ({
      documentId: upload.id,
      category: input.category,
      fileName: upload.fileName,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      url: upload.url,
      linkedAt,
      linkedByUserId: scope.userId ?? null,
      notes: input.notes ?? null,
      source: DOCUMENT_LINK_SOURCE,
    }));

    if (input.subjectType === "owner") return this.linkToOwner(scope, input.subjectId, incoming);
    if (input.subjectType === "property") return this.linkToProperty(scope, input.subjectId, incoming);
    return this.linkToRental(scope, input.subjectId, input.category, incoming);
  }

  private async linkToOwner(scope: Scope, ownerId: string, incoming: LinkedDocumentRef[]) {
    const owner = await this.prisma.imobOwner.findFirst({
      where: { id: ownerId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      select: { id: true, metadata: true },
    });
    if (!owner) return { status: "subject_not_found" as const };

    const metadata = asObject(owner.metadata);
    const merged = mergeLinkedDocuments(readLinkedDocuments(metadata), incoming);
    if (merged.documents.length > MAX_DOCUMENTS_PER_SUBJECT) return { status: "too_many_documents" as const };

    await this.prisma.imobOwner.update({
      where: { id: owner.id },
      data: { metadata: { ...metadata, documents: merged.documents } as any },
    });
    await this.audit(scope, "owner", owner.id, merged.added);
    return { status: "linked" as const, data: { subjectType: "owner" as const, subjectId: owner.id, added: merged.added, total: merged.documents.length } };
  }

  private async linkToProperty(scope: Scope, propertyId: string, incoming: LinkedDocumentRef[]) {
    const property = await this.prisma.imobProperty.findFirst({
      where: { id: propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      select: { id: true, metadata: true },
    });
    if (!property) return { status: "subject_not_found" as const };

    const metadata = asObject(property.metadata);
    const merged = mergeLinkedDocuments(readLinkedDocuments(metadata), incoming);
    if (merged.documents.length > MAX_DOCUMENTS_PER_SUBJECT) return { status: "too_many_documents" as const };

    await this.prisma.imobProperty.update({
      where: { id: property.id },
      data: { metadata: { ...metadata, documents: merged.documents } as any },
    });
    await this.audit(scope, "property", property.id, merged.added);
    return { status: "linked" as const, data: { subjectType: "property" as const, subjectId: property.id, added: merged.added, total: merged.documents.length } };
  }

  private async linkToRental(scope: Scope, propertyId: string, category: string, incoming: LinkedDocumentRef[]) {
    const lease = await this.prisma.imobCase.findFirst({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        propertyId,
        flow: RENTAL_LEASE_FLOW,
        status: "active",
      },
      select: { id: true, metadata: true, pendingItems: true },
    });
    if (!lease) return { status: "subject_not_found" as const };

    const metadata = asObject(lease.metadata);
    const merged = mergeLinkedDocuments(readLinkedDocuments(metadata), incoming);
    if (merged.documents.length > MAX_DOCUMENTS_PER_SUBJECT) return { status: "too_many_documents" as const };

    const pendingItems = Array.isArray(lease.pendingItems)
      ? (lease.pendingItems as unknown[]).filter((item): item is string => typeof item === "string")
      : [];
    const contractLinked = category === "contrato_assinado" && merged.added.length > 0;
    const nextPendingItems = contractLinked ? pendingItems.filter((item) => item !== CONTRACT_PENDING_ITEM) : pendingItems;

    await this.prisma.$transaction(async (tx) => {
      await tx.imobCase.update({
        where: { id: lease.id },
        data: {
          metadata: {
            ...metadata,
            documents: merged.documents,
            ...(contractLinked ? { hasLinkedDocument: true } : {}),
          } as any,
          pendingItems: nextPendingItems,
        },
      });
      if (merged.added.length > 0) {
        await tx.imobCaseEvent.create({
          data: {
            imobCase: { connect: { id: lease.id } },
            tenant: { connect: { id: scope.tenantId } },
            workspace: { connect: { id: scope.workspaceId } },
            type: "rental.lease.document_linked",
            actorType: "user",
            actorRef: scope.userId ?? null,
            summary: contractLinked ? "Contrato assinado anexado à locação" : "Documento anexado à locação",
            evidenceRef: merged.added[0]?.documentId ?? null,
            payload: {
              source: DOCUMENT_LINK_SOURCE,
              category,
              documentIds: merged.added.map((item) => item.documentId),
            },
          },
        });
      }
    });

    return {
      status: "linked" as const,
      data: {
        subjectType: "rental" as const,
        subjectId: lease.id,
        added: merged.added,
        total: merged.documents.length,
        pendingItems: nextPendingItems,
        contractPendingCleared: contractLinked && pendingItems.includes(CONTRACT_PENDING_ITEM),
      },
    };
  }

  private async audit(scope: Scope, subjectType: "owner" | "property", subjectId: string, added: LinkedDocumentRef[]) {
    if (added.length === 0) return;
    // Só as referências novas: o registro completo (com CPF/telefone) não entra neste evento.
    await recordImobCrmAuditEvent({
      prisma: this.prisma,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId ?? null,
      subjectType,
      subjectId,
      action: "updated",
      summary: `${added.length} documento(s) anexado(s)`,
      metadata: {
        change: "documents_linked",
        source: DOCUMENT_LINK_SOURCE,
        documents: added.map((item) => ({ documentId: item.documentId, category: item.category })),
      },
    });
  }
}
