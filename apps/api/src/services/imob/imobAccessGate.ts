import crypto from "node:crypto";
import type { Request, Response } from "express";
import { prismaGlobal } from "@repo/db";
import { recordGuardrailAudit } from "@eiah/core/services/guardrailLedgerStore";
import { buildFrictionEvent, mapImobAccessDeniedToFrictionKind } from "../../types/frictionEventContract";

export type ImobAccessGateReasonCode =
  | "IMOB_ENTITLEMENT_MISSING"
  | "IMOB_INSTALLATION_INACTIVE"
  | "IMOB_PERMISSION_DENIED";

export type ImobAccessGateCtaType = "INSTALL" | "ACTIVATE" | "CONTACT_ADMIN" | "OPEN_BILLING";

export type ImobAccessGateCapability =
  | "CENTRAL_OPERACIONAL"
  | "KNOWLEDGE_SYNC_STATUS"
  | "KNOWLEDGE_SEARCH";

type ProductInstallationRecord = {
  product: string;
  status: string;
};

type ImobAccessGateError = {
  code: string;
  reasonCode: ImobAccessGateReasonCode;
  message: string;
  traceId: string;
  product: "IMOB";
  capability: ImobAccessGateCapability;
  scope: {
    tenantId: string;
    workspaceId: string;
  };
  cta: {
    type: ImobAccessGateCtaType;
    label: string;
    target: string;
  };
  details: {
    entitlementRequired: "IMOB_ACTIVE_INSTALLATION";
    installationStatus: "missing" | "inactive" | "active";
    stage?: string | null;
  };
};

export function resolveImobInstallationStatus(records: ProductInstallationRecord[]) {
  const imobRows = records.filter((entry) => entry.product.trim().toUpperCase() === "IMOB");
  if (imobRows.length === 0) return "missing" as const;
  const hasActive = imobRows.some((entry) => entry.status.trim().toLowerCase() === "active");
  return hasActive ? ("active" as const) : ("inactive" as const);
}

function buildImobGateCta(reasonCode: ImobAccessGateReasonCode) {
  if (reasonCode === "IMOB_INSTALLATION_INACTIVE") {
    return {
      type: "ACTIVATE" as const,
      label: "Regularizar instalação",
      target: "/app/marketplace/imob",
    };
  }
  if (reasonCode === "IMOB_PERMISSION_DENIED") {
    return {
      type: "CONTACT_ADMIN" as const,
      label: "Contatar administrador",
      target: "/profile",
    };
  }
  return {
    type: "INSTALL" as const,
    label: "Instalar IMOB",
    target: "/app/marketplace/imob",
  };
}

function buildImobGateMessage(reasonCode: ImobAccessGateReasonCode, capability: ImobAccessGateCapability) {
  if (reasonCode === "IMOB_INSTALLATION_INACTIVE") {
    return capability === "CENTRAL_OPERACIONAL"
      ? "A instalação do IMOB neste workspace não está ativa. Reative a instalação para acessar a Central Operacional."
      : "A instalação do IMOB neste workspace não está ativa. Reative a instalação para usar este recurso.";
  }
  if (reasonCode === "IMOB_PERMISSION_DENIED") {
    return capability === "CENTRAL_OPERACIONAL"
      ? "Você não possui permissão para acessar a Central Operacional do IMOB neste workspace."
      : "Você não possui permissão para usar este recurso do IMOB neste workspace.";
  }
  return capability === "CENTRAL_OPERACIONAL"
    ? "IMOB não está habilitado neste workspace. É necessária uma instalação ativa para acessar a Central Operacional."
    : "IMOB não está habilitado neste workspace. É necessária uma instalação ativa para usar este recurso.";
}

function resolveTraceId(req?: Request) {
  const traceId = req?.traceId?.trim();
  return traceId && traceId.length > 0 ? traceId : crypto.randomUUID();
}

function auditImobAccessDenied(req: Request | undefined, payload: ImobAccessGateError) {
  const frictionEvent = buildFrictionEvent({
    eventId: crypto.randomUUID(),
    source: "access_gate",
    kind: mapImobAccessDeniedToFrictionKind(),
    severity: "high",
    tenantId: payload.scope.tenantId,
    workspaceId: payload.scope.workspaceId,
    activeDomain: "imob",
    surfaceId: "imob_chat",
    reasonCode: payload.reasonCode,
    traceId: payload.traceId,
    summary: payload.message,
    occurredAt: new Date().toISOString(),
    metadata: {
      product: payload.product,
      capability: payload.capability,
      cta: payload.cta.type,
      installationStatus: payload.details.installationStatus,
    },
  });
  void recordGuardrailAudit({
    prisma: prismaGlobal,
    tenantId: payload.scope.tenantId,
    workspaceId: payload.scope.workspaceId,
    eventType: "imob.access_denied",
    severity: "warn",
    message: payload.message,
    metadata: { frictionEvent },
  }).catch((error) => {
    req?.logger?.error?.({ error }, "imob.access_denied.audit_failed");
  });
  if (!req?.logger?.warn) return;
  req.logger.warn(
    {
      traceId: payload.traceId,
      tenantId: payload.scope.tenantId,
      workspaceId: payload.scope.workspaceId,
      userId: (req as Request & { authContext?: { userId?: string | null } }).authContext?.userId ?? null,
      product: payload.product,
      capability: payload.capability,
      reasonCode: payload.reasonCode,
      cta: payload.cta.type,
      frictionEvent,
    },
    "imob.access_denied"
  );
}

export function buildImobAccessGateError(params: {
  req?: Request;
  code: string;
  reasonCode: ImobAccessGateReasonCode;
  capability: ImobAccessGateCapability;
  tenantId: string;
  workspaceId: string;
  installationStatus: "missing" | "inactive" | "active";
  stage?: string | null;
  message?: string;
}) {
  const payload: ImobAccessGateError = {
    code: params.code,
    reasonCode: params.reasonCode,
    message: params.message?.trim() || buildImobGateMessage(params.reasonCode, params.capability),
    traceId: resolveTraceId(params.req),
    product: "IMOB",
    capability: params.capability,
    scope: {
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
    },
    cta: buildImobGateCta(params.reasonCode),
    details: {
      entitlementRequired: "IMOB_ACTIVE_INSTALLATION",
      installationStatus: params.installationStatus,
      ...(params.stage !== undefined ? { stage: params.stage } : {}),
    },
  };
  auditImobAccessDenied(params.req, payload);
  return payload;
}

export function sendImobAccessDenied(
  res: Response,
  params: Parameters<typeof buildImobAccessGateError>[0]
) {
  return res.status(403).json({
    ok: false,
    error: buildImobAccessGateError(params),
  });
}
