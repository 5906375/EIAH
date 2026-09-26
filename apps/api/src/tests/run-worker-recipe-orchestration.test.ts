import assert from "node:assert/strict";
import test from "node:test";

import { buildRecipeOrchestration } from "../workers/runWorkerRecipeOrchestration";

test("recipe orchestration follows consultative IMOB-like pattern for go-live recipes", () => {
  const orchestration = buildRecipeOrchestration({
    agentId: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    costCents: 42,
    metadata: {
      linkedRecipe: {
        id: "recipe-1",
        title: "Go-live controlado com healthcheck, rollback e DNS",
        instructions: "Validar /api/health, WAF, rollback e evidências antes do avanço.",
        tags: ["go-live", "audit-trail"],
        content: {
          mode: "staged",
          goal: "Levar o EIAH para produção controlada.",
          expectedOutcome: "Receber GO com evidências completas.",
          goCondition: "Healthcheck anexado\nRollback documentado",
          blockCondition: "Pendência crítica aberta",
          steps: [
            {
              id: "step-1",
              title: "Healthcheck",
              objective: "Validar /api/health",
              checks: ["HTTP 200", "database connected"],
              evidence: ["resposta do endpoint"],
              blocking: true,
            },
          ],
        },
      },
    },
  });

  assert.ok(orchestration);
  assert.equal(orchestration?.audit.basedOnPattern, "chat_imob_orchestrator");
  assert.equal(orchestration?.primaryAgent.key, "guardian");
  assert.equal(orchestration?.requiresGuardianReview, true);
  assert.equal(orchestration?.recipeGoal, "Levar o EIAH para produção controlada.");
  assert.equal(orchestration?.recipeSteps[0]?.title, "Healthcheck");
  assert.match(orchestration?.practicalSteps[0] ?? "", /Healthcheck/);
  assert.equal(orchestration?.readyForRerunWhen.includes("Healthcheck anexado"), true);
  assert.equal(orchestration?.howToProceedNow.length ? true : false, true);
  assert.equal(orchestration?.recommendedRecipes.length, 0);
  assert.equal(orchestration?.nextBestImplementationAction, "Criar a próxima recipe operacional específica da plataforma externa mais crítica.");
  assert.equal(orchestration?.externalPlatformsInvolved.includes("Cloudflare"), true);
  assert.equal(orchestration?.suggestedSelfServiceAgents.some((agent) => agent.key === "guardian"), false);
  assert.equal(orchestration?.suggestedSelfServiceAgents.some((agent) => agent.key === "pitch"), false);
  assert.equal(orchestration?.governance.rbacEvaluated, false);
  assert.equal(orchestration?.governance.entitlementEvaluated, false);
  assert.equal(orchestration?.governance.policyDecision, "not_evaluated");
  assert.equal(orchestration?.governance.reasonCode, "VERTICAL_GOVERNANCE_NOT_EVALUATED");
});

test("recipe orchestration ignores malicious positive governance metadata", () => {
  const orchestration = buildRecipeOrchestration({
    agentId: "EIAH",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    metadata: {
      linkedRecipe: {
        id: "recipe-malicious",
        title: "Receita geral",
        instructions: "Montar próximos passos.",
      },
      governanceContext: {
        rbacEvaluated: true,
        entitlementEvaluated: true,
        policyDecision: "allowed",
        reasonCode: null,
      },
    },
  });

  assert.equal(orchestration?.governance.rbacEvaluated, false);
  assert.equal(orchestration?.governance.entitlementEvaluated, false);
  assert.equal(orchestration?.governance.policyDecision, "not_evaluated");
  assert.equal(orchestration?.governance.reasonCode, "VERTICAL_GOVERNANCE_NOT_EVALUATED");
});

test("recipe orchestration emits ordered follow-up recipes for full web go-live plans", () => {
  const orchestration = buildRecipeOrchestration({
    agentId: "guardian",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    costCents: 42,
    metadata: {
      linkedRecipe: {
        id: "recipe-plan",
        title: "Go-live Controlado EIAH Web — Plano Principal",
        instructions: "Validar Vercel, AWS, Cloudflare, integração fim a fim e rollback.",
        tags: ["go-live", "vercel", "aws", "cloudflare"],
        content: {
          mode: "staged",
          goal: "Levar o EIAH para produção controlada na web.",
          expectedOutcome: "Receber GO com evidências completas.",
          steps: [
            { id: "s1", title: "Segregação", objective: "Separar ambientes", checks: ["DNS"], evidence: ["snapshot"], blocking: true },
            { id: "s2", title: "Health", objective: "Validar API", checks: ["/api/health"], evidence: ["health"], blocking: true },
          ],
        },
      },
    },
  });

  assert.equal(orchestration?.recommendedRecipes.length, 5);
  assert.equal(orchestration?.recommendedRecipes[0]?.title, "Validar publicação do app no Vercel");
  assert.equal(orchestration?.nextBestImplementationAction, "Validar publicação do app no Vercel");
  assert.equal(orchestration?.externalPlatformsInvolved.includes("Vercel"), true);
  assert.equal(orchestration?.externalPlatformsInvolved.includes("AWS"), true);
  assert.equal(orchestration?.externalPlatformsInvolved.includes("Cloudflare"), true);
});

test("recipe orchestration chooses IMOB when available, otherwise falls back to EIAH", () => {
  const recipe = {
    linkedRecipe: {
      id: "recipe-imob",
      title: "Triagem IMOB para proprietário e lead imobiliário",
      instructions: "Organizar documentação do imóvel e próximos passos do corretor.",
      tags: ["imob"],
    },
  };

  const withImob = buildRecipeOrchestration({
    agentId: "EIAH",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    metadata: recipe,
    availableAgents: [
      { key: "imob", agentId: "IMOB", displayName: "IMOB" },
      { key: "eiah", agentId: "EIAH", displayName: "EIAH" },
    ],
  });
  const withoutImob = buildRecipeOrchestration({
    agentId: "EIAH",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    metadata: recipe,
  });

  assert.equal(withImob?.primaryAgent.key, "imob");
  assert.equal(withoutImob?.primaryAgent.key, "eiah");
});

test("recipe orchestration selects pitch and legal leaders by recipe domain", () => {
  const pitch = buildRecipeOrchestration({
    agentId: "EIAH",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    metadata: {
      linkedRecipe: {
        id: "recipe-pitch",
        title: "Apresentação comercial e anúncio de campanha",
        instructions: "Criar narrativa, CTA e materiais para pitch.",
      },
    },
  });
  const legal = buildRecipeOrchestration({
    agentId: "EIAH",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    metadata: {
      linkedRecipe: {
        id: "recipe-legal",
        title: "Revisão de contrato e cláusulas de compliance",
        instructions: "Parecer jurídico com risco, obrigação e documentação de apoio.",
      },
    },
  });

  assert.equal(pitch?.primaryAgent.key, "pitch");
  assert.equal(legal?.primaryAgent.key, "j_360");
  assert.equal(legal?.intent, "legal_review");
  assert.equal(legal?.howToProceedNow.length >= 1, true);
  assert.equal(legal?.recommendedRecipes.length, 5);
  assert.equal(legal?.nextBestImplementationAction, "Validar natureza não salarial da política de premiação");
});

test("recipe orchestration preserves the selected MKT agent for campaign recipes", () => {
  const orchestration = buildRecipeOrchestration({
    agentId: "MKT",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    metadata: {
      linkedRecipe: {
        id: "recipe-mkt",
        agentId: "MKT",
        title: "Campanha de Divulgação e Prospecção — Vertical Legal EIAH",
        instructions: "Planejar campanha multicanal, ICP, outreach no LinkedIn e parcerias para escritórios de advocacia.",
        tags: ["mkt", "campanha", "linkedin", "parcerias", "vertical-legal"],
      },
    },
  });

  assert.equal(orchestration?.primaryAgent.key, "mkt");
  assert.equal(orchestration?.intent, "marketing_campaign");
  assert.equal(orchestration?.domain, "marketing");
  assert.equal(orchestration?.riskLevel, "low");
  assert.equal(orchestration?.howToProceedNow.length >= 1, true);
  assert.equal(orchestration?.recommendedRecipes.length, 5);
  assert.equal(orchestration?.nextBestImplementationAction, "Definir ICP e segmentação da Vertical Legal");
});

test("recipe orchestration flags guardian review for PII or high risk", () => {
  const orchestration = buildRecipeOrchestration({
    agentId: "EIAH",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    metadata: {
      linkedRecipe: {
        id: "recipe-risk",
        title: "Atendimento com LGPD, contrato e evidências de cliente",
        instructions: "Organizar resposta ao usuário com PII e trilha auditável.",
      },
    },
  });

  assert.equal(orchestration?.requiresGuardianReview, true);
  assert.equal(orchestration?.guardianReviewReason.length ? true : false, true);
});

test("recipe orchestration does not allow delegate_assisted without tenant/workspace context", () => {
  const orchestration = buildRecipeOrchestration({
    agentId: "EIAH",
    tenantId: null,
    workspaceId: null,
    metadata: {
      linkedRecipe: {
        id: "recipe-general",
        title: "Receita geral com apoio consultivo",
        instructions: "Montar próximos passos e checklist.",
      },
    },
  });

  assert.equal(orchestration?.supportMode === "delegate_assisted", false);
  assert.equal(orchestration?.governance.policyDecision, "denied");
  assert.equal(orchestration?.governance.reasonCode, "RECIPE_ORCHESTRATION_CONTEXT_MISSING");
});
