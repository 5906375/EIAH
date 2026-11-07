import type { PrismaClient } from "@repo/db";
import { ImobCrmMutationService } from "./imobCrmMutationService";
import { SALE_DEAL_FLOW } from "./imobSaleContractService";

/**
 * Negócios do ativo (venda e permuta) sobre `ImobCase`, sem entidade nova.
 *
 * - Venda reutiliza `sale.deal` (o mesmo caso que o contrato de venda consulta:
 *   `terms.priceCents` e `buyerParty` seguem o formato do serviço de venda).
 * - Permuta usa `exchange.deal` (não existia flow genérico adequado): operação
 *   própria, com bem oferecido, bem recebido, valores atribuídos e torna.
 * - Estados mínimos: `em_andamento` (caso ativo) e `concluida` (caso encerrado).
 * - Eventos em `ImobCaseEvent` e audit do `createCase`; nenhuma timeline nova.
 * Entrada estruturada (formulário); nada é inferido, vazio fica `null`.
 */

export const EXCHANGE_DEAL_FLOW = "exchange.deal";
export const ASSET_DEAL_SOURCE = "imob_asset_deal_form_v1";
export const ASSET_DEAL_COMPLETED_STATUS = "closed";
export const ASSET_DEAL_COMPLETED_STAGE = "completed";
const ORIGIN = "informed_by_manager";
/** Limite técnico da coluna `ImobProperty.askingPriceCents` (Postgres INT4) — não é regra comercial. */
export const PROPERTY_ASKING_PRICE_COLUMN_MAX = 2_147_483_647;

type Scope = { tenantId: string; workspaceId: string; userId?: string | null };

export type AssetDealKind = "venda" | "permuta";
export type AssetDealState = "em_andamento" | "concluida";

export type AssetDealInput = {
  propertyId: string;
  kind: AssetDealKind;
  state: AssetDealState;
  /** Venda: valor pretendido. Permuta: valor atribuído ao imóvel oferecido. */
  askingPriceCents?: number | null;
  counterpartyName?: string | null;
  receivedAssetDescription?: string | null;
  receivedValueCents?: number | null;
  tornaCents?: number | null;
  notes?: string | null;
};

const FLOW_BY_KIND: Record<AssetDealKind, string> = { venda: SALE_DEAL_FLOW, permuta: EXCHANGE_DEAL_FLOW };
const DEAL_FLOWS = [SALE_DEAL_FLOW, EXCHANGE_DEAL_FLOW];

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function informed<V>(value: V | null | undefined) {
  const normalized = value === undefined || value === "" ? null : value;
  return { value: normalized, origin: normalized === null ? "unknown" : ORIGIN };
}

function informedValue<T>(value: unknown): T | null {
  const field = asObject(value);
  return field.value === undefined || field.value === null || field.value === "" ? null : (field.value as T);
}

function kindOfFlow(flow: string): AssetDealKind {
  return flow === EXCHANGE_DEAL_FLOW ? "permuta" : "venda";
}

export function buildAssetDealMetadata(input: AssetDealInput, now = new Date()) {
  const base = {
    importSource: ASSET_DEAL_SOURCE,
    kind: input.kind,
    state: input.state,
    notes: input.notes ?? null,
    ...(input.state === "concluida"
      ? { completion: { completedAt: now.toISOString(), registeredAsCompleted: true } }
      : {}),
  };
  if (input.kind === "venda") {
    return {
      ...base,
      // Mesmo formato que o contrato de venda lê (`buyerParty`, `terms.priceCents`).
      buyerParty: { name: informed(input.counterpartyName), document: informed(null) },
      terms: { priceCents: informed(input.askingPriceCents ?? null) },
    };
  }
  return {
    ...base,
    counterpartyParty: { name: informed(input.counterpartyName) },
    exchange: {
      offeredAsset: { propertyId: input.propertyId, valueCents: informed(input.askingPriceCents ?? null) },
      receivedAsset: {
        description: informed(input.receivedAssetDescription),
        valueCents: informed(input.receivedValueCents ?? null),
      },
      tornaCents: informed(input.tornaCents ?? null),
    },
  };
}

export class ImobAssetDealService {
  constructor(private readonly prisma: PrismaClient) {}

  async register(scope: Scope, input: AssetDealInput) {
    const property = await this.prisma.imobProperty.findFirst({
      where: { id: input.propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      select: { id: true, ownerId: true, address: true, propertyType: true, metadata: true, askingPriceCents: true },
    });
    if (!property) return { status: "property_not_found" as const };

    const flow = FLOW_BY_KIND[input.kind];
    const completed = input.state === "concluida";
    if (!completed) {
      const active = await this.prisma.imobCase.findFirst({
        where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, propertyId: property.id, flow, status: "active" },
        select: { id: true },
      });
      if (active) return { status: "deal_already_active" as const, caseId: active.id };
    }

    const prefix = input.kind === "venda" ? "sale" : "exchange";
    const stableKey = completed ? `${prefix}:${property.id}:completed:${new Date().toISOString()}` : `${prefix}:${property.id}`;
    const mutations = new ImobCrmMutationService(this.prisma);
    const created = await mutations.createCase(scope, {
      flow,
      stage: completed ? ASSET_DEAL_COMPLETED_STAGE : "active",
      status: completed ? ASSET_DEAL_COMPLETED_STATUS : "active",
      ownerId: property.ownerId ?? null,
      propertyId: property.id,
      externalDealId: stableKey,
      pendingItems: [],
      metadata: buildAssetDealMetadata(input),
      initialEvent: {
        type: completed ? `${flow}.registered_completed` : `${flow}.registered`,
        actorType: "user",
        actorRef: scope.userId ?? null,
        summary: `${input.kind === "venda" ? "Venda" : "Permuta"} ${completed ? "concluída registrada" : "em andamento registrada"} pelo formulário do chat IMOB`,
        evidenceRef: stableKey,
        payload: { source: ASSET_DEAL_SOURCE, propertyId: property.id, kind: input.kind, state: input.state },
      },
    } as any);
    if (created.status !== "created") return { status: created.status };

    // Venda: o valor pretendido também alimenta o imóvel, se couber na coluna (Int). Sem truncar:
    // acima do limite técnico o valor integral fica só no negócio.
    let propertyProjection: "applied" | "kept_in_deal_only" | "not_applicable" = "not_applicable";
    if (input.kind === "venda" && typeof input.askingPriceCents === "number") {
      if (input.askingPriceCents <= PROPERTY_ASKING_PRICE_COLUMN_MAX) {
        await mutations.updateProperty(scope, property.id, { askingPriceCents: input.askingPriceCents } as any);
        propertyProjection = "applied";
      } else {
        propertyProjection = "kept_in_deal_only";
      }
    }

    const meta = asObject(property.metadata);
    return {
      status: "created" as const,
      data: {
        caseId: created.data.id,
        propertyId: property.id,
        propertyLabel:
          (typeof meta.externalPropertyRef === "string" && meta.externalPropertyRef) || property.address || property.propertyType || property.id,
        kind: input.kind,
        state: input.state,
        askingPriceCents: input.askingPriceCents ?? null,
        propertyProjection,
      },
    };
  }

  async complete(scope: Scope, input: { caseId: string; notes?: string | null }) {
    const found = await this.prisma.imobCase.findFirst({
      where: { id: input.caseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, flow: { in: DEAL_FLOWS } },
      select: { id: true, flow: true, status: true, metadata: true, propertyId: true },
    });
    if (!found) return { status: "deal_not_found" as const };
    if (found.status !== "active") return { status: "deal_not_active" as const };

    const meta = asObject(found.metadata);
    const completion = {
      completedAt: new Date().toISOString(),
      completedByUserId: scope.userId ?? null,
      notes: input.notes?.trim() || null,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.imobCase.update({
        where: { id: found.id },
        data: {
          status: ASSET_DEAL_COMPLETED_STATUS,
          stage: ASSET_DEAL_COMPLETED_STAGE,
          pendingItems: [],
          metadata: { ...meta, state: "concluida", completion } as any,
        },
      });
      await tx.imobCaseEvent.create({
        data: {
          imobCase: { connect: { id: found.id } },
          tenant: { connect: { id: scope.tenantId } },
          workspace: { connect: { id: scope.workspaceId } },
          type: `${found.flow}.completed`,
          actorType: "user",
          actorRef: scope.userId ?? null,
          summary: `${kindOfFlow(found.flow) === "venda" ? "Venda" : "Permuta"} concluída pelo formulário do chat IMOB`,
          evidenceRef: null,
          payload: { source: ASSET_DEAL_SOURCE, kind: kindOfFlow(found.flow) } as any,
        },
      });
    });
    return { status: "completed" as const, data: { caseId: found.id, kind: kindOfFlow(found.flow), propertyId: found.propertyId } };
  }

  async list(scope: Scope, propertyId: string, kind?: AssetDealKind) {
    const property = await this.prisma.imobProperty.findFirst({
      where: { id: propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      select: { id: true },
    });
    if (!property) return { status: "property_not_found" as const };
    const cases = await this.prisma.imobCase.findMany({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        propertyId,
        flow: kind ? FLOW_BY_KIND[kind] : { in: DEAL_FLOWS },
      },
      select: { id: true, flow: true, status: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      status: "ok" as const,
      data: {
        propertyId,
        items: cases.map((item) => {
          const meta = asObject(item.metadata);
          const itemKind = kindOfFlow(item.flow);
          const completion = asObject(meta.completion);
          const exchange = asObject(meta.exchange);
          const offered = asObject(exchange.offeredAsset);
          const received = asObject(exchange.receivedAsset);
          return {
            caseId: item.id,
            kind: itemKind,
            state: item.status === "active" ? ("em_andamento" as const) : ("concluida" as const),
            counterpartyName: informedValue<string>(asObject(itemKind === "venda" ? meta.buyerParty : meta.counterpartyParty).name),
            askingPriceCents:
              itemKind === "venda"
                ? informedValue<number>(asObject(meta.terms).priceCents)
                : informedValue<number>(offered.valueCents),
            receivedAssetDescription: itemKind === "permuta" ? informedValue<string>(received.description) : null,
            receivedValueCents: itemKind === "permuta" ? informedValue<number>(received.valueCents) : null,
            tornaCents: itemKind === "permuta" ? informedValue<number>(exchange.tornaCents) : null,
            completedAt: typeof completion.completedAt === "string" ? completion.completedAt : null,
            registeredAt: item.createdAt.toISOString(),
          };
        }),
      },
    };
  }
}
