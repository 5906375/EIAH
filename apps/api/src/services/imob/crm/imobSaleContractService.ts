import type { PrismaClient } from "@repo/db";
import { recordImobCrmAuditEvent } from "./imobCrmAudit";
import { ImobCrmMutationService } from "./imobCrmMutationService";
import { isValidCpf } from "./imobRentalLeaseService";
import { composePropertyAddress } from "./imobRentalContractService";
import { buildSaleContractText, type SaleContractTerms } from "../../contracts/saleContractTemplate";

/**
 * Contrato de compra e venda a partir dos cadastros: o vendedor vem do
 * proprietário do imóvel e o imóvel do cadastro; o comprador e as condições
 * vêm do formulário. O negócio fica registrado como caso `sale.deal` ligado ao
 * imóvel (sem criar lead), com origem por campo. O que estava vazio no
 * cadastro (documento do proprietário, matrícula, preço) volta para ele.
 */

export const SALE_DEAL_FLOW = "sale.deal";
export const SALE_CONTRACT_SOURCE = "imob_sale_contract_form_v1";
const ORIGIN = "informed_by_manager";

type Scope = { tenantId: string; workspaceId: string; userId?: string | null };

export type SaleContractInput = SaleContractTerms & { propertyId: string };

export type SaleContractPrefill = {
  propertyId: string;
  saleCaseId: string | null;
  sellerName: string | null;
  sellerDocument: string | null;
  buyerName: string | null;
  buyerDocument: string | null;
  propertyAddress: string | null;
  registryNumber: string | null;
  priceCents: number | null;
  downPaymentCents: number | null;
  paymentMethod: string | null;
  balanceTerms: string | null;
  deedDeadlineDays: number | null;
  possession: string | null;
  commissionPercent: number | null;
  forumCity: string | null;
  gaps: string[];
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function informedValue<T>(value: unknown): T | null {
  const field = asObject(value);
  return field.value === undefined || field.value === null || field.value === "" ? null : (field.value as T);
}

const informed = <V>(value: V | null | undefined) => {
  const normalized = value === undefined || value === "" ? null : value;
  return { value: normalized, origin: normalized === null ? "unknown" : ORIGIN };
};

export class ImobSaleContractService {
  constructor(private readonly prisma: PrismaClient) {}

  private async load(scope: Scope, propertyId: string) {
    const property = await this.prisma.imobProperty.findFirst({
      where: { id: propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      select: { id: true, ownerId: true, address: true, neighborhood: true, city: true, askingPriceCents: true, metadata: true },
    });
    if (!property) return null;
    const owner = property.ownerId
      ? await this.prisma.imobOwner.findFirst({
          where: { id: property.ownerId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
          select: { id: true, name: true, document: true },
        })
      : null;
    const saleCase = await this.prisma.imobCase.findFirst({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, propertyId, flow: SALE_DEAL_FLOW, status: "active" },
      select: { id: true, metadata: true },
    });
    return { property, owner, saleCase };
  }

  async prefill(scope: Scope, propertyId: string): Promise<{ status: "ok"; data: SaleContractPrefill } | { status: "property_not_found" }> {
    const loaded = await this.load(scope, propertyId);
    if (!loaded) return { status: "property_not_found" };
    const { property, owner, saleCase } = loaded;
    const meta = asObject(saleCase?.metadata);
    const buyer = asObject(meta.buyerParty);
    const terms = asObject(meta.terms);
    const propertyMeta = asObject(property.metadata);
    const gaps: string[] = [];
    if (!owner) gaps.push("Imóvel sem proprietário ligado: cadastre o proprietário e ligue-o em Imóveis → Editar imóvel.");
    return {
      status: "ok",
      data: {
        propertyId: property.id,
        saleCaseId: saleCase?.id ?? null,
        sellerName: owner?.name ?? null,
        sellerDocument: owner?.document ?? null,
        buyerName: informedValue<string>(buyer.name),
        buyerDocument: informedValue<string>(buyer.document),
        propertyAddress: composePropertyAddress(property),
        registryNumber: (typeof propertyMeta.registryNumber === "string" && propertyMeta.registryNumber) || null,
        priceCents: informedValue<number>(terms.priceCents) ?? property.askingPriceCents ?? null,
        downPaymentCents: informedValue<number>(terms.downPaymentCents),
        paymentMethod: informedValue<string>(terms.paymentMethod),
        balanceTerms: informedValue<string>(terms.balanceTerms),
        deedDeadlineDays: informedValue<number>(terms.deedDeadlineDays),
        possession: informedValue<string>(terms.possession),
        commissionPercent: informedValue<number>(terms.commissionPercent),
        forumCity: property.city ?? null,
        gaps,
      },
    };
  }

  async generate(scope: Scope, input: SaleContractInput) {
    const sellerDigits = input.sellerDocument.replace(/\D/g, "");
    const buyerDigits = input.buyerDocument.replace(/\D/g, "");
    if (sellerDigits.length === 11 && !isValidCpf(sellerDigits)) return { status: "invalid_seller_document" as const };
    if (buyerDigits.length === 11 && !isValidCpf(buyerDigits)) return { status: "invalid_buyer_document" as const };
    if (input.downPaymentCents && input.downPaymentCents > input.priceCents) return { status: "down_payment_above_price" as const };

    const loaded = await this.load(scope, input.propertyId);
    if (!loaded) return { status: "property_not_found" as const };
    const { property, owner, saleCase } = loaded;

    const { text } = buildSaleContractText({ ...input, sellerDocument: sellerDigits, buyerDocument: buyerDigits });

    const metadata = {
      importSource: SALE_CONTRACT_SOURCE,
      buyerParty: { name: informed(input.buyerName), document: informed(buyerDigits) },
      terms: {
        priceCents: informed(input.priceCents),
        downPaymentCents: informed(input.downPaymentCents ?? null),
        paymentMethod: informed(input.paymentMethod),
        balanceTerms: informed(input.balanceTerms ?? null),
        deedDeadlineDays: informed(input.deedDeadlineDays),
        possession: informed(input.possession),
        commissionPercent: informed(input.commissionPercent ?? null),
      },
      lastDraftAt: new Date().toISOString(),
    };

    let caseId: string;
    if (saleCase) {
      await this.prisma.imobCase.update({
        where: { id: saleCase.id },
        data: { metadata: { ...asObject(saleCase.metadata), ...metadata } as any },
      });
      await this.prisma.imobCaseEvent.create({
        data: {
          imobCase: { connect: { id: saleCase.id } },
          tenant: { connect: { id: scope.tenantId } },
          workspace: { connect: { id: scope.workspaceId } },
          type: "sale.deal.contract_draft_generated",
          actorType: "user",
          actorRef: scope.userId ?? null,
          summary: "Minuta de compra e venda atualizada a partir dos cadastros",
          evidenceRef: null,
          payload: { source: SALE_CONTRACT_SOURCE },
        },
      });
      caseId = saleCase.id;
    } else {
      const created = await new ImobCrmMutationService(this.prisma).createCase(scope, {
        flow: SALE_DEAL_FLOW,
        stage: "active",
        status: "active",
        ownerId: property.ownerId ?? null,
        propertyId: property.id,
        externalDealId: `sale:${property.id}`,
        pendingItems: [],
        metadata,
        initialEvent: {
          type: "sale.deal.contract_draft_generated",
          actorType: "user",
          actorRef: scope.userId ?? null,
          summary: "Negócio de venda registrado e minuta gerada a partir dos cadastros",
          evidenceRef: `sale:${property.id}`,
          payload: { source: SALE_CONTRACT_SOURCE, propertyId: property.id },
        },
      } as any);
      if (created.status !== "created") return { status: "case_not_created" as const };
      caseId = created.data.id;
    }

    // Devolve ao cadastro o que estava vazio (nunca sobrescreve).
    const writtenBack: string[] = [];
    if (owner && !owner.document) {
      await this.prisma.imobOwner.update({ where: { id: owner.id }, data: { document: sellerDigits } });
      writtenBack.push("CPF/CNPJ do proprietário");
      await recordImobCrmAuditEvent({
        prisma: this.prisma,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        userId: scope.userId ?? null,
        subjectType: "owner",
        subjectId: owner.id,
        action: "updated",
        summary: "Documento do proprietário informado no contrato de venda",
        metadata: { change: "document_from_contract", source: SALE_CONTRACT_SOURCE },
      });
    }
    const propertyMeta = asObject(property.metadata);
    const propertyUpdate: Record<string, unknown> = {};
    if (input.registryNumber?.trim() && !propertyMeta.registryNumber) {
      propertyUpdate.metadata = { ...propertyMeta, registryNumber: input.registryNumber.trim() };
      writtenBack.push("matrícula do imóvel");
    }
    if (!property.askingPriceCents) {
      propertyUpdate.askingPriceCents = input.priceCents;
      writtenBack.push("preço de venda do imóvel");
    }
    if (Object.keys(propertyUpdate).length > 0) {
      await this.prisma.imobProperty.update({ where: { id: property.id }, data: propertyUpdate as any });
    }

    return {
      status: "generated" as const,
      data: {
        saleCaseId: caseId,
        propertyId: property.id,
        contractText: text,
        writtenBack,
        fileName: `minuta-compra-venda-${(property.address ?? "imovel").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40) || "imovel"}.pdf`,
      },
    };
  }
}
