import { apiFrontDoorIntake, type FrontDoorIntakeResult } from "@/lib/api";
import { CHANGE_SUBJECT_REPLY, type ActivationPending, type FrontDoorBillingSnapshot, type InterpretableBillingSnapshot } from "./frontDoorBillingEngine";
import type { ActivatableVerticalId, VerticalActivationSnapshot } from "./verticalActivationEngine";

/**
 * Intake contextual do Front Door durante a escolha de plano. O engine só encadeia: manda a pergunta livre e o contexto estruturado
 * (vertical, etapa, plano em confirmação) à API, que interpreta pelo runtime central de providers e responde com dados do catálogo
 * autorizado. Nada aqui interpreta texto, escolhe plano, cria conta, paga ou ativa: a consulta nunca tem efeito.
 * O estado comercial é preservado (mesma etapa, mais o botão explícito de mudar de assunto) até a pessoa sair ou seguir pelos botões.
 */
/** Etapa pendente interpretável: billing (intro … request_offer) ou ativação SEM cartão de billing (proposta de ativação / pedido de liberação). */
export type InterpretablePending = InterpretableBillingSnapshot | ActivationPending;
export type FrontDoorIntakeRequest = { message: string; pending: InterpretablePending };

type IntakeApi = (body: Parameters<typeof apiFrontDoorIntake>[0], signal?: AbortSignal) => Promise<{ data: FrontDoorIntakeResult }>;

type DecisionWithIntake = {
  content?: string;
  resolvedQuickReplies?: string[];
  frontDoorIntakeRequest?: FrontDoorIntakeRequest;
  frontDoorBilling?: FrontDoorBillingSnapshot;
  verticalActivation?: VerticalActivationSnapshot;
};

/** Mais que o limite do servidor (20 s): o servidor tem a chance de responder o desfecho explícito antes do cliente desistir. */
export const FRONT_DOOR_INTAKE_CLIENT_TIMEOUT_MS = 30_000;

const UNAVAILABLE =
  "Não consegui interpretar sua pergunta agora. Nada foi alterado e eu não vou supor condições comerciais. Você pode tentar de novo ou continuar pelos botões.";
const TIMEOUT =
  "A interpretação da sua pergunta demorou mais que o limite. Nada foi alterado e eu não vou supor condições comerciais. Você pode tentar de novo ou continuar pelos botões.";

const verticalOf = (pending: InterpretablePending): ActivatableVerticalId => pending.verticalId ?? "imob";
/** Etapa enviada ao intake: o pedido de liberação sem cartão de billing é o mesmo `request_offer` do billing. */
const stepOf = (pending: InterpretablePending) =>
  pending.status === "activation_proposed" ? "activation_proposed" : pending.status === "activation_request_offer" ? "request_offer" : pending.status;

async function interpret(request: FrontDoorIntakeRequest, api: IntakeApi, timeoutMs: number): Promise<FrontDoorIntakeResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const { pending } = request;
    const response = await api(
      {
        message: request.message,
        context: {
          verticalId: verticalOf(pending),
          step: stepOf(pending),
          ...(pending.status === "confirm_account" ? { planLabel: pending.plan.label } : {}),
        },
      },
      controller.signal,
    );
    return response.data;
  } catch {
    return { outcome: controller.signal.aborted ? "timeout" : "unavailable", content: controller.signal.aborted ? TIMEOUT : UNAVAILABLE, endsContext: false };
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichLauncherDecisionWithFrontDoorIntake<D extends DecisionWithIntake>(
  decision: D | null,
  api: IntakeApi = apiFrontDoorIntake,
  timeoutMs = FRONT_DOOR_INTAKE_CLIENT_TIMEOUT_MS,
  // O contrato reflete o que a função devolve: a decisão original MAIS o conteúdo, o estado de billing e a ativação resolvidos pelo intake.
): Promise<(D & DecisionWithIntake) | null> {
  if (!decision?.frontDoorIntakeRequest) return decision;
  const { pending } = decision.frontDoorIntakeRequest;
  const result = await interpret(decision.frontDoorIntakeRequest, api, timeoutMs);
  const vertical = verticalOf(pending);
  const tag = pending.verticalId ? { verticalId: pending.verticalId } : {};
  if (result.endsContext) {
    // Saída explícita encerra a etapa (billing ou ativação): nada fica pendente e nada foi criado, contratado, pago ou ativado.
    return { ...decision, content: result.content, resolvedQuickReplies: [], frontDoorBilling: { status: "closed", ...tag }, verticalActivation: undefined };
  }
  if (pending.status === "activation_proposed" || pending.status === "activation_request_offer") {
    // Ativação sem cartão de billing: preserva a mesma proposta e as MESMAS ações (chips) que ela já oferecia, mais a saída explícita.
    return {
      ...decision,
      content: result.content,
      resolvedQuickReplies: [...pending.quickReplies.filter((reply) => reply !== CHANGE_SUBJECT_REPLY), CHANGE_SUBJECT_REPLY],
      frontDoorBilling: undefined,
      verticalActivation: pending.activation,
    };
  }
  return {
    ...decision,
    content: result.content,
    resolvedQuickReplies: [],
    // Qualquer outro desfecho preserva a MESMA etapa de billing e oferece o botão de mudar de assunto.
    frontDoorBilling: { ...pending, offerLeave: true },
    verticalActivation: { status: "access_request_proposed", verticalId: vertical },
  };
}
