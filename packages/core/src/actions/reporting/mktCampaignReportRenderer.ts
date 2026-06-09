import type { RunAtivoReportingInput } from "./runAtivoSchema";
import { MktCampaignReportSchema, type MktCampaignReport } from "./mktCampaignReportSchema";

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

export function extractMktCampaignReport(payload: RunAtivoReportingInput): MktCampaignReport | null {
  const raw = isPlainObject(payload.metadata) ? payload.metadata.mktCampaignReport : null;
  const parsed = MktCampaignReportSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function shouldUseMktCampaignRenderer(payload: RunAtivoReportingInput) {
  const agent = payload.metadata.agente.trim().toLowerCase();
  const report = extractMktCampaignReport(payload);
  const orchestration = isPlainObject(payload.metadata.recipeOrchestration)
    ? (payload.metadata.recipeOrchestration as PlainObject)
    : null;
  const intent = typeof orchestration?.intent === "string" ? orchestration.intent : null;
  const domain = typeof orchestration?.domain === "string" ? orchestration.domain : null;
  if (!report) return false;
  return agent === "mkt" && (!intent || intent === "marketing_campaign" || domain === "marketing");
}

function renderList(items: string[], empty: string) {
  if (items.length === 0) return `<li>${escapeHtml(empty)}</li>`;
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
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

function humanizeChannel(channel: string) {
  switch (channel) {
    case "linkedin":
      return "LinkedIn";
    case "email":
      return "E-mail";
    case "whatsapp":
      return "WhatsApp";
    case "partnerships":
      return "Parcerias";
    case "events":
      return "Eventos";
    case "communities":
      return "Comunidades";
    case "blog_seo":
      return "Blog / SEO";
    case "paid_media":
      return "Paid media";
    case "social":
      return "Social";
    default:
      return channel;
  }
}

function dedupeStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))
  );
}

function deriveExecutiveMetrics(report: MktCampaignReport) {
  const leadMetric =
    report.kpis.find((item) => /lead|mql/i.test(item.name)) ??
    report.kpis.find((item) => /lead|mql/i.test(item.target));
  const meetingMetric =
    report.kpis.find((item) => /reuni|demo|agend/i.test(item.name)) ??
    report.kpis.find((item) => /reuni|demo|agend/i.test(item.target));
  const areas = report.valuePropositionByArea.length || dedupeStrings(report.icp.map((item) => item.cluster ?? null)).length;
  const channels = dedupeStrings(report.priorityChannels.map(humanizeChannel)).length;
  const complianceCount = report.complianceFlags.length;

  return [
    {
      value: leadMetric?.target ?? "Definir",
      label: leadMetric?.name ?? "Meta principal",
    },
    {
      value: String(areas || 0),
      label: "Áreas prioritárias",
    },
    {
      value: String(channels || 0),
      label: "Canais ativos",
    },
    {
      value: meetingMetric?.target ?? report.riskLevel,
      label: meetingMetric?.name ?? "Risco consolidado",
    },
    {
      value: String(complianceCount),
      label: "Flags de compliance",
    },
  ];
}

function renderExecutiveMetrics(report: MktCampaignReport) {
  const metrics = deriveExecutiveMetrics(report);
  return `<section class="metric-grid">
    ${metrics
      .map(
        (item) => `<article class="metric-card">
          <strong>${escapeHtml(item.value)}</strong>
          <span>${escapeHtml(item.label)}</span>
        </article>`
      )
      .join("")}
  </section>`;
}

function renderMetaStrip(payload: RunAtivoReportingInput, report: MktCampaignReport) {
  const items = [
    { label: "run", value: String(payload.metadata.runId ?? "não informado") },
    { label: "versão", value: report.documentIdentity.reportVersion },
    { label: "riskLevel", value: report.riskLevel },
    { label: "compliance", value: report.complianceFlags.join(", ") || "sem flags" },
  ];
  return `<section class="meta-strip">
    ${items
      .map(
        (item) => `<div class="meta-pill">
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.value)}</strong>
        </div>`
      )
      .join("")}
  </section>`;
}

function renderToc(report: MktCampaignReport) {
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
          { id: "resumo", title: "Resumo executivo", anchor: "resumo", order: 0 },
          { id: "metricas", title: "Métricas-chave", anchor: "metricas", order: 1 },
          { id: "posicionamento", title: "Posicionamento", anchor: "posicionamento", order: 2 },
          { id: "icp", title: "Público-alvo / ICP", anchor: "icp", order: 3 },
          { id: "compliance", title: "Compliance", anchor: "compliance", order: 4 },
          { id: "proposta-valor", title: "Proposta de valor por área", anchor: "proposta-valor", order: 5 },
          { id: "canais", title: "Canais prioritários", anchor: "canais", order: 6 },
          { id: "cadencia", title: "Cadência outbound", anchor: "cadencia", order: 7 },
          { id: "cronograma", title: "Cronograma", anchor: "cronograma", order: 8 },
          { id: "assets", title: "Assets necessários", anchor: "assets", order: 9 },
          { id: "kpis", title: "Dashboard de KPIs", anchor: "kpis", order: 10 },
          { id: "templates", title: "Templates de cold e-mail", anchor: "templates", order: 11 },
          { id: "follow-up", title: "Plano de follow-up", anchor: "follow-up", order: 12 },
          { id: "priorizacao", title: "Priorização 30/60/90 dias", anchor: "priorizacao", order: 13 },
          { id: "checklist", title: "Checklist de lançamento", anchor: "checklist", order: 14 },
          { id: "proximos-passos", title: "Próximos passos", anchor: "proximos-passos", order: 15 },
        ];
  return `<nav class="toc-nav" aria-label="Menu da campanha">
    <h2>Menu da campanha</h2>
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

function renderSummaryCards(report: MktCampaignReport) {
  return `<section class="summary-grid">
    <article class="summary-card">
      <span class="summary-label">Objetivo</span>
      <strong>${escapeHtml(report.objective)}</strong>
    </article>
    <article class="summary-card">
      <span class="summary-label">Canais prioritários</span>
      <strong>${escapeHtml(dedupeStrings(report.priorityChannels.map(humanizeChannel)).join(", ") || "não informados")}</strong>
    </article>
    <article class="summary-card">
      <span class="summary-label">Risco</span>
      <strong>${escapeHtml(report.riskLevel)}</strong>
    </article>
    <article class="summary-card">
      <span class="summary-label">Compliance</span>
      <strong>${escapeHtml(report.complianceFlags.join(", ") || "sem flags")}</strong>
    </article>
    <article class="summary-card">
      <span class="summary-label">Próxima ação</span>
      <strong>${escapeHtml(report.nextActions[0] ?? "não informada")}</strong>
    </article>
  </section>`;
}

function renderChannelPlans(report: MktCampaignReport) {
  if (report.channelPlans.length === 0) {
    return `<article class="card"><p>Nenhum plano por canal foi estruturado.</p></article>`;
  }
  return report.channelPlans
    .map(
      (channel) => `<article class="card channel-card">
        <h3>${escapeHtml(channel.label)}</h3>
        <p><strong>Objetivo:</strong> ${escapeHtml(channel.objective)}</p>
        <p><strong>Abordagem:</strong> ${escapeHtml(channel.approach)}</p>
        <p><strong>Foco de conteúdo:</strong> ${escapeHtml(channel.contentFocus.join(", ") || "não informado")}</p>
        ${channel.targetMetric ? `<p><strong>Métrica alvo:</strong> ${escapeHtml(channel.targetMetric)}</p>` : ""}
        ${channel.targetMetricValue ? `<p><strong>Meta numérica:</strong> ${escapeHtml(channel.targetMetricValue)}</p>` : ""}
        ${channel.cadence ? `<p><strong>Cadência:</strong> ${escapeHtml(channel.cadence)}</p>` : ""}
      </article>`
    )
    .join("");
}

function renderOutboundCadence(report: MktCampaignReport) {
  if (report.outboundCadence.length === 0) {
    return `<tr><td colspan="5">Nenhuma cadência outbound estruturada foi reportada.</td></tr>`;
  }
  return report.outboundCadence
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.step)}</td>
        <td>D+${escapeHtml(item.dayOffset)}</td>
        <td>${escapeHtml(item.channel)}</td>
        <td>${escapeHtml(item.action)}</td>
        <td>${escapeHtml(item.goal)}</td>
      </tr>`
    )
    .join("");
}

function renderTimeline(report: MktCampaignReport) {
  if (report.timeline.length === 0) {
    return `<tr><td colspan="4">Nenhum cronograma estruturado foi reportado.</td></tr>`;
  }
  return report.timeline
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.period)}</td>
        <td>${escapeHtml(item.activity)}</td>
        <td>${escapeHtml(item.description)}</td>
        <td>${escapeHtml(item.owner ?? "a definir")}</td>
      </tr>`
    )
    .join("");
}

function renderKpis(report: MktCampaignReport) {
  if (report.kpis.length === 0) return `<li>Nenhum KPI estruturado foi reportado.</li>`;
  return report.kpis
    .map(
      (item) =>
        `<li><strong>${escapeHtml(item.name)}</strong>: ${escapeHtml(item.target)}${
          item.notes ? ` — ${escapeHtml(item.notes)}` : ""
        }</li>`
    )
    .join("");
}

function renderQualificationCriteria(report: MktCampaignReport) {
  if (report.qualificationCriteria.length === 0) return `<article class="card"><p>Nenhum critério de qualificação estruturado.</p></article>`;
  return report.qualificationCriteria
    .map(
      (item) => `<article class="card">
        <h3>${escapeHtml(item.category)}</h3>
        <ul>${renderList(item.criteria, "Nenhum critério informado.")}</ul>
      </article>`
    )
    .join("");
}

function renderPrioritizationPlan(report: MktCampaignReport) {
  if (report.prioritizationPlan.length === 0) {
    return `<article class="card"><p>Nenhum plano 30/60/90 estruturado foi reportado.</p></article>`;
  }
  return report.prioritizationPlan
    .map(
      (item) => `<article class="card">
        <h3>${escapeHtml(item.horizonDays)} dias</h3>
        <p><strong>Foco:</strong> ${escapeHtml(item.focus)}</p>
        <p><strong>Resultado esperado:</strong> ${escapeHtml(item.expectedOutcome)}</p>
        <ul>${renderList(item.actions, "Nenhuma ação estruturada.")}</ul>
      </article>`
    )
    .join("");
}

function renderComplianceFlags(report: MktCampaignReport) {
  return `<div class="pill-row">${report.complianceFlags.map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("") || `<span class="pill">sem flags</span>`}</div>`;
}

function renderComplianceCallout(report: MktCampaignReport) {
  const restrictions = dedupeStrings([
    report.complianceFlags.includes("oab_publicidade")
      ? "Nenhuma copy deve prometer resultado garantido, redução de passivo garantida ou eliminação total de risco jurídico."
      : null,
    report.complianceFlags.includes("oab_publicidade")
      ? "Nenhuma mensagem deve sugerir captação indevida de clientes do advogado-alvo."
      : null,
    report.complianceFlags.includes("oab_publicidade")
      ? "Evitar comparação direta nominativa com concorrentes ou promessas incompatíveis com a publicidade profissional."
      : null,
    report.complianceFlags.includes("revisao_promessa_lgpd")
      ? "Toda promessa ligada a LGPD deve ser tratada como suporte ao processo de adequação, não como conformidade garantida."
      : null,
    ...report.valuePropositionByArea.map((item) => item.complianceNote),
    ...report.coldEmailTemplates.map((item) => item.complianceNote),
  ]);

  return `<div class="compliance-callout">
    <p><strong>complianceFlag:</strong> ${escapeHtml(report.complianceFlags.join(", ") || "sem flags")}</p>
    <p>Todo material de copy, e-mail, WhatsApp ou apresentação desta campanha deve passar por revisão humana antes da publicação quando houver restrição aplicável.</p>
    <p><strong>Restrições aplicadas:</strong></p>
    <ul>${renderList(restrictions, "Nenhuma restrição adicional estruturada.")}</ul>
  </div>`;
}

function renderValuePropositionByArea(report: MktCampaignReport) {
  if (report.valuePropositionByArea.length === 0) {
    return `<article class="card"><p>Nenhuma proposta de valor por área foi estruturada.</p></article>`;
  }
  return report.valuePropositionByArea
    .map(
      (item) => `<article class="card">
        <h3>${escapeHtml(item.legalArea)}</h3>
        <p><strong>Headline:</strong> ${escapeHtml(item.headline)}</p>
        <p><strong>Dor:</strong> ${escapeHtml(item.pain)}</p>
        <p><strong>Solução:</strong> ${escapeHtml(item.solution)}</p>
        <p><strong>CTA:</strong> ${escapeHtml(item.cta)}</p>
        ${item.complianceNote ? `<p><strong>Nota de compliance:</strong> ${escapeHtml(item.complianceNote)}</p>` : ""}
      </article>`
    )
    .join("");
}

function renderIcpScoring(report: MktCampaignReport) {
  const positive = renderList(report.icpScoring.positiveSignals, "Nenhum sinal positivo estruturado.");
  const negative = renderList(report.icpScoring.negativeSignals, "Nenhum sinal negativo estruturado.");
  const rows =
    report.icpScoring.scoreRules.length > 0
      ? report.icpScoring.scoreRules
          .map(
            (item) => `<tr>
              <td>${escapeHtml(item.criterion)}</td>
              <td>${escapeHtml(item.score > 0 ? `+${item.score}` : item.score)}</td>
              <td>${escapeHtml(item.note ?? "")}</td>
            </tr>`
          )
          .join("")
      : `<tr><td colspan="3">Nenhuma regra de score estruturada.</td></tr>`;
  return `<div class="channel-grid">
    <article class="card">
      <h3>Sinais positivos</h3>
      <ul>${positive}</ul>
    </article>
    <article class="card">
      <h3>Sinais negativos</h3>
      <ul>${negative}</ul>
    </article>
    <article class="card" style="grid-column: 1 / -1;">
      <h3>Tabela de pontuação ICP</h3>
      <p><strong>MQL:</strong> ${escapeHtml(report.icpScoring.mqlThreshold)} pontos · <strong>SQL:</strong> ${escapeHtml(report.icpScoring.sqlThreshold)} pontos</p>
      <table>
        <thead><tr><th>Critério</th><th>Pontuação</th><th>Observação</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </article>
  </div>`;
}

function renderColdEmailTemplates(report: MktCampaignReport) {
  if (report.coldEmailTemplates.length === 0) {
    return `<article class="card"><p>Nenhum template de cold e-mail estruturado.</p></article>`;
  }
  const grouped = new Map<string, MktCampaignReport["coldEmailTemplates"]>();
  for (const item of report.coldEmailTemplates) {
    const current = grouped.get(item.legalArea) ?? [];
    current.push(item);
    grouped.set(item.legalArea, current);
  }
  return Array.from(grouped.entries())
    .map(
      ([legalArea, templates]) => `<article class="card template-group">
        <h3>${escapeHtml(legalArea)}</h3>
        ${templates
          .map(
            (item) => `<div class="template-block">
              <p class="template-stage">${escapeHtml(item.stage)}</p>
              <p><strong>Assunto:</strong> ${escapeHtml(item.subject)}</p>
              <p>${escapeHtml(item.body)}</p>
              ${item.cta ? `<p><strong>CTA:</strong> ${escapeHtml(item.cta)}</p>` : ""}
              ${item.complianceNote ? `<p><strong>Nota de compliance:</strong> ${escapeHtml(item.complianceNote)}</p>` : ""}
            </div>`
          )
          .join("")}
      </article>`
    )
    .join("");
}

function renderLaunchChecklist(report: MktCampaignReport) {
  if (report.launchChecklist.length === 0) {
    return `<tr><td colspan="5">Nenhum checklist de lançamento estruturado foi reportado.</td></tr>`;
  }
  return report.launchChecklist
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.phase)}</td>
        <td>${escapeHtml(item.item)}</td>
        <td>${escapeHtml(item.owner ?? "a definir")}</td>
        <td>${escapeHtml(item.deadline ?? "a definir")}</td>
        <td>${escapeHtml(item.complianceFlag ?? "—")}</td>
      </tr>`
    )
    .join("");
}

function renderKpiDashboard(report: MktCampaignReport) {
  if (report.kpis.length === 0) {
    return `<tr><td colspan="3">Nenhum KPI estruturado foi reportado.</td></tr>`;
  }
  return report.kpis
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.channel ? humanizeChannel(item.channel) : "Geral")}</td>
        <td>${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.target)}</td>
      </tr>`
    )
    .join("");
}

function buildBaseHtml(params: {
  payload: RunAtivoReportingInput;
  report: MktCampaignReport;
  title: string;
  mode: "landing" | "pdf";
}) {
  const { payload, report, title, mode } = params;
  const pdfMode = mode === "pdf";
  const brandPrimary = safeColor(report.workspaceBrand.primaryColor, "#0f766e");
  const brandAccent = safeColor(report.workspaceBrand.accentColor, "#0f172a");
  const workspaceName = report.workspaceBrand.name ?? payload.metadata.workspaceId;
  const generatedAt = report.documentIdentity.generatedAt ?? null;
  const logoMarkup = report.workspaceBrand.logoUrl
    ? `<img src="${escapeHtml(report.workspaceBrand.logoUrl)}" alt="${escapeHtml(workspaceName ?? "Workspace")}" class="brand-logo" />`
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
        .brand-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
        .brand-logo { width: auto; height: 36px; max-width: 180px; object-fit: contain; }
        .eyebrow { text-transform: uppercase; letter-spacing: 0.22em; font-size: 0.72rem; color: #64748b; margin: 0 0 10px; }
        h1 { margin: 0; font-size: ${pdfMode ? "18pt" : "clamp(1.6rem, 3vw, 2.1rem)"}; color: #0f172a; }
        h2 { margin: 0 0 12px; font-size: ${pdfMode ? "14pt" : "1.05rem"}; color: #0f172a; }
        h3 { margin: 0 0 10px; font-size: ${pdfMode ? "12pt" : "1rem"}; }
        p, li, td, th, small { line-height: ${pdfMode ? "1.5" : "1.55"}; }
        .summary-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .summary-card { background: #ffffff; border: 1px solid #dbe3ee; border-top: 3px solid ${brandPrimary}; border-radius: ${pdfMode ? "0" : "16px"}; padding: 16px; box-shadow: ${pdfMode ? "none" : "0 12px 30px rgba(15,23,42,.06)"}; }
        .metric-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        .metric-card { background: #fbfbfa; border: 1px solid #ece7df; border-radius: ${pdfMode ? "0" : "16px"}; padding: 18px 16px; text-align: center; }
        .metric-card strong { display: block; font-size: ${pdfMode ? "18pt" : "2rem"}; line-height: 1; margin-bottom: 10px; }
        .metric-card span { color: #64748b; font-size: 0.95rem; }
        .meta-strip { display: grid; gap: 0; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); overflow: hidden; border-radius: ${pdfMode ? "0" : "14px"}; border: 1px solid #e5e7eb; }
        .meta-pill { background: #f8fafc; padding: 12px 14px; border-right: 1px solid #e5e7eb; }
        .meta-pill:nth-child(1) { background: #eef2ff; }
        .meta-pill:nth-child(2) { background: #fafaf9; }
        .meta-pill:nth-child(3) { background: #ecfdf5; }
        .meta-pill:nth-child(4) { background: #fff7ed; border-right: 0; }
        .meta-pill span { display: block; font-size: 0.76rem; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin-bottom: 4px; }
        .meta-pill strong { font-size: 0.95rem; }
        .summary-label { display: block; font-size: 0.78rem; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b; margin-bottom: 8px; }
        .toc-nav { background: #ffffff; border: 1px solid #dbe3ee; border-top: 3px solid ${brandPrimary}; border-radius: ${pdfMode ? "0" : "18px"}; padding: 18px; box-shadow: ${pdfMode ? "none" : "0 16px 40px rgba(15,23,42,.08)"}; }
        .toc-nav h2 { font-size: 0.95rem; margin: 0 0 12px; }
        .toc-nav ul { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
        .toc-nav li { margin: 0; }
        .toc-nav a { display: block; text-decoration: none; color: ${brandAccent}; font-size: 0.92rem; padding: 8px 10px; border-radius: 999px; border: 1px solid #dbe3ee; background: #f8fafc; }
        .toc-nav a:hover, .toc-nav a.is-active { background: ${brandPrimary}; color: #ffffff; border-color: ${brandPrimary}; }
        .card { background: #ffffff; border: 1px solid #dbe3ee; border-radius: ${pdfMode ? "0" : "18px"}; padding: ${pdfMode ? "16px 18px" : "18px"}; box-shadow: ${pdfMode ? "none" : "0 16px 40px rgba(15,23,42,.08)"}; break-inside: avoid-page; }
        .section-heading { display: flex; gap: 14px; align-items: flex-start; margin-bottom: 12px; }
        .section-index { min-width: 38px; height: 38px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: ${brandPrimary}; color: #fff; font-weight: 700; font-size: 0.86rem; }
        .muted { color: #64748b; }
        .pill-row { display: flex; flex-wrap: wrap; gap: 8px; }
        .pill { display: inline-flex; padding: 6px 10px; border-radius: 999px; border: 1px solid #dbe3ee; background: #f8fafc; font-size: 0.82rem; }
        .compliance-callout { background: #fff6e5; border: 1px solid #f4d7a1; border-radius: ${pdfMode ? "0" : "16px"}; padding: 18px; }
        .channel-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .channel-card { border-top: 3px solid ${brandPrimary}; }
        .template-group { display: grid; gap: 14px; }
        .template-block { padding-top: 10px; border-top: 1px solid #e5e7eb; }
        .template-block:first-of-type { border-top: 0; padding-top: 0; }
        .template-stage { font-weight: 700; color: ${brandPrimary}; }
        table { width: 100%; border-collapse: collapse; }
        th, td { border: 1px solid #dbe3ee; padding: 10px; text-align: left; vertical-align: top; }
        th { background: #f8fafc; font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em; color: #334155; }
        .footer { border-top: 1px solid #dbe3ee; padding-top: 12px; color: #64748b; display: flex; justify-content: space-between; gap: 16px; font-size: 0.82rem; }
        .top-link { display: inline-flex; margin-top: 8px; text-decoration: none; color: ${brandPrimary}; font-weight: 600; }
        @media (max-width: 720px) {
          .summary-grid, .channel-grid { grid-template-columns: 1fr; }
          .section-heading { flex-direction: column; }
          .toc-nav ul { flex-direction: column; }
        }
      </style>
    </head>
    <body>
      <header class="hero">
        <div class="hero-shell">
          <div class="brand-header">${logoMarkup}<p class="eyebrow">${escapeHtml(workspaceName ?? "Workspace")} — MKT</p></div>
          <h1>${escapeHtml(report.campaignTitle ?? report.objective)}</h1>
          <p class="muted">${escapeHtml(report.campaignSummary)}</p>
          ${renderMetaStrip(payload, report)}
        </div>
      </header>
      <main id="topo">
        ${!pdfMode ? renderSummaryCards(report) : ""}
        ${!pdfMode ? renderToc(report) : ""}

        <section id="resumo" class="card">
          ${renderSectionHeading("01", "Resumo executivo", "Visão consolidada da campanha para execução comercial e de marketing.")}
          <p>${escapeHtml(report.campaignSummary)}</p>
        </section>

        <section id="metricas" class="card">
          ${renderSectionHeading("02", "Métricas-chave do plano", "Indicadores centrais para leitura rápida pela liderança e operação.")}
          ${renderExecutiveMetrics(report)}
        </section>

        <section id="posicionamento" class="card">
          ${renderSectionHeading("03", "Posicionamento", "Tese central, proposta de valor e chamada principal da campanha.")}
          <p><strong>Objetivo:</strong> ${escapeHtml(report.objective)}</p>
          ${report.positioning ? `<p><strong>Posicionamento:</strong> ${escapeHtml(report.positioning)}</p>` : ""}
          ${report.offer ? `<p><strong>Oferta:</strong> ${escapeHtml(report.offer)}</p>` : ""}
          ${report.coreMessage ? `<p><strong>Mensagem principal:</strong> ${escapeHtml(report.coreMessage)}</p>` : ""}
          ${report.cta ? `<p><strong>CTA:</strong> ${escapeHtml(report.cta)}</p>` : ""}
        </section>

        <section id="icp" class="card">
          ${renderSectionHeading("04", "Público-alvo / ICP", "Segmentos prioritários e perfis com maior aderência à campanha.")}
          <p><strong>Público principal:</strong> ${escapeHtml(report.audience.primary)}</p>
          <ul>${renderList(report.icp.map((item) => `${item.cluster ? `${item.cluster}: ` : ""}${item.label} — ${item.description}`), "Nenhum ICP estruturado.")}</ul>
          ${renderIcpScoring(report)}
        </section>

        <section id="compliance" class="card">
          ${renderSectionHeading("05", "Compliance", "Sinalizações obrigatórias para revisão interna antes da publicação.")}
          ${renderComplianceCallout(report)}
        </section>

        <section id="proposta-valor" class="card">
          ${renderSectionHeading("06", "Proposta de valor por área", "Mensagens por especialidade para adaptar campanha, outbound e demonstração.")}
          <div class="channel-grid">${renderValuePropositionByArea(report)}</div>
        </section>

        <section id="canais" class="card">
          ${renderSectionHeading("07", "Canais prioritários", "Canais e abordagens recomendadas para ativação da campanha.")}
          <div class="pill-row">${dedupeStrings(report.priorityChannels.map(humanizeChannel)).map((item) => `<span class="pill">${escapeHtml(item)}</span>`).join("") || `<span class="pill">não informado</span>`}</div>
          <div class="channel-grid">${renderChannelPlans(report)}</div>
        </section>

        <section id="cadencia" class="card">
          ${renderSectionHeading("08", "Cadência outbound", "Sequência recomendada para abrir, nutrir e converter conversas comerciais.")}
          <table>
            <thead><tr><th>Etapa</th><th>Quando</th><th>Canal</th><th>Ação</th><th>Objetivo</th></tr></thead>
            <tbody>${renderOutboundCadence(report)}</tbody>
          </table>
        </section>

        <section id="cronograma" class="card">
          ${renderSectionHeading("09", "Cronograma", "Fases sugeridas para preparação, ativação e otimização da campanha.")}
          <table>
            <thead><tr><th>Período</th><th>Atividade</th><th>Descrição</th><th>Responsável</th></tr></thead>
            <tbody>${renderTimeline(report)}</tbody>
          </table>
        </section>

        <section id="assets" class="card">
          ${renderSectionHeading("10", "Assets necessários", "Materiais mínimos para colocar a campanha em execução.")}
          <ul>${renderList(report.requiredAssets.map((item) => `${item.name} — ${item.objective}`), "Nenhum asset estruturado.")}</ul>
        </section>

        <section id="kpis" class="card">
          ${renderSectionHeading("11", "Dashboard de KPIs — 90 dias", "Métricas para acompanhar desempenho, qualificação e pipeline gerado.")}
          <table>
            <thead><tr><th>Canal</th><th>Métrica</th><th>Meta</th></tr></thead>
            <tbody>${renderKpiDashboard(report)}</tbody>
          </table>
          <ul>${renderKpis(report)}</ul>
        </section>

        <section id="templates" class="card">
          ${renderSectionHeading("12", "Templates de cold e-mail", "Templates iniciais por área para acelerar a primeira onda de outbound.")}
          <div class="channel-grid">${renderColdEmailTemplates(report)}</div>
        </section>

        <section id="follow-up" class="card">
          ${renderSectionHeading("13", "Plano de follow-up", "Rotina para responder sinais do pipeline e reciclar contas com disciplina.")}
          <div class="channel-grid">
            <article class="card">
              <h3>Follow-up operacional</h3>
              <ul>${renderList(report.followUpPlan, "Nenhum plano de follow-up estruturado.")}</ul>
            </article>
            ${renderQualificationCriteria(report)}
          </div>
        </section>

        <section id="priorizacao" class="card">
          ${renderSectionHeading("14", "Priorização 30/60/90 dias", "Recomendação de foco para transformar campanha em operação repetível.")}
          <div class="channel-grid">${renderPrioritizationPlan(report)}</div>
        </section>

        <section id="checklist" class="card">
          ${renderSectionHeading("15", "Checklist de lançamento", "Tarefas mínimas para tirar a campanha do plano e entrar em execução com governança.")}
          <table>
            <thead><tr><th>Fase</th><th>Item</th><th>Responsável</th><th>Prazo</th><th>Compliance</th></tr></thead>
            <tbody>${renderLaunchChecklist(report)}</tbody>
          </table>
        </section>

        <section id="proximos-passos" class="card">
          ${renderSectionHeading("16", "Próximos passos", "Ações imediatas para sair do planejamento para a execução.")}
          <ul>${renderList(report.nextActions, "Nenhum próximo passo estruturado.")}</ul>
          ${
            report.executiveGuidance.readyToLaunchWhen.length > 0
              ? `<p><strong>Pronto para lançar quando:</strong></p><ul>${renderList(
                  report.executiveGuidance.readyToLaunchWhen,
                  "Nenhuma condição de lançamento informada."
                )}</ul>`
              : ""
          }
          ${!pdfMode ? `<a class="top-link" href="#topo">Voltar ao topo</a>` : ""}
        </section>

        <footer class="footer">
          <span>Run ID: ${escapeHtml(payload.metadata.runId ?? "não informado")}</span>
          <span>${generatedAt ? `Gerado em ${escapeHtml(generatedAt)}` : "Gerado na execução atual"}</span>
          <span>Versão ${escapeHtml(report.documentIdentity.reportVersion)}</span>
        </footer>
      </main>
      ${
        !pdfMode
          ? `<script>
            (() => {
              const links = Array.from(document.querySelectorAll('.toc-nav a[data-anchor]'));
              if (!links.length) return;
              const sectionMap = new Map(links.map((link) => [link.getAttribute('data-anchor'), link]));
              const observer = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                  if (!entry.isIntersecting) return;
                  const id = entry.target.getAttribute('id');
                  if (!id) return;
                  links.forEach((link) => link.classList.remove('is-active'));
                  sectionMap.get(id)?.classList.add('is-active');
                });
              }, { rootMargin: '-20% 0px -65% 0px', threshold: 0.05 });
              document.querySelectorAll('main section[id]').forEach((section) => observer.observe(section));
            })();
          </script>`
          : ""
      }
    </body>
  </html>`;
}

export function buildMktLandingPageHtml(payload: RunAtivoReportingInput) {
  const report = extractMktCampaignReport(payload);
  if (!report) return "";
  return buildBaseHtml({
    payload,
    report,
    title: report.campaignTitle ?? report.objective,
    mode: "landing",
  });
}

export function buildMktPdfHtml(payload: RunAtivoReportingInput) {
  const report = extractMktCampaignReport(payload);
  if (!report) return "";
  return buildBaseHtml({
    payload,
    report,
    title: report.campaignTitle ?? report.objective,
    mode: "pdf",
  });
}
