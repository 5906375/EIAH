import test from "node:test";
import assert from "node:assert/strict";
import { buildRecipePrefillValues } from "./recipePrefill";
import { getAgentConfigBySlug, isGenericAgentConfig } from "./config";

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
