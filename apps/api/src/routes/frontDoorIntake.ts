import type { PrismaClient } from "@repo/db";
import { createGovernedRouter } from "../middlewares/asyncHandler";
import { enforceTenant, type TenantAwareRequest } from "../middlewares/enforceTenant";
import { executeLlmStep } from "../orchestrator/llmExecutor";
import { getAgentProfile } from "../services/agents";
import { readFrontDoorBilling } from "../services/frontDoorBilling";
import {
  frontDoorEvaluationIntakeRequestSchema,
  frontDoorIntakeRequestSchema,
  interpretEvaluationTurn,
  interpretFrontDoorQuestion,
  type FrontDoorEvaluationIntakeDeps,
  type FrontDoorIntakeDeps,
} from "../services/frontDoorIntake";
import { canUserActivateProducts } from "../services/products/productActivation";
import { isEvaluationOfferEnabled, resolveEvaluationOfferState } from "../services/products/verticalEvaluationContract";

/**
 * Intake contextual do Front Door na escolha de plano (ADR-011 §2.8). A rota só INTERPRETA a pergunta pelo runtime central de
 * providers e responde com dados do catálogo da sessão; não escolhe plano, não cria conta, não paga e não ativa nada.
 * Sem permissão de billing, nem chama o provider.
 */
export const frontDoorIntakeRouter = createGovernedRouter();
frontDoorIntakeRouter.use("/front-door/intake", enforceTenant);

/** Agente dono do Front Door: o intake usa o mesmo provider/modelo do agente EIAH (runtime central), sem fetch direto. */
const FRONT_DOOR_AGENT = "EIAH";

frontDoorIntakeRouter.post("/front-door/intake", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  const userId = authContext?.userId;
  if (!authContext || !prisma || !userId) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  const parsed = frontDoorIntakeRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "FRONT_DOOR_INTAKE_INVALID_REQUEST", details: parsed.error.flatten() } });
  }
  const scope = { prisma: prisma as unknown as PrismaClient, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, userId };
  const deps: FrontDoorIntakeDeps = {
    readCatalog: async () => {
      const state = await readFrontDoorBilling(scope);
      // Tudo daqui vem da sessão autorizada (nunca do corpo da requisição): permissão, estado da conta e catálogo.
      return { canManage: state.canManage, accountActive: state.accountActive, firstPaymentDone: Boolean(state.firstPayment), paymentMode: state.paymentMode, plans: state.plans };
    },
    interpret: async ({ systemPrompt, userPrompt }) => {
      const profile = await getAgentProfile(scope.tenantId, scope.workspaceId, FRONT_DOOR_AGENT, scope.prisma);
      if (!profile) throw new Error("front_door_agent_unavailable");
      const result = await executeLlmStep({
        profile: {
          model: profile.model,
          maxTokens: 200,
          systemPrompt,
          knowledgePolicy: { llmUsageMode: "open_reasoning_restricted", maskingPolicy: "conditional" },
        },
        userPrompt,
        metadata: { source: "front-door-intake", maskSensitiveBeforeLlm: true },
      });
      return result.outputText;
    },
  };
  const result = await interpretFrontDoorQuestion(parsed.data, deps);
  // Só desfecho e intenção entram no log (nunca o texto da pergunta).
  (req as { logger?: { info: (obj: object, msg: string) => void } }).logger?.info(
    { outcome: result.outcome, intent: result.interpretation?.intent ?? null, topic: result.interpretation?.topic ?? null, step: parsed.data.context.step },
    "front_door.intake.resolved",
  );
  return res.status(200).json({ ok: true, data: result });
});

/**
 * Qualificação do pedido de avaliação (mesmo intake central e mesmo provider do agente EIAH). Só interpreta e estrutura o interesse:
 * não envia o pedido, não aprova, não ativa, não cobra e não altera permissão. Autorização e oferta vêm da sessão e da configuração do
 * servidor (nunca do corpo); sem permissão ou sem oferta habilitada, nem chama o provider.
 */
frontDoorIntakeRouter.post("/front-door/intake/evaluation", async (req, res) => {
  const { authContext, prisma } = req as TenantAwareRequest;
  const userId = authContext?.userId;
  if (!authContext || !prisma || !userId) return res.status(500).json({ ok: false, error: { code: "AUTH_CONTEXT_MISSING" } });
  const parsed = frontDoorEvaluationIntakeRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ ok: false, error: { code: "FRONT_DOOR_EVALUATION_INTAKE_INVALID_REQUEST", details: parsed.error.flatten() } });
  }
  const scope = { prisma: prisma as unknown as PrismaClient, tenantId: authContext.tenantId, workspaceId: authContext.workspaceId, userId };
  const deps: FrontDoorEvaluationIntakeDeps = {
    readEligibility: async () => ({
      canManage: await canUserActivateProducts({ prisma: scope.prisma, tenantId: scope.tenantId, workspaceId: scope.workspaceId, userId }),
      offerEnabled: isEvaluationOfferEnabled(resolveEvaluationOfferState()),
    }),
    interpret: async ({ systemPrompt, userPrompt }) => {
      const profile = await getAgentProfile(scope.tenantId, scope.workspaceId, FRONT_DOOR_AGENT, scope.prisma);
      if (!profile) throw new Error("front_door_agent_unavailable");
      const result = await executeLlmStep({
        profile: {
          model: profile.model,
          maxTokens: 300,
          systemPrompt,
          knowledgePolicy: { llmUsageMode: "open_reasoning_restricted", maskingPolicy: "conditional" },
        },
        userPrompt,
        metadata: { source: "front-door-evaluation-intake", maskSensitiveBeforeLlm: true },
      });
      return result.outputText;
    },
  };
  const result = await interpretEvaluationTurn(parsed.data, deps);
  // Só desfecho, etapa e campos faltantes entram no log (nunca o texto da mensagem nem o conteúdo do rascunho).
  (req as { logger?: { info: (obj: object, msg: string) => void } }).logger?.info(
    { outcome: result.outcome, stage: parsed.data.stage, missing: result.missing },
    "front_door.evaluation_intake.resolved",
  );
  return res.status(200).json({ ok: true, data: result });
});
