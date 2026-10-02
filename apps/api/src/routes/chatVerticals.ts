import crypto from "node:crypto";
import { z } from "zod";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import {
  buildAndEvaluateVerticalHandoff,
  composeVerticalRegistry,
  projectVerticalRegistryForSurface,
  readVerticalRegistryFacts,
} from "../services/chat/workspaceVerticalRegistry";
import { VERTICAL_CAPABILITY_MODES } from "../types/chatVerticalHandoffV2Contract";
import type { PrismaClient } from "@repo/db";
import {
  activateProductInstallation,
  canUserActivateProducts,
  PRODUCT_ACTIVATION_DENIED,
  verticalNotApprovedError,
} from "../services/products/productActivation";
import { readVerticalAccess } from "../services/products/verticalAccessApproval";

/**
 * Front door (`/app/chat`): verticais ativas do workspace, handoff para uma
 * vertical na mesma conversa (ADR-010, etapas B e C) e ativação da vertical
 * pela conversa (etapa F). Só a confirmação de ativação escreve, e apenas
 * pelo mesmo serviço do Marketplace; nenhuma run.
 */
export const chatVerticalsRouter = createGovernedRouter();
chatVerticalsRouter.use("/chat/vertical-registry", enforceTenant);
chatVerticalsRouter.use("/chat/vertical-handoff", enforceTenant);
chatVerticalsRouter.use("/chat/vertical-activation", enforceTenant);

const handoffRequestSchema = z
  .object({
    verticalId: z.string().trim().min(1).max(80),
    capabilityId: z.string().trim().min(1).max(80),
    mode: z.enum(VERTICAL_CAPABILITY_MODES),
    refs: z
      .object({
        conversationId: z.string().trim().min(1).max(120).optional(),
        threadId: z.string().trim().min(1).max(120).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

async function composeForRequest(req: TenantAwareRequest) {
  const { authContext, prisma } = req;
  if (!authContext || !prisma) return null;
  const facts = await readVerticalRegistryFacts(prisma, {
    tenantId: authContext.tenantId,
    workspaceId: authContext.workspaceId,
    userId: authContext.userId ?? null,
  });
  return composeVerticalRegistry(facts);
}

chatVerticalsRouter.get("/chat/vertical-registry", async (req, res) => {
  const composed = await composeForRequest(req as TenantAwareRequest);
  if (!composed) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }
  return res.json({ ok: true, data: projectVerticalRegistryForSurface(composed.registry) });
});

chatVerticalsRouter.post("/chat/vertical-handoff", async (req, res) => {
  const parsed = handoffRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  const composed = await composeForRequest(req as TenantAwareRequest);
  if (!composed) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }
  const result = buildAndEvaluateVerticalHandoff(composed, parsed.data, `frontdoor-${crypto.randomUUID()}`);
  // Bloqueio é resultado de governança, não erro: a conversa explica e oferece o caminho.
  return res.json({ ok: true, data: result });
});

/** Produtos que a conversa pode ativar (mesmo catálogo do Marketplace). */
const ACTIVATABLE_VERTICALS = { imob: "IMOB" } as const;

const activationPreviewSchema = z.object({ verticalId: z.enum(["imob"]) }).strict();
const activationConfirmSchema = z
  .object({
    verticalId: z.enum(["imob"]),
    /** Versão do registry mostrada na proposta: se o estado mudou, a confirmação não vale. */
    registryVersion: z.string().trim().min(1).max(80),
    /** Confirmação explícita do usuário na conversa (ADR-010). */
    confirmed: z.literal(true),
  })
  .strict();

export const VERTICAL_ACTIVATION_EFFECTS = {
  imob: [
    "instala o IMOB neste workspace (o mesmo que ativar pelo Marketplace)",
    "prepara os agentes do IMOB (EIAH e auditoria do chat)",
    "libera as ações de cadastro de imóvel, qualificação de lead e coleta de documentos",
  ],
} as const;

chatVerticalsRouter.post("/chat/vertical-activation/preview", async (req, res) => {
  const parsed = activationPreviewSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "INVALID_PAYLOAD", details: parsed.error.flatten() } });
  }
  const composed = await composeForRequest(req as TenantAwareRequest);
  if (!composed) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }
  const vertical = composed.registry.verticals.find((entry) => entry.id === parsed.data.verticalId);
  if (vertical?.status === "enabled") {
    return res.json({ ok: true, data: { status: "already_active", verticalId: parsed.data.verticalId, registryVersion: composed.registry.registryVersion } });
  }
  const request = req as TenantAwareRequest;
  // ADR-011 §2.4: primeiro a liberação da EIAH, depois a permissão de ativar.
  const access = request.authContext && request.prisma
    ? await readVerticalAccess({
        prisma: request.prisma as unknown as PrismaClient,
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
        vertical: ACTIVATABLE_VERTICALS[parsed.data.verticalId],
      })
    : null;
  const allowedToActivate = request.authContext && request.prisma
    ? await canUserActivateProducts({
        prisma: request.prisma as unknown as PrismaClient,
        tenantId: request.authContext.tenantId,
        workspaceId: request.authContext.workspaceId,
        userId: request.authContext.userId ?? null,
      })
    : false;
  if (access?.status !== "aprovado") {
    // Pode pedir a liberação pela conversa quem pode ativar, quando não há pedido em análise (ADR-011 §2.4).
    const openRequest = access ? ["pendente", "em_analise", "aguardando_humano"].includes(access.status) : false;
    return res.json({
      ok: true,
      data: {
        status: "approval_required",
        verticalId: parsed.data.verticalId,
        approval: verticalNotApprovedError(access?.status),
        canRequest: allowedToActivate && !openRequest,
      },
    });
  }
  if (!allowedToActivate) {
    return res.json({ ok: true, data: { status: "not_permitted", verticalId: parsed.data.verticalId } });
  }
  return res.json({
    ok: true,
    data: {
      status: "available",
      verticalId: parsed.data.verticalId,
      product: ACTIVATABLE_VERTICALS[parsed.data.verticalId],
      registryVersion: composed.registry.registryVersion,
      effects: VERTICAL_ACTIVATION_EFFECTS[parsed.data.verticalId],
    },
  });
});

chatVerticalsRouter.post("/chat/vertical-activation/confirm", async (req, res) => {
  const parsed = activationConfirmSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    // Sem confirmação explícita (ou payload inválido) nada é ativado.
    return res.status(400).json({ ok: false, error: { code: "ACTIVATION_CONFIRMATION_REQUIRED", details: parsed.error.flatten() } });
  }
  const request = req as TenantAwareRequest;
  const composed = await composeForRequest(request);
  if (!composed || !request.authContext || !request.prisma) {
    return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING", message: "Authentication context missing" } });
  }
  const vertical = composed.registry.verticals.find((entry) => entry.id === parsed.data.verticalId);
  if (vertical?.status === "enabled") {
    return res.json({ ok: true, data: { status: "already_active", verticalId: parsed.data.verticalId, registryVersion: composed.registry.registryVersion } });
  }
  const allowedToActivate = await canUserActivateProducts({
    prisma: request.prisma as unknown as PrismaClient,
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    userId: request.authContext.userId ?? null,
  });
  if (!allowedToActivate) {
    return res.status(403).json({ ok: false, error: PRODUCT_ACTIVATION_DENIED });
  }
  if (composed.registry.registryVersion !== parsed.data.registryVersion) {
    return res.status(409).json({
      ok: false,
      error: { code: "ACTIVATION_PROPOSAL_STALE", message: "O estado do workspace mudou desde a proposta; confirme de novo." },
    });
  }
  const activation = await activateProductInstallation({
    prisma: request.prisma as unknown as PrismaClient,
    tenantId: request.authContext.tenantId,
    workspaceId: request.authContext.workspaceId,
    userId: request.authContext.userId ?? null,
    product: ACTIVATABLE_VERTICALS[parsed.data.verticalId],
  });
  if (!activation.ok && activation.code === "VERTICAL_NOT_APPROVED") {
    return res.status(403).json({ ok: false, error: verticalNotApprovedError(activation.accessStatus) });
  }
  if (!activation.ok) {
    if (activation.code === "WORKSPACE_AGENT_PROVISIONING_FAILED") {
      request.logger?.error({ error: activation.error, verticalId: parsed.data.verticalId }, "chat.vertical_activation_provisioning_failed");
    }
    return res.status(500).json({ ok: false, error: { code: activation.code, message: "A ativação não foi aplicada." } });
  }
  const after = await composeForRequest(request);
  return res.json({
    ok: true,
    data: {
      status: "activated",
      verticalId: parsed.data.verticalId,
      registryVersion: after?.registry.registryVersion ?? null,
      releasedRoutes: activation.releasedRoutes,
    },
  });
});
