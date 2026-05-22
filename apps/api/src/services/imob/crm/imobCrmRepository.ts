import type { PrismaClient } from "@repo/db";

type Scope = {
  tenantId: string;
  workspaceId: string;
};

export class ImobCrmRepository {
  constructor(private readonly prisma: PrismaClient) {}

  listOwners(scope: Scope) {
    return this.prisma.imobOwner.findMany({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  getOwner(scope: Scope, ownerId: string) {
    return this.prisma.imobOwner.findFirst({
      where: { id: ownerId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
    });
  }

  listProperties(scope: Scope) {
    return this.prisma.imobProperty.findMany({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { owner: { select: { id: true, name: true } } },
    });
  }

  getProperty(scope: Scope, propertyId: string) {
    return this.prisma.imobProperty.findFirst({
      where: { id: propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      include: { owner: { select: { id: true, name: true } } },
    });
  }

  listLeads(scope: Scope) {
    return this.prisma.imobLead.findMany({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  getLead(scope: Scope, leadId: string) {
    return this.prisma.imobLead.findFirst({
      where: { id: leadId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
    });
  }

  listCases(scope: Scope, filters: { flow?: string | null; status?: string | null }) {
    return this.prisma.imobCase.findMany({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        ...(filters.flow ? { flow: filters.flow } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: {
        owner: { select: { id: true, name: true } },
        property: { select: { id: true, propertyType: true, city: true, neighborhood: true } },
        lead: { select: { id: true, name: true } },
        _count: { select: { events: true } },
      },
    });
  }

  getCase(scope: Scope, caseId: string) {
    return this.prisma.imobCase.findFirst({
      where: { id: caseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      include: {
        owner: true,
        property: true,
        lead: true,
        events: { orderBy: { createdAt: "desc" }, take: 50 },
      },
    });
  }

  listCaseEvents(scope: Scope, params?: { caseIds?: string[]; type?: string | null; take?: number }) {
    const caseIds = Array.isArray(params?.caseIds) ? params?.caseIds.filter(Boolean) : [];
    return this.prisma.imobCaseEvent.findMany({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        ...(caseIds.length > 0 ? { caseId: { in: caseIds } } : {}),
        ...(params?.type ? { type: params.type } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: typeof params?.take === "number" ? params.take : 500,
    });
  }

  findLeadByStrongIdentifiers(scope: Scope, identifiers: { phone?: string | null; email?: string | null }) {
    const strongConditions: Array<Record<string, string>> = [];
    if (identifiers.phone) strongConditions.push({ phone: identifiers.phone });
    if (identifiers.email) strongConditions.push({ email: identifiers.email });

    if (strongConditions.length === 0) return null;
    return this.prisma.imobLead.findFirst({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, OR: strongConditions },
      orderBy: { updatedAt: "desc" },
    });
  }

  findLeadsByName(scope: Scope, name: string, take = 4) {
    return this.prisma.imobLead.findMany({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, name },
      orderBy: { updatedAt: "desc" },
      take,
    });
  }

  findOwnerByStrongIdentifiers(scope: Scope, identifiers: { document?: string | null; phone?: string | null; email?: string | null }) {
    const strongConditions: Array<Record<string, string>> = [];
    if (identifiers.document) strongConditions.push({ document: identifiers.document });
    if (identifiers.phone) strongConditions.push({ phone: identifiers.phone });
    if (identifiers.email) strongConditions.push({ email: identifiers.email });

    if (strongConditions.length === 0) return null;
    return this.prisma.imobOwner.findFirst({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" }, OR: strongConditions },
      orderBy: { updatedAt: "desc" },
    });
  }

  findOwnersByName(scope: Scope, name: string, take = 4) {
    return this.prisma.imobOwner.findMany({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" }, name },
      orderBy: { updatedAt: "desc" },
      take,
    });
  }

  findPropertyByAddress(scope: Scope, address: string) {
    return this.prisma.imobProperty.findFirst({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" }, address: { equals: address } },
      orderBy: { updatedAt: "desc" },
    });
  }
}
