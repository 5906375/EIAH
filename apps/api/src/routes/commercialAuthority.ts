import { z } from "zod";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { revokeAgentEnablementAs } from "../services/agentEnablement";
import {
  AUTHORITY_ROLES,
  DELEGATION_SCOPES,
  grantCommercialAuthority,
  listCommercialDesignations,
  readCommercialAuthorityStatus,
  revokeCommercialAuthority,
  type AuthorityFailure,
} from "../services/commercialAuthority";

/**
 * Designação comercial (AUTHZ-SCOPE-1): conceder, revogar e consultar a autoridade `marketplace.subscribe`.
 *
 * Montado em prefixo ESTREITO exclusivo (`/api/commercial-authority`): o `enforceTenant` do router não alcança
 * as demais rotas. Tenant e workspace vêm SEMPRE do token; corpos com campos extras (inclusive tenantId/workspaceId)
 * são recusados. Não cria contratação, assinatura, política nem delegação, e não faz bootstrap da primeira autoridade.
 */
export const commercialAuthorityRouter = createGovernedRouter();
commercialAuthorityRouter.use(enforceTenant);

const GrantSchema = z.object({
  decision: z.literal("grant"),
  beneficiaryUserId: z.string().min(1).max(128),
  role: z.enum(AUTHORITY_ROLES).default("holder"),
  limits: z.object({
    allowedScopes: z.array(z.enum(DELEGATION_SCOPES)).min(1).max(3).optional(),
    maxValidityDays: z.number().int().min(1).max(365).optional(),
  }).strict().optional(),
  validUntil: z.string().datetime(),
  evidenceRef: z.string().min(3).max(120),
}).strict();

const RevokeSchema = z.object({
  decision: z.literal("revoke"),
  reason: z.string().min(3).max(300),
  evidenceRef: z.string().min(3).max(120),
  cascade: z.boolean().optional(),
}).strict();

function sendFailure(res: import("express").Response, failure: AuthorityFailure) {
  return res.status(failure.status).json({
    ok: false,
    error: { code: failure.code, message: failure.message, ...(failure.bootstrap ? { bootstrap: failure.bootstrap } : {}) },
  });
}

function context(req: TenantAwareRequest) {
  const auth = req.authContext;
  if (!auth || !req.prisma) return null;
  return { auth, prisma: req.prisma };
}

commercialAuthorityRouter.get("/status", async (req, res) => {
  const ctx = context(req as TenantAwareRequest);
  if (!ctx) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  const status = await readCommercialAuthorityStatus(ctx.prisma, { tenantId: ctx.auth.tenantId, workspaceId: ctx.auth.workspaceId, userId: ctx.auth.userId });
  res.set("Cache-Control", "no-store");
  if (!status.ok) return sendFailure(res, { ok: false, status: status.status, code: status.code, message: status.message });
  return res.json({ ok: true, holder: status.holder, grantor: status.grantor, bootstrap: status.bootstrap });
});

commercialAuthorityRouter.get("/designations", async (req, res) => {
  const ctx = context(req as TenantAwareRequest);
  if (!ctx) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  const listed = await listCommercialDesignations(ctx.prisma, { tenantId: ctx.auth.tenantId, workspaceId: ctx.auth.workspaceId, userId: ctx.auth.userId });
  res.set("Cache-Control", "no-store");
  if (!listed.ok) return sendFailure(res, listed);
  return res.json({ ok: true, designations: listed.designations });
});

commercialAuthorityRouter.post("/designations", async (req, res) => {
  const ctx = context(req as TenantAwareRequest);
  if (!ctx) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  const parsed = GrantSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  const result = await grantCommercialAuthority(ctx.prisma, {
    tenantId: ctx.auth.tenantId,
    workspaceId: ctx.auth.workspaceId,
    actorUserId: ctx.auth.userId,
    actorTokenId: ctx.auth.tokenId,
    beneficiaryUserId: parsed.data.beneficiaryUserId,
    role: parsed.data.role,
    limits: parsed.data.limits,
    validUntil: parsed.data.validUntil,
    evidenceRef: parsed.data.evidenceRef,
    decision: parsed.data.decision,
  });
  if (!result.ok) return sendFailure(res, result);
  return res.status(201).json({ ok: true, designation: result.designation });
});

commercialAuthorityRouter.post("/designations/:id/revoke", async (req, res) => {
  const ctx = context(req as TenantAwareRequest);
  if (!ctx) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  const parsed = RevokeSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  const result = await revokeCommercialAuthority(ctx.prisma, {
    tenantId: ctx.auth.tenantId,
    workspaceId: ctx.auth.workspaceId,
    actorUserId: ctx.auth.userId,
    actorTokenId: ctx.auth.tokenId,
    designationId: String(req.params.id),
    reason: parsed.data.reason,
    evidenceRef: parsed.data.evidenceRef,
    cascade: parsed.data.cascade,
  });
  if (!result.ok) return sendFailure(res, result);
  return res.json({ ok: true, revokedIds: result.revokedIds });
});

const RevokeEnablementSchema = z.object({
  decision: z.literal("revoke"),
  reason: z.string().min(3).max(300),
  evidenceRef: z.string().min(3).max(120),
}).strict();

/** Desfaz a habilitação comercial de um agente governado: nova contratação exige nova decisão. */
commercialAuthorityRouter.post("/enablements/:id/revoke", async (req, res) => {
  const ctx = context(req as TenantAwareRequest);
  if (!ctx) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  const parsed = RevokeEnablementSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  const result = await revokeAgentEnablementAs(ctx.prisma, {
    tenantId: ctx.auth.tenantId,
    workspaceId: ctx.auth.workspaceId,
    actorUserId: ctx.auth.userId,
    actorTokenId: ctx.auth.tokenId,
    enablementId: String(req.params.id),
    reason: parsed.data.reason,
    evidenceRef: parsed.data.evidenceRef,
  });
  if (!result.ok) return res.status(result.status).json({ ok: false, error: { code: result.code, message: result.message } });
  return res.json({ ok: true, enablementId: result.enablementId });
});
