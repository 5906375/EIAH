import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import introJs from "intro.js";
import "intro.js/minified/introjs.min.css";
import AgentSelect from "../../../components/agents/AgentSelect";
import CostBadge from "../../../components/billing/CostBadge";
import { ImobAccessGateCard } from "@/components/imob/ImobAccessGateCard";
import RunViewer from "../../../components/runs/RunViewer";
import { RUN_STATUS_STYLES } from "@/components/runs/statusStyles";
import {
  centsToBRL,
  extractDuration,
  formatClockTime,
  formatDuration,
  formatAgentLabel,
  formatRunId,
  formatTrace,
  getAgentInitials,
} from "@/components/runs/utils";
import {
  ApiError,
  apiCreateShadowExecutionPreview,
  apiGetBillingReconciliationSummary,
  apiGetImobFunnelHealth,
  apiPromoteShadowExecution,
  apiPostExperienceAudit,
  apiGetRun,
  apiGetRunCostBreakdown,
  apiGetTenantBillingSummary,
  apiListImobCases,
  apiListRuns,
  BillingReconciliationSummary,
  ImobCase,
  ImobFunnelHealth,
  Run,
  RunCostBreakdown,
  RunStatus,
  ShadowExecutionContract,
} from "../../../lib/api";
import { useAgentExecution } from "@/hooks/useAgentExecution";
import { useSession } from "@/state/sessionStore";
import { getDomainTerm } from "@/domain/semantics";
import { formatReconciliationIssue } from "@/lib/reconciliation";
import {
  extractImobContextFromRun,
  getStringValue as readImobString,
} from "@/lib/imobContext";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "https://api.eiah.local/api";
const TENANT_PLACEHOLDER = import.meta.env.VITE_TENANT_ID ?? "tenant-demo";
const WORKSPACE_PLACEHOLDER = import.meta.env.VITE_WORKSPACE_ID ?? "workspace-demo";
const DEFAULT_WORKSPACE_ID = WORKSPACE_PLACEHOLDER;
const ORPHAN_PENDING_HIDE_MS = 2 * 60 * 1000;

type LowCodeTemplate = {
  name: string;
  description: string;
  link: string;
};

type RunResource = {
  prompt: string;
  restSnippet: string;
  sdkSnippet: string;
  templates: LowCodeTemplate[];
  tools?: string[];
};

function formatMeterTypeLabel(value: string) {
  if (value === "llm_completion") return "LLM completion";
  if (value === "vision") return "Vision";
  if (value === "embedding") return "Embedding";
  return value || "—";
}

function imobCaseAgeHours(updatedAt: string) {
  const parsed = Date.parse(updatedAt);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, (Date.now() - parsed) / 36e5);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function buildImobCaseRiskLabel(item: ImobCase) {
  const blockers = asStringArray(item.blockers);
  if (blockers.length > 0) return blockers.slice(0, 2).join(", ");
  const pending = asStringArray(item.pendingItems);
  if (pending.length > 0) return pending.slice(0, 2).join(", ");
  return item.stage || "—";
}

function formatImobJourneyTypeLabel(value: string | null | undefined) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "property_capture") return "Captação";
  if (normalized === "lead_qualification") return "Qualificação";
  if (normalized === "proposal") return "Proposta";
  if (normalized === "visit_follow_up") return "Visita";
  if (normalized === "negotiation") return "Negociação";
  if (normalized === "documentation") return "Documentação";
  if (normalized === "contract") return "Contrato";
  if (normalized === "commission") return "Comissão";
  if (normalized === "temporada_rules") return "Regras de temporada";
  return "Operação";
}

function buildImobCasePriority(item: ImobCase) {
  const blocked = asStringArray(item.canonical?.blockedActions).length;
  const missing = asStringArray(item.canonical?.missingContext).length;
  const recommended = item.canonical?.recommendedActions?.length ?? 0;
  const ageHours = imobCaseAgeHours(item.updatedAt);
  const score = blocked * 5 + missing * 3 + Math.min(4, Math.floor(ageHours / 12)) + (recommended === 0 ? 2 : 0);
  const label = blocked > 0 ? "alta" : missing > 0 || ageHours >= 24 ? "média" : "normal";
  return { score, label };
}

function mapImobStatusFilterToCaseStatus(filter: string): string | undefined {
  if (filter === "all") return undefined;
  if (filter === "pending_data") return "pending_data";
  if (filter === "ready_for_review") return "ready_for_review";
  if (filter === "blocked") return "blocked";
  if (filter === "done") return "done";
  return "__none__";
}

function formatImobCaseStatusLabel(status: string) {
  if (status === "pending_data") return "pendente de dados";
  if (status === "ready_for_review") return "pronto para revisão";
  if (status === "blocked") return "bloqueado";
  if (status === "done") return "concluído";
  return status || "—";
}

function formatImobPendingLabel(value: string) {
  const normalized = value.trim();
  const lowered = normalized.toLowerCase();
  if (!normalized) return "pendência operacional";
  if (normalized === "budgetMax") return "faixa de orçamento";
  if (normalized === "ownerDocument") return "documento";
  if (normalized === "ownerName") return "nome completo";
  if (normalized === "ownerPhone") return "telefone";
  if (normalized === "ownerEmail") return "e-mail";
  if (lowered === "nome do proprietário") return "nome do proprietário";
  if (lowered === "telefone do proprietário") return "telefone do proprietário";
  if (lowered === "e-mail do proprietário") return "e-mail do proprietário";
  if (lowered === "documento do proprietário") return "documento do proprietário";
  if (normalized === "propertyType") return "tipo do imóvel";
  if (normalized === "goal") return "finalidade";
  if (normalized === "city") return "cidade";
  if (normalized === "address") return "endereço";
  if (normalized === "propertyId") return "imóvel de referência";
  if (normalized === "listingTitle") return "título do anúncio";
  if (normalized === "publicationGoal") return "finalidade do anúncio";
  if (normalized === "publicationChannels") return "canais de publicação";
  return normalized;
}

function trimImobSentencePunctuation(value: string) {
  return value.trim().replace(/[.。…]+$/g, "").trim();
}

function formatImobSentence(value: string) {
  const trimmed = trimImobSentencePunctuation(value);
  if (!trimmed) return "";
  const withUppercase = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return `${withUppercase}.`;
}

function isDescriptivePendingSentence(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.includes("dados do proprietário") ||
    normalized.includes("dados do proprietario") ||
    normalized.includes("ainda estão incompletos") ||
    normalized.includes("ainda estao incompletos")
  );
}

function formatImobFlowLabel(flow: string | null | undefined) {
  if (flow === "lead.qualify") return "Qualificação de lead";
  if (flow === "owner.create") return "Cadastro de proprietário";
  if (flow === "property.create") return "Cadastro de imóvel";
  if (flow === "listing.activate") return "Publicação de anúncio";
  if (flow === "proposal.create") return "Proposta";
  if (flow === "contract.prepare") return "Contrato";
  return "Atendimento operacional";
}

function formatImobStageLabel(stage: string | null | undefined) {
  if (stage === "collecting") return "coleta de dados";
  if (stage === "review") return "revisão";
  if (stage === "approval") return "aprovação";
  if (stage === "closing") return "fechamento";
  return "andamento operacional";
}

function buildImobResolutionSteps(values: string[]) {
  const unique = Array.from(new Set(values.map(formatImobPendingLabel)));
  if (!unique.length) return ["Revisar a ficha do caso e validar o próximo passo operacional."];
  return unique.map((item) => {
    if (isDescriptivePendingSentence(item)) {
      return formatImobSentence(item);
    }
    return `Preencher ou confirmar ${trimImobSentencePunctuation(item)}.`;
  });
}

function buildImobCurrentSituation(data: any) {
  const caseData = data?.case ?? data;
  const pending = asStringArray(caseData?.pendingItems);
  const blockers = asStringArray(caseData?.blockers);
  if (caseData?.status === "ready_for_review") {
    return "Este atendimento já está pronto para revisão operacional.";
  }
  if (caseData?.status === "blocked") {
    return blockers.length
      ? `Este atendimento está bloqueado por: ${blockers.map(formatImobPendingLabel).join(", ")}.`
      : "Este atendimento está bloqueado e precisa de intervenção antes de avançar.";
  }
  if (pending.length) {
    return `Este atendimento ainda não pode avançar porque faltam: ${pending.map(formatImobPendingLabel).join(", ")}.`;
  }
  return "Este atendimento segue em acompanhamento operacional.";
}

function buildImobReasonSummary(data: any) {
  const caseData = data?.case ?? data;
  const pending = asStringArray(caseData?.pendingItems);
  const blockers = asStringArray(caseData?.blockers);
  const source = blockers.length ? blockers : pending;
  if (!source.length) return "Não há bloqueio crítico registrado no momento.";
  const formatted = source.map(formatImobPendingLabel);
  if (formatted.length === 1 && isDescriptivePendingSentence(formatted[0])) {
    return formatImobSentence(formatted[0]);
  }
  return formatted.map((item) => trimImobSentencePunctuation(item)).join(" | ");
}

function buildImobClientApproachExamples(data: any) {
  const caseData = data?.case ?? data;
  const pending = asStringArray(caseData?.pendingItems).map(formatImobPendingLabel);
  const flow = caseData?.flow ?? "";
  if (flow === "lead.qualify" && pending.includes("faixa de orçamento")) {
    return [
      "Confirmar faixa de orçamento do lead.",
      "Validar cidade e objetivo de busca.",
    ];
  }
  if (flow === "owner.create" && pending.includes("documento")) {
    return [
      "Solicitar documento do proprietário.",
      "Orientar anexo do documento na conversa.",
    ];
  }
  if (flow === "property.create") {
    return [
      "Confirmar dados pendentes do imóvel.",
      "Validar endereço e finalidade da captação.",
    ];
  }
  if (flow === "listing.activate") {
    return [
      "Confirmar dados essenciais do anúncio.",
      "Validar canais antes da publicação.",
    ];
  }
  if (flow === "contract.prepare") {
    return [
      "Confirmar pendências do contrato.",
      "Validar dados para revisão e assinatura.",
    ];
  }
  if (pending.includes("telefone") || pending.includes("e-mail")) {
    return [
      "Confirmar telefone e e-mail de contato.",
      "Atualizar cadastro para seguir atendimento.",
    ];
  }
  return [
    "Confirmar dados pendentes do atendimento.",
    "Avançar para a próxima etapa operacional.",
  ];
}

function buildImobWhatToDoNow(data: any) {
  const caseData = data?.case ?? data;
  const flow = caseData?.flow ?? "";
  const pending = asStringArray(caseData?.pendingItems);
  const blockers = asStringArray(caseData?.blockers);
  const items = buildImobResolutionSteps(blockers.length ? blockers : pending);
  if (flow === "lead.qualify") {
    return [
      ...items,
      "Revisar qualificação do lead.",
      "Vincular imóvel compatível ao lead.",
    ];
  }
  if (flow === "owner.create") {
    return [
      ...items,
      "Revisar cadastro do proprietário.",
      "Vincular proprietário ao imóvel.",
    ];
  }
  if (flow === "property.create") {
    return [
      ...items,
      "Revisar cadastro do imóvel.",
      "Vincular imóvel à próxima etapa comercial.",
    ];
  }
  if (flow === "listing.activate") {
    return [...items, "Validar canais de publicação.", "Publicar anúncio."];
  }
  if (flow === "contract.prepare") {
    return [...items, "Gerar minuta contratual.", "Enviar para revisão ou assinatura."];
  }
  return items;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtmlList(items: string[]) {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

type ImobHtmlActionLink = {
  label: string;
  href: string | null;
};

type ImobRouteContext = {
  conversationId?: string | null;
  threadId?: string | null;
  caseId?: string | null;
  runId?: string | null;
};

function buildImobReturnToHref(context?: ImobRouteContext) {
  const params = new URLSearchParams();
  params.set("domain", "imob");
  if (context?.runId) params.set("runId", context.runId);
  if (context?.conversationId) params.set("conversationId", context.conversationId);
  if (context?.threadId) params.set("threadId", context.threadId);
  if (context?.caseId) params.set("caseId", context.caseId);
  return `/app/runs?${params.toString()}`;
}

function renderHtmlLinkList(items: ImobHtmlActionLink[]) {
  return items
    .map((item) => {
      if (!item.href) return `<li>${escapeHtml(item.label)}</li>`;
      return `<li><a href="${escapeHtml(item.href)}" target="_self" rel="noopener noreferrer">${escapeHtml(item.label)}</a></li>`;
    })
    .join("");
}

function buildImobFlowSummary(data: any) {
  const caseData = data?.case ?? data;
  const flow = caseData?.flow ?? "";
  if (flow === "lead.qualify") {
    return "Atendimento de qualificação comercial para entender o perfil do cliente e liberar a próxima etapa da busca.";
  }
  if (flow === "owner.create") {
    return "Atendimento de cadastro do proprietário para estruturar a captação e o vínculo com o imóvel.";
  }
  if (flow === "property.create") {
    return "Atendimento de cadastro do imóvel para deixar a ficha pronta para anúncio, visita ou proposta.";
  }
  if (flow === "listing.activate") {
    return "Atendimento de publicação para preparar o anúncio e ativar os canais de divulgação.";
  }
  if (flow === "contract.prepare") {
    return "Atendimento de contrato para preparar a minuta e seguir para revisão ou assinatura.";
  }
  return "Atendimento operacional em andamento na vertical imobiliária.";
}

function buildImobChatActionHref(base: {
  conversationId?: string | null;
  caseId?: string | null;
  threadId?: string | null;
  autoprompt?: string | null;
  returnTo?: string | null;
}) {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams();
  if (base.conversationId) params.set("conversationId", base.conversationId);
  if (base.caseId) params.set("caseId", base.caseId);
  if (base.threadId) params.set("threadId", base.threadId);
  if (base.autoprompt) params.set("autoprompt", base.autoprompt);
  if (base.returnTo) params.set("returnTo", base.returnTo);
  const query = params.toString();
  return `${window.location.origin}/app/imob/chat${query ? `?${query}` : ""}`;
}

function buildImobChatRoute(base: {
  conversationId?: string | null;
  caseId?: string | null;
  threadId?: string | null;
  autoprompt?: string | null;
  returnTo?: string | null;
}) {
  const params = new URLSearchParams();
  if (base.conversationId) params.set("conversationId", base.conversationId);
  if (base.caseId) params.set("caseId", base.caseId);
  if (base.threadId) params.set("threadId", base.threadId);
  if (base.autoprompt) params.set("autoprompt", base.autoprompt);
  if (base.returnTo) params.set("returnTo", base.returnTo);
  const query = params.toString();
  return `/app/imob/chat${query ? `?${query}` : ""}`;
}

const getRunStringValue = (value: unknown) => readImobString(value, { treatLiteralNullish: true });

function dedupeHistoryLines(lines: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const normalized = line.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(line.trim());
  }
  return result;
}

function buildImobEntityActions(root: any) {
  const caseData = root?.case ?? root ?? null;
  const caseId = typeof caseData?.id === "string" && caseData.id.trim().length > 0 ? caseData.id.trim() : null;
  const threadId = typeof caseData?.threadId === "string" && caseData.threadId.trim().length > 0 ? caseData.threadId.trim() : null;
  const context = extractImobContextFromRun(root, { treatLiteralNullish: true });
  const owner = root?.entities?.owner ?? root?.owner ?? null;
  const property = root?.entities?.property ?? root?.property ?? null;
  const lead = root?.entities?.lead ?? root?.lead ?? null;
  const returnTo = buildImobReturnToHref({
    conversationId: context.conversationId,
    threadId: context.threadId ?? threadId,
    caseId: context.caseId ?? caseId,
  });
  const ownerName = getRunStringValue(owner?.name);
  const ownerLabel = ownerName ? `Editar cadastro do proprietário: ${ownerName}` : "Incluir proprietário no cadastro";
  const propertyRef = getRunStringValue(property?.address) ?? getRunStringValue(property?.id) ?? null;
  const propertyLabel = propertyRef ? `Editar cadastro do imóvel: ${propertyRef}` : "Incluir imóvel no cadastro";
  const leadName = getRunStringValue(lead?.name);
  const leadLabel = leadName ? `Editar cadastro do lead: ${leadName}` : "Incluir lead no cadastro";
  return [
    {
      label: ownerLabel,
      href: buildImobChatActionHref({
        conversationId: context.conversationId,
        caseId,
        threadId,
        autoprompt: ownerName ? `editar proprietário ${ownerName}` : "cadastrar proprietário",
        returnTo,
      }),
    },
    {
      label: propertyLabel,
      href: buildImobChatActionHref({
        conversationId: context.conversationId,
        caseId,
        threadId,
        autoprompt: propertyRef ? `editar imóvel ${propertyRef}` : "cadastrar imóvel",
        returnTo,
      }),
    },
    {
      label: leadLabel,
      href: buildImobChatActionHref({
        conversationId: context.conversationId,
        caseId,
        threadId,
        autoprompt: leadName ? `editar lead ${leadName}` : "cadastrar lead",
        returnTo,
      }),
    },
  ] satisfies ImobHtmlActionLink[];
}

function buildImobOperationalLinks(root: any) {
  const caseData = root?.case ?? root ?? null;
  const runId = typeof caseData?.runId === "string" && caseData.runId.trim().length > 0 ? caseData.runId.trim() : null;
  if (!runId) return [] as ImobHtmlActionLink[];
  return [
    {
      label: "Ver execução",
      href: typeof window === "undefined" ? null : `${window.location.origin}/app/runs?domain=imob&runId=${encodeURIComponent(runId)}`,
    },
    {
      label: "Abrir reconciliação",
      href: typeof window === "undefined" ? null : `${window.location.origin}/app/billing?runId=${encodeURIComponent(runId)}`,
    },
  ] satisfies ImobHtmlActionLink[];
}

function buildImobArtifactViewModel(payload: any) {
  const root = payload?.data ?? payload;
  const caseData = root?.case ?? root;
  const events = Array.isArray(root?.events) ? root.events : [];
  const history = dedupeHistoryLines(
    events.slice(0, 20).map((event: any) => {
      if (typeof event.summary === "string" && event.summary.trim().length > 0) return event.summary;
      return "Evento operacional registrado.";
    }),
  );
  return {
    generatedAt: root?.generatedAt ?? new Date().toISOString(),
    title: formatImobFlowLabel(caseData?.flow),
    summary: buildImobFlowSummary(root),
    stage: formatImobStageLabel(caseData?.stage),
    status: formatImobCaseStatusLabel(caseData?.status ?? ""),
    currentSituation: buildImobCurrentSituation(root),
    reason: buildImobReasonSummary(root),
    whatToDoNow: buildImobWhatToDoNow(root),
    clientExamples: buildImobClientApproachExamples(root),
    nextStep: caseData?.nextStep ?? null,
    entityActionLinks: buildImobEntityActions(root),
    entityActions: buildImobEntityActions(root).map((item) => item.label),
    operationalLinks: buildImobOperationalLinks(root),
    operationalActions: buildImobOperationalLinks(root).map((item) => item.label),
    history,
  };
}

function saveImobArtifactHtml(type: "bundle" | "receipt", payload: any, caseId: string) {
  const view = buildImobArtifactViewModel(payload);
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(type === "bundle" ? "Dossiê Operacional IMOB" : "Comprovante Operacional IMOB")}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #142033; margin: 40px; line-height: 1.5; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; }
    p, li { font-size: 12px; }
    .meta { color: #4a5568; }
    .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>${escapeHtml(type === "bundle" ? "IMOB Dossiê Operacional" : "IMOB Comprovante Operacional")}</h1>
  <p class="meta">Gerado em: ${escapeHtml(view.generatedAt)}</p>
  <p><strong>Atendimento:</strong> ${escapeHtml(view.title)}</p>
  <p><strong>Resumo:</strong> ${escapeHtml(view.summary)}</p>
  <p><strong>Etapa atual:</strong> ${escapeHtml(view.stage)}</p>
  <p><strong>Status:</strong> ${escapeHtml(view.status)}</p>
  <div class="box">
    <h2>Situação atual</h2>
    <p>${escapeHtml(view.currentSituation)}</p>
    <h2>Motivo</h2>
    <p>${escapeHtml(view.reason)}</p>
    <h2>O que fazer agora</h2>
    <ul>${renderHtmlList(view.whatToDoNow)}</ul>
    ${view.nextStep ? `<p><strong>Próxima ação sugerida:</strong> ${escapeHtml(view.nextStep)}</p>` : ""}
    <h2>Exemplo de abordagem ao cliente</h2>
    <ul>${renderHtmlList(view.clientExamples)}</ul>
    <h2>Cadastro e vínculos</h2>
    <ul>${renderHtmlLinkList(view.entityActionLinks)}</ul>
    ${view.operationalLinks.length ? `<h2>Execução operacional</h2><ul>${renderHtmlLinkList(view.operationalLinks)}</ul>` : ""}
    ${type === "bundle" ? `<h2>Histórico recente</h2><ul>${renderHtmlList(view.history.length ? view.history : ["Nenhum evento operacional registrado até o momento."])}</ul>` : ""}
  </div>
</body>
</html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = type === "bundle" ? `imob-case-${caseId}-dossier.html` : `imob-case-${caseId}-receipt.html`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function saveImobArtifactPdf(type: "bundle" | "receipt", payload: any, caseId: string) {
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

  const view = buildImobArtifactViewModel(payload);
  push(type === "bundle" ? "IMOB Dossiê Operacional" : "IMOB Comprovante Operacional", 14, true);
  push(`Gerado em: ${view.generatedAt}`);
  push(`Atendimento: ${view.title}`);
  push(`Resumo: ${view.summary}`);
  push(`Etapa atual: ${view.stage}`);
  push(`Status: ${view.status}`);
  y += 6;
  push("Situação atual", 12, true);
  push(view.currentSituation);
  y += 4;
  push("Motivo", 12, true);
  push(view.reason);
  y += 4;
  push("O que fazer agora", 12, true);
  for (const step of view.whatToDoNow) push(`- ${step}`);
  if (view.nextStep) push(`Próxima ação sugerida: ${view.nextStep}`);
  y += 4;
  push("Exemplo de abordagem ao cliente", 12, true);
  for (const line of view.clientExamples) push(`- ${line}`);
  y += 6;
  push("Cadastro e vínculos", 12, true);
  for (const line of view.entityActions) push(`- ${line}`);
  if (view.operationalActions.length) {
    y += 6;
    push("Execução operacional", 12, true);
    for (const line of view.operationalActions) push(`- ${line}`);
  }
  if (type === "bundle") {
    y += 6;
    push("Histórico recente", 12, true);
    for (const line of (view.history.length ? view.history : ["Nenhum evento operacional registrado até o momento."])) push(`- ${line}`);
  }

  doc.save(type === "bundle" ? `imob-case-${caseId}-dossier.pdf` : `imob-case-${caseId}-receipt.pdf`);
}

function buildImobCaseList(items: ImobCase[], reasonFilter: string, statusFilter: string) {
  const targetStatus = mapImobStatusFilterToCaseStatus(statusFilter);
  if (targetStatus === "__none__") return [];

  return items
    .map((item) => {
      const riskLabel = buildImobCaseRiskLabel(item);
      const priority = buildImobCasePriority(item);
      const primaryAction = item.canonical?.recommendedActions?.[0] ?? null;
      return {
        processId: item.id,
        caseId: item.id,
        threadId: item.threadId,
        status: item.status,
        riskLabel,
        ageHours: Number(imobCaseAgeHours(item.updatedAt).toFixed(1)),
        updatedAt: item.updatedAt,
        priorityLabel: priority.label,
        priorityScore: priority.score,
        nextAction: primaryAction?.label ?? item.nextStep ?? "Revisar caso",
        journeyLabel: formatImobJourneyTypeLabel(item.canonical?.journeyType),
      };
    })
    .filter((item) => !targetStatus || item.status === targetStatus)
    .filter((item) => reasonFilter === "all" || item.riskLabel.includes(reasonFilter))
    .sort((a, b) => b.priorityScore - a.priorityScore || b.ageHours - a.ageHours)
    .slice(0, 12);
}

const RUN_RESOURCES: Record<string, RunResource> = {
  __default: {
    prompt: "Simular fluxo de mint para cliente Alpha.",
    restSnippet: `curl -X POST "${API_BASE_URL}/defi1/simulate-mint" \
  -H "Authorization: Bearer $EIAH_TOKEN" \
  -H "x-eiah-tenant: ${TENANT_PLACEHOLDER}" \
  -H "x-eiah-workspace: ${WORKSPACE_PLACEHOLDER}" \
  -H "Content-Type: application/json" \
  -d '{
    "chainId": 11155111,
    "to": "0xRecipient",
    "abiFragment": "mint(address,uint256)",
    "args": ["0xWallet","1"],
    "valueWei": null
  }'`,
    sdkSnippet: `import fetch from "node-fetch";

async function simulate() {
  const res = await fetch("${API_BASE_URL}/defi1/simulate-mint", {
    method: "POST",
    headers: {
      "Authorization": "Bearer \${process.env.EIAH_TOKEN}",
      "x-eiah-tenant": "${TENANT_PLACEHOLDER}",
      "x-eiah-workspace": "${WORKSPACE_PLACEHOLDER}",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      chainId: 11155111,
      to: "0xRecipient",
      abiFragment: "mint(address,uint256)",
      args: ["0xWallet","1"]
    })
  });

  const data = await res.json();
  console.log(data);
}

simulate().catch(console.error);`,
    templates: [
      {
        name: "Zapier - disparar simulacao",
        description: "Webhook + Google Sheets para registrar pedidos",
        link: "https://zapier.com",
      },
      {
        name: "Make (Integromat) - pipeline DeFi",
        description: "Aciona agente, envia Slack e guarda logs",
        link: "https://www.make.com",
      },
      {
        name: "PowerApps - painel juridico",
        description: "Aprovacao humana com botao CONFIRM antes do run",
        link: "https://make.powerapps.com",
      },
      {
        name: "Planilha fallback",
        description: "CSV pronto para POST em /runs",
        link: "#",
      },
    ],
    tools: ["defi_simulator"],
  },
  guardian: {
    prompt: "Registrar prova processual com hash SHA-256 e verify_url imediato.",
    restSnippet: `curl -X POST "${API_BASE_URL}/guardian/provas/processuais" \
  -H "Authorization: Bearer $EIAH_TOKEN" \
  -H "x-eiah-tenant: ${TENANT_PLACEHOLDER}" \
  -H "x-eiah-workspace: ${WORKSPACE_PLACEHOLDER}" \
  -H "Content-Type: application/json" \
  -d '{
    "processo_id": "1234567-89.2025.8.26.0100",
    "itens": [
      { "tipo": "pdf", "mime": "application/pdf", "hash": "a1b2c3...", "bytes": null }
    ],
    "parte_submissora_did": "did:example:alice",
    "idempotency_key": "guardian-demo-001"
  }'`,
    sdkSnippet: `import fetch from "node-fetch";

async function registrarEvidencia() {
  const res = await fetch("${API_BASE_URL}/guardian/provas/processuais", {
    method: "POST",
    headers: {
      "Authorization": "Bearer \${process.env.EIAH_TOKEN}",
      "x-eiah-tenant": "${TENANT_PLACEHOLDER}",
      "x-eiah-workspace": "${WORKSPACE_PLACEHOLDER}",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      processo_id: "1234567-89.2025.8.26.0100",
      itens: [{ tipo: "pdf", mime: "application/pdf", hash: "a1b2c3...", bytes: null }],
      parte_submissora_did: "did:example:alice",
      idempotency_key: "guardian-demo-001"
    })
  });

  const data = await res.json();
  console.log(data);
}

registrarEvidencia().catch(console.error);`,
    templates: [
      {
        name: "Airflow - lote diário Merkle",
        description: "Gera lote, calcula Merkle root e aciona ancoragem Guardian",
        link: "#",
      },
      {
        name: "Notion - dashboard de provas",
        description: "Integra verify_url e status_c2pa em banco de evidências",
        link: "#",
      },
      {
        name: "AppSheet - requisições LGPD",
        description: "Interface low-code para POST /privacy/erasure com idempotency_key",
        link: "#",
      },
    ],
    tools: ["guardian_registry"],
  },
};

const RunsPage: React.FC = () => {
  const [agentId, setAgentId] = useState<string>();
  const [runs, setRuns] = useState<Run[]>([]);
  const [selectedRun, setSelectedRun] = useState<Run | null>(null);
  const [selectedRunCost, setSelectedRunCost] = useState<RunCostBreakdown | null>(null);
  const [selectedRunReconciliation, setSelectedRunReconciliation] = useState<BillingReconciliationSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [shadowPreview, setShadowPreview] = useState<ShadowExecutionContract | null>(null);
  const [activeOnboardingTab, setActiveOnboardingTab] = useState<"video" | "rest" | "sdk" | "templates">("video");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [tenantQuotaPct, setTenantQuotaPct] = useState<number | null>(null);
  const [imobHealth, setImobHealth] = useState<ImobFunnelHealth | null>(null);
  const [imobCasesList, setImobCasesList] = useState<Array<{
    processId: string;
    caseId: string;
    threadId: string | null;
    status: string;
    riskLabel: string;
    ageHours: number;
    updatedAt: string;
  }>>([]);
  const [imobLoading, setImobLoading] = useState(false);
  const [imobStatusFilter, setImobStatusFilter] = useState("pending_data");
  const [imobReasonFilter, setImobReasonFilter] = useState("all");

  const session = useSession();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const requestedDomain = (searchParams.get("domain") || "").trim().toLowerCase();
  const requestedRunId = (searchParams.get("runId") || "").trim() || null;
  const requestedConversationId = (searchParams.get("conversationId") || "").trim() || null;
  const requestedThreadId = (searchParams.get("threadId") || "").trim() || null;
  const requestedCaseId = (searchParams.get("caseId") || "").trim() || null;
  const [runPageMode, setRunPageMode] = useState<"overview" | "execution" | "investigation">(
    requestedRunId ? "investigation" : "overview"
  );
  const [isInvestigationMode, setIsInvestigationMode] = useState(Boolean(requestedRunId));
  const { tenantId, workspaceId = DEFAULT_WORKSPACE_ID, userId, token } = session;
  const brandName = session.branding?.brandName?.trim() || "Tenant";
  const workspaceLabel = session.branding?.workspaceLabel?.trim() || "DEFAULT";
  const isImobDomain = requestedDomain === "imob" || session.activeDomain === "imob";
  const imobAccessGate = isImobDomain && session.accessGate?.product === "IMOB" ? session.accessGate : null;
  const hasImobAccess = session.entitlements?.REAL_ESTATE_CORE === true && !imobAccessGate;
  const semanticDomain = isImobDomain ? "imob" : "core";
  const runLabelPlural = getDomainTerm(semanticDomain, "runPlural");
  const runLabelSingular = getDomainTerm(semanticDomain, "runSingular");
  const blockedLabelPlural = getDomainTerm(semanticDomain, "blockedPlural");
  const receiptLabel = getDomainTerm(semanticDomain, "receipt");
  const bundleLabel = getDomainTerm(semanticDomain, "bundle");
  const queueLabel = getDomainTerm(semanticDomain, "queue");
  const riskLabel = getDomainTerm(semanticDomain, "risk");
  const commandCenterLabel = getDomainTerm(semanticDomain, "commandCenter");
  const { executeAgent } = useAgentExecution();
  const agentKey = (agentId ?? "").toLowerCase();
  const resources = RUN_RESOURCES[agentKey] ?? RUN_RESOURCES.__default;
  const onboardingTabs = [
    { id: "video", label: "Videos" },
    { id: "rest", label: "REST" },
    { id: "sdk", label: "SDK" },
    { id: "templates", label: "Low-code" },
  ] as const;
  const runModes = [
    { id: "overview", label: "Overview" },
    { id: "execution", label: "Execução" },
    { id: "investigation", label: "Investigação" },
  ] as const;

  useEffect(() => {
    const hashId = location.hash.replace(/^#/, "").trim().toLowerCase();
    if (!hashId) return;
    if (hashId === "runs-overview") {
      setRunPageMode("overview");
      return;
    }
    if (hashId === "runs-criar") {
      setRunPageMode("execution");
      return;
    }
    if (hashId === "runs-status" || hashId === "runs-historico" || hashId === "runs-resultado") {
      setRunPageMode("investigation");
    }
  }, [location.hash]);

  useEffect(() => {
    const hashId = location.hash.replace(/^#/, "").trim();
    if (!hashId) return;
    const raf = window.requestAnimationFrame(() => {
      const target = document.getElementById(hashId);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    return () => window.cancelAnimationFrame(raf);
  }, [location.hash, runPageMode]);

  const visibleRuns = useMemo(() => {
    const now = Date.now();
    return runs.filter((run) => {
      if (!userId) return true;
      if (run.userId) return true;
      if (run.status !== "pending") return true;
      const baseTime = run.createdAt ?? run.startedAt;
      if (!baseTime) return true;
      const parsed = Date.parse(baseTime);
      if (!Number.isFinite(parsed)) return true;
      return now - parsed < ORPHAN_PENDING_HIDE_MS;
    });
  }, [runs, userId]);

  const inFlightStatuses: RunStatus[] = ["pending", "running"];
  const runSummary = useMemo(() => {
    if (!visibleRuns.length) {
      return {
        total: 0,
        success: 0,
        inFlight: 0,
        failed: 0,
        blocked: 0,
        totalCostCents: 0,
        averageDurationMs: null as number | null,
      };
    }

    const durations = visibleRuns
      .map((run) => extractDuration(run))
      .filter((value): value is number => typeof value === "number");

    return {
      total: visibleRuns.length,
      success: visibleRuns.filter((run) => run.status === "success").length,
      inFlight: visibleRuns.filter((run) => inFlightStatuses.includes(run.status)).length,
      failed: visibleRuns.filter((run) => run.status === "error").length,
      blocked: visibleRuns.filter((run) => run.status === "blocked").length,
      totalCostCents: visibleRuns.reduce((sum, run) => sum + (run.costCents ?? 0), 0),
      averageDurationMs:
        durations.length > 0 ? Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length) : null,
    };
  }, [visibleRuns, inFlightStatuses]);

  const averageDurationLabel = useMemo(() => {
    if (runSummary.averageDurationMs === null) return "—";
    return formatDuration(runSummary.averageDurationMs) ?? "—";
  }, [runSummary.averageDurationMs]);

  const totalCostLabel = useMemo(() => centsToBRL(runSummary.totalCostCents) ?? "—", [runSummary.totalCostCents]);
  const selectedRunFinance = useMemo(() => {
    const issue = selectedRunReconciliation?.items.auditGaps?.[0]?.issue ?? null;
    return {
      amountLabel: centsToBRL(selectedRunCost?.totals.amountCents) ?? "—",
      tokens: selectedRunCost?.totals.tokens ?? 0,
      issueLabel: issue ? formatReconciliationIssue(issue) : "Reconciliado",
      hasGap: Boolean(issue),
    };
  }, [selectedRunCost, selectedRunReconciliation]);
  const runExecutionCostOverview = selectedRunCost?.costOverview?.executionCost ?? null;
  const selectedRunBreakdownItems = useMemo(() => selectedRunCost?.items ?? [], [selectedRunCost]);
  const selectedRunAuditGaps = useMemo(() => selectedRunReconciliation?.items.auditGaps ?? [], [selectedRunReconciliation]);
  const selectedRunDuplicateCharges = useMemo(
    () => selectedRunReconciliation?.items.duplicateCharges ?? [],
    [selectedRunReconciliation]
  );
  const selectedRunLedgerGaps = useMemo(() => selectedRunReconciliation?.items.ledgerGaps ?? [], [selectedRunReconciliation]);
  const selectedRunOrphanUsage = useMemo(
    () => selectedRunReconciliation?.items.orphanUsage ?? [],
    [selectedRunReconciliation]
  );
  const selectedRunBreakdownByModel = useMemo(() => {
    const groups = new Map<
      string,
      {
        provider: string;
        model: string;
        amountCents: number;
        tokens: number;
        requests: number;
        estimatedRequests: number;
      }
    >();
    for (const item of selectedRunBreakdownItems) {
      const key = `${item.provider}::${item.model}`;
      const current = groups.get(key) ?? {
        provider: item.provider,
        model: item.model,
        amountCents: 0,
        tokens: 0,
        requests: 0,
        estimatedRequests: 0,
      };
      current.amountCents += item.amountCents;
      current.tokens += item.totalTokens;
      current.requests += 1;
      if (item.estimated) current.estimatedRequests += 1;
      groups.set(key, current);
    }
    return Array.from(groups.values()).sort((a, b) => b.amountCents - a.amountCents);
  }, [selectedRunBreakdownItems]);
  const selectedRunNarrative = useMemo(() => {
    if (!selectedRun?.id) {
      return {
        title: "Resumo executivo",
        lines: ["Selecione um run para ver o custo, o uso de tokens e a situação financeira desta execução."],
      };
    }
    const topModel = selectedRunBreakdownByModel[0] ?? null;
    const hasEstimated = selectedRunBreakdownItems.some((item) => item.estimated);
    return {
      title: "Resumo não técnico",
      lines: [
        `Esta execução consumiu ${selectedRunFinance.amountLabel} e ${selectedRunFinance.tokens} tokens.`,
        topModel
          ? `O maior peso de custo veio de ${topModel.provider} / ${topModel.model}, com ${centsToBRL(topModel.amountCents) ?? "—"}.`
          : "Não há breakdown operacional suficiente para apontar provider/model dominante.",
        selectedRunFinance.hasGap
          ? `A reconciliação está com alerta: ${selectedRunFinance.issueLabel.toLowerCase()}.`
          : "A reconciliação financeira deste run está consistente.",
        hasEstimated ? "Há linhas estimadas no breakdown; o custo pode ser refinado quando o provider devolver usage real." : "Todas as linhas disponíveis já vieram com breakdown operacional registrado.",
      ],
    };
  }, [selectedRun?.id, selectedRunBreakdownByModel, selectedRunBreakdownItems, selectedRunFinance]);
  const selectedRunImobContext = useMemo(
    () => extractImobContextFromRun(selectedRun, { treatLiteralNullish: true }),
    [selectedRun]
  );
  const selectedRunContextMerged = useMemo(
    () => ({
      conversationId: selectedRunImobContext.conversationId ?? requestedConversationId,
      threadId: selectedRunImobContext.threadId ?? requestedThreadId,
      caseId: selectedRunImobContext.caseId ?? requestedCaseId,
    }),
    [requestedCaseId, requestedConversationId, requestedThreadId, selectedRunImobContext]
  );
  const runsContextReturnToHref = useMemo(
    () =>
      buildImobReturnToHref({
        runId: selectedRun?.id ?? requestedRunId,
        conversationId: selectedRunContextMerged.conversationId,
        threadId: selectedRunContextMerged.threadId,
        caseId: selectedRunContextMerged.caseId,
      }),
    [requestedRunId, selectedRun?.id, selectedRunContextMerged]
  );
  const selectedRunImobHref = useMemo(() => {
    if (!selectedRunContextMerged.caseId && !selectedRunContextMerged.threadId && !selectedRunContextMerged.conversationId) return null;
    const params = new URLSearchParams();
    if (selectedRunContextMerged.caseId) params.set("caseId", selectedRunContextMerged.caseId);
    if (selectedRunContextMerged.threadId) params.set("threadId", selectedRunContextMerged.threadId);
    if (selectedRunContextMerged.conversationId) params.set("conversationId", selectedRunContextMerged.conversationId);
    params.set("returnTo", runsContextReturnToHref);
    const query = params.toString();
    return query ? `/app/imob/chat?${query}` : null;
  }, [runsContextReturnToHref, selectedRunContextMerged]);
  const isOverviewMode = runPageMode === "overview";
  const isExecutionMode = runPageMode === "execution";
  const isInvestigationPageMode = runPageMode === "investigation";
  const auditInvestigationMode = useCallback(
    (action: "entered" | "exited" | "changed", nextMode: boolean, reasonCodes: string[]) => {
      void apiPostExperienceAudit(
        {
          surfaceId: "runs",
          action,
          fromMode: nextMode ? "standard" : "investigation",
          toMode: nextMode ? "investigation" : "standard",
          reasonCodes,
          metadata: {
            selectedRunId: selectedRun?.id ?? null,
            requestedRunId,
          },
        },
        isImobDomain ? "imob" : "core"
      ).catch(() => undefined);
    },
    [isImobDomain, requestedRunId, selectedRun?.id]
  );

  const lastUpdatedLabel = useMemo(() => {
    if (!lastUpdatedAt) return "Nunca";
    try {
      return new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(lastUpdatedAt);
    } catch {
      return "Agora";
    }
  }, [lastUpdatedAt]);

  const onExportRunFinance = useCallback(() => {
    if (!selectedRun?.id) return;
    const payload = {
      exportedAt: new Date().toISOString(),
      run: {
        id: selectedRun.id,
        agent: selectedRun.agent,
        status: selectedRun.status,
        workspaceId: selectedRun.workspaceId,
        costCents: selectedRun.costCents ?? null,
        startedAt: selectedRun.startedAt ?? null,
        finishedAt: selectedRun.finishedAt ?? null,
        traceId: getRunStringValue(selectedRun.meta?.traceId) ?? null,
        caseId: selectedRun.caseId ?? null,
        threadId: selectedRun.threadId ?? null,
      },
      costBreakdown: selectedRunCost,
      reconciliation: selectedRunReconciliation,
      groupedByProviderModel: selectedRunBreakdownByModel,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `run-finance-${selectedRun.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [selectedRun, selectedRunBreakdownByModel, selectedRunCost, selectedRunReconciliation]);

  const fetchTenantQuota = useCallback(async () => {
    try {
      const response = await apiGetTenantBillingSummary();
      const hardLimit = response.data.policy?.monthlyCostCentsLimit ?? 0;
      const currentCost = response.data.totals?.costCents ?? 0;
      if (hardLimit > 0) {
        setTenantQuotaPct(Math.min(100, (currentCost / hardLimit) * 100));
      } else {
        setTenantQuotaPct(null);
      }
    } catch {
      setTenantQuotaPct(null);
    }
  }, []);

  const fetchRuns = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const response = await apiListRuns({ workspaceId, agent: agentId });
        setRuns(response.items);
        setSelectedRun((current) => {
          const nextItems = response.items.filter((run) => {
            if (!userId) return true;
            if (run.userId) return true;
            if (run.status !== "pending") return true;
            const baseTime = run.createdAt ?? run.startedAt;
            if (!baseTime) return true;
            const parsed = Date.parse(baseTime);
            if (!Number.isFinite(parsed)) return true;
            return Date.now() - parsed < ORPHAN_PENDING_HIDE_MS;
          });
          if (!current) return nextItems[0] ?? null;
          const updated = nextItems.find((run) => run.id === current.id);
          return updated ?? nextItems[0] ?? null;
        });
        setError(null);
        setLastUpdatedAt(new Date());
        fetchTenantQuota();
      } catch (err) {
        if (!options?.silent) {
          setError("Nao foi possivel carregar os runs agora.");
        } else {
          console.error("Falha ao atualizar runs em background", err);
        }
      } finally {
        if (!options?.silent) {
          setIsLoading(false);
        }
      }
    },
    [agentId, workspaceId, userId, fetchTenantQuota]
  );

  const fetchImobCommandCenter = useCallback(async () => {
    if (!isImobDomain || !hasImobAccess) return;
    setImobLoading(true);
    try {
      const [healthRes, casesRes] = await Promise.all([
        apiGetImobFunnelHealth({ workspaceId }),
        apiListImobCases({ status: mapImobStatusFilterToCaseStatus(imobStatusFilter) }),
      ]);
      setImobHealth(healthRes.data);
      setImobCasesList(buildImobCaseList(casesRes.data.items, imobReasonFilter, imobStatusFilter));
    } catch (error) {
      const message =
        error instanceof ApiError
          ? `Falha ao carregar Command Center IMOB (${error.status})`
          : "Falha ao carregar Command Center IMOB";
      setActionError(message);
    } finally {
      setImobLoading(false);
    }
  }, [hasImobAccess, imobReasonFilter, imobStatusFilter, isImobDomain, workspaceId]);

  const downloadImobArtifact = useCallback(
    async (type: "bundle" | "receipt", format: "pdf" | "html", caseId: string) => {
      if (!token) {
        setActionError("Sessao sem token para download de artefato.");
        return;
      }
      const path = type === "bundle" ? `/imob/cases/${caseId}/dossier` : `/imob/cases/${caseId}/receipt`;
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        setActionError(`Falha ao baixar ${type} (${response.status}).`);
        return;
      }
      const payload = await response.json();
      if (format === "html") {
        saveImobArtifactHtml(type, payload, caseId);
        return;
      }
      await saveImobArtifactPdf(type, payload, caseId);
    },
    [token]
  );

  useEffect(() => {
    fetchRuns();
    fetchTenantQuota();
  }, [fetchRuns, fetchTenantQuota]);

  useEffect(() => {
    void fetchImobCommandCenter();
  }, [fetchImobCommandCenter]);

  const hasInFlightRuns = useMemo(
    () => visibleRuns.some((run) => inFlightStatuses.includes(run.status)),
    [visibleRuns]
  );

  useEffect(() => {
    if (!hasInFlightRuns) {
      return;
    }

    const interval = setInterval(() => {
      fetchRuns({ silent: true });
    }, 4000);

    return () => clearInterval(interval);
  }, [hasInFlightRuns, fetchRuns]);

  const handleSelectRun = async (id: string) => {
    try {
      const fullRun = await apiGetRun(id);
      setSelectedRun(fullRun);
      setRunPageMode("investigation");
      if (!isInvestigationMode) {
        setIsInvestigationMode(true);
        auditInvestigationMode("entered", true, ["manual_run_selection"]);
      } else {
        auditInvestigationMode("changed", true, ["run_selection_changed"]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const displayRun = useMemo(
    () =>
      selectedRun ?? {
        id: "run_1234",
        workspaceId,
        projectId: workspaceId,
        agent: agentId ?? "desconhecido",
        status: "success" as const,
        meta: { tookMs: 280, traceId: "trace_demo" },
        response: { ok: true, summary: "Execucao concluida" },
        costCents: 128,
      },
    [selectedRun, agentId, workspaceId]
  );

  useEffect(() => {
    if (!selectedRun?.id) {
      setSelectedRunCost(null);
      setSelectedRunReconciliation(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      apiGetRunCostBreakdown(selectedRun.id).catch(() => null),
      apiGetBillingReconciliationSummary({ runId: selectedRun.id, limit: 1 }).catch(() => null),
    ]).then(([costResponse, reconciliationResponse]) => {
      if (cancelled) return;
      setSelectedRunCost(costResponse?.data ?? null);
      setSelectedRunReconciliation(reconciliationResponse?.data ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [selectedRun?.id]);

  useEffect(() => {
    if (!requestedRunId) return;
    setRunPageMode("investigation");
    if (!isInvestigationMode) {
      setIsInvestigationMode(true);
      auditInvestigationMode("entered", true, ["run_deeplink"]);
    }
    if (selectedRun?.id === requestedRunId) return;
    const existing = visibleRuns.find((run) => run.id === requestedRunId) ?? null;
    if (existing) {
      setSelectedRun(existing);
      return;
    }
    void apiGetRun(requestedRunId)
      .then((run) => {
        setSelectedRun(run);
      })
      .catch(() => undefined);
  }, [auditInvestigationMode, isInvestigationMode, requestedRunId, selectedRun?.id, visibleRuns]);

  const triggerRun = async (mode: "simulate" | "execute") => {
    if (!agentId) {
      setActionError("Selecione um agente antes de executar.");
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setIsSubmitting(true);
    try {
      if (mode === "simulate") {
        const previewResponse = await apiCreateShadowExecutionPreview({
          agent: agentId,
          prompt: resources.prompt,
          workspaceId,
          metadata: { mode, workspaceId },
          tools: resources.tools,
          inputRef: `runs:${agentId}:${workspaceId}`,
        });
        const preview = previewResponse?.data ?? null;
        setShadowPreview(preview);
        setActionNotice(
          preview
            ? `Preview gerado em ${preview.currentStage} com ${centsToBRL(
                preview.preview.estimatedCostCents
              )} estimados.`
            : "Preview gerado."
        );
        return;
      }

      const response = await executeAgent(agentId, {
        agent: agentId,
        prompt: resources.prompt,
        workspaceId,
        metadata: { mode },
      });
      if (Array.isArray(response?.warnings) && response.warnings.length > 0) {
        setActionNotice(response.warnings[0]?.message ?? "Run enfileirado com aviso de quota.");
      }
      const createdRun = response?.data;
      if (createdRun) {
        setRuns((prev) => [createdRun, ...prev.filter((run) => run.id !== createdRun.id)]);
        setSelectedRun(createdRun);
        setRunPageMode("execution");
        setLastUpdatedAt(new Date());
        if (createdRun.status === "pending" || createdRun.status === "running") {
          setTimeout(() => {
            fetchRuns({ silent: true });
          }, 1000);
        }
      } else {
        fetchRuns({ silent: true });
      }
    } catch (err) {
      let message = err instanceof Error ? err.message : "Falha ao executar run.";
      if (err instanceof ApiError && err.status === 403 && err.body && typeof err.body === "object") {
        const body = err.body as {
          error?: {
            code?: string;
            message?: string;
            details?: {
              reasons?: Array<{ message?: string }>;
            };
          };
        };
        if (body.error?.code === "BILLING_GUARD_BLOCKED") {
          const reason = body.error.details?.reasons?.[0]?.message;
          message = reason
            ? `Bloqueado por quota de billing: ${reason}`
            : "Bloqueado por quota de billing (hard limit ou workspace desabilitado).";
        } else if (typeof body.error?.message === "string" && body.error.message.trim()) {
          message = body.error.message;
        }
      }
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const promoteShadowToProduction = async () => {
    if (!shadowPreview) return;
    setActionError(null);
    setActionNotice(null);
    setIsSubmitting(true);
    try {
      const response = await apiPromoteShadowExecution(shadowPreview.shadowExecutionId, {
        target: "workspace_production",
      });
      const promotedShadow = response.data.shadowExecution;
      const productionRun = response.data.productionRun;
      setShadowPreview(promotedShadow);
      setSelectedRun(productionRun);
      setRuns((prev) => [productionRun, ...prev.filter((run) => run.id !== productionRun.id)]);
      setRunPageMode("execution");
      setLastUpdatedAt(new Date());
      setActionNotice(`Preview promovido para produção com run ${formatRunId(productionRun.id)}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao promover preview para produção.";
      setActionError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const startTour = () => {
    introJs()
      .setOptions({
        nextLabel: "Proximo",
        prevLabel: "Voltar",
        skipLabel: "Sair",
        doneLabel: "Pronto para orquestrar",
        showProgress: true,
        tooltipClass: "mission-control-tour",
        highlightClass: "mission-control-highlight",
        steps: [
          {
            element: '[data-tour="agent-select"]',
            title: "Etapa 1: Selecionar agente",
            intro:
              "Escolha o modulo que deseja executar. Cada agente cobre um dominio especifico - juridico, pitch, decisoes DeFi, etc.",
          },
          {
            element: '[data-tour="cost-estimate"]',
            title: "Etapa 2: Ver estimativa de custo",
            intro:
              "Aqui voce ve quanto deve custar a proxima chamada com base no tamanho do payload (ex.: 41 bytes). Use esta referencia para decidir entre rodar ou simular.",
          },
          {
            element: '[data-tour="project-context"]',
            title: "Etapa 3: Contexto do projeto",
            intro:
              "O selo indica em qual projeto ou ambiente as execucoes serao contabilizadas. Isso impacta limites e consumo.",
          },
          {
            element: '[data-tour="onboarding-panel"]',
            title: "Etapa 4: Onboarding tecnico",
            intro:
              "Assista a videos curtos, copie snippets REST ou SDK e baixe templates low-code para integrar o agente rapidamente.",
          },
          {
            element: '[data-tour="run-actions"]',
            title: "Etapa 5: Executar ou simular",
            intro:
              "Use as acoes para rodar fluxos reais ou simular primeiro. Simular ajuda a validar payload antes de gastar recursos ou publicar on-chain.",
          },
          {
            element: '[data-tour="run-history"]',
            title: "Etapa 6: Monitorar execucoes",
            intro:
              "Acompanhe status, tempos e horarios. Clique em cada item para ver entrada e saida completas - essencial para auditoria.",
          },
          {
            element: '[data-tour="run-viewer"]',
            title: "Etapa 7: Finalizar com acao",
            intro:
              "Se a execucao estiver ok, avance para persistir dados, acionar webhooks ou publicar on-chain.",
          },
        ],
      })
      .start();
  };

  return (
    <div className="space-y-10">
      {isImobDomain ? (
        hasImobAccess ? (
          <section className="glass-panel overflow-hidden p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">IMOB Command Center</p>
                <h2 className="text-2xl font-display font-semibold text-foreground">{commandCenterLabel}</h2>
                <p className="text-sm text-muted-foreground">
                  Visao executiva de funil e bloqueios para operacao imobiliaria.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="pill">{blockedLabelPlural}: {imobHealth?.summary.blockedTotal ?? runSummary.blocked}</span>
                <span className="pill">Aprovações pendentes: {imobHealth?.summary.pendingApprovals ?? runSummary.inFlight}</span>
                <span className="pill">Custo acumulado: {totalCostLabel}</span>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Bloqueios</p>
                <p className="mt-2 text-2xl font-display font-semibold text-foreground">{imobHealth?.summary.blockedTotal ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Pendente revisão</p>
                <p className="mt-2 text-2xl font-display font-semibold text-foreground">{imobHealth?.summary.salesKitPendingReview ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Pendências legais</p>
                <p className="mt-2 text-2xl font-display font-semibold text-foreground">{imobHealth?.summary.pendingLegal ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-4">
                <p className="text-[10px] uppercase tracking-[0.28em] text-muted-foreground">Settlements parciais</p>
                <p className="mt-2 text-2xl font-display font-semibold text-foreground">{imobHealth?.summary.partialSettlements ?? 0}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground"
                  value={imobStatusFilter}
                  onChange={(event) => setImobStatusFilter(event.target.value)}
                >
                  <option value="all">Estado: todos</option>
                  <option value="pending_data">Estado: pendente de dados</option>
                  <option value="ready_for_review">Estado: pronto para revisão</option>
                  <option value="blocked">Estado: bloqueado</option>
                  <option value="done">Estado: concluído</option>
                </select>
                <select
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-foreground"
                  value={imobReasonFilter}
                  onChange={(event) => setImobReasonFilter(event.target.value)}
                >
                  <option value="all">{riskLabel}: todos</option>
                  {(imobHealth?.byReasonCode ?? []).map((item) => (
                    <option key={item.reasonCode} value={item.reasonCode}>
                      {item.reasonCode}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => fetchImobCommandCenter()}
                  className="rounded-full border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-accent transition hover:bg-accent/20"
                >
                  {imobLoading ? "Atualizando..." : `Atualizar ${queueLabel.toLowerCase()}`}
                </button>
              </div>
            </div>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-white/5 text-[10px] uppercase tracking-[0.28em] text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{runLabelSingular}</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Jornada</th>
                    <th className="px-4 py-3">{riskLabel}</th>
                    <th className="px-4 py-3">Idade</th>
                    <th className="px-4 py-3">Sincronização</th>
                    <th className="px-4 py-3">Comprovantes</th>
                  </tr>
                </thead>
                <tbody>
                  {imobCasesList.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-muted-foreground" colSpan={7}>
                        Nenhum caso para os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    imobCasesList.map((item) => (
                      <tr key={item.processId} className="border-t border-white/10">
                        <td className="px-4 py-3 font-mono text-foreground/90">{formatRunId(item.processId)}</td>
                        <td className="px-4 py-3 text-foreground/90">
                          <div className="space-y-1">
                            <p>{formatImobCaseStatusLabel(item.status)}</p>
                            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">prioridade {item.priorityLabel}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          <div className="space-y-1">
                            <p>{item.journeyLabel}</p>
                            <p className="text-[10px] text-foreground/80">{item.nextAction}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{item.riskLabel || "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground">{item.ageHours.toFixed(1)}h</td>
                        <td className="px-4 py-3 text-xs">
                          <div className="space-y-1">
                            <p className="font-mono text-foreground/90">{formatRunId(item.caseId)}</p>
                            <p className="font-mono text-muted-foreground">
                              {item.threadId ? formatRunId(item.threadId) : "thread não vinculado"}
                            </p>
                            <Link
                              to={buildImobChatRoute({
                                conversationId: selectedRunContextMerged.conversationId,
                                caseId: item.caseId,
                                threadId: item.threadId,
                                autoprompt: "consultar caso",
                                returnTo: runsContextReturnToHref,
                              })}
                              className="text-[10px] text-accent underline-offset-2 hover:text-accent/80 hover:underline"
                            >
                              abrir no chat
                            </Link>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-nowrap items-start justify-center gap-6">
                            <div className="min-w-[120px] space-y-0 text-center">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground leading-none">Dossiê</p>
                              <div className="flex flex-wrap justify-center gap-0 -mt-1">
                                <button
                                  type="button"
                                  onClick={() => void downloadImobArtifact("bundle", "pdf", item.processId)}
                                  className="rounded-full bg-transparent px-1 py-1 text-[6px] font-normal uppercase tracking-[0.12em] text-foreground/90 hover:text-accent"
                                >
                                  PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void downloadImobArtifact("bundle", "html", item.processId)}
                                  className="rounded-full bg-transparent px-1 py-1 text-[6px] font-normal uppercase tracking-[0.12em] text-foreground/90 hover:text-accent"
                                >
                                  HTML
                                </button>
                              </div>
                            </div>
                            <div className="min-w-[120px] space-y-0 text-center">
                              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground leading-none">{receiptLabel}</p>
                              <div className="flex flex-wrap justify-center gap-0 -mt-1">
                                <button
                                  type="button"
                                  onClick={() => void downloadImobArtifact("receipt", "pdf", item.processId)}
                                  className="rounded-full bg-transparent px-1 py-1 text-[6px] font-normal uppercase tracking-[0.12em] text-foreground/90 hover:text-accent"
                                >
                                  PDF
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void downloadImobArtifact("receipt", "html", item.processId)}
                                  className="rounded-full bg-transparent px-1 py-1 text-[6px] font-normal uppercase tracking-[0.12em] text-foreground/90 hover:text-accent"
                                >
                                  HTML
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <ImobAccessGateCard gate={imobAccessGate} />
        )
      ) : null}

      <React.Fragment>
      <section className="glass-panel relative overflow-hidden p-8">
        <div className="absolute right-10 top-0 h-32 w-32 rounded-full bg-accent/30 blur-3xl" />
        <div className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-4">
              <p className="text-xs font-semibold uppercase tracking-[0.4em] text-accent">Mission Control</p>
              <h1 className="text-3xl font-display font-semibold text-foreground md:text-4xl">
                Orquestracao de Runs
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                Monitore execucoes, confirme simulacoes e acompanhe custos em tempo real para cada agente.
              </p>
              <button
                type="button"
                onClick={startTour}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-accent transition hover:border-accent/70 hover:bg-accent/20"
              >
                Iniciar tour interativo
              </button>
              <div className="flex flex-wrap gap-2">
                {runModes.map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setRunPageMode(mode.id)}
                    className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.26em] transition ${
                      runPageMode === mode.id
                        ? "border-accent/50 bg-accent/15 text-accent"
                        : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2" data-tour="project-context">
              <span className="pill">Contexto: {brandName} • {workspaceLabel}</span>
              <span className="pill">Agente: {agentId ?? "—"}</span>
              {tenantQuotaPct !== null ? <span className="pill">Quota: {tenantQuotaPct.toFixed(1)}%</span> : null}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="glass-subtle p-5" data-tour="agent-select">
              <h3 className="text-sm font-medium text-muted-foreground">Selecionar agente</h3>
              <AgentSelect value={agentId} onChange={setAgentId} />
            </div>
            <div className="glass-subtle flex flex-col justify-between gap-4 p-5" data-tour="cost-estimate">
              <div>
                <h3 className="text-sm font-medium text-muted-foreground">Custo desta execução</h3>
                <p className="text-xs text-muted-foreground">
                  Considerando payload de <strong>{resources.prompt.length}</strong> bytes.
                </p>
              </div>
              <CostBadge
                agent={agentId}
                inputBytes={resources.prompt.length}
                tools={resources.tools}
                workspaceId={workspaceId}
              />
            </div>
          </div>
	          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-surface/60 p-5 shadow-[0_25px_65px_-45px_rgba(56,189,248,0.8)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">{runLabelPlural} totais</p>
              <p className="mt-2 text-3xl font-display font-semibold text-foreground">{runSummary.total}</p>
              <p className="mt-1 text-xs text-muted-foreground">Ultima atualizacao {lastUpdatedLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-surface/60 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">Em andamento</p>
              <p className="mt-2 text-3xl font-display font-semibold text-foreground">{runSummary.inFlight}</p>
              <p className="mt-1 text-xs text-muted-foreground">Bloqueados {runSummary.blocked}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-surface/60 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">Finalizados</p>
              <p className="mt-2 text-3xl font-display font-semibold text-foreground">{runSummary.success}</p>
              <p className="mt-1 text-xs text-muted-foreground">Falhas {runSummary.failed}</p>
            </div>
	            <div className="rounded-2xl border border-white/10 bg-surface/60 p-5">
	              <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-muted-foreground">Tempo medio</p>
	              <p className="mt-2 text-3xl font-display font-semibold text-foreground">{averageDurationLabel}</p>
	              <p className="mt-1 text-xs text-muted-foreground">Consumo do workspace {totalCostLabel}</p>
	            </div>
	          </div>
            {session.verticals?.length ? (
              <div className="rounded-2xl border border-white/10 bg-surface/60 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-accent/80">Vertical rollout registry</p>
                  <span className="pill">{session.verticals.length} verticais</span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Leitura canônica do estágio de rollout disponível neste contexto operacional.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {session.verticals.map((item) => (
                    <div key={`runs-vertical-${item.verticalId}`} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground">{item.label}</p>
                        <span className="pill">{item.rolloutStage}</span>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Front door: {item.frontDoorSurface ?? "—"} • Hub: {item.operationalHubSurface ?? "—"}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
	        </div>
	      </section>

      {isOverviewMode ? (
      <section
        id="runs-overview"
        data-tour="onboarding-panel"
        className="glass-panel grid gap-6 p-8 lg:grid-cols-[0.5fr,0.5fr]"
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-accent">Onboarding tecnico</p>
            <h2 className="text-2xl font-display font-semibold text-foreground">Aprenda em minutos</h2>
            <p className="text-sm text-muted-foreground">
              Combine videos, snippets e templates low-code para conectar seu fluxo sem escrever muito codigo.
            </p>
          </div>
          <div className="grid w-full auto-cols-[minmax(110px,1fr)] grid-flow-col gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/5 p-1 text-[10px] uppercase tracking-[0.3em] text-muted-foreground no-scrollbar sm:text-xs md:grid-flow-row md:grid-cols-4 md:overflow-visible">
            {onboardingTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveOnboardingTab(tab.id)}
                className={`w-full whitespace-nowrap rounded-full px-3 py-1.5 text-center transition sm:px-4 sm:py-2 ${
                  activeOnboardingTab === tab.id
                    ? "bg-accent/20 text-accent"
                    : "hover:bg-white/10"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="glass-subtle min-h-[220px] p-6">
            {activeOnboardingTab === "video" && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Tour rapido (2 min)</p>
                <div className="aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                  <iframe
                    className="h-full w-full"
                    src="https://www.youtube.com/embed/c0U8x8s4b4k"
                    title="Onboarding Mission Control"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Substitua pelo video oficial do time quando estiver disponivel. Ideal para apresentacoes rapidas.
                </p>
              </div>
            )}
            {activeOnboardingTab === "rest" && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Exemplo REST (curl)</p>
                <pre className="max-h-48 overflow-auto rounded-2xl bg-black/60 p-4 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
{resources.restSnippet}
                </pre>
              </div>
            )}
            {activeOnboardingTab === "sdk" && (
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">SDK Node (fetch)</p>
                <pre className="max-h-48 overflow-auto rounded-2xl bg-black/60 p-4 text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap break-words">
{resources.sdkSnippet}
                </pre>
              </div>
            )}
            {activeOnboardingTab === "templates" && (
              <div className="space-y-4">
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Templates low-code</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {resources.templates.map((template) => (
                    <a
                      key={template.name}
                      href={template.link}
                      target="_blank"
                      rel="noreferrer"
                      className="glass-subtle flex flex-col gap-2 p-4 text-left transition hover:border-accent/40 hover:bg-accent/10"
                    >
                      <span className="text-sm font-semibold text-foreground">{template.name}</span>
                      <span className="text-xs text-muted-foreground">{template.description}</span>
                      <span className="text-xs font-semibold uppercase tracking-widest text-accent">Abrir template</span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <aside className="glass-subtle flex flex-col gap-4 p-6 text-sm text-muted-foreground">
          <h3 className="text-lg font-semibold text-foreground">Como usar</h3>
          <ol className="space-y-2 text-xs leading-relaxed">
            <li>1. Assista ao video ou escolha o snippet que mais combina com sua stack.</li>
            <li>2. Configure o token (EIAH_TOKEN) e o workspaceId do cliente.</li>
            <li>3. Rode uma simulacao antes de liberar o fluxo real.</li>
            <li>4. Conecte um template low-code para pilotos rapidos ou equipes nao tecnicas.</li>
          </ol>
          <p>
            Recursos aqui sao exemplos mockados. Substitua pelos links oficiais assim que os materiais do time estiverem prontos.
          </p>
        </aside>
      </section>
      ) : null}

      {isExecutionMode ? (
      <section
        id="runs-criar"
        data-tour="run-actions"
        className="glass-subtle flex flex-col gap-3 p-6 text-sm text-muted-foreground lg:flex-row lg:items-center lg:justify-between"
      >
        <div>
          <h2 className="text-lg font-semibold text-foreground">Executar ou simular</h2>
          <p>
            Utilize as acoes abaixo para disparar uma execucao real ou testar primeiro sem comprometer recursos.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => triggerRun("simulate")}
            className="rounded-full border border-accent/60 bg-accent/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/25 sm:px-4 sm:py-2 sm:text-xs"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Executando..." : "Simular primeiro"}
          </button>
          <button
            type="button"
            onClick={() => triggerRun("execute")}
            className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-foreground transition hover:border-accent/40 hover:text-accent sm:px-4 sm:py-2 sm:text-xs"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Executando..." : "Rodar agora"}
          </button>
        </div>
        {actionError && (
          <p className="text-xs text-red-300" role="alert">
            {actionError}
          </p>
        )}
        {actionNotice && !actionError ? (
          <p className="text-xs text-amber-200" role="status">
            {actionNotice}
          </p>
        ) : null}
        {shadowPreview ? (
          <div className="w-full rounded-2xl border border-accent/30 bg-accent/10 p-4 text-xs text-foreground">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-accent">Shadow preview</p>
                <p className="mt-2 text-sm font-semibold text-foreground">{shadowPreview.preview.summary}</p>
              </div>
              <span className="pill">{shadowPreview.currentStage}</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Custo estimado</p>
                <p className="mt-2 text-sm text-foreground">
                  {centsToBRL(shadowPreview.preview.estimatedCostCents)}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Approval</p>
                <p className="mt-2 text-sm text-foreground">{shadowPreview.approvalStatus}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Side effect</p>
                <p className="mt-2 text-xs text-foreground">{shadowPreview.sideEffectMode}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Shadow ID</p>
                <p className="mt-2 break-all text-xs text-foreground">{shadowPreview.shadowExecutionId}</p>
              </div>
            </div>
            {shadowPreview.preview.warnings.length > 0 ? (
              <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-100">
                {shadowPreview.preview.warnings[0]}
              </div>
            ) : null}
            {shadowPreview.preview.nextActions.length > 0 ? (
              <div className="mt-4">
                <p className="text-[10px] uppercase tracking-[0.25em] text-accent/80">Próximos passos</p>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {shadowPreview.preview.nextActions.map((step) => (
                    <li key={step}>- {step}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void promoteShadowToProduction()}
                className="rounded-full border border-accent/60 bg-accent/15 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent hover:bg-accent/25 sm:px-4 sm:py-2 sm:text-xs disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting || shadowPreview.approvalStatus === "pending"}
              >
                {isSubmitting ? "Promovendo..." : "Promover para produção"}
              </button>
              {shadowPreview.approvalStatus === "pending" ? (
                <span className="text-[11px] text-amber-200">
                  Aprovação pendente antes da promoção para produção.
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
      ) : null}

      {!isOverviewMode ? (
      <section id="runs-status" className="glass-panel relative overflow-hidden p-0">
        <div className="pointer-events-none absolute right-0 top-0 h-40 w-40 -translate-y-1/3 translate-x-1/4 rounded-full bg-accent/20 blur-3xl" />
        <div className="space-y-6 p-6 sm:p-8">
          <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-display font-semibold text-foreground">
                {isInvestigationPageMode ? "Investigação de run" : `${runLabelPlural} recentes`}
              </h2>
              <p className="text-sm text-muted-foreground">
                {isInvestigationPageMode
                  ? "Detalhe operacional, financeiro e auditável do run selecionado."
                  : "Visualize execucoes, tempos de resposta e confirme resultados antes do envio on-chain."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className="pill">{visibleRuns.length} {runLabelPlural.toLowerCase()}</span>
              <span className="pill">Atualizado {lastUpdatedLabel}</span>
              <button
                type="button"
                onClick={() => fetchRuns()}
                className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/10 px-3 py-1 font-semibold uppercase tracking-[0.3em] text-accent transition hover:border-accent/60 hover:bg-accent/20 disabled:opacity-60"
                disabled={isLoading}
              >
                {isLoading ? "Atualizando..." : "Atualizar"}
              </button>
            </div>
          </header>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/30 p-4 text-sm text-red-200">{error}</div>
          ) : (
            <div className="flex flex-col gap-6">
              <div id="runs-historico" className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                  Selecionar run
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const nextMode = !isInvestigationMode;
                      setIsInvestigationMode(nextMode);
                      auditInvestigationMode(nextMode ? "entered" : "exited", nextMode, [
                        nextMode ? "manual_toggle" : "manual_exit",
                      ]);
                    }}
                    className={`pill hover:border-accent/40 hover:text-foreground ${
                      isInvestigationMode ? "bg-accent/15 text-accent" : ""
                    }`}
                  >
                    {isInvestigationMode ? "Sair do modo investigação" : "Entrar no modo investigação"}
                  </button>
                  {selectedRun?.id ? (
                    <Link
                      to={`/app/billing?runId=${encodeURIComponent(selectedRun.id)}`}
                      className="pill hover:border-accent/40 hover:text-foreground"
                    >
                      Abrir reconciliação
                    </Link>
                  ) : null}
                  {selectedRunImobHref ? (
                    <Link
                      to={selectedRunImobHref}
                      className="pill hover:border-accent/40 hover:text-foreground"
                    >
                      Abrir caso IMOB
                    </Link>
                  ) : null}
                  {selectedRun?.id ? (
                    <button
                      type="button"
                      onClick={onExportRunFinance}
                      className="pill hover:border-accent/40 hover:text-foreground"
                    >
                      Exportar detalhe financeiro
                    </button>
                  ) : null}
                  <span className={`pill ${selectedRunFinance.hasGap ? "bg-amber-500/15 text-amber-200" : ""}`}>
                    {selectedRunFinance.issueLabel}
                  </span>
                  {isInvestigationMode ? <span className="pill bg-accent/15 text-accent">Investigação ativa</span> : null}
                  <span className="pill">Custo desta execução: {selectedRunFinance.amountLabel}</span>
                  <span className="pill">Tokens: {selectedRunFinance.tokens}</span>
                  <select
                    value={selectedRun?.id ?? ""}
                    onChange={(event) => handleSelectRun(event.target.value)}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-foreground focus:border-accent/60 focus:outline-none"
                  >
                    {visibleRuns.length === 0 ? (
                      <option value="">Nenhum run encontrado</option>
                    ) : (
                      visibleRuns.map((run) => (
                        <option key={run.id} value={run.id}>
                          {formatAgentLabel(run.agent)} • {formatRunId(run.id)}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>
              {isInvestigationPageMode ? (
              <div className="grid gap-4 lg:grid-cols-[1.1fr,0.9fr]">
                <div
                  className={`rounded-2xl border bg-white/5 p-4 lg:col-span-2 ${
                    isInvestigationMode ? "border-accent/30" : "border-white/10"
                  }`}
                >
                  {runExecutionCostOverview ? (
                    <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-foreground">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-accent/80">
                        {runExecutionCostOverview.title}
                      </p>
                      <p className="mt-2 text-lg font-semibold">
                        {centsToBRL(runExecutionCostOverview.amountCents) ?? "—"}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">{runExecutionCostOverview.summary}</p>
                    </div>
                  ) : null}
                  <div className="grid gap-4 lg:grid-cols-[0.55fr,0.45fr]">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                        {selectedRunNarrative.title}
                      </p>
                      <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                        {selectedRunNarrative.lines.map((line) => (
                          <li key={line} className="leading-relaxed">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                          Agrupamento provider/model
                        </p>
                        <span className="pill">{selectedRunBreakdownByModel.length} grupo(s)</span>
                      </div>
                      {selectedRunBreakdownByModel.length === 0 ? (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Nenhum provider/model consolidado para este run.
                        </p>
                      ) : (
                        <div className="mt-3 space-y-2">
                          {selectedRunBreakdownByModel.slice(0, 6).map((item) => (
                            <div
                              key={`${item.provider}:${item.model}`}
                              className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="font-semibold text-foreground">
                                  {item.provider} • {item.model}
                                </p>
                                <span className="pill">{centsToBRL(item.amountCents) ?? "—"}</span>
                              </div>
                              <p className="mt-1">
                                {item.tokens} tokens • {item.requests} chamada(s)
                                {item.estimatedRequests > 0 ? ` • ${item.estimatedRequests} estimada(s)` : ""}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div
                  className={`rounded-2xl border bg-white/5 p-4 ${
                    isInvestigationMode ? "border-accent/30" : "border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      Breakdown operacional
                    </p>
                    <span className="pill">{selectedRunBreakdownItems.length} item(ns)</span>
                  </div>
                  {selectedRunBreakdownItems.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Nenhuma linha de breakdown encontrada para este run.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {selectedRunBreakdownItems.slice(0, 6).map((item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-foreground">
                              {item.provider} • {item.model}
                            </p>
                            <span className="pill">{centsToBRL(item.amountCents) ?? "—"}</span>
                          </div>
                          <p className="mt-1">
                            {formatMeterTypeLabel(item.meterType)} • {item.requestClass} • {item.totalTokens} tokens
                          </p>
                          <p className="mt-1 text-[11px]">
                            requestId: {item.requestId} {item.estimated ? "• estimado" : ""}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div
                  className={`rounded-2xl border bg-white/5 p-4 ${
                    isInvestigationMode ? "border-accent/30" : "border-white/10"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                      Reconciliação do run
                    </p>
                    <span className={`pill ${selectedRunFinance.hasGap ? "bg-amber-500/15 text-amber-200" : ""}`}>
                      {selectedRunFinance.issueLabel}
                    </span>
                  </div>
                  {selectedRunAuditGaps.length === 0 &&
                  selectedRunDuplicateCharges.length === 0 &&
                  selectedRunLedgerGaps.length === 0 &&
                  selectedRunOrphanUsage.length === 0 ? (
                    <p className="mt-3 text-sm text-muted-foreground">Nenhum gap auditável encontrado para este run.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {selectedRunAuditGaps.map((item) => (
                        <div
                          key={`${item.runId}-${item.issue}`}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground"
                        >
                          <p className="font-semibold text-foreground">{formatReconciliationIssue(item.issue)}</p>
                          <p className="mt-1">
                            Run: {centsToBRL(item.runCostCents) ?? "—"} • Breakdown: {centsToBRL(item.breakdownCostCents) ?? "—"} • Ledger: {centsToBRL(item.ledgerCostCents) ?? "—"}
                          </p>
                        </div>
                      ))}
                      {selectedRunDuplicateCharges.map((item) => (
                        <div
                          key={`dup-${item.runId ?? "sem-run"}-${item.requestId ?? "sem-request"}`}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground"
                        >
                          <p className="font-semibold text-foreground">Charge duplicado</p>
                          <p className="mt-1">
                            requestId: {item.requestId ?? "—"} • count: {item.count} • valor: {centsToBRL(item.amountCents) ?? "—"}
                          </p>
                        </div>
                      ))}
                      {selectedRunLedgerGaps.map((item) => (
                        <div
                          key={`ledger-${item.ledgerId}`}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground"
                        >
                          <p className="font-semibold text-foreground">
                            {item.issue === "missing_workspace" ? "Ledger sem workspace" : "Ledger sem run"}
                          </p>
                          <p className="mt-1">
                            ledgerId: {item.ledgerId} • requestId: {item.requestId ?? "—"} • valor: {centsToBRL(item.amountCents) ?? "—"}
                          </p>
                        </div>
                      ))}
                      {selectedRunOrphanUsage.map((item) => (
                        <div
                          key={`usage-${item.runId}-${item.requestId}-${item.meterType}`}
                          className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-muted-foreground"
                        >
                          <p className="font-semibold text-foreground">Usage órfão</p>
                          <p className="mt-1">
                            requestId: {item.requestId} • {formatMeterTypeLabel(item.meterType)} • valor: {centsToBRL(item.amountCents) ?? "—"}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              ) : null}
              <div id="runs-resultado" data-tour="run-viewer" className="flex min-h-[420px] flex-col">
                <RunViewer run={displayRun} />
              </div>
            </div>
          )}
        </div>
      </section>
      ) : null}
      </React.Fragment>
    </div>
  );
};

export default RunsPage;
