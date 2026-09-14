import type { RunAtivoReportingInput } from "./runAtivoSchema";
import { GuardianReportSchema, type GuardianReport } from "./guardianReportSchema";
import { renderRecipeOrchestrationHtmlSection } from "./recipeOrchestrationRenderer";

type PlainObject = Record<string, unknown>;
const LEGACY_GOVERNANCE_UNVERIFIED_BANNER = "LEGADO — ESTADO DE GOVERNANÇA NÃO VERIFICADO";
const GOVERNANCE_NOT_EVALUATED_REASON = "VERTICAL_GOVERNANCE_NOT_EVALUATED";

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function shouldUseGuardianRenderer(payload: RunAtivoReportingInput) {
  if (payload.metadata.agente.trim().toLowerCase() === "guardian") return true;
  const guardianReport = extractGuardianReport(payload);
  return guardianReport?.route === "go_live_controlado.domain_dns_api_evidencias";
}

export function extractGuardianReport(payload: RunAtivoReportingInput): GuardianReport | null {
  const raw = isPlainObject(payload.metadata) ? payload.metadata.guardianReport : null;
  const normalized = normalizeLegacyGuardianReport(raw);
  const parsed = GuardianReportSchema.safeParse(normalized);
  return parsed.success ? parsed.data : null;
}

function normalizeLegacyGuardianReport(raw: unknown): unknown {
  if (!isPlainObject(raw) || !isPlainObject(raw.governance)) return raw;
  const governance = raw.governance;
  const legacyDetected =
    governance.rbacEvaluated === true ||
    governance.entitlementEvaluated === true ||
    governance.policyDecision === "allowed";
  if (!legacyDetected) return raw;
  return {
    ...raw,
    legacyGovernanceUnverified: true,
    governance: {
      ...governance,
      rbacEvaluated: false,
      entitlementEvaluated: false,
      policyDecision: "needs_review",
      reasonCode: GOVERNANCE_NOT_EVALUATED_REASON,
    },
  };
}

export function buildGuardianTemplateMismatchReport(payload: RunAtivoReportingInput): GuardianReport {
  return {
    route: "go_live_controlado.domain_dns_api_evidencias",
    runStatus: payload.metadata.status?.toLowerCase() === "error" ? "error" : "success",
    guardianDecision: "NO-GO",
    riskLevel: "high",
    reasonCode: "EXPORT_TEMPLATE_MISMATCH",
    evidenceStatus: "missing",
    exportStatus: "template_mismatch",
    piiStatus: "unknown",
    finopsStatus: "not_reported",
    summary:
      "O relatório Guardian não recebeu um payload probatório válido. A exportação foi bloqueada em modo fail-closed para evitar parecer incompatível.",
    blockingIssues: [
      {
        code: "EXPORT_TEMPLATE_MISMATCH",
        message: "Payload Guardian ausente ou incompatível com o template probatório.",
        severity: "P0",
      },
    ],
    checklist: [],
    coverageMatrix: [],
    nextSteps: [
      "Reexecutar o run Guardian com payload probatório estruturado.",
      "Validar a rota e os checks executados antes de gerar novo export.",
    ],
    finops: {
      model: null,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      estimatedCost: null,
      currency: null,
    },
    governance: {
      tenantIdPresent: Boolean(payload.metadata.tenantId),
      workspaceIdPresent: Boolean(payload.metadata.workspaceId),
      rbacEvaluated: false,
      entitlementEvaluated: false,
      trustScoreEvaluated: false,
      costGuardEvaluated: false,
      policyDecision: "needs_review",
      reasonCode: "EXPORT_TEMPLATE_MISMATCH",
    },
    auditTrail: {
      runId: payload.metadata.runId ?? "não informado",
      traceId: payload.metadata.traceId ?? null,
      receiptId: null,
      verifyUrl: null,
      evidenceBundleId: null,
    },
    environment: null,
    nextAction: "Corrigir o payload probatório antes de exportar.",
  };
}

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function formatGuardianCost(value: number | null | undefined, currency = "BRL") {
  if (typeof value !== "number" || !Number.isFinite(value)) return "não calculado";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(value);
}

export function formatGuardianTokens(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "não reportados";
  return new Intl.NumberFormat("pt-BR").format(value);
}

export function formatGuardianFinopsStatusLabel(report: GuardianReport) {
  if (report.finopsStatus === "not_calculated" && typeof report.finops.totalTokens === "number" && report.finops.totalTokens > 0) {
    return "uso reportado, custo monetário não consolidado";
  }
  if (report.finopsStatus === "calculated") return "calculado";
  if (report.finopsStatus === "not_calculated") return "parcial";
  return "não reportado";
}

function statusTone(status: string) {
  if (status === "GO" || status === "complete") return "good";
  if (status === "DEGRADED" || status === "partial" || status === "degraded") return "warn";
  return "bad";
}

function renderChecklistRows(report: GuardianReport) {
  if (report.checklist.length === 0) {
    return `<tr><td colspan="6">Nenhuma evidência estruturada foi reportada.</td></tr>`;
  }

  return report.checklist
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.item)}</td>
        <td><span class="status ${statusTone(item.status)}">${escapeHtml(item.status)}</span></td>
        <td>${escapeHtml(item.expectedEvidence)}</td>
        <td>${escapeHtml(item.collectedEvidence ?? "não coletada")}</td>
        <td>${escapeHtml(item.sha256 ?? "não coletado")}</td>
        <td>${item.blocking ? "sim" : "não"}</td>
      </tr>`
    )
    .join("");
}

function renderBlockingIssues(report: GuardianReport) {
  if (report.blockingIssues.length === 0) {
    return `<li>Nenhum bloqueio crítico reportado.</li>`;
  }
  return report.blockingIssues
    .map(
      (issue) =>
        `<li><strong>${escapeHtml(issue.severity)}</strong> · ${escapeHtml(issue.code)} — ${escapeHtml(issue.message)}</li>`
    )
    .join("");
}

function renderNextSteps(report: GuardianReport) {
  if (report.nextSteps.length === 0) {
    return `<li>Nenhuma próxima ação estruturada.</li>`;
  }
  return report.nextSteps.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
}

function renderCoverageMatrixRows(report: GuardianReport) {
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

export function buildGuardianReportBaseHtml(params: {
  payload: RunAtivoReportingInput;
  report: GuardianReport;
  theme: "dark" | "light";
  includeRaw?: boolean;
}) {
  const { payload, report, theme, includeRaw } = params;
  const dark = theme === "dark";
  const surface = dark ? "#0f172a" : "#ffffff";
  const border = dark ? "rgba(148,163,184,0.18)" : "#dbe3ee";
  const pageBg = dark ? "#020617" : "#f8fafc";
  const text = dark ? "#e2e8f0" : "#0f172a";
  const muted = dark ? "#94a3b8" : "#475569";
  const accent = report.guardianDecision === "GO" ? "#10b981" : report.guardianDecision === "DEGRADED" ? "#f59e0b" : "#ef4444";
  const rawBlock =
    includeRaw && isPlainObject(payload.metadata)
      ? `<section class="card">
          <h2>Anexo técnico</h2>
          <pre>${escapeHtml(JSON.stringify(payload.metadata.guardianReport ?? null, null, 2))}</pre>
        </section>`
      : "";
  const recipeOrchestrationSection = renderRecipeOrchestrationHtmlSection({
    payload,
    escapeHtml,
    tone: dark ? "dark" : "light",
  });

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>EIAH Guardian — Parecer Probatório</title>
      <style>
        :root { color-scheme: ${dark ? "dark" : "light"}; font-family: "Inter", system-ui, sans-serif; }
        body { margin: 0; background: ${pageBg}; color: ${text}; }
        main { max-width: 1120px; margin: 0 auto; padding: 28px 16px 48px; display: grid; gap: 20px; }
        header.hero { padding: 28px 16px; background: linear-gradient(135deg, ${accent}22, ${dark ? "#0f172a" : "#ffffff"}); border-bottom: 1px solid ${border}; }
        .hero-shell { max-width: 1120px; margin: 0 auto; display: grid; gap: 16px; }
        h1 { margin: 0; font-size: clamp(1.6rem, 3vw, 2.1rem); }
        h2 { margin: 0 0 12px; font-size: 1.05rem; }
        p, li, td, th, small { line-height: 1.5; }
        .eyebrow { text-transform: uppercase; letter-spacing: 0.22em; font-size: 0.72rem; color: ${muted}; margin: 0 0 10px; }
        .hero-grid, .summary-grid, .finops-grid, .audit-grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .card { background: ${surface}; border: 1px solid ${border}; border-radius: 18px; padding: 18px; box-shadow: ${dark ? "0 24px 80px rgba(0,0,0,.34)" : "0 16px 40px rgba(15,23,42,.08)"}; }
        .pill { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px; border: 1px solid ${border}; font-size: 0.8rem; }
        .decision { border-left: 4px solid ${accent}; }
        .status.good { color: #10b981; font-weight: 700; }
        .status.warn { color: #f59e0b; font-weight: 700; }
        .status.bad { color: #ef4444; font-weight: 700; }
        ul { margin: 0; padding-left: 18px; }
        table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
        th, td { border: 1px solid ${border}; padding: 10px; text-align: left; vertical-align: top; }
        th { background: ${dark ? "#111827" : "#eff6ff"}; }
        pre { margin: 0; white-space: pre-wrap; overflow-wrap: break-word; font-size: 0.78rem; background: ${dark ? "#020617" : "#f8fafc"}; padding: 14px; border-radius: 12px; border: 1px solid ${border}; }
        .muted { color: ${muted}; }
        @media (max-width: 720px) {
          main { padding: 20px 12px 36px; }
          header.hero { padding: 20px 12px; }
          th, td { font-size: 0.84rem; }
        }
        @media print {
          body { background: #fff; color: #000; }
          .card { box-shadow: none; break-inside: avoid; }
          header.hero { background: transparent; }
        }
      </style>
    </head>
    <body>
      <header class="hero">
        <div class="hero-shell">
          <div>
            <p class="eyebrow">EIAH Guardian — Parecer Probatório</p>
            <h1>Rota: ${escapeHtml(report.route)}</h1>
            <small class="muted">Run ID: ${escapeHtml(report.auditTrail.runId)} · Data/hora: ${escapeHtml(
              new Date().toISOString()
            )} · Ambiente: ${escapeHtml(report.environment ?? "não informado")}</small>
          </div>
          <div class="hero-grid">
            <span class="pill">Status técnico do run: ${escapeHtml(report.runStatus.toUpperCase())}</span>
            <span class="pill">Decisão Guardian: ${escapeHtml(report.guardianDecision)}</span>
            ${report.evaluationScope ? `<span class="pill">Escopo: ${escapeHtml(report.evaluationScope)}</span>` : ""}
            ${report.riskLevel ? `<span class="pill">Risco: ${escapeHtml(report.riskLevel)}</span>` : ""}
            <span class="pill">Status das evidências: ${escapeHtml(report.evidenceStatus)}</span>
            <span class="pill">Export: ${escapeHtml(report.exportStatus)}</span>
          </div>
        </div>
      </header>
      <main>
        ${
          report.legacyGovernanceUnverified
            ? `<section class="card decision"><strong>${escapeHtml(LEGACY_GOVERNANCE_UNVERIFIED_BANNER)}</strong></section>`
            : ""
        }
        <section class="card decision">
          <h2>Decisão executiva</h2>
          <div class="summary-grid">
            <div><small class="muted">ReasonCode</small><p>${escapeHtml(report.reasonCode)}</p></div>
            <div><small class="muted">Próxima ação recomendada</small><p>${escapeHtml(report.nextAction ?? "não informada")}</p></div>
            <div><small class="muted">PII / dados sensíveis</small><p>${escapeHtml(report.piiStatus)}</p></div>
            <div><small class="muted">FinOps</small><p>${escapeHtml(formatGuardianFinopsStatusLabel(report))}</p></div>
            ${report.governance ? `<div><small class="muted">Governança</small><p>${escapeHtml(report.governance.policyDecision)}</p></div>` : ""}
            ${report.stageDecision ? `<div><small class="muted">Decisão da etapa</small><p>${escapeHtml(report.stageDecision)}</p></div>` : ""}
            ${report.globalDecision ? `<div><small class="muted">Decisão global</small><p>${escapeHtml(report.globalDecision)}</p></div>` : ""}
            ${report.activeStepTitle ? `<div><small class="muted">Etapa ativa</small><p>${escapeHtml(report.activeStepTitle)}</p></div>` : ""}
          </div>
          <p>${escapeHtml(report.summary)}</p>
        </section>

        ${recipeOrchestrationSection}

        <section class="card">
          <h2>Bloqueios críticos</h2>
          <ul>${renderBlockingIssues(report)}</ul>
        </section>

        <section class="card">
          <h2>Checklist probatório</h2>
          <table>
            <thead>
              <tr>
                <th>Item verificado</th>
                <th>Status</th>
                <th>Evidência esperada</th>
                <th>Evidência coletada</th>
                <th>Hash SHA-256</th>
                <th>Bloqueia avanço?</th>
              </tr>
            </thead>
            <tbody>${renderChecklistRows(report)}</tbody>
          </table>
        </section>

        <section class="card">
          <h2>Matriz de cobertura do parecer</h2>
          <p class="muted">Explicação da plataforma sobre o que o parecer técnico pediu, o que este run realmente validou e o que ainda depende de revisão manual ou arquitetural.</p>
          <table>
            <thead>
              <tr>
                <th>O que o parecer pede</th>
                <th>O que o run respondeu</th>
                <th>O que ainda depende de revisão manual/arquitetural</th>
              </tr>
            </thead>
            <tbody>${renderCoverageMatrixRows(report)}</tbody>
          </table>
        </section>

        <section class="card">
          <h2>LGPD / dados sensíveis</h2>
          <p>Status: ${escapeHtml(report.piiStatus)}</p>
          <p class="muted">O fluxo opera em fail-closed quando detecta PII sem ofuscação, segredo comercial exposto ou evidência incompatível.</p>
        </section>

        ${
          report.governance
            ? `<section class="card">
          <h2>Estado de governança</h2>
          <div class="summary-grid">
            <div><small class="muted">tenant/workspace</small><p>${report.governance.tenantIdPresent && report.governance.workspaceIdPresent ? "ok" : "ausente"}</p></div>
            <div><small class="muted">RBAC</small><p>${report.governance.rbacEvaluated ? "avaliado" : "não avaliado"}</p></div>
            <div><small class="muted">Entitlement</small><p>${report.governance.entitlementEvaluated ? "avaliado" : "não avaliado"}</p></div>
            <div><small class="muted">TrustScore</small><p>${report.governance.trustScoreEvaluated ? "avaliado" : "não avaliado"}</p></div>
            <div><small class="muted">CostGuard</small><p>${report.governance.costGuardEvaluated ? "avaliado" : "não avaliado"}</p></div>
            <div><small class="muted">Policy decision</small><p>${escapeHtml(report.governance.policyDecision)}</p></div>
            ${
              typeof report.governance.trustScore === "number"
                ? `<div><small class="muted">Trust score</small><p>${escapeHtml(report.governance.trustScore.toFixed(2))}</p></div>`
                : ""
            }
            ${report.governance.trustLevel ? `<div><small class="muted">Trust level</small><p>${escapeHtml(report.governance.trustLevel)}</p></div>` : ""}
          </div>
        </section>`
            : ""
        }

        <section class="card">
          <h2>FinOps</h2>
          <div class="finops-grid">
            <div><small class="muted">Modelo</small><p>${escapeHtml(report.finops.model ?? "não reportado")}</p></div>
            <div><small class="muted">Prompt tokens</small><p>${escapeHtml(formatGuardianTokens(report.finops.promptTokens))}</p></div>
            <div><small class="muted">Completion tokens</small><p>${escapeHtml(formatGuardianTokens(report.finops.completionTokens))}</p></div>
            <div><small class="muted">Total tokens</small><p>${escapeHtml(formatGuardianTokens(report.finops.totalTokens))}</p></div>
            <div><small class="muted">Custo</small><p>${escapeHtml(formatGuardianCost(report.finops.estimatedCost, report.finops.currency ?? "BRL"))}</p></div>
            <div><small class="muted">Moeda</small><p>${escapeHtml(report.finops.currency ?? "não reportada")}</p></div>
          </div>
        </section>

        <section class="card">
          <h2>Próximos passos</h2>
          <ul>${renderNextSteps(report)}</ul>
        </section>

        <section class="card">
          <h2>Audit trail</h2>
          <div class="audit-grid">
            <div><small class="muted">Run ID</small><p>${escapeHtml(report.auditTrail.runId)}</p></div>
            <div><small class="muted">Trace ID</small><p>${escapeHtml(report.auditTrail.traceId ?? "não informado")}</p></div>
            <div><small class="muted">Receipt ID</small><p>${escapeHtml(report.auditTrail.receiptId ?? "não informado")}</p></div>
            <div><small class="muted">Verify URL</small><p>${escapeHtml(report.auditTrail.verifyUrl ?? "não informado")}</p></div>
            <div><small class="muted">Evidence bundle</small><p>${escapeHtml(report.auditTrail.evidenceBundleId ?? "não informado")}</p></div>
          </div>
        </section>

        ${rawBlock}
      </main>
    </body>
  </html>`;
}
