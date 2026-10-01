import type { PrismaClient } from "@repo/db";
import { ImobCrmMutationService } from "./imobCrmMutationService";

/**
 * Locação vigente (contrato já assinado ou acordo verbal em curso).
 *
 * Grava a locação como caso `rental.lease` ligado ao imóvel, sem criar lead:
 * o inquilino de uma locação vigente não entra no funil comercial.
 * Regras herdadas de docs/ops/imob-rental-import-spec-v1 (experimento):
 * origem por campo, nada inferido (vazio fica null), caução só "prevista".
 * Entrada estruturada (formulário), nunca texto de conversa.
 */

export const RENTAL_LEASE_FLOW = "rental.lease";
export const RENTAL_LEASE_SOURCE = "imob_rental_lease_form_v1";
const ORIGIN = "informed_by_manager";

type Scope = { tenantId: string; workspaceId: string; userId?: string | null };

type ChargePayer = "inquilino" | "proprietario" | "dispensado" | "nao_existe" | "desconhecido";

export type RentalLeaseInput = {
  propertyId: string;
  tenantName: string;
  tenantDocument?: string | null;
  tenantPhone?: string | null;
  tenantEmail?: string | null;
  agreementType: "escrito" | "verbal" | "desconhecido";
  startDate?: string | null;
  endDate?: string | null;
  rentCents?: number | null;
  dueDay?: number | null;
  adjustmentIndex?: string | null;
  adjustmentMonth?: number | null;
  guaranteeType: "caucao" | "fiador" | "seguro_fianca" | "titulo_capitalizacao" | "nenhuma" | "desconhecido";
  guaranteeAmountCents?: number | null;
  iptu: ChargePayer;
  condominio: ChargePayer;
  condominioAmountCents?: number | null;
  notes?: string | null;
};

export function isValidCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  for (const size of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < size; i += 1) sum += Number(value[i]) * (size + 1 - i);
    if (((sum * 10) % 11) % 10 !== Number(value[size])) return false;
  }
  return true;
}

// Mostra só os 2 últimos dígitos do CPF (11 dígitos) ou CNPJ (14 dígitos).
export function maskTaxDocument(value: string | null | undefined) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11) return `***.***.***-${digits.slice(-2)}`;
  if (digits.length === 14) return `**.***.***/****-${digits.slice(-2)}`;
  return "***";
}

const informed = <V>(value: V | null | undefined) => {
  const normalized = value === undefined || value === "" ? null : value;
  return { value: normalized, origin: normalized === null ? "unknown" : ORIGIN };
};

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function buildRentalLeasePendingItems(input: RentalLeaseInput) {
  return [
    input.rentCents ? null : "aluguel",
    input.startDate ? null : "inicio",
    input.dueDay ? null : "vencimento_dia",
    input.tenantDocument ? null : "inquilino_documento",
    input.agreementType === "escrito" ? "vincular_contrato_pdf" : null,
  ].filter((item): item is string => Boolean(item));
}

export function buildRentalLeaseMetadata(input: RentalLeaseInput, stableAgreementKey: string) {
  return {
    importSource: RENTAL_LEASE_SOURCE,
    stableAgreementKey,
    agreementType: informed(input.agreementType),
    hasLinkedDocument: false,
    tenantParty: {
      name: informed(input.tenantName),
      document: informed(input.tenantDocument),
      phone: informed(input.tenantPhone),
      email: informed(input.tenantEmail),
    },
    startDate: informed(input.startDate),
    endDate: informed(input.endDate),
    rentCents: informed(input.rentCents),
    dueDay: informed(input.dueDay),
    adjustmentIndex: informed(input.adjustmentIndex?.toUpperCase()),
    adjustmentMonth: informed(input.adjustmentMonth),
    guarantee: {
      type: informed(input.guaranteeType),
      expectedAmountCents: informed(input.guaranteeAmountCents),
      receivedStatus: "not_tracked",
    },
    charges: {
      iptu: informed(input.iptu),
      condominio: informed(input.condominio),
      condominioAmountCents: informed(input.condominioAmountCents),
    },
    notes: input.notes ?? null,
  };
}

export class ImobRentalLeaseService {
  constructor(private readonly prisma: PrismaClient) {}

  async registerLease(scope: Scope, input: RentalLeaseInput) {
    if (input.tenantDocument && input.tenantDocument.length === 11 && !isValidCpf(input.tenantDocument)) {
      return { status: "invalid_document" as const };
    }

    const property = await this.prisma.imobProperty.findFirst({
      where: { id: input.propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId, status: { not: "archived" } },
      select: { id: true, ownerId: true, address: true, propertyType: true, metadata: true },
    });
    if (!property) return { status: "property_not_found" as const };

    const activeLease = await this.prisma.imobCase.findFirst({
      where: {
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
        propertyId: property.id,
        flow: RENTAL_LEASE_FLOW,
        status: "active",
      },
      select: { id: true },
    });
    if (activeLease) return { status: "lease_already_active" as const, caseId: activeLease.id };

    const stableAgreementKey = `rental:${property.id}:${input.startDate ?? new Date().toISOString().slice(0, 10)}`;
    const pendingItems = buildRentalLeasePendingItems(input);
    const mutations = new ImobCrmMutationService(this.prisma);
    const created = await mutations.createCase(scope, {
      flow: RENTAL_LEASE_FLOW,
      stage: "active",
      status: "active",
      ownerId: property.ownerId ?? null,
      propertyId: property.id,
      externalDealId: stableAgreementKey,
      pendingItems,
      metadata: buildRentalLeaseMetadata(input, stableAgreementKey),
      initialEvent: {
        type: "rental.lease.registered",
        actorType: "user",
        actorRef: scope.userId ?? null,
        summary: "Locação vigente cadastrada pelo formulário do chat IMOB",
        evidenceRef: stableAgreementKey,
        payload: { source: RENTAL_LEASE_SOURCE, propertyId: property.id },
      },
    } as any);
    if (created.status !== "created") return { status: created.status };

    const propertyMetadata = asObject(property.metadata);
    await mutations.updateProperty(scope, property.id, {
      metadata: { ...propertyMetadata, occupancy: informed("locado") },
    } as any);

    return {
      status: "created" as const,
      data: {
        caseId: created.data.id,
        propertyId: property.id,
        propertyLabel:
          (typeof propertyMetadata.externalPropertyRef === "string" && propertyMetadata.externalPropertyRef)
          || property.address
          || property.propertyType
          || property.id,
        tenantName: input.tenantName,
        tenantDocumentMasked: maskTaxDocument(input.tenantDocument),
        pendingItems,
      },
    };
  }
}
