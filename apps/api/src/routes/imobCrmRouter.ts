import type { Response, Router } from "express";
import type { TenantAwareRequest } from "../middlewares/enforceTenant";
import type { ImobCrmCaseContext } from "../services/imob/crm/imobCrmAgentContract";
import { ImobCrmRepository } from "../services/imob/crm/imobCrmRepository";
import { ImobCrmMutationService } from "../services/imob/crm/imobCrmMutationService";
import { ImobCrmDocumentService } from "../services/imob/crm/imobCrmDocumentService";
import { ImobCrmFollowUpService } from "../services/imob/crm/imobCrmFollowUpService";
import { ImobCrmKpiService } from "../services/imob/crm/imobCrmKpiService";
import { buildImobCrmCaseContextFromRecord } from "../services/imob/crm/imobCrmCaseContext";
import { buildImobControlSurface } from "../services/imob/control/imobControlSurface";
import {
  buildImobApprovalContextResponse,
  buildImobBottleneckHeatmap,
  buildImobPriorityQueue,
  buildImobRescueIndex,
  buildImobSpecialistLoadBoard,
  buildImobWaitingOnBoard,
} from "../services/imob/control/imobControlSurfaceAggregates";
import { IMOB_REASON_CODE_CATALOG } from "../services/imob/control/imobReasonCodeCatalog";
import { resolveImobBackingSpecialists } from "../services/imob/imobSpecialistBridge";
import {
  recordImobApprovalActionCompletedTelemetry,
  recordImobApprovalContextPresentedTelemetry,
} from "../services/imob/imobTelemetry";
import { canWorkspaceOperateImobStage } from "../services/workspaceResponsibility";

type SafeParseSchema<TParsed = any> = {
  safeParse(input: unknown): { success: true; data: TParsed } | { success: false; error: { flatten(): unknown } };
};

type ReadWorkspaceAccessProfile = (params: {
  prisma: NonNullable<TenantAwareRequest["prisma"]>;
  authContext: NonNullable<TenantAwareRequest["authContext"]>;
}) => Promise<{ responsibleLabel: string; permissions: string[] }>;

type EnsureWorkspacePermission = (
  reqOrRes: TenantAwareRequest | Response,
  resOrPermissions: Response | string[],
  permissionsOrPermission: string[] | string,
  permissionOrMessage: string,
  messageOrCapability?: string,
  capability?: "CENTRAL_OPERACIONAL" | "KNOWLEDGE_SYNC_STATUS" | "KNOWLEDGE_SEARCH"
) => boolean;

type EnsureStagePermission = (
  reqOrRes: TenantAwareRequest | Response,
  resOrPermissions: Response | string[],
  permissionsOrStage: string[] | string | null | undefined,
  stageOrMessage: string | null | undefined,
  message?: string
) => boolean;

type CanonicalCaseMapper = (item: any) => any;
type RouteCanonicalContextMapper = (data: any) => any;

export type RegisterImobCrmRoutesParams = {
  router: Router;
  readImobWorkspaceAccessProfile: ReadWorkspaceAccessProfile;
  ensureImobWorkspacePermission: EnsureWorkspacePermission;
  ensureImobStagePermission: EnsureStagePermission;
  withImobCanonicalCase: CanonicalCaseMapper;
  withRouteCanonicalCaseContext: RouteCanonicalContextMapper;
  schemas: {
    imobAttachmentResolveSchema: SafeParseSchema;
    imobAttachmentCrmSuggestionApplySchema: SafeParseSchema;
    imobOwnerCreateSchema: SafeParseSchema;
    imobOwnerUpdateSchema: SafeParseSchema;
    imobPropertyCreateSchema: SafeParseSchema;
    imobPropertyUpdateSchema: SafeParseSchema;
    imobLeadCreateSchema: SafeParseSchema;
    imobLeadUpdateSchema: SafeParseSchema;
    imobCaseCreateSchema: SafeParseSchema;
    imobCaseUpdateSchema: SafeParseSchema;
    imobFollowUpRunSchema: SafeParseSchema;
    imobApprovalActionSchema: SafeParseSchema;
  };
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
}

export function registerImobCrmRoutes(params: RegisterImobCrmRoutesParams) {
  const {
    router,
    readImobWorkspaceAccessProfile,
    ensureImobWorkspacePermission,
    ensureImobStagePermission,
    withImobCanonicalCase,
    withRouteCanonicalCaseContext,
    schemas,
  } = params;

  function buildImobControlSurfaceFromCaseRecord(item: any) {
    const caseContext = buildImobCrmCaseContextFromRecord(item, (raw) => withImobCanonicalCase(raw).canonical);
    const specialists = resolveImobBackingSpecialists(caseContext as any);
    return buildImobControlSurface({
      caseContext: caseContext as any,
      specialists,
    });
  }

  const telemetryAgentId = "imob-chat";

  router.post("/attachments/resolve", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const parsed = schemas.imobAttachmentResolveSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const resolved = await new ImobCrmDocumentService(prisma).resolveAttachment({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, {
      caseId: parsed.data.caseId,
      threadId: parsed.data.threadId,
      conversationId: parsed.data.conversationId,
      documentIds: parsed.data.documentIds,
      workspaceResponsibleLabel: workspaceAccess.responsibleLabel,
      canOperateStage: (stage) => canWorkspaceOperateImobStage(workspaceAccess.permissions, stage),
    });

    if (resolved.status === "upload_not_found") {
      return res.status(404).json({ ok: false, error: { code: "UPLOAD_NOT_FOUND", message: "One or more uploaded documents were not found" } });
    }
    if (resolved.status === "stage_forbidden") {
      ensureImobStagePermission(res, workspaceAccess.permissions, resolved.stage, `Sua função atual não pode operar a etapa ${resolved.stage} neste workspace.`);
      return;
    }

    return res.json({ ok: true, data: withRouteCanonicalCaseContext(resolved.data) });
  });

  router.post("/attachments/crm-suggestion", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const parsed = schemas.imobAttachmentCrmSuggestionApplySchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const applied = await new ImobCrmDocumentService(prisma).applyCrmSuggestion({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, {
      caseId: parsed.data.caseId,
      threadId: parsed.data.threadId,
      conversationId: parsed.data.conversationId,
      documentIds: parsed.data.documentIds,
      mode: parsed.data.mode,
      workspaceResponsibleLabel: workspaceAccess.responsibleLabel,
      canOperateStage: (stage) => canWorkspaceOperateImobStage(workspaceAccess.permissions, stage),
    });

    if (applied.status === "upload_not_found") {
      return res.status(404).json({ ok: false, error: { code: "UPLOAD_NOT_FOUND", message: "One or more uploaded documents were not found" } });
    }
    if (applied.status === "case_not_found") {
      return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case or owner not found for CRM suggestion" } });
    }
    if (applied.status === "stage_forbidden") {
      ensureImobStagePermission(res, workspaceAccess.permissions, applied.stage, `Sua função atual não pode operar a etapa ${applied.stage} neste workspace.`);
      return;
    }

    return res.json({ ok: true, data: withRouteCanonicalCaseContext(applied.data) });
  });

  router.get("/owners", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const items = await new ImobCrmRepository(prisma).listOwners({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    });

    return res.json({ ok: true, data: { items } });
  });

  router.post("/owners", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const parsed = schemas.imobOwnerCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const created = await new ImobCrmMutationService(prisma).createOwner({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, parsed.data);

    return res.status(201).json({ ok: true, data: created });
  });

  router.get("/owners/:ownerId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const item = await new ImobCrmRepository(prisma).getOwner({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, req.params.ownerId);

    if (!item) {
      return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found" } });
    }

    return res.json({ ok: true, data: item });
  });

  router.patch("/owners/:ownerId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const parsed = schemas.imobOwnerUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const updated = await new ImobCrmMutationService(prisma).updateOwner({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, req.params.ownerId, parsed.data);
    if (!updated) {
      return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found" } });
    }

    return res.json({ ok: true, data: updated });
  });

  router.delete("/owners/:ownerId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const archived = await new ImobCrmMutationService(prisma).archiveOwner({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, req.params.ownerId);

    if (archived.status === "not_found") {
      return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found" } });
    }

    if (archived.status === "blocked") {
      return res.status(409).json({
        ok: false,
        error: {
          code: "OWNER_DELETE_BLOCKED",
          message: "Owner still has active properties or cases linked and cannot be archived",
        },
      });
    }

    return res.json({ ok: true, data: archived.data });
  });

  router.get("/properties", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const items = await new ImobCrmRepository(prisma).listProperties({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    });

    return res.json({ ok: true, data: { items } });
  });

  router.post("/properties", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const parsed = schemas.imobPropertyCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const created = await new ImobCrmMutationService(prisma).createProperty({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, parsed.data);
    if (created.status === "owner_not_found") {
      return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found for property" } });
    }

    return res.status(201).json({ ok: true, data: created.data });
  });

  router.get("/properties/:propertyId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const item = await new ImobCrmRepository(prisma).getProperty({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, req.params.propertyId);

    if (!item) {
      return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found" } });
    }

    return res.json({ ok: true, data: item });
  });

  router.patch("/properties/:propertyId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const parsed = schemas.imobPropertyUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const updated = await new ImobCrmMutationService(prisma).updateProperty({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, req.params.propertyId, parsed.data);
    if (updated.status === "not_found") {
      return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found" } });
    }
    if (updated.status === "owner_not_found") {
      return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found for property" } });
    }

    return res.json({ ok: true, data: updated.data });
  });

  router.delete("/properties/:propertyId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const archived = await new ImobCrmMutationService(prisma).archiveProperty({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, req.params.propertyId);

    if (archived.status === "not_found") {
      return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found" } });
    }

    if (archived.status === "blocked") {
      return res.status(409).json({
        ok: false,
        error: {
          code: "PROPERTY_DELETE_BLOCKED",
          message: "Property still has active cases linked and cannot be archived",
        },
      });
    }

    return res.json({ ok: true, data: archived.data });
  });

  router.get("/leads", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const items = await new ImobCrmRepository(prisma).listLeads({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    });

    return res.json({ ok: true, data: { items } });
  });

  router.post("/leads", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const parsed = schemas.imobLeadCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const created = await new ImobCrmMutationService(prisma).createLead({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, parsed.data);

    return res.status(201).json({ ok: true, data: created });
  });

  router.get("/leads/:leadId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const item = await new ImobCrmRepository(prisma).getLead({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, req.params.leadId);

    if (!item) {
      return res.status(404).json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "Lead not found" } });
    }

    return res.json({ ok: true, data: item });
  });

  router.patch("/leads/:leadId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const parsed = schemas.imobLeadUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const updated = await new ImobCrmMutationService(prisma).updateLead({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, req.params.leadId, parsed.data);
    if (!updated) {
      return res.status(404).json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "Lead not found" } });
    }

    return res.json({ ok: true, data: updated });
  });

  router.get("/cases", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const flow = typeof req.query.flow === "string" ? req.query.flow.trim() : null;
    const status = typeof req.query.status === "string" ? req.query.status.trim() : null;

    const items = await new ImobCrmRepository(prisma).listCases({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, { flow, status });

    const filteredItems = items.filter((item) => canWorkspaceOperateImobStage(workspaceAccess.permissions, item.stage));

    return res.json({ ok: true, data: { items: filteredItems.map((item) => withImobCanonicalCase(item)) } });
  });

  router.get("/control/priority-queue", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 20;
    const items = await new ImobCrmRepository(prisma).listCases({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, {});
    const filteredItems = items.filter((item) => canWorkspaceOperateImobStage(workspaceAccess.permissions, item.stage));
    const queue = buildImobPriorityQueue(filteredItems.map(buildImobControlSurfaceFromCaseRecord)).slice(0, limit);

    return res.json({
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        items: queue,
      },
    });
  });

  router.get("/control/waiting-on-board", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const items = await new ImobCrmRepository(prisma).listCases({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, {});
    const filteredItems = items.filter((item) => canWorkspaceOperateImobStage(workspaceAccess.permissions, item.stage));
    const board = buildImobWaitingOnBoard(filteredItems.map(buildImobControlSurfaceFromCaseRecord));

    return res.json({
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        items: board,
      },
    });
  });

  router.get("/control/bottleneck-heatmap", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const items = await new ImobCrmRepository(prisma).listCases({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, {});
    const filteredItems = items.filter((item) => canWorkspaceOperateImobStage(workspaceAccess.permissions, item.stage));
    const heatmap = buildImobBottleneckHeatmap(filteredItems.map(buildImobControlSurfaceFromCaseRecord));

    return res.json({
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        items: heatmap,
      },
    });
  });

  router.get("/control/executive-summary", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const items = await new ImobCrmRepository(prisma).listCases({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, {});
    const filteredItems = items.filter((item) => canWorkspaceOperateImobStage(workspaceAccess.permissions, item.stage));
    const surfaces = filteredItems.map(buildImobControlSurfaceFromCaseRecord);
    const recentEvents = await new ImobCrmRepository(prisma).listCaseEvents(
      {
        tenantId: authContext.tenantId,
        workspaceId: authContext.workspaceId,
      },
      {
        caseIds: filteredItems.map((item) => item.id),
        type: "case.followup.sla.triggered",
        take: 500,
      },
    );

    const recentTriggeredCaseIds = new Set(
      recentEvents
        .map((item) => (typeof item.caseId === "string" && item.caseId.trim().length > 0 ? item.caseId : null))
        .filter((value): value is string => Boolean(value)),
    );

    return res.json({
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        specialistLoad: buildImobSpecialistLoadBoard(surfaces),
        rescueIndex: buildImobRescueIndex({ items: surfaces, recentTriggeredCaseIds }),
      },
    });
  });

  router.get("/control/approval-context", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const limitRaw = Number(req.query.limit ?? 12);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 12;

    const items = await new ImobCrmRepository(prisma).listCases({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, {});
    const filteredItems = items.filter((item) => canWorkspaceOperateImobStage(workspaceAccess.permissions, item.stage));
    const surfaces = filteredItems.map(buildImobControlSurfaceFromCaseRecord);

    const caseIds = filteredItems.map((item) => item.id);
    const events = caseIds.length > 0
      ? await new ImobCrmRepository(prisma).listCaseEvents(
          {
            tenantId: authContext.tenantId,
            workspaceId: authContext.workspaceId,
          },
          {
            caseIds,
            take: 1000,
          },
        )
      : [];

    const evidenceCountByCaseId = new Map<string, number>();
    for (const event of events) {
      const caseId = typeof event.caseId === "string" && event.caseId.trim().length > 0 ? event.caseId : null;
      const evidenceRef = typeof event.evidenceRef === "string" && event.evidenceRef.trim().length > 0 ? event.evidenceRef : null;
      if (!caseId || !evidenceRef) continue;
      evidenceCountByCaseId.set(caseId, (evidenceCountByCaseId.get(caseId) ?? 0) + 1);
    }

    const approvalContext = buildImobApprovalContextResponse({
      items: surfaces,
      evidenceCountByCaseId,
      limit,
    });

    await recordImobApprovalContextPresentedTelemetry({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: telemetryAgentId,
      items: approvalContext.items as Array<Record<string, unknown>>,
      limit,
    });

    return res.json({
      ok: true,
      data: {
        generatedAt: new Date().toISOString(),
        ...approvalContext,
      },
    });
  });

  router.post("/control/approval-actions", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const parsed = schemas.imobApprovalActionSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const scope = { tenantId: authContext.tenantId, workspaceId: authContext.workspaceId };
    const record = await new ImobCrmRepository(prisma).getCase(scope, parsed.data.caseId);
    if (!record) {
      return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
    }
    if (!ensureImobStagePermission(res, workspaceAccess.permissions, record.stage, `Sua função atual não pode operar a etapa ${record.stage} neste workspace.`)) {
      return;
    }

    const surface = buildImobControlSurfaceFromCaseRecord(record);
    const matchingSpecialist = surface.specialists.find((item) =>
      item.reasonCode === parsed.data.reasonCode &&
      (!parsed.data.specialistId || item.specialistId === parsed.data.specialistId)
    );
    if (!matchingSpecialist) {
      return res.status(422).json({
        ok: false,
        error: {
          code: "APPROVAL_REASON_NOT_ACTIVE",
          message: "Reason code/specialist is not active for the selected case",
        },
      });
    }

    const reasonSpec = IMOB_REASON_CODE_CATALOG[parsed.data.reasonCode];
    if (parsed.data.action === "approve" && !reasonSpec.requiresApproval) {
      return res.status(422).json({
        ok: false,
        error: {
          code: "APPROVAL_NOT_REQUIRED",
          message: "This reason code does not require approval",
        },
      });
    }

    const evidenceRefs = Array.from(
      new Set([
        ...(parsed.data.evidenceRef ? [parsed.data.evidenceRef] : []),
        ...(Array.isArray(parsed.data.evidenceRefs) ? parsed.data.evidenceRefs : []),
      ].filter((item): item is string => typeof item === "string" && item.trim().length > 0)),
    );

    const existingEvidenceCount = Array.isArray(record.events)
      ? record.events.filter((event) => typeof event.evidenceRef === "string" && event.evidenceRef.trim().length > 0).length
      : 0;
    const hasEvidence = evidenceRefs.length > 0 || existingEvidenceCount > 0;

    if (reasonSpec.requiresEvidence && !hasEvidence) {
      return res.status(422).json({
        ok: false,
        error: {
          code: "EVIDENCE_REQUIRED",
          message: "Evidence is required for this reason code before approval actions",
          reasonCode: parsed.data.reasonCode,
        },
      });
    }

    const currentMetadata = asObject(record.metadata) ?? {};
    const currentApprovalState = asObject(currentMetadata.approvalContext) ?? {};
    const currentHistory = asStringList((currentApprovalState as Record<string, unknown>).history);
    const nowIso = new Date().toISOString();

    const actionStatus =
      parsed.data.action === "approve"
        ? "approved"
        : parsed.data.action === "delegate"
          ? "delegated"
          : "escalated";

    const actionLabel =
      parsed.data.action === "approve"
        ? "approved"
        : parsed.data.action === "delegate"
          ? "delegated"
          : "escalated";

    const historyLine = `${nowIso} ${actionLabel} by ${authContext.userId ?? "system"} reason=${parsed.data.reasonCode} specialist=${matchingSpecialist.specialistId}`;
    const nextHistory = [...currentHistory, historyLine].slice(-50);

    const nextApprovalContext = {
      status: actionStatus,
      action: parsed.data.action,
      reasonCode: parsed.data.reasonCode,
      reasonLabel: reasonSpec.label,
      specialistId: parsed.data.specialistId ?? matchingSpecialist.specialistId,
      delegatedTo: parsed.data.delegatedTo ?? null,
      escalationTarget: parsed.data.escalationTarget ?? null,
      note: parsed.data.note ?? null,
      requiresApproval: reasonSpec.requiresApproval,
      requiresEvidence: reasonSpec.requiresEvidence,
      evidenceRefs,
      evidenceCount: existingEvidenceCount + evidenceRefs.length,
      updatedAt: nowIso,
      updatedByUserId: authContext.userId ?? null,
      history: nextHistory,
    };

    const eventType = `case.approval.${parsed.data.action}`;
    const eventSummary =
      parsed.data.action === "approve"
        ? `Aprovação registrada para ${reasonSpec.label}`
        : parsed.data.action === "delegate"
          ? `Delegação registrada para ${reasonSpec.label}`
          : `Escalonamento registrado para ${reasonSpec.label}`;

    const updated = await new ImobCrmMutationService(prisma).updateCase({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, record.id, {
      metadata: {
        ...currentMetadata,
        approvalContext: nextApprovalContext,
      },
      eventType,
      eventSummary,
      eventPayload: {
        action: parsed.data.action,
        reasonCode: parsed.data.reasonCode,
        reasonLabel: reasonSpec.label,
        specialistId: matchingSpecialist.specialistId,
        requiresApproval: reasonSpec.requiresApproval,
        requiresEvidence: reasonSpec.requiresEvidence,
        delegatedTo: parsed.data.delegatedTo ?? null,
        escalationTarget: parsed.data.escalationTarget ?? null,
        note: parsed.data.note ?? null,
        evidenceRefs,
        existingEvidenceCount,
        previousApprovalContext: currentApprovalState,
        nextApprovalContext,
      },
      eventRunId: parsed.data.runId ?? null,
      eventEvidenceRef: evidenceRefs[0] ?? null,
      eventActorType: authContext.userId ? "user" : "system",
      eventActorRef: authContext.userId ?? null,
    });

    if (updated.status === "not_found") return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
    if (updated.status === "owner_not_found") return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found for case" } });
    if (updated.status === "property_not_found") return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found for case" } });
    if (updated.status === "lead_not_found") return res.status(404).json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "Lead not found for case" } });

    await recordImobApprovalActionCompletedTelemetry({
      prisma,
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      agentId: telemetryAgentId,
      action: parsed.data.action,
      caseId: record.id,
      stage: record.stage,
      reasonCode: parsed.data.reasonCode,
      specialistId: matchingSpecialist.specialistId,
      requiresApproval: reasonSpec.requiresApproval,
      requiresEvidence: reasonSpec.requiresEvidence,
    });

    return res.json({
      ok: true,
      data: {
        action: parsed.data.action,
        reasonCode: parsed.data.reasonCode,
        specialistId: matchingSpecialist.specialistId,
        requiresApproval: reasonSpec.requiresApproval,
        requiresEvidence: reasonSpec.requiresEvidence,
        evidenceRefs,
        case: withImobCanonicalCase(updated.data),
      },
    });
  });

  router.post("/cases", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const parsed = schemas.imobCaseCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }
    if (!ensureImobStagePermission(res, workspaceAccess.permissions, parsed.data.stage, `Sua função atual não pode operar a etapa ${parsed.data.stage} neste workspace.`)) {
      return;
    }

    const created = await new ImobCrmMutationService(prisma).createCase({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, parsed.data);
    if (created.status === "owner_not_found") return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found for case" } });
    if (created.status === "property_not_found") return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found for case" } });
    if (created.status === "lead_not_found") return res.status(404).json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "Lead not found for case" } });

    return res.status(201).json({ ok: true, data: withImobCanonicalCase(created.data) });
  });

  router.get("/cases/:caseId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const item = await new ImobCrmRepository(prisma).getCase({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, req.params.caseId);

    if (!item) {
      return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
    }
    if (!ensureImobStagePermission(res, workspaceAccess.permissions, item.stage, `Sua função atual não pode operar a etapa ${item.stage} neste workspace.`)) {
      return;
    }

    return res.json({ ok: true, data: withImobCanonicalCase(item) });
  });

  router.patch("/cases/:caseId", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const existing = await prisma.imobCase.findFirst({
      where: { id: req.params.caseId, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId },
      select: { id: true, flow: true, stage: true, status: true },
    });
    if (!existing) {
      return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
    }

    const parsed = schemas.imobCaseUpdateSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }
    if (!ensureImobStagePermission(res, workspaceAccess.permissions, existing.stage, `Sua função atual não pode operar a etapa ${existing.stage} neste workspace.`)) {
      return;
    }
    if (parsed.data.stage && !ensureImobStagePermission(res, workspaceAccess.permissions, parsed.data.stage, `Sua função atual não pode mover o caso para a etapa ${parsed.data.stage} neste workspace.`)) {
      return;
    }

    const updated = await new ImobCrmMutationService(prisma).updateCase({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, req.params.caseId, parsed.data);
    if (updated.status === "not_found") return res.status(404).json({ ok: false, error: { code: "CASE_NOT_FOUND", message: "Case not found" } });
    if (updated.status === "owner_not_found") return res.status(404).json({ ok: false, error: { code: "OWNER_NOT_FOUND", message: "Owner not found for case" } });
    if (updated.status === "property_not_found") return res.status(404).json({ ok: false, error: { code: "PROPERTY_NOT_FOUND", message: "Property not found for case" } });
    if (updated.status === "lead_not_found") return res.status(404).json({ ok: false, error: { code: "LEAD_NOT_FOUND", message: "Lead not found for case" } });

    return res.json({ ok: true, data: withImobCanonicalCase(updated.data) });
  });

  router.get("/followups/pending", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const onlyOverdue = String(req.query.onlyOverdue ?? "true").trim().toLowerCase() !== "false";
    const limitRaw = Number(req.query.limit ?? 80);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 80;
    const caseId = typeof req.query.caseId === "string" && req.query.caseId.trim().length > 0 ? req.query.caseId.trim() : null;

    const data = await new ImobCrmFollowUpService(prisma).listPending({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, { onlyOverdue, limit, caseId });

    const filteredItems = data.items.filter((item) => canWorkspaceOperateImobStage(workspaceAccess.permissions, item.stage));
    return res.json({
      ok: true,
      data: {
        generatedAt: data.generatedAt,
        totals: {
          items: filteredItems.length,
          overdue: filteredItems.filter((item) => item.isOverdue).length,
          highSeverity: filteredItems.filter((item) => item.severity === "high").length,
        },
        items: filteredItems,
      },
    });
  });

  router.post("/followups/run", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }

    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const parsed = schemas.imobFollowUpRunSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
    }

    const result = await new ImobCrmFollowUpService(prisma).run({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
      userId: authContext.userId ?? null,
    }, {
      dryRun: parsed.data.dryRun ?? false,
      onlyOverdue: parsed.data.onlyOverdue ?? true,
      limit: parsed.data.limit ?? 80,
      caseId: parsed.data.caseId ?? null,
    });

    return res.json({ ok: true, data: result });
  });

  router.get("/kpis/funnel", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }
    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const windowDaysRaw = Number(req.query.windowDays ?? 30);
    const windowDays = Number.isFinite(windowDaysRaw) ? Math.max(1, Math.min(365, windowDaysRaw)) : 30;
    const fromRaw = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const toRaw = typeof req.query.to === "string" ? new Date(req.query.to) : null;
    const from = fromRaw && Number.isFinite(fromRaw.getTime()) ? fromRaw : null;
    const to = toRaw && Number.isFinite(toRaw.getTime()) ? toRaw : null;

    const data = await new ImobCrmKpiService(prisma).buildFunnelKpis({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, { from, to, windowDays });
    return res.json({ ok: true, data });
  });

  router.get("/kpis/performance", async (req, res) => {
    const { authContext, prisma } = req as TenantAwareRequest;
    if (!authContext || !prisma) {
      return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
    }
    const workspaceAccess = await readImobWorkspaceAccessProfile({ prisma, authContext });
    if (!ensureImobWorkspacePermission(res, workspaceAccess.permissions, "imob.chat.use", "Sua função atual não pode usar o IMOB neste workspace.")) {
      return;
    }

    const windowDaysRaw = Number(req.query.windowDays ?? 30);
    const windowDays = Number.isFinite(windowDaysRaw) ? Math.max(1, Math.min(365, windowDaysRaw)) : 30;
    const fromRaw = typeof req.query.from === "string" ? new Date(req.query.from) : null;
    const toRaw = typeof req.query.to === "string" ? new Date(req.query.to) : null;
    const from = fromRaw && Number.isFinite(fromRaw.getTime()) ? fromRaw : null;
    const to = toRaw && Number.isFinite(toRaw.getTime()) ? toRaw : null;

    const data = await new ImobCrmKpiService(prisma).buildPerformanceKpis({
      tenantId: authContext.tenantId,
      workspaceId: authContext.workspaceId,
    }, { from, to, windowDays });
    return res.json({ ok: true, data });
  });
}
