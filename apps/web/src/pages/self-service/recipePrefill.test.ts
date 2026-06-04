import test from "node:test";
import assert from "node:assert/strict";
import { buildRecipePrefillValues } from "./recipePrefill";
import { getAgentConfigBySlug, isGenericAgentConfig, resolveRecipeAwareFields } from "./config";

test("guardian recipe prefill distributes summary and instructions into operational fields", () => {
  const config = getAgentConfigBySlug("guardian");
  assert.ok(config && isGenericAgentConfig(config));

  const values = buildRecipePrefillValues(config, {
    id: "recipe-1",
    tenantId: "tenant-A",
    agentId: "guardian",
    title: "Go-live Controlado EIAH — Domain, DNS, API e Evidências",
    summary:
      "Guia o workspace na preparação, validação e publicação controlada do EIAH na web.",
    instructions:
      "Objetivo:\nGuiar o workspace no go-live controlado.\n\nVocê é o Guardian.\nValidar domínio, DNS, WAF e evidências.\n\nEscopo: workspace selecionado",
    status: "homologated",
    workspaceScope: { mode: "selected_workspaces", workspaceIds: ["workspace-A"] },
    tags: ["guardian"],
    createdByUserId: null,
    updatedByUserId: null,
    homologatedAt: null,
    deprecatedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert.equal(values.requestType, "go_live_controlado.domain_dns_api_evidencias");
  assert.match(values.objective, /go-live controlado/i);
  assert.match(values.evidence, /waf|evidências/i);
  assert.match(values.notes, /tenantId\/workspaceId|fail-closed|waf/i);
  assert.notEqual(values.evidence, values.notes);
  assert.ok(values.notes.length < 400);
});

test("generic support recipe prefill builds contextual question and desired outcome", () => {
  const config = getAgentConfigBySlug("eiah");
  assert.ok(config && isGenericAgentConfig(config));

  const values = buildRecipePrefillValues(config, {
    id: "recipe-2",
    tenantId: "tenant-A",
    agentId: "EIAH",
    title: "Ajuda de pricing para workspace",
    summary: "Explica preço, billing e trilha de cobrança.",
    instructions: "Objetivo: orientar o operador sobre pricing oficial e billing.",
    status: "homologated",
    workspaceScope: { mode: "selected_workspaces", workspaceIds: ["workspace-A"] },
    tags: ["billing"],
    createdByUserId: null,
    updatedByUserId: null,
    homologatedAt: null,
    deprecatedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert.match(values.question, /ajuda de pricing/i);
  assert.match(values.context, /pricing/i);
  assert.match(values.desiredOutcome, /orientar o operador/i);
});

test("guardian segregation recipe prefill and fields align with the linked recipe intent", () => {
  const config = getAgentConfigBySlug("guardian");
  assert.ok(config && isGenericAgentConfig(config));

  const recipe = {
    id: "recipe-3",
    tenantId: "tenant-A",
    agentId: "guardian",
    title: "Validar segregação app/api entre staging e produção",
    summary:
      "Confere se app.eiah.<tld> e api.eiah.<tld> estão separados de app.staging e api.staging sem mistura de URLs.",
    instructions:
      "Objetivo: validar segregação real entre staging e produção para frontend e API.\n\nChecks obrigatórios:\n1. Confirmar que produção não consome API staging.\n2. Confirmar que staging não consome API de produção.",
    status: "homologated",
    workspaceScope: { mode: "selected_workspaces", workspaceIds: ["workspace-A"] },
    tags: ["guardian", "go-live", "staging", "production", "api", "frontend"],
    createdByUserId: null,
    updatedByUserId: null,
    homologatedAt: null,
    deprecatedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const values = buildRecipePrefillValues(config, recipe);
  assert.equal(values.requestType, "go_live_controlado.segregacao_app_api_staging_producao");

  const fields = resolveRecipeAwareFields(config, recipe);
  const requestTypeField = fields.find((field) => field.key === "requestType");
  const objectiveField = fields.find((field) => field.key === "objective");
  const evidenceField = fields.find((field) => field.key === "evidence");

  assert.equal(requestTypeField?.label, "Checkpoint de segregação / rota alvo");
  assert.match(requestTypeField?.helper ?? "", /staging e produção não estão misturados/i);
  assert.equal(objectiveField?.label, "Objetivo principal da recipe");
  assert.equal(evidenceField?.label, "Evidências esperadas pela recipe");
});

test("structured recipe content is preferred over legacy instructions in guardian prefill", () => {
  const config = getAgentConfigBySlug("guardian");
  assert.ok(config && isGenericAgentConfig(config));

  const values = buildRecipePrefillValues(config, {
    id: "recipe-4",
    tenantId: "tenant-A",
    agentId: "guardian",
    title: "Plano principal de go-live",
    summary: "Recipe estruturada para produção controlada.",
    instructions: "Objetivo: texto antigo que não deveria ganhar prioridade.",
    status: "homologated",
    workspaceScope: { mode: "selected_workspaces", workspaceIds: ["workspace-A"] },
    tags: ["guardian", "go-live"],
    content: {
      schemaVersion: "v2",
      mode: "staged",
      goal: "Validar produção controlada do EIAH.",
      expectedOutcome: "Receber GO após todas as etapas.",
      goCondition: "Todas as etapas concluídas",
      blockCondition: "Pendências críticas abertas",
      steps: [
        {
          id: "step-1",
          title: "Segregação",
          objective: "Separar staging e produção",
          checks: ["Produção não consome staging"],
          evidence: ["Snapshot de env vars"],
          blocking: true,
        },
        {
          id: "step-2",
          title: "Health",
          objective: "Validar /api/health",
          checks: ["HTTP 200"],
          evidence: ["Resposta do endpoint"],
          blocking: true,
        },
      ],
    },
    createdByUserId: null,
    updatedByUserId: null,
    homologatedAt: null,
    deprecatedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  assert.equal(values.requestType, "go_live_controlado.plano_principal_web");
  assert.match(values.objective, /produção controlada do eiah/i);
  assert.match(values.notes, /1\. Segregação/i);
  assert.match(values.evidence, /Snapshot de env vars/i);
});
