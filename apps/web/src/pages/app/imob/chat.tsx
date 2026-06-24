import React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  ApiError,
  apiAgentsDiscovery,
  apiAgentsExecute,
  apiAgentsNegotiate,
  apiCreateImobChatConversation,
  apiCreateImobChatMessage,
  apiCreateImobChatTelemetry,
  apiGetBillingReconciliationSummary,
  apiGenerateImobContract,
  apiGetImobChatInterviewState,
  apiGetRun,
  apiGetRunCostBreakdown,
  apiSearchImobKnowledge,
  apiUploadDocuments,
  apiResolveImobAttachment,
  apiApplyImobAttachmentCrmSuggestion,
  apiFetchUploadBlob,
  apiLookupImobCep,
  apiListImobChatConversations,
  apiListImobChatMessages,
  apiListImobChatThreads,
  apiUpsertImobChatInterviewState,
  type ImobCaseContext,
  type ImobCaseRecommendedAction,
  type ImobAgentActivityEvent,
  type ImobChatConversation,
  type ImobContractInterviewState,
  type ImobChatMessage,
  type ImobChatThread,
  type ImobKnowledgeSearchResponse,
  type AgentProtocolActionContract,
  type ImobPresentationMetadata,
  type ImobPresentationBlock,
  type ImobPresentationForm,
  type ImobPresentationWidget,
} from "@/lib/api";
import { useSession } from "@/state/sessionStore";
import {
  resolveImobTurn,
  searchImobInventory,
  type ImobExecutionRequest,
  type ImobResolveTurnResponse,
  type ImobThreadConversationState,
} from "@/features/imob/imobApiClient";
import {
  applySingleFieldEditAnswer,
  applyContractInterviewAnswer,
  createInitialContractInterviewState,
  extractEditFieldQuery,
  getContractTypeLabel,
  getStepQuestionText,
  getContractTypePrompt,
  isAffirmativeAnswer,
  isNegativeAnswer,
  moveInterviewToEditableField,
  type ContractInterviewState,
} from "@/features/imob/contractInterviewEngine";
import {
  buildRuntimeExecutionProof,
  resolveTurnPresentationProof,
  resolveVisibleMessageProof,
} from "./chatProof";
import { ThreadPanel } from "@/features/imob/ThreadPanel";
import { ImobChatWidgets } from "@/features/imob/ImobChatWidgets";
import { ImobWorkbenchShell } from "@/features/imob/ImobWorkbenchShell";
import { VerticalSelectorBar } from "@/features/workbench/vertical-chat/VerticalSelectorBar";
import { ReactiveContextPanel } from "@/features/workbench/vertical-chat/ReactiveContextPanel";
import { ImobSlotCollectionCard } from "@/features/workbench/vertical-chat/ImobSlotCollectionCard";
import type { VerticalId, VerticalSelectorItem } from "@/features/workbench/vertical-chat/VerticalChatTypes";
import { extractImobWorkbenchIntakeContext } from "@/features/imob/imobWorkbenchContext";
import { KnowledgeCard, type KnowledgeAction } from "@/features/imob/KnowledgeCard";
import { ImobKnowledgeViewer } from "@/features/imob/ImobKnowledgeViewer";
import { ImobAccessGateCard } from "@/components/imob/ImobAccessGateCard";
import { ContextualCostPanel } from "@/components/billing/ContextualCostPanel";
import { resolveImobAccessGateCopy } from "@/features/imob/accessGateCatalog";
import { formatDataInputTemplate, getDataInputTemplate } from "@/domain/inputTemplates";
import { CONTRACT_SCHEMAS } from "@/features/imob/contractSchemas";
import { formatPct } from "@/lib/formatters";
import { formatReconciliationIssue } from "@/lib/reconciliation";
import {
  DIRECTED_ACTION_BADGE,
  shouldUseDirectedActionFlow,
  buildDirectedActionCard,
  buildAgentsExecuteMetadata,
} from "@/features/imob/imobChatDirectedAction";

type ChatState = "idle" | "typing" | "executing" | "awaiting_user_action" | "blocked" | "done";

type CardType = "action" | "risk" | "evidence" | "queue";

type CardCta = {
  id: string;
  label: string;
  kind?: "primary" | "secondary" | "neutral";
  href?: string;
  action?:
    | "confirm_execution"
    | "reject_execution"
    | "export_contract_pdf"
    | "continue_inventory_search"
    | "apply_attachment_crm_include"
    | "apply_attachment_crm_edit"
    | "apply_attachment_crm_discard"
    | "open_attachment_menu"
    | "send_suggested_message"
    | "print_card";
  nextMessage?: string;
  payload?: Record<string, unknown>;
};

type MessageCard = {
  type: CardType;
  title: string;
  lines: string[];
  compactConfirm?: boolean;
  thread?: {
    id: string;
    label: string;
    status?: "active" | "waiting" | "done" | "blocked";
  };
  runId?: string;
  ctas?: CardCta[];
  risk?: {
    level: "low" | "medium" | "high";
    trustScore?: number;
    reason?: string;
  };
  queue?: {
    status?: string;
    step?: string;
  };
  proof?: {
    required?: boolean;
    ready?: boolean;
    state?: "not_required" | "pending" | "ready" | "failed";
    runId?: string | null;
    txId?: string | null;
    receiptPath?: string | null;
    bundlePath?: string | null;
    verifyUrl?: string | null;
  };
  contract?: {
    title?: string;
    contractType?: string;
    schemaVersion?: string;
    legalVersion?: string;
    generatedAt?: string;
    hash?: string;
    text: string;
  };
  knowledgeResults?: ImobKnowledgeSearchResponse["items"];
  showConfirm?: boolean;
  actionsLayout?: "inline";
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  hiddenFromTimeline?: boolean;
  presentationMetadata?: ImobPresentationMetadata;
  blocks?: ImobPresentationBlock[];
  widget?: ImobPresentationWidget;
  form?: ImobPresentationForm;
  proof?: ImobResolveTurnResponse["presentation"]["proof"];
  thread?: {
    id: string;
    label: string;
    status?: "active" | "waiting" | "done" | "blocked";
  };
  card?: MessageCard;
  caseContext?: ImobCaseContext;
  consultBadge?: string | null;
  dispatchBadge?: string | null;
};

type PendingExecution = {
  plan: ImobExecutionRequest;
  contract: AgentProtocolActionContract;
  messageId: string;
  thread: {
    id: string;
    label: string;
  };
  flow?: ImobThreadConversationState["operational"] extends { flow: infer T } ? T : string;
  pendingFields?: string[];
  caseContext?: ImobCaseContext;
  presentationMeta?: Pick<ImobResolveTurnResponse["presentation"], "owner" | "nextStep" | "blocker" | "pendingFieldLabels" | "dedupeKey" | "suggestedNextAction">;
  presentationText: string;
  presentationProof?: ImobResolveTurnResponse["presentation"]["proof"];
  presentationForm?: ImobResolveTurnResponse["presentation"]["form"];
  presentationCard?: ImobResolveTurnResponse["presentation"]["card"];
  presentationBlocks?: ImobResolveTurnResponse["presentation"]["blocks"];
  receiptEndpointTemplate?: string;
  preparedAt: number;
  source?: string | null;
};

type RunFinanceSummary = {
  amountCents: number;
  estimatedAmountCents: number | null;
  tokens: number;
  issueLabel: string;
  hasGap: boolean;
};

function normalizeMessageCardProof(
  proof: MessageCard["proof"] | undefined,
): NonNullable<ChatMessage["proof"]> | undefined {
  if (!proof) return undefined;
  const runId = proof.runId ?? null;
  const txId = proof.txId ?? null;
  const receiptPath = proof.receiptPath ?? null;
  const bundlePath = proof.bundlePath ?? null;
  const verifyUrl = proof.verifyUrl ?? receiptPath ?? null;
  const ready = proof.ready ?? Boolean(txId && receiptPath && bundlePath);
  const required = proof.required ?? Boolean(runId || txId || receiptPath || bundlePath);
  return {
    required,
    ready,
    state: proof.state ?? (required ? (ready ? "ready" : "pending") : (ready ? "ready" : "not_required")),
    runId,
    txId,
    receiptPath,
    bundlePath,
    verifyUrl,
  };
}

function mapApiPresentationCard(
  card: ImobResolveTurnResponse["presentation"]["card"] | undefined,
  thread: { id: string; label: string; status?: "active" | "waiting" | "done" | "blocked" }
): MessageCard | undefined {
  if (!card) return undefined;
  return {
    type: "action",
    title: card.title,
    thread,
    lines: card.lines,
    ctas: normalizeCardCtas(card.ctas),
    actionsLayout: card.actionsLayout,
    proof: card.proof,
  };
}

function mapApiPresentationForm(
  form: ImobResolveTurnResponse["presentation"]["form"] | undefined,
): ImobPresentationForm | undefined {
  if (!form) return undefined;
  return {
    ...form,
    fields: form.fields.map((field) => ({ ...field, options: field.options?.map((option) => ({ ...option })) })),
    actions: form.actions?.map((action) => ({ ...action })),
  };
}

function mapApiPresentationBlocks(
  blocks: ImobResolveTurnResponse["presentation"]["blocks"] | undefined,
): ImobPresentationBlock[] | undefined {
  if (!blocks || blocks.length === 0) return undefined;
  return blocks.map((block) => ({
    ...block,
    ctas: normalizeCardCtas(block.ctas),
  }));
}

function buildAgentTimelineBlock(
  presentation: ImobResolveTurnResponse["presentation"],
): ImobPresentationBlock[] {
  const normalizedAgentActivities = presentation.agentActivities
    ?.filter(
      (activity): activity is ImobAgentActivityEvent =>
        Boolean(
          activity &&
            typeof activity.agentLabel === "string" &&
            activity.agentLabel.trim() &&
            typeof activity.visibleMessage === "string" &&
            activity.visibleMessage.trim(),
        ),
    )
    .map((activity) => ({
      ...activity,
      displayPrefix: activity.displayPrefix ?? "Agente",
    }));

  if (!normalizedAgentActivities?.length) return [];
  return [{
    kind: "agent_timeline",
    title: "Agentic IA em ação",
    agentActivities: normalizedAgentActivities,
  }];
}

function buildStructuredPresentationBlocks(
  presentation: ImobResolveTurnResponse["presentation"],
): ImobPresentationBlock[] {
  const blocks: ImobPresentationBlock[] = [...buildAgentTimelineBlock(presentation)];
  if (presentation.caseBrief) {
    blocks.push({
      kind: "summary",
      title: "Resumo do caso",
      lines: [
        presentation.caseBrief.summary,
        presentation.caseBrief.phaseObjective ? `Objetivo da fase: ${presentation.caseBrief.phaseObjective}` : null,
        presentation.caseBrief.primaryRisk ? `Risco principal: ${presentation.caseBrief.primaryRisk}` : null,
        presentation.caseBrief.waitingOn ? `WaitingOn: ${presentation.caseBrief.waitingOn}` : null,
        presentation.caseBrief.nextActionOwner ? `Owner da ação: ${presentation.caseBrief.nextActionOwner}` : null,
        presentation.caseBrief.nextSafeStep ? `Próximo passo seguro: ${presentation.caseBrief.nextSafeStep}` : null,
      ].filter((line): line is string => Boolean(line && line.trim())),
    });
  }

  if (presentation.preparedFollowUp) {
    blocks.push({
      kind: "details",
      title: "Follow-up preparado",
      text: presentation.preparedFollowUp.objective,
      lines: [
        `Destinatário: ${presentation.preparedFollowUp.recipientRole}`,
        `Gatilho: ${presentation.preparedFollowUp.trigger}`,
        presentation.preparedFollowUp.expectedReply ? `Resposta esperada: ${presentation.preparedFollowUp.expectedReply}` : null,
        presentation.preparedFollowUp.escalationHint ? `Escalada: ${presentation.preparedFollowUp.escalationHint}` : null,
      ].filter((line): line is string => Boolean(line && line.trim())),
      ctas: presentation.preparedFollowUp.variants.map((variant) => ({
        id: `prepared-follow-up-${variant.id}`,
        label: variant.label,
        kind: variant.tone === "direct" ? "primary" : "neutral",
        action: "send_suggested_message",
        nextMessage: variant.text,
      })),
      actionsLayout: "inline",
    });
  }

  if (presentation.actionableChecklist?.items?.length) {
    blocks.push({
      kind: "details",
      title: presentation.actionableChecklist.title,
      lines: presentation.actionableChecklist.items.map((item) =>
        `${item.title} · owner ${item.owner} · destrava ${item.unlocks} · urgência ${item.urgency}`,
      ),
    });
  }

  if (presentation.handoffPack) {
    blocks.push({
      kind: "details",
      title: "Pacote de handoff",
      lines: [
        `Destino: ${presentation.handoffPack.targetArea}`,
        `Motivo: ${presentation.handoffPack.reason}`,
        presentation.handoffPack.summary,
        presentation.handoffPack.blocker ? `Blocker: ${presentation.handoffPack.blocker}` : null,
        presentation.handoffPack.urgency ? `Urgência: ${presentation.handoffPack.urgency}` : null,
        presentation.handoffPack.ownershipBoundary ? `Boundary: ${presentation.handoffPack.ownershipBoundary}` : null,
        presentation.handoffPack.needsValidation.length
          ? `Validar: ${presentation.handoffPack.needsValidation.join(", ")}`
          : null,
        presentation.handoffPack.remainsWithBroker.length
          ? `Permanece com corretor: ${presentation.handoffPack.remainsWithBroker.join(" | ")}`
          : null,
      ].filter((line): line is string => Boolean(line && line.trim())),
    });
  }

  return blocks;
}

function buildPresentationBlocks(
  presentation: ImobResolveTurnResponse["presentation"],
): ImobPresentationBlock[] | undefined {
  const apiBlocks = mapApiPresentationBlocks(presentation.blocks) ?? [];
  const blocks = apiBlocks.length > 0
    ? [...apiBlocks, ...buildAgentTimelineBlock(presentation)]
    : buildStructuredPresentationBlocks(presentation);
  return blocks.length ? blocks : undefined;
}

function mapPresentationWidget(
  widget: ImobPresentationWidget | undefined,
): ImobPresentationWidget | undefined {
  if (!widget) return undefined;
  return JSON.parse(JSON.stringify(widget)) as ImobPresentationWidget;
}

type SelectedKnowledgeContext = {
  item: ImobKnowledgeSearchResponse["items"][number];
  sourceActions: KnowledgeAction[];
  threadId: string | null;
};

function buildSessionRunMapFromMessages(items: ChatMessage[]) {
  const map: Record<string, string> = {};
  for (const message of items) {
    const threadId = message.thread?.id ?? message.card?.thread?.id ?? null;
    const runId = message.card?.runId ?? null;
    if (!threadId || !runId) continue;
    if (!map[threadId]) {
      map[threadId] = runId;
    }
  }
  return map;
}

function buildCaseMapFromMessages(items: ChatMessage[]) {
  const map: Record<string, string> = {};
  for (const message of items) {
    const threadId = message.caseContext?.threadId ?? message.thread?.id ?? message.card?.thread?.id ?? null;
    const caseId = message.caseContext?.caseId ?? null;
    if (!threadId || !caseId) continue;
    if (!map[threadId]) {
      map[threadId] = caseId;
    }
  }
  return map;
}

function buildCaseContextMapFromMessages(items: ChatMessage[]) {
  const map: Record<string, ImobCaseContext> = {};
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const message = items[index];
    const threadId = message.caseContext?.threadId ?? message.thread?.id ?? message.card?.thread?.id ?? null;
    const caseContext = message.caseContext ?? null;
    if (!threadId || !caseContext || map[threadId]) continue;
    map[threadId] = caseContext;
  }
  return map;
}

function resolveBestCaseIdForThread(
  items: ChatMessage[],
  threadId: string | null | undefined,
  threadCaseMap: Record<string, string>,
  explicitCaseId?: string | null,
) {
  if (explicitCaseId && explicitCaseId.trim().length > 0) return explicitCaseId.trim();

  const scopedThreadId = typeof threadId === "string" && threadId.trim().length > 0 ? threadId.trim() : null;
  if (scopedThreadId && threadCaseMap[scopedThreadId]) return threadCaseMap[scopedThreadId];

  if (scopedThreadId) {
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const message = items[index];
      const messageThreadId = message.caseContext?.threadId ?? message.thread?.id ?? message.card?.thread?.id ?? null;
      const messageCaseId = message.caseContext?.caseId ?? null;
      if (messageThreadId === scopedThreadId && messageCaseId) {
        return messageCaseId;
      }
    }
  }

  for (let index = items.length - 1; index >= 0; index -= 1) {
    const messageCaseId = items[index].caseContext?.caseId ?? null;
    if (messageCaseId) return messageCaseId;
  }
  return null;
}

function dedupeRunMessages(items: ChatMessage[]) {
  const deduped: ChatMessage[] = [];
  for (const message of items) {
    const threadId = message.thread?.id ?? message.card?.thread?.id ?? null;
    const runId = message.card?.runId ?? null;
    const last = deduped[deduped.length - 1];
    const lastThreadId = last?.thread?.id ?? last?.card?.thread?.id ?? null;
    const lastRunId = last?.card?.runId ?? null;
    if (
      message.role === "assistant" &&
      last?.role === "assistant" &&
      threadId &&
      runId &&
      threadId == lastThreadId &&
      runId == lastRunId
    ) {
      deduped[deduped.length - 1] = message;
      continue;
    }
    deduped.push(message);
  }
  return deduped;
}

const SHOW_TECHNICAL_CHAT = false;
const SHOW_CHAT_FEEDBACK = false;
const HISTORY_PAGE_SIZE = 30;
const QUICK_PROMPTS = [
  {
    label: "Captar imóvel",
    prompt: "Quero iniciar uma captação no IMOB. Me mostre opções de próximos passos no chat.",
  },
  {
    label: "Gerar proposta",
    prompt: "Quero gerar uma proposta comercial para um cliente.",
  },
  {
    label: "Iniciar contrato",
    prompt: "Quero iniciar a coleta de dados para gerar um contrato imobiliário.",
  },
  {
    label: "Fechar venda",
    prompt: "Quero avançar a operação até o fechamento da venda e registrar os próximos passos.",
  },
] as const;

const TYPEWRITER_INTERVAL_MS = 12;
const TYPEWRITER_CHUNK_SIZE = 2;
const BLOCK_SEQUENCE_INTERVAL_MS = 36;

function TypewriterText(props: {
  text: string;
  animate: boolean;
  onComplete?: () => void;
}) {
  const { text, animate, onComplete } = props;
  const [visibleLength, setVisibleLength] = React.useState(() => (animate ? 0 : text.length));
  const onCompleteRef = React.useRef(onComplete);

  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  React.useEffect(() => {
    if (!animate) {
      setVisibleLength(text.length);
      return;
    }
    setVisibleLength(0);
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisibleLength(text.length);
      onCompleteRef.current?.();
      return;
    }
    const interval = window.setInterval(() => {
      setVisibleLength((current) => {
        const next = Math.min(text.length, current + TYPEWRITER_CHUNK_SIZE);
        if (next >= text.length) {
          window.clearInterval(interval);
          window.setTimeout(() => onCompleteRef.current?.(), 0);
        }
        return next;
      });
    }, TYPEWRITER_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [animate, text]);

  const visibleText = animate ? text.slice(0, visibleLength) : text;

  return (
    <p className="whitespace-pre-wrap">
      {visibleText}
      {animate && visibleLength < text.length ? <span className="ml-0.5 inline-block h-[1em] w-[1px] animate-pulse bg-current align-[-0.15em]" /> : null}
    </p>
  );
}

function isInternalOpsCta(cta: CardCta) {
  const label = cta.label.trim().toLowerCase();
  if (cta.href?.includes("/app/runs")) return true;
  return (
    label.includes("execução") ||
    label.includes("execucao") ||
    label.includes("detalhes") ||
    label.includes("histórico") ||
    label.includes("historico") ||
    label.includes("recibo")
  );
}

function TypingIndicatorBubble() {
  return (
    <div className="rounded-2xl bg-black/20 px-4 py-3 text-sm text-foreground transition">
      <div className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-current" />
      </div>
    </div>
  );
}

function SequentialInlineChoices(props: {
  items: CardCta[];
  animateSequence: boolean;
  renderItem: (cta: CardCta, index: number, visibleLabel: string, isTyping: boolean) => React.ReactNode;
  onComplete?: () => void;
}) {
  const { items, animateSequence, renderItem, onComplete } = props;
  const [activeIndex, setActiveIndex] = React.useState(() => (animateSequence ? 0 : Math.max(items.length - 1, 0)));
  const [activeLength, setActiveLength] = React.useState(() => (animateSequence ? 0 : (items[items.length - 1]?.label.length ?? 0)));
  const [completedCount, setCompletedCount] = React.useState(() => (animateSequence ? 0 : items.length));
  const labelsKey = React.useMemo(() => items.map((item) => item.id).join("|"), [items]);
  const onCompleteRef = React.useRef(onComplete);

  React.useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  React.useEffect(() => {
    if (!animateSequence) {
      setActiveIndex(Math.max(items.length - 1, 0));
      setActiveLength(items[items.length - 1]?.label.length ?? 0);
      setCompletedCount(items.length);
      return;
    }
    setActiveIndex(0);
    setActiveLength(0);
    setCompletedCount(0);
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setActiveIndex(Math.max(items.length - 1, 0));
      setActiveLength(items[items.length - 1]?.label.length ?? 0);
      setCompletedCount(items.length);
      onCompleteRef.current?.();
      return;
    }
    if (items.length === 0) {
      onCompleteRef.current?.();
      return;
    }
  }, [animateSequence, items, labelsKey]);

  React.useEffect(() => {
    if (!animateSequence) return;
    if (items.length === 0) return;
    if (completedCount >= items.length) return;
    const currentItem = items[activeIndex];
    if (!currentItem) return;

    const timer = window.setTimeout(() => {
      if (activeLength < currentItem.label.length) {
        setActiveLength((current) => Math.min(currentItem.label.length, current + 1));
        return;
      }

      const nextCompleted = activeIndex + 1;
      setCompletedCount(nextCompleted);

      if (nextCompleted >= items.length) {
        onCompleteRef.current?.();
        return;
      }

      setActiveIndex(nextCompleted);
      setActiveLength(0);
    }, BLOCK_SEQUENCE_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [activeIndex, activeLength, animateSequence, completedCount, items]);

  return (
    <>
      {items.map((cta, index) => {
        const visibleLength =
          index < completedCount
            ? cta.label.length
            : index === activeIndex
              ? activeLength
              : 0;
        if (visibleLength <= 0) return null;
        const isTyping = animateSequence && index === activeIndex && visibleLength < cta.label.length;
        return renderItem(cta, index, cta.label.slice(0, visibleLength), isTyping);
      })}
    </>
  );
}

function SequentialBlockLines(props: {
  items: string[];
  animateSequence: boolean;
  renderItem: (text: string, index: number, visibleText: string, isTyping: boolean) => React.ReactNode;
  onComplete?: () => void;
}) {
  const mappedItems = React.useMemo(
    () => props.items.map((text, index) => ({ id: `line-${index}-${text.slice(0, 18)}`, label: text })),
    [props.items],
  );
  return (
    <SequentialInlineChoices
      items={mappedItems}
      animateSequence={props.animateSequence}
      onComplete={props.onComplete}
      renderItem={(item, index, visibleLabel, isTyping) => props.renderItem(item.label, index, visibleLabel, isTyping)}
    />
  );
}

function formatCurrencyCents(amountCents: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format((amountCents ?? 0) / 100);
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeHumanText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isCardLeadRedundant(messageText: string, cardTitle: string, firstLine?: string) {
  if (!firstLine) return false;
  const msg = normalizeHumanText(messageText);
  const title = normalizeHumanText(cardTitle);
  const line = normalizeHumanText(firstLine);
  if (!msg || !line) return false;
  if (title === "lote processado") return false;
  if (msg === line || msg.includes(line) || line.includes(msg)) return true;
  if (title && (msg === title || msg.includes(title) || title.includes(msg))) return true;
  return false;
}

function resolveRunTemplatePath(template: string | undefined, runId: string): string | null {
  if (!template) return null;
  return template.replaceAll("{runId}", runId).replaceAll(":runId", runId);
}

function isLegacyImobSectionHref(href?: string) {
  if (!href) return false;
  return href === "/app/imob/properties" || href === "/app/imob/processes" || href === "/app/imob/partners";
}

function normalizeCardCta(cta: CardCta): CardCta {
  if (!isLegacyImobSectionHref(cta.href)) return cta;
  const section =
    cta.href === "/app/imob/properties" ? "imoveis" : cta.href === "/app/imob/partners" ? "parceiros" : "processos";
  return {
    ...cta,
    label: "Abrir Dashboard",
    href: `/app/imob/dashboard?section=${section}&cc=open#command-center`,
  };
}

function normalizeCardCtas(ctas?: CardCta[]) {
  if (!ctas || ctas.length === 0) return ctas;
  return ctas.map(normalizeCardCta);
}

function buildCanonicalRecommendedActionCtas(caseContext?: ImobCaseContext | null): CardCta[] {
  const recommended = (caseContext?.canonical?.recommendedActions ?? []) as ImobCaseRecommendedAction[];
  if (
    caseContext?.flow === "owner.create"
    && (caseContext.pendingItems?.length ?? 0) === 0
    && typeof caseContext.nextStep === "string"
    && caseContext.nextStep.toLowerCase().includes("vincular o proprietário".toLowerCase())
  ) {
    return [];
  }
  return recommended.slice(0, 3).map((action, index) => ({
    id: `canonical-${action.id}`,
    label: action.label,
    kind: index === 0 ? "primary" : "neutral",
    action: "send_suggested_message",
    nextMessage: action.inputHint ?? action.label,
    payload: {
      recommendedActionId: action.id,
      recommendedActionType: action.actionType,
      journeyType: caseContext?.canonical?.journeyType ?? null,
      stage: caseContext?.stage ?? null,
      reasonCode: action.reasonCode ?? null,
    },
  }));
}

function mergeRecommendedActionCtas(existing: CardCta[] | undefined, caseContext?: ImobCaseContext | null) {
  const canonicalCtas = buildCanonicalRecommendedActionCtas(caseContext);
  const normalizedExisting = normalizeCardCtas(existing) ?? [];
  if (canonicalCtas.length === 0) return normalizedExisting.length > 0 ? normalizedExisting : undefined;
  const merged: CardCta[] = [...normalizedExisting];
  for (const cta of canonicalCtas) {
    if (merged.some((item) => item.id === cta.id || item.label === cta.label)) continue;
    merged.push(cta);
  }
  return merged;
}

function formatCanonicalJourneyType(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "property_capture") return "Captação";
  if (normalized === "lead_qualification") return "Qualificação";
  if (normalized === "proposal") return "Proposta";
  if (normalized === "visit_follow_up") return "Visita";
  if (normalized === "negotiation") return "Negociação";
  if (normalized === "documentation") return "Documentação";
  if (normalized === "contract") return "Contrato";
  if (normalized === "closing") return "Fechamento";
  if (normalized === "commission") return "Comissão";
  if (normalized === "temporada_rules") return "Regras de temporada";
  return "Operação";
}

function buildCanonicalJourneyCard(caseContext?: ImobCaseContext | null): MessageCard | undefined {
  const recommended = caseContext?.canonical?.recommendedActions ?? [];
  if (!caseContext?.canonical?.journeyType || recommended.length === 0) return undefined;
  return {
    type: "action",
    title: "Próximas ações da jornada",
    lines: [
      `Jornada: ${formatCanonicalJourneyType(caseContext.canonical.journeyType)}`,
      `Etapa atual: ${caseContext.stage}`,
      ...(caseContext.nextStep ? [`Próximo passo recomendado: ${caseContext.nextStep}`] : []),
    ],
    ctas: mergeRecommendedActionCtas(undefined, caseContext),
    actionsLayout: "inline",
  };
}

function mapReplyCard(
  card: ImobResolveTurnResponse["presentation"]["card"] | undefined,
  thread: { id: string; label: string; status?: "active" | "waiting" | "done" | "blocked" },
  caseContext?: ImobCaseContext | null,
): MessageCard | undefined {
  const mapped = mapApiPresentationCard(card, thread);
  if (mapped) {
    return {
      ...mapped,
      ctas: mergeRecommendedActionCtas(mapped.ctas, caseContext),
    };
  }
  return buildCanonicalJourneyCard(caseContext);
}

function shouldSuppressLegacyCardFromPresentation(
  presentation: ImobResolveTurnResponse["presentation"] | undefined,
): boolean {
  const variant = presentation?.metadata?.canonicalSnapshot?.variant;
  const authoritative = presentation?.metadata?.canonicalSnapshot?.authoritative === true;
  if (!authoritative || !variant) return false;
  return (
    variant === "collecting_fields"
    || variant === "form_draft"
    || variant === "success_created"
    || variant === "success_updated"
    || variant === "success_deduped_update"
  );
}

function mapReplyCardFromPresentation(
  presentation: ImobResolveTurnResponse["presentation"] | undefined,
  thread: { id: string; label: string; status?: "active" | "waiting" | "done" | "blocked" },
  caseContext?: ImobCaseContext | null,
): MessageCard | undefined {
  if (!presentation || shouldSuppressLegacyCardFromPresentation(presentation)) return undefined;
  return mapReplyCard(presentation.card, thread, caseContext);
}

function buildJourneyTelemetryMetadata(caseContext?: ImobCaseContext | null, extra?: Record<string, unknown>) {
  return {
    journeyType: caseContext?.canonical?.journeyType ?? null,
    stage: caseContext?.stage ?? null,
    recommendedActionCount: caseContext?.canonical?.recommendedActions?.length ?? 0,
    caseId: caseContext?.caseId ?? null,
    ...extra,
  };
}

function isExternalHref(href?: string) {
  return typeof href === "string" && (/^https?:\/\//i.test(href) || href.startsWith("/api/uploads/"));
}

async function openUploadDocument(href: string) {
  const { blob } = await apiFetchUploadBlob(href);
  const objectUrl = URL.createObjectURL(blob);
  const opened = window.open(objectUrl, "_blank", "noopener,noreferrer");
  if (!opened) {
    window.location.href = objectUrl;
  }
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
}

function isAttachmentCrmSuggestionAction(action?: CardCta["action"]): action is "apply_attachment_crm_include" | "apply_attachment_crm_edit" | "apply_attachment_crm_discard" {
  return action === "apply_attachment_crm_include" || action === "apply_attachment_crm_edit" || action === "apply_attachment_crm_discard";
}

function isOpenAttachmentMenuAction(action?: CardCta["action"]): action is "open_attachment_menu" {
  return action === "open_attachment_menu";
}

function isSendSuggestedMessageAction(action?: CardCta["action"]): action is "send_suggested_message" {
  return action === "send_suggested_message";
}

function isInlineChoicePresentation(message: ChatMessage) {
  return (
    message.role === "assistant" &&
    message.presentationMetadata?.choiceStyle === "inline" &&
    Boolean(message.card?.ctas?.length)
  );
}

function normalizeImobFormValue(value: string) {
  return value.trim();
}

function isLikelyEmail(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return true;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(trimmed)) return false;
  if (trimmed.endsWith(".cm")) return false;
  return true;
}

function isLikelyPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return true;
  return digits.length >= 10 && digits.length <= 11;
}

function normalizeCepValue(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function resolveFieldAutofillTarget(
  field: ImobPresentationForm["fields"][number],
  target: "address" | "city" | "neighborhood",
) {
  return field.lookup?.kind === "cep" ? field.lookup.autoFillTargets[target] ?? null : null;
}

function buildPresentationFormDisplayText(form: ImobPresentationForm, actionId: "cancel" | "submit") {
  const actionLabel = form.actions?.find((action) => action.id === actionId)?.label?.trim();
  const formLabel = form.label?.trim();
  const fallbackByEntity =
    form.entity === "imovel"
      ? "Cadastrar imóvel"
      : form.entity === "proprietario" || form.entity === "vendedor" || form.entity === "locador"
        ? "Cadastrar proprietário"
        : form.entity === "lead" || form.entity === "comprador" || form.entity === "locatario"
          ? "Qualificar lead"
          : form.entity === "documentos"
            ? "Revisar documentos"
            : "Continuar";
  if (actionId === "submit") {
    if (actionLabel && /salvar/i.test(actionLabel)) return actionLabel;
    return formLabel || fallbackByEntity;
  }
  return actionLabel || formLabel || fallbackByEntity;
}

function allowsPartialCreateSave(form: ImobPresentationForm) {
  if (form.action !== "create") return false;
  return [
    "proprietario",
    "vendedor",
    "locador",
    "imovel",
    "lead",
    "comprador",
    "locatario",
  ].includes(form.entity);
}

function printMessageCard(message: ChatMessage) {
  if (!message.card) return;
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
  if (!printWindow) return;
  const safeTitle = message.card.title.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const safeLines = message.card.lines
    .map((line) => line.replace(/</g, "&lt;").replace(/>/g, "&gt;"))
    .map((line) => `<li>${line}</li>`)
    .join("");
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title><style>body{font-family:Arial,sans-serif;padding:32px;color:#111}h1{font-size:24px;margin:0 0 16px}ul{padding-left:20px}li{margin:8px 0}</style></head><body><h1>${safeTitle}</h1><ul>${safeLines}</ul></body></html>`);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function buildPresentationFormSubmission(form: ImobPresentationForm, values: Record<string, string>) {
  const normalized: Record<string, string> = {};
  for (const field of form.fields) {
    normalized[field.name] = normalizeImobFormValue(values[field.name] ?? String(field.value ?? ""));
  }
  const linesByEntity: Record<string, Array<string | null>> = {
    proprietario: [
      normalized.ownerName ? `nome do proprietário ${normalized.ownerName}` : null,
      normalized.ownerPhone ? `telefone do proprietário ${normalized.ownerPhone}` : null,
      normalized.ownerEmail ? `e-mail do proprietário ${normalized.ownerEmail}` : null,
      normalized.ownerDocument ? `documento do proprietário ${normalized.ownerDocument}` : null,
    ],
    vendedor: [
      normalized.ownerName ? `nome do vendedor ${normalized.ownerName}` : null,
      normalized.ownerPhone ? `telefone do vendedor ${normalized.ownerPhone}` : null,
      normalized.ownerEmail ? `e-mail do vendedor ${normalized.ownerEmail}` : null,
      normalized.ownerDocument ? `documento do vendedor ${normalized.ownerDocument}` : null,
    ],
    locador: [
      normalized.ownerName ? `nome do locador ${normalized.ownerName}` : null,
      normalized.ownerPhone ? `telefone do locador ${normalized.ownerPhone}` : null,
      normalized.ownerEmail ? `e-mail do locador ${normalized.ownerEmail}` : null,
      normalized.ownerDocument ? `documento do locador ${normalized.ownerDocument}` : null,
    ],
    imovel: [
      normalized.propertyType ? `tipo do imóvel ${normalized.propertyType}` : null,
      normalized.goal ? `finalidade do imóvel ${normalized.goal}` : null,
      normalized.cep ? `cep do imóvel ${normalized.cep}` : null,
      normalized.city ? `cidade do imóvel ${normalized.city}` : null,
      normalized.address ? `endereço do imóvel ${normalized.address}` : null,
    ],
    comprador: [
      normalized.leadName ? `nome do comprador ${normalized.leadName}` : null,
      normalized.leadPhone ? `telefone do comprador ${normalized.leadPhone}` : null,
      normalized.leadEmail ? `e-mail do comprador ${normalized.leadEmail}` : null,
      normalized.desiredGoal ? `objetivo do comprador ${normalized.desiredGoal}` : null,
      normalized.desiredCity ? `cidade de interesse do comprador ${normalized.desiredCity}` : null,
      normalized.budgetMax ? `faixa de orçamento do comprador ${normalized.budgetMax}` : null,
    ],
    locatario: [
      normalized.leadName ? `nome do locatário ${normalized.leadName}` : null,
      normalized.leadPhone ? `telefone do locatário ${normalized.leadPhone}` : null,
      normalized.leadEmail ? `e-mail do locatário ${normalized.leadEmail}` : null,
      normalized.desiredGoal ? `objetivo do locatário ${normalized.desiredGoal}` : null,
      normalized.desiredCity ? `cidade de interesse do locatário ${normalized.desiredCity}` : null,
      normalized.budgetMax ? `faixa de orçamento do locatário ${normalized.budgetMax}` : null,
    ],
    lead: [
      normalized.leadName ? `nome do lead ${normalized.leadName}` : null,
      normalized.leadPhone ? `telefone do lead ${normalized.leadPhone}` : null,
      normalized.leadEmail ? `e-mail do lead ${normalized.leadEmail}` : null,
      normalized.desiredGoal ? `objetivo do lead ${normalized.desiredGoal}` : null,
      normalized.desiredCity ? `cidade de interesse do lead ${normalized.desiredCity}` : null,
      normalized.budgetMax ? `faixa de orçamento do lead ${normalized.budgetMax}` : null,
    ],
    proposta: [
      normalized.propertyId ? `imóvel da proposta ${normalized.propertyId}` : null,
      normalized.buyerName ? `nome do comprador ${normalized.buyerName}` : null,
      normalized.buyerPhone ? `telefone do comprador ${normalized.buyerPhone}` : null,
      normalized.buyerEmail ? `e-mail do comprador ${normalized.buyerEmail}` : null,
      normalized.offerAmount ? `valor da proposta ${normalized.offerAmount}` : null,
      normalized.contractType ? `tipo de proposta ${normalized.contractType}` : null,
    ],
    anuncio: [
      normalized.propertyId ? `imóvel ${normalized.propertyId}` : null,
      normalized.listingTitle ? `título ${normalized.listingTitle}` : null,
      normalized.publicationGoal ? `para ${normalized.publicationGoal}` : null,
      normalized.publicationChannels ? `canais ${normalized.publicationChannels}` : null,
    ],
    documento: [
      normalized.referenceId ? `imóvel ${normalized.referenceId}` : null,
      normalized.subjectType ? `documento de ${normalized.subjectType}` : null,
      normalized.documentTypes ? `tipos ${normalized.documentTypes}` : null,
      normalized.deliveryChannel ? `via ${normalized.deliveryChannel}` : null,
    ],
    "contrato:history": [
      normalized.propertyId ? `histórico do contrato do imóvel ${normalized.propertyId}` : "histórico do contrato",
      normalized.counterpartyName ? `lead ${normalized.counterpartyName}` : null,
    ],
    "contrato:create": [
      normalized.propertyId ? `preparar contrato do imóvel ${normalized.propertyId}` : "preparar contrato",
      normalized.counterpartyName ? `lead ${normalized.counterpartyName}` : null,
      normalized.contractType ? `contrato ${normalized.contractType}` : null,
      normalized.documentPacketStatus ? normalized.documentPacketStatus : null,
    ],
    "contrato:sendForSignature": [
      normalized.propertyId ? `enviar contrato para assinatura do imóvel ${normalized.propertyId}` : "enviar contrato para assinatura",
      normalized.counterpartyName ? `lead ${normalized.counterpartyName}` : null,
      normalized.contractType ? `contrato ${normalized.contractType}` : null,
      normalized.documentPacketStatus ? normalized.documentPacketStatus : null,
    ],
  };
  const compositeKey = `${form.entity}:${form.action}`;
  if ((form.entity === "proprietario" || form.entity === "vendedor" || form.entity === "locador") && form.action !== "update") {
    return [
      "cadastrar proprietário",
      ...(linesByEntity[form.entity] ?? []),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (compositeKey === "proprietario:update" || compositeKey === "vendedor:update" || compositeKey === "locador:update") {
    return [
      form.subjectId ? `atualizar proprietário ${form.subjectId}` : "atualizar proprietário",
      ...(linesByEntity[form.entity] ?? []),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (compositeKey === "imovel:update") {
    return [
      form.subjectId ? `atualizar imóvel ${form.subjectId}` : "atualizar imóvel",
      ...(linesByEntity[form.entity] ?? []),
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (compositeKey === "proposta:create") {
    return [
      "continuar proposta",
      ...(linesByEntity.proposta ?? []),
    ]
      .filter(Boolean)
      .join("\n");
  }

  return (linesByEntity[compositeKey] ?? linesByEntity[form.entity] ?? [])
    .filter(Boolean)
    .join("\n");
}

function mapKnowledgeActions(ctas: CardCta[] | undefined, threadId: string | null, resolveHref: (href: string, explicitThreadId?: string | null) => string) {
  return (
    normalizeCardCtas(ctas)
      ?.filter((cta): cta is CardCta & { href: string } => Boolean(cta.href))
      .map((cta) => ({
        id: cta.id,
        label: cta.label,
        href: resolveHref(cta.href, threadId),
      })) ?? []
  );
}

function selectKnowledgeActions(item: ImobKnowledgeSearchResponse["items"][number], actions: KnowledgeAction[]) {
  const byId = new Map(actions.map((action) => [action.id, action]));
  const picked: KnowledgeAction[] = [];
  const push = (action?: KnowledgeAction | null) => {
    if (!action) return;
    if (picked.some((current) => current.id === action.id || current.label === action.label)) return;
    if (picked.length >= 2) return;
    picked.push(action);
  };

  push(
    item.sourceType === "drive"
      ? { id: "knowledge-drive-primary", label: /\/file\/d\//i.test(item.href) || /open\?id=/i.test(item.href) ? "Abrir no Drive" : "Buscar no Drive", href: item.href }
      : { id: "knowledge-open-primary", label: "Abrir documento", href: item.href }
  );
  push(byId.get("drive-search"));
  if (picked.length < 2) {
    push(byId.get("drive-folder"));
  }
  return picked;
}

function selectKnowledgeCardActions(actions: KnowledgeAction[]) {
  const moreAction =
    actions.find((action) => action.id === "drive-search") ??
    actions.find((action) => action.id === "drive-folder") ??
    actions[0];
  if (!moreAction) return [];
  return [{ ...moreAction, label: "Ver mais materiais" }];
}

function getIntentActionCtas(intent: ImobExecutionRequest["intent"]): CardCta[] {
  switch (intent) {
    case "capture":
    case "listing":
      return [{ id: "go-dashboard", label: "Abrir Dashboard", kind: "neutral", href: "/app/imob/dashboard?section=imoveis&cc=open#command-center" }];
    case "match":
    case "lead":
    case "visit":
      return [{ id: "go-dashboard", label: "Abrir Dashboard", kind: "neutral", href: "/app/imob/dashboard?section=parceiros&cc=open#command-center" }];
    case "proposal":
    case "contract":
    case "commission":
    case "adjustment":
    default:
      return [{ id: "go-dashboard", label: "Abrir Dashboard", kind: "neutral", href: "/app/imob/dashboard?section=processos&cc=open#command-center" }];
  }
}

function getCardTypeChip(type: CardType) {
  if (type === "risk") return "Atenção";
  if (type === "evidence") return "Comprovante";
  if (type === "queue") return "Andamento";
  return "Próximo passo";
}

function getIntentThreadLabel(intent: ImobExecutionRequest["intent"]) {
  switch (intent) {
    case "capture":
      return "Captação";
    case "match":
      return "Busca de imóveis";
    case "lead":
      return "Lead";
    case "visit":
      return "Visita";
    case "listing":
      return "Listing";
    case "proposal":
      return "Proposta";
    case "contract":
      return "Contrato";
    case "commission":
      return "Comissão";
    case "adjustment":
    default:
      return "Ajuste";
  }
}

function getCtaClass(kind: CardCta["kind"]) {
  if (kind === "primary") {
    return "border-accent/60 bg-black/25 text-foreground transition hover:bg-black/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";
  }
  if (kind === "secondary") {
    return "border-rose-300/50 bg-rose-500/10 text-rose-200 transition hover:bg-rose-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40";
  }
  return "border-white/20 bg-white/10 text-foreground transition hover:border-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";
}

function formatRelativeTime(timestamp?: string | null) {
  if (!timestamp) return "sem atividade";
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "sem atividade";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (diffMinutes < 1) return "agora";
  if (diffMinutes < 60) return `${diffMinutes}m`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d`;
}

function buildContractPdfFileName(contractType?: string) {
  const type = (contractType ?? "imob").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `contrato-${type}-${stamp}.pdf`;
}

function deriveConversationStatus(conversation: ImobChatConversation): "normal" | "attention" | "success" {
  const preview = (conversation.lastMessagePreview ?? "").toLowerCase();
  if (preview.includes("error") || preview.includes("bloquead")) return "attention";
  if (conversation.lastTxId) return "success";
  return "normal";
}

function getNextConversationTitle(conversations: ImobChatConversation[]) {
  const prefix = "Chat Operacional IMOB";
  let max = 0;
  for (const conversation of conversations) {
    const title = conversation.title.trim();
    if (title === prefix) {
      max = Math.max(max, 1);
      continue;
    }
    const match = title.match(/^Chat Operacional IMOB #([0-9]+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n)) max = Math.max(max, n);
    }
  }
  const next = max + 1;
  return next <= 1 ? prefix : `${prefix} #${next}`;
}

function getConversationTitleFromMessage(message: string, conversations: ImobChatConversation[]) {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length < 4) return getNextConversationTitle(conversations);
  return cleaned.length > 72 ? `${cleaned.slice(0, 72)}...` : cleaned;
}

function formatMs(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value)} ms`;
}

function formatUploadSize(sizeBytes: number) {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return "0 B";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getHumanPlanLines(intent: ImobExecutionRequest["intent"]) {
  switch (intent) {
    case "capture":
      return ["Posso iniciar a captação agora."];
    case "match":
      return ["Posso começar a busca de opções agora."];
    case "lead":
      return ["Posso iniciar a qualificação do lead agora."];
    case "visit":
      return ["Posso organizar o agendamento da visita agora."];
    case "listing":
      return ["Posso preparar a ativação do anúncio agora."];
    case "proposal":
      return ["Posso preparar a proposta agora."];
    case "contract":
      return ["Posso iniciar o fluxo de contrato agora."];
    case "commission":
      return ["Posso iniciar o fluxo de comissão agora."];
    case "adjustment":
    default:
      return ["Posso aplicar esse ajuste agora."];
  }
}

function humanRunStatus(status: string) {
  if (status === "pending") return "Estou preparando os próximos passos.";
  if (status === "running") return "Estou processando sua solicitação.";
  if (status === "success") return "Concluí essa etapa com sucesso.";
  if (status === "blocked") return "Essa etapa precisa da sua revisão para continuar.";
  if (status === "error") return "Tive um problema nessa etapa. Posso tentar novamente.";
  return "Estou avançando com a operação.";
}

function getThreadBusinessArea(threadLabel?: string | null, flow?: string | null) {
  const normalizedFlow = (flow ?? "").toLowerCase();
  if (normalizedFlow === "lead.qualify") return "lead";
  if (normalizedFlow === "proposal.create") return "proposal";
  if (normalizedFlow === "visit.schedule") return "visit";
  if (normalizedFlow === "contract.prepare") return "contract";
  if (normalizedFlow === "commission.settle") return "commission";
  if (normalizedFlow === "owner.create" || normalizedFlow === "property.create") return "capture";

  const normalized = (threadLabel ?? "").toLowerCase();
  if (normalized.includes("contrato")) return "contract";
  if (normalized.includes("capta")) return "capture";
  if (normalized.includes("proposta")) return "proposal";
  if (normalized.includes("visita")) return "visit";
  if (normalized.includes("lead")) return "lead";
  if (normalized.includes("comiss")) return "commission";
  if (normalized.includes("busca") || normalized.includes("imove")) return "match";
  if (normalized.includes("ajuste")) return "adjustment";
  return "general";
}

function humanRunStatusBusiness(status: string, threadLabel?: string | null, flow?: string | null) {
  const area = getThreadBusinessArea(threadLabel, flow);
  if (status === "pending" || status === "running") {
    if (area === "commission") return "Estou conduzindo a liquidação da comissão.";
    if (area === "contract") return "Estou conduzindo o handoff jurídico do contrato.";
    if (area === "proposal") return "Estou conduzindo a proposta imobiliária.";
    if (area === "visit") return "Estou conduzindo o agendamento da visita.";
    if (area === "lead") return "Estou conduzindo o cadastro e a qualificação do lead.";
    if (flow === "owner.create") return "Estou conduzindo o cadastro do proprietário.";
    if (flow === "property.create") return "Estou conduzindo o cadastro do imóvel.";
    if (area === "capture") return "Estou conduzindo a captação imobiliária.";
    if (area === "match") return "Estou conduzindo a busca operacional do IMOB.";
  }
  if (status === "success") {
    if (area === "commission") return "Liquidação da comissão iniciada com sucesso.";
    if (area === "contract") return "Handoff jurídico do contrato iniciado com sucesso.";
    if (area === "proposal") return "Proposta registrada com sucesso.";
    if (area === "visit") return "Visita agendada com sucesso.";
    if (area === "lead") return "Lead cadastrado e qualificado com sucesso.";
    if (flow === "owner.create") return "Cadastro do proprietário criado com sucesso.";
    if (flow === "property.create") return "Cadastro do imóvel processado.";
    if (area === "capture") return "Cadastro operacional da captação processado.";
    if (area === "match") return "Busca operacional concluída com sucesso.";
  }
  return humanRunStatus(status);
}

type OperationalOwner = "Corretor" | "Jurídico" | "Financeiro" | "Cliente" | "IMOB Ops";

type OperationalPresentationMeta = Pick<
  ImobResolveTurnResponse["presentation"],
  "owner" | "nextStep" | "blocker" | "pendingFieldLabels" | "dedupeKey" | "suggestedNextAction"
>;

function sanitizeOperationalNextStepCopy(value: string | null | undefined) {
  const text = (value ?? "").trim();
  if (!text) return null;
  return text.replace(/^vincular\s+do\s+/i, "Vincular o ");
}

function formatOperationalPendingField(field: string, threadLabel?: string | null, flow?: string | null) {
  const area = getThreadBusinessArea(threadLabel, flow);
  const common: Record<string, string> = {
    propertyId: "imóvel de referência",
    contractType: "tipo de contrato",
    approvalRequired: "aprovação humana",
    dealId: "negócio",
    buyerName: "nome do comprador",
    buyerPhone: "telefone do comprador",
    buyerEmail: "e-mail do comprador",
    offerAmount: "valor da proposta",
    leadName: "nome do lead",
    leadPhone: "telefone do lead",
    leadEmail: "e-mail do lead",
    desiredGoal: "objetivo do lead",
    desiredCity: "cidade de interesse",
    budgetMax: "faixa de orçamento",
    visitorName: "nome do visitante",
    visitorPhone: "telefone do visitante",
    preferredDate: "data da visita",
    preferredWindow: "turno da visita",
    counterpartyName: "nome da contraparte",
    documentPacketStatus: "pacote documental",
    brokerRef: "corretor responsável",
    amountCents: "valor da comissão",
    payoutChannel: "canal de repasse",
    settlementStatus: "status da liquidação",
  };
  if (area === "contract" && field === "propertyId") return "imóvel do contrato";
  if (area === "proposal" && field === "propertyId") return "imóvel da proposta";
  if (area === "visit" && field === "propertyId") return "imóvel da visita";
  if (area === "commission" && field === "dealId") return "negócio da comissão";
  return common[field] ?? field;
}

function formatOperationalPendingFields(
  pendingFields?: string[],
  threadLabel?: string | null,
  presentationMeta?: OperationalPresentationMeta,
  flow?: string | null
) {
  if (presentationMeta?.pendingFieldLabels?.length) return presentationMeta.pendingFieldLabels;
  if (!pendingFields?.length) return [];
  return pendingFields.map((field) => formatOperationalPendingField(field, threadLabel, flow));
}

function buildOperationalNextStep(
  threadLabel?: string | null,
  runStatus?: string | null,
  pendingFields?: string[],
  presentationMeta?: OperationalPresentationMeta,
  flow?: string | null
): { owner: OperationalOwner; nextStep: string; blocker?: string | null; dedupeKey?: string } | null {
  const area = getThreadBusinessArea(threadLabel, flow);
  const isBlocked = runStatus === "blocked" || runStatus === "error";
  const pending = formatOperationalPendingFields(pendingFields, threadLabel, presentationMeta, flow);

  if (presentationMeta?.owner || presentationMeta?.nextStep || presentationMeta?.blocker || presentationMeta?.dedupeKey) {
    return {
      owner: (presentationMeta.owner as OperationalOwner | undefined) ?? (area === "contract" ? "Jurídico" : area === "commission" ? "Financeiro" : "Corretor"),
      nextStep:
        sanitizeOperationalNextStepCopy(presentationMeta.nextStep) ??
        (area === "commission"
          ? pending.length > 0
            ? "Confirmar pendências da comissão antes do repasse."
            : "Validar liquidação e acompanhar repasse da comissão."
          : area === "contract"
            ? pending.length > 0
              ? "Completar dados contratuais e validar pacote documental."
              : "Revisar minuta e validar pacote documental."
            : area === "proposal"
              ? pending.length > 0
                ? "Completar dados do comprador e ajustar a proposta."
                : "Confirmar dados do comprador e acompanhar aceite da proposta."
              : area === "visit"
                ? pending.length > 0
                  ? "Completar dados da visita antes da confirmação."
                  : "Confirmar agenda com cliente e imóvel."
                : "Confirmar próximos passos operacionais."),
      blocker: presentationMeta.blocker ?? null,
      dedupeKey: presentationMeta.dedupeKey,
    };
  }

  if (area === "commission") {
    return {
      owner: "Financeiro",
      nextStep: pending.length > 0 ? "Confirmar pendências da comissão antes do repasse." : "Validar liquidação e acompanhar repasse da comissão.",
      blocker: isBlocked ? "Validar dados de comissão antes do repasse." : null,
    };
  }
  if (area === "contract") {
    return {
      owner: "Jurídico",
      nextStep: pending.length > 0 ? "Completar dados contratuais e validar pacote documental." : "Revisar minuta e validar pacote documental.",
      blocker: isBlocked ? "Revisão jurídica ou pacote documental pendente." : null,
    };
  }
  if (area === "proposal") {
    return {
      owner: "Corretor",
      nextStep: pending.length > 0 ? "Completar dados do comprador e ajustar a proposta." : "Confirmar dados do comprador e acompanhar aceite da proposta.",
      blocker: isBlocked ? "Dados do comprador ou proposta incompletos." : null,
    };
  }
  if (area === "lead") {
    return {
      owner: "Corretor",
      nextStep: pending.length > 0 ? "Completar dados do lead e revisar o interesse comercial." : "Vincular o lead a um imóvel ou avançar para visita.",
      blocker: isBlocked ? "Dados do lead ainda estão incompletos para seguir." : null,
    };
  }
  if (area === "visit") {
    return {
      owner: "Corretor",
      nextStep: pending.length > 0 ? "Completar dados da visita antes da confirmação." : "Confirmar agenda com cliente e imóvel.",
      blocker: isBlocked ? "Confirmação de agenda ou contato pendente." : null,
    };
  }
  if (area === "capture") {
    return {
      owner: "Corretor",
      nextStep:
        flow === "owner.create"
          ? pending.length > 0
            ? "Completar dados do proprietário antes de avançar a captação."
            : "Vincular o proprietário ao próximo imóvel ou etapa documental."
          : flow === "property.create"
            ? pending.length > 0
              ? "Completar dados do imóvel antes de avançar a captação."
              : "Vincular o imóvel ao próximo lead ou etapa comercial/documental."
            : pending.length > 0
              ? "Completar dados da captação antes de avançar."
              : "Confirmar endereço, tipo do imóvel e valor desejado.",
      blocker: null,
    };
  }
  return null;
}

function nextBusinessStep(
  status: string,
  threadLabel?: string | null,
  pendingFields?: string[],
  presentationMeta?: OperationalPresentationMeta,
  flow?: string | null
) {
  const operational = buildOperationalNextStep(threadLabel, status, pendingFields, presentationMeta, flow);
  if (!operational) return [];

  const lines: string[] = [];
  const pending = formatOperationalPendingFields(pendingFields, threadLabel, presentationMeta, flow);
  const normalizedSuggestedNextAction = (presentationMeta?.suggestedNextAction ?? "").trim().toLowerCase();
  const normalizedOperationalNextStep = operational.nextStep.trim().toLowerCase();
  const area = getThreadBusinessArea(threadLabel, flow);
  const isCaptureFormPendingState =
    area === "capture"
    && pending.length > 0
    && /avançar a captação/i.test(operational.nextStep);

  if (isCaptureFormPendingState) {
    return [`Próximo passo: ${operational.nextStep}`];
  }

  if (operational.blocker) {
    lines.push(`Bloqueio atual: ${operational.blocker}`);
  }
  if (pending.length > 0) {
    lines.push(`Pendências atuais: ${pending.join(", ")}.`);
  }
  if (pending.length > 0 && presentationMeta?.suggestedNextAction && normalizedSuggestedNextAction !== normalizedOperationalNextStep) {
    lines.push(presentationMeta.suggestedNextAction);
  }

  lines.push(`Próximo passo: ${operational.nextStep}`);

  return lines;
}

function buildHumanOperationalUpdate(
  status: string,
  threadLabel?: string | null,
  pendingFields?: string[],
  presentationMeta?: OperationalPresentationMeta,
  flow?: string | null,
  options?: { suppressNextStep?: boolean }
) {
  const area = getThreadBusinessArea(threadLabel, flow);
  const hasPending = Boolean((presentationMeta?.pendingFieldLabels?.length ?? 0) || pendingFields?.length);
  const summary = (() => {
    if (!hasPending) return humanRunStatusBusiness(status, threadLabel, flow);
    if (area === "capture" && /avançar a captação/i.test(presentationMeta?.nextStep ?? "")) return "";
    if (area === "proposal") return "A proposta ainda precisa de complementos para seguir.";
    if (area === "visit") return "A visita ainda precisa de confirmações para seguir.";
    if (area === "lead") return "O cadastro do lead ainda precisa de complementos para seguir.";
    if (flow === "owner.create" || flow === "property.create") return "";
    if (area === "contract") return "O fluxo de contrato ainda precisa de complementos para seguir.";
    if (area === "commission") return "A liquidação da comissão ainda precisa de confirmações para seguir.";
    return humanRunStatusBusiness(status, threadLabel, flow);
  })();
  const followUps = options?.suppressNextStep ? [] : nextBusinessStep(status, threadLabel, pendingFields, presentationMeta, flow);
  if (!["commission", "contract", "proposal", "visit", "lead"].includes(area) && flow !== "owner.create" && flow !== "property.create" && !presentationMeta?.suggestedNextAction) return summary;
  if (followUps.length === 0) return summary;
  return [summary, ...followUps].filter((line) => Boolean(line?.trim())).join("\n");
}

function pickPostSuccessBlocks(blocks: ImobPresentationBlock[] | undefined) {
  if (!blocks?.length) return [];
  return blocks.filter((block) => block.phase === "post_success");
}

function buildPostSuccessPresentationFromBlocks(blocks: ImobPresentationBlock[]) {
  const confirmation = blocks.find((block) => block.kind === "confirmation" && block.text?.trim());
  const summary = blocks.find((block) => block.kind === "summary");
  const nextActions = blocks.find((block) => block.kind === "next_actions" && (block.ctas?.length ?? 0) > 0);
  return {
    text: confirmation?.text?.trim() ?? null,
    lines: summary?.lines?.filter((line): line is string => typeof line === "string" && line.trim().length > 0) ?? [],
    ctas: nextActions?.ctas ? normalizeCardCtas(nextActions.ctas) : undefined,
    actionsLayout: nextActions?.actionsLayout,
    title: nextActions?.title ?? "Próximos passos",
    blocks,
  };
}

function buildRentalContractTemplateMessage(thread: { id: string; label: string; status?: "active" | "waiting" | "done" | "blocked" }): ChatMessage {
  const rentalTemplate = getDataInputTemplate("imob.locacao_contrato_v2");
  const fallbackLines = [
    "Locador: Nome completo | CPF/CNPJ | Telefone | E-mail",
    "Locatario: Nome completo | CPF | Telefone | E-mail",
    "Imovel: Endereco completo | Tipo | Matricula (se houver)",
    "Condicoes: Prazo (meses) | Valor aluguel | Vencimento | Garantia",
  ];
  const formattedTemplate = rentalTemplate
    ? formatDataInputTemplate(rentalTemplate)
    : `TEMPLATE DE DADOS (LOCACAO)\n${fallbackLines
        .map((line) => {
          const [label, values] = line.split(": ");
          const withBrackets = (values ?? "")
            .split("|")
            .map((field) => `[${field.trim()}]`)
            .join(" | ");
          return `${label}: ${withBrackets}`;
        })
        .join("\n")}`;
  const cardLines = rentalTemplate
    ? rentalTemplate.sections.map((section) => `${section.label}: ${section.fields.join(" | ")}`)
    : fallbackLines;

  return {
    id: makeId("assistant"),
    role: "assistant",
    text: ["Para concluir o contrato, preencha este template:", "", formattedTemplate].join("\n"),
    thread,
    card: {
      type: "action",
      title: rentalTemplate?.title ?? "Template de dados (locacao)",
      thread,
      lines: cardLines,
    },
  };
}

function mapStoredMessageToChat(message: ImobChatMessage): ChatMessage {
  const metadata = (message.metadata && typeof message.metadata === "object"
    ? message.metadata
    : null) as Record<string, unknown> | null;
  const cardCandidate = metadata?.card;
  const card =
    cardCandidate && typeof cardCandidate === "object" && !Array.isArray(cardCandidate)
      ? (cardCandidate as MessageCard)
      : undefined;
  const normalizedCard = card
    ? {
        ...card,
        ctas: normalizeCardCtas(card.ctas),
      }
    : undefined;
  const caseContextCandidate = metadata?.caseContext;
  const caseContext =
    caseContextCandidate && typeof caseContextCandidate === "object" && !Array.isArray(caseContextCandidate)
      ? (caseContextCandidate as ImobCaseContext)
      : undefined;
  const presentationMetadataCandidate = metadata?.presentationMetadata;
  const presentationMetadata =
    presentationMetadataCandidate && typeof presentationMetadataCandidate === "object" && !Array.isArray(presentationMetadataCandidate)
      ? (presentationMetadataCandidate as ImobPresentationMetadata)
      : undefined;
  const formCandidate = metadata?.form;
  const form =
    formCandidate && typeof formCandidate === "object" && !Array.isArray(formCandidate)
      ? (formCandidate as ImobPresentationForm)
      : undefined;
  const widgetCandidate = metadata?.widget;
  const widget =
    widgetCandidate && typeof widgetCandidate === "object" && !Array.isArray(widgetCandidate)
      ? (widgetCandidate as ImobPresentationWidget)
      : undefined;
  const blocksCandidate = metadata?.blocks;
  const blocks =
    Array.isArray(blocksCandidate)
      ? (blocksCandidate as ImobPresentationBlock[]).map((block) => ({ ...block, ctas: normalizeCardCtas(block.ctas) }))
      : undefined;
  const proofCandidate = metadata?.proof;
  const proof =
    proofCandidate && typeof proofCandidate === "object" && !Array.isArray(proofCandidate)
      ? (proofCandidate as ImobResolveTurnResponse["presentation"]["proof"])
      : undefined;
  const hiddenFromTimeline = metadata?.hiddenFromTimeline === true;

  return {
    id: message.id,
    role: message.role,
    text: message.content,
    hiddenFromTimeline,
    presentationMetadata,
    blocks,
    widget,
    form,
    proof,
    thread: message.threadId
      ? {
          id: message.threadId,
          label: message.threadLabel ?? "Operação",
          status: message.threadStatus ?? "active",
        }
      : undefined,
    card: normalizedCard,
    caseContext,
  };
}

const ImobChatPage: React.FC = () => {
  const session = useSession();
  const imobAccessGate = session.accessGate?.product === "IMOB" ? session.accessGate : null;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || session.workspaceId;
  const handleNavigateBack = React.useCallback(() => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate("/app/command-center");
  }, [navigate]);
  const isGateBlocked = Boolean(imobAccessGate);
  const requestedConversationId = React.useMemo(() => {
    const raw = searchParams.get("conversationId");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const requestedThreadId = React.useMemo(() => {
    const raw = searchParams.get("threadId");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const requestedCaseId = React.useMemo(() => {
    const raw = searchParams.get("caseId");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const requestedRecipeId = React.useMemo(() => {
    const raw = searchParams.get("recipeId");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const requestedStartNew = React.useMemo(() => {
    const raw = searchParams.get("startNew");
    return raw === "1" || raw === "true";
  }, [searchParams]);
  const requestedAutoprompt = React.useMemo(() => {
    const raw = searchParams.get("autoprompt");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const requestedReturnTo = React.useMemo(() => {
    const raw = searchParams.get("returnTo");
    return raw && raw.trim().startsWith("/app/") ? raw.trim() : null;
  }, [searchParams]);
  const requestedActionId = React.useMemo(() => {
    const raw = searchParams.get("actionId");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const requestedReasonCode = React.useMemo(() => {
    const raw = searchParams.get("reasonCode");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);
  const requestedCaseStatus = React.useMemo(() => {
    const raw = searchParams.get("status");
    return raw && raw.trim().length > 0 ? raw.trim() : null;
  }, [searchParams]);

  const [state, setState] = React.useState<ChatState>("idle");
  const [input, setInput] = React.useState("");
  const [uploadingDocuments, setUploadingDocuments] = React.useState(false);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [pendingExecution, setPendingExecution] = React.useState<PendingExecution | null>(null);
  const [activeThread, setActiveThread] = React.useState<{ id: string; label: string } | null>(null);
  const [activeAssistantMessageId, setActiveAssistantMessageId] = React.useState<string | null>(null);
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);
  const [runStatus, setRunStatus] = React.useState<string | null>(null);
  const [conversationId, setConversationId] = React.useState<string | null>(null);
  const [conversations, setConversations] = React.useState<ImobChatConversation[]>([]);
  const [threads, setThreads] = React.useState<ImobChatThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = React.useState<string | null>(null);
  const [showThreadPanel, setShowThreadPanel] = React.useState(false);
  const [showWorkbenchContextPanel, setShowWorkbenchContextPanel] = React.useState(false);
  const [activeVerticalId, setActiveVerticalId] = React.useState<VerticalId>("imob");
  const [conversationSearch, setConversationSearch] = React.useState("");
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [historyLimit, setHistoryLimit] = React.useState(HISTORY_PAGE_SIZE);
  const [historyLoadingMore, setHistoryLoadingMore] = React.useState(false);
  const [hasMoreHistory, setHasMoreHistory] = React.useState(false);
  const [messageFeedback, setMessageFeedback] = React.useState<Record<string, "up" | "down">>({});
  const [openOptionsMessageId, setOpenOptionsMessageId] = React.useState<string | null>(null);
  const [rejectLockedMessageId, setRejectLockedMessageId] = React.useState<string | null>(null);
  const [crmSuggestionLoadingId, setCrmSuggestionLoadingId] = React.useState<string | null>(null);
  const [typewriterMessageIds, setTypewriterMessageIds] = React.useState<Record<string, true>>({});
  const [sequentialChoiceMessageIds, setSequentialChoiceMessageIds] = React.useState<Record<string, true>>({});
  const [selectedKnowledgeContext, setSelectedKnowledgeContext] = React.useState<SelectedKnowledgeContext | null>(null);
  const [formValuesByMessageId, setFormValuesByMessageId] = React.useState<Record<string, Record<string, string>>>({});
  const [formErrorsByMessageId, setFormErrorsByMessageId] = React.useState<Record<string, Record<string, string>>>({});
  const [formLookupLoadingByMessageId, setFormLookupLoadingByMessageId] = React.useState<Record<string, Record<string, boolean>>>({});
  const [isNearBottom, setIsNearBottom] = React.useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = React.useState(false);
  const [contractInterviewState, setContractInterviewState] = React.useState<ContractInterviewState | null>(null);
  const [compactTimelineMode, setCompactTimelineMode] = React.useState(true);
  const [draftEditFieldId, setDraftEditFieldId] = React.useState("");
  const [singleEditFieldId, setSingleEditFieldId] = React.useState<string | null>(null);
  const [reviewActionLoading, setReviewActionLoading] = React.useState<"edit" | "confirm" | "decline" | null>(null);
  const [runFinanceByRunId, setRunFinanceByRunId] = React.useState<Record<string, RunFinanceSummary>>({});
  const contractEditableFields = React.useMemo(() => {
    if (!contractInterviewState?.contractType) return [];
    return CONTRACT_SCHEMAS[contractInterviewState.contractType].fields.map((step) => ({
      id: step.id,
      label: step.question.replace(/\?$/, ""),
    }));
  }, [contractInterviewState?.contractType]);

  const listRef = React.useRef<HTMLDivElement | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const attachmentMenuRef = React.useRef<HTMLDivElement | null>(null);
  const sessionRunByThreadRef = React.useRef<Record<string, string>>({});
  const caseIdByThreadRef = React.useRef<Record<string, string>>({});
  const caseContextByThreadRef = React.useRef<Record<string, ImobCaseContext>>({});
  const conversationStateByThreadRef = React.useRef<Record<string, ImobThreadConversationState>>({});
  const rejectedExecutionKeysRef = React.useRef<Set<string>>(new Set());
  const persistedRunStatusKeysRef = React.useRef<Set<string>>(new Set());
  const directedConfirmingRef = React.useRef(false);
  const persistedContractTemplateKeysRef = React.useRef<Set<string>>(new Set());
  const loadingRunFinanceIdsRef = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const container = attachmentMenuRef.current;
      if (!container) return;
      if (container.contains(event.target as Node)) return;
      setAttachmentMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const loadConversationMessages = React.useCallback(
    async (targetConversationId: string, limit: number) => {
      const history = await apiListImobChatMessages(targetConversationId, { limit });
      const mapped = dedupeRunMessages(history.items.map(mapStoredMessageToChat));
      setMessages(mapped);
      setTypewriterMessageIds({});
      setSequentialChoiceMessageIds({});
      sessionRunByThreadRef.current = buildSessionRunMapFromMessages(mapped);
      caseIdByThreadRef.current = buildCaseMapFromMessages(mapped);
      caseContextByThreadRef.current = buildCaseContextMapFromMessages(mapped);
      setHasMoreHistory(history.items.length >= limit);
    },
    []
  );

  const appendMessage = React.useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
    const threadId = message.caseContext?.threadId ?? message.thread?.id ?? message.card?.thread?.id ?? null;
    if (threadId && message.caseContext) {
      caseContextByThreadRef.current[threadId] = message.caseContext;
    }
    if (message.role === "assistant" && message.text.trim().length > 0) {
      setTypewriterMessageIds((prev) => ({ ...prev, [message.id]: true }));
    }
    const hasAnimatedBlocks = Boolean(
      message.blocks?.some((block) => (block.ctas?.length ?? 0) > 0 || (block.lines?.length ?? 0) > 0)
    );
    if (
      message.role === "assistant" &&
      (
        (
          message.presentationMetadata?.choiceStyle === "inline" &&
          (message.card?.ctas?.length ?? 0) > 0
        ) ||
        hasAnimatedBlocks
      )
    ) {
      setSequentialChoiceMessageIds((prev) => ({ ...prev, [message.id]: true }));
    }
  }, []);

  const resolveFormValuesForMessage = React.useCallback(
    (message: ChatMessage) => {
      const form = message.form;
      if (!form) return {} as Record<string, string>;

      const currentThreadId = message.thread?.id ?? message.card?.thread?.id ?? null;
      const values: Record<string, string> = Object.fromEntries(
        form.fields.map((field) => [field.name, String(field.value ?? "")]),
      );
      const localOverrides = formValuesByMessageId[message.id] ?? null;
      if (localOverrides) {
        for (const [fieldName, value] of Object.entries(localOverrides)) {
          values[fieldName] = value;
        }
      }

      for (const field of form.fields) {
        if (normalizeImobFormValue(values[field.name] ?? "")) continue;
        for (let index = messages.length - 1; index >= 0; index -= 1) {
          const candidate = messages[index];
          if (candidate.id === message.id) continue;
          const candidateForm = candidate.form;
          if (!candidateForm) continue;
          if (candidateForm.entity !== form.entity || candidateForm.action !== form.action) continue;
          const candidateThreadId = candidate.thread?.id ?? candidate.card?.thread?.id ?? null;
          if (candidateThreadId !== currentThreadId) continue;

          const candidateLocalValues = formValuesByMessageId[candidate.id] ?? null;
          const candidateValue = normalizeImobFormValue(
            candidateLocalValues?.[field.name] ?? String(candidateForm.fields.find((item) => item.name === field.name)?.value ?? ""),
          );
          if (!candidateValue) continue;
          values[field.name] = candidateValue;
          break;
        }
      }

      return values;
    },
    [formValuesByMessageId, messages],
  );

  const updateMessageById = React.useCallback((messageId: string, patch: Partial<ChatMessage>) => {
    setMessages((prev) =>
      prev.map((item) => {
        if (item.id !== messageId) return item;
        return {
          ...item,
          ...patch,
          card: patch.card === undefined ? item.card : patch.card,
          thread: patch.thread === undefined ? item.thread : patch.thread,
        };
      })
    );
  }, []);

  const trackUxEvent = React.useCallback(
    (action: string, metadata?: Record<string, unknown>) => {
      if (!conversationId) return;
      void apiCreateImobChatTelemetry({
        conversationId,
        event: "ux_interaction",
        value: 1,
        metadata: { action, ...metadata },
      });
    },
    [conversationId]
  );

  const clearPendingExecution = React.useCallback(
    (reason: string, metadata?: Record<string, unknown>) => {
      if (!pendingExecution) return;
      trackUxEvent("pending_execution_cleared", {
        reason,
        threadId: pendingExecution.thread.id,
        action: pendingExecution.plan.action,
        ...metadata,
      });
      directedConfirmingRef.current = false;
      setPendingExecution(null);
      setOpenOptionsMessageId(null);
      setRejectLockedMessageId(null);
      setState("idle");
    },
    [pendingExecution, trackUxEvent]
  );


  const withDashboardContext = React.useCallback(
    (href: string, explicitThreadId?: string | null) => {
      if (!href.startsWith("/app/imob/dashboard")) return href;
      const hashIndex = href.indexOf("#");
      const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";
      const base = hashIndex >= 0 ? href.slice(0, hashIndex) : href;
      const [path, query = ""] = base.split("?");
      const params = new URLSearchParams(query);
      if (conversationId) {
        params.set("conversationId", conversationId);
      }
      const threadIdForLink = explicitThreadId ?? selectedThreadId;
      if (threadIdForLink) {
        params.set("threadId", threadIdForLink);
        const caseIdForThread = caseIdByThreadRef.current[threadIdForLink] ?? null;
        if (caseIdForThread) {
          params.set("caseId", caseIdForThread);
        } else {
          params.delete("caseId");
        }
      } else {
        params.delete("caseId");
      }
      const queryString = params.toString();
      return `${path}${queryString ? `?${queryString}` : ""}${hash}`;
    },
    [conversationId, selectedThreadId]
  );

  const withRunContext = React.useCallback(
    (runId: string, explicitThreadId?: string | null, explicitCaseId?: string | null) => {
      const params = new URLSearchParams();
      params.set("domain", "imob");
      params.set("runId", runId);
      if (conversationId) {
        params.set("conversationId", conversationId);
      }
      const threadIdForLink = explicitThreadId ?? selectedThreadId;
      if (threadIdForLink) {
        params.set("threadId", threadIdForLink);
        const caseIdForThread = explicitCaseId ?? caseIdByThreadRef.current[threadIdForLink] ?? null;
        if (caseIdForThread) {
          params.set("caseId", caseIdForThread);
        }
      }
      return `/app/runs?${params.toString()}`;
    },
    [conversationId, selectedThreadId]
  );

  const refreshConversations = React.useCallback(async (preferredConversationId?: string | null) => {
    try {
      const list = await apiListImobChatConversations({ limit: 20 });
      const withHistory = list.items.filter((item) => item.lastMessageAt || item.lastMessagePreview);
      setConversations(withHistory);
      const preferred = preferredConversationId ?? conversationId;
      if (preferred && withHistory.some((item) => item.conversationId === preferred)) return;
      if (!conversationId && withHistory[0]?.conversationId) {
        setConversationId(withHistory[0].conversationId);
      }
    } catch {
      // F2: falha da lista nao bloqueia chat em conversa atual.
    }
  }, [conversationId]);

  const refreshThreads = React.useCallback(async (forConversationId?: string | null) => {
    const currentConversationId = forConversationId ?? conversationId;
    if (!currentConversationId) {
      setThreads([]);
      setSelectedThreadId(null);
      return;
    }
    try {
      const list = await apiListImobChatThreads(currentConversationId);
      setThreads(list.items);
      if (selectedThreadId && list.items.some((item) => item.threadId === selectedThreadId)) return;
      setSelectedThreadId(null);
    } catch {
      // Falha de threads nao bloqueia o chat.
    }
  }, [conversationId, selectedThreadId]);

  const persistMessage = React.useCallback(
    async (
      message: ChatMessage,
      extra?: { intent?: string; action?: string; conversationId?: string | null; metadata?: Record<string, unknown>; contentOverride?: string }
    ) => {
      const targetConversationId = extra?.conversationId ?? conversationId;
      if (!targetConversationId) return;
      try {
        await apiCreateImobChatMessage(targetConversationId, {
          role: message.role,
          content: extra?.contentOverride ?? message.text,
          intent: extra?.intent,
          action: extra?.action,
          threadId: message.thread?.id ?? message.card?.thread?.id,
          threadLabel: message.thread?.label ?? message.card?.thread?.label,
          threadStatus: message.thread?.status ?? message.card?.thread?.status,
          runId: message.card?.runId ?? message.proof?.runId ?? undefined,
          txId: message.proof?.txId ?? undefined,
          receiptPath: message.proof?.receiptPath ?? undefined,
          bundlePath: message.proof?.bundlePath ?? undefined,
          metadata: {
            card: message.card ?? null,
            proof: message.proof ?? null,
            caseContext: message.caseContext ?? null,
            presentationMetadata: message.presentationMetadata ?? null,
            blocks: message.blocks ?? null,
            widget: message.widget ?? null,
            form: message.form ?? null,
            hiddenFromTimeline: message.hiddenFromTimeline === true ? true : undefined,
            ...(extra?.metadata ?? {}),
          },
        });
        void apiCreateImobChatTelemetry({
          conversationId: targetConversationId,
          event: "message_persist_success_rate",
          value: 1,
          metadata: { role: message.role },
        });
        void refreshConversations(targetConversationId);
        void refreshThreads(targetConversationId);
      } catch {
        void apiCreateImobChatTelemetry({
          conversationId: targetConversationId,
          event: "message_persist_success_rate",
          value: 0,
          metadata: { role: message.role },
        });
        // F1: falha de persistencia nao bloqueia o fluxo operacional do chat.
      }
    },
    [conversationId, refreshConversations, refreshThreads]
  );

  const persistInterviewState = React.useCallback(
    async (targetConversationId: string, state: ContractInterviewState) => {
      const payload: ImobContractInterviewState = {
        contractType: state.contractType,
        currentStep: state.currentStep,
        answers: state.answers,
        status: state.status,
        runId: state.runId,
        updatedAt: state.updatedAt,
      };
      try {
        await apiUpsertImobChatInterviewState(targetConversationId, { state: payload });
      } catch {
        // Persistencia de entrevista nao deve bloquear o chat.
      }
    },
    []
  );

  React.useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    if (historyLoadingMore) return;
    if (isNearBottom) {
      container.scrollTop = container.scrollHeight;
      setShowJumpToLatest(false);
      return;
    }
    setShowJumpToLatest(true);
  }, [historyLoadingMore, isNearBottom, messages]);

  React.useEffect(() => {
    let mounted = true;
    setHistoryLoading(true);
    if (requestedStartNew) {
      startNewBootstrapReadyRef.current = false;
    }

    const bootstrap = async () => {
      try {
        const list = await apiListImobChatConversations({ limit: 20 });
        if (!mounted) return;
        const withHistory = list.items.filter((item) => item.lastMessageAt || item.lastMessagePreview);
        setConversations(withHistory);
        const selectedConversationId =
          requestedStartNew
            ? null
            : (requestedConversationId && withHistory.some((item) => item.conversationId === requestedConversationId)
            ? requestedConversationId
            : withHistory[0]?.conversationId) ?? null;
        if (!mounted) return;
        setConversationId(selectedConversationId);
        if (selectedConversationId) {
          const initialLimit = HISTORY_PAGE_SIZE;
          setHistoryLimit(initialLimit);
          const history = await apiListImobChatMessages(selectedConversationId, { limit: initialLimit });
          if (!mounted) return;
          const mappedHistory = dedupeRunMessages(history.items.map(mapStoredMessageToChat));
          setMessages(mappedHistory);
          sessionRunByThreadRef.current = buildSessionRunMapFromMessages(mappedHistory);
          caseIdByThreadRef.current = buildCaseMapFromMessages(mappedHistory);
          setHasMoreHistory(history.items.length >= initialLimit);
          const threadList = await apiListImobChatThreads(selectedConversationId);
          if (!mounted) return;
          setThreads(threadList.items);
          if (requestedThreadId && threadList.items.some((item) => item.threadId === requestedThreadId)) {
            setSelectedThreadId(requestedThreadId);
          }
          const interview = await apiGetImobChatInterviewState(selectedConversationId);
          if (!mounted) return;
          setContractInterviewState((interview.state as ContractInterviewState | null) ?? null);
          setSingleEditFieldId(null);
        } else {
          setMessages([]);
          setThreads([]);
          setSelectedThreadId(null);
          setActiveThread(null);
          setActiveAssistantMessageId(null);
          setPendingExecution(null);
          setOpenOptionsMessageId(null);
          setRejectLockedMessageId(null);
          setSelectedKnowledgeContext(null);
          setActiveRunId(null);
          setRunStatus(null);
          setContractInterviewState(null);
          setSingleEditFieldId(null);
          sessionRunByThreadRef.current = {};
          conversationStateByThreadRef.current = {};
          caseIdByThreadRef.current = {};
          caseContextByThreadRef.current = {};
        }
      } catch {
        if (!mounted) return;
        setMessages([]);
        setThreads([]);
        setSelectedThreadId(null);
        setActiveThread(null);
        setActiveAssistantMessageId(null);
        setPendingExecution(null);
        setOpenOptionsMessageId(null);
        setRejectLockedMessageId(null);
        setSelectedKnowledgeContext(null);
        setActiveRunId(null);
        setRunStatus(null);
        setContractInterviewState(null);
        setSingleEditFieldId(null);
        sessionRunByThreadRef.current = {};
        conversationStateByThreadRef.current = {};
        caseIdByThreadRef.current = {};
        caseContextByThreadRef.current = {};
      } finally {
        if (requestedStartNew) {
          startNewBootstrapReadyRef.current = true;
        }
        if (mounted) setHistoryLoading(false);
      }
    };

    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [requestedConversationId, requestedStartNew, requestedThreadId]);

  const loadConversation = React.useCallback(async (nextConversationId: string) => {
    setHistoryLoading(true);
    setConversationId(nextConversationId);
    setMessages([]);
    setPendingExecution(null);
    setActiveThread(null);
    setActiveAssistantMessageId(null);
    setOpenOptionsMessageId(null);
    setRejectLockedMessageId(null);
    setSelectedKnowledgeContext(null);
    setSelectedThreadId(null);
    setContractInterviewState(null);
    setSingleEditFieldId(null);
    sessionRunByThreadRef.current = {};
    conversationStateByThreadRef.current = {};
    caseIdByThreadRef.current = {};
    caseContextByThreadRef.current = {};
    trackUxEvent("conversation_selected", { nextConversationId });
    setHistoryLimit(HISTORY_PAGE_SIZE);
    setHasMoreHistory(false);
    try {
      await loadConversationMessages(nextConversationId, HISTORY_PAGE_SIZE);
      const threadList = await apiListImobChatThreads(nextConversationId);
      setThreads(threadList.items);
      const interview = await apiGetImobChatInterviewState(nextConversationId);
      setContractInterviewState((interview.state as ContractInterviewState | null) ?? null);
      setSingleEditFieldId(null);
    } catch {
      setMessages([]);
      setThreads([]);
      setContractInterviewState(null);
      setSingleEditFieldId(null);
      sessionRunByThreadRef.current = {};
      conversationStateByThreadRef.current = {};
      caseIdByThreadRef.current = {};
      caseContextByThreadRef.current = {};
    } finally {
      setHistoryLoading(false);
    }
    void refreshThreads(nextConversationId);
  }, [loadConversationMessages, refreshThreads, trackUxEvent]);

  const handleNewConversation = async () => {
    if (pendingExecution) {
      clearPendingExecution("new_conversation");
    }
    setConversationId(null);
    setMessages([]);
    setPendingExecution(null);
    setActiveThread(null);
    setActiveAssistantMessageId(null);
    setOpenOptionsMessageId(null);
    setRejectLockedMessageId(null);
    setSelectedKnowledgeContext(null);
    setThreads([]);
    setSelectedThreadId(null);
    setActiveRunId(null);
    setRunStatus(null);
    setContractInterviewState(null);
    setSingleEditFieldId(null);
    sessionRunByThreadRef.current = {};
    conversationStateByThreadRef.current = {};
    caseIdByThreadRef.current = {};
    caseContextByThreadRef.current = {};
    setHistoryLimit(HISTORY_PAGE_SIZE);
    setHasMoreHistory(false);
    trackUxEvent("conversation_new");
  };

  const handleLoadOlder = async () => {
    if (!conversationId || historyLoadingMore || historyLoading) return;
    setHistoryLoadingMore(true);
    setIsNearBottom(false);
    const container = listRef.current;
    const previousHeight = container?.scrollHeight ?? 0;
    const nextLimit = historyLimit + HISTORY_PAGE_SIZE;
    try {
      await loadConversationMessages(conversationId, nextLimit);
      setHistoryLimit(nextLimit);
      requestAnimationFrame(() => {
        const target = listRef.current;
        if (!target) return;
        const delta = target.scrollHeight - previousHeight;
        target.scrollTop = Math.max(0, target.scrollTop + delta);
      });
    } finally {
      setHistoryLoadingMore(false);
    }
  };

  const buildKnowledgeSearchResponse = React.useCallback(
    (result: ImobKnowledgeSearchResponse, turn: ImobResolveTurnResponse) => {
      const sourceTypes = result.appliedFilters.sourceTypes ?? turn.knowledgeRequest?.filters.sourceTypes ?? [];
      const sourceLabels = result.searchContext?.sourceLabels ?? [];
      const sourceLabel =
        sourceLabels.length > 0
          ? ` em ${sourceLabels.join(", ")}`
          : sourceTypes.length > 0
            ? ` em ${sourceTypes
                .map((item) =>
                  item === "drive"
                    ? "Drive"
                    : item === "upload"
                      ? "Uploads"
                      : item === "web"
                        ? "Web"
                        : "Docs internos"
                )
                .join(", ")}`
          : "";
      if (result.total === 0) {
        return [
          `Não encontrei documentos com esse recorte${sourceLabel} no acervo IMOB.`,
          "",
          "Tente refinar por tipo documental, cidade, região ou operação.",
        ].join("\n");
      }

      const firstSourceLabel = result.items[0]?.source?.label;
      const scopeLabel = result.searchContext?.scopeLabel;
      return [
        `Abri ${result.total > 1 ? "o primeiro material útil" : "um material útil"}${firstSourceLabel ? ` em ${firstSourceLabel}` : ""} para esta busca${scopeLabel ? ` de ${scopeLabel}` : ""}.`,
      ].join("\n\n");
    },
    []
  );

  const buildKnowledgeSearchCard = React.useCallback(
    (
      result: ImobKnowledgeSearchResponse,
      turn: ImobResolveTurnResponse,
      thread: { id: string; label: string; status?: "active" | "waiting" | "done" | "blocked" }
    ): MessageCard | undefined => {
      const items = result.items.slice(0, 3);
      const sourceCtas = turn.presentation.card?.ctas ?? [];
      return {
        type: "action",
        title: "Resultados do acervo IMOB",
        thread,
        lines:
          items.length > 0
            ? [
                `Recorte: ${result.searchContext?.scopeLabel ?? "acervo IMOB"}.`,
                result.searchContext?.provenance?.driveSyncActive
                  ? "Drive sincronizado disponível para este workspace."
                  : "Resultados combinam acervo seed e fontes internas disponíveis.",
              ]
            : ["Nenhum documento encontrado com esse recorte."],
        knowledgeResults: items,
        ctas: sourceCtas.slice(0, 2),
      };
    },
    []
  );

  React.useEffect(() => {
    if (!conversationId) return;
    void refreshThreads(conversationId);
    const interval = setInterval(() => {
      void refreshThreads(conversationId);
    }, 15000);
    return () => clearInterval(interval);
  }, [conversationId, refreshThreads]);

  const explicitRunIds = React.useMemo(
    () =>
      Array.from(
        new Set(
          messages
            .map((message) => message.card?.runId)
            .filter((runId): runId is string => typeof runId === "string" && runId.trim().length > 0)
        )
      ),
    [messages]
  );

  React.useEffect(() => {
    let cancelled = false;

    for (const runId of explicitRunIds) {
      if (runFinanceByRunId[runId] || loadingRunFinanceIdsRef.current.has(runId)) continue;
      loadingRunFinanceIdsRef.current.add(runId);
      void Promise.allSettled([
        apiGetRunCostBreakdown(runId),
        apiGetBillingReconciliationSummary({ runId, limit: 1 }),
      ])
        .then((results) => {
          if (cancelled) return;
          const breakdownResult = results[0];
          const reconciliationResult = results[1];
          if (breakdownResult.status !== "fulfilled") return;
          const amountCents = breakdownResult.value.data.totals.amountCents ?? 0;
          const tokens = breakdownResult.value.data.totals.tokens ?? 0;
          const issue =
            reconciliationResult.status === "fulfilled"
              ? reconciliationResult.value.data.items.auditGaps[0]?.issue ?? null
              : null;
          setRunFinanceByRunId((prev) => ({
            ...prev,
            [runId]: {
              amountCents,
              estimatedAmountCents: breakdownResult.value.data.estimate?.amountCents ?? null,
              tokens,
              issueLabel: issue ? formatReconciliationIssue(issue) : "Reconciliado",
              hasGap: Boolean(issue),
            },
          }));
        })
        .finally(() => {
          loadingRunFinanceIdsRef.current.delete(runId);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [explicitRunIds, runFinanceByRunId]);

  React.useEffect(() => {
    if (!activeRunId) return;
    if (!(state === "executing" || state === "done")) return;

    let cancelled = false;
    const intervalId = setInterval(() => {
      void apiGetRun(activeRunId)
        .then((run) => {
          if (cancelled) return;
          if (run.status === runStatus) return;

          setRunStatus(run.status);
          const updatedThread =
            activeThread
              ? {
                  id: activeThread.id,
                  label: activeThread.label,
                  status:
                    run.status === "success"
                      ? ("done" as const)
                      : run.status === "blocked" || run.status === "error"
                        ? ("blocked" as const)
                        : ("active" as const),
                }
              : undefined;
          const postSuccessBlocks =
            run.status === "success"
              ? pickPostSuccessBlocks(pendingExecution?.presentationBlocks)
              : [];
          const postSuccessPresentation = buildPostSuccessPresentationFromBlocks(postSuccessBlocks);
          const freshThreadCaseContext =
            updatedThread?.id
              ? caseContextByThreadRef.current[updatedThread.id] ?? null
              : null;
          const latestCaseContext = freshThreadCaseContext ?? pendingExecution?.caseContext;
          const canonicalSuccessCtas = buildCanonicalRecommendedActionCtas(latestCaseContext);
          const stalePresentationFallbackCtas =
            !freshThreadCaseContext && pendingExecution?.presentationCard?.ctas
              ? normalizeCardCtas(pendingExecution.presentationCard.ctas)
              : undefined;
          const successMenuCtas =
            run.status === "success"
              ? (
                  postSuccessPresentation.ctas
                  ?? (canonicalSuccessCtas.length > 0
                    ? canonicalSuccessCtas
                    : stalePresentationFallbackCtas)
                )?.filter((cta) => isSendSuggestedMessageAction(cta.action))
              : undefined;
          const hasSuccessDirectMenu = Boolean(successMenuCtas && successMenuCtas.length > 0);
          const statusText = buildHumanOperationalUpdate(
            run.status,
            updatedThread?.label,
            updatedThread?.id ? (conversationStateByThreadRef.current[updatedThread.id]?.operational?.pendingFields ?? pendingExecution?.pendingFields) : pendingExecution?.pendingFields,
            pendingExecution?.presentationMeta,
            pendingExecution?.flow,
            hasSuccessDirectMenu ? { suppressNextStep: true } : undefined,
          );
          const finalStatusText = run.status === "success" && postSuccessPresentation.text
            ? postSuccessPresentation.text
            : statusText;
          const runtimeProof = buildRuntimeExecutionProof({
            runId: activeRunId,
            txId: run.txId ?? null,
            receiptPath: run.txId ? `/api/ledger/${encodeURIComponent(run.txId)}` : null,
            bundlePath: run.criticalHash ? `/api/runs/${encodeURIComponent(activeRunId)}/bundle` : null,
          });
          const updatedCard: MessageCard = {
            type: run.status === "blocked" || run.status === "error" ? "risk" : "queue",
            title:
              run.status === "success"
                ? "Concluído"
                : run.status === "blocked" || run.status === "error"
                  ? "Precisa de atenção"
                  : "Andamento",
            thread: updatedThread,
            lines: hasSuccessDirectMenu
              ? postSuccessPresentation.lines
              : nextBusinessStep(
                run.status,
                updatedThread?.label,
                updatedThread?.id ? (conversationStateByThreadRef.current[updatedThread.id]?.operational?.pendingFields ?? pendingExecution?.pendingFields) : pendingExecution?.pendingFields,
                pendingExecution?.presentationMeta,
                pendingExecution?.flow,
              ),
            runId: activeRunId,
            queue: {
              status: run.status,
              step: run.status === "running" ? "processing" : run.status,
            },
            proof: runtimeProof,
            actionsLayout: hasSuccessDirectMenu ? (postSuccessPresentation.actionsLayout ?? "inline") : undefined,
            ctas: hasSuccessDirectMenu
              ? successMenuCtas
              : [
                  {
                    id: "view-run",
                    label: "Ver execução",
                    kind: "neutral",
                    href: withRunContext(activeRunId, updatedThread?.id ?? null, latestCaseContext?.caseId ?? null),
                  },
                ],
          };

          if (activeAssistantMessageId) {
            updateMessageById(activeAssistantMessageId, {
              text: finalStatusText,
              blocks: postSuccessBlocks.length > 0 ? postSuccessBlocks : undefined,
              proof: runtimeProof,
              thread: updatedThread,
              card: updatedCard,
              caseContext: latestCaseContext,
            });
          } else {
            appendMessage({
              id: makeId("assistant"),
              role: "assistant",
              text: finalStatusText,
              blocks: postSuccessBlocks.length > 0 ? postSuccessBlocks : undefined,
              proof: runtimeProof,
              thread: updatedThread,
              card: updatedCard,
              caseContext: pendingExecution?.caseContext,
            });
          }

          if (run.status === "success") {
            setState("done");
          } else if (run.status === "blocked" || run.status === "error") {
            setState("blocked");
          }

          const isTerminal = run.status === "success" || run.status === "blocked" || run.status === "error";
          if (isTerminal) {
            const persistKey = `${activeRunId}:${run.status}`;
            if (!persistedRunStatusKeysRef.current.has(persistKey)) {
              persistedRunStatusKeysRef.current.add(persistKey);
              const terminalMessage: ChatMessage = {
                id: makeId("assistant"),
                role: "assistant",
                text: finalStatusText,
                blocks: postSuccessBlocks.length > 0 ? postSuccessBlocks : undefined,
                proof: runtimeProof,
                thread: updatedThread,
                card: updatedCard,
                caseContext: pendingExecution?.caseContext,
              };
              void persistMessage(terminalMessage);
            }
          }

          const area = getThreadBusinessArea(updatedThread?.label, pendingExecution?.flow);
          if (run.status === "success" && area === "contract") {
            const templateKey = `${activeRunId}:contract-template`;
            if (!persistedContractTemplateKeysRef.current.has(templateKey)) {
              persistedContractTemplateKeysRef.current.add(templateKey);
              const threadForTemplate = updatedThread ?? {
                id: makeId("thread"),
                label: "Contrato",
                status: "done" as const,
              };
              const templateMessage = buildRentalContractTemplateMessage(threadForTemplate);
              appendMessage(templateMessage);
              void persistMessage(templateMessage);
            }
          }
        })
        .catch(() => undefined);
    }, 3500);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [activeAssistantMessageId, activeRunId, activeThread, appendMessage, persistMessage, runStatus, state, updateMessageById]);

  const startPlanExecution = async (
    plan: ImobExecutionRequest,
    operationThread: { id: string; label: string },
    activeConversationId: string,
    startedAt: number,
    presentationText?: string,
    flow?: ImobThreadConversationState["operational"] extends { flow: infer T } ? T : string,
    pendingFields?: string[],
    caseContext?: ImobCaseContext,
    presentationMeta?: PendingExecution["presentationMeta"],
    presentationProof?: ImobResolveTurnResponse["presentation"]["proof"],
    presentationForm?: ImobResolveTurnResponse["presentation"]["form"],
    presentationCard?: ImobResolveTurnResponse["presentation"]["card"],
    presentationBlocks?: ImobResolveTurnResponse["presentation"]["blocks"]
  ) => {
      try {
        const discovery = await apiAgentsDiscovery({
          domain: "imob",
          actions: [plan.action],
        });
        const discovered = discovery.data.actions.find((entry) => entry.action === plan.action);

        if (!discovered) {
          throw new Error(`Ação ${plan.action} não disponível para este tenant/workspace.`);
        }

        const negotiation = await apiAgentsNegotiate({
          domain: "imob",
          action: plan.action,
        });
        const contract = negotiation.data.contract;
        const thread = operationThread;
        const liveMessageId = makeId("assistant");
        const executionPending: PendingExecution = {
          plan,
          contract,
          messageId: liveMessageId,
          thread,
          flow,
          pendingFields,
          caseContext,
          presentationMeta,
          presentationText: presentationText?.trim() || "Preparando...",
          presentationProof,
          presentationForm,
          presentationCard,
          presentationBlocks,
          receiptEndpointTemplate: negotiation.data.verification.endpointTemplate,
          preparedAt: Date.now(),
        };
        setOpenOptionsMessageId(null);
        setRejectLockedMessageId(null);
        setActiveAssistantMessageId(liveMessageId);
        setPendingExecution(executionPending);
        setState("executing");

        const planMessage: ChatMessage = {
          id: liveMessageId,
          role: "assistant",
          text: executionPending.presentationText,
          blocks: executionPending.presentationBlocks?.filter((block) => block.phase === "pre_execution"),
          thread: {
            id: thread.id,
            label: thread.label,
            status: "active",
          },
          caseContext: executionPending.caseContext,
          proof: executionPending.presentationProof,
          form: mapApiPresentationForm(executionPending.presentationForm),
          card: {
            type: "queue",
            title: "Preparando",
            thread: {
              id: thread.id,
              label: thread.label,
              status: "active",
            },
            lines: [],
            queue: {
              status: "running",
              step: "prepare",
            },
          },
        };
        appendMessage(planMessage);
        void persistMessage(planMessage, {
          intent: plan.intent,
          action: plan.action,
          conversationId: activeConversationId,
          metadata: contractInterviewState ? { contractInterview: contractInterviewState } : undefined,
        });
        void apiCreateImobChatTelemetry({
          conversationId: activeConversationId,
          event: "message_to_plan_ms",
          value: Date.now() - startedAt,
          metadata: { intent: plan.intent, action: plan.action },
        });
        await runExecutionFlow(executionPending);
      } catch (error) {
        const message =
          error instanceof ApiError
            ? `${error.message} (${error.status})`
            : error instanceof Error
              ? error.message
              : "Falha ao orquestrar mensagem";
        setState("blocked");
        const blockedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Não consegui continuar essa solicitação agora.",
          thread: {
            id: operationThread.id,
            label: operationThread.label,
            status: "blocked",
          },
          card: {
            type: "risk",
            title: "Ação pausada",
            thread: {
              id: operationThread.id,
              label: operationThread.label,
              status: "blocked",
            },
            lines: ["Identifiquei uma restrição de segurança para este passo."],
            risk: {
              level: "high",
              reason: message,
            },
          },
        };
        appendMessage(blockedMessage);
        void persistMessage(blockedMessage, { conversationId: activeConversationId });
      }
  };

  const prepareDirectedActionExecution = async (
    plan: ImobExecutionRequest,
    operationThread: { id: string; label: string },
    activeConversationId: string,
    startedAt: number,
    caseContext?: ImobCaseContext,
    presentationText?: string,
  ) => {
    try {
      directedConfirmingRef.current = false;
      const discovery = await apiAgentsDiscovery({ domain: "imob", actions: [plan.action] });
      const discovered = discovery.data.actions.find((entry) => entry.action === plan.action);
      if (!discovered) {
        throw new Error(`Ação ${plan.action} não disponível para este tenant/workspace.`);
      }
      const negotiation = await apiAgentsNegotiate({ domain: "imob", action: plan.action });
      const contract = negotiation.data.contract;
      const thread = operationThread;
      const liveMessageId = makeId("assistant");
      const executionPending: PendingExecution = {
        plan,
        contract,
        messageId: liveMessageId,
        thread,
        caseContext,
        presentationText: presentationText?.trim() || plan.prompt || thread.label,
        receiptEndpointTemplate: negotiation.data.verification.endpointTemplate,
        preparedAt: Date.now(),
        source: "command-center",
      };
      setOpenOptionsMessageId(null);
      setRejectLockedMessageId(null);
      setActiveAssistantMessageId(liveMessageId);
      setPendingExecution(executionPending);
      setState("awaiting_user_action");
      const directedCard = buildDirectedActionCard(thread);
      const directedMessage: ChatMessage = {
        id: liveMessageId,
        role: "assistant",
        text: executionPending.presentationText,
        thread: { id: thread.id, label: thread.label, status: "waiting" },
        caseContext: executionPending.caseContext,
        dispatchBadge: DIRECTED_ACTION_BADGE,
        card: directedCard,
      };
      appendMessage(directedMessage);
      void persistMessage(directedMessage, {
        intent: plan.intent,
        action: plan.action,
        conversationId: activeConversationId,
      });
      void apiCreateImobChatTelemetry({
        conversationId: activeConversationId,
        event: "message_to_plan_ms",
        value: Date.now() - startedAt,
        metadata: { intent: plan.intent, action: plan.action, source: "command-center" },
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `${error.message} (${error.status})`
          : error instanceof Error
            ? error.message
            : "Falha ao preparar ação direcionada";
      setState("blocked");
      const blockedMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: "Não consegui preparar esta ação agora.",
        thread: {
          id: operationThread.id,
          label: operationThread.label,
          status: "blocked",
        },
        card: {
          type: "risk",
          title: "Ação pausada",
          thread: {
            id: operationThread.id,
            label: operationThread.label,
            status: "blocked",
          },
          lines: ["Identifiquei uma restrição de segurança para este passo."],
          risk: {
            level: "high",
            reason: message,
          },
        },
      };
      appendMessage(blockedMessage);
      void persistMessage(blockedMessage, { conversationId: activeConversationId });
    }
  };

  const autopromptConsumedRef = React.useRef<string | null>(null);
  const startNewBootstrapReadyRef = React.useRef(false);

  React.useEffect(() => {
    if (!requestedAutoprompt) return;
    if (requestedStartNew && !startNewBootstrapReadyRef.current) return;
    if (historyLoading || historyLoadingMore || pendingExecution) return;
    if (autopromptConsumedRef.current === requestedAutoprompt) return;
    autopromptConsumedRef.current = requestedAutoprompt;
    void sendMessageText(requestedAutoprompt);
  }, [historyLoading, historyLoadingMore, pendingExecution, requestedAutoprompt, requestedStartNew]);

  const resolveInterviewOperationThread = React.useCallback(() => {
    const selectedThread = selectedThreadId ? threads.find((item) => item.threadId === selectedThreadId) : null;
    return selectedThread
      ? { id: selectedThread.threadId, label: selectedThread.label }
      : activeThread ?? {
          id: makeId("thread"),
          label: "Contrato",
        };
  }, [activeThread, selectedThreadId, threads]);

  const handleReviewEditAction = React.useCallback(
    async (
      fieldQuery: string,
      state: ContractInterviewState,
      activeConversationId: string,
      threadForInterview: { id: string; label: string; status: "active" }
    ) => {
      const editResult = moveInterviewToEditableField(state, fieldQuery);
      if (!editResult.ok) {
        const invalidEditMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: editResult.message,
          thread: threadForInterview,
        };
        appendMessage(invalidEditMessage);
        void persistMessage(invalidEditMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: state },
        });
        setState("awaiting_user_action");
        return;
      }
      const editedState = editResult.state;
      setContractInterviewState(editedState);
      setSingleEditFieldId(editResult.fieldId);
      await persistInterviewState(activeConversationId, editedState);
      const editPromptMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: `Perfeito, vamos editar este campo.\n\n${editResult.question}`,
        thread: threadForInterview,
      };
      appendMessage(editPromptMessage);
      void persistMessage(editPromptMessage, {
        conversationId: activeConversationId,
        intent: "contract",
        action: "realestate.create_contract",
        metadata: { contractInterview: editedState },
      });
      setState("awaiting_user_action");
    },
    [appendMessage, persistInterviewState, persistMessage]
  );

  const handleReviewDeclineAction = React.useCallback(
    async (
      state: ContractInterviewState,
      activeConversationId: string,
      threadForInterview: { id: string; label: string; status: "active" }
    ) => {
      const restarted: ContractInterviewState = {
        ...createInitialContractInterviewState(),
        contractType: state.contractType,
        updatedAt: new Date().toISOString(),
      };
      setContractInterviewState(restarted);
      setSingleEditFieldId(null);
      await persistInterviewState(activeConversationId, restarted);
      const restartMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: `Sem problemas. Vamos revisar desde o inicio deste tipo de contrato.\n\n${getStepQuestionText(restarted) ?? "Qual o primeiro dado?"}`,
        thread: threadForInterview,
      };
      appendMessage(restartMessage);
      void persistMessage(restartMessage, {
        conversationId: activeConversationId,
        intent: "contract",
        action: "realestate.create_contract",
        metadata: { contractInterview: restarted },
      });
      setState("awaiting_user_action");
    },
    [appendMessage, persistInterviewState, persistMessage]
  );

  const handleReviewConfirmAction = React.useCallback(
    async (
      state: ContractInterviewState,
      activeConversationId: string,
      threadForInterview: { id: string; label: string; status: "active" }
    ) => {
      const generatingState: ContractInterviewState = {
        ...state,
        status: "generating",
        updatedAt: new Date().toISOString(),
      };
      setContractInterviewState(generatingState);
      setSingleEditFieldId(null);
      await persistInterviewState(activeConversationId, generatingState);
      const confirmMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: "Perfeito. Vou gerar o contrato com os dados validados.",
        thread: threadForInterview,
      };
      appendMessage(confirmMessage);
      void persistMessage(confirmMessage, {
        conversationId: activeConversationId,
        intent: "contract",
        action: "realestate.create_contract",
        metadata: { contractInterview: generatingState },
      });
      try {
        if (!generatingState.contractType) {
          throw new Error("Tipo de contrato nao definido.");
        }
        const generated = await apiGenerateImobContract({
          contractType: generatingState.contractType,
          answers: generatingState.answers ?? {},
          conversationId: activeConversationId,
          legalVersion: "BR_CIVIL_LOCACAO_2026_v1",
          runId: generatingState.runId,
        });
        const generatedState: ContractInterviewState = {
          ...generatingState,
          status: "generated",
          updatedAt: new Date().toISOString(),
        };
        setContractInterviewState(generatedState);
        setSingleEditFieldId(null);
        await persistInterviewState(activeConversationId, generatedState);

        const reviewWarnings = generated.data.review.warnings ?? [];
        const generatedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: ["Contrato gerado com sucesso.", "", generated.data.contractText].join("\n"),
          widget: generated.data.widget ?? undefined,
          thread: {
            ...threadForInterview,
            status: "done",
          },
          card: {
            type: "evidence",
            title: "Contrato gerado",
            thread: {
              id: threadForInterview.id,
              label: threadForInterview.label,
              status: "done",
            },
            lines: [
              `Tipo: ${getContractTypeLabel(generated.data.contractType)}`,
              `Schema: ${generated.data.schemaVersion}`,
              `Base legal: ${generated.data.legalVersion}`,
              `Risco: ${generated.data.review.riskLevel}`,
              ...reviewWarnings.slice(0, 2).map((warning) => `Alerta: ${warning}`),
              `Evidencia: ${generated.data.evidence.eventId}`,
              `Hash: ${generated.data.hash.slice(0, 16)}...`,
            ],
            contract: {
              title: `Contrato IMOB - ${getContractTypeLabel(generated.data.contractType)}`,
              contractType: generated.data.contractType,
              schemaVersion: generated.data.schemaVersion,
              legalVersion: generated.data.legalVersion,
              generatedAt: generated.data.evidence.createdAt,
              hash: generated.data.hash,
              text: generated.data.contractText,
            },
            ctas: [
              {
                id: "export-contract-pdf",
                label: "Exportar PDF",
                kind: "neutral",
                action: "export_contract_pdf",
              },
            ],
          },
        };
        appendMessage(generatedMessage);
        void persistMessage(generatedMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: {
            contractInterview: generatedState,
            contractPreview: generated.data,
          },
        });
        setState("done");
      } catch (error) {
        const recoveryState: ContractInterviewState = {
          ...state,
          status: "review",
          updatedAt: new Date().toISOString(),
        };
        setContractInterviewState(recoveryState);
        setSingleEditFieldId(null);
        await persistInterviewState(activeConversationId, recoveryState);
        const message =
          error instanceof ApiError
            ? `${error.message} (${error.status})`
            : error instanceof Error
              ? error.message
              : "Falha ao gerar contrato";
        const failedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Nao consegui gerar o contrato agora. Revise os dados e tente novamente.",
          thread: {
            ...threadForInterview,
            status: "blocked",
          },
          card: {
            type: "risk",
            title: "Geracao de contrato pausada",
            thread: {
              id: threadForInterview.id,
              label: threadForInterview.label,
              status: "blocked",
            },
            lines: ["A revisao segue disponivel no rascunho."],
            risk: {
              level: "high",
              reason: message,
            },
          },
        };
        appendMessage(failedMessage);
        void persistMessage(failedMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: recoveryState },
        });
        setState("awaiting_user_action");
      }
    },
    [appendMessage, persistInterviewState, persistMessage]
  );

  const sendMessageText = async (rawText: string, options?: { displayText?: string; suppressUserEcho?: boolean }) => {
    const text = rawText.trim();
    const displayText = options?.displayText?.trim() || text;
    if (!text) return;
    const selectedThread = selectedThreadId ? threads.find((item) => item.threadId === selectedThreadId) : null;
    const currentThreadId = selectedThread?.threadId ?? activeThread?.id ?? null;
    const currentThreadLabel = selectedThread?.label ?? activeThread?.label ?? null;
    const userMessageId = makeId("user");
    appendMessage({
      id: userMessageId,
      role: "user",
      text: displayText,
      thread:
        currentThreadId && currentThreadLabel
          ? {
              id: currentThreadId,
              label: currentThreadLabel,
              status: "active",
            }
          : undefined,
    });
    setInput("");
    setState("typing");
    const startedAt = Date.now();
    let turn: ImobResolveTurnResponse;
    let resolvedCaseId: string | null = null;
    try {
      resolvedCaseId = currentThreadId
        ? caseIdByThreadRef.current[currentThreadId] ?? requestedCaseId ?? null
        : requestedCaseId ?? null;
      turn = await resolveImobTurn({
        message: text,
        threadLabel: currentThreadLabel,
        threadId: currentThreadId,
        caseId: resolvedCaseId,
        recipeId: requestedRecipeId,
        threadState: currentThreadId ? conversationStateByThreadRef.current[currentThreadId] ?? null : null,
        actionId: requestedActionId,
      });
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `${error.message} (${error.status})`
          : error instanceof Error
            ? error.message
            : "Falha ao resolver esta mensagem";
      appendMessage({
        id: makeId("assistant"),
        role: "assistant",
        text: "Nao consegui preparar sua solicitacao agora. Tente novamente em instantes.",
        thread: currentThreadId && currentThreadLabel ? { id: currentThreadId, label: currentThreadLabel, status: "blocked" } : undefined,
        card: {
          type: "risk",
          title: "Falha no envio",
          thread: currentThreadId && currentThreadLabel ? { id: currentThreadId, label: currentThreadLabel, status: "blocked" } : undefined,
          lines: [message],
          risk: {
            level: "high",
            reason: message,
          },
        },
      });
      setState("blocked");
      return;
    }
    const resolvedIntent = turn.executionRequest?.intent ?? null;
    const caseContextThreadId = typeof turn.caseContext?.threadId === "string" && turn.caseContext.threadId.trim().length > 0
      ? turn.caseContext.threadId.trim()
      : null;
    const sameCaseAsCurrentThread = Boolean(
      currentThreadId
      && turn.caseContext?.caseId
      && (
        (resolvedCaseId && turn.caseContext.caseId === resolvedCaseId)
        || caseIdByThreadRef.current[currentThreadId] === turn.caseContext.caseId
      ),
    );
    const operationThread = selectedThread
      ? { id: selectedThread.threadId, label: selectedThread.label }
      : caseContextThreadId
        ? {
            id: caseContextThreadId,
            label: turn.threadLabel,
          }
      : sameCaseAsCurrentThread && currentThreadId
        ? {
            id: currentThreadId,
            label: turn.threadLabel,
          }
      : activeThread && activeThread.label === turn.threadLabel
        ? activeThread
        : {
            id: makeId("thread"),
            label: turn.threadLabel,
          };
    conversationStateByThreadRef.current[operationThread.id] = turn.conversationState;
    if (turn.caseContext?.caseId) {
      caseIdByThreadRef.current[operationThread.id] = turn.caseContext.caseId;
    }
    if (turn.caseContext) {
      caseContextByThreadRef.current[operationThread.id] = turn.caseContext;
    }
    if (turn.presentation.card?.ctas?.some((cta) => isOpenAttachmentMenuAction(cta.action))) {
      setAttachmentMenuOpen(true);
    }
    let activeConversationId = conversationId;
    if (!activeConversationId) {
      try {
        const created = await apiCreateImobChatConversation({
          title: getConversationTitleFromMessage(displayText, conversations),
        });
        activeConversationId = created.conversation.conversationId;
        setConversationId(activeConversationId);
        setConversations((prev) => [created.conversation, ...prev]);
        sessionRunByThreadRef.current = {};
      } catch (error) {
        const message =
          error instanceof ApiError
            ? `${error.message} (${error.status})`
            : error instanceof Error
              ? error.message
              : "Falha ao criar conversa";
        appendMessage({
          id: makeId("assistant"),
          role: "assistant",
          text: "Nao consegui abrir a conversa operacional agora.",
          thread: {
            id: operationThread.id,
            label: operationThread.label,
            status: "blocked",
          },
          card: {
            type: "risk",
            title: "Conversa nao iniciada",
            thread: {
              id: operationThread.id,
              label: operationThread.label,
              status: "blocked",
            },
            lines: [message],
            risk: {
              level: "high",
              reason: message,
            },
          },
          caseContext: turn.caseContext ?? undefined,
        });
        setState("blocked");
        return;
      }
    }

    updateMessageById(userMessageId, {
      thread: {
        id: operationThread.id,
        label: operationThread.label,
        status: "active",
      },
    });
    const interviewIsActive =
      !!contractInterviewState &&
      (contractInterviewState.status === "collecting" ||
        contractInterviewState.status === "review" ||
        contractInterviewState.status === "generating");
    const shouldContinueContractInterview =
      interviewIsActive &&
      (resolvedIntent === null || resolvedIntent === "adjustment" || resolvedIntent === "contract");

    void persistMessage(
      {
        id: userMessageId,
        role: "user",
        text: displayText,
        thread: {
          id: operationThread.id,
          label: operationThread.label,
          status: "active",
        },
      },
      {
      conversationId: activeConversationId,
      contentOverride: text,
      metadata: shouldContinueContractInterview ? { contractInterview: contractInterviewState } : undefined,
      }
    );
    if (shouldContinueContractInterview || resolvedIntent === "contract") {
      const threadForInterview = {
        id: operationThread.id,
        label: "Contrato",
        status: "active" as const,
      };

      if (!contractInterviewState || contractInterviewState.status === "generated") {
        const initialInterview = createInitialContractInterviewState();
        setContractInterviewState(initialInterview);
        setSingleEditFieldId(null);
        await persistInterviewState(activeConversationId, initialInterview);
        const kickoffMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: getContractTypePrompt(),
          thread: threadForInterview,
        };
        appendMessage(kickoffMessage);
        void persistMessage(kickoffMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: initialInterview },
        });
        setState("awaiting_user_action");
        return;
      }

      if (contractInterviewState.status === "review") {
        const editQuery = extractEditFieldQuery(text);
        if (editQuery) {
          await handleReviewEditAction(editQuery, contractInterviewState, activeConversationId, threadForInterview);
          return;
        }
        if (isAffirmativeAnswer(text)) {
          await handleReviewConfirmAction(contractInterviewState, activeConversationId, threadForInterview);
          return;
        }
        if (isNegativeAnswer(text)) {
          await handleReviewDeclineAction(contractInterviewState, activeConversationId, threadForInterview);
          return;
        }
        const reminderMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Use os controles no rascunho para editar, confirmar ou nao gerar.",
          thread: threadForInterview,
        };
        appendMessage(reminderMessage);
        void persistMessage(reminderMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: contractInterviewState },
        });
        setState("awaiting_user_action");
        return;
      }

      if (singleEditFieldId) {
        const editApplied = applySingleFieldEditAnswer(contractInterviewState, singleEditFieldId, text);
        const updatedEditState: ContractInterviewState = {
          ...editApplied.state,
          updatedAt: new Date().toISOString(),
        };
        setContractInterviewState(updatedEditState);
        await persistInterviewState(activeConversationId, updatedEditState);
        const editMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: editApplied.ok
            ? editApplied.message ?? "Rascunho atualizado."
            : `${editApplied.message}

${getStepQuestionText(contractInterviewState) ?? "Informe novamente este campo."}`,
          thread: threadForInterview,
        };
        appendMessage(editMessage);
        void persistMessage(editMessage, {
          conversationId: activeConversationId,
          intent: "contract",
          action: "realestate.create_contract",
          metadata: { contractInterview: updatedEditState },
        });
        if (editApplied.ok) {
          setSingleEditFieldId(null);
        }
        setState("awaiting_user_action");
        return;
      }

      const result = applyContractInterviewAnswer(contractInterviewState, text);
      const nextInterviewState: ContractInterviewState = {
        ...result.state,
        updatedAt: new Date().toISOString(),
      };
      setContractInterviewState(nextInterviewState);
      await persistInterviewState(activeConversationId, nextInterviewState);
      const interviewMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: result.message ?? "Resumo atualizado. Responda: sim, nao ou editar <campo>.",
        thread: threadForInterview,
      };
      appendMessage(interviewMessage);
      void persistMessage(interviewMessage, {
        conversationId: activeConversationId,
        intent: "contract",
        action: "realestate.create_contract",
        metadata: { contractInterview: nextInterviewState },
      });
      setState("awaiting_user_action");
      return;
    }

    const baseThreadStatus = turn.action === "crm.batch.intake" ? ("done" as const) : ("active" as const);
    const baseThread = {
      id: operationThread.id,
      label: turn.threadLabel,
      status: baseThreadStatus,
    };

    if (turn.mode === "blocked") {
      const proof = resolveTurnPresentationProof(turn.presentation);
      const blockedReply: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: turn.presentation.text,
        presentationMetadata: turn.presentation.metadata,
        blocks: buildPresentationBlocks(turn.presentation),
        widget: mapPresentationWidget(turn.presentation.widget),
        form: mapApiPresentationForm(turn.presentation.form),
        proof,
        thread: { ...baseThread, status: "blocked" },
        card: mapReplyCardFromPresentation(turn.presentation, { ...baseThread, status: "blocked" }, turn.caseContext),
        caseContext: turn.caseContext ?? undefined,
      };
      appendMessage(blockedReply);
      void persistMessage(blockedReply, {
        action: turn.action,
        conversationId: activeConversationId,
      });
      void apiCreateImobChatTelemetry({
        conversationId: activeConversationId,
        event: "message_to_plan_ms",
        value: Date.now() - startedAt,
        metadata: buildJourneyTelemetryMetadata(turn.caseContext, { action: turn.action, mode: turn.mode }),
      });
      setState("blocked");
      return;
    }

    if (turn.mode === "consult") {
      const proof = resolveTurnPresentationProof(turn.presentation);
      const consultReply: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: turn.presentation.text,
        presentationMetadata: turn.presentation.metadata,
        blocks: buildPresentationBlocks(turn.presentation),
        widget: mapPresentationWidget(turn.presentation.widget),
        form: mapApiPresentationForm(turn.presentation.form),
        proof,
        thread: baseThread,
        card: mapReplyCardFromPresentation(turn.presentation, baseThread, turn.caseContext),
        caseContext: turn.caseContext ?? undefined,
        consultBadge: requestedActionId ? "consulta — não altera estado" : undefined,
      };
      appendMessage(consultReply);
      void persistMessage(consultReply, {
        action: turn.action,
        conversationId: activeConversationId,
      });
      void apiCreateImobChatTelemetry({
        conversationId: activeConversationId,
        event: "message_to_plan_ms",
        value: Date.now() - startedAt,
        metadata: buildJourneyTelemetryMetadata(turn.caseContext, { action: turn.action, mode: turn.mode }),
      });
      void apiCreateImobChatTelemetry({
        conversationId: activeConversationId,
        event: "ux_interaction",
        value: 1,
        metadata: {
          action: "journey_turn_resolved",
          ...buildJourneyTelemetryMetadata(turn.caseContext, { action: turn.action, mode: turn.mode }),
        },
      });
      setActiveThread({ id: baseThread.id, label: baseThread.label });
      setState("done");
      return;
    }

    if (turn.mode === "search_knowledge") {
      try {
        const search = await apiSearchImobKnowledge({
          query: turn.knowledgeRequest?.query ?? text,
          filters: turn.knowledgeRequest?.filters,
        });
        const searchReply: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: buildKnowledgeSearchResponse(search.data, turn),
          thread: baseThread,
          card: buildKnowledgeSearchCard(search.data, turn, baseThread),
        };
        if (search.data.items.length > 0) {
          const sourceActions = selectKnowledgeActions(
            search.data.items[0],
            mapKnowledgeActions(searchReply.card?.ctas, baseThread.id, withDashboardContext)
          );
          setSelectedKnowledgeContext({
            item: search.data.items[0],
            sourceActions,
            threadId: baseThread.id,
          });
        }
        appendMessage(searchReply);
        void persistMessage(searchReply, {
          action: turn.action,
          conversationId: activeConversationId,
          metadata: { knowledgeSearch: search.data },
        });
        if (activeConversationId) {
          void apiCreateImobChatTelemetry({
            conversationId: activeConversationId,
            event: "message_to_plan_ms",
            value: Date.now() - startedAt,
            metadata: buildJourneyTelemetryMetadata(turn.caseContext, { action: turn.action, mode: turn.mode, resultTotal: search.data.total }),
          });
        }
        setActiveThread({ id: baseThread.id, label: baseThread.label });
        setState("done");
      } catch (error) {
        const errorMessage =
          error instanceof ApiError && error.status === 403
            ? resolveImobAccessGateCopy(imobAccessGate).body
            : "Não consegui consultar o acervo IMOB agora. Tente novamente em instantes.";
        const failureReply: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: errorMessage,
          thread: { ...baseThread, status: "blocked" },
        };
        appendMessage(failureReply);
        setState("blocked");
      }
      return;
    }

    if (turn.mode === "search") {
      const inventory = await searchImobInventory(turn.searchRequest ?? { query: text });
      const proof = resolveTurnPresentationProof(inventory.presentation);
      const searchReply: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: inventory.presentation.text,
        widget: mapPresentationWidget(inventory.presentation.widget),
        proof,
        thread: baseThread,
        card: mapReplyCardFromPresentation(inventory.presentation, baseThread, turn.caseContext),
        caseContext: turn.caseContext ?? undefined,
      };
      appendMessage(searchReply);
      void persistMessage(searchReply, {
        action: turn.action,
        conversationId: activeConversationId,
        metadata: { inventorySearch: inventory },
      });
      if (activeConversationId) {
        void apiCreateImobChatTelemetry({
          conversationId: activeConversationId,
          event: "message_to_plan_ms",
          value: Date.now() - startedAt,
          metadata: buildJourneyTelemetryMetadata(turn.caseContext, { action: turn.action, mode: turn.mode }),
        });
      }
      setActiveThread({ id: baseThread.id, label: baseThread.label });
      setState("done");
      return;
    }

    if (!turn.executionRequest) {
      const failedReply: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: "Não consegui preparar esta etapa agora.",
        thread: { ...baseThread, status: "blocked" },
      };
      appendMessage(failedReply);
      setState("blocked");
      return;
    }

    if (shouldUseDirectedActionFlow(requestedActionId, turn.mode)) {
      await prepareDirectedActionExecution(
        turn.executionRequest,
        operationThread,
        activeConversationId,
        startedAt,
        turn.caseContext ?? undefined,
        turn.presentation.text,
      );
      return;
    }

    await startPlanExecution(
      turn.executionRequest,
      operationThread,
      activeConversationId,
      startedAt,
      turn.presentation.text,
      turn.conversationState.operational?.flow,
      turn.conversationState.operational?.pendingFields,
      turn.caseContext ?? undefined,
      {
        owner: turn.presentation.owner,
        nextStep: turn.presentation.nextStep,
        blocker: turn.presentation.blocker,
        pendingFieldLabels: turn.presentation.pendingFieldLabels,
        dedupeKey: turn.presentation.dedupeKey,
        suggestedNextAction: turn.presentation.suggestedNextAction,
      },
      turn.presentation.proof,
      turn.presentation.form,
      turn.presentation.card,
      turn.presentation.blocks,
    );
  };

  React.useEffect(() => {
    if (contractInterviewState?.status !== "review") return;
    if (contractEditableFields.length === 0) return;
    const found = contractEditableFields.some((item) => item.id === draftEditFieldId);
    if (!found) {
      setDraftEditFieldId(contractEditableFields[0].id);
    }
  }, [contractEditableFields, contractInterviewState?.status, draftEditFieldId]);

  const handleDraftEditFromPanel = React.useCallback(async () => {
    if (!conversationId || !contractInterviewState || contractInterviewState.status !== "review") return;
    const query = draftEditFieldId || contractEditableFields[0]?.id;
    if (!query) return;
    const operationThread = resolveInterviewOperationThread();
    const threadForInterview = {
      id: operationThread.id,
      label: "Contrato",
      status: "active" as const,
    };
    setReviewActionLoading("edit");
    try {
      await handleReviewEditAction(query, contractInterviewState, conversationId, threadForInterview);
    } finally {
      setReviewActionLoading(null);
    }
  }, [
    contractEditableFields,
    contractInterviewState,
    conversationId,
    draftEditFieldId,
    handleReviewEditAction,
    resolveInterviewOperationThread,
  ]);

  const handleDraftConfirmFromPanel = React.useCallback(async () => {
    if (!conversationId || !contractInterviewState || contractInterviewState.status !== "review") return;
    const operationThread = resolveInterviewOperationThread();
    const threadForInterview = {
      id: operationThread.id,
      label: "Contrato",
      status: "active" as const,
    };
    setReviewActionLoading("confirm");
    try {
      await handleReviewConfirmAction(
        contractInterviewState,
        conversationId,
        threadForInterview
      );
    } finally {
      setReviewActionLoading(null);
    }
  }, [contractInterviewState, conversationId, handleReviewConfirmAction, resolveInterviewOperationThread]);

  const handleDraftDeclineFromPanel = React.useCallback(async () => {
    if (!conversationId || !contractInterviewState || contractInterviewState.status !== "review") return;
    const operationThread = resolveInterviewOperationThread();
    const threadForInterview = {
      id: operationThread.id,
      label: "Contrato",
      status: "active" as const,
    };
    setReviewActionLoading("decline");
    try {
      await handleReviewDeclineAction(contractInterviewState, conversationId, threadForInterview);
    } finally {
      setReviewActionLoading(null);
    }
  }, [contractInterviewState, conversationId, handleReviewDeclineAction, resolveInterviewOperationThread]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    await sendMessageText(text);
  };

  const handleWidgetAction = React.useCallback(
    (action: { id: string; label: string; autoprompt: string }, caseContext?: ImobCaseContext | null) => {
      trackUxEvent(
        "widget_action_selected",
        buildJourneyTelemetryMetadata(caseContext, {
          widgetActionId: action.id,
          widgetActionLabel: action.label,
        }),
      );
      void sendMessageText(action.autoprompt, { displayText: action.label });
    },
    [sendMessageText, trackUxEvent]
  );

  const handleDocumentUpload = async (files: FileList | null) => {
    const selectedFiles = Array.from(files ?? []);
    if (selectedFiles.length === 0) return;

    const selectedThread = selectedThreadId ? threads.find((item) => item.threadId === selectedThreadId) : null;
    const uploadThread = selectedThread
      ? { id: selectedThread.threadId, label: selectedThread.label }
      : activeThread ?? { id: makeId("thread"), label: "Documentos" };
    const resolvedUploadCaseId = resolveBestCaseIdForThread(
      messages,
      uploadThread.id,
      caseIdByThreadRef.current,
      null,
    );

    let activeConversationId = conversationId;
    if (!activeConversationId) {
      try {
        const created = await apiCreateImobChatConversation({
          title: getConversationTitleFromMessage(`Anexo ${selectedFiles[0].name}`, conversations),
        });
        activeConversationId = created.conversation.conversationId;
        setConversationId(activeConversationId);
        setConversations((prev) => [created.conversation, ...prev]);
        sessionRunByThreadRef.current = {};
      } catch (error) {
        const message =
          error instanceof ApiError
            ? `${error.message} (${error.status})`
            : error instanceof Error
              ? error.message
              : "Falha ao criar conversa para upload";
        appendMessage({
          id: makeId("assistant"),
          role: "assistant",
          text: "Nao consegui abrir a conversa para anexar o documento.",
          thread: { id: uploadThread.id, label: uploadThread.label, status: "blocked" },
          card: {
            type: "risk",
            title: "Upload nao iniciado",
            thread: { id: uploadThread.id, label: uploadThread.label, status: "blocked" },
            lines: [message],
            risk: { level: "high", reason: message },
          },
        });
        setState("blocked");
        return;
      }
    }

    setUploadingDocuments(true);
    try {
      const formData = new FormData();
      for (const file of selectedFiles) formData.append("files", file);
      const uploaded = await apiUploadDocuments(formData, "imob");
      const uploadedItems = uploaded.data ?? [];
      const uploadMessage: ChatMessage = {
        id: makeId("assistant"),
        role: "assistant",
        text: uploadedItems.length === 1
          ? "Documento anexado ao contexto desta conversa."
          : `${uploadedItems.length} documento(s) anexados ao contexto desta conversa.`,
        thread: { id: uploadThread.id, label: uploadThread.label, status: "active" },
        caseContext: resolvedUploadCaseId
          ? {
              caseId: resolvedUploadCaseId,
              flow: "documents.collect",
              stage: "collecting",
              status: "pending_data",
              threadId: uploadThread.id,
            }
          : undefined,
        card: {
          type: "evidence",
          title: uploadedItems.length === 1 ? "Documento anexado" : "Documentos anexados",
          thread: { id: uploadThread.id, label: uploadThread.label, status: "active" },
          lines: uploadedItems.map((item) => `${item.name} | ${formatUploadSize(item.sizeBytes)}`),
          ctas: uploadedItems.slice(0, 2).map((item) => ({ id: `upload-${item.id}`, label: item.name, kind: "neutral" as const, href: item.url })),
        },
      };
      appendMessage(uploadMessage);
      await persistMessage(uploadMessage, {
        conversationId: activeConversationId,
        metadata: {
          uploadedDocuments: uploadedItems,
          attachmentUsed: true,
        },
      });
      trackUxEvent("attachment_uploaded", {
        threadId: uploadThread.id,
        uploadedDocuments: uploadedItems.length,
        caseId: resolvedUploadCaseId,
      });

      try {
        const attachmentResolution = await apiResolveImobAttachment({
          caseId: resolvedUploadCaseId,
          threadId: uploadThread.id,
          conversationId: activeConversationId,
          documentIds: uploadedItems.map((item) => item.id),
        });
        if (attachmentResolution.data.caseContext?.caseId && uploadThread.id) {
          caseIdByThreadRef.current[uploadThread.id] = attachmentResolution.data.caseContext.caseId;
        }
        const attachmentFollowUp: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: attachmentResolution.data.presentation.text,
          blocks: buildPresentationBlocks(attachmentResolution.data.presentation),
          widget: mapPresentationWidget(attachmentResolution.data.presentation.widget),
          proof: resolveTurnPresentationProof(attachmentResolution.data.presentation),
          thread: { id: uploadThread.id, label: uploadThread.label, status: attachmentResolution.data.resolved ? "done" : "active" },
          card: mapReplyCardFromPresentation(attachmentResolution.data.presentation, {
            id: uploadThread.id,
            label: uploadThread.label,
            status: attachmentResolution.data.resolved ? "done" : "active",
          }, attachmentResolution.data.caseContext ?? uploadMessage.caseContext),
          caseContext: attachmentResolution.data.caseContext ?? uploadMessage.caseContext,
        };
        appendMessage(attachmentFollowUp);
        await persistMessage(attachmentFollowUp, {
          conversationId: activeConversationId,
          metadata: {
            uploadedDocuments: uploadedItems,
            attachmentResolution: attachmentResolution.data,
          },
        });
        trackUxEvent(
          "attachment_validated",
          buildJourneyTelemetryMetadata(attachmentResolution.data.caseContext ?? uploadMessage.caseContext, {
            threadId: uploadThread.id,
            uploadedDocuments: uploadedItems.length,
            resolved: attachmentResolution.data.resolved,
          }),
        );
      } catch (resolutionError) {
        const resolutionMessage =
          resolutionError instanceof ApiError
            ? `${resolutionError.message} (${resolutionError.status})`
            : resolutionError instanceof Error
              ? resolutionError.message
              : "Falha ao validar o documento anexado";
        const validationFollowUp: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Documento anexado com sucesso, mas nao consegui validar esse anexo agora.",
          thread: { id: uploadThread.id, label: uploadThread.label, status: "active" },
          caseContext: uploadMessage.caseContext,
          card: {
            type: "risk",
            title: "Validacao pendente",
            thread: { id: uploadThread.id, label: uploadThread.label, status: "active" },
            lines: [
              "O documento ficou salvo no contexto da conversa.",
              resolutionMessage,
              "Tente novamente em instantes ou siga com revisao manual.",
            ],
            risk: { level: "medium", reason: resolutionMessage },
          },
        };
        appendMessage(validationFollowUp);
        await persistMessage(validationFollowUp, {
          conversationId: activeConversationId,
          metadata: {
            uploadedDocuments: uploadedItems,
            attachmentResolutionError: resolutionMessage,
          },
        });
      }
      setState("idle");
      void refreshConversations(activeConversationId);
      void refreshThreads(activeConversationId);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `${error.message} (${error.status})`
          : error instanceof Error
            ? error.message
            : "Falha no upload do documento";
      appendMessage({
        id: makeId("assistant"),
        role: "assistant",
        text: "Nao consegui anexar o documento agora.",
        thread: { id: uploadThread.id, label: uploadThread.label, status: "blocked" },
        card: {
          type: "risk",
          title: "Upload com falha",
          thread: { id: uploadThread.id, label: uploadThread.label, status: "blocked" },
          lines: [message],
          risk: { level: "high", reason: message },
        },
      });
      setState("blocked");
    } finally {
      setUploadingDocuments(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAttachmentCrmSuggestionAction = React.useCallback(
    async (message: ChatMessage, cta: CardCta) => {
      if (!conversationId || !isAttachmentCrmSuggestionAction(cta.action)) return;
      const payload = cta.payload ?? {};
      const documentIds = Array.isArray(payload.documentIds)
        ? payload.documentIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [];
      const mode = payload.mode;
      const threadId = typeof payload.threadId === "string" && payload.threadId.trim().length > 0
        ? payload.threadId
        : message.caseContext?.threadId ?? message.thread?.id ?? message.card?.thread?.id ?? null;
      const caseId = resolveBestCaseIdForThread(
        messages,
        threadId,
        caseIdByThreadRef.current,
        typeof payload.caseId === "string" && payload.caseId.trim().length > 0 ? payload.caseId : null,
      );
      if (documentIds.length === 0 || (mode !== "include" && mode !== "edit" && mode !== "discard")) {
        return;
      }

      setCrmSuggestionLoadingId(message.id);
      try {
        const response = await apiApplyImobAttachmentCrmSuggestion({
          caseId,
          threadId,
          conversationId,
          documentIds,
          mode,
        });
        const thread = {
          id: threadId ?? message.thread?.id ?? message.card?.thread?.id ?? makeId("thread"),
          label: message.thread?.label ?? message.card?.thread?.label ?? "Documentos",
          status: response.data.applied ? "done" as const : "active" as const,
        };
        if (response.data.caseContext?.caseId && thread.id) {
          caseIdByThreadRef.current[thread.id] = response.data.caseContext.caseId;
        }
        const followUp: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: response.data.presentation.text,
          presentationMetadata: response.data.presentation.metadata,
          blocks: buildPresentationBlocks(response.data.presentation),
          widget: mapPresentationWidget(response.data.presentation.widget),
          form: mapApiPresentationForm(response.data.presentation.form),
          proof: resolveTurnPresentationProof(response.data.presentation),
          thread,
          card: mapReplyCardFromPresentation(response.data.presentation, thread, response.data.caseContext ?? message.caseContext),
          caseContext: response.data.caseContext ?? message.caseContext,
        };
        appendMessage(followUp);
        await persistMessage(followUp, {
          conversationId,
          metadata: {
            attachmentCrmSuggestionDecision: {
              mode,
              documentIds,
              caseId,
              threadId: thread.id,
            },
            attachmentCrmSuggestionResponse: response.data,
          },
        });
      } catch (error) {
        const reason =
          error instanceof ApiError
            ? `${error.message} (${error.status})`
            : error instanceof Error
              ? error.message
              : "Falha ao aplicar sugestao de cadastro no CRM";
        const thread = {
          id: message.thread?.id ?? message.card?.thread?.id ?? makeId("thread"),
          label: message.thread?.label ?? message.card?.thread?.label ?? "Documentos",
          status: "blocked" as const,
        };
        const failedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Nao consegui aplicar essa sugestao de cadastro no CRM agora.",
          thread,
          caseContext: message.caseContext,
          card: {
            type: "risk",
            title: "Sugestao de CRM pendente",
            thread,
            lines: [
              "A leitura do documento continua disponivel no chat.",
              reason,
              "Tente novamente ou siga com o cadastro manualmente.",
            ],
            risk: { level: "medium", reason },
          },
        };
        appendMessage(failedMessage);
        await persistMessage(failedMessage, {
          conversationId,
          metadata: {
            attachmentCrmSuggestionError: reason,
            attachmentCrmSuggestionPayload: cta.payload ?? null,
          },
        });
      } finally {
        setCrmSuggestionLoadingId(null);
      }
    },
    [appendMessage, conversationId, messages, persistMessage]
  );

  const updateFormFieldValue = React.useCallback((messageId: string, fieldName: string, value: string) => {
    setFormValuesByMessageId((prev) => ({
      ...prev,
      [messageId]: {
        ...(prev[messageId] ?? {}),
        [fieldName]: value,
      },
    }));
    setFormErrorsByMessageId((prev) => {
      if (!prev[messageId]?.[fieldName]) return prev;
      const nextFieldErrors = { ...(prev[messageId] ?? {}) };
      delete nextFieldErrors[fieldName];
      return { ...prev, [messageId]: nextFieldErrors };
    });
  }, []);

  const setFormLookupLoading = React.useCallback((messageId: string, fieldName: string, isLoading: boolean) => {
    setFormLookupLoadingByMessageId((prev) => ({
      ...prev,
      [messageId]: {
        ...(prev[messageId] ?? {}),
        [fieldName]: isLoading,
      },
    }));
  }, []);

  const applyCepLookupToForm = React.useCallback(async (message: ChatMessage, fieldName: string, rawValue: string) => {
    const form = message.form;
    const field = form?.fields.find((item) => item.name === fieldName);
    if (!form || !field || field.lookup?.kind !== "cep") return null;

    const normalizedCep = normalizeCepValue(rawValue);
    updateFormFieldValue(message.id, fieldName, normalizedCep);
    if (normalizedCep.replace(/\D/g, "").length !== 8) return null;

    setFormLookupLoading(message.id, fieldName, true);
    try {
      const response = await apiLookupImobCep(normalizedCep);
      const nextValues: Array<[string, string | null]> = [
        [fieldName, response.data.cep],
        [resolveFieldAutofillTarget(field, "city") ?? "", response.data.city],
        [resolveFieldAutofillTarget(field, "address") ?? "", response.data.street ?? response.data.address],
        [resolveFieldAutofillTarget(field, "neighborhood") ?? "", response.data.neighborhood],
      ];
      const appliedValues: Record<string, string> = {};

      for (const [targetFieldName, nextValue] of nextValues) {
        if (!targetFieldName || !nextValue) continue;
        appliedValues[targetFieldName] = nextValue;
        updateFormFieldValue(message.id, targetFieldName, nextValue);
      }
      return appliedValues;
    } catch (error) {
      const reason =
        error instanceof ApiError
          ? error.status === 404
            ? "CEP não encontrado."
            : `Não consegui consultar o CEP agora. (${error.status})`
          : "Não consegui consultar o CEP agora.";
      setFormErrorsByMessageId((prev) => ({
        ...prev,
        [message.id]: {
          ...(prev[message.id] ?? {}),
          [fieldName]: reason,
        },
      }));
      return null;
    } finally {
      setFormLookupLoading(message.id, fieldName, false);
    }
  }, [setFormLookupLoading, updateFormFieldValue]);


  async function handlePresentationFormAction(message: ChatMessage, actionId: "cancel" | "submit") {
    const form = message.form;
    if (!form) return;
    if (actionId === "cancel") {
      setFormValuesByMessageId((prev) => ({
        ...prev,
        [message.id]: resolveFormValuesForMessage(message),
      }));
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: {} }));
      return;
    }

    const currentValues = resolveFormValuesForMessage(message);
    const cepField = form.fields.find((field) => field.lookup?.kind === "cep");
    if (cepField) {
      const needsAutofill = [
        resolveFieldAutofillTarget(cepField, "city"),
        resolveFieldAutofillTarget(cepField, "address"),
      ].some((targetFieldName) => targetFieldName && !normalizeImobFormValue(currentValues[targetFieldName] ?? ""));
      if (needsAutofill && normalizeCepValue(currentValues[cepField.name] ?? "").replace(/\D/g, "").length === 8) {
        const appliedValues = await applyCepLookupToForm(message, cepField.name, currentValues[cepField.name] ?? "");
        if (appliedValues) {
          for (const [fieldName, value] of Object.entries(appliedValues)) {
            currentValues[fieldName] = value;
          }
        }
      }
    }
    const partialCreateSave = allowsPartialCreateSave(form);
    const nextErrors: Record<string, string> = {};
    for (const field of form.fields) {
      const value = normalizeImobFormValue(currentValues[field.name] ?? "");
      const requiresTypedValue = field.required && !field.allowAttachment;
      if (!partialCreateSave && requiresTypedValue && !value) {
        nextErrors[field.name] = "Preencha este campo para continuar.";
        continue;
      }
      const normalizedFieldName = field.name.toLowerCase();
      if (value && (normalizedFieldName.includes("email") || field.type === "email") && !isLikelyEmail(value)) {
        nextErrors[field.name] = "Informe um e-mail válido.";
        continue;
      }
      if (value && normalizedFieldName.includes("phone") && !isLikelyPhone(value)) {
        nextErrors[field.name] = "Informe um telefone válido com DDD.";
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setFormErrorsByMessageId((prev) => ({ ...prev, [message.id]: nextErrors }));
      return;
    }

    const payload = buildPresentationFormSubmission(form, currentValues);
    if (!payload.trim()) {
      setFormErrorsByMessageId((prev) => ({
        ...prev,
        [message.id]: { [form.fields[0]?.name ?? "form"]: "Informe ao menos um dado para salvar." },
      }));
      return;
    }

    await sendMessageText(payload, {
      displayText: buildPresentationFormDisplayText(form, actionId),
      suppressUserEcho: true,
    });
    updateMessageById(message.id, {
      form: undefined,
      card: null as any,
    });
  }

  const runExecutionFlow = React.useCallback(
    async (executionPending: PendingExecution, options?: { trackConfirm?: boolean }) => {
      if (options?.trackConfirm) {
        trackUxEvent("execution_confirmed", {
          threadId: executionPending.thread.id,
          messageId: executionPending.messageId,
          action: executionPending.plan.action,
        });
      }
      setOpenOptionsMessageId(null);
      setState("executing");
      updateMessageById(executionPending.messageId, {
        text: executionPending.presentationText,
        thread: {
          id: executionPending.thread.id,
          label: executionPending.thread.label,
          status: "active",
        },
        card: {
          type: "queue",
          title: "Preparando",
          thread: {
            id: executionPending.thread.id,
            label: executionPending.thread.label,
            status: "active",
          },
          lines: [],
          queue: {
            status: "running",
            step: "prepare",
          },
        },
      });

      try {
        const sessionRunId = sessionRunByThreadRef.current[executionPending.thread.id] ?? null;
        const parentRunId = sessionRunId;
        const execution = await apiAgentsExecute({
          domain: "imob",
          action: executionPending.plan.action,
          version: executionPending.contract.version,
          input: executionPending.plan.input,
          prompt: executionPending.plan.prompt,
          parentRunId: parentRunId ?? undefined,
          metadata: buildAgentsExecuteMetadata({
            chatFlow: "imob-operational-chat",
            intent: executionPending.plan.intent,
            conversationId: conversationId ?? undefined,
            threadId: executionPending.thread.id,
            threadLabel: executionPending.thread.label,
            sessionRunId: sessionRunId ?? undefined,
            source: executionPending.source ?? null,
          }),
        });

        const runId = execution.data.runId;
        if (!sessionRunByThreadRef.current[executionPending.thread.id]) {
          sessionRunByThreadRef.current[executionPending.thread.id] = runId;
        }
        setActiveRunId(runId);
        setActiveThread(executionPending.thread);
        setRunStatus(execution.data.status);
        if (contractInterviewState?.status === "generating") {
          const generatedState: ContractInterviewState = {
            ...contractInterviewState,
            status: "generated",
            runId,
            updatedAt: new Date().toISOString(),
          };
          setContractInterviewState(generatedState);
          if (conversationId) {
            void persistInterviewState(conversationId, generatedState);
          }
        }
        persistedRunStatusKeysRef.current.delete(`${runId}:success`);
        persistedRunStatusKeysRef.current.delete(`${runId}:blocked`);
        persistedRunStatusKeysRef.current.delete(`${runId}:error`);
        setPendingExecution(executionPending);
        setState("executing");
        const startedProof = buildRuntimeExecutionProof({
          runId,
          txId: execution.data.verify.txId,
          bundlePath: execution.data.verify.runBundlePath,
          receiptPath: resolveRunTemplatePath(executionPending.receiptEndpointTemplate, runId),
        });

        updateMessageById(executionPending.messageId, {
          text: executionPending.presentationText,
          proof: startedProof,
          thread: {
            id: executionPending.thread.id,
            label: executionPending.thread.label,
            status: "active",
          },
          card: {
            type: "queue",
            title: "Em andamento",
            thread: {
              id: executionPending.thread.id,
              label: executionPending.thread.label,
              status: "active",
            },
            lines: ["Atualizando progresso em tempo real."],
            runId,
            queue: {
              status: execution.data.status,
              step: "execute",
            },
            proof: startedProof,
            ctas: [
              {
                id: "view-run",
                label: "Ver execução",
                kind: "neutral",
                href: withRunContext(runId, executionPending.thread.id, executionPending.caseContext?.caseId ?? null),
              },
              ...(execution.data.verify.runBundlePath
                ? [{ id: "open-bundle", label: "Ver dossiê", kind: "neutral" as const, href: execution.data.verify.runBundlePath }]
                : []),
            ],
          },
        });
        const startedKey = `${runId}:started`;
        if (!persistedRunStatusKeysRef.current.has(startedKey)) {
          persistedRunStatusKeysRef.current.add(startedKey);
          void persistMessage({
            id: makeId("assistant"),
            role: "assistant",
            text: executionPending.presentationText,
            proof: startedProof,
            thread: {
              id: executionPending.thread.id,
              label: executionPending.thread.label,
              status: "active",
            },
            card: {
              type: "queue",
              title: "Em andamento",
              thread: {
                id: executionPending.thread.id,
                label: executionPending.thread.label,
                status: "active",
              },
              lines: ["Atualizando progresso em tempo real."],
              runId,
              queue: {
                status: execution.data.status,
                step: "execute",
              },
              proof: startedProof,
              ctas: [
                {
                  id: "view-run",
                  label: "Ver execução",
                  kind: "neutral",
                  href: withRunContext(runId, executionPending.thread.id, executionPending.caseContext?.caseId ?? null),
                },
              ],
            },
          });
        }

        if (conversationId) {
          void apiCreateImobChatTelemetry({
            conversationId,
            event: "plan_to_execute_ms",
            value: Date.now() - executionPending.preparedAt,
            metadata: buildJourneyTelemetryMetadata(executionPending.caseContext, {
              runId,
              action: executionPending.plan.action,
              parentRunId: parentRunId ?? null,
              sessionRunId: sessionRunByThreadRef.current[executionPending.thread.id] ?? runId,
              threadId: executionPending.thread.id,
            }),
          });
          void apiCreateImobChatTelemetry({
            conversationId,
            event: "chat_to_run_link_coverage",
            value: runId ? 1 : 0,
            metadata: buildJourneyTelemetryMetadata(executionPending.caseContext, {
              runId,
              hasCta: true,
              parentRunId: parentRunId ?? null,
              threadId: executionPending.thread.id,
            }),
          });
        }
      } catch (error) {
        const message =
          error instanceof ApiError
            ? `${error.message} (${error.status})`
            : error instanceof Error
              ? error.message
              : "Falha na execução";
        setState("blocked");
        setActiveThread(executionPending.thread);
        const execBlockedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Esta etapa não foi concluída desta vez.",
          thread: {
            id: executionPending.thread.id,
            label: executionPending.thread.label,
            status: "blocked",
          },
          card: {
            type: "risk",
            title: "Precisa de atenção",
            thread: {
              id: executionPending.thread.id,
              label: executionPending.thread.label,
              status: "blocked",
            },
            lines: ["Posso tentar novamente ou seguir por outro caminho."],
            risk: {
              level: "high",
              reason: message,
            },
          },
        };
        updateMessageById(executionPending.messageId, {
          text: execBlockedMessage.text,
          thread: execBlockedMessage.thread,
          card: execBlockedMessage.card,
        });
        void persistMessage(execBlockedMessage);
      }
    },
    [contractInterviewState, conversationId, persistInterviewState, persistMessage, trackUxEvent, updateMessageById]
  );

  const handleConfirmExecution = async (message: ChatMessage) => {
    if (!pendingExecution) return;
    if (pendingExecution.source === "command-center" && directedConfirmingRef.current) return;
    const messageThreadId = message.thread?.id ?? message.card?.thread?.id ?? null;
    if (!messageThreadId) return;
    if (pendingExecution.messageId !== message.id || pendingExecution.thread.id !== messageThreadId) return;
    if (pendingExecution.source === "command-center") {
      directedConfirmingRef.current = true;
    }
    await runExecutionFlow(pendingExecution, { trackConfirm: true });
  };

  const handleRejectExecution = (message: ChatMessage) => {
    if (!pendingExecution) return;
    const messageThreadId = message.thread?.id ?? message.card?.thread?.id ?? null;
    if (!messageThreadId) return;
    if (pendingExecution.messageId !== message.id || pendingExecution.thread.id !== messageThreadId) return;
    const rejectKey = `${conversationId ?? "none"}:${pendingExecution.thread.id}:${pendingExecution.plan.action}:awaiting_user_action`;
    if (rejectedExecutionKeysRef.current.has(rejectKey)) return;
    rejectedExecutionKeysRef.current.add(rejectKey);

    const currentThread = pendingExecution.thread ?? activeThread;
    const targetMessageId = pendingExecution.messageId;
    setRejectLockedMessageId(targetMessageId);
    setOpenOptionsMessageId(null);
    setPendingExecution(null);
    setActiveThread(null);
    setState("idle");
    trackUxEvent("execution_rejected", {
      threadId: currentThread?.id ?? null,
      messageId: targetMessageId,
      action: pendingExecution.plan.action,
    });
    const rejectedMessage: ChatMessage = {
      id: makeId("assistant"),
      role: "assistant",
      text: "Execução cancelada. Envie uma nova instrução para montar outro plano.",
      thread: currentThread
        ? {
            id: currentThread.id,
            label: currentThread.label,
            status: "blocked",
          }
        : undefined,
    };
    if (targetMessageId) {
      updateMessageById(targetMessageId, {
        text: rejectedMessage.text,
        thread: rejectedMessage.thread,
        card: rejectedMessage.card,
      });
    } else {
      appendMessage(rejectedMessage);
    }
    void persistMessage(rejectedMessage);
  };

  const exportGeneratedContractPdf = React.useCallback(
    async (message: ChatMessage) => {
      const payload = message.card?.contract;
      if (!payload?.text) return;
      try {
        const { jsPDF } = await import("jspdf");
        const doc = new jsPDF({ unit: "pt", format: "a4" });
        const margin = 36;
        const lineH = 16;
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const maxW = pageW - margin * 2;
        let y = margin;

        const push = (text: string, size = 10, bold = false) => {
          doc.setFont("helvetica", bold ? "bold" : "normal");
          doc.setFontSize(size);
          const lines = doc.splitTextToSize(text, maxW) as string[];
          for (const line of lines) {
            if (y > pageH - margin) {
              doc.addPage();
              y = margin;
            }
            doc.text(line, margin, y);
            y += lineH;
          }
        };

        push(payload.title ?? `Contrato IMOB - ${payload.contractType ?? "N/A"}`, 14, true);
        push(`Tipo: ${payload.contractType ?? "N/A"}`);
        push(`Schema: ${payload.schemaVersion ?? "N/A"}`);
        push(`Base legal: ${payload.legalVersion ?? "N/A"}`);
        push(`Gerado em: ${payload.generatedAt ? new Date(payload.generatedAt).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR")}`);
        if (payload.hash) push(`Hash: ${payload.hash}`);
        y += 8;
        push(payload.text, 11, false);

        doc.save(buildContractPdfFileName(payload.contractType));
        trackUxEvent("contract_pdf_exported", {
          contractType: payload.contractType ?? null,
          schemaVersion: payload.schemaVersion ?? null,
        });
      } catch {
        const failedMessage: ChatMessage = {
          id: makeId("assistant"),
          role: "assistant",
          text: "Nao consegui exportar o PDF agora. Tente novamente em instantes.",
          thread: message.thread ?? message.card?.thread,
        };
        appendMessage(failedMessage);
        void persistMessage(failedMessage, {
          conversationId: conversationId ?? undefined,
          intent: "contract",
          action: "realestate.create_contract",
        });
      }
    },
    [appendMessage, conversationId, persistMessage, trackUxEvent]
  );

  const filteredConversations = conversations.filter((conversation) => {
    const search = conversationSearch.trim().toLowerCase();
    if (!search) return true;
    return (
      conversation.title.toLowerCase().includes(search) ||
      (conversation.lastMessagePreview ?? "").toLowerCase().includes(search)
    );
  });
  const visibleMessages = selectedThreadId
    ? messages.filter((message) => {
        const threadId = message.thread?.id ?? message.card?.thread?.id ?? null;
        return threadId === selectedThreadId;
      })
    : messages;
  const compactVisibleLimit = 34;
  const hiddenMessageCount = compactTimelineMode ? Math.max(0, visibleMessages.length - compactVisibleLimit) : 0;
  const renderedMessages = compactTimelineMode ? visibleMessages.slice(-compactVisibleLimit) : visibleMessages;
  const lastVisibleMessage = visibleMessages.length > 0 ? visibleMessages[visibleMessages.length - 1] : null;
  const activeThreadCount = threads.filter((item) => item.status === "active").length;
  const shouldShowThreadPanel = showThreadPanel || activeThreadCount > 1 || Boolean(selectedThreadId);
  const workbenchIntakeContext = React.useMemo(
    () =>
      extractImobWorkbenchIntakeContext({
        messages,
        preferredThreadId: selectedThreadId ?? activeThread?.id ?? null,
      }),
    [activeThread?.id, messages, selectedThreadId],
  );
  const workbenchContextState: "loading" | "empty" | "error" | "ready" =
    historyLoading && messages.length === 0
      ? "loading"
      : workbenchIntakeContext
        ? "ready"
        : "empty";
  const workbenchCommandCenterHref = React.useMemo(() => {
    if (!workbenchIntakeContext) return null;
    if (!workbenchIntakeContext.caseId && !workbenchIntakeContext.threadId && !workbenchIntakeContext.runId) return null;
    const params = new URLSearchParams();
    if (conversationId) params.set("conversationId", conversationId);
    if (workbenchIntakeContext.threadId) params.set("threadId", workbenchIntakeContext.threadId);
    if (workbenchIntakeContext.caseId) params.set("caseId", workbenchIntakeContext.caseId);
    const query = params.toString();
    return query ? `/app/imob/dashboard?${query}` : "/app/imob/dashboard";
  }, [conversationId, workbenchIntakeContext]);
  const workbenchFunnelHref = React.useMemo(() => {
    if (!workbenchIntakeContext?.caseId) return null;
    if (!workbenchIntakeContext.status && !workbenchIntakeContext.stage) return null;
    const params = new URLSearchParams();
    params.set("tab", "funil");
    if (conversationId) params.set("conversationId", conversationId);
    if (workbenchIntakeContext.threadId) params.set("threadId", workbenchIntakeContext.threadId);
    params.set("caseId", workbenchIntakeContext.caseId);
    return `/app/imob/dashboard?${params.toString()}`;
  }, [conversationId, workbenchIntakeContext]);
  const workbenchRunArchiveHref = React.useMemo(() => {
    if (!workbenchIntakeContext?.runId) return null;
    const params = new URLSearchParams();
    params.set("domain", "imob");
    params.set("runId", workbenchIntakeContext.runId);
    if (conversationId) params.set("conversationId", conversationId);
    if (workbenchIntakeContext.threadId) params.set("threadId", workbenchIntakeContext.threadId);
    if (workbenchIntakeContext.caseId) params.set("caseId", workbenchIntakeContext.caseId);
    return `/app/runs?${params.toString()}`;
  }, [conversationId, workbenchIntakeContext]);
  React.useEffect(() => {
    if (!workbenchIntakeContext) return;
    setShowWorkbenchContextPanel(true);
  }, [workbenchIntakeContext?.draftId, workbenchIntakeContext?.kind, workbenchIntakeContext?.runId]);
  const contractDraftLines = React.useMemo(() => {
    if (!contractInterviewState?.contractType) return [];
    const schema = CONTRACT_SCHEMAS[contractInterviewState.contractType];
    const lines = schema.fields
      .filter((step) => contractInterviewState.answers[step.id] !== undefined && contractInterviewState.answers[step.id] !== null)
      .map((step) => `${step.question.replace(/\?$/, "")}: ${String(contractInterviewState.answers[step.id])}`);
    return lines;
  }, [contractInterviewState]);
  const chatLaneClassName = "mx-auto w-full xl:max-w-[82%]";
  const VERTICAL_SELECTOR_ITEMS: VerticalSelectorItem[] = [
    { id: "imob",  label: "IMOB",  state: "active",  color: "#5DCAA5" },
    { id: "legal", label: "LEGAL", state: "preview", color: "#7F77DD", tooltip: "Em breve" },
  ];
  return (
    <>
      <ImobWorkbenchShell
      onBackClick={handleNavigateBack}
      sidebar={
        <div className="flex h-full min-h-[70vh] min-w-0 flex-col overflow-hidden bg-[linear-gradient(180deg,#0a1320_0%,#101b2a_100%)] px-3 py-3 lg:min-h-0">
            <div className="shrink-0 rounded-[28px] border border-cyan-500/18 bg-[linear-gradient(180deg,rgba(15,27,42,0.96)_0%,rgba(10,18,28,0.9)_100%)] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_26px_rgba(0,0,0,0.24)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-medium uppercase tracking-[0.28em] text-cyan-200/80">IMOB Workspace</p>
                  <p className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-white">Conversas do intake</p>
                  <p className="mt-1 text-[11px] leading-5 text-slate-400">Acompanhe conversas e operações sem competir com o chat central.</p>
                </div>
                <span className="rounded-full border border-cyan-300/25 bg-cyan-400/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-cyan-100">
                  IMOB
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-[18px] border border-white/8 bg-white/5 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Conversas</p>
                  <p className="mt-2 text-[15px] font-semibold text-white">{filteredConversations.length}</p>
                </div>
                <div className="rounded-[18px] border border-white/8 bg-white/5 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                  <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Threads ativas</p>
                  <p className="mt-2 text-[15px] font-semibold text-white">{activeThreadCount}</p>
                </div>
              </div>
            </div>

            <div className="mt-3 shrink-0 rounded-[24px] border border-white/8 bg-white/[0.03] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void handleNewConversation()}
                  className="rounded-full border border-white/20 bg-white/10 px-3.5 py-2 text-[10px] font-semibold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition hover:border-cyan-400/30 hover:bg-white/16"
                >
                  + Nova conversa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const next = !shouldShowThreadPanel;
                    setShowThreadPanel(next);
                    trackUxEvent(next ? "thread_panel_opened" : "thread_panel_hidden", { activeThreads: activeThreadCount });
                  }}
                  className="rounded-full border border-white/10 bg-slate-950/30 px-3 py-2 text-[10px] tracking-[0.14em] text-slate-300 transition hover:border-white/20 hover:bg-white/8 hover:text-white"
                >
                  {shouldShowThreadPanel ? "Ocultar operações" : "Ver operações"}
                </button>
              </div>

              <div className="mt-3 rounded-[18px] border border-white/8 bg-slate-950/20 px-3 py-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Busca rápida</p>
              <input
                value={conversationSearch}
                onChange={(event) => setConversationSearch(event.target.value)}
                  placeholder="Buscar conversa..."
                  className="mt-2 w-full rounded-[14px] border border-white/8 bg-white/6 px-3 py-2 text-[11px] text-white placeholder:text-slate-500 focus:border-cyan-400/30 focus:bg-white/10 focus:outline-none"
              />
              </div>

              {conversationId && shouldShowThreadPanel ? (
                <div className="mt-3 rounded-[18px] border border-white/8 bg-slate-950/18 p-2">
                  <div className="mb-2 flex items-center justify-between px-1">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Operações da conversa</p>
                    <span className="text-[10px] text-slate-400">{activeThreadCount} ativas</span>
                  </div>
                  <div className="max-h-56 overflow-y-auto pr-1">
                  <ThreadPanel
                    threads={threads}
                    selectedThreadId={selectedThreadId}
                    groupByJourneyActiveOnly
                    onSelectThread={(thread) => {
                      if (pendingExecution && pendingExecution.thread.id !== thread.threadId) {
                        clearPendingExecution("thread_switched", { nextThreadId: thread.threadId });
                      }
                      setSelectedThreadId(thread.threadId);
                      setActiveThread({ id: thread.threadId, label: thread.label });
                      trackUxEvent("thread_selected", { threadId: thread.threadId, source: "shared_panel" });
                    }}
                    onClearSelection={() => {
                      if (pendingExecution) {
                        clearPendingExecution("thread_filter_cleared");
                      }
                      setSelectedThreadId(null);
                      setActiveThread(null);
                      trackUxEvent("thread_filter_cleared");
                    }}
                    resolveDashboardHref={(href, thread) => withDashboardContext(href, thread.threadId)}
                    resolveRunHref={(thread) => {
                      const runId = sessionRunByThreadRef.current[thread.threadId] ?? null;
                      return runId ? withRunContext(runId, thread.threadId, null) : null;
                    }}
                    resolveReconciliationHref={(thread) => {
                      const runId = sessionRunByThreadRef.current[thread.threadId] ?? null;
                      return runId ? `/app/billing?runId=${encodeURIComponent(runId)}` : null;
                    }}
                  />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden">
              <div className="mb-2 flex items-center justify-between px-1">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Conversas recentes</p>
                <span className="text-[10px] text-slate-500">{filteredConversations.length} itens</span>
              </div>
              <div className="flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
              {filteredConversations.length === 0 ? (
                <div className="rounded-[22px] border border-dashed border-white/10 bg-white/[0.03] px-3 py-4">
                  <p className="text-[11px] font-medium text-white">Nenhuma conversa registrada.</p>
                  <p className="mt-1 text-[10px] leading-5 text-slate-400">Use “Nova conversa” para iniciar um fluxo IMOB neste workspace.</p>
                </div>
              ) : (
                filteredConversations.map((conversation) => {
                  const selected = conversation.conversationId === conversationId;
                  return (
                    <button
                      key={conversation.conversationId}
                      type="button"
                      onClick={() => void loadConversation(conversation.conversationId)}
                      className={`w-full rounded-[18px] border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                        selected
                          ? "border-cyan-300/24 bg-cyan-400/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_10px_24px_rgba(8,145,178,0.08)]"
                          : "border-white/6 bg-white/[0.02] text-slate-300 hover:border-white/12 hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-[11px] font-medium">{conversation.title}</p>
                        {selected ? (
                          <span className="rounded-full border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-cyan-100">
                            Ativa
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1.5 truncate text-[10px] leading-5 opacity-80">
                        {conversation.lastMessagePreview ?? "Sem mensagens ainda"}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
            </div>
        </div>
      }
      main={
        <article className="relative flex min-h-[70vh] flex-col bg-[linear-gradient(180deg,#f8fafc_0%,#eef4fb_100%)] lg:min-h-0">
            <header className="border-b border-slate-200/80 bg-white/70 px-4 py-3 backdrop-blur sm:px-6">
              <div className={`${chatLaneClassName} flex items-center justify-between gap-3`}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Workspace atual
                    </p>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-700 shadow-sm">
                      Chat ativo
                    </span>
                  </div>
                  <p className="mt-1 text-[13px] font-medium text-slate-900">{workspaceLabel}</p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    Conversa, intake e quick actions preservados no fluxo atual.
                  </p>
                  <div className="mt-2">
                    <VerticalSelectorBar
                      verticals={VERTICAL_SELECTOR_ITEMS}
                      activeVerticalId={activeVerticalId}
                      onSelect={setActiveVerticalId}
                    />
                  </div>
                </div>
              </div>
            </header>
            {imobAccessGate ? (
              <div className="border-b border-slate-200 bg-white/80 px-4 py-4 sm:px-6">
                <div className={chatLaneClassName}>
                  <ImobAccessGateCard gate={imobAccessGate} />
                </div>
              </div>
            ) : null}
            {contractInterviewState?.contractType &&
            contractDraftLines.length > 0 &&
            (contractInterviewState.status === "review" ||
              contractInterviewState.status === "generating" ||
              contractInterviewState.status === "generated") ? (
              <div className="border-b border-slate-200 bg-white/80 px-4 py-3 sm:px-6">
                <div className={chatLaneClassName}>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-slate-700">
                    Rascunho de contrato • {getContractTypeLabel(contractInterviewState.contractType)}
                  </p>
                  <div className="mt-1 max-h-16 space-y-0.5 overflow-y-auto pr-1 text-[11px] text-slate-500">
                    {contractDraftLines.slice(-8).map((line, idx) => (
                      <p key={`draft-${idx}`} className="truncate">{line}</p>
                    ))}
                  </div>
                  {contractInterviewState.status === "review" ? (
                    <div className="mt-2 flex flex-col gap-2 border-t border-slate-200 pt-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <select
                          value={draftEditFieldId}
                          onChange={(event) => setDraftEditFieldId(event.target.value)}
                          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-900 focus:border-accent/40 focus:outline-none"
                        >
                          {contractEditableFields.map((field) => (
                            <option key={`draft-field-${field.id}`} value={field.id}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => void handleDraftEditFromPanel()}
                          disabled={reviewActionLoading !== null || !draftEditFieldId}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-800 transition hover:border-accent/40 disabled:opacity-50"
                        >
                          Editar
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleDraftDeclineFromPanel()}
                          disabled={reviewActionLoading !== null}
                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-slate-800 transition hover:border-rose-300/40 disabled:opacity-50"
                        >
                          Nao gerar
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDraftConfirmFromPanel()}
                          disabled={reviewActionLoading !== null}
                          className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-cyan-900 transition hover:bg-cyan-100 disabled:opacity-50"
                        >
                          Confirmar e gerar
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div
              ref={listRef}
              onScroll={(event) => {
                const container = event.currentTarget;
                const distanceToBottom = container.scrollHeight - (container.scrollTop + container.clientHeight);
                const nearBottom = distanceToBottom < 56;
                setIsNearBottom(nearBottom);
                if (nearBottom) setShowJumpToLatest(false);
              }}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5"
            >
              <div className={chatLaneClassName}>
              {hiddenMessageCount > 0 ? (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                  <p className="text-[11px] text-slate-600">
                    Mostrando {compactVisibleLimit} de {visibleMessages.length} mensagens.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCompactTimelineMode(false)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-800 hover:border-accent/40"
                  >
                    Ver histórico completo
                  </button>
                </div>
              ) : null}
              {!compactTimelineMode && visibleMessages.length > compactVisibleLimit ? (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setCompactTimelineMode(true)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[10px] uppercase tracking-[0.15em] text-slate-800 hover:border-accent/40"
                  >
                    Voltar ao modo compacto
                  </button>
                </div>
              ) : null}
              {historyLoading ? (
                <p className="text-sm text-slate-600">Carregando histórico da conversa...</p>
              ) : visibleMessages.length === 0 ? (
                selectedThreadId ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <p className="text-sm text-slate-900">Sem mensagens nesta thread.</p>
                    <p className="mt-1 text-[10px] text-slate-600">
                      Selecione outra thread ou remova o filtro para ver toda a conversa.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,0.05)]">
                    <p className="text-sm text-slate-600">Nova conversa pronta.</p>
                  </div>
                )
              ) : null}
              {!historyLoading && hasMoreHistory && !selectedThreadId ? (
                <div className="flex justify-center">
                  <button
                    type="button"
                    onClick={() => void handleLoadOlder()}
                    disabled={historyLoadingMore}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-slate-800 transition hover:border-accent/40 disabled:opacity-50"
                  >
                    {historyLoadingMore ? "Carregando..." : "Carregar anteriores"}
                  </button>
                </div>
              ) : null}

              {renderedMessages.map((message, index) => {
                const isUser = message.role === "user";
                const isLastMessage = index === renderedMessages.length - 1;
                const messageThread = message.thread ?? message.card?.thread;
                const prevMessageThread = index > 0 ? renderedMessages[index - 1]?.thread ?? renderedMessages[index - 1]?.card?.thread : null;
                const showThreadPill = Boolean(messageThread?.id && messageThread.id !== prevMessageThread?.id);
                const threadTone =
                  messageThread?.status === "blocked"
                    ? "border-rose-300/40 bg-rose-500/10 text-rose-200"
                    : messageThread?.status === "done"
                      ? "border-emerald-300/40 bg-emerald-500/10 text-emerald-200"
                      : "border-accent/40 bg-accent/10 text-foreground";
                const inlineChoicePresentation = isInlineChoicePresentation(message);
                const runFinance = message.card?.runId ? runFinanceByRunId[message.card.runId] : null;
                const shouldAnimateAssistantText = !isUser && typewriterMessageIds[message.id] === true;
                const shouldDelayForm = !isUser && Boolean(message.form) && typewriterMessageIds[message.id] === true;
                const showMessageCard =
                  Boolean(message.card) &&
                  message.card?.type !== "queue" &&
                  !(message.card?.type === "action" && message.card.compactConfirm) &&
                  message.card?.title !== "Lote processado" &&
                  message.card?.title !== "Imóvel já cadastrado" &&
                  !inlineChoicePresentation;
                const messageCard = showMessageCard ? message.card ?? null : null;
                const visibleProof = resolveVisibleMessageProof({
                  proof: message.proof,
                  presentationMetadata: message.presentationMetadata,
                  card:
                    messageCard || message.card
                      ? { proof: normalizeMessageCardProof((messageCard ?? message.card ?? null)?.proof) }
                      : null,
                }) ?? null;
                const showBubble =
                  isUser
                  || Boolean(message.text.trim())
                  || Boolean(message.blocks?.length)
                  || Boolean(message.widget)
                  || showMessageCard
                  || Boolean(message.form)
                  || Boolean(SHOW_TECHNICAL_CHAT && visibleProof);
                return (
                  <div key={message.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[94%] space-y-1.5 sm:max-w-[82%] ${isUser ? "items-end" : "items-start"}`}>
                      {showThreadPill ? (
                        <div className={`inline-flex rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.16em] ${threadTone}`}>
                          {messageThread?.label}
                        </div>
                      ) : null}
                      {showBubble ? (
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm ${
                            isUser
                              ? "border border-cyan-200 bg-cyan-50 text-slate-950 shadow-[0_10px_24px_rgba(34,211,238,0.10)]"
                              : "border border-slate-200 bg-white text-slate-900 shadow-[0_14px_30px_rgba(15,23,42,0.06)]"
                          } transition`}
                        >
                          {message.text.trim().length > 0 ? (
                            <TypewriterText
                              text={message.text}
                              animate={shouldAnimateAssistantText}
                              onComplete={() =>
                                setTypewriterMessageIds((prev) => {
                                  if (!prev[message.id]) return prev;
                                  const next = { ...prev };
                                  delete next[message.id];
                                  return next;
                                })
                              }
                            />
                          ) : null}

                          {message.consultBadge ? (
                            <span className="mt-1.5 inline-block rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[10px] font-medium text-accent/80">
                              {message.consultBadge}
                            </span>
                          ) : null}

                          {message.dispatchBadge ? (
                            <span className="mt-1.5 inline-block rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300/80">
                              {message.dispatchBadge}
                            </span>
                          ) : null}

                          {message.blocks?.length ? (
                            <div className="mt-3 space-y-2">
                              {message.blocks
                                .filter((block) => block.kind !== "confirmation")
                                .map((block, blockIndex) => (
                                  <div key={`${message.id}-block-${block.kind}-${blockIndex}`} className="space-y-1.5">
                                    {block.title && block.title.trim().toLowerCase() !== message.text.trim().toLowerCase() ? (
                                      <p className="text-[11px] font-medium text-foreground/95">{block.title}</p>
                                    ) : null}
                                    {block.text && block.text.trim().toLowerCase() !== message.text.trim().toLowerCase() ? (
                                      <p className="text-[10px] text-muted-foreground">{block.text}</p>
                                    ) : null}
                                    {block.kind === "agent_timeline" && block.agentActivities?.length ? (
                                      (() => {
                                        const shouldDelayBlockContent = typewriterMessageIds[message.id] === true;
                                        if (shouldDelayBlockContent) return null;
                                        return (
                                          <div className="rounded-2xl border border-white/10 bg-black/20 p-2.5">
                                            <div className="space-y-2">
                                              {block.agentActivities.map((activity, activityIndex) => (
                                                <div
                                                  key={`${message.id}-agent-activity-${blockIndex}-${activityIndex}-${activity.agentId}`}
                                                  className="rounded-xl bg-white/[0.03] px-2.5 py-2"
                                                >
                                                  <p className="text-[11px] font-medium text-foreground/95">
                                                    {(activity.displayPrefix ?? "Agente").trim()} {activity.agentLabel.trim()}
                                                  </p>
                                                  <p className="mt-1 text-[10px] text-muted-foreground">
                                                    {activity.visibleMessage.trim()}
                                                  </p>
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        );
                                      })()
                                    ) : null}
                                    {block.lines?.length ? (
                                      (() => {
                                        const shouldDelayBlockContent = typewriterMessageIds[message.id] === true;
                                        if (shouldDelayBlockContent) return null;
                                        return (
                                          <ul className="space-y-1 text-[10px] text-muted-foreground">
                                            <SequentialBlockLines
                                              items={block.lines}
                                              animateSequence={sequentialChoiceMessageIds[message.id] === true}
                                              renderItem={(line, lineIndex, visibleLine, isTyping) => (
                                                <li key={`${message.id}-block-line-${blockIndex}-${lineIndex}`}>
                                                  {visibleLine}
                                                  {isTyping ? <span className="ml-0.5 inline-block h-[1em] w-[1px] animate-pulse bg-current align-[-0.15em]" /> : null}
                                                </li>
                                              )}
                                            />
                                          </ul>
                                        );
                                      })()
                                    ) : null}
                                    {block.kind === "next_actions" && block.ctas?.length ? (
                                      <div className="rounded-xl bg-black/20 p-2">
                                        {(() => {
                                          const items = normalizeCardCtas(block.ctas) ?? [];
                                          if (items.length === 0) return null;
                                          const shouldDelayBlockChoices = typewriterMessageIds[message.id] === true;
                                          if (shouldDelayBlockChoices) return null;
                                          return (
                                            <SequentialInlineChoices
                                              items={items}
                                              animateSequence={sequentialChoiceMessageIds[message.id] === true}
                                              onComplete={() =>
                                                setSequentialChoiceMessageIds((prev) => {
                                                  if (!prev[message.id]) return prev;
                                                  const next = { ...prev };
                                                  delete next[message.id];
                                                  return next;
                                                })
                                              }
                                              renderItem={(cta, _index, visibleLabel, isTyping) => (
                                                <button
                                                  key={`${message.id}-block-next-cta-${cta.id}`}
                                                  type="button"
                                                  onClick={() => void sendMessageText(cta.nextMessage ?? cta.label, { displayText: cta.label })}
                                                  className="block text-left text-[11px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                                >
                                                  {visibleLabel}
                                                  {isTyping ? <span className="ml-0.5 inline-block h-[1em] w-[1px] animate-pulse bg-current align-[-0.15em]" /> : null}
                                                </button>
                                              )}
                                            />
                                          );
                                        })()}
                                      </div>
                                    ) : null}
                                    {block.kind === "details" && block.ctas?.length ? (
                                      (() => {
                                        const items = normalizeCardCtas(block.ctas) ?? [];
                                        if (items.length === 0) return null;
                                        const shouldDelayBlockChoices = typewriterMessageIds[message.id] === true;
                                        if (shouldDelayBlockChoices) return null;
                                        return (
                                          <div className="flex flex-wrap items-center gap-2">
                                            <SequentialInlineChoices
                                              items={items}
                                              animateSequence={sequentialChoiceMessageIds[message.id] === true}
                                              renderItem={(cta, _index, visibleLabel, isTyping) => (
                                                <button
                                                  key={`${message.id}-block-cta-${cta.id}`}
                                                  type="button"
                                                  onClick={() => void sendMessageText(cta.nextMessage ?? cta.label, { displayText: cta.label })}
                                                  className="text-[10px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                                >
                                                  {visibleLabel}
                                                  {isTyping ? <span className="ml-0.5 inline-block h-[1em] w-[1px] animate-pulse bg-current align-[-0.15em]" /> : null}
                                                </button>
                                              )}
                                            />
                                          </div>
                                        );
                                      })()
                                    ) : null}
                                  </div>
                                ))}
                            </div>
                          ) : null}

                          {message.widget ? (
                            <ImobChatWidgets
                              widget={message.widget}
                              onAction={(action) => handleWidgetAction(action, message.caseContext)}
                            />
                          ) : null}

                          {messageCard ? (
                            <div className="mt-3 rounded-xl border border-white/10 bg-surface/50 p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">{messageCard.title}</p>
                              {messageCard.type !== "action" ? (
                                <span className="rounded-full bg-black/25 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                                  {getCardTypeChip(messageCard.type)}
                                </span>
                              ) : null}
                            </div>

                            <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                              {messageCard.lines
                                .filter((line, idx) => {
                                  if (idx !== 0) return true;
                                  return !isCardLeadRedundant(message.text, messageCard.title, line);
                                })
                                .map((line, idx) => (
                                <li key={`${message.id}-line-${idx}`}>{line}</li>
                                ))}
                            </ul>

                            {runFinance ? (
                              <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-2">
                                <p className="text-[10px] tracking-[0.18em] text-muted-foreground">Execução</p>
                                <div className="mt-2">
                                  <ContextualCostPanel
                                    compact
                                    run={
                                      messageCard.runId
                                        ? {
                                            runId: messageCard.runId,
                                            actualCostCents: runFinance.amountCents,
                                            estimatedCostCents: runFinance.estimatedAmountCents,
                                            tokens: runFinance.tokens,
                                            issueLabel: runFinance.issueLabel,
                                            hasGap: runFinance.hasGap,
                                            runHref: withRunContext(
                                              messageCard.runId,
                                              messageThread?.id ?? null,
                                              message.caseContext?.caseId ?? null
                                            ),
                                            billingHref: `/app/billing?runId=${encodeURIComponent(messageCard.runId)}`,
                                          }
                                        : null
                                    }
                                  />
                                </div>
                              </div>
                            ) : null}

                            {messageCard.knowledgeResults?.length ? (
                              <div className="mt-3 space-y-3">
                                {messageCard.knowledgeResults.map((item) => (
                                  <KnowledgeCard
                                    key={`${message.id}-${item.id}`}
                                    item={item}
                                    sourceActions={selectKnowledgeCardActions(
                                      mapKnowledgeActions(messageCard.ctas, messageThread?.id ?? null, withDashboardContext)
                                    )}
                                  />
                                ))}
                              </div>
                            ) : null}

                            {SHOW_TECHNICAL_CHAT && messageCard.risk ? (
                              <div className="mt-3 rounded-lg border border-white/10 bg-surface/40 p-2">
                                <p className="text-[10px] tracking-[0.18em] text-muted-foreground">Risco</p>
                                <p className="mt-1 text-[10px] text-foreground">
                                  Nível: <span className="uppercase">{messageCard.risk.level}</span>
                                  {typeof messageCard.risk.trustScore === "number"
                                    ? ` • Trust min ${messageCard.risk.trustScore}`
                                    : ""}
                                </p>
                                {messageCard.risk.reason ? (
                                  <p className="mt-1 text-[10px] text-muted-foreground">{messageCard.risk.reason}</p>
                                ) : null}
                              </div>
                            ) : null}

                            {SHOW_TECHNICAL_CHAT && messageCard.queue ? (
                              <div className="mt-3 rounded-lg border border-white/10 bg-surface/40 p-2">
                                <p className="text-[10px] tracking-[0.18em] text-muted-foreground">Fila</p>
                                <p className="mt-1 text-[10px] text-foreground">
                                  Status: {messageCard.queue.status ?? "—"} • Step: {messageCard.queue.step ?? "—"}
                                </p>
                              </div>
                            ) : null}

                            {SHOW_TECHNICAL_CHAT && visibleProof ? (
                              <div className="mt-3 rounded-lg border border-white/10 bg-surface/40 p-2">
                                <p className="text-[10px] tracking-[0.18em] text-muted-foreground">Bloco de prova</p>
                                <p className="mt-1 text-[10px] text-foreground">
                                  estado: {visibleProof.state ?? (visibleProof.ready ? "ready" : "pending")}
                                  {typeof visibleProof.required === "boolean"
                                    ? ` • ${visibleProof.required ? "obrigatória" : "não obrigatória"}`
                                    : ""}
                                </p>
                                <p className="mt-1 text-[10px] text-foreground">txId: {visibleProof.txId ?? "pendente"}</p>
                                <p className="mt-1 text-[10px] text-foreground">
                                  receipt: {visibleProof.receiptPath ?? "não disponível"}
                                </p>
                                <p className="mt-1 text-[10px] text-foreground">
                                  bundle: {visibleProof.bundlePath ?? "não disponível"}
                                </p>
                              </div>
                            ) : null}

                            {SHOW_TECHNICAL_CHAT &&
                            messageCard.runId &&
                            !messageCard.ctas?.some((cta) => cta.href?.includes("/app/runs")) ? (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <Link
                                  to={withRunContext(
                                    messageCard.runId,
                                    messageThread?.id ?? null,
                                    message.caseContext?.caseId ?? null
                                  )}
                                  className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-foreground hover:border-accent/40"
                                >
                                  Ver execução
                                </Link>
                              </div>
                            ) : null}
                            {messageCard.showConfirm &&
                            pendingExecution &&
                            pendingExecution.messageId === message.id &&
                            pendingExecution.thread.id === (message.thread?.id ?? messageCard.thread?.id) ? (
                              <p className="mt-3 text-[10px] tracking-[0.18em] text-muted-foreground">
                                Aguardando sua decisão para seguir.
                              </p>
                            ) : null}
                          </div>
                          ) : null}

                          {SHOW_TECHNICAL_CHAT && visibleProof && !messageCard ? (
                            <div className="mt-3 rounded-xl border border-white/10 bg-surface/50 p-3">
                              <p className="text-[10px] tracking-[0.18em] text-muted-foreground">Bloco de prova</p>
                              <p className="mt-1 text-[10px] text-foreground">
                                estado: {visibleProof.state ?? (visibleProof.ready ? "ready" : "pending")}
                                {typeof visibleProof.required === "boolean"
                                  ? ` • ${visibleProof.required ? "obrigatória" : "não obrigatória"}`
                                  : ""}
                              </p>
                              <p className="mt-1 text-[10px] text-foreground">txId: {visibleProof.txId ?? "pendente"}</p>
                              <p className="mt-1 text-[10px] text-foreground">
                                receipt: {visibleProof.receiptPath ?? "não disponível"}
                              </p>
                              <p className="mt-1 text-[10px] text-foreground">
                                bundle: {visibleProof.bundlePath ?? "não disponível"}
                              </p>
                            </div>
                          ) : null}

                          {!shouldDelayForm && message.form ? (() => {
                            const formValues = resolveFormValuesForMessage(message);
                            const formErrors = formErrorsByMessageId[message.id] ?? {};
                            const formLookupLoading = formLookupLoadingByMessageId[message.id] ?? {};
                            const formLabel = message.form.label?.trim() ?? "";
                            const formDescription = message.form.description?.trim() ?? "";
                            return (
                              <div className="mt-3 space-y-3 rounded-xl border border-white/10 bg-surface/50 p-3">
                                {formLabel || formDescription ? (
                                  <div className="space-y-1">
                                    {formLabel ? <p className="text-sm font-medium text-foreground">{formLabel}</p> : null}
                                    {formDescription ? (
                                      <p className="text-[11px] normal-case tracking-normal text-muted-foreground">{formDescription}</p>
                                    ) : null}
                                  </div>
                                ) : null}
                                <div className="space-y-3">
                                  {message.form.fields.map((field) => (
                                    <div key={`${message.id}-${field.name}`} className="space-y-1.5">
                                      <label className="text-[11px] normal-case tracking-normal text-foreground/90">{field.label}</label>
                                      <div className="flex gap-2">
                                        {field.type === "select" ? (
                                          <select
                                            value={formValues[field.name] ?? ""}
                                            onChange={(event) => updateFormFieldValue(message.id, field.name, event.target.value)}
                                            className="min-h-[36px] w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] normal-case tracking-normal text-foreground focus:outline-none"
                                          >
                                            <option value="">{field.placeholder ?? ""}</option>
                                            {Array.from(new Set((field.options ?? []).map((option) => option.group ?? "")))
                                              .map((group) => {
                                                const groupedOptions = (field.options ?? []).filter((option) => (option.group ?? "") === group);
                                                if (!group) {
                                                  return groupedOptions.map((option) => (
                                                    <option key={`${message.id}-${field.name}-${option.value}`} value={option.value}>
                                                      {option.label}
                                                    </option>
                                                  ));
                                                }
                                                return (
                                                  <optgroup key={`${message.id}-${field.name}-${group}`} label={group}>
                                                    {groupedOptions.map((option) => (
                                                      <option key={`${message.id}-${field.name}-${option.value}`} value={option.value}>
                                                        {option.label}
                                                      </option>
                                                    ))}
                                                  </optgroup>
                                                );
                                              })}
                                          </select>
                                        ) : (
                                          <input
                                            type={field.type}
                                            value={formValues[field.name] ?? ""}
                                            inputMode={field.inputMode}
                                            maxLength={field.maxLength}
                                            onChange={(event) => updateFormFieldValue(
                                              message.id,
                                              field.name,
                                              field.lookup?.kind === "cep" ? normalizeCepValue(event.target.value) : event.target.value,
                                            )}
                                            onBlur={() => {
                                              if (field.lookup?.kind !== "cep") return;
                                              void applyCepLookupToForm(message, field.name, formValues[field.name] ?? "");
                                            }}
                                            placeholder={field.placeholder}
                                            className="min-h-[36px] w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[12px] normal-case tracking-normal text-foreground placeholder:text-muted-foreground focus:outline-none"
                                          />
                                        )}
                                        {field.allowAttachment ? (
                                          <button
                                            type="button"
                                            onClick={() => setAttachmentMenuOpen(true)}
                                            className="shrink-0 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[11px] normal-case tracking-normal text-foreground hover:bg-black/30"
                                          >
                                            {field.attachmentLabel ?? "Anexar"}
                                          </button>
                                        ) : null}
                                      </div>
                                      {field.helperText ? (
                                        <p className="text-[10px] normal-case tracking-normal text-muted-foreground">{field.helperText}</p>
                                      ) : null}
                                      {formLookupLoading[field.name] ? (
                                        <p className="text-[10px] normal-case tracking-normal text-muted-foreground">Consultando CEP...</p>
                                      ) : null}
                                      {formErrors[field.name] ? (
                                        <p className="text-[10px] normal-case tracking-normal text-rose-200">{formErrors[field.name]}</p>
                                      ) : null}
                                    </div>
                                  ))}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(message.form.actions ?? []).map((action) => (
                                    <button
                                      key={`${message.id}-form-${action.id}`}
                                      type="button"
                                      onClick={() => void handlePresentationFormAction(message, action.id)}
                                      className={`rounded-full px-3 py-1.5 text-[11px] normal-case tracking-normal ${action.kind === "primary" ? "bg-accent/15 text-foreground" : "bg-black/25 text-muted-foreground hover:text-foreground"}`}
                                    >
                                      {action.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })() : null}
                        </div>
                      ) : null}

                      {(() => {
                        const messageThreadId = message.thread?.id ?? message.card?.thread?.id ?? null;
                        const isPendingTarget =
                          Boolean(pendingExecution) &&
                          pendingExecution?.messageId === message.id &&
                          pendingExecution?.thread.id === messageThreadId;
                        const slotFields = pendingExecution?.pendingFields ?? [];
                        if (!isPendingTarget || !isLastMessage || slotFields.length === 0) return null;
                        return (
                          <ImobSlotCollectionCard
                            pendingFields={slotFields}
                            flow={pendingExecution?.flow}
                            disabled={state === "executing" || state === "typing"}
                            onSubmit={(structuredText) => {
                              void sendMessageText(structuredText);
                            }}
                            onCancel={() => handleRejectExecution(message)}
                          />
                        );
                      })()}

                      <div className={`px-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground/80 ${inlineChoicePresentation ? "flex flex-col items-start gap-1.5" : `flex flex-wrap items-center gap-1.5 ${isUser ? "justify-end" : "justify-start"}`}`}>
                        {message.role === "assistant" &&
                        message.card?.ctas?.length &&
                        !message.card.knowledgeResults?.length &&
                        !message.blocks?.some((block) => block.kind === "next_actions" && (block.ctas?.length ?? 0) > 0) ? (
                          <>
                            {(() => {
                              const messageThreadId = message.thread?.id ?? message.card?.thread?.id ?? null;
                              const isPendingTarget =
                                Boolean(pendingExecution) &&
                                pendingExecution?.messageId === message.id &&
                                pendingExecution?.thread.id === messageThreadId;
                              const actionableCtas = normalizeCardCtas(message.card.ctas)?.filter((cta) => {
                                if (!SHOW_TECHNICAL_CHAT && isInternalOpsCta(cta)) return false;
                                if (!cta.action) return true;
                                if (cta.action === "export_contract_pdf") return true;
                                if (isAttachmentCrmSuggestionAction(cta.action)) return true;
                                if (isOpenAttachmentMenuAction(cta.action)) return true;
                                if (isSendSuggestedMessageAction(cta.action)) return true;
                                return isPendingTarget;
                              }) ?? [];
                              if (actionableCtas.length === 0) return null;
                              const primary = actionableCtas[0];
                              const secondary = actionableCtas.slice(1);
                              const isRejectLocked = rejectLockedMessageId === message.id;
                              const shouldDelayInlineChoices = inlineChoicePresentation && typewriterMessageIds[message.id] === true;
                              if (shouldDelayInlineChoices) return null;
                              const renderCta = (cta: CardCta, ctaLabelOverride?: string, isTypingChoice = false) => {
                                const ctaLabel = inlineChoicePresentation
                                  ? (ctaLabelOverride ?? cta.label)
                                  : cta.label.replace(/^Ver\s+/i, "").toLowerCase();
                                const renderedLabel = (
                                  <>
                                    {ctaLabel}
                                    {isTypingChoice ? <span className="ml-0.5 inline-block h-[1em] w-[1px] animate-pulse bg-current align-[-0.15em]" /> : null}
                                  </>
                                );
                                return cta.href ? (
                                  isExternalHref(cta.href) ? (
                                    <a
                                      key={`${message.id}-footer-cta-${cta.id}`}
                                      href={cta.href}
                                      target="_blank"
                                      rel="noreferrer"
                                      onClick={(event) => {
                                        setOpenOptionsMessageId(null);
                                        if (cta.href?.startsWith("/api/uploads/")) {
                                          event.preventDefault();
                                          void openUploadDocument(cta.href).catch((error) => {
                                            console.error("open upload failed", error);
                                          });
                                        }
                                      }}
                                      className="text-[10px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                    >
                                      {renderedLabel}
                                    </a>
                                  ) : (
                                    <Link
                                      key={`${message.id}-footer-cta-${cta.id}`}
                                      to={withDashboardContext(cta.href, messageThreadId)}
                                      onClick={() => setOpenOptionsMessageId(null)}
                                      className="text-[10px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                    >
                                      {renderedLabel}
                                    </Link>
                                  )
                                ) : (
                                  <button
                                    key={`${message.id}-footer-cta-${cta.id}`}
                                    type="button"
                                    onClick={() => {
                                      if (cta.action === "confirm_execution") {
                                        void handleConfirmExecution(message);
                                        return;
                                      }
                                      if (cta.action === "reject_execution") {
                                        handleRejectExecution(message);
                                        return;
                                      }
                                      if (cta.action === "export_contract_pdf") {
                                        void exportGeneratedContractPdf(message);
                                        return;
                                      }
                                      if (isAttachmentCrmSuggestionAction(cta.action)) {
                                        void handleAttachmentCrmSuggestionAction(message, cta);
                                        return;
                                      }
                                      if (isOpenAttachmentMenuAction(cta.action)) {
                                        setAttachmentMenuOpen(true);
                                        setOpenOptionsMessageId(null);
                                        return;
                                      }
                                      if (isSendSuggestedMessageAction(cta.action)) {
                                        trackUxEvent(
                                          "recommended_action_selected",
                                          buildJourneyTelemetryMetadata(message.caseContext, {
                                            recommendedActionId:
                                              typeof cta.payload?.recommendedActionId === "string"
                                                ? cta.payload.recommendedActionId
                                                : null,
                                            recommendedActionType:
                                              typeof cta.payload?.recommendedActionType === "string"
                                                ? cta.payload.recommendedActionType
                                                : null,
                                            action:
                                              typeof cta.payload?.recommendedActionId === "string"
                                                ? cta.payload.recommendedActionId
                                                : cta.label,
                                          }),
                                        );
                                        setOpenOptionsMessageId(null);
                                        void sendMessageText(cta.nextMessage ?? cta.label, { suppressUserEcho: true });
                                        return;
                                      }
                                      if (cta.action === "print_card") {
                                        setOpenOptionsMessageId(null);
                                        printMessageCard(message);
                                        return;
                                      }
                                      if (cta.action === "continue_inventory_search") {
                                        void sendMessageText(cta.nextMessage ?? cta.label, { suppressUserEcho: true });
                                      }
                                    }}
                                    disabled={(cta.action === "reject_execution" && isRejectLocked) || crmSuggestionLoadingId === message.id}
                                    className="text-[10px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                                  >
                                    {renderedLabel}
                                  </button>
                                );
                              };
                              return inlineChoicePresentation || message.card?.actionsLayout === "inline" || Boolean(message.form) ? (
                                inlineChoicePresentation ? (
                                  <SequentialInlineChoices
                                    items={actionableCtas}
                                    animateSequence={sequentialChoiceMessageIds[message.id] === true}
                                    onComplete={() =>
                                      setSequentialChoiceMessageIds((prev) => {
                                        if (!prev[message.id]) return prev;
                                        const next = { ...prev };
                                        delete next[message.id];
                                        return next;
                                      })
                                    }
                                    renderItem={(cta, _index, visibleLabel, isTyping) => renderCta(cta, visibleLabel, isTyping)}
                                  />
                                ) : (
                                  <>{actionableCtas.map((cta) => renderCta(cta))}</>
                                )
                              ) : (
                                <>
                                  {renderCta(primary)}
                                  {secondary.length > 0 ? (
                                    message.card?.showConfirm ? (
                                      <>{secondary.map((cta) => renderCta(cta))}</>
                                    ) : message.card?.knowledgeResults?.length ? (
                                      <>{secondary.map((cta) => renderCta(cta))}</>
                                    ) : (
                                      <details
                                        className="group relative"
                                        open={openOptionsMessageId === message.id}
                                        onToggle={(event) => {
                                          if (event.currentTarget.open) {
                                            setOpenOptionsMessageId(message.id);
                                          } else {
                                            setOpenOptionsMessageId((prev) => (prev === message.id ? null : prev));
                                          }
                                        }}
                                      >
                                        <summary className="cursor-pointer list-none text-[10px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                                          opções
                                        </summary>
                                        <div className="absolute left-0 top-6 z-20 min-w-[180px] rounded-xl border border-white/10 bg-surface/95 p-1.5 shadow-xl backdrop-blur">
                                          <div className="flex flex-col gap-1">{secondary.map((cta) => renderCta(cta))}</div>
                                        </div>
                                      </details>
                                    )
                                  ) : null}
                                </>
                              );
                            })()}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}

              {SHOW_CHAT_FEEDBACK && lastVisibleMessage ? (
                <div className="flex flex-wrap items-center gap-2 px-1 text-[10px] normal-case tracking-normal text-muted-foreground/80">
                  {state === "typing" || state === "executing" ? (
                    <span className="text-[10px] normal-case tracking-normal text-muted-foreground">pensando...</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (navigator?.clipboard?.writeText) {
                            void navigator.clipboard.writeText(lastVisibleMessage.text);
                          }
                        }}
                        aria-label="Copiar mensagem"
                        title="Copiar mensagem"
                        className="text-[10px] normal-case tracking-normal text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        copiar
                      </button>
                      {lastVisibleMessage.role === "assistant" ? (
                        <>
                          <span className="text-white/25">•</span>
                          <button
                            type="button"
                            onClick={() =>
                              setMessageFeedback((prev) => ({ ...prev, [lastVisibleMessage.id]: "up" }))
                            }
                            aria-label="Resposta útil"
                            title="Resposta útil"
                            className={`text-[10px] normal-case tracking-normal underline-offset-2 hover:underline ${
                              messageFeedback[lastVisibleMessage.id] === "up"
                                ? "text-emerald-200"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            útil
                          </button>
                          <span className="text-white/25">•</span>
                          <button
                            type="button"
                            onClick={() =>
                              setMessageFeedback((prev) => ({ ...prev, [lastVisibleMessage.id]: "down" }))
                            }
                            aria-label="Resposta não útil"
                            title="Resposta não útil"
                            className={`text-[10px] normal-case tracking-normal underline-offset-2 hover:underline ${
                              messageFeedback[lastVisibleMessage.id] === "down"
                                ? "text-rose-200"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            não útil
                          </button>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
              {state === "typing" ? (
                <div className="flex justify-start">
                  <div className="max-w-[94%] sm:max-w-[82%]">
                    <TypingIndicatorBubble />
                  </div>
                </div>
              ) : null}
              </div>
            </div>

            <div className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/96 px-4 py-3 backdrop-blur sm:px-6">
              <div className={chatLaneClassName}>
                <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
                  {QUICK_PROMPTS.slice(0, 4).map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      onClick={() => void sendMessageText(prompt.prompt, { displayText: prompt.label })}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[10px] tracking-[0.04em] text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                    >
                      {prompt.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 rounded-[20px] border border-slate-200 bg-white p-2 shadow-[0_12px_30px_rgba(15,23,42,0.07)]">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg"
                    multiple
                    className="hidden"
                    onChange={(event) => void handleDocumentUpload(event.target.files)}
                  />
                  <div ref={attachmentMenuRef} className="relative shrink-0">
                    <button
                      type="button"
                      onClick={() => setAttachmentMenuOpen((prev) => !prev)}
                      disabled={isGateBlocked || uploadingDocuments || state === "typing" || state === "executing"}
                      aria-label="Abrir menu de anexos"
                      title="Adicionar fotos e arquivos"
                      className="flex h-[28px] w-[28px] items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-[11px] leading-none text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {uploadingDocuments ? "…" : "+"}
                    </button>
                    {attachmentMenuOpen && !(isGateBlocked || uploadingDocuments || state === "typing" || state === "executing") ? (
                      <div className="absolute bottom-full left-0 z-30 mb-1 w-[180px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_20px_60px_rgba(15,23,42,0.18)] backdrop-blur">
                        <button
                          type="button"
                          onClick={() => {
                            setAttachmentMenuOpen(false);
                            fileInputRef.current?.click();
                          }}
                          className="flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-[10px] text-slate-800 transition hover:bg-slate-100"
                        >
                          <span className="text-[10px] leading-none">📎</span>
                          <span>Adicionar fotos e arquivos</span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void handleSend();
                      }
                    }}
                    placeholder={isGateBlocked ? "Acesso bloqueado para este workspace." : "Descreva uma operação imobiliária..."}
                    rows={1}
                    disabled={isGateBlocked}
                    className="max-h-40 min-h-[46px] w-full resize-y rounded-[14px] bg-transparent px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={isGateBlocked || uploadingDocuments || state === "typing" || state === "executing"}
                    className="h-[46px] shrink-0 rounded-[14px] bg-slate-900 px-4 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {uploadingDocuments || state === "typing" || state === "executing" ? "Enviando..." : "Enviar"}
                  </button>
                </div>
              </div>
            </div>
        </article>
      }
      contextPanel={
        <ReactiveContextPanel
          activeVerticalId={activeVerticalId}
          imobProps={{
            state: workbenchContextState,
            intakeContext: workbenchIntakeContext,
            commandCenterHref: workbenchCommandCenterHref,
            funnelHref: workbenchFunnelHref,
            runArchiveHref: workbenchRunArchiveHref,
          }}
        />
      }
      isContextPanelOpen={showWorkbenchContextPanel}
      onToggleContextPanel={() => setShowWorkbenchContextPanel((prev) => !prev)}
    />

      <ImobKnowledgeViewer
        open={!!selectedKnowledgeContext}
        item={selectedKnowledgeContext?.item ?? null}
        onClose={() => setSelectedKnowledgeContext(null)}
        sourceActions={selectedKnowledgeContext?.sourceActions ?? []}
        resolveHref={(href) => withDashboardContext(href, selectedKnowledgeContext?.threadId ?? null)}
      />

    </>
  );
};

export default ImobChatPage;
