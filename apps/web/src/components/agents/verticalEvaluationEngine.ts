import {
  ApiError,
  apiAcceptEvaluationTerms,
  apiDeclineEvaluationTerms,
  apiEvaluationIntake,
  apiGetEvaluationTerms,
  apiGetVerticalAccess,
  apiRequestVerticalAccess,
  type EvaluationIntakeDraft,
  type EvaluationIntakeResult,
} from "@/lib/api";

/**
 * Engine do Front Door para a AVALIAÇÃO GRATUITA do IMOB. O agente define, o engine executa e o launcher só renderiza.
 *
 * Quatro coisas distintas, nunca apresentadas como se fossem uma só:
 *  1. PEDIDO  — qualificação confirmada pela pessoa; a EIAH analisa e decide. Enviar não aprova, não aceita e não ativa.
 *  2. APROVAÇÃO — decisão humana da EIAH que PROPÕE condições. Não libera uso.
 *  3. ACEITE  — a pessoa aceita a versão vigente. Aceitar não ativa nem libera uso.
 *  4. ATIVAÇÃO — passo seguinte, com confirmação própria (fluxo de ativação existente); só aí o prazo começa.
 *
 * Interpretação: o texto livre durante a etapa vai SEMPRE ao intake central (provider pelo runtime central; o servidor valida e
 * compõe a resposta). Aqui não há regex nem lista de frases para entender intenção: só os botões exatos (canônicos) e o estado.
 * Os valores comerciais (prazo, funcionalidades, limites) nunca são escritos aqui: vêm do servidor. A avaliação só é oferecida
 * quando o servidor diz que está habilitada.
 */

export const EVALUATION_REQUEST_REPLY = "Solicitar avaliação gratuita do IMOB";
export const EVALUATION_SUBMIT_REPLY = "Enviar pedido de avaliação";
export const EVALUATION_ADJUST_REPLY = "Ajustar informações do pedido";
export const EVALUATION_CONTINUE_REPLY = "Continuar o pedido de avaliação";
export const EVALUATION_VIEW_TERMS_REPLY = "Ver condições da avaliação do IMOB";
export const EVALUATION_ACCEPT_REPLY = "Aceitar as condições da avaliação";
export const EVALUATION_DECLINE_REPLY = "Não aceitar as condições";
/** Mesmo texto do botão de saída das demais etapas do Front Door (um teste confere a igualdade com `CHANGE_SUBJECT_REPLY`). */
export const EVALUATION_LEAVE_REPLY = "Mudar de assunto";
/** Mesmo texto de `ACTIVATION_REQUEST_REPLY` (um teste confere): depois do aceite, o próximo passo é pedir a ativação. */
export const EVALUATION_ACTIVATE_REPLY = "Ativar o IMOB neste workspace";
const NOT_NOW_REPLY = "Agora não";

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[.!]+$/g, "").replace(/\s+/g, " ").trim();
const same = (input: string, reply: string) => normalize(input) === normalize(reply);

export type EvaluationSnapshot =
  | { status: "evaluation_qualifying"; verticalId: "imob"; draft?: EvaluationIntakeDraft }
  | { status: "evaluation_confirm"; verticalId: "imob"; draft: EvaluationIntakeDraft }
  | { status: "evaluation_requested"; verticalId: "imob" }
  | { status: "evaluation_terms"; verticalId: "imob"; termsHash: string }
  | { status: "evaluation_closed"; verticalId: "imob" };

export type EvaluationRequest =
  | { step: "evaluation_offer"; verticalId: "imob" }
  | { step: "evaluation_qualify"; verticalId: "imob"; message: string; stage: "qualifying" | "confirm"; draft: EvaluationIntakeDraft }
  | { step: "evaluation_adjust"; verticalId: "imob"; draft: EvaluationIntakeDraft }
  | { step: "evaluation_submit"; verticalId: "imob"; draft: EvaluationIntakeDraft }
  | { step: "evaluation_view_terms"; verticalId: "imob" }
  | { step: "evaluation_accept"; verticalId: "imob"; termsHash: string }
  | { step: "evaluation_decline"; verticalId: "imob" }
  | { step: "evaluation_leave"; verticalId: "imob" }
  | { step: "evaluation_remind"; verticalId: "imob"; pending: EvaluationSnapshot };

export const isEvaluationRequest = (request: { step: string }): request is EvaluationRequest => request.step.startsWith("evaluation_");

type PendingLike = { status: string } | null | undefined;
const isEvaluationSnapshot = (pending: PendingLike): pending is EvaluationSnapshot => Boolean(pending && pending.status.startsWith("evaluation_"));

/**
 * Passo do turno. Botões exatos resolvem direto; durante uma etapa pendente, QUALQUER outro texto é a resposta da pessoa e vai ao
 * intake central (nada de palavras-chave). Sem etapa pendente e sem botão exato: nenhum passo (o fluxo normal segue).
 */
export function resolveEvaluationStep(input: string, pending: PendingLike): EvaluationRequest | null {
  if (same(input, EVALUATION_REQUEST_REPLY)) return { step: "evaluation_offer", verticalId: "imob" };
  if (same(input, EVALUATION_VIEW_TERMS_REPLY)) return { step: "evaluation_view_terms", verticalId: "imob" };
  if (!isEvaluationSnapshot(pending)) return null;
  const leave = same(input, EVALUATION_LEAVE_REPLY) || same(input, NOT_NOW_REPLY);
  switch (pending.status) {
    case "evaluation_qualifying":
      if (leave) return { step: "evaluation_leave", verticalId: "imob" };
      if (same(input, EVALUATION_CONTINUE_REPLY)) return { step: "evaluation_remind", verticalId: "imob", pending };
      return { step: "evaluation_qualify", verticalId: "imob", message: input.trim(), stage: "qualifying", draft: pending.draft ?? {} };
    case "evaluation_confirm":
      if (same(input, EVALUATION_SUBMIT_REPLY)) return { step: "evaluation_submit", verticalId: "imob", draft: pending.draft };
      if (same(input, EVALUATION_ADJUST_REPLY)) return { step: "evaluation_adjust", verticalId: "imob", draft: pending.draft };
      if (leave) return { step: "evaluation_leave", verticalId: "imob" };
      if (same(input, EVALUATION_CONTINUE_REPLY)) return { step: "evaluation_remind", verticalId: "imob", pending };
      return { step: "evaluation_qualify", verticalId: "imob", message: input.trim(), stage: "confirm", draft: pending.draft };
    case "evaluation_terms":
      if (same(input, EVALUATION_ACCEPT_REPLY)) return { step: "evaluation_accept", verticalId: "imob", termsHash: pending.termsHash };
      if (same(input, EVALUATION_DECLINE_REPLY)) return { step: "evaluation_decline", verticalId: "imob" };
      if (leave) return { step: "evaluation_leave", verticalId: "imob" };
      // As condições têm só duas respostas válidas: o texto livre não aceita nem recusa nada.
      return { step: "evaluation_remind", verticalId: "imob", pending };
    default:
      return null;
  }
}

export type EvaluationPresentation = { content: string; quickReplies: string[]; activation: EvaluationSnapshot };

const NOTHING_DONE = "Nada foi enviado, aceito, ativado nem cobrado.";
const UNAVAILABLE = `Não consegui falar com a EIAH agora. ${NOTHING_DONE} Tente de novo ou use os botões.`;
const TIMEOUT = `A resposta demorou mais que o limite. ${NOTHING_DONE} Tente de novo ou use os botões.`;
/** Mais que o limite do servidor: o servidor tem a chance de devolver o desfecho explícito antes de o cliente desistir. */
export const EVALUATION_INTAKE_CLIENT_TIMEOUT_MS = 30_000;

const qualifyingPrompt = (draft?: EvaluationIntakeDraft): EvaluationPresentation => ({
  content: [
    "Para pedir a avaliação gratuita do IMOB, conte com suas palavras: qual problema você quer resolver, quantas pessoas usariam e o resultado que você espera.",
    "A EIAH analisa o pedido e decide; se ela propuser condições, você as vê e aceita antes de qualquer ativação. Nada é enviado até você confirmar.",
  ].join("\n"),
  quickReplies: [EVALUATION_LEAVE_REPLY],
  activation: { status: "evaluation_qualifying", verticalId: "imob", ...(draft && Object.keys(draft).length ? { draft } : {}) },
});

/** Texto e botões das condições propostas (composto no servidor; aqui só se apresenta). Proposta ≠ aceite ≠ ativação. */
export function describeEvaluationTermsPresentation(terms: { termsHash: string; text: string[]; accepted: boolean; requesterIsViewer: boolean }): EvaluationPresentation {
  const closed: EvaluationSnapshot = { status: "evaluation_closed", verticalId: "imob" };
  if (terms.accepted) {
    return {
      content: [
        ...terms.text,
        "",
        "Você já aceitou estas condições. A avaliação AINDA NÃO começou: o prazo só passa a contar quando você confirmar a ativação.",
      ].join("\n"),
      quickReplies: [EVALUATION_ACTIVATE_REPLY],
      activation: closed,
    };
  }
  if (!terms.requesterIsViewer) {
    return { content: [...terms.text, "", "Só quem fez o pedido pode aceitar estas condições."].join("\n"), quickReplies: [], activation: closed };
  }
  return {
    content: [
      ...terms.text,
      "",
      "Isto é só a PROPOSTA da EIAH. Aceitar não ativa nada nem libera uso: depois do aceite você ainda confirma a ativação, e só então o prazo começa.",
      `Para seguir, responda "${EVALUATION_ACCEPT_REPLY}" ou "${EVALUATION_DECLINE_REPLY}".`,
    ].join("\n"),
    quickReplies: [EVALUATION_ACCEPT_REPLY, EVALUATION_DECLINE_REPLY, EVALUATION_LEAVE_REPLY],
    activation: { status: "evaluation_terms", verticalId: "imob", termsHash: terms.termsHash },
  };
}

function presentIntake(result: EvaluationIntakeResult, stage: "qualifying" | "confirm", previous: EvaluationIntakeDraft): EvaluationPresentation {
  const draft = result.draft && Object.keys(result.draft).length ? result.draft : previous;
  const keep = (): EvaluationSnapshot => (stage === "confirm" ? { status: "evaluation_confirm", verticalId: "imob", draft } : { status: "evaluation_qualifying", verticalId: "imob", draft });
  const chipsForCurrent = stage === "confirm" ? [EVALUATION_SUBMIT_REPLY, EVALUATION_ADJUST_REPLY, EVALUATION_LEAVE_REPLY] : [EVALUATION_LEAVE_REPLY];
  switch (result.outcome) {
    case "confirm":
      return {
        content: result.content,
        quickReplies: [EVALUATION_SUBMIT_REPLY, EVALUATION_ADJUST_REPLY, EVALUATION_LEAVE_REPLY],
        activation: { status: "evaluation_confirm", verticalId: "imob", draft: result.draft },
      };
    case "need_more":
      return { content: result.content, quickReplies: [EVALUATION_LEAVE_REPLY], activation: { status: "evaluation_qualifying", verticalId: "imob", draft: result.draft } };
    case "out_of_context":
      return { content: result.content, quickReplies: [EVALUATION_CONTINUE_REPLY, EVALUATION_LEAVE_REPLY], activation: keep() };
    case "leave":
      return { content: result.content, quickReplies: [], activation: { status: "evaluation_closed", verticalId: "imob" } };
    case "not_permitted":
    case "offer_unavailable":
      return { content: result.content, quickReplies: [], activation: { status: "evaluation_closed", verticalId: "imob" } };
    default:
      // answered | clarify | unavailable | timeout | invalid: a mesma etapa continua, com o rascunho preservado.
      return { content: result.content, quickReplies: chipsForCurrent, activation: keep() };
  }
}

export type EvaluationApi = {
  getAccess: typeof apiGetVerticalAccess;
  intake: typeof apiEvaluationIntake;
  requestAccess: typeof apiRequestVerticalAccess;
  getTerms: typeof apiGetEvaluationTerms;
  acceptTerms: typeof apiAcceptEvaluationTerms;
  declineTerms: typeof apiDeclineEvaluationTerms;
};
export const DEFAULT_EVALUATION_API: EvaluationApi = {
  getAccess: apiGetVerticalAccess,
  intake: apiEvaluationIntake,
  requestAccess: apiRequestVerticalAccess,
  getTerms: apiGetEvaluationTerms,
  acceptTerms: apiAcceptEvaluationTerms,
  declineTerms: apiDeclineEvaluationTerms,
};

const errorCode = (error: unknown) => (error instanceof ApiError ? (error.body as { error?: { code?: string } } | undefined)?.error?.code : undefined);

/** Executa o passo no servidor. Toda falha termina em mensagem explícita que diz o que NÃO aconteceu; nunca em fallback genérico. */
export async function enrichEvaluationRequest(
  request: EvaluationRequest,
  api: EvaluationApi = DEFAULT_EVALUATION_API,
  timeoutMs = EVALUATION_INTAKE_CLIENT_TIMEOUT_MS,
): Promise<EvaluationPresentation> {
  const closed: EvaluationSnapshot = { status: "evaluation_closed", verticalId: "imob" };
  switch (request.step) {
    case "evaluation_offer": {
      try {
        const view = (await api.getAccess("IMOB")).data;
        if (!view.evaluation?.offerAvailable) {
          return { content: `A avaliação gratuita não está disponível neste workspace no momento. ${NOTHING_DONE}`, quickReplies: [], activation: closed };
        }
        return qualifyingPrompt();
      } catch {
        return { content: UNAVAILABLE, quickReplies: [], activation: closed };
      }
    }
    case "evaluation_qualify": {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const result = (await api.intake({ message: request.message, stage: request.stage, draft: request.draft }, controller.signal)).data;
        return presentIntake(result, request.stage, request.draft);
      } catch {
        const content = controller.signal.aborted ? TIMEOUT : UNAVAILABLE;
        return { content, quickReplies: request.stage === "confirm" ? [EVALUATION_SUBMIT_REPLY, EVALUATION_ADJUST_REPLY, EVALUATION_LEAVE_REPLY] : [EVALUATION_LEAVE_REPLY], activation: request.stage === "confirm" ? { status: "evaluation_confirm", verticalId: "imob", draft: request.draft } : { status: "evaluation_qualifying", verticalId: "imob", draft: request.draft } };
      } finally {
        clearTimeout(timer);
      }
    }
    case "evaluation_adjust":
      return {
        ...qualifyingPrompt(request.draft),
        content: "Certo. Conte o que quer mudar ou acrescentar (problema, quantas pessoas ou resultado esperado). Nada foi enviado.",
      };
    case "evaluation_submit": {
      const { problem, teamSize, expectedOutcome, additionalInfo } = request.draft;
      if (!problem || teamSize === undefined || !expectedOutcome) {
        return { ...qualifyingPrompt(request.draft), content: "Ainda faltam informações para montar o pedido. Conte o que falta. Nada foi enviado." };
      }
      try {
        const body = { problem, teamSize, expectedOutcome, ...(additionalInfo ? { additionalInfo } : {}), confirmed: true as const };
        const outcome = (await api.requestAccess({ vertical: "IMOB", channel: "chat", evaluation: body })).data.outcome;
        if (outcome === "already_requested") {
          return { content: "Você já tem um pedido em análise pela EIAH. Quando houver decisão, o aviso aparece aqui na conversa.", quickReplies: [], activation: { status: "evaluation_requested", verticalId: "imob" } };
        }
        if (outcome === "already_approved") {
          return { content: "O IMOB já está liberado pela EIAH neste workspace; não há o que pedir.", quickReplies: [EVALUATION_ACTIVATE_REPLY], activation: closed };
        }
        return {
          content: [
            "Pedido de avaliação enviado à EIAH.",
            "Isto é só o PEDIDO: nada foi aprovado, aceito nem ativado. A EIAH analisa e decide; se ela propuser condições, o aviso aparece aqui e você as vê e aceita antes de qualquer ativação.",
          ].join("\n"),
          quickReplies: [],
          activation: { status: "evaluation_requested", verticalId: "imob" },
        };
      } catch (error) {
        const code = errorCode(error);
        if (code === "EVALUATION_OFFER_UNAVAILABLE") return { content: `A avaliação não está disponível no momento. ${NOTHING_DONE}`, quickReplies: [], activation: closed };
        if (code === "EVALUATION_ALREADY_USED") return { content: `A avaliação deste workspace já foi iniciada e não pode ser pedida de novo. ${NOTHING_DONE}`, quickReplies: [], activation: closed };
        if (code === "VERTICAL_ACCESS_REQUEST_FORBIDDEN") return { content: `Só o proprietário do tenant ou quem tem a permissão de ativar produtos pode pedir a avaliação. ${NOTHING_DONE}`, quickReplies: [], activation: closed };
        return { content: `Não consegui enviar o pedido agora. ${NOTHING_DONE} Tente de novo.`, quickReplies: [EVALUATION_SUBMIT_REPLY, EVALUATION_ADJUST_REPLY, EVALUATION_LEAVE_REPLY], activation: { status: "evaluation_confirm", verticalId: "imob", draft: request.draft } };
      }
    }
    case "evaluation_view_terms": {
      try {
        const view = (await api.getTerms()).data;
        if (!view.available) {
          return {
            content: view.stale
              ? "As condições propostas não estão mais vigentes: a EIAH precisa propô-las de novo. Nada foi aceito nem ativado."
              : "Não há condições de avaliação aguardando você neste momento.",
            quickReplies: [],
            activation: closed,
          };
        }
        return describeEvaluationTermsPresentation(view);
      } catch {
        return { content: UNAVAILABLE, quickReplies: [EVALUATION_VIEW_TERMS_REPLY], activation: closed };
      }
    }
    case "evaluation_accept": {
      try {
        await api.acceptTerms({ termsHash: request.termsHash });
        return {
          content: [
            "Condições aceitas.",
            "Isto NÃO ativou nada: a avaliação só começa quando você confirmar a ativação, e o prazo conta a partir dela.",
          ].join("\n"),
          quickReplies: [EVALUATION_ACTIVATE_REPLY],
          activation: closed,
        };
      } catch (error) {
        const code = errorCode(error);
        const stale = code === "EVALUATION_TERMS_MISMATCH" || code === "EVALUATION_TERMS_STALE";
        return {
          content: stale
            ? "As condições mudaram desde que você as viu, então nada foi aceito. Veja as condições de novo."
            : "Não consegui registrar o aceite agora. Nada foi aceito nem ativado. Tente de novo.",
          quickReplies: [EVALUATION_VIEW_TERMS_REPLY],
          activation: closed,
        };
      }
    }
    case "evaluation_decline": {
      try {
        await api.declineTerms();
        return { content: "Tudo bem: você não aceitou as condições e nada foi ativado.", quickReplies: [], activation: closed };
      } catch {
        return { content: "Não consegui registrar sua resposta agora. Nada foi aceito nem ativado. Tente de novo.", quickReplies: [EVALUATION_VIEW_TERMS_REPLY], activation: closed };
      }
    }
    case "evaluation_leave":
      return { content: `Certo, encerrei esta etapa. ${NOTHING_DONE}`, quickReplies: [], activation: closed };
    case "evaluation_remind": {
      const pending = request.pending;
      if (pending.status === "evaluation_terms") {
        return {
          content: `Estamos na etapa de condições da avaliação do IMOB. Aqui só há duas respostas: "${EVALUATION_ACCEPT_REPLY}" ou "${EVALUATION_DECLINE_REPLY}". Ou escolha mudar de assunto: nada é aceito por isso.`,
          quickReplies: [EVALUATION_ACCEPT_REPLY, EVALUATION_DECLINE_REPLY, EVALUATION_LEAVE_REPLY],
          activation: pending,
        };
      }
      if (pending.status === "evaluation_confirm") {
        return {
          content: "Seguimos no pedido de avaliação do IMOB. Você pode enviar, ajustar ou mudar de assunto.",
          quickReplies: [EVALUATION_SUBMIT_REPLY, EVALUATION_ADJUST_REPLY, EVALUATION_LEAVE_REPLY],
          activation: pending,
        };
      }
      return qualifyingPrompt(pending.status === "evaluation_qualifying" ? pending.draft : undefined);
    }
  }
}
