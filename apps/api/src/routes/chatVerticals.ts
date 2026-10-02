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

/**
 * Front door (`/app/chat`): verticais ativas do workspace e handoff para uma
 * vertical na mesma conversa (ADR-010, etapas B e C). Leitura e avaliação
 * apenas: nenhuma escrita, nenhuma run.
 */
export const chatVerticalsRouter = createGovernedRouter();
chatVerticalsRouter.use("/chat/vertical-registry", enforceTenant);
chatVerticalsRouter.use("/chat/vertical-handoff", enforceTenant);

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
