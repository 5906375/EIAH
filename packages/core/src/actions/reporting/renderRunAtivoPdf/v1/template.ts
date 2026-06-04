import type { RunAtivoReportingInput } from "../../runAtivoSchema";
import { renderRecipeOrchestrationHtmlSection } from "../../recipeOrchestrationRenderer";

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export function buildPdfHtml(payload: RunAtivoReportingInput) {
  const recommendationRows = payload.recomendacoes.length
    ? payload.recomendacoes
        .map(
          (rec) => `
          <tr>
            <td>${escapeHtml(String(rec.prioridade ?? 3))}</td>
            <td>${escapeHtml(rec.titulo)}</td>
            <td>${escapeHtml(rec.descricao ?? rec.detalhe ?? "—")}</td>
            <td>${escapeHtml(rec.proximosPassos ?? "—")}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="4">Nenhuma recomendação disponível.</td></tr>`;

  const insights = payload.insights.length
    ? payload.insights.map((insight) => `<li>${escapeHtml(insight)}</li>`).join("")
    : `<li>Nenhum insight informado.</li>`;
  const recipeOrchestrationSection = renderRecipeOrchestrationHtmlSection({
    payload,
    escapeHtml,
    tone: "light",
  });

  return `<!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Relatório PDF — ${escapeHtml(payload.metadata.agente)}</title>
      <style>
        body {
          font-family: "Inter", Arial, sans-serif;
          margin: 0;
          padding: 32px;
          background: #f5f6f8;
          color: #0f172a;
        }
        header {
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 24px;
          padding-bottom: 16px;
        }
        header h1 {
          margin: 0;
          font-size: 1.5rem;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 8px;
          font-size: 0.9rem;
          color: #475569;
        }
        section {
          margin-bottom: 24px;
        }
        section h2 {
          margin-bottom: 12px;
          color: #0f172a;
          font-size: 1.1rem;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.9rem;
        }
        th, td {
          border: 1px solid #e2e8f0;
          padding: 10px;
          text-align: left;
        }
        th {
          background: #eef2ff;
        }
        ul {
          padding-left: 20px;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
        }
        .card {
          background: white;
          border: 1px solid #e2e8f0;
          padding: 16px;
          border-radius: 12px;
        }
      </style>
    </head>
    <body>
      <header>
        <h1>Run Ativo — ${escapeHtml(payload.metadata.agente)}</h1>
        <div class="meta">
          <span>Run ID: ${escapeHtml(payload.metadata.runId ?? "—")}</span>
          <span>Tenant: ${escapeHtml(payload.metadata.tenantId)}</span>
          <span>Workspace: ${escapeHtml(payload.metadata.workspaceId)}</span>
          ${payload.metadata.status ? `<span>Status: ${escapeHtml(payload.metadata.status)}</span>` : ""}
          ${
            payload.metadata.custoCents
              ? `<span>Custo: R$ ${(payload.metadata.custoCents / 100).toFixed(2)}</span>`
              : ""
          }
        </div>
      </header>

      <section class="grid">
        <div class="card">
          <h2>Resumo</h2>
          <p>${escapeHtml(payload.resumo)}</p>
        </div>
        <div class="card">
          <h2>Contexto</h2>
          <p>${escapeHtml(payload.contexto)}</p>
        </div>
      </section>

      <section>
        <h2>Recomendações priorizadas</h2>
        <table>
          <thead>
            <tr>
              <th>Prioridade</th>
              <th>Título</th>
              <th>Detalhes</th>
              <th>Próximos passos</th>
            </tr>
          </thead>
          <tbody>
            ${recommendationRows}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Insights automatizados</h2>
        <ul>${insights}</ul>
      </section>

      ${recipeOrchestrationSection}

      ${
        payload.cta
          ? `<section>
              <h2>CTA e próximos passos</h2>
              <p><strong>${escapeHtml(payload.cta.titulo ?? "Próximos passos")}</strong></p>
              <p>${escapeHtml(payload.cta.descricao ?? "Nenhum CTA configurado.")}</p>
            </section>`
          : ""
      }

      ${
        payload.auditTrail.length
          ? `<section>
              <h2>Audit trail</h2>
              <ul>
                ${payload.auditTrail
                  .map(
                    (entry) =>
                      `<li><strong>${escapeHtml(entry.titulo)}</strong> — ${escapeHtml(
                        entry.detalhe ?? ""
                      )} ${entry.timestamp ? `<em>(${escapeHtml(entry.timestamp)})</em>` : ""}</li>`
                  )
                  .join("")}
              </ul>
            </section>`
          : ""
      }
    </body>
  </html>`;
}
