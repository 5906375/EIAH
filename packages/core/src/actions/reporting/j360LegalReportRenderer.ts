import type { RunAtivoReportingInput } from "./runAtivoSchema";
import { J360LegalReportSchema, type J360LegalReport } from "./j360LegalReportSchema";
import { renderRecipeOrchestrationHtmlSection } from "./recipeOrchestrationRenderer";

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function safeColor(value: string | null | undefined, fallback: string) {
  if (!value) return fallback;
  const trimmed = value.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed) ? trimmed : fallback;
}

export function shouldUseJ360LegalRenderer(payload: RunAtivoReportingInput) {
  const agent = payload.metadata.agente.trim().toLowerCase();
  const report = extractJ360LegalReport(payload);
  const orchestration = isPlainObject(payload.metadata.recipeOrchestration)
    ? (payload.metadata.recipeOrchestration as PlainObject)
    : null;
  const intent = typeof orchestration?.intent === "string" ? orchestration.intent : null;
  const domain = typeof orchestration?.domain === "string" ? orchestration.domain : null;
  if (!report) return false;
  return (agent === "j_360" || agent === "j360") && (!intent || intent === "legal_review" || domain === "legal");
}

export function extractJ360LegalReport(payload: RunAtivoReportingInput): J360LegalReport | null {
  const raw = isPlainObject(payload.metadata) ? payload.metadata.j360LegalReport : null;
  const parsed = J360LegalReportSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

function formatLegalDecision(value: J360LegalReport["legalDecision"]) {
  if (value === "APROVADO_BAIXO_RISCO") return "aprovado para uso interno com baixo risco";
  if (value === "APROVADO_COM_RESSALVAS") return "aprovado com ressalvas e ajustes recomendados";
  return "não recomendado sem revisão jurídica";
}

function renderList(items: string[], empty: string) {
  if (items.length === 0) return `<li>${escapeHtml(empty)}</li>`;
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function renderEvidenceList(
  evidenceRefs: J360LegalReport["riskMatrix"][number]["evidenceRefs"],
  emptyLabel: string
) {
  if (evidenceRefs.length === 0) {
    return `<div class="evidence-empty">${escapeHtml(emptyLabel)}</div>`;
  }

  return `<details class="evidence-details">
    <summary>Ver evidências referenciadas (${evidenceRefs.length})</summary>
    <ul class="evidence-list">
      ${evidenceRefs
        .map(
          (ref) =>
            `<li><strong>${escapeHtml(ref.document)}</strong>${ref.page ? ` · p. ${escapeHtml(ref.page)}` : ""}${
              ref.section ? ` · ${escapeHtml(ref.section)}` : ""
            }${ref.excerpt ? `<br /><small>${escapeHtml(ref.excerpt)}</small>` : ""}</li>`
        )
        .join("")}
    </ul>
  </details>`;
}

function renderRiskMatrix(report: J360LegalReport) {
  if (report.riskMatrix.length === 0) {
    return `<tr><td colspan="5">Nenhuma matriz de risco estruturada foi reportada.</td></tr>`;
  }

  return report.riskMatrix
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.risk)}</td>
        <td>${escapeHtml(item.severity)}</td>
        <td>${escapeHtml(item.impact)}</td>
        <td>${escapeHtml(item.mitigation)}</td>
        <td>${renderEvidenceList(item.evidenceRefs, "Nenhuma evidência estruturada.")}</td>
      </tr>`
    )
    .join("");
}

function renderCoverageMatrix(report: J360LegalReport) {
  if (report.coverageMatrix.length === 0) {
    return `<tr><td colspan="3">Nenhuma matriz de cobertura estruturada foi reportada.</td></tr>`;
  }

  return report.coverageMatrix
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.whatParecerAsks)}</td>
        <td>${escapeHtml(item.whatRunAnswered)}</td>
        <td>${escapeHtml(item.whatStillNeedsManualReview ?? "Nenhuma pendência adicional reportada.")}</td>
      </tr>`
    )
    .join("");
}

function renderFormalHeader(report: J360LegalReport) {
  const rows = [
    ["Número", report.header.number ?? "não informado"],
    ["Interessado", report.header.interessado ?? "não informado"],
    ["Assunto", report.header.assunto ?? report.analysisScope],
    ["Decisão preliminar", formatLegalDecision(report.legalDecision)],
    ["Risco consolidado", report.riskLevel],
  ];
  return rows
    .map(
      ([label, value]) => `<tr>
        <th>${escapeHtml(label)}</th>
        <td>${escapeHtml(value)}</td>
      </tr>`
    )
    .join("");
}

function renderReferencePills(items: string[]) {
  if (items.length === 0) return `<span class="pill">não informado</span>`;
  return items.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("");
}

function renderFundamentos(report: J360LegalReport) {
  if (report.fundamentos.length === 0) {
    return `<article class="foundation-item">
      <h3>Fundamentação não estruturada</h3>
      <p>Nenhum tópico formal de fundamentação foi estruturado para este run.</p>
    </article>`;
  }

  return report.fundamentos
    .map(
      (item) => `<article class="foundation-item">
        <h3>${escapeHtml(item.topic)}</h3>
        <p>${escapeHtml(item.analysis)}</p>
        <div class="refs-grid">
          <div>
            <small class="muted">CLT</small>
            <div class="pill-row">${renderReferencePills(item.cltRefs)}</div>
          </div>
          <div>
            <small class="muted">Súmulas TST</small>
            <div class="pill-row">${renderReferencePills(item.tstRefs)}</div>
          </div>
          <div>
            <small class="muted">OJs</small>
            <div class="pill-row">${renderReferencePills(item.ojRefs)}</div>
          </div>
        </div>
        <div>
          <small class="muted">Evidência documental</small>
          ${renderEvidenceList(item.evidenceRefs, "Nenhuma evidência documental estruturada.")}
        </div>
      </article>`
    )
    .join("");
}

function renderExecutiveList(items: string[], empty: string) {
  return `<ul>${renderList(items, empty)}</ul>`;
}

function renderTableOfContents(report: J360LegalReport) {
  const items =
    report.tableOfContents.length > 0
      ? report.tableOfContents
      : report.reportSections.map((section, index) => ({
          id: section.id,
          title: section.title,
          anchor: section.anchor,
          order: index,
        }));
  const fallbackItems =
    items.length > 0
      ? items
      : [
          { id: "identificacao", title: "Identificação do parecer", anchor: "identificacao", order: 0 },
          { id: "ementa", title: "Ementa", anchor: "ementa", order: 1 },
          { id: "relatorio", title: "Relatório", anchor: "relatorio", order: 2 },
          { id: "fundamentacao", title: "Fundamentação", anchor: "fundamentacao", order: 3 },
          { id: "referencias", title: "Referências jurídicas consolidadas", anchor: "referencias", order: 4 },
          { id: "riscos", title: "Matriz de riscos", anchor: "riscos", order: 5 },
          { id: "recomendacoes", title: "Recomendações de ajuste", anchor: "recomendacoes", order: 6 },
          { id: "conclusao", title: "Conclusão", anchor: "conclusao", order: 7 },
          { id: "ressalvas", title: "Ressalvas e revisão humana", anchor: "ressalvas", order: 8 },
          { id: "encaminhamento", title: "Encaminhamento executivo", anchor: "encaminhamento", order: 9 },
          { id: "cobertura", title: "Matriz de cobertura do parecer", anchor: "cobertura", order: 10 },
        ];
  return `<nav class="toc-nav" aria-label="Sumário do parecer">
    <h2>Menu do parecer</h2>
    <ul>
      ${fallbackItems
        .sort((a, b) => a.order - b.order)
        .map(
          (item) =>
            `<li><a href="#${escapeHtml(item.anchor)}" data-anchor="${escapeHtml(item.anchor)}">${escapeHtml(item.title)}</a></li>`
        )
        .join("")}
    </ul>
  </nav>`;
}

function renderSectionHeading(index: string, title: string, description?: string) {
  return `<div class="section-heading">
    <span class="section-index">${escapeHtml(index)}</span>
    <div>
      <h2>${escapeHtml(title)}</h2>
      ${description ? `<p class="muted">${escapeHtml(description)}</p>` : ""}
    </div>
  </div>`;
}

function buildJ360BaseHtml(params: {
  payload: RunAtivoReportingInput;
  report: J360LegalReport;
  title: string;
  mode: "landing" | "pdf";
}) {
  const { payload, report, title, mode } = params;
  const pdfMode = mode === "pdf";
  const recipeOrchestrationSection = renderRecipeOrchestrationHtmlSection({
    payload,
    escapeHtml,
    tone: "light",
  });
  const technicalAppendix = recipeOrchestrationSection
    ? `<section id="apendice-tecnico" class="card technical-appendix">
          ${renderSectionHeading(
            "Apêndice",
            "Apêndice técnico — Recipe_Orchestrator",
            "Bloco técnico separado do corpo principal do parecer, mantido apenas para rastreabilidade operacional da plataforma."
          )}
          ${recipeOrchestrationSection}
        </section>`
    : "";
  const decisionTone =
    report.legalDecision === "APROVADO_BAIXO_RISCO"
      ? "#10b981"
      : report.legalDecision === "APROVADO_COM_RESSALVAS"
      ? "#f59e0b"
      : "#ef4444";
  const documentAnalyzed =
    report.documentIdentity.documentName ??
    report.riskMatrix[0]?.evidenceRefs[0]?.document ??
    report.header.assunto ??
    "não informado";
  const workspaceName = report.workspaceBrand.name ?? payload.metadata.workspaceId;
  const generatedAt = report.documentIdentity.generatedAt ?? null;
  const reportVersion = report.documentIdentity.reportVersion ?? "v1";
  const documentTitle = report.header.assunto ?? report.analysisScope;
  const brandPrimary = safeColor(report.workspaceBrand.primaryColor, "#1d4ed8");
  const brandAccent = safeColor(report.workspaceBrand.accentColor, "#0f172a");
  const tableOfContents = renderTableOfContents(report);
  const landingSummaryCards = !pdfMode
    ? `<section class="landing-summary-grid">
        <article class="summary-card">
          <span class="summary-label">Decisão preliminar</span>
          <strong>${escapeHtml(formatLegalDecision(report.legalDecision))}</strong>
        </article>
        <article class="summary-card">
          <span class="summary-label">Risco consolidado</span>
          <strong>${escapeHtml(report.riskLevel)}</strong>
        </article>
        <article class="summary-card">
          <span class="summary-label">Revisão humana</span>
          <strong>${report.manualReviewRequired ? "recomendada" : "não obrigatória"}</strong>
        </article>
        <article class="summary-card">
          <span class="summary-label">Próxima ação</span>
          <strong>${escapeHtml(report.nextBestImplementationAction ?? "não informada")}</strong>
        </article>
      </section>`
    : "";

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(title)}</title>
      <style>
        :root { color-scheme: light; font-family: ${pdfMode ? `"Times New Roman", Times, serif` : `"Inter", system-ui, sans-serif`}; }
        @page { size: A4; margin: 3cm 2cm 2cm 3cm; }
        body { margin: 0; background: ${pdfMode ? "#ffffff" : "#f8fafc"}; color: #0f172a; font-size: ${pdfMode ? "12pt" : "16px"}; }
        header.hero { padding: ${pdfMode ? "20px 0 16px" : "28px 16px"}; background: #ffffff; border-bottom: 3px solid ${brandPrimary}; }
        main { max-width: ${pdfMode ? "none" : "1120px"}; margin: 0 auto; padding: ${pdfMode ? "14px 0 22px" : "28px 16px 48px"}; display: grid; gap: ${pdfMode ? "14px" : "20px"}; }
        .hero-shell { max-width: ${pdfMode ? "none" : "1120px"}; margin: 0 auto; display: grid; gap: 12px; }
        .landing-shell { max-width: 1120px; margin: 0 auto; display: grid; gap: 20px; }
        .landing-content { display: grid; gap: 20px; }
        .landing-summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .summary-card { background: #ffffff; border: 1px solid #dbe3ee; border-top: 3px solid ${brandPrimary}; border-radius: 16px; padding: 16px; box-shadow: 0 12px 30px rgba(15,23,42,.06); }
        .summary-label { display: block; font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
        .toc-nav { background: #ffffff; border: 1px solid #dbe3ee; border-top: 3px solid ${brandPrimary}; border-radius: 18px; padding: 18px; box-shadow: 0 16px 40px rgba(15,23,42,.08); }
        .toc-nav h2 { font-size: 0.95rem; margin: 0 0 12px; }
        .toc-nav ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
        .toc-nav li { margin: 0; }
        .toc-nav a { display: block; text-decoration: none; color: ${brandAccent}; font-size: 0.92rem; padding: 8px 10px; border-radius: 999px; border: 1px solid #dbe3ee; background: #f8fafc; transition: background .15s ease, color .15s ease, border-color .15s ease; }
        .toc-nav a:hover { background: #eff6ff; color: ${brandPrimary}; border-color: ${brandPrimary}; }
        .toc-nav a.is-active { background: ${brandPrimary}; color: #ffffff; border-color: ${brandPrimary}; }
        .eyebrow { text-transform: uppercase; letter-spacing: 0.22em; font-size: 0.72rem; color: #64748b; margin: 0 0 10px; }
        h1 { margin: 0; font-size: ${pdfMode ? "18pt" : "clamp(1.6rem, 3vw, 2.1rem)"}; color: #0f172a; }
        h2 { margin: 0 0 12px; font-size: ${pdfMode ? "14pt" : "1.05rem"}; color: #0f172a; }
        h3 { margin: 0 0 10px; font-size: ${pdfMode ? "12pt" : "1rem"}; }
        p, li, td, th, small { line-height: 1.5; }
        .hero-grid, .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .card { background: #ffffff; border: 1px solid #dbe3ee; border-radius: ${pdfMode ? "0" : "18px"}; padding: ${pdfMode ? "16px 18px" : "18px"}; box-shadow: ${pdfMode ? "none" : "0 16px 40px rgba(15,23,42,.08)"}; break-inside: avoid-page; }
        .decision { border-left: 4px solid ${decisionTone}; }
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: ${pdfMode ? "3px 8px" : "6px 12px"}; border-radius: ${pdfMode ? "4px" : "999px"}; border: 1px solid #dbe3ee; font-size: ${pdfMode ? "10pt" : "0.8rem"}; background: #f8fafc; }
        .pill-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
        .grid-2 { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
        .grid-3 { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        ul { margin: 0; padding-left: ${pdfMode ? "1.25cm" : "18px"}; }
        table { width: 100%; border-collapse: collapse; font-size: ${pdfMode ? "10.5pt" : "0.92rem"}; }
        th, td { border: 1px solid #dbe3ee; padding: 10px; text-align: left; vertical-align: top; }
        th { background: ${pdfMode ? "#f8fafc" : "#eff6ff"}; }
        .muted { color: #475569; }
        .formal-lead { font-size: ${pdfMode ? "12pt" : "1.02rem"}; color: #0f172a; margin: 0; text-align: ${pdfMode ? "justify" : "left"}; }
        .foundation-item { padding: 16px 0; border-top: 1px solid #e2e8f0; }
        .foundation-item:first-child { border-top: 0; padding-top: 0; }
        .refs-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); margin: 14px 0; }
        .doc-table th { width: 190px; }
        .section-heading { display: grid; gap: 12px; grid-template-columns: auto 1fr; align-items: start; margin-bottom: 14px; }
        .section-heading p { margin: 0; }
        .section-index { display: inline-flex; min-width: ${pdfMode ? "44px" : "40px"}; height: ${pdfMode ? "32px" : "40px"}; align-items: center; justify-content: center; border-radius: ${pdfMode ? "0" : "12px"}; border: 1px solid ${brandPrimary}; background: ${pdfMode ? "#ffffff" : "#eff6ff"}; color: ${brandPrimary}; font-size: ${pdfMode ? "10.5pt" : "0.82rem"}; font-weight: 700; letter-spacing: 0.08em; }
        .formal-note { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: ${pdfMode ? "0" : "14px"}; padding: 14px; }
        .footer-note { font-size: ${pdfMode ? "10pt" : "0.78rem"}; color: #64748b; display: flex; flex-wrap: wrap; gap: 12px; }
        .workspace-banner { display: flex; align-items: center; gap: 14px; }
        .workspace-logo { max-height: 44px; max-width: 160px; object-fit: contain; }
        .abnt-meta { font-size: 10pt; color: #475569; display: grid; gap: 2px; }
        .abnt-text p { margin: 0 0 10px; text-align: justify; text-indent: ${pdfMode ? "1.25cm" : "0"}; }
        .evidence-details { margin-top: 8px; border: 1px solid #dbe3ee; border-radius: 12px; background: #f8fafc; overflow: hidden; }
        .evidence-details summary { cursor: pointer; list-style: none; padding: 10px 12px; font-weight: 600; color: ${brandAccent}; }
        .evidence-details summary::-webkit-details-marker { display: none; }
        .evidence-list { margin: 0; padding: 0 16px 12px 32px; }
        .evidence-empty { margin-top: 8px; color: #64748b; font-size: 0.9rem; }
        .pdf-footer { display: ${pdfMode ? "flex" : "none"}; justify-content: space-between; gap: 12px; font-size: 10pt; color: #475569; border-top: 1px solid #cbd5e1; padding-top: 10px; margin-top: 8px; }
        .technical-appendix { border-style: dashed; border-color: #cbd5e1; background: ${pdfMode ? "#ffffff" : "#f8fafc"}; }
        .technical-appendix .section-index { border-style: dashed; }
        .back-to-top { ${pdfMode ? "display:none;" : "display:inline-flex;"} align-items: center; justify-content: center; position: fixed; right: 20px; bottom: 20px; z-index: 10; padding: 12px 14px; border-radius: 999px; background: ${brandPrimary}; color: #ffffff; text-decoration: none; box-shadow: 0 12px 24px rgba(15,23,42,.18); font-size: 0.88rem; }
        @media (max-width: 720px) {
          main { padding: 20px 12px 36px; }
          header.hero { padding: 20px 12px; }
          th, td { font-size: 0.84rem; }
          .section-heading { grid-template-columns: 1fr; }
          .toc-nav ul { display: grid; grid-template-columns: 1fr; }
          .toc-nav a { border-radius: 12px; }
        }
        @media print {
          body { background: #fff; color: #000; }
          .card { box-shadow: none; break-inside: avoid; }
          header.hero { background: transparent; }
          .footer-note { display: none; }
          .back-to-top { display: none; }
        }
      </style>
    </head>
    <body id="topo">
      <header class="hero">
        <div class="hero-shell">
          <div class="workspace-banner">
            ${report.workspaceBrand.logoUrl ? `<img src="${escapeHtml(report.workspaceBrand.logoUrl)}" alt="${escapeHtml(workspaceName)}" class="workspace-logo" />` : ""}
            <div class="abnt-meta">
              <strong>${escapeHtml(workspaceName)}</strong>
              <span>${escapeHtml(documentAnalyzed)}</span>
              ${generatedAt ? `<span>Gerado em ${escapeHtml(generatedAt)}</span>` : ""}
            </div>
          </div>
          <div>
            <p class="eyebrow">Parecer Jurídico Trabalhista</p>
            <h1>${escapeHtml(documentTitle)}</h1>
            <small class="muted">${
              pdfMode
                ? "Parecer preliminar estruturado em formato documental, pronto para impressão e arquivo."
                : "Análise preliminar estruturada para revisão interna assistida."
            }</small>
          </div>
        </div>
      </header>
      <main>
        ${
          pdfMode
            ? ""
            : `<div class="landing-shell">
                ${tableOfContents}
                <div class="landing-content">
                  ${landingSummaryCards}`
        }
        <section id="identificacao" class="card decision">
          ${renderSectionHeading("00", "Identificação do parecer", "Peça preliminar estruturada com base no documento anexado e no briefing jurídico da recipe.")}
          <table class="doc-table">
            <tbody>
              ${renderFormalHeader(report)}
              <tr><th>Documento analisado</th><td>${escapeHtml(documentAnalyzed)}</td></tr>
              <tr><th>Run ID</th><td>${escapeHtml(payload.metadata.runId ?? "não informado")}</td></tr>
              <tr><th>Agente</th><td>${escapeHtml(payload.metadata.agente)}</td></tr>
              <tr><th>Versão do relatório</th><td>${escapeHtml(reportVersion)}</td></tr>
            </tbody>
          </table>
        </section>

        <section id="ementa" class="card">
          ${renderSectionHeading("01", "Ementa")}
          <p class="formal-lead">${escapeHtml(report.ementa ?? report.summary)}</p>
        </section>

        <section id="relatorio" class="card">
          ${renderSectionHeading("I", "Relatório", "Contexto da consulta, documento analisado e premissas gerais do parecer.")}
          <div class="abnt-text"><p>${escapeHtml(report.relatorioFactual ?? report.summary)}</p></div>
        </section>

        <section id="fundamentacao" class="card">
          ${renderSectionHeading("II", "Fundamentação", "Análise jurídica por tópico, com base legal e amarração documental por evidência.")}
          ${renderFundamentos(report)}
        </section>

        <section id="referencias" class="card">
          ${renderSectionHeading("III", "Referências jurídicas consolidadas")}
          <div class="grid-3">
            <div>
              <small class="muted">CLT</small>
              <div class="pill-row">${renderReferencePills(report.references.cltRefs)}</div>
            </div>
            <div>
              <small class="muted">Súmulas TST</small>
              <div class="pill-row">${renderReferencePills(report.references.tstRefs)}</div>
            </div>
            <div>
              <small class="muted">OJs</small>
              <div class="pill-row">${renderReferencePills(report.references.ojRefs)}</div>
            </div>
          </div>
        </section>

        <section id="riscos" class="card">
          ${renderSectionHeading("IV", "Matriz de riscos", "Síntese dos riscos jurídicos, impacto possível, mitigação e evidência documental associada.")}
          <table>
            <thead>
              <tr>
                <th>Risco identificado</th>
                <th>Severidade</th>
                <th>Impacto possível</th>
                <th>Mitigação recomendada</th>
                <th>Evidência referenciada</th>
              </tr>
            </thead>
            <tbody>${renderRiskMatrix(report)}</tbody>
          </table>
        </section>

        <div class="grid-2">
          <section id="recomendacoes" class="card">
            ${renderSectionHeading("V", "Recomendações de ajuste")}
            <ul>${renderList(report.recommendedAdjustments, "Nenhum ajuste estruturado foi reportado.")}</ul>
          </section>
          <section class="card">
            ${renderSectionHeading("V.A", "Pontos de atenção jurídicos")}
            <ul>${renderList(report.attentionPoints, "Nenhum ponto de atenção estruturado foi reportado.")}</ul>
          </section>
        </div>

        <div class="grid-2">
          <section class="card">
            ${renderSectionHeading("V.B", "Inconsistências ou ambiguidades")}
            <ul>${renderList(report.ambiguities, "Nenhuma ambiguidade estruturada foi reportada.")}</ul>
          </section>
          <section class="card">
            ${renderSectionHeading("V.C", "Pontos fortes")}
            <ul>${renderList(report.strengths, "Nenhum ponto forte estruturado foi reportado.")}</ul>
          </section>
        </div>

        <section id="conclusao" class="card decision">
          ${renderSectionHeading("VI", "Conclusão", "Fecho preliminar da análise jurídica com a decisão consolidada do agente.")}
          <div class="summary-grid">
            <div><small class="muted">Decisão preliminar</small><p>${escapeHtml(formatLegalDecision(report.legalDecision))}</p></div>
            <div><small class="muted">Próxima melhor ação</small><p>${escapeHtml(report.nextBestImplementationAction ?? "não informada")}</p></div>
            <div><small class="muted">Escopo</small><p>${escapeHtml(report.analysisScope)}</p></div>
            <div><small class="muted">Revisão jurídica humana</small><p>${report.manualReviewRequired ? "recomendada" : "não obrigatória"}</p></div>
          </div>
          <div class="abnt-text"><p>${escapeHtml(report.conclusaoFormal ?? report.summary)}</p></div>
        </section>

        <div class="grid-2">
          <section id="ressalvas" class="card">
            ${renderSectionHeading("VII", "Ressalvas e revisão humana")}
            <div class="formal-note">
              <p>Este parecer é preliminar, automatizado e assistido por evidência documental anexada. Não substitui parecer final assinado nem dispensa revisão humana quando houver risco material, ambiguidade relevante ou validação final da redação.</p>
            </div>
            <ul style="margin-top:14px;">${renderList(
              report.executiveGuidance.dependsOnHumanReview,
              report.manualReviewRequired
                ? "A revisão jurídica humana final continua recomendada."
                : "Nenhuma dependência humana adicional foi estruturada."
            )}</ul>
          </section>
          <section class="card">
            ${renderSectionHeading("VII.A", "Evidências/documentos complementares")}
            <ul>${renderList(report.recommendedEvidence, "Nenhuma evidência complementar foi estruturada.")}</ul>
          </section>
        </div>

        <div class="grid-2">
          <section class="card">
            ${renderSectionHeading("VII.B", "Perguntas para validação humana")}
            <ul>${renderList(report.humanValidationQuestions, "Nenhuma pergunta adicional foi estruturada.")}</ul>
          </section>
          <section id="encaminhamento" class="card">
            ${renderSectionHeading("VIII", "Encaminhamento executivo", "Providências objetivas para ajuste da minuta, rerun e decisão de uso interno.")}
            <div class="grid-2">
              <div>
                <small class="muted">O que ajustar agora</small>
                ${renderExecutiveList(
                  report.executiveGuidance.adjustNow,
                  "Nenhum ajuste executivo adicional foi estruturado."
                )}
              </div>
              <div>
                <small class="muted">Quando o documento pode voltar para rerun</small>
                ${renderExecutiveList(
                  report.executiveGuidance.rerunWhen,
                  "Após incorporar os ajustes sensíveis e consolidar a nova versão da minuta."
                )}
              </div>
            </div>
            <div class="grid-2" style="margin-top:16px;">
              <div>
                <small class="muted">O que ainda depende de advogado humano</small>
                ${renderExecutiveList(
                  report.executiveGuidance.dependsOnHumanReview,
                  report.manualReviewRequired
                    ? "A revisão jurídica humana final continua recomendada."
                    : "Nenhuma dependência humana adicional foi estruturada."
                )}
              </div>
              <div>
                <small class="muted">Quando pode seguir para uso interno</small>
                ${renderExecutiveList(
                  report.executiveGuidance.readyForInternalUseWhen,
                  "Quando a redação final estiver validada e coerente com a prática operacional."
                )}
              </div>
            </div>
          </section>
        </div>

        <section id="cobertura" class="card">
          ${renderSectionHeading("IX", "Matriz de cobertura do parecer", "Explicação da plataforma sobre o que a recipe jurídica pediu, o que o run respondeu e o que ainda depende de revisão jurídica humana.")}
          ${
            report.nextBestImplementationAction
              ? `<p><strong>Próxima melhor ação:</strong> ${escapeHtml(report.nextBestImplementationAction)}</p>`
              : ""
          }
          <ul>${renderList(report.howToProceedNow, "Revisar o documento, ajustar os pontos sensíveis e rerodar a análise.")}</ul>
          <table>
            <thead>
              <tr>
                <th>O que o parecer pede</th>
                <th>O que o run respondeu</th>
                <th>O que ainda depende de revisão manual/jurídica</th>
              </tr>
            </thead>
            <tbody>${renderCoverageMatrix(report)}</tbody>
          </table>
        </section>
        ${technicalAppendix}
        <div class="footer-note">
          <span>Run ID: ${escapeHtml(payload.metadata.runId ?? "não informado")}</span>
          <span>Agente: ${escapeHtml(payload.metadata.agente)}</span>
          <span>Documento: ${escapeHtml(documentAnalyzed)}</span>
        </div>
        ${pdfMode ? `<div class="pdf-footer"><span>${escapeHtml(workspaceName)} · Parecer ${escapeHtml(reportVersion)}</span><span>Run ID: ${escapeHtml(payload.metadata.runId ?? "não informado")}</span><span>Documento: ${escapeHtml(documentAnalyzed)}</span></div>` : ""}
        ${pdfMode ? "" : `</div></div>`}
      </main>
      ${pdfMode ? "" : `<a class="back-to-top" href="#topo">Voltar ao topo</a>
      <script>
        const navLinks = Array.from(document.querySelectorAll('.toc-nav a[data-anchor]'));
        const sections = navLinks
          .map((link) => document.getElementById(link.getAttribute('data-anchor')))
          .filter(Boolean);
        const activateLink = () => {
          const scrollY = window.scrollY + 120;
          let activeId = 'identificacao';
          for (const section of sections) {
            if (section.offsetTop <= scrollY) activeId = section.id;
          }
          navLinks.forEach((link) => {
            link.classList.toggle('is-active', link.getAttribute('data-anchor') === activeId);
          });
        };
        activateLink();
        window.addEventListener('scroll', activateLink, { passive: true });
      </script>`}
    </body>
  </html>`;
}

export function buildJ360LandingPageHtml(payload: RunAtivoReportingInput) {
  const report = extractJ360LegalReport(payload);
  if (!report) return "";
  return buildJ360BaseHtml({
    payload,
    report,
    title: "EIAH J_360 — Parecer Jurídico Preliminar",
    mode: "landing",
  });
}

export function buildJ360PdfHtml(payload: RunAtivoReportingInput) {
  const report = extractJ360LegalReport(payload);
  if (!report) return "";
  return buildJ360BaseHtml({
    payload,
    report,
    title: "PDF — EIAH J_360 — Parecer Jurídico Preliminar",
    mode: "pdf",
  });
}
