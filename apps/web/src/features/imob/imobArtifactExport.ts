function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
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

function renderHtmlLinkList(items: ImobHtmlActionLink[]) {
  return items
    .map((item) => {
      if (!item.href) return `<li>${escapeHtml(item.label)}</li>`;
      return `<li><a href="${escapeHtml(item.href)}" target="_self" rel="noopener noreferrer">${escapeHtml(item.label)}</a></li>`;
    })
    .join("");
}

function buildImobChatHref(base: {
  caseId?: string | null;
  threadId?: string | null;
  autoprompt?: string | null;
}) {
  const params = new URLSearchParams();
  if (base.caseId) params.set("caseId", base.caseId);
  if (base.threadId) params.set("threadId", base.threadId);
  if (base.autoprompt) params.set("autoprompt", base.autoprompt);
  const query = params.toString();
  return `/app/imob/chat${query ? `?${query}` : ""}`;
}

function formatImobCaseStatusLabel(status: string) {
  if (status === "pending_data") return "pendente de dados";
  if (status === "ready_for_review") return "pronto para revisão";
  if (status === "blocked") return "bloqueado";
  if (status === "done") return "concluído";
  return status || "—";
}

function formatImobFlowLabel(flow: string | null | undefined) {
  if (flow === "lead.qualify") return "Qualificação";
  if (flow === "owner.create") return "Cadastro do proprietário";
  if (flow === "property.create") return "Cadastro do imóvel";
  if (flow === "listing.activate") return "Publicação";
  if (flow === "contract.prepare") return "Contrato";
  return flow?.trim() || "Atendimento";
}

function formatImobStageLabel(stage: string | null | undefined) {
  return stage?.trim() || "etapa não informada";
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

function buildImobCurrentSituation(data: any) {
  const caseData = data?.case ?? data;
  const pending = asStringList(caseData?.pendingItems);
  const blockers = asStringList(caseData?.blockers);
  if (blockers.length > 0) return `Existem bloqueios operacionais: ${blockers.join(", ")}.`;
  if (pending.length > 0) return `Existem pendências em aberto: ${pending.join(", ")}.`;
  return "O atendimento está registrado e pode seguir para a próxima ação.";
}

function buildImobReasonSummary(data: any) {
  const caseData = data?.case ?? data;
  const blockers = asStringList(caseData?.blockers);
  if (blockers.length > 0) return blockers.join(", ");
  const pending = asStringList(caseData?.pendingItems);
  if (pending.length > 0) return pending.join(", ");
  return "Sem motivo crítico registrado.";
}

function buildImobResolutionSteps(pending: string[]) {
  if (pending.some((item) => item.toLowerCase().includes("document"))) {
    return ["Revisar documentos pendentes.", "Solicitar complemento antes da próxima etapa."];
  }
  if (pending.some((item) => item.toLowerCase().includes("telefone") || item.toLowerCase().includes("e-mail"))) {
    return ["Confirmar telefone e e-mail de contato.", "Atualizar cadastro para seguir atendimento."];
  }
  return ["Confirmar dados pendentes do atendimento.", "Avançar para a próxima etapa operacional."];
}

function buildImobWhatToDoNow(data: any) {
  const caseData = data?.case ?? data;
  const flow = caseData?.flow ?? "";
  const pending = asStringList(caseData?.pendingItems);
  const blockers = asStringList(caseData?.blockers);
  const items = buildImobResolutionSteps(blockers.length ? blockers : pending);
  if (flow === "lead.qualify") return [...items, "Revisar qualificação do lead.", "Vincular imóvel compatível ao lead."];
  if (flow === "owner.create") return [...items, "Revisar cadastro do proprietário.", "Vincular proprietário ao imóvel."];
  if (flow === "property.create") return [...items, "Revisar cadastro do imóvel.", "Vincular imóvel à próxima etapa comercial."];
  if (flow === "listing.activate") return [...items, "Validar canais de publicação.", "Publicar anúncio."];
  if (flow === "contract.prepare") return [...items, "Gerar minuta contratual.", "Enviar para revisão ou assinatura."];
  return items;
}

function buildImobClientApproachExamples(data: any) {
  const caseData = data?.case ?? data;
  const pending = asStringList(caseData?.pendingItems);
  if (pending.length > 0) {
    return [`Precisamos concluir: ${pending[0]}.`, "Assim seguimos com segurança para a próxima etapa."];
  }
  return ["Seu atendimento está em andamento.", "Vamos seguir com a próxima ação recomendada."];
}

function buildImobEntityActions(root: any) {
  const caseData = root?.case ?? root ?? null;
  const caseId = typeof caseData?.id === "string" && caseData.id.trim().length > 0 ? caseData.id.trim() : null;
  const threadId = typeof caseData?.threadId === "string" && caseData.threadId.trim().length > 0 ? caseData.threadId.trim() : null;
  const owner = root?.entities?.owner ?? root?.owner ?? null;
  const property = root?.entities?.property ?? root?.property ?? null;
  const lead = root?.entities?.lead ?? root?.lead ?? null;
  const ownerName = typeof owner?.name === "string" ? owner.name.trim() : "";
  const propertyRef = typeof property?.address === "string" ? property.address.trim() : "";
  const leadName = typeof lead?.name === "string" ? lead.name.trim() : "";
  return [
    {
      label: ownerName ? `Editar cadastro do proprietário: ${ownerName}` : "Incluir proprietário no cadastro",
      href: buildImobChatHref({ caseId, threadId, autoprompt: ownerName ? `editar proprietário ${ownerName}` : "cadastrar proprietário" }),
    },
    {
      label: propertyRef ? `Editar cadastro do imóvel: ${propertyRef}` : "Incluir imóvel no cadastro",
      href: buildImobChatHref({ caseId, threadId, autoprompt: propertyRef ? `editar imóvel ${propertyRef}` : "cadastrar imóvel" }),
    },
    {
      label: leadName ? `Editar cadastro do lead: ${leadName}` : "Incluir lead no cadastro",
      href: buildImobChatHref({ caseId, threadId, autoprompt: leadName ? `editar lead ${leadName}` : "cadastrar lead" }),
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

function dedupeHistoryLines(lines: string[]) {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const normalized = line.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(line.trim());
  }
  return result;
}

function buildImobArtifactViewModel(payload: any) {
  const root = payload?.data ?? payload;
  const caseData = root?.case ?? root;
  const events = Array.isArray(root?.events) ? root.events : [];
  const entityActionLinks = buildImobEntityActions(root);
  const operationalLinks = buildImobOperationalLinks(root);
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
    entityActionLinks,
    entityActions: entityActionLinks.map((item) => item.label),
    operationalLinks,
    operationalActions: operationalLinks.map((item) => item.label),
    history: dedupeHistoryLines(
      events.slice(0, 20).map((event: any) => {
        if (typeof event.summary === "string" && event.summary.trim().length > 0) return event.summary;
        return "Evento operacional registrado.";
      })
    ),
  };
}

export function saveImobArtifactHtml(type: "bundle" | "receipt", payload: any, caseId: string) {
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

export async function saveImobArtifactPdf(type: "bundle" | "receipt", payload: any, caseId: string) {
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
    for (const line of view.history.length ? view.history : ["Nenhum evento operacional registrado até o momento."]) {
      push(`- ${line}`);
    }
  }

  doc.save(type === "bundle" ? `imob-case-${caseId}-dossier.pdf` : `imob-case-${caseId}-receipt.pdf`);
}

export type ImobRouteContext = {
  conversationId?: string | null;
  threadId?: string | null;
  caseId?: string | null;
  runId?: string | null;
};

export function buildImobReturnToHref(context?: ImobRouteContext) {
  const params = new URLSearchParams();
  params.set("domain", "imob");
  if (context?.runId) params.set("runId", context.runId);
  if (context?.conversationId) params.set("conversationId", context.conversationId);
  if (context?.threadId) params.set("threadId", context.threadId);
  if (context?.caseId) params.set("caseId", context.caseId);
  return `/app/runs?${params.toString()}`;
}

export function buildImobChatActionHref(base: {
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
