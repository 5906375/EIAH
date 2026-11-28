import type { PrismaClient } from "@repo/db";
import { recordImobCrmAuditEvent } from "./imobCrmAudit";
import { RENTAL_LEASE_FLOW, isValidCpf } from "./imobRentalLeaseService";
import {
  buildRentalContractText,
  monthsBetween,
  type RentalChargePayer,
  type RentalContractTerms,
  type RentalGuaranteeType,
} from "../../contracts/rentalContractTemplate";

/**
 * Contrato de locação a partir dos cadastros: o locador vem do proprietário
 * do imóvel, o imóvel do cadastro de imóvel e o locatário/valores da locação
 * ativa. O usuário só completa o que falta (formulário, nunca texto de chat).
 * O que ele completar e for dado de cadastro volta para o cadastro.
 */

export const RENTAL_CONTRACT_SOURCE = "imob_rental_contract_form_v1";
const ORIGIN = "informed_by_manager";

type Scope = { tenantId: string; workspaceId: string; userId?: string | null };

export type RentalContractPrefill = {
  propertyId: string;
  leaseCaseId: string;
  landlordName: string | null;
  landlordDocument: string | null;
  tenantName: string | null;
  tenantDocument: string | null;
  propertyAddress: string | null;
  purpose: "residencial" | "comercial" | null;
  registryNumber: string | null;
  startDate: string | null;
  durationMonths: number | null;
  rentCents: number | null;
  dueDay: number | null;
  adjustmentIndex: string | null;
  adjustmentMonth: number | null;
  guaranteeType: RentalGuaranteeType | null;
  guaranteeAmountCents: number | null;
  guarantorName: string | null;
  iptu: RentalChargePayer | null;
  condominio: RentalChargePayer | null;
  condominioAmountCents: number | null;
  forumCity: string | null;
  /** Avisos de cadastro (ex.: imóvel sem proprietário ligado). */
  gaps: string[];
};

export type RentalContractInput = Omit<RentalContractTerms, never> & { propertyId: string };

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Valor de um campo com origem ({ value, origin }) gravado pela locação. */
function informedValue<T>(value: unknown): T | null {
  const field = asObject(value);
  return field.value === undefined || field.value === null || field.value === "" ? null : (field.value as T);
}

const COMMERCIAL_TYPES = new Set(["sala_comercial", "sala", "loja", "galpao", "comercial"]);
const RESIDENTIAL_TYPES = new Set(["kitnet", "apartamento", "cobertura", "casa", "studio"]);

export function purposeFromPropertyType(propertyType: string | null | undefined): "residencial" | "comercial" | null {
  const key = (propertyType ?? "").trim().toLowerCase();
  if (COMMERCIAL_TYPES.has(key)) return "comercial";
  if (RESIDENTIAL_TYPES.has(key)) return "residencial";
  return null;
}

export function composePropertyAddress(property: { address?: string | null; neighborhood?: string | null; city?: string | null; metadata?: unknown }) {
  const metadata = asObject(property.metadata);
  const unit = typeof metadata.externalPropertyRef === "string" ? metadata.externalPropertyRef.trim() : "";
  const cep = typeof metadata.cep === "string" ? metadata.cep.trim() : "";
  const parts = [
    property.address?.trim(),
    unit ? `unidade ${unit}` : null,
    property.neighborhood?.trim() ? `bairro ${property.neighborhood.trim()}` : null,
    property.city?.trim(),
    cep ? `CEP ${cep}` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

const ADJUSTMENT_LABELS: Record<string, string> = { IPCA: "IPCA", IGPM: "IGP-M", "IGP-M": "IGP-M", INPC: "INPC" };

export class ImobRentalContractService {
  constructor(private readonly prisma: PrismaClient) {}

  private async loadLease(scope: Scope, propertyId: string) {
    const lease = await this.prisma.imobCase.findFirst({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, propertyId, flow: RENTAL_LEASE_FLOW, status: "active" },
      select: { id: true, metadata: true, pendingItems: true },
    });
    if (!lease) return null;
    const property = await this.prisma.imobProperty.findFirst({
      where: { id: propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      select: { id: true, ownerId: true, propertyType: true, address: true, neighborhood: true, city: true, metadata: true },
    });
    if (!property) return null;
    const owner = property.ownerId
      ? await this.prisma.imobOwner.findFirst({
          where: { id: property.ownerId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
          select: { id: true, name: true, document: true, metadata: true },
        })
      : null;
    return { lease, property, owner };
  }

  async prefill(scope: Scope, propertyId: string): Promise<{ status: "ok"; data: RentalContractPrefill } | { status: "lease_not_found" }> {
    const loaded = await this.loadLease(scope, propertyId);
    if (!loaded) return { status: "lease_not_found" };
    const { lease, property, owner } = loaded;
    const meta = asObject(lease.metadata);
    const tenant = asObject(meta.tenantParty);
    const guarantee = asObject(meta.guarantee);
    const charges = asObject(meta.charges);
    const terms = asObject(meta.contractTerms);
    const propertyMeta = asObject(property.metadata);

    const startDate = informedValue<string>(meta.startDate);
    const endDate = informedValue<string>(meta.endDate);
    const adjustmentRaw = informedValue<string>(meta.adjustmentIndex);
    const gaps: string[] = [];
    if (!owner) gaps.push("Imóvel sem proprietário ligado: cadastre o proprietário e ligue-o em Imóveis → Editar imóvel.");

    return {
      status: "ok",
      data: {
        propertyId: property.id,
        leaseCaseId: lease.id,
        landlordName: owner?.name ?? null,
        landlordDocument: owner?.document ?? null,
        tenantName: informedValue<string>(tenant.name),
        tenantDocument: informedValue<string>(tenant.document),
        propertyAddress: composePropertyAddress(property),
        purpose: (terms.purpose as "residencial" | "comercial" | undefined) ?? purposeFromPropertyType(property.propertyType),
        registryNumber: (typeof propertyMeta.registryNumber === "string" && propertyMeta.registryNumber) || null,
        startDate,
        durationMonths: typeof terms.durationMonths === "number"
          ? terms.durationMonths
          : startDate && endDate ? monthsBetween(startDate, endDate) : null,
        rentCents: informedValue<number>(meta.rentCents),
        dueDay: informedValue<number>(meta.dueDay),
        adjustmentIndex: adjustmentRaw ? ADJUSTMENT_LABELS[adjustmentRaw.toUpperCase()] ?? adjustmentRaw : null,
        adjustmentMonth: informedValue<number>(meta.adjustmentMonth),
        guaranteeType: informedValue<RentalGuaranteeType>(guarantee.type),
        guaranteeAmountCents: informedValue<number>(guarantee.expectedAmountCents),
        guarantorName: (typeof terms.guarantorName === "string" && terms.guarantorName) || null,
        iptu: informedValue<RentalChargePayer>(charges.iptu),
        condominio: informedValue<RentalChargePayer>(charges.condominio),
        condominioAmountCents: informedValue<number>(charges.condominioAmountCents),
        forumCity: property.city ?? null,
        gaps,
      },
    };
  }

  async generate(scope: Scope, input: RentalContractInput) {
    const landlordDigits = input.landlordDocument.replace(/\D/g, "");
    const tenantDigits = input.tenantDocument.replace(/\D/g, "");
    if (landlordDigits.length === 11 && !isValidCpf(landlordDigits)) return { status: "invalid_landlord_document" as const };
    if (tenantDigits.length === 11 && !isValidCpf(tenantDigits)) return { status: "invalid_tenant_document" as const };

    const loaded = await this.loadLease(scope, input.propertyId);
    if (!loaded) return { status: "lease_not_found" as const };
    const { lease, property, owner } = loaded;

    const { text, endDate } = buildRentalContractText({ ...input, landlordDocument: landlordDigits, tenantDocument: tenantDigits });

    // Devolve ao cadastro o que foi completado no contrato (só onde estava vazio).
    const meta = asObject(lease.metadata);
    const tenant = asObject(meta.tenantParty);
    const writtenBack: string[] = [];
    const nextTenant = { ...tenant };
    if (!informedValue(tenant.document)) {
      nextTenant.document = { value: tenantDigits, origin: ORIGIN };
      writtenBack.push("CPF/CNPJ do locatário na locação");
    }
    const pendingItems = Array.isArray(lease.pendingItems)
      ? (lease.pendingItems as unknown[]).filter((item): item is string => typeof item === "string")
      : [];
    const nextPending = pendingItems.filter((item) => item !== "inquilino_documento");

    await this.prisma.imobCase.update({
      where: { id: lease.id },
      data: {
        metadata: {
          ...meta,
          tenantParty: nextTenant,
          contractTerms: {
            purpose: input.purpose,
            durationMonths: input.durationMonths,
            guarantorName: input.guarantorName ?? null,
            lastDraftAt: new Date().toISOString(),
            source: RENTAL_CONTRACT_SOURCE,
          },
        } as any,
        pendingItems: nextPending,
      },
    });
    await this.prisma.imobCaseEvent.create({
      data: {
        imobCase: { connect: { id: lease.id } },
        tenant: { connect: { id: scope.tenantId } },
        workspace: { connect: { id: scope.workspaceId } },
        type: "rental.lease.contract_draft_generated",
        actorType: "user",
        actorRef: scope.userId ?? null,
        summary: "Minuta de contrato de locação gerada a partir dos cadastros",
        evidenceRef: null,
        payload: { source: RENTAL_CONTRACT_SOURCE, writtenBack },
      },
    });

    if (owner && !owner.document) {
      await this.prisma.imobOwner.update({ where: { id: owner.id }, data: { document: landlordDigits } });
      writtenBack.push("CPF/CNPJ do proprietário");
      await recordImobCrmAuditEvent({
        prisma: this.prisma,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        userId: scope.userId ?? null,
        subjectType: "owner",
        subjectId: owner.id,
        action: "updated",
        summary: "Documento do proprietário informado no contrato de locação",
        metadata: { change: "document_from_contract", source: RENTAL_CONTRACT_SOURCE },
      });
    }
    const propertyMeta = asObject(property.metadata);
    if (input.registryNumber?.trim() && !propertyMeta.registryNumber) {
      await this.prisma.imobProperty.update({
        where: { id: property.id },
        data: { metadata: { ...propertyMeta, registryNumber: input.registryNumber.trim() } as any },
      });
      writtenBack.push("matrícula do imóvel");
    }

    return {
      status: "generated" as const,
      data: {
        leaseCaseId: lease.id,
        propertyId: property.id,
        contractText: text,
        endDate,
        writtenBack,
        fileName: `minuta-locacao-${(property.address ?? "imovel").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40) || "imovel"}.pdf`,
      },
    };
  }
}
