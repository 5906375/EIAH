import type { RunAtivoReportingInput } from "./runAtivoSchema";
import { RecipeOrchestrationSchema } from "./recipeOrchestrationSchema";
import type { RecipeOrchestration } from "./recipeOrchestrationSchema";

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractRecipeOrchestration(payload: RunAtivoReportingInput): RecipeOrchestration | null {
  const raw = isPlainObject(payload.metadata) ? payload.metadata.recipeOrchestration : null;
  const parsed = RecipeOrchestrationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function renderRecipeOrchestrationHtmlSection(params: {
  payload: RunAtivoReportingInput;
  escapeHtml: (value: unknown) => string;
  tone?: "dark" | "light";
}) {
  const orchestration = extractRecipeOrchestration(params.payload);
  if (!orchestration) return "";

  const { escapeHtml } = params;
  const dark = params.tone !== "light";
  const muted = dark ? "#94a3b8" : "#475569";
  const border = dark ? "rgba(148,163,184,0.18)" : "#dbe3ee";
  const cardBg = dark ? "#020617" : "#f8fafc";

  const suggestedAgents =
    orchestration.suggestedSelfServiceAgents.length > 0
      ? orchestration.suggestedSelfServiceAgents
          .map(
            (agent) => `<li>
              <strong>${escapeHtml(agent.displayName)}</strong> · ${escapeHtml(agent.purpose)}
              <br />
              <small style="color:${muted};">Pode orientar: ${agent.canAdvise ? "sim" : "não"} · Pode executar: ${agent.canExecute ? "sim" : "não"} · Custo: ${escapeHtml(agent.estimatedCostStatus)}</small>
            </li>`
          )
          .join("")
      : "<li>Nenhum agente auxiliar sugerido para esta receita.</li>";
  const suggestedAgentPills =
    orchestration.suggestedSelfServiceAgents.length > 0
      ? orchestration.suggestedSelfServiceAgents
          .map(
            (agent) =>
              `<span style="display:inline-flex;align-items:center;padding:6px 12px;border-radius:999px;border:1px solid ${border};background:${dark ? "rgba(16,185,129,.12)" : "#ecfdf5"};color:${dark ? "#86efac" : "#166534"};font-size:.78rem;margin:0 8px 8px 0;">${escapeHtml(
                agent.displayName
              )}</span>`
          )
          .join("")
      : "";

  const limitations =
    orchestration.limitations.length > 0
      ? orchestration.limitations.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : "<li>Nenhuma limitação adicional reportada.</li>";

  const practicalSteps =
    orchestration.practicalSteps.length > 0
      ? orchestration.practicalSteps.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : "<li>Nenhum passo prático estruturado.</li>";
  const howToProceedNow =
    orchestration.howToProceedNow.length > 0
      ? orchestration.howToProceedNow.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : "<li>Nenhuma orientação adicional de implementação foi reportada.</li>";
  const recommendedRecipes =
    orchestration.recommendedRecipes.length > 0
      ? orchestration.recommendedRecipes
          .map(
            (item) => `<li>
              <strong>${escapeHtml(`${item.order}. ${item.title}`)}</strong>
              <br />
              <small style="color:${muted};">${escapeHtml(item.objective)}</small>
              ${item.externalPlatform ? `<br /><small style="color:${muted};">Plataforma: ${escapeHtml(item.externalPlatform)}</small>` : ""}
            </li>`
          )
          .join("")
      : "<li>Nenhuma recipe adicional recomendada foi reportada.</li>";
  const externalPlatforms =
    orchestration.externalPlatformsInvolved.length > 0
      ? orchestration.externalPlatformsInvolved
          .map(
            (platform) =>
              `<span style="display:inline-flex;align-items:center;padding:6px 12px;border-radius:999px;border:1px solid ${border};background:${dark ? "#0f172a" : "#eff6ff"};font-size:.78rem;margin:0 8px 8px 0;">${escapeHtml(
                platform
              )}</span>`
          )
          .join("")
      : "";

  const rerunItems =
    orchestration.readyForRerunWhen.length > 0
      ? orchestration.readyForRerunWhen.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
      : "<li>Sem critérios objetivos de rerun reportados.</li>";

  const guardianReason =
    orchestration.guardianReviewReason.length > 0
      ? orchestration.guardianReviewReason.map((item) => escapeHtml(item)).join(" | ")
      : "não";
  const recipeGoal = orchestration.recipeGoal ? `<p><strong>Objetivo:</strong> ${escapeHtml(orchestration.recipeGoal)}</p>` : "";
  const recipeExpectedOutcome = orchestration.recipeExpectedOutcome
    ? `<p><strong>Resultado esperado:</strong> ${escapeHtml(orchestration.recipeExpectedOutcome)}</p>`
    : "";
  const recipeSteps =
    orchestration.recipeSteps.length > 0
      ? orchestration.recipeSteps
          .map(
            (step, index) => `<li>
              <strong>${index + 1}. ${escapeHtml(step.title)}</strong>
              ${step.objective ? `<br /><small style="color:${muted};">${escapeHtml(step.objective)}</small>` : ""}
              ${step.checks.length > 0 ? `<br /><small style="color:${muted};">Checks: ${escapeHtml(step.checks.join(" · "))}</small>` : ""}
              ${step.evidence.length > 0 ? `<br /><small style="color:${muted};">Evidências: ${escapeHtml(step.evidence.join(" · "))}</small>` : ""}
              <br /><small style="color:${muted};">Bloqueia avanço: ${step.blocking ? "sim" : "não"}</small>
            </li>`
          )
          .join("")
      : "<li>A recipe não reportou etapas estruturadas; o runtime operou em fallback textual.</li>";

  return `
    <section class="card">
      <h2>Recipe_Orchestrator — Como concluir esta receita</h2>
      <div style="display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));margin-bottom:16px;">
        <div><small style="color:${muted};">Intenção detectada</small><p>${escapeHtml(orchestration.intent)}</p></div>
        <div><small style="color:${muted};">Domínio detectado</small><p>${escapeHtml(orchestration.domain)}</p></div>
        <div><small style="color:${muted};">Risco</small><p>${escapeHtml(orchestration.riskLevel)}</p></div>
        <div><small style="color:${muted};">Suporte</small><p>${escapeHtml(orchestration.supportMode)}</p></div>
      </div>

      <div style="border:1px solid ${border};border-radius:14px;padding:14px;background:${cardBg};margin-bottom:16px;">
        <small style="color:${muted};">Agente líder recomendado</small>
        <p style="margin:6px 0 4px;"><strong>${escapeHtml(orchestration.primaryAgent.displayName)}</strong> (${escapeHtml(orchestration.primaryAgent.key)})</p>
        <p style="margin:0;">${escapeHtml(orchestration.primaryAgent.selectionReason)}</p>
        <small style="color:${muted};">Confiança: ${escapeHtml(orchestration.primaryAgent.confidence.toFixed(2))}</small>
        ${recipeGoal}
        ${recipeExpectedOutcome}
      </div>

      <div style="margin-top:16px;border:1px solid ${border};border-radius:14px;padding:14px;background:${cardBg};">
        <h3 style="margin:0 0 8px;font-size:1rem;">Etapas estruturadas da recipe</h3>
        <ol style="margin:0;padding-left:18px;">${recipeSteps}</ol>
      </div>

      <div style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));">
        <div>
          <h3 style="margin:0 0 8px;font-size:1rem;">Guardian será acionado?</h3>
          <p style="margin:0 0 8px;">${orchestration.requiresGuardianReview ? "Sim" : "Não"}</p>
          <p style="margin:0;color:${muted};">${guardianReason}</p>
        </div>
        <div>
          <h3 style="margin:0 0 8px;font-size:1rem;">Governança aplicada</h3>
          <ul style="margin:0;padding-left:18px;">
            <li>tenant/workspace: ${orchestration.governance.tenantIdPresent && orchestration.governance.workspaceIdPresent ? "ok" : "ausente"}</li>
            <li>policyDecision: ${escapeHtml(orchestration.governance.policyDecision)}</li>
            <li>RBAC: ${orchestration.governance.rbacEvaluated ? "avaliado" : "não avaliado"}</li>
            <li>Entitlement: ${orchestration.governance.entitlementEvaluated ? "avaliado" : "não avaliado"}</li>
            <li>TrustScore: ${orchestration.governance.trustScoreEvaluated ? "avaliado" : "não avaliado"}</li>
            <li>CostGuard: ${orchestration.governance.costGuardEvaluated ? "avaliado" : "não avaliado"}</li>
          </ul>
        </div>
      </div>

      <div style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:16px;">
        <div>
          ${
            suggestedAgentPills
              ? `<h3 style="margin:0 0 8px;font-size:1rem;">Apoio sugerido agora</h3><div style="margin:0 0 12px;">${suggestedAgentPills}</div>`
              : ""
          }
          <h3 style="margin:0 0 8px;font-size:1rem;">Agentes self-service que podem ajudar</h3>
          <ul style="margin:0;padding-left:18px;">${suggestedAgents}</ul>
        </div>
        <div>
          <h3 style="margin:0 0 8px;font-size:1rem;">Limitações</h3>
          <ul style="margin:0;padding-left:18px;">${limitations}</ul>
        </div>
      </div>

      <div style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:16px;">
        <div>
          <h3 style="margin:0 0 8px;font-size:1rem;">Passos práticos</h3>
          <ol style="margin:0;padding-left:18px;">${practicalSteps}</ol>
        </div>
        <div>
          <h3 style="margin:0 0 8px;font-size:1rem;">Pronto para rerun quando</h3>
          <ul style="margin:0;padding-left:18px;">${rerunItems}</ul>
        </div>
      </div>

      <div style="display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));margin-top:16px;">
        <div>
          <h3 style="margin:0 0 8px;font-size:1rem;">Como seguir agora</h3>
          <ul style="margin:0;padding-left:18px;">${howToProceedNow}</ul>
        </div>
        <div>
          <h3 style="margin:0 0 8px;font-size:1rem;">Próxima melhor ação para implementação</h3>
          <p style="margin:0;">${escapeHtml(orchestration.nextBestImplementationAction ?? "Nenhuma ação adicional estruturada.")}</p>
          ${
            externalPlatforms
              ? `<div style="margin-top:12px;"><small style="color:${muted};">Plataformas externas envolvidas</small><br />${externalPlatforms}</div>`
              : ""
          }
        </div>
      </div>

      <div style="margin-top:16px;">
        <h3 style="margin:0 0 8px;font-size:1rem;">Recipes recomendadas em ordem</h3>
        <ol style="margin:0;padding-left:18px;">${recommendedRecipes}</ol>
      </div>
    </section>`;
}
