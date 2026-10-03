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
 * - Quando o IMOB precisa de liberação e o tenant não tem conta de billing ativa, a conversa avisa e oferece os
 *   planos atuais; o pedido continua possível sem conta (a conta não é obrigatória).
 * - Criar a conta exige escolher o plano e confirmar; pagar exige o clique no botão do valor. O pagamento é
 *   simulado e dito como tal; nenhuma cobrança real.
 * - Depois de cada passo, o pedido de liberação fica a um clique (mesma confirmação do engine de ativação).
 * O launcher só encadeia e renderiza o cartão.
 */

export type FrontDoorBillingPlanOption = Pick<FrontDoorBillingPlan, "code" | "label" | "monthlyPriceCents" | "includedUsers" | "includedRuns">;

export type FrontDoorBillingSnapshot =
  | { status: "offer"; plans: FrontDoorBillingPlanOption[] }
  | { status: "confirm_account"; plan: FrontDoorBillingPlanOption }
  | { status: "pay_offer"; planLabel: string; monthlyPriceCents: number }
  | { status: "request_offer" };

export type FrontDoorBillingRequest =
  | { step: "choose"; plan: FrontDoorBillingPlanOption }
  | { step: "create"; plan: FrontDoorBillingPlanOption }
  | { step: "cancel_account" }
  | { step: "pay"; planLabel: string; monthlyPriceCents: number };

export const formatBrl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/\u00a0/g, " ");

export const BILLING_ACCOUNT_CANCEL_REPLY = "Não criar conta agora";
export const chooseReply = (plan: Pick<FrontDoorBillingPlanOption, "label">) => `Criar conta de billing no plano ${plan.label}`;
export const createReply = (plan: Pick<FrontDoorBillingPlanOption, "label">) => `Confirmar conta de billing: ${plan.label}`;
export const payReply = (monthlyPriceCents: number) => `Pagar ${formatBrl(monthlyPriceCents)} (simulado)`;

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/** Passo do turno a partir do texto e do cartão pendente; só vale logo depois do cartão (nada de "sim" solto). */
export function resolveFrontDoorBillingStep(
  input: string,
  pending: FrontDoorBillingSnapshot | null | undefined,
): FrontDoorBillingRequest | null {
  const text = normalize(input);
  if (pending?.status === "offer") {
    const plan = pending.plans.find((option) => normalize(chooseReply(option)) === text);
    return plan ? { step: "choose", plan } : null;
  }
  if (pending?.status === "confirm_account") {
    if (text === normalize(createReply(pending.plan))) return { step: "create", plan: pending.plan };
    if (text === normalize(BILLING_ACCOUNT_CANCEL_REPLY)) return { step: "cancel_account" };
    return null;
  }
  if (pending?.status === "pay_offer" && text === normalize(payReply(pending.monthlyPriceCents))) {
    return { step: "pay", planLabel: pending.planLabel, monthlyPriceCents: pending.monthlyPriceCents };
  }
  return null;
}

const requestRow = (title: string): ApprovalCardRow => ({
  title,
  actions: [
    { label: ACCESS_REQUEST_CONFIRM_REPLY, reply: ACCESS_REQUEST_CONFIRM_REPLY, tone: "neutral" },
    { label: ACCESS_REQUEST_CANCEL_REPLY, reply: ACCESS_REQUEST_CANCEL_REPLY, tone: "neutral" },
  ],
});

/** Linhas do cartão na conversa; cada botão envia o texto que `resolveFrontDoorBillingStep` entende. */
export function billingCardRows(snapshot: FrontDoorBillingSnapshot | null | undefined): ApprovalCardRow[] | null {
  if (!snapshot) return null;
  if (snapshot.status === "offer") {
    return [
      ...snapshot.plans.map((plan) => ({
        title: `${plan.label} — ${formatBrl(plan.monthlyPriceCents)}/mês`,
        detail: `até ${plan.includedUsers} usuários e ${plan.includedRuns.toLocaleString("pt-BR")} execuções`,
        actions: [{ label: "Escolher", reply: chooseReply(plan), tone: "approve" as const }],
      })),
      requestRow("Ou peça a liberação sem conta de billing"),
    ];
  }
  if (snapshot.status === "confirm_account") {
    return [
      {
        title: `Conta de billing no plano ${snapshot.plan.label}`,
        detail: `${formatBrl(snapshot.plan.monthlyPriceCents)}/mês`,
        actions: [
          { label: "Confirmar criação da conta", reply: createReply(snapshot.plan), tone: "approve" },
          { label: "Cancelar", reply: BILLING_ACCOUNT_CANCEL_REPLY, tone: "neutral" },
        ],
      },
    ];
  }
  if (snapshot.status === "pay_offer") {
    return [
      {
        title: `Primeira mensalidade · ${snapshot.planLabel}`,
        detail: "pagamento simulado, sem cobrança real",
        actions: [{ label: payReply(snapshot.monthlyPriceCents), reply: payReply(snapshot.monthlyPriceCents), tone: "approve" }],
      },
      requestRow("Ou peça a liberação agora e pague depois"),
    ];
  }
  return [requestRow("Pedir a liberação do IMOB à EIAH")];
}

export type FrontDoorBillingPresentation = {
  content: string;
  billing: FrontDoorBillingSnapshot | null;
};

const SIMULATED_NOTE = "O pagamento aqui é simulado: nenhuma cobrança real é feita.";

/** Aviso antes do pedido de liberação; `null` quando não há nada a oferecer (o pedido segue como antes). */
export function describeBillingBeforeRequest(state: FrontDoorBillingState): FrontDoorBillingPresentation | null {
  if (!state.canManage) return null;
  if (!state.accountActive) {
    return {
      content: [
        "**Antes de pedir:** este workspace ainda não tem conta de billing ativa.",
        "Recomendamos criar a conta antes do pedido: sem ela, o pedido tende a ir para revisão. Escolha um plano abaixo (você confirma antes de criar) ou peça a liberação mesmo assim.",
      ].join("\n\n"),
      billing: {
        status: "offer",
        plans: state.plans.map(({ code, label, monthlyPriceCents, includedUsers, includedRuns }) => ({
          code,
          label,
          monthlyPriceCents,
          includedUsers,
          includedRuns,
        })),
      },
    };
  }
  if (!state.firstPayment && state.account && state.paymentMode === "simulated") {
    return {
      content: [
        `A conta de billing está ativa no plano ${state.account.planLabel}, mas a primeira mensalidade ainda não foi paga.`,
        `Você pode pagar agora ou pedir a liberação e pagar depois. ${SIMULATED_NOTE}`,
      ].join("\n\n"),
      billing: { status: "pay_offer", planLabel: state.account.planLabel, monthlyPriceCents: state.account.monthlyPriceCents },
    };
  }
  return null;
}

const errorCode = (error: unknown) =>
  error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined)?.error?.code : undefined;

function describeBillingFailure(error: unknown, action: "criar a conta" | "pagar"): FrontDoorBillingPresentation {
  const code = errorCode(error);
  const reason =
    code === "FRONT_DOOR_BILLING_FORBIDDEN"
      ? "Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode cuidar do billing."
      : code === "FRONT_DOOR_PAYMENT_NOT_CONNECTED"
        ? "O pagamento real ainda não está ligado à conversa. Nada foi cobrado."
        : code === "FRONT_DOOR_BILLING_ACCOUNT_REQUIRED"
          ? "Crie a conta de billing antes de pagar."
          : `Não consegui ${action} agora. Nada foi alterado.`;
  return { content: `${reason} Você ainda pode pedir a liberação do IMOB.`, billing: { status: "request_offer" } };
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
  if (request.step === "choose") {
    return {
      content: [
        `Criar a conta de billing no plano **${request.plan.label}** (${formatBrl(request.plan.monthlyPriceCents)}/mês)?`,
        "Nada é criado até você confirmar.",
      ].join("\n\n"),
      billing: { status: "confirm_account", plan: request.plan },
    };
  }
  if (request.step === "cancel_account") {
    return { content: "Tudo bem, nenhuma conta foi criada. Quer pedir a liberação do IMOB mesmo assim?", billing: { status: "request_offer" } };
  }
  if (request.step === "create") {
    try {
      const created = (await api.createAccount({ planCode: request.plan.code as FrontDoorBillingPlanCode, confirmed: true })).data;
      const state = (await api.read()).data;
      const head = created.outcome === "created"
        ? `Conta de billing criada no plano ${created.account.planLabel} (${formatBrl(created.account.monthlyPriceCents)}/mês).`
        : `Este tenant já tinha conta de billing no plano ${created.account.planLabel}. Nada foi alterado.`;
      if (state.firstPayment || state.paymentMode !== "simulated") {
        return { content: `${head} Agora é só pedir a liberação do IMOB.`, billing: { status: "request_offer" } };
      }
      return {
        content: [head, `Quer pagar a primeira mensalidade agora? ${SIMULATED_NOTE}`].join("\n\n"),
        billing: { status: "pay_offer", planLabel: created.account.planLabel, monthlyPriceCents: created.account.monthlyPriceCents },
      };
    } catch (error) {
      return describeBillingFailure(error, "criar a conta");
    }
  }
  try {
    const paid = (await api.pay({ confirmed: true })).data;
    return {
      content: paid.outcome === "paid"
        ? `Primeira mensalidade registrada (${formatBrl(paid.account.monthlyPriceCents)}, pagamento simulado, sem cobrança real). Agora é só pedir a liberação do IMOB.`
        : "A primeira mensalidade já estava registrada. Agora é só pedir a liberação do IMOB.",
      billing: { status: "request_offer" },
    };
  } catch (error) {
    return describeBillingFailure(error, "pagar");
  }
}

/**
 * Etapa assíncrona: (1) depois da proposta de pedir a liberação, consulta o billing e acrescenta o aviso e o
 * cartão; (2) executa o passo de billing escolhido no cartão. Em ambos, "Pedir liberação do IMOB" continua valendo.
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
    content: `${decision.content ?? ""}\n\n${presentation.content}`.trim(),
    resolvedQuickReplies: [],
    frontDoorBilling: presentation.billing ?? undefined,
  };
}

/** Congela o cartão no snapshot da mensagem; com cartão, as sugestões genéricas saem. */
export function attachFrontDoorBillingToSnapshot<S extends { frontDoorBilling?: FrontDoorBillingSnapshot | null; quickReplies?: string[] }>(
  snapshot: S,
  decision: DecisionWithBilling | null,
): S {
  if (!decision?.frontDoorBilling) return snapshot;
  return { ...snapshot, frontDoorBilling: decision.frontDoorBilling, quickReplies: [] };
}
