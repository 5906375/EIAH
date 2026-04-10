import {
  ImobOperationalConsultContext,
  ImobOperationalResolverParams,
  PropertySummary,
  ResolverHelpers,
} from "./imobCrmOperationalResolverShared";

export async function findPropertyForPropertyActions(
  params: ImobOperationalResolverParams,
  helpers: ResolverHelpers,
  context: ImobOperationalConsultContext,
): Promise<PropertySummary | null> {
  if (context.propertyCrudId) {
    return params.prisma.imobProperty.findFirst({
      where: { id: context.propertyCrudId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
    });
  }
  if (params.caseId) {
    const scopedCase = await params.prisma.imobCase.findFirst({
      where: { id: params.caseId, tenantId: params.tenantId, workspaceId: params.workspaceId },
      select: { propertyId: true },
    });
    if (scopedCase?.propertyId) {
      const property = await params.prisma.imobProperty.findFirst({
        where: { id: scopedCase.propertyId, tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
        include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
      });
      if (property) return property;
    }
  }
  const propertyRef = helpers.extractPropertyRefFromMessage(params.message);
  const address = helpers.extractAddressFromMessage(params.message);
  if (propertyRef) {
    const recentProperties = await params.prisma.imobProperty.findMany({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" } },
      orderBy: { updatedAt: "desc" },
      take: 200,
      include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
    });
    const property = recentProperties.find((item) => {
      const metadata = helpers.asObject(item.metadata);
      const externalRef = helpers.asString(metadata?.externalPropertyRef);
      return item.id === propertyRef || externalRef === propertyRef;
    });
    if (property) return property;
  }
  if (address) {
    return params.prisma.imobProperty.findFirst({
      where: { tenantId: params.tenantId, workspaceId: params.workspaceId, status: { not: "archived" }, address: { contains: address } },
      orderBy: { updatedAt: "desc" },
      include: { owner: { select: { id: true, name: true } }, _count: { select: { cases: true } } },
    });
  }
  return null;
}
