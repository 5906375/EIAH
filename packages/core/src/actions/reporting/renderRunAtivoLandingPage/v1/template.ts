import type { RunAtivoReportingInput, RunAtivoRecommendation } from "../../runAtivoSchema";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function renderRecommendationCard(recommendation: RunAtivoRecommendation) {
  const tags =
    recommendation.tags && recommendation.tags.length
      ? `<div class="tags">${recommendation.tags
          .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";
  const status = recommendation.adotado ? "Adotada" : "Pendente";

  return `
    <article class="rec-card">
      <header class="rec-card__header">
        <div>
          <p class="rec-card__priority">Prioridade ${recommendation.prioridade ?? 3}</p>
          <h3>${escapeHtml(recommendation.titulo)}</h3>
        </div>
        <span class="rec-card__status">${status}</span>
      </header>
      <p class="rec-card__description">${escapeHtml(
        recommendation.descricao ?? recommendation.detalhe ?? "Não informado."
      )}</p>
      ${recommendation.proximosPassos ? `<p class="rec-card__next">${escapeHtml(recommendation.proximosPassos)}</p>` : ""}
      ${
        recommendation.modeloSugerido || recommendation.tokensEstimados
          ? `<p class="rec-card__model">
              ${recommendation.modeloSugerido ? `Modelo: ${escapeHtml(recommendation.modeloSugerido)}` : ""}
              ${
                recommendation.tokensEstimados
                  ? `<span class="rec-card__token">${recommendation.tokensEstimados} tokens</span>`
                  : ""
              }
            </p>`
          : ""
      }
      ${tags}
      <div class="rec-card__actions">
        <button>Marcar como adotada</button>
        <button class="alt">Adicionar feedback</button>
      </div>
    </article>
  `;
}

export function buildLandingPageHtml(payload: RunAtivoReportingInput) {
  const recommendationCards =
    payload.recomendacoes.length > 0
      ? payload.recomendacoes.map((rec) => renderRecommendationCard(rec)).join("")
      : `<p class="empty-state">Nenhuma recomendação disponível para este run.</p>`;

  const insights = payload.insights.length
    ? payload.insights.map((insight) => `<li>${escapeHtml(insight)}</li>`).join("")
    : `<li>Nenhum insight automatizado informado.</li>`;

  const links = payload.linksUteis.length
    ? payload.linksUteis
        .map(
          (link) =>
            `<li><a href="${escapeHtml(link.url ?? "#")}" target="_blank" rel="noopener">${escapeHtml(
              link.label
            )}</a></li>`
        )
        .join("")
    : `<li>Nenhum link fornecido.</li>`;

  const auditTrail = payload.auditTrail.length
    ? payload.auditTrail
        .map(
          (entry) =>
            `<li>
              <p class="audit-title">${escapeHtml(entry.titulo)}</p>
              <p class="audit-detail">${escapeHtml(entry.detalhe ?? "")}</p>
              ${entry.timestamp ? `<p class="audit-time">${escapeHtml(entry.timestamp)}</p>` : ""}
            </li>`
        )
        .join("")
    : `<li>Nenhum evento auditável informado.</li>`;

  const timeline = payload.timeline.length
    ? payload.timeline
        .map(
          (event) =>
            `<div class="timeline-item">
              <p class="timeline-time">${escapeHtml(event.timestamp)}</p>
              <div>
                <strong>${escapeHtml(event.status)}</strong>
                <p>${escapeHtml(event.detalhe ?? "")}</p>
              </div>
            </div>`
        )
        .join("")
    : `<p class="empty-state">Linha do tempo ainda não disponível.</p>`;

  const ctaBlock = payload.cta
    ? `<div class="card">
        <h2>${escapeHtml(payload.cta.titulo ?? "Próximos passos")}</h2>
        <p>${escapeHtml(payload.cta.descricao ?? "Nenhum CTA configurado.")}</p>
        <div class="cta-actions">
          ${
            payload.cta.botoes
              ? payload.cta.botoes
                  .map(
                    (button) =>
                      `<a class="button" href="${escapeHtml(button.url ?? "#")}" target="_blank" rel="noopener">${escapeHtml(
                        button.label
                      )}</a>`
                  )
                  .join("")
              : `<a class="button" href="#">Entrar em contato</a>`
          }
        </div>
      </div>`
    : "";

  const pdfLink = payload.metadata.downloadPdfUrl ?? "#";

  const usuario = payload.usuario;

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Run Ativo — ${escapeHtml(payload.metadata.agente)}</title>
      <style>
        :root {
          color-scheme: dark;
          font-family: "Inter", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        body {
          margin: 0;
          background: #020617;
          color: #e2e8f0;
          min-height: 100vh;
        }
        header {
          padding: 32px;
          background: radial-gradient(circle at top, #0ea5e9, #1d1f3b 55%);
          border-bottom: 1px solid rgba(14, 165, 233, 0.3);
          box-shadow: inset 0 0 60px rgba(14, 170, 233, 0.2);
        }
        header h1 {
          margin: 0;
          font-size: clamp(1.6rem, 2vw, 2rem);
        }
        header .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
          font-size: 0.9rem;
        }
        header .badge {
          background: rgba(15, 118, 110, 0.2);
          border: 1px solid rgba(45, 212, 191, 0.4);
          padding: 4px 12px;
          border-radius: 999px;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          padding: 32px 16px 80px;
          display: grid;
          gap: 24px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: 20px;
        }
        .card {
          background: #0f172a;
          border-radius: 18px;
          padding: 24px;
          border: 1px solid rgba(148, 163, 184, 0.2);
          box-shadow: 0 20px 80px rgba(0, 0, 0, 0.45);
        }
        .card h2 {
          margin-top: 0;
          font-size: 1.2rem;
          color: #93c5fd;
        }
        .rec-card {
          background: #111827;
          border: 1px solid rgba(148, 163, 184, 0.15);
          border-radius: 16px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .rec-card__header {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: start;
        }
        .rec-card__priority {
          font-size: 0.75rem;
          letter-spacing: 0.08em;
          color: #38bdf8;
          margin: 0 0 4px 0;
        }
        .rec-card__status {
          padding: 4px 10px;
          border-radius: 999px;
          border: 1px solid rgba(45, 212, 191, 0.4);
          font-size: 0.75rem;
        }
        .rec-card__description {
          color: #cbd5f5;
          margin: 0;
        }
        .rec-card__next {
          margin: 0;
          font-size: 0.95rem;
          color: #fcd34d;
        }
        .rec-card__model {
          margin: 0;
          font-size: 0.85rem;
          color: #a5b4fc;
        }
        .rec-card__token {
          margin-left: 8px;
          color: #38bdf8;
        }
        .rec-card__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .rec-card__actions button {
          flex: 1 1 auto;
          min-width: 140px;
          background: #22d3ee;
          color: #082f49;
          border: none;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 600;
          cursor: pointer;
        }
        .rec-card__actions button.alt {
          background: transparent;
          border: 1px solid rgba(148, 163, 184, 0.4);
          color: #e2e8f0;
        }
        .tags {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .tag {
          background: rgba(15, 118, 110, 0.15);
          border-radius: 999px;
          padding: 4px 10px;
          font-size: 0.75rem;
          border: 1px solid rgba(45, 212, 191, 0.25);
        }
        .timeline {
          border-left: 2px solid rgba(148, 163, 184, 0.3);
          padding-left: 24px;
        }
        .timeline-item {
          position: relative;
          margin-bottom: 20px;
        }
        .timeline-item::before {
          content: "";
          width: 12px;
          height: 12px;
          background: #0ea5e9;
          border-radius: 50%;
          position: absolute;
          left: -30px;
          top: 4px;
        }
        .timeline-time {
          font-size: 0.85rem;
          color: #94a3b8;
          margin: 0;
        }
        .button {
          display: inline-block;
          padding: 12px 18px;
          border-radius: 999px;
          background: linear-gradient(135deg, #0ea5e9, #14b8a6);
          color: #020617;
          text-decoration: none;
          font-weight: 600;
          margin-top: 12px;
        }
        .cta-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 12px;
        }
        ul {
          padding-left: 18px;
        }
        .audit-title {
          margin: 0;
          font-weight: 600;
        }
        .audit-detail {
          margin: 4px 0;
          color: #94a3b8;
        }
        .audit-time {
          font-size: 0.8rem;
          color: #64748b;
        }
        .empty-state {
          color: #94a3b8;
          margin: 0;
        }
        .edit-area {
          min-height: 140px;
          border: 1px dashed rgba(148, 163, 184, 0.5);
          border-radius: 16px;
          padding: 18px;
          background: rgba(15, 23, 42, 0.6);
        }
        footer {
          text-align: center;
          color: #64748b;
          padding: 32px 0;
          font-size: 0.85rem;
        }
      </style>
    </head>
    <body>
      <header>
        <h1>Run Ativo — ${escapeHtml(payload.metadata.agente)}</h1>
        <div class="meta">
          <span class="badge">${escapeHtml(payload.metadata.status ?? "Em análise")}</span>
          <span>Run ID: ${escapeHtml(payload.metadata.runId ?? "—")}</span>
          <span>Tenant: ${escapeHtml(payload.metadata.tenantId)}</span>
          <span>Workspace: ${escapeHtml(payload.metadata.workspaceId)}</span>
          ${
            payload.metadata.custoCents
              ? `<span>Custo: R$ ${(payload.metadata.custoCents / 100).toFixed(2)}</span>`
              : ""
          }
        </div>
      </header>
      <main class="container">
        <section class="grid">
          <div class="card">
            <h2>Dados do usuário</h2>
            <p><strong>Nome:</strong> ${escapeHtml(usuario.nome ?? "Não informado")}</p>
            <p><strong>Email:</strong> ${escapeHtml(usuario.email ?? "Não informado")}</p>
            <p><strong>Telefone:</strong> ${escapeHtml(usuario.telefone ?? "Não informado")}</p>
            ${usuario.cpfCnpj ? `<p><strong>CPF/CNPJ:</strong> ${escapeHtml(usuario.cpfCnpj)}</p>` : ""}
          </div>
          <div class="card">
            <h2>Resumo estratégico</h2>
            <p>${escapeHtml(payload.resumo)}</p>
          </div>
          <div class="card">
            <h2>Contexto de campanha</h2>
            <p>${escapeHtml(payload.contexto)}</p>
          </div>
        </section>

        <section class="card">
          <h2>Recomendações priorizadas</h2>
          <div class="grid">
            ${recommendationCards}
          </div>
        </section>

        <section class="grid">
          <div class="card">
            <h2>Insights automatizados</h2>
            <ul>${insights}</ul>
          </div>
          <div class="card">
            <h2>Links úteis</h2>
            <ul>${links}</ul>
          </div>
        </section>

        ${ctaBlock}

        <section class="card">
          <h2>Audit Trail</h2>
          <ul>${auditTrail}</ul>
        </section>

        <section class="card">
          <h2>Timeline</h2>
          <div class="timeline">${timeline}</div>
        </section>

        <section class="card">
          <h2>Download e Editor</h2>
          <a class="button" href="${escapeHtml(pdfLink)}">Baixar PDF</a>
          <div class="edit-area" contenteditable="true" data-run-id="${escapeHtml(
            payload.metadata.runId ?? ""
          )}">
            Ajuste este bloco com feedbacks ou notas adicionais. As alterações podem ser sincronizadas via API.
          </div>
        </section>
      </main>
      <footer>Gerado automaticamente pelo Run Ativo Universal Agent</footer>
    </body>
  </html>`;
}
