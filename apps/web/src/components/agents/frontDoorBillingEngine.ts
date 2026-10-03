import {
  ApiError,
  apiCreateFrontDoorBillingAccount,
  apiGetFrontDoorBilling,
  apiPayFrontDoorFirstMonth,
  type FrontDoorBillingPlan,
  type FrontDoorBillingPlanCode,
  type FrontDoorBillingState,
} from "@/lib/api";
import type { ApprovalCardRow } from "./verticalApprovalChatEngine";
import { ACCESS_REQUEST_CANCEL_REPLY, ACCESS_REQUEST_CONFIRM_REPLY, type VerticalActivationSnapshot } from "./verticalActivationEngine";

/**
 * ADR-011 §2.8: conta de billing e primeira mensalidade pela conversa do front door, antes do pedido de liberação.
 * A conversa vai em etapas, uma pergunta por vez:
 *   1) explica a liberação e pergunta se quer criar a conta de billing (ou pedir sem conta);
 *   2) mostra os planos atuais; 3) confirma o plano escolhido antes de criar;
 *   4) pergunta se quer pagar a primeira mensalidade (simulado, sem cobrança real);
 *   5) pergunta se pode enviar o pedido de liberação (mesma confirmação do engine de ativação).
 * A conta não é obrigatória. O launcher só encadeia e renderiza os botões.
 */

export type FrontDoorBillingPlanOption = Pick<FrontDoorBillingPlan, "code" | "label" | "monthlyPriceCents" | "includedUsers" | "includedRuns">;

export type FrontDoorBillingSnapshot =
  | { status: "intro"; plans: FrontDoorBillingPlanOption[] }
  | { status: "offer"; plans: FrontDoorBillingPlanOption[] }
  | { status: "confirm_account"; plan: FrontDoorBillingPlanOption; plans?: FrontDoorBillingPlanOption[] }
  | { status: "pay_offer"; planLabel: string; monthlyPriceCents: number }
  | { status: "request_offer" };

export type FrontDoorBillingRequest =
  | { step: "show_plans"; plans: FrontDoorBillingPlanOption[] }
  | { step: "choose"; plan: FrontDoorBillingPlanOption; plans: FrontDoorBillingPlanOption[] }
  | { step: "create"; plan: FrontDoorBillingPlanOption }
  | { step: "pay"; planLabel: string; monthlyPriceCents: number }
  | { step: "pay_later" };

export const formatBrl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

export const START_ACCOUNT_REPLY = "Sim, quero criar a conta de billing";
export const OTHER_PLANS_REPLY = "Ver outros planos";
export const PAY_LATER_REPLY = "Pagar depois";
export const chooseReply = (plan: Pick<FrontDoorBillingPlanOption, "label">) => `Quero o plano ${plan.label}`;
export const createReply = (plan: Pick<FrontDoorBillingPlanOption, "label">) => `Criar a conta no plano ${plan.label}`;
export const payReply = (monthlyPriceCents: number) => `Pagar ${formatBrl(monthlyPriceCents)} (simulado)`;

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Passo do turno a partir do texto e da pergunta pendente; só vale logo depois dela (nada de "sim" solto). */
export function resolveFrontDoorBillingStep(
  input: string,
  pending: FrontDoorBillingSnapshot | null | undefined,
): FrontDoorBillingRequest | null {
  const text = normalize(input);
  if (pending?.status === "intro") {
    return text === normalize(START_ACCOUNT_REPLY) ? { step: "show_plans", plans: pending.plans } : null;
  }
  if (pending?.status === "offer") {
    const plan = pending.plans.find((option) => normalize(chooseReply(option)) === text);
    return plan ? { step: "choose", plan, plans: pending.plans } : null;
  }
  if (pending?.status === "confirm_account") {
    if (text === normalize(createReply(pending.plan))) return { step: "create", plan: pending.plan };
    if (text === normalize(OTHER_PLANS_REPLY) && pending.plans?.length) return { step: "show_plans", plans: pending.plans };
    return null;
  }
  if (pending?.status === "pay_offer") {
    if (text === normalize(payReply(pending.monthlyPriceCents))) {
      return { step: "pay", planLabel: pending.planLabel, monthlyPriceCents: pending.monthlyPriceCents };
    }
    if (text === normalize(PAY_LATER_REPLY)) return { step: "pay_later" };
  }
  return null;
}

/** Linha só com botões: a pergunta já está no texto da mensagem. */
const buttons = (...actions: ApprovalCardRow["actions"]): ApprovalCardRow => ({ actions });

const requestButtons = (requestLabel = ACCESS_REQUEST_CONFIRM_REPLY) =>
  buttons(
    { label: requestLabel, reply: ACCESS_REQUEST_CONFIRM_REPLY, tone: "approve" },
    { label: ACCESS_REQUEST_CANCEL_REPLY, reply: ACCESS_REQUEST_CANCEL_REPLY, tone: "neutral" },
  );

/** Botões de cada etapa; cada um envia o texto que `resolveFrontDoorBillingStep` (ou o engine de ativação) entende. */
export function billingCardRows(snapshot: FrontDoorBillingSnapshot | null | undefined): ApprovalCardRow[] | null {
  if (!snapshot) return null;
  if (snapshot.status === "intro") {
    return [
      buttons(
        { label: "Sim, criar a conta", reply: START_ACCOUNT_REPLY, tone: "approve" },
        { label: "Pedir a liberação sem conta", reply: ACCESS_REQUEST_CONFIRM_REPLY, tone: "neutral" },
        { label: ACCESS_REQUEST_CANCEL_REPLY, reply: ACCESS_REQUEST_CANCEL_REPLY, tone: "neutral" },
      ),
    ];
  }
  if (snapshot.status === "offer") {
    return snapshot.plans.map((plan) => ({
      title: `${plan.label} · ${formatBrl(plan.monthlyPriceCents)} por mês`,
      detail: `até ${plan.includedUsers} usuários e ${plan.includedRuns.toLocaleString("pt-BR")} execuções`,
      actions: [{ label: "Escolher", reply: chooseReply(plan), tone: "approve" as const }],
    }));
  }
  if (snapshot.status === "confirm_account") {
    return [
      buttons(
        { label: "Sim, criar a conta", reply: createReply(snapshot.plan), tone: "approve" },
        ...(snapshot.plans?.length ? [{ label: OTHER_PLANS_REPLY, reply: OTHER_PLANS_REPLY, tone: "neutral" as const }] : []),
      ),
    ];
  }
  if (snapshot.status === "pay_offer") {
    return [
      buttons(
        { label: `Pagar agora (simulado)`, reply: payReply(snapshot.monthlyPriceCents), tone: "approve" },
        { label: PAY_LATER_REPLY, reply: PAY_LATER_REPLY, tone: "neutral" },
      ),
    ];
  }
  return [requestButtons("Sim, enviar o pedido")];
}

export type FrontDoorBillingPresentation = {
  content: string;
  billing: FrontDoorBillingSnapshot | null;
};

const paragraphs = (...lines: string[]) => lines.join("\n\n");

const LIBERATION_INTRO =
  "Claro! Para usar o IMOB, a EIAH primeiro precisa liberar o acesso deste workspace. É um passo rápido: um administrador da EIAH analisa o pedido e você recebe o aviso aqui mesmo.";

const SIMULATED_NOTE = "Neste ambiente o pagamento é simulado: nenhuma cobrança real é feita.";

const planOptions = (state: FrontDoorBillingState): FrontDoorBillingPlanOption[] =>
  state.plans.map(({ code, label, monthlyPriceCents, includedUsers, includedRuns }) => ({
    code,
    label,
    monthlyPriceCents,
    includedUsers,
    includedRuns,
  }));

/** Primeira mensagem antes do pedido de liberação; `null` quando não há nada a oferecer (o pedido segue como antes). */
export function describeBillingBeforeRequest(state: FrontDoorBillingState): FrontDoorBillingPresentation | null {
  if (!state.canManage) return null;
  if (!state.accountActive) {
    return {
      content: paragraphs(
        LIBERATION_INTRO,
        "Antes disso, uma sugestão: este workspace ainda não tem conta de billing. Com a conta criada, o pedido costuma ser analisado com mais facilidade.",
        "Quer criar a conta agora?",
      ),
      billing: { status: "intro", plans: planOptions(state) },
    };
  }
  if (!state.firstPayment && state.account && state.paymentMode === "simulated") {
    return {
      content: paragraphs(
        LIBERATION_INTRO,
        `Vi que a conta de billing já existe, no plano ${state.account.planLabel}, mas a primeira mensalidade (${formatBrl(state.account.monthlyPriceCents)}) ainda não foi paga.`,
        `Quer pagar agora? ${SIMULATED_NOTE}`,
      ),
      billing: { status: "pay_offer", planLabel: state.account.planLabel, monthlyPriceCents: state.account.monthlyPriceCents },
    };
  }
  return null;
}

const ASK_TO_SEND =
  "Agora só falta o pedido de liberação. Um administrador da EIAH analisa e você recebe o aviso aqui na conversa. Posso enviar o pedido?";

const errorCode = (error: unknown) =>
  error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined)?.error?.code : undefined;

function describeBillingFailure(error: unknown, action: "criar a conta" | "registrar o pagamento"): FrontDoorBillingPresentation {
  const code = errorCode(error);
  const reason =
    code === "FRONT_DOOR_BILLING_FORBIDDEN"
      ? "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode cuidar do billing."
      : code === "FRONT_DOOR_PAYMENT_NOT_CONNECTED"
        ? "O pagamento real ainda não está ligado à conversa, então nada foi cobrado."
        : code === "FRONT_DOOR_BILLING_ACCOUNT_REQUIRED"
          ? "Para pagar, primeiro é preciso criar a conta de billing."
          : `Não consegui ${action} agora, e nada foi alterado.`;
  return {
    content: paragraphs(reason, "Se quiser, posso enviar o pedido de liberação do IMOB mesmo assim. Posso enviar?"),
    billing: { status: "request_offer" },
  };
}

type DecisionWithBilling = {
  content?: string;
  resolvedQuickReplies?: string[];
  verticalActivationRequest?: { step: string };
  verticalActivation?: VerticalActivationSnapshot;
  frontDoorBillingRequest?: FrontDoorBillingRequest;
  frontDoorBilling?: FrontDoorBillingSnapshot;
};

type BillingApi = {
  read: typeof apiGetFrontDoorBilling;
  createAccount: typeof apiCreateFrontDoorBillingAccount;
  pay: typeof apiPayFrontDoorFirstMonth;
};

const DEFAULT_API: BillingApi = {
  read: apiGetFrontDoorBilling,
  createAccount: apiCreateFrontDoorBillingAccount,
  pay: apiPayFrontDoorFirstMonth,
};

async function runStep(request: FrontDoorBillingRequest, api: BillingApi): Promise<FrontDoorBillingPresentation> {
  if (request.step === "show_plans") {
    return {
      content: "Ótimo! Estes são os planos disponíveis. Qual combina mais com a sua imobiliária?",
      billing: { status: "offer", plans: request.plans },
    };
  }
  if (request.step === "choose") {
    const { plan } = request;
    return {
      content: paragraphs(
        `Boa escolha. O plano **${plan.label}** custa ${formatBrl(plan.monthlyPriceCents)} por mês e inclui até ${plan.includedUsers} usuários e ${plan.includedRuns.toLocaleString("pt-BR")} execuções.`,
        "Posso criar a conta de billing neste plano?",
      ),
      billing: { status: "confirm_account", plan, plans: request.plans },
    };
  }
  if (request.step === "pay_later") {
    return {
      content: paragraphs("Sem problema, você pode pagar depois.", ASK_TO_SEND),
      billing: { status: "request_offer" },
    };
  }
  if (request.step === "create") {
    try {
      const created = (await api.createAccount({ planCode: request.plan.code as FrontDoorBillingPlanCode, confirmed: true })).data;
      const state = (await api.read()).data;
      const head = created.outcome === "created"
        ? `Pronto, a conta de billing foi criada no plano ${created.account.planLabel}.`
        : `Este workspace já tinha conta de billing, no plano ${created.account.planLabel}, então nada foi alterado.`;
      if (state.firstPayment || state.paymentMode !== "simulated") {
        return { content: paragraphs(head, ASK_TO_SEND), billing: { status: "request_offer" } };
      }
      return {
        content: paragraphs(
          head,
          `Quer pagar a primeira mensalidade (${formatBrl(created.account.monthlyPriceCents)}) agora? ${SIMULATED_NOTE}`,
        ),
        billing: { status: "pay_offer", planLabel: created.account.planLabel, monthlyPriceCents: created.account.monthlyPriceCents },
      };
    } catch (error) {
      return describeBillingFailure(error, "criar a conta");
    }
  }
  try {
    const paid = (await api.pay({ confirmed: true })).data;
    return {
      content: paragraphs(
        paid.outcome === "paid"
          ? `Pagamento de ${formatBrl(paid.account.monthlyPriceCents)} registrado (simulado, sem cobrança real). Obrigado!`
          : "A primeira mensalidade já estava registrada.",
        ASK_TO_SEND,
      ),
      billing: { status: "request_offer" },
    };
  } catch (error) {
    return describeBillingFailure(error, "registrar o pagamento");
  }
}

/**
 * Etapa assíncrona: (1) quando a conversa ia propor o pedido de liberação, consulta o billing e, se houver o que
 * oferecer, troca a mensagem pela primeira pergunta da sequência; (2) executa a etapa escolhida.
 * Em todas as etapas "Pedir liberação do IMOB" continua valendo (engine de ativação).
 */
export async function enrichLauncherDecisionWithFrontDoorBilling<D extends DecisionWithBilling>(
  decision: D | null,
  api: BillingApi = DEFAULT_API,
): Promise<D | null> {
  if (!decision) return decision;
  const accessProposed: VerticalActivationSnapshot = { status: "access_request_proposed", verticalId: "imob" };
  if (decision.frontDoorBillingRequest) {
    const presentation = await runStep(decision.frontDoorBillingRequest, api);
    return {
      ...decision,
      content: presentation.content,
      resolvedQuickReplies: [],
      frontDoorBilling: presentation.billing ?? undefined,
      verticalActivation: accessProposed,
    };
  }
  if (decision.verticalActivationRequest?.step !== "preview" || decision.verticalActivation?.status !== "access_request_proposed") {
    return decision;
  }
  let state: FrontDoorBillingState;
  try {
    state = (await api.read()).data;
  } catch {
    // Sem leitura do billing, o pedido segue como antes.
    return decision;
  }
  const presentation = describeBillingBeforeRequest(state);
  if (!presentation) return decision;
  return {
    ...decision,
    content: presentation.content,
    resolvedQuickReplies: [],
    frontDoorBilling: presentation.billing ?? undefined,
  };
}

/** Congela a etapa no snapshot da mensagem; com botões, as sugestões genéricas saem. */
export function attachFrontDoorBillingToSnapshot<S extends { frontDoorBilling?: FrontDoorBillingSnapshot | null; quickReplies?: string[] }>(
  snapshot: S,
  decision: DecisionWithBilling | null,
): S {
  if (!decision?.frontDoorBilling) return snapshot;
  return { ...snapshot, frontDoorBilling: decision.frontDoorBilling, quickReplies: [] };
}
