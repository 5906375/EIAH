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

/**
 * Ciclo da locação depois do cadastro: editar a locação ativa, encerrar e
 * consultar o histórico do imóvel. Sempre estruturado (formulário), nunca
 * texto de conversa; eventos do caso registram só nomes de campos e motivo.
 */

export const RENTAL_LEASE_CLOSED_STATUS = "closed";
export const RENTAL_LEASE_CLOSED_STAGE = "ended";
export const RENTAL_CLOSE_REASONS = [
  "fim_contrato",
  "rescisao_locatario",
  "rescisao_locador",
  "inadimplencia",
  "venda_imovel",
  "outro",
] as const;
export type RentalCloseReason = (typeof RENTAL_CLOSE_REASONS)[number];

export type RentalLeaseCloseInput = {
  propertyId: string;
  endedOn: string;
  reason: RentalCloseReason;
  notes?: string | null;
};

const CONTRACT_PENDING = "vincular_contrato_pdf";

function informedValueOf<T>(value: unknown): T | null {
  const field = asObject(value);
  return field.value === undefined || field.value === null || field.value === "" ? null : (field.value as T);
}

function documentsOf(metadata: unknown) {
  const raw = asObject(metadata).documents;
  if (!Array.isArray(raw)) return [];
  return raw
    .map(asObject)
    .filter((item) => typeof item.documentId === "string")
    .map((item) => ({
      documentId: item.documentId as string,
      category: typeof item.category === "string" ? item.category : "outro",
      fileName: typeof item.fileName === "string" ? item.fileName : "arquivo",
      url: typeof item.url === "string" ? item.url : null,
    }));
}

/** Valores editáveis da locação ativa, no formato do formulário de cadastro. */
export function rentalLeaseToInput(propertyId: string, metadata: unknown): RentalLeaseInput {
  const meta = asObject(metadata);
  const tenant = asObject(meta.tenantParty);
  const guarantee = asObject(meta.guarantee);
  const charges = asObject(meta.charges);
  return {
    propertyId,
    tenantName: informedValueOf<string>(tenant.name) ?? "",
    tenantDocument: informedValueOf<string>(tenant.document),
    tenantPhone: informedValueOf<string>(tenant.phone),
    tenantEmail: informedValueOf<string>(tenant.email),
    agreementType: informedValueOf<RentalLeaseInput["agreementType"]>(meta.agreementType) ?? "desconhecido",
    startDate: informedValueOf<string>(meta.startDate),
    endDate: informedValueOf<string>(meta.endDate),
    rentCents: informedValueOf<number>(meta.rentCents),
    dueDay: informedValueOf<number>(meta.dueDay),
    adjustmentIndex: informedValueOf<string>(meta.adjustmentIndex),
    adjustmentMonth: informedValueOf<number>(meta.adjustmentMonth),
    guaranteeType: informedValueOf<RentalLeaseInput["guaranteeType"]>(guarantee.type) ?? "desconhecido",
    guaranteeAmountCents: informedValueOf<number>(guarantee.expectedAmountCents),
    iptu: informedValueOf<ChargePayer>(charges.iptu) ?? "desconhecido",
    condominio: informedValueOf<ChargePayer>(charges.condominio) ?? "desconhecido",
    condominioAmountCents: informedValueOf<number>(charges.condominioAmountCents),
    notes: typeof meta.notes === "string" ? meta.notes : null,
  };
}

const EDITABLE_FIELDS = [
  "tenantName", "tenantDocument", "tenantPhone", "tenantEmail", "agreementType", "startDate", "endDate", "rentCents",
  "dueDay", "adjustmentIndex", "adjustmentMonth", "guaranteeType", "guaranteeAmountCents", "iptu", "condominio",
  "condominioAmountCents", "notes",
] as const;

/** Só os nomes dos campos alterados (nunca os valores) vão para o evento do caso. */
export function diffRentalLeaseFields(before: RentalLeaseInput, after: RentalLeaseInput) {
  const norm = (value: unknown) => (value === undefined || value === "" ? null : typeof value === "string" ? value.toUpperCase() : value);
  return EDITABLE_FIELDS.filter((field) => norm(before[field]) !== norm(after[field]));
}

/**
 * Pendências depois da edição: recalculadas pelos dados, mas a do contrato
 * só volta se o contrato assinado ainda não foi anexado.
 */
export function rentalLeasePendingAfterEdit(input: RentalLeaseInput, previousPending: string[], previousAgreement: string | null) {
  const computed = buildRentalLeasePendingItems(input).filter((item) => item !== CONTRACT_PENDING);
  const contractStillPending = input.agreementType === "escrito"
    && (previousPending.includes(CONTRACT_PENDING) || previousAgreement !== "escrito");
  return contractStillPending ? [...computed, CONTRACT_PENDING] : computed;
}

export function validateRentalLeaseClose(input: RentalLeaseCloseInput, startDate: string | null, today: string) {
  if (startDate && input.endedOn < startDate) return "ended_before_start" as const;
  if (input.endedOn > today) return "ended_in_future" as const;
  return null;
}

export class ImobRentalLeaseLifecycleService {
  constructor(private readonly prisma: PrismaClient) {}

  private async findActiveLease(scope: Scope, propertyId: string) {
    return this.prisma.imobCase.findFirst({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, propertyId, flow: RENTAL_LEASE_FLOW, status: "active" },
      select: { id: true, metadata: true, pendingItems: true },
    });
  }

  async getActive(scope: Scope, propertyId: string) {
    const lease = await this.findActiveLease(scope, propertyId);
    if (!lease) return { status: "lease_not_found" as const };
    const pendingItems = Array.isArray(lease.pendingItems) ? (lease.pendingItems as unknown[]).filter((item): item is string => typeof item === "string") : [];
    return { status: "ok" as const, data: { caseId: lease.id, values: rentalLeaseToInput(propertyId, lease.metadata), pendingItems } };
  }

  async update(scope: Scope, input: RentalLeaseInput) {
    if (input.tenantDocument && input.tenantDocument.length === 11 && !isValidCpf(input.tenantDocument)) {
      return { status: "invalid_document" as const };
    }
    const lease = await this.findActiveLease(scope, input.propertyId);
    if (!lease) return { status: "lease_not_found" as const };

    const meta = asObject(lease.metadata);
    const before = rentalLeaseToInput(input.propertyId, meta);
    const changed = diffRentalLeaseFields(before, input);
    const previousPending = Array.isArray(lease.pendingItems)
      ? (lease.pendingItems as unknown[]).filter((item): item is string => typeof item === "string")
      : [];
    if (changed.length === 0) return { status: "unchanged" as const, data: { caseId: lease.id, changed, pendingItems: previousPending } };

    const stableAgreementKey = typeof meta.stableAgreementKey === "string" ? meta.stableAgreementKey : `rental:${input.propertyId}`;
    const rebuilt = buildRentalLeaseMetadata(input, stableAgreementKey);
    // Mantém o que o formulário não edita (documentos, termos do contrato, origem do cadastro).
    const { importSource: _ignored, hasLinkedDocument: _linked, ...editable } = rebuilt;
    const pendingItems = rentalLeasePendingAfterEdit(input, previousPending, informedValueOf<string>(meta.agreementType));

    await this.prisma.$transaction(async (tx) => {
      await tx.imobCase.update({
        where: { id: lease.id },
        data: { metadata: { ...meta, ...editable } as any, pendingItems },
      });
      await tx.imobCaseEvent.create({
        data: {
          imobCase: { connect: { id: lease.id } },
          tenant: { connect: { id: scope.tenantId } },
          workspace: { connect: { id: scope.workspaceId } },
          type: "rental.lease.updated",
          actorType: "user",
          actorRef: scope.userId ?? null,
          summary: "Locação ativa corrigida pelo formulário do chat IMOB",
          evidenceRef: null,
          payload: { source: RENTAL_LEASE_SOURCE, changedFields: changed } as any,
        },
      });
    });
    return {
      status: "updated" as const,
      data: { caseId: lease.id, changed, pendingItems, tenantDocumentMasked: maskTaxDocument(input.tenantDocument) },
    };
  }

  async close(scope: Scope, input: RentalLeaseCloseInput, today = new Date().toISOString().slice(0, 10)) {
    const lease = await this.findActiveLease(scope, input.propertyId);
    if (!lease) return { status: "lease_not_found" as const };
    const meta = asObject(lease.metadata);
    const invalid = validateRentalLeaseClose(input, informedValueOf<string>(meta.startDate), today);
    if (invalid) return { status: invalid };

    const property = await this.prisma.imobProperty.findFirst({
      where: { id: input.propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      select: { id: true, metadata: true },
    });

    const closure = {
      endedOn: input.endedOn,
      reason: input.reason,
      notes: input.notes?.trim() || null,
      closedAt: new Date().toISOString(),
      closedByUserId: scope.userId ?? null,
    };
    await this.prisma.$transaction(async (tx) => {
      await tx.imobCase.update({
        where: { id: lease.id },
        data: {
          status: RENTAL_LEASE_CLOSED_STATUS,
          stage: RENTAL_LEASE_CLOSED_STAGE,
          pendingItems: [],
          metadata: { ...meta, closure } as any,
        },
      });
      await tx.imobCaseEvent.create({
        data: {
          imobCase: { connect: { id: lease.id } },
          tenant: { connect: { id: scope.tenantId } },
          workspace: { connect: { id: scope.workspaceId } },
          type: "rental.lease.closed",
          actorType: "user",
          actorRef: scope.userId ?? null,
          summary: "Locação encerrada pelo formulário do chat IMOB",
          evidenceRef: null,
          payload: { source: RENTAL_LEASE_SOURCE, endedOn: input.endedOn, reason: input.reason } as any,
        },
      });
      if (property) {
        await tx.imobProperty.update({
          where: { id: property.id },
          data: { metadata: { ...asObject(property.metadata), occupancy: informed("vago") } as any },
        });
      }
    });
    return { status: "closed" as const, data: { caseId: lease.id, endedOn: input.endedOn, reason: input.reason } };
  }

  async history(scope: Scope, propertyId: string) {
    const property = await this.prisma.imobProperty.findFirst({
      where: { id: propertyId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
      select: { id: true },
    });
    if (!property) return { status: "property_not_found" as const };
    const leases = await this.prisma.imobCase.findMany({
      where: { tenantId: scope.tenantId, workspaceId: scope.workspaceId, propertyId, flow: RENTAL_LEASE_FLOW },
      select: { id: true, status: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      status: "ok" as const,
      data: {
        propertyId,
        items: leases.map((lease) => {
          const meta = asObject(lease.metadata);
          const tenant = asObject(meta.tenantParty);
          const closure = asObject(meta.closure);
          return {
            caseId: lease.id,
            status: lease.status === "active" ? ("active" as const) : ("closed" as const),
            tenantName: informedValueOf<string>(tenant.name),
            tenantDocumentMasked: maskTaxDocument(informedValueOf<string>(tenant.document)),
            startDate: informedValueOf<string>(meta.startDate),
            endDate: informedValueOf<string>(meta.endDate),
            endedOn: typeof closure.endedOn === "string" ? closure.endedOn : null,
            closeReason: typeof closure.reason === "string" ? closure.reason : null,
            rentCents: informedValueOf<number>(meta.rentCents),
            documents: documentsOf(meta),
            registeredAt: lease.createdAt.toISOString(),
          };
        }),
      },
    };
  }
}
