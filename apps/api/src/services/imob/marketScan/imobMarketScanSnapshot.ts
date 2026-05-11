import type { ImobMarketScanContext, ImobMarketScanResultSnapshot, ImobOperationalState } from "../imobConversationContract";

const MARKET_SCAN_SNAPSHOT_EVENT_TYPE = "market_scan.snapshot";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSnapshot(payload: unknown): ImobMarketScanResultSnapshot | null {
  const obj = asObject(payload);
  if (!obj) return null;
  const scanId = asString(obj.scanId);
  const providerId = asString(obj.providerId);
  const sourceStatus = asString(obj.sourceStatus);
  const generatedAt = asString(obj.generatedAt);
  const totalItems = typeof obj.totalItems === "number" && Number.isFinite(obj.totalItems) ? obj.totalItems : 0;
  const readOnly = obj.readOnly === true;
  const groups = Array.isArray(obj.groups) ? obj.groups : [];

  if (!scanId || !providerId || !generatedAt || !readOnly) return null;
  if (sourceStatus !== "completed" && sourceStatus !== "empty" && sourceStatus !== "unavailable") return null;

  return {
    scanId,
    providerId,
    sourceStatus,
    totalItems,
    readOnly: true,
    generatedAt,
    groups: groups
      .map((group) => {
        const groupObj = asObject(group);
        if (!groupObj) return null;
        const items = Array.isArray(groupObj.items) ? groupObj.items : [];
        return {
          city: asString(groupObj.city) ?? "sem-cidade",
          goal: asString(groupObj.goal) ?? "sem-finalidade",
          propertyType: asString(groupObj.propertyType) as any,
          bedrooms: asNullableNumber(groupObj.bedrooms),
          items: items
            .map((item) => {
              const itemObj = asObject(item);
              if (!itemObj) return null;
              const sourceId = asString(itemObj.sourceId);
              const source = asString(itemObj.source);
              const itemProviderId = asString(itemObj.providerId);
              const retrievedAt = asString(itemObj.retrievedAt);
              const city = asString(itemObj.city);
              const goal = asString(itemObj.goal);
              if (!sourceId || !source || !itemProviderId || !retrievedAt || !city || !goal) return null;
              return {
                source,
                sourceId,
                providerId: itemProviderId,
                retrievedAt,
                city,
                uf: asString(itemObj.uf),
                goal,
                propertyType: asString(itemObj.propertyType) as any,
                bedrooms: asNullableNumber(itemObj.bedrooms),
                price: asNullableNumber(itemObj.price),
                currency: asString(itemObj.currency) as "BRL" | null,
                neighborhood: asString(itemObj.neighborhood),
                address: asString(itemObj.address),
                title: asString(itemObj.title),
                url: asString(itemObj.url),
              };
            })
            .filter(Boolean),
        };
      })
      .filter(Boolean) as ImobMarketScanResultSnapshot["groups"],
  };
}

export function attachMarketScanSnapshotToOperationalState(
  operational: ImobOperationalState | null | undefined,
  snapshot: ImobMarketScanResultSnapshot | null | undefined,
): ImobOperationalState | null | undefined {
  if (!operational || operational.flow !== "property.market_scan" || !snapshot) return operational;
  return {
    ...operational,
    marketScanSnapshot: snapshot,
  };
}

export async function persistImobMarketScanSnapshot(params: {
  prisma: {
    imobCaseEvent?: {
      create(args: {
        data: {
          imobCase: { connect: { id: string } };
          tenant: { connect: { id: string } };
          workspace: { connect: { id: string } };
          type: string;
          actorType: string;
          actorRef: string | null;
          summary: string;
          evidenceRef: string | null;
          payload: Record<string, unknown>;
        };
      }): Promise<unknown>;
    };
  };
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
  marketScanContext: ImobMarketScanContext;
  snapshot: ImobMarketScanResultSnapshot;
}) {
  if (!params.caseId || !params.prisma.imobCaseEvent?.create) return false;
  await params.prisma.imobCaseEvent.create({
    data: {
      imobCase: { connect: { id: params.caseId } },
      tenant: { connect: { id: params.tenantId } },
      workspace: { connect: { id: params.workspaceId } },
      type: MARKET_SCAN_SNAPSHOT_EVENT_TYPE,
      actorType: "system",
      actorRef: "IMOB",
      summary: `Market scan snapshot ${params.snapshot.sourceStatus}`,
      evidenceRef: params.snapshot.scanId,
      payload: {
        scanId: params.snapshot.scanId,
        providerId: params.snapshot.providerId,
        sourceStatus: params.snapshot.sourceStatus,
        totalItems: params.snapshot.totalItems,
        groups: params.snapshot.groups,
        readOnly: true,
        generatedAt: params.snapshot.generatedAt,
        context: {
          cities: params.marketScanContext.cities,
          cityCandidates: params.marketScanContext.cityCandidates,
          uf: params.marketScanContext.uf,
          goals: params.marketScanContext.goals,
          goalCandidates: params.marketScanContext.goalCandidates,
          propertyTypes: params.marketScanContext.propertyTypes,
          bedrooms: params.marketScanContext.bedrooms,
          priceRange: params.marketScanContext.priceRange,
          limitPerGroup: params.marketScanContext.limitPerGroup,
        },
      },
    },
  });
  return true;
}

export async function loadLatestImobMarketScanSnapshot(params: {
  prisma: {
    imobCaseEvent?: {
      findFirst(args: {
        where: {
          caseId: string;
          tenantId: string;
          workspaceId: string;
          type: string;
        };
        orderBy: { createdAt: "desc" };
        select: { payload: true };
      }): Promise<{ payload: unknown } | null>;
    };
  };
  tenantId: string;
  workspaceId: string;
  caseId?: string | null;
}) {
  if (!params.caseId || !params.prisma.imobCaseEvent?.findFirst) return null;
  const event = await params.prisma.imobCaseEvent.findFirst({
    where: {
      caseId: params.caseId,
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      type: MARKET_SCAN_SNAPSHOT_EVENT_TYPE,
    },
    orderBy: { createdAt: "desc" },
    select: { payload: true },
  });
  return normalizeSnapshot(event?.payload ?? null);
}

export { MARKET_SCAN_SNAPSHOT_EVENT_TYPE };
