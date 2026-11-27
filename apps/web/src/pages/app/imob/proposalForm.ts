import type { ImobPresentationForm, ImobProposalDraftState, ImobThreadConversationState } from "@/lib/api";
import { parseBrlToCents } from "./rentalLeaseForm";

export function isConversationalProposalForm(form: ImobPresentationForm | undefined) {
  return form?.entity === "proposta" && form.action === "create" && !form.submitTarget;
}

/** Includes invalid/answered questions: loss of a reference cannot confer action authority. */
export function hasProposalReviewCarrier(threadState?: ImobThreadConversationState | null) {
  const op = threadState?.operational;
  return Boolean(op?.flow === "proposal.create" && Object.prototype.hasOwnProperty.call(op, "continuity"));
}

function proposalContinuationMessage(contractType: ImobProposalDraftState["contractType"] | undefined) {
  return contractType === "rent" ? "continuar proposta de locação"
    : contractType === "management" ? "continuar proposta de administração" : "continuar proposta";
}

/** "sim" durante coleta significa continuar, não confirmar uma action pendente. */
export function buildProposalTextContinuation(input: string, threadState?: ImobThreadConversationState | null, continuityContextRef?: string) {
  const operational = threadState?.operational;
  const pending = operational?.continuity?.pending;
  const collecting = operational?.flow === "proposal.create" && operational.status === "collecting" && operational.pendingFields.length > 0;
  return { message: collecting && input.trim().toLowerCase() === "sim"
    ? proposalContinuationMessage(operational.proposalDraft?.contractType) : input, threadState,
    ...(continuityContextRef ? { continuityContextRef } : {}),
    ...(hasPendingProposalReview(threadState) && pending && pending.contextRef === continuityContextRef
      ? { continuityReplyRef: pending.ref } : {}),
  };
}

/** Transport guard only; interpretation of the answer belongs to IMOB. */
export function hasPendingProposalReview(threadState?: ImobThreadConversationState | null) {
  const op = threadState?.operational;
  const continuity = op?.continuity;
  const pending = continuity?.pending;
  return Boolean(op?.flow === "proposal.create" && op.status === "ready_for_review"
    && Array.isArray(op.pendingFields) && !op.pendingFields.length && op.proposalDraft
    && continuity?.version === "v1" && pending?.subject === "proposalDraft"
    && /^v1:[A-Za-z0-9:_-]{1,200}$/.test(pending.contextRef ?? "")
    && pending.ref && pending.caseId && pending.threadId && pending.draftRef
    && (pending.expiresAt === null || (Number.isFinite(Date.parse(pending.expiresAt)) && Date.parse(pending.expiresAt) > Date.now()))
    && ((continuity.phase === "review" && pending.purpose === "review_data" && pending.expectedResponse === "affirmation_or_correction")
      || (continuity.phase === "clarification" && pending.purpose === "identify_correction" && pending.expectedResponse === "correction_details")));
}

/** Continuidade da coleta IMOB, independente do agente selecionado e sem autorizar ações. */
export function resolveProposalTurnContinuation(params: {
  input: string;
  threadState?: ImobThreadConversationState | null;
  activeDomain?: "core" | "imob" | null;
  available: boolean;
  explicitTopicChange: boolean;
}) {
  const operational = params.threadState?.operational;
  if (params.activeDomain !== "imob" || operational?.flow !== "proposal.create") return null;
  if (hasPendingProposalReview(params.threadState)) {
    const command = params.input.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ");
    if (params.explicitTopicChange || /^(?:quero )?(?:voltar|mudar|trocar) para (?:o )?core[.!]?$|^(?:quero )?sair do imob[.!]?$/.test(command)) return "release" as const;
    return params.available && params.input.trim() ? "continue" as const : null;
  }
  if (operational.status !== "collecting" || !operational.pendingFields.length) return null;
  const text = params.input.trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ");
  if (/^(?:cancelar|cancela)(?: (?:a )?proposta)?[.!]?$|^nao quero continuar[.!]?$/.test(text)) return "cancel" as const;
  if (/^(?:voltar|mudar|trocar) para (?:o )?core[.!]?$|^sair do imob[.!]?$/.test(text) || params.explicitTopicChange) return "release" as const;
  if (!params.available || !text) return null;
  return "continue" as const;
}

/** Usa o draft tipado já aceito por resolve-turn; nenhum campo vira linguagem natural. */
export function buildProposalFormContinuation(
  form: ImobPresentationForm,
  values: Record<string, string>,
  threadState: ImobThreadConversationState | null | undefined,
) {
  const errors: Record<string, string> = {};
  if (!isConversationalProposalForm(form) || threadState?.operational?.flow !== "proposal.create") {
    return { ok: false as const, errors: { _form: "Não encontrei o contexto desta proposta. Reabra o formulário para continuar." } };
  }
  const fields = Object.fromEntries(form.fields.map((field) => [field.name, (values[field.name] ?? String(field.value ?? "")).trim()]));
  const amountCents = parseBrlToCents(fields.offerAmount);
  if (amountCents !== null && (!Number.isSafeInteger(amountCents) || amountCents <= 0)) {
    errors.offerAmount = "Informe um valor positivo no formato 100000,50.";
  }
  const types = new Map<string, NonNullable<ImobProposalDraftState["contractType"]>>([
    ["venda", "sale"], ["sale", "sale"],
    ["locação", "rent"], ["locacao", "rent"], ["aluguel", "rent"], ["rent", "rent"],
    ["administração", "management"], ["administracao", "management"], ["gestão", "management"], ["gestao", "management"], ["management", "management"],
  ]);
  const contractType = types.get(fields.contractType?.toLowerCase()) ?? null;
  if (fields.contractType && !contractType) errors.contractType = "Informe venda, locação ou administração.";
  if (Object.keys(errors).length) return { ok: false as const, errors };

  const proposalDraft: ImobProposalDraftState = {
    ...threadState.operational.proposalDraft,
    propertyId: fields.propertyId || null,
    offerAmount: amountCents === null ? null : amountCents / 100,
    buyerName: fields.buyerName || null,
    buyerPhone: fields.buyerPhone || null,
    buyerEmail: fields.buyerEmail || null,
    contractType,
  };
  return {
    ok: true as const,
    request: {
      // Só o comando de continuidade/tipo; os dados seguem no draft estruturado.
      message: proposalContinuationMessage(contractType),
      threadState: {
        ...threadState,
        operational: { ...threadState.operational, proposalDraft },
      },
    },
  };
}
