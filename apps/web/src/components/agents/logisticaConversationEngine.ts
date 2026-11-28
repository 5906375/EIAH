import type { OraculoDecisionRequestBlockedReason, OraculoDecisionTrigger, OraculoDecisionViewV1, OraculoPreparationRecordV1 } from "@eiah/contracts";

/**
 * Engine da jornada de preparação de Logística & Comex DENTRO da conversa do Front Door (M4/M5, escopo local).
 * O engine só RESOLVE o que a conversa mostra a partir do registro do caso que o servidor já devolveu: etapas, pendências,
 * conferências e o que exige decisão humana. Não grava, não autoriza, não reconhece linguagem natural (isso é do handoff) e
 * não decide acesso (o servidor decide; sem acesso confirmado nada daqui é exibido). O componente apenas renderiza.
 *
 * Limites declarados: salvar, vincular documento ou conferir NÃO autoriza execução, aceite da devolução, responsabilidade,
 * custos nem transmissão externa. Não há fila nem notificação: o encaminhamento (J17) é uma SOLICITAÇÃO registrada no próprio caso
 * (visível a quem abre o caso) e a decisão é de um responsável elegível; o resumo copiável segue como apoio.
 */
export const LOGISTICA_JOURNEY_TITLE = "Devolução de contêiner vazio";
export const LOGISTICA_JOURNEY_SCOPE_NOTE =
  "Salvar, vincular documentos ou conferir não autoriza execução, aceite da devolução, encerramento de custos nem transmissão externa.";

export type JourneyStepId = "context" | "operation_reference" | "evidence" | "review" | "decision";
export type JourneyStepState = "done" | "pending" | "needs_human";
export type LogisticaJourneyStep = { id: JourneyStepId; title: string; state: JourneyStepState; detail: string; pendencies: string[] };
export type LogisticaJourneyView = {
  caseShortId: string | null;
  revision: number | null;
  steps: LogisticaJourneyStep[];
  nextAction: string;
  results: string[];
  humanDecisionNeeded: boolean;
  /** Resumo para o responsável autorizado (texto). Não notifica ninguém nem cria fila. */
  forwardSummary: string | null;
};

const FIELD_LABELS = { port: "Porto", depot: "Depósito", flow: "Fluxo pretendido" } as const;
const OUTCOME_LABELS: Record<string, string> = {
  consistent_in_checked_fields: "coerente nos campos conferidos",
  divergent: "com divergência",
  indeterminate: "indeterminada",
};
const CHECK_FIELD_LABELS: Record<string, string> = { containerNumber: "Contêiner", port: "Porto", depot: "Depósito", returnDate: "Data da devolução", movement: "Movimento" };

function contextStep(record: OraculoPreparationRecordV1): LogisticaJourneyStep {
  const pendencies: string[] = [];
  let needsHuman = false;
  for (const key of Object.keys(FIELD_LABELS) as Array<keyof typeof FIELD_LABELS>) {
    const field = record.context[key];
    const label = FIELD_LABELS[key];
    if (field.status === "not_informed") pendencies.push(`${label}: não informado`);
    else if (field.status === "to_confirm") pendencies.push(`${label}: a confirmar`);
    else if (field.status === "not_applicable") { pendencies.push(`${label}: dispensado com justificativa — requer revisão humana`); needsHuman = true; }
    else if (field.status === "informed" && !(field.value ?? "").trim()) pendencies.push(`${label}: valor obrigatório`);
  }
  return {
    id: "context", title: "Contexto da operação",
    state: needsHuman ? "needs_human" : pendencies.length ? "pending" : "done",
    detail: pendencies.length ? "Complete ou confirme os campos abaixo." : "Porto, depósito e fluxo informados.",
    pendencies,
  };
}

function referenceStep(record: OraculoPreparationRecordV1): LogisticaJourneyStep {
  const reference = record.operationReference ?? {};
  const pendencies: string[] = [];
  if (!reference.containerNumber?.trim()) pendencies.push("Contêiner esperado não informado — a conferência do documento ficará indeterminada");
  return {
    id: "operation_reference", title: "Referência declarada da operação",
    state: pendencies.length ? "pending" : "done",
    detail: pendencies.length ? "Informe o contêiner esperado para permitir a comparação com o documento." : "Referência declarada e salva no caso.",
    pendencies,
  };
}

function evidenceStep(record: OraculoPreparationRecordV1): LogisticaJourneyStep {
  const count = record.evidences?.length ?? 0;
  return {
    id: "evidence", title: "Documentos e evidências",
    state: count ? "done" : "pending",
    detail: count ? `${count} documento(s) vinculado(s) ao caso. Integridade do arquivo não comprova validade do documento.` : "Vincule o documento da devolução (por exemplo, o EIR) para conferência.",
    pendencies: count ? [] : ["Nenhum documento vinculado"],
  };
}

function reviewStep(record: OraculoPreparationRecordV1): { step: LogisticaJourneyStep; divergences: string[] } {
  const evidences = record.evidences ?? [];
  const reviews = record.contentReviews ?? [];
  const divergences: string[] = [];
  const pendencies: string[] = [];
  let needsHuman = false;
  for (const evidence of evidences) {
    const latest = [...reviews].reverse().find((review) => review.documentId === evidence.documentId);
    if (!latest) { pendencies.push(`${evidence.fileName}: conferência humana ainda não registrada`); continue; }
    if (latest.outcome !== "consistent_in_checked_fields") {
      needsHuman = true;
      const fields = latest.checks.filter((check) => check.status === "diverges" || check.status === "not_observed" || check.status === "reference_missing").map((check) => CHECK_FIELD_LABELS[check.field] ?? check.field);
      const line = `${evidence.fileName}: ${OUTCOME_LABELS[latest.outcome] ?? latest.outcome}${fields.length ? ` (${fields.join(", ")})` : ""}`;
      pendencies.push(line); divergences.push(line);
    }
  }
  const state: JourneyStepState = needsHuman ? "needs_human" : pendencies.length || !evidences.length ? "pending" : "done";
  return {
    divergences,
    step: {
      id: "review", title: "Conferência documental (humana)", state,
      detail: !evidences.length ? "Disponível depois de vincular um documento." : needsHuman ? "Há divergência ou correspondência indeterminada: a decisão é humana." : pendencies.length ? "Registre a leitura do documento." : "Conferência registrada e coerente nos campos conferidos.",
      pendencies,
    },
  };
}

/** Rótulo de um gatilho de decisão, na mesma linguagem das pendências da jornada (sem conteúdo do documento). */
export function describeDecisionTrigger(trigger: OraculoDecisionTrigger, record: OraculoPreparationRecordV1): string {
  if (trigger.kind === "context_field") return `${FIELD_LABELS[trigger.field]}: dispensado com justificativa`;
  const fileName = record.evidences?.find((evidence) => evidence.documentId === trigger.documentId)?.fileName ?? "Documento";
  return `${fileName}: ${OUTCOME_LABELS[trigger.outcome] ?? trigger.outcome}`;
}

export const DECISION_VALUE_LABELS = { approved: "Aprovada", rejected: "Rejeitada", more_information: "Complementação solicitada" } as const;
export const DECISION_BLOCK_MESSAGES: Record<OraculoDecisionRequestBlockedReason, string> = {
  read_only: "Consulta somente leitura: pedir decisão exige permissão de gravação no workspace.",
  no_decision_needed: "Não há item que exija decisão humana nesta base do caso.",
  already_requested: "Já existe solicitação para esta base do caso.",
  no_eligible_decider: "Sem responsável elegível: é preciso a política de conferência humana do workspace e outro membro ativo para decidir. Nenhuma solicitação foi criada; use o resumo abaixo para falar com o responsável.",
};

/** Rótulo de um gatilho a partir da chave devolvida pelo servidor na caixa (sem abrir o caso e sem conteúdo do documento). */
export function describeInboxTrigger(key: string): string {
  if (key.startsWith("context:")) return `${FIELD_LABELS[key.slice("context:".length) as keyof typeof FIELD_LABELS] ?? "Campo"}: dispensado com justificativa`;
  if (key.startsWith("review:")) return "Documento: conferência com divergência ou indeterminada";
  return "Item que exige decisão humana";
}
export const INBOX_STATUS_LABELS = { pending: "Aguardando decisão", obsolete: "Obsoleta — o caso mudou", approved: "Aprovada", rejected: "Rejeitada", more_information: "Complementação solicitada" } as const;
export const INBOX_DECIDE_BLOCK_MESSAGES = {
  read_only: "Consulta somente leitura: nenhuma pendência é apresentada como ação sua.",
  policy_absent: "Sem a política de conferência humana neste workspace, nenhuma pendência é apresentada como ação sua.",
  not_designated: "Não há responsável designado para decidir neste ambiente: nenhuma pendência é apresentada como ação autorizada.",
} as const;

function decisionStep(humanItems: string[], allOtherDone: boolean, decision: OraculoDecisionViewV1 | null, hasRegisteredEvents: boolean): LogisticaJourneyStep {
  const needs = (detail: string): LogisticaJourneyStep => ({ id: "decision", title: "Decisão humana", state: "needs_human", detail, pendencies: humanItems });
  if (!humanItems.length) {
    return { id: "decision", title: "Decisão humana", state: allOtherDone ? "done" : "pending", detail: allOtherDone ? "Sem divergências nos campos conferidos. Aceite operacional segue fora deste fluxo." : "Aguardando dados e conferências.", pendencies: [] };
  }
  switch (decision?.coverage) {
    case "pending": return needs("Decisão solicitada neste caso. Aguardando um responsável elegível (diferente de quem pediu).");
    case "approved": return { id: "decision", title: "Decisão humana", state: "done", detail: "Decisão humana registrada: aprovada para esta base do caso. Não autoriza execução, aceite da devolução, custos nem transmissão.", pendencies: [] };
    case "rejected": return needs("Decisão humana registrada: rejeitada. Ajuste o caso e solicite nova decisão.");
    case "more_information": return needs("O responsável pediu complementação. Ajuste o caso e solicite nova decisão.");
    case "obsolete": return needs("A solicitação anterior ficou obsoleta porque o caso mudou. Solicite a decisão novamente.");
    default:
      // Caso com solicitações/decisões já registradas e a visão do servidor ainda não chegou: não afirma nada sobre a decisão.
      if (!decision && hasRegisteredEvents) return needs("Consultando a situação da decisão humana…");
      return needs("Existem itens que exigem decisão de um responsável autorizado. Solicite a decisão abaixo.");
  }
}

export function resolveLogisticaJourney(record: OraculoPreparationRecordV1 | null, decisionView: OraculoDecisionViewV1 | null = null): LogisticaJourneyView {
  if (!record) {
    return {
      caseShortId: null, revision: null, humanDecisionNeeded: false, forwardSummary: null,
      steps: [
        { id: "context", title: "Contexto da operação", state: "pending", detail: "Informe porto, depósito e fluxo quando conhecidos e salve a preparação.", pendencies: [] },
        { id: "operation_reference", title: "Referência declarada da operação", state: "pending", detail: "Opcional, mas necessária para comparar o documento.", pendencies: [] },
        { id: "evidence", title: "Documentos e evidências", state: "pending", detail: "Disponível depois de salvar a preparação.", pendencies: [] },
        { id: "review", title: "Conferência documental (humana)", state: "pending", detail: "Disponível depois de vincular um documento.", pendencies: [] },
        { id: "decision", title: "Decisão humana", state: "pending", detail: "Aparece quando houver divergência ou campo dispensado.", pendencies: [] },
      ],
      nextAction: "Salvar a preparação para abrir o caso.",
      results: ["Nenhum caso aberto nesta conversa."],
    };
  }
  const context = contextStep(record);
  const reference = referenceStep(record);
  const evidence = evidenceStep(record);
  const { step: review, divergences } = reviewStep(record);
  const humanItems = [
    ...context.pendencies.filter((line) => line.includes("requer revisão humana")),
    ...divergences,
  ];
  const humanDecisionNeeded = humanItems.length > 0;
  // A visão da decisão só vale para ESTA revisão do caso; uma visão de outra revisão (atrasada) é ignorada.
  const currentDecision = decisionView && decisionView.caseId === record.caseId && decisionView.revision === record.revision ? decisionView : null;
  const allDone = [context, reference, evidence, review].every((step) => step.state === "done");
  const decision = decisionStep(humanItems, allDone, currentDecision, (record.humanDecisions?.length ?? 0) > 0);
  const shortId = record.caseId.slice(0, 8);
  const steps = [context, reference, evidence, review, decision];
  const firstOpen = steps.find((step) => step.state !== "done");
  const reviews = record.contentReviews ?? [];
  const results = [
    `Caso ${shortId} · revisão ${record.revision}.`,
    `Documentos vinculados: ${record.evidences?.length ?? 0} · conferências registradas: ${reviews.length}.`,
    ...(reviews.length ? [`Última conferência: ${OUTCOME_LABELS[reviews[reviews.length - 1]!.outcome] ?? "registrada"} (transcrição humana).`] : []),
    ...(currentDecision && currentDecision.coverage !== "none" && currentDecision.coverage !== "no_decision_needed" ? [`Decisão humana nesta base do caso: ${({ pending: "solicitada, aguardando responsável", approved: "aprovada", rejected: "rejeitada", more_information: "complementação solicitada", obsolete: "solicitação obsoleta" } as const)[currentDecision.coverage]}.`] : []),
    "Aceite operacional, responsabilidade e custos: pendentes e fora deste fluxo.",
  ];
  const view: LogisticaJourneyView = {
    caseShortId: shortId, revision: record.revision, steps, results, humanDecisionNeeded,
    nextAction: firstOpen ? `${firstOpen.title}: ${firstOpen.detail}` : "Preparação concluída para esta etapa; aguarde o aceite operacional fora deste fluxo.",
    forwardSummary: null,
  };
  // O resumo copiável continua como apoio enquanto não há solicitação em curso nem decisão aprovada para a base atual.
  if (humanDecisionNeeded && currentDecision?.coverage !== "pending" && currentDecision?.coverage !== "approved") view.forwardSummary = buildForwardSummary(shortId, record.revision, humanItems);
  if (currentDecision?.coverage === "approved") view.humanDecisionNeeded = false;
  return view;
}

/** Texto para o responsável autorizado: só identificadores do caso, campos e divergências — sem e-mail, nome de pessoa ou conteúdo do documento. */
export function buildForwardSummary(shortId: string, revision: number, items: string[]): string {
  return [
    `Logística & Comex — ${LOGISTICA_JOURNEY_TITLE}`,
    `Caso ${shortId}, revisão ${revision}: decisão humana necessária.`,
    ...items.map((item) => `- ${item}`),
    "Este resumo não notifica ninguém nem autoriza a operação. Encaminhe-o ao responsável do workspace.",
  ].join("\n");
}
