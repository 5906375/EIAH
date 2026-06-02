import test from "node:test";
import assert from "node:assert/strict";

import {
  PRESENTATION_SNAPSHOT_VERSION,
  hasGovernedImobSnapshotContract,
  isBackendGovernedImobSnapshot,
  resolveSnapshotQuickReplies,
  type MessagePresentationSnapshot,
} from "./chatPresentationSnapshot.ts";
import {
  buildDeterministicHelpReply,
  buildDeterministicImobReply,
  buildEiahQuickReplies,
  buildQuickRepliesForContext,
  createPresentationSnapshotV1,
  resolveEiahDecision,
  detectLauncherRouteIntent,
  resolveLauncherProposalDecision,
} from "./chatLauncherEngine.ts";

function createProposalSnapshot(
  overrides: Partial<MessagePresentationSnapshot> = {}
): MessagePresentationSnapshot {
  return {
    snapshotVersion: PRESENTATION_SNAPSHOT_VERSION,
    compatibilityMode: "snapshot",
    routeIntent: "proposal",
    eiahMode: "proposal",
    showConfidence: false,
    provenanceMode: "none",
    signals: [],
    quickReplies: [],
    renderVariant: "proposal",
    ...overrides,
  };
}

test("app shortcut input stays in help route and returns runs shortcut guidance", () => {
  assert.equal(detectLauncherRouteIntent("/app/runs#runs-criar", false), "help");

  const reply = buildDeterministicHelpReply("/app/runs#runs-criar");
  assert.ok(reply);
  assert.match(reply, /Runs/);
  assert.match(reply, /\/app\/runs#runs-criar/);
});

test("platform and pages help replies are distinct", () => {
  const platformReply = buildDeterministicHelpReply("explique a plataforma");
  const pagesReply = buildDeterministicHelpReply("explique as páginas");

  assert.ok(platformReply);
  assert.ok(pagesReply);
  assert.notEqual(platformReply, pagesReply);
  assert.match(platformReply, /chat, agentes, runs, billing e verticais/i);
  assert.match(pagesReply, /Runs|Agentes|Billing|Marketplace/i);
});

test("generic explanation prompts ask which platform area should be explained", () => {
  const howDecision = resolveEiahDecision({
    input: "como funciona",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const explainDecision = resolveEiahDecision({
    input: "explique",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(howDecision.kind, "help_reply");
  assert.equal(explainDecision.kind, "help_reply");
  assert.match(howDecision.content ?? "", /qual área quer entender agora/i);
  assert.match(howDecision.content ?? "", /plataforma como um todo|agentes|Chat IMOB|billing e quotas|marketplace/i);
  assert.match(explainDecision.content ?? "", /qual área quer entender agora/i);
});

test("clarification quick replies resolve to real EIAH help answers", () => {
  const cases = [
    {
      input: "Explicar plataforma",
      expected: /Como a plataforma EIAH se organiza/i,
    },
    {
      input: "Explicar agentes",
      expected: /Como funciona a área de Agentes/i,
    },
    {
      input: "Explicar Billing",
      expected: /Billing & Quotas|Controle financeiro/i,
    },
    {
      input: "Explicar Chat IMOB",
      expected: /Chat principal e Chat IMOB/i,
    },
  ];

  for (const testCase of cases) {
    const decision = resolveEiahDecision({
      input: testCase.input,
      routeIntent: "help",
      eiahMode: "help",
      agentProfile: null,
      catalogAgents: [],
      intentUnknown: false,
      accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
    });

    assert.equal(decision.kind, "help_reply");
    assert.match(decision.content ?? "", testCase.expected);
  }
});

test("follow-up quick replies resolve without falling into needs_run or generic capabilities", () => {
  const platformDecision = resolveEiahDecision({
    input: "plataforma como um todo",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const fastestPathDecision = resolveEiahDecision({
    input: "Me mostre o caminho mais rápido",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const agentsAvailableDecision = resolveEiahDecision({
    input: "Quero ver agentes disponíveis",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const chooseAgentDecision = resolveEiahDecision({
    input: "Qual agente devo usar para meu objetivo?",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(platformDecision.kind, "help_reply");
  assert.match(platformDecision.content ?? "", /Como a plataforma EIAH se organiza/i);

  assert.equal(fastestPathDecision.kind, "help_reply");
  assert.match(fastestPathDecision.content ?? "", /Qual página é melhor para seu objetivo/i);

  assert.equal(agentsAvailableDecision.kind, "help_reply");
  assert.match(agentsAvailableDecision.content ?? "", /Nenhum agente disponível neste workspace no momento|não aparece nenhum agente/i);

  assert.equal(chooseAgentDecision.kind, "help_reply");
  assert.match(chooseAgentDecision.content ?? "", /Qual agente devo usar para meu objetivo/i);
  assert.doesNotMatch(chooseAgentDecision.content ?? "", /EIAH pode te ajudar a entender a plataforma/i);
});

test("access and agents empty-state replies avoid redundant workspace checks when context is already known", () => {
  const accessDecision = resolveEiahDecision({
    input: "Verificar acesso",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const agentsAvailableDecision = resolveEiahDecision({
    input: "Quero ver agentes disponíveis",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(accessDecision.kind, "help_reply");
  assert.match(accessDecision.content ?? "", /Como verificar acesso/i);
  assert.doesNotMatch(accessDecision.content ?? "", /confirme o workspace ativo/i);
  assert.match(accessDecision.content ?? "", /acesso para usar agentes|módulo ou vertical desejado está ativo|recarregue a lista/i);

  assert.equal(agentsAvailableDecision.kind, "help_reply");
  assert.match(agentsAvailableDecision.content ?? "", /Nenhum agente disponível/i);
  assert.doesNotMatch(agentsAvailableDecision.content ?? "", /Você está no workspace correto/i);
  assert.match(agentsAvailableDecision.content ?? "", /acesso para usar agentes está ativo|habilitado neste workspace|recarregue a lista/i);
});

test("engine filters invalid EIAH quick replies before render", () => {
  const decision = resolveEiahDecision({
    input: "Me mostre o caminho mais rápido",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(decision.kind, "help_reply");
  assert.ok(decision.resolvedQuickReplies);
  assert.doesNotMatch((decision.resolvedQuickReplies ?? []).join(" | "), /Executar tarefa agora|Conversar com especialista/i);
  assert.match((decision.resolvedQuickReplies ?? []).join(" | "), /Entender custo e cobrança|Ativar agente no Marketplace|Revisar conta e workspace/i);
});

test("explicit tutor intents take precedence over broad heuristics outside help route", () => {
  const chooseAgentDecision = resolveEiahDecision({
    input: "Qual agente devo usar para meu objetivo?",
    routeIntent: "orchestrator",
    eiahMode: "orchestrator",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const platformDecision = resolveEiahDecision({
    input: "Explicar plataforma",
    routeIntent: "imob",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(chooseAgentDecision.kind, "help_reply");
  assert.match(chooseAgentDecision.content ?? "", /Qual agente devo usar para meu objetivo/i);
  assert.equal(chooseAgentDecision.presentationRouteIntent, "help");

  assert.equal(platformDecision.kind, "help_reply");
  assert.match(platformDecision.content ?? "", /Como a plataforma EIAH se organiza/i);
  assert.equal(platformDecision.presentationRouteIntent, "help");
});

test("engine marks fallback type explicitly as clarify, blocked and not_found", () => {
  const clarifyDecision = resolveEiahDecision({
    input: "como funciona",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const blockedDecision = resolveEiahDecision({
    input: "como funciona imob",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: false },
    },
  });
  const notFoundDecision = resolveEiahDecision({
    input: "blabla sem sentido total",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: true,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(clarifyDecision.kind, "help_reply");
  assert.equal(clarifyDecision.conversationState?.lastFallbackType, "clarify");

  assert.equal(blockedDecision.kind, "help_reply");
  assert.equal(blockedDecision.conversationState?.lastFallbackType, "blocked");

  assert.equal(notFoundDecision.kind, "contextual_fallback");
  assert.equal(notFoundDecision.conversationState?.lastFallbackType, "not_found");
});

test("engine resolves help by explicit priority: page then vertical then global", () => {
  const pageDecision = resolveEiahDecision({
    input: "como funciona o billing?",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const verticalDecision = resolveEiahDecision({
    input: "onde acompanho pipeline e etapas no IMOB?",
    routeIntent: "imob",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });
  const globalDecision = resolveEiahDecision({
    input: "Explicar plataforma",
    routeIntent: "imob",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(pageDecision.kind, "help_reply");
  assert.match(pageDecision.content ?? "", /billing combina pricing|Controle financeiro|Billing & Quotas/i);

  assert.equal(verticalDecision.kind, "imob_reply");
  assert.match(verticalDecision.content ?? "", /Onde acompanhar pipeline e etapas no IMOB/i);

  assert.equal(globalDecision.kind, "help_reply");
  assert.match(globalDecision.content ?? "", /Como a plataforma EIAH se organiza/i);
});

test("self-service help reply explains guided flows and recipes", () => {
  const reply = buildDeterministicHelpReply("como funciona o self-service?");

  assert.ok(reply);
  assert.match(reply, /Como funciona o Self-service/i);
  assert.match(reply, /fluxos guiados|recipes|workspace/i);
});

test("recipes help reply explains draft and homologated states", () => {
  const reply = buildDeterministicHelpReply("qual a diferenca entre draft e homologado?");

  assert.ok(reply);
  assert.match(reply, /Como funcionam recipes/i);
  assert.match(reply, /draft|homologated/i);
});

test("preview and production help reply differentiates simulation from execution", () => {
  const reply = buildDeterministicHelpReply("qual a diferenca entre preview e producao?");

  assert.ok(reply);
  assert.match(reply, /Preview, rodar agora e promover para producao/i);
  assert.match(reply, /Simular|Promover para producao|execucao real/i);
});

test("run creation help reply exposes clickable shortcut markdown", () => {
  const reply = buildDeterministicHelpReply("como criar um run no eiah?");

  assert.ok(reply);
  assert.match(reply, /\[Runs · criar\]\(\/app\/runs#runs-criar\)/);
});

test("billing help reply exposes clickable billing link", () => {
  const reply = buildDeterministicHelpReply("como funciona o billing?");

  assert.ok(reply);
  assert.match(reply, /Controle financeiro|Billing & Quotas/i);
  assert.match(reply, /filtro por período|ledger gaps|audit gaps|custo auditável/i);
  assert.match(reply, /Pricing oficial|Controle financeiro|Guia Interativo/i);
  assert.match(reply, /\[Billing\]\(\/app\/billing\)/);
  assert.match(reply, /\[Guia Interativo de Billing & Quotas\]\(\/app\/billing#billing-guide-footer\)/);
  assert.match(reply, /\[Pricing oficial\]\(\/app\/self-service#pricing-oficial\)/);
});

test("billing semantic help clarifies where to see price and difference from billing", () => {
  const wherePriceReply = buildDeterministicHelpReply("onde vejo o preço?");
  const compareReply = buildDeterministicHelpReply("qual a diferença entre pricing e billing?");

  assert.ok(wherePriceReply);
  assert.match(wherePriceReply, /Onde ver preço no EIAH|Pricing oficial/i);
  assert.match(wherePriceReply, /Billing/i);

  assert.ok(compareReply);
  assert.match(compareReply, /Pricing oficial|Controle financeiro|Guia Interativo/i);
  assert.match(compareReply, /preço do plano|visão financeira ampla|consumo real/i);
});

test("economy help reply explains page purpose and relation with billing and runs", () => {
  const reply = buildDeterministicHelpReply("como funciona a página economy?");

  assert.ok(reply);
  assert.match(reply, /Como funciona a página Economy/i);
  assert.match(reply, /oportunidades priorizadas|impacto estimado/i);
  assert.match(reply, /Billing|Runs/i);
});

test("marketplace help reply explains installation status and billing relation", () => {
  const reply = buildDeterministicHelpReply("como funciona o marketplace?");

  assert.ok(reply);
  assert.match(reply, /Como funciona o Marketplace/i);
  assert.match(reply, /não instalado|nao instalado|ativado/i);
  assert.match(reply, /Billing|preço|consumo/i);
});

test("profile help reply explains workspace validation and access context", () => {
  const reply = buildDeterministicHelpReply("como funciona a página perfil?");

  assert.ok(reply);
  assert.match(reply, /Como funciona a página Perfil/i);
  assert.match(reply, /workspace ativo|acesso/i);
  assert.match(reply, /Chat|Agentes|Marketplace/i);
});

test("agent not enabled help reply explains assignment versus billing", () => {
  const reply = buildDeterministicHelpReply("por que o agente nao esta habilitado no workspace?");

  assert.ok(reply);
  assert.match(reply, /agente nao esta habilitado no workspace/i);
  assert.match(reply, /workspaceAgentAssignment|billing|assignment/i);
});

test("site capabilities follow-up maps to platform overview instead of generic fallback", () => {
  const reply = buildDeterministicHelpReply("o que dá para fazer no site");

  assert.ok(reply);
  assert.match(reply, /Como a plataforma EIAH se organiza/i);
  assert.match(reply, /Runs|Agentes|Billing|Marketplace|IMOB/i);
});

test("fast-path follow-up does not fall into API help", () => {
  const reply = buildDeterministicHelpReply("passo a passo rápido sem cair em burocracia");

  assert.ok(reply);
  assert.match(reply, /Caminho rápido sem burocracia/i);
  assert.doesNotMatch(reply ?? "", /API no EIAH/i);
});

test("agents follow-up returns agents overview", () => {
  const reply = buildDeterministicHelpReply("Agentes.");

  assert.ok(reply);
  assert.match(reply, /Como pensar a área de Agentes/i);
  assert.match(reply, /especialista|workspace/i);
});

test("agents help replies explain cards and when to use EIAH versus specialist", () => {
  const cardsReply = buildDeterministicHelpReply("como ler os cards dos agentes?");
  const comparisonReply = buildDeterministicHelpReply("quando usar o EIAH e quando usar especialista?");

  assert.ok(cardsReply);
  assert.match(cardsReply, /Como ler os cards dos agentes/i);
  assert.match(cardsReply, /especialidade|disponibilidade|risco|integrações|comprovantes/i);

  assert.ok(comparisonReply);
  assert.match(comparisonReply, /Quando usar o EIAH e quando usar especialista/i);
  assert.match(comparisonReply, /triagem|profundidade/i);
});

test("chat help replies explain chat versus chat IMOB, triage, handoff and chat versus runs", () => {
  const chatVsImobReply = buildDeterministicHelpReply("qual a diferença entre chat e chat imob?");
  const triageReply = buildDeterministicHelpReply("como funciona a triagem do eiah?");
  const handoffReply = buildDeterministicHelpReply("como o eiah faz handoff para especialista?");
  const chatVsRunsReply = buildDeterministicHelpReply("quando usar chat versus runs?");

  assert.ok(chatVsImobReply);
  assert.match(chatVsImobReply, /Chat principal e Chat IMOB/i);
  assert.match(chatVsImobReply, /triagem|imobiliária|imobiliario|imobiliário/i);

  assert.ok(triageReply);
  assert.match(triageReply, /triagem do EIAH/i);
  assert.match(triageReply, /intenção|plataforma|especialista/i);

  assert.ok(handoffReply);
  assert.match(handoffReply, /handoff para especialista/i);
  assert.match(handoffReply, /profundidade|domínio|contexto/i);

  assert.ok(chatVsRunsReply);
  assert.match(chatVsRunsReply, /Quando usar Chat e quando usar Runs/i);
  assert.match(chatVsRunsReply, /executar|caminho|especialista/i);
});

test("documentary IMOB search entry routes to IMOB instead of generic help", () => {
  assert.equal(detectLauncherRouteIntent("Buscar contratos e propostas", false), "imob");

  const decision = resolveEiahDecision({
    input: "Buscar contratos e propostas",
    routeIntent: "imob",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(decision.kind, "imob_context_entry");
  assert.match(decision.content ?? "", /Busca documental IMOB/i);
  assert.match(decision.content ?? "", /contratos e propostas/i);
});

test("documentary IMOB search is fail-closed without entitlement", () => {
  const decision = resolveEiahDecision({
    input: "Buscar no acervo IMOB",
    routeIntent: "imob",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: false },
    },
  });

  assert.equal(decision.kind, "help_reply");
  assert.match(decision.content ?? "", /IMOB indisponível neste tenant\/workspace/i);
});

test("eiah self explain handles 'explique você' as self intro instead of generic fallback", () => {
  const decision = resolveEiahDecision({
    input: "explique você",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
  });

  assert.equal(decision.kind, "platform_self_explain");
  assert.match(decision.content ?? "", /assistente principal da plataforma/i);
});

test("generic platform question does not stay trapped in IMOB route context", () => {
  const decision = resolveEiahDecision({
    input: "explique como funciona",
    routeIntent: "imob",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: {
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      entitlements: { REAL_ESTATE_CORE: true },
    },
  });

  assert.equal(decision.kind, "help_reply");
  assert.match(decision.content ?? "", /Como a plataforma EIAH se organiza|plataforma/i);
  assert.doesNotMatch(decision.content ?? "", /Refere-se a imóveis/i);
});

test("economy tutor intents answer prioritization and page comparison", () => {
  const prioritize = resolveEiahDecision({
    input: "como priorizar oportunidades",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const compare = resolveEiahDecision({
    input: "qual a diferença entre economy billing e runs",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(prioritize.kind, "help_reply");
  assert.match(prioritize.content ?? "", /Como funciona a página Economy|Como priorizar oportunidades/i);
  assert.equal(compare.kind, "help_reply");
  assert.match(compare.content ?? "", /Economy, Billing e Runs/i);
});

test("billing tutor intents answer where to see price and semantic differences", () => {
  const wherePrice = resolveEiahDecision({
    input: "onde vejo o preço",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const compare = resolveEiahDecision({
    input: "qual a diferença entre pricing e billing",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(wherePrice.kind, "help_reply");
  assert.match(wherePrice.content ?? "", /Como usar Billing & Quotas|Onde ver preço no EIAH/i);
  assert.equal(compare.kind, "help_reply");
  assert.match(compare.content ?? "", /Pricing, Billing e reconciliação|Diferença semântica rápida/i);
});

test("marketplace tutor intents answer page overview, installation status and billing relation", () => {
  const overview = resolveEiahDecision({
    input: "como funciona o marketplace",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const status = resolveEiahDecision({
    input: "o que significa não instalado",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const billingRelation = resolveEiahDecision({
    input: "ativar no marketplace gera cobrança",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(overview.kind, "help_reply");
  assert.match(overview.content ?? "", /Como funciona o Marketplace/i);
  assert.equal(status.kind, "help_reply");
  assert.match(status.content ?? "", /Como funciona o Marketplace|não instalado|ativado/i);
  assert.equal(billingRelation.kind, "help_reply");
  assert.match(billingRelation.content ?? "", /Marketplace e cobrança|Como funciona o Marketplace/i);
});

test("profile tutor intents answer page overview, workspace selection and access verification", () => {
  const overview = resolveEiahDecision({
    input: "como funciona a página perfil",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const workspace = resolveEiahDecision({
    input: "como selecionar workspace correto",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const access = resolveEiahDecision({
    input: "como verificar acesso no workspace",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(overview.kind, "help_reply");
  assert.match(overview.content ?? "", /Como funciona a página Perfil/i);
  assert.equal(workspace.kind, "help_reply");
  assert.match(workspace.content ?? "", /Como funciona a página Perfil|Como selecionar o workspace/i);
  assert.equal(access.kind, "help_reply");
  assert.match(access.content ?? "", /Como verificar acesso/i);
});

test("agents tutor intents answer page overview, card reading and EIAH versus specialist", () => {
  const overview = resolveEiahDecision({
    input: "como funciona a área de agentes",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const cards = resolveEiahDecision({
    input: "como ler os cards dos agentes",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const comparison = resolveEiahDecision({
    input: "qual a diferença entre eiah e especialista",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(overview.kind, "help_reply");
  assert.match(overview.content ?? "", /Como funciona a área de Agentes|Como pensar a área de Agentes/i);
  assert.equal(cards.kind, "help_reply");
  assert.match(cards.content ?? "", /Como ler os cards dos agentes/i);
  assert.equal(comparison.kind, "help_reply");
  assert.match(comparison.content ?? "", /Quando usar o EIAH e quando usar especialista/i);
});

test("chat tutor intents answer comparison, triage, handoff and chat versus runs", () => {
  const chatVsImob = resolveEiahDecision({
    input: "qual a diferença entre chat e chat imob",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const triage = resolveEiahDecision({
    input: "como funciona a triagem do eiah",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const handoff = resolveEiahDecision({
    input: "como o eiah faz handoff para especialista",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const chatVsRuns = resolveEiahDecision({
    input: "qual a diferença entre chat e runs",
    routeIntent: "help",
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.equal(chatVsImob.kind, "help_reply");
  assert.match(chatVsImob.content ?? "", /Chat principal e Chat IMOB/i);
  assert.equal(triage.kind, "help_reply");
  assert.match(triage.content ?? "", /triagem do EIAH/i);
  assert.equal(handoff.kind, "help_reply");
  assert.match(handoff.content ?? "", /handoff para especialista/i);
  assert.equal(chatVsRuns.kind, "help_reply");
  assert.match(chatVsRuns.content ?? "", /Quando usar Chat e quando usar Runs/i);
});

test("imob deterministic replies differentiate what is, end-to-end, navigation and install", () => {
  assert.match(buildDeterministicImobReply("Tá mas o que é IMOB ?") ?? "", /O que é o IMOB/i);
  assert.match(buildDeterministicImobReply("O que é o IMOB?") ?? "", /O que é o IMOB/i);
  assert.match(buildDeterministicImobReply("fale sobre o IMOB") ?? "", /O que é o IMOB/i);
  assert.match(buildDeterministicImobReply("Como funciona IMOB do início ao fim?") ?? "", /do início ao fim/i);
  assert.match(
    buildDeterministicImobReply("Onde acompanho pipeline e etapas no IMOB?") ?? "",
    /\/app\/imob\/dashboard/
  );
  assert.match(
    buildDeterministicImobReply("Quero instalar o IMOB no workspace.") ?? "",
    /\/app\/marketplace\/imob/
  );
});

test("imob deterministic reply prioritizes locacao context over generic overview", () => {
  const reply = buildDeterministicImobReply("tenho imobiliária e quero captar clientes para locação");

  assert.ok(reply);
  assert.match(reply, /Se o foco é locação/i);
  assert.match(reply, /captação|anúncio|proposta de locação/i);
});

test("imob sell-value follow-up explains how the vertical helps selling", () => {
  const reply = buildDeterministicImobReply("como vai ajudar a vender um imóvel?");

  assert.ok(reply);
  assert.match(reply, /Como o IMOB ajuda a vender um imóvel/i);
  assert.match(reply, /captação|proposta|negociação|contrato/i);
});

test("imob shortcuts follow-up explains what the shortcuts mean", () => {
  const reply = buildDeterministicImobReply("o que é esses atalhos ?");

  assert.ok(reply);
  assert.match(reply, /O que são esses atalhos no IMOB/i);
  assert.match(reply, /Dashboard IMOB|Chat IMOB|Marketplace IMOB/i);
});

test("imob overview reply exposes clickable shortcut markdown", () => {
  const reply = buildDeterministicImobReply("explique como funciona a vertical imob");

  assert.ok(reply);
  assert.match(reply ?? "", /assistente operacional agent-driven/i);
  assert.match(reply ?? "", /\[Dashboard IMOB\]\(\/app\/imob\/dashboard\)/);
  assert.match(reply ?? "", /\[Chat IMOB\]\(\/app\/imob\/chat\)/);
  assert.match(reply ?? "", /\[Instalação do IMOB\]\(\/app\/marketplace\/imob\)/);
});

test("imob install reply exposes clickable shortcut markdown", () => {
  const reply = buildDeterministicImobReply("Quero instalar o IMOB no workspace.");

  assert.ok(reply);
  assert.match(reply ?? "", /\[Marketplace IMOB\]\(\/app\/marketplace\/imob\)/);
  assert.match(reply ?? "", /\[Dashboard IMOB\]\(\/app\/imob\/dashboard\)/);
  assert.match(reply ?? "", /\[Chat IMOB\]\(\/app\/imob\/chat\)/);
});

test("imob workspace onboarding reply explains how to proceed after new client/workspace setup", () => {
  const reply = buildDeterministicImobReply("cadastrei cliente novo, entrei no chat e no marketplace, como seguir agora no workspace novo?");

  assert.ok(reply);
  assert.match(reply ?? "", /workspace novo com IMOB/i);
  assert.match(reply ?? "", /Ativar módulo/i);
  assert.match(reply ?? "", /\[Marketplace IMOB\]\(\/app\/marketplace\/imob\)/);
  assert.match(reply ?? "", /\[Chat IMOB\]\(\/app\/imob\/chat\)/);
  assert.match(reply ?? "", /\[Dashboard IMOB\]\(\/app\/imob\/dashboard\)/);
  assert.match(reply ?? "", /qualificar lead comprador|captar imóvel|gerar proposta/i);
});

test("imob workspace onboarding reply accepts natural registration variants", () => {
  const variants = [
    "me cadastrei e entrei no marketplace, como seguir agora no workspace novo?",
    "fiz cadastro do cliente e entrei no chat, como seguir agora?",
    "cliente recém cadastrado, entrei no marketplace IMOB, qual o próximo passo?",
  ];

  for (const input of variants) {
    const reply = buildDeterministicImobReply(input);
    assert.ok(reply, input);
    assert.match(reply ?? "", /Ativar módulo/i, input);
    assert.match(reply ?? "", /\[Marketplace IMOB\]\(\/app\/marketplace\/imob\)/, input);
    assert.match(reply ?? "", /\[Chat IMOB\]\(\/app\/imob\/chat\)/, input);
  }
});

test("imob shortcut selections return the chosen shortcut as a clickable link", () => {
  const dashboardReply = buildDeterministicImobReply("Dashboard IMOB: /app/imob/dashboard");
  const chatReply = buildDeterministicImobReply("Chat IMOB: /app/imob/chat");

  assert.match(dashboardReply ?? "", /\[Dashboard IMOB\]\(\/app\/imob\/dashboard\)/);
  assert.match(chatReply ?? "", /\[Chat IMOB\]\(\/app\/imob\/chat\)/);
});

test("proposal quick replies change by saas stage", () => {
  assert.deepEqual(
    buildEiahQuickReplies({
      routeIntent: "proposal",
      proposalMode: true,
      proposalDomain: "saas",
      conversationStage: "proposal_recommended",
    }),
    ["Abrir proposta comercial", "Agendar demonstração", "Criar trial assistido"]
  );

  assert.deepEqual(
    buildEiahQuickReplies({
      routeIntent: "proposal",
      proposalMode: true,
      proposalDomain: "saas",
      conversationStage: "proposal_demo_requested",
    }),
    ["Quero agendar demonstração", "Criar trial assistido", "Quero falar com comercial"]
  );
});

test("IMOB documentary search quick replies are specific to the knowledge handshake", () => {
  assert.deepEqual(
    buildEiahQuickReplies({
      routeIntent: "imob",
      proposalMode: false,
      sourceInput: "Buscar materiais de captação",
    }),
    [
      "Buscar no acervo IMOB",
      "Buscar contratos e propostas",
      "Buscar materiais de captação",
      "Buscar por cidade ou região",
    ]
  );
});

test("IMOB generic help quick replies are not inferred by the launcher engine", () => {
  assert.deepEqual(
    buildEiahQuickReplies({
      routeIntent: "imob",
      proposalMode: false,
      sourceInput: "o que é o imob?",
    }),
    []
  );
});

test("resolved quick replies take precedence over launcher copy and route replies", () => {
  assert.deepEqual(
    buildQuickRepliesForContext({
      agentProfile: {
        id: "EIAH",
        name: "EIAH",
        chatCopy: { quickReplies: ["copy A", "copy B"] },
      } as any,
      routeIntent: "help",
      isHelpCenterMode: true,
      proposalMode: false,
      sourceInput: "quero entender billing",
      resolvedQuickReplies: ["resolved 1", "resolved 2"],
    }),
    ["resolved 1", "resolved 2"]
  );
});

test("IMOB vertical replies are not inferred from frontend heuristics without resolved payload", () => {
  assert.deepEqual(
    buildQuickRepliesForContext({
      agentProfile: {
        id: "EIAH",
        name: "EIAH",
        chatCopy: { quickReplies: ["copy A", "copy B"] },
      } as any,
      routeIntent: "imob",
      isHelpCenterMode: true,
      proposalMode: false,
      sourceInput: "o que é o imob?",
    }),
    ["copy A", "copy B"]
  );
});

test("IMOB snapshot marks backend-governed render-only runtime when quick replies come from resolved payload", () => {
  const snapshot = createPresentationSnapshotV1({
    agentProfile: {
      id: "EIAH",
      name: "EIAH",
      chatCopy: { quickReplies: ["copy A", "copy B"] },
      uxContract: { trustSignals: [], defaultCTA: "", responseShape: "brief_answer", maxCognitiveLoad: "low" },
      knowledgePolicy: { provenancePolicy: "none" },
    } as any,
    routeIntent: "imob",
    eiahMode: "help",
    confidence: 0.8,
    renderVariant: "guided_flow",
    sourceInput: "mostrar bloqueios do caso",
    isHelpCenterMode: true,
    proposalMode: false,
    attachmentIntake: {
      enabled: false,
      acceptedKinds: [],
      intakeModes: [],
      analysisModes: [],
      primaryActionLabel: undefined,
      secondaryActionLabel: undefined,
      helpText: undefined,
    },
    resolvedQuickReplies: ["consultar caso case-1", "revisar documentos"],
  });

  assert.equal(snapshot.quickReplySource, "backend_payload");
  assert.equal(snapshot.governedRuntime?.domain, "IMOB");
  assert.equal(snapshot.governedRuntime?.launcherPolicy, "render_only");
  assert.ok(hasGovernedImobSnapshotContract(snapshot));
  assert.ok(isBackendGovernedImobSnapshot(snapshot));
});

test("legacy conservative snapshot still suppresses quick replies even if payload exists", () => {
  const snapshot: MessagePresentationSnapshot = {
    snapshotVersion: PRESENTATION_SNAPSHOT_VERSION,
    compatibilityMode: "legacy_conservative",
    quickReplySource: "backend_payload",
    verticalContext: "IMOB",
    routeIntent: "imob",
    eiahMode: "help",
    showConfidence: false,
    provenanceMode: "none",
    signals: [],
    nextDecision: undefined,
    quickReplies: ["consultar caso case-1"],
    renderVariant: "guided_flow",
    governedRuntime: {
      domain: "IMOB",
      contractVersion: "imob.crm.governed.v1",
      launcherPolicy: "render_only",
      quickRepliesSource: "backend_payload",
      recommendedActionsSource: "backend_payload",
      agentActivitiesSource: "backend_payload",
    },
  };

  assert.deepEqual(snapshot.quickReplies, ["consultar caso case-1"]);
  assert.deepEqual(resolveSnapshotQuickReplies(snapshot), []);
});

test("inconsistent governed IMOB snapshot fails closed and does not expose quick replies", () => {
  const snapshot: MessagePresentationSnapshot = {
    snapshotVersion: PRESENTATION_SNAPSHOT_VERSION,
    compatibilityMode: "snapshot",
    quickReplySource: "frontend_copy",
    verticalContext: "IMOB",
    routeIntent: "imob",
    eiahMode: "help",
    showConfidence: false,
    provenanceMode: "none",
    signals: [],
    nextDecision: undefined,
    quickReplies: ["consultar caso case-1"],
    renderVariant: "guided_flow",
    governedRuntime: {
      domain: "IMOB",
      contractVersion: "imob.crm.governed.v1",
      launcherPolicy: "render_only",
      quickRepliesSource: "backend_payload",
      recommendedActionsSource: "backend_payload",
      agentActivitiesSource: "backend_payload",
    },
  };

  assert.equal(hasGovernedImobSnapshotContract(snapshot), false);
  assert.equal(isBackendGovernedImobSnapshot(snapshot), false);
  assert.deepEqual(resolveSnapshotQuickReplies(snapshot), []);
});

test("IMOB governed snapshot does not promote defaultNextStep into an extra quick reply", () => {
  const snapshot = createPresentationSnapshotV1({
    agentProfile: {
      id: "EIAH",
      name: "EIAH",
      chatCopy: { quickReplies: ["copy A"], defaultNextStep: "chip inventado pelo launcher" },
      uxContract: { trustSignals: [], defaultCTA: "", responseShape: "brief_answer", maxCognitiveLoad: "low" },
      knowledgePolicy: { provenancePolicy: "none" },
    } as any,
    routeIntent: "imob",
    eiahMode: "help",
    renderVariant: "guided_flow",
    sourceInput: "consultar caso",
    isHelpCenterMode: true,
    proposalMode: false,
    attachmentIntake: {
      enabled: false,
      acceptedKinds: [],
      intakeModes: [],
      analysisModes: [],
      primaryActionLabel: undefined,
      secondaryActionLabel: undefined,
      helpText: undefined,
    },
    resolvedQuickReplies: ["consultar caso", "mostrar pendências do caso"],
  });

  assert.deepEqual(resolveSnapshotQuickReplies(snapshot), ["consultar caso", "mostrar pendências do caso"]);
  assert.ok(!resolveSnapshotQuickReplies(snapshot).includes("chip inventado pelo launcher"));
});

test("governed IMOB snapshot requires imob route intent to be considered render-only", () => {
  const snapshot: MessagePresentationSnapshot = {
    snapshotVersion: PRESENTATION_SNAPSHOT_VERSION,
    compatibilityMode: "snapshot",
    quickReplySource: "backend_payload",
    verticalContext: "IMOB",
    routeIntent: "help",
    eiahMode: "help",
    showConfidence: false,
    provenanceMode: "none",
    signals: [],
    nextDecision: undefined,
    quickReplies: ["consultar caso case-1"],
    renderVariant: "guided_flow",
    governedRuntime: {
      domain: "IMOB",
      contractVersion: "imob.crm.governed.v1",
      launcherPolicy: "render_only",
      quickRepliesSource: "backend_payload",
      recommendedActionsSource: "backend_payload",
      agentActivitiesSource: "backend_payload",
    },
  };

  assert.equal(hasGovernedImobSnapshotContract(snapshot), false);
  assert.equal(isBackendGovernedImobSnapshot(snapshot), false);
  assert.deepEqual(resolveSnapshotQuickReplies(snapshot), []);
});

test("proposal quote keeps saas context and recommends a plan", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        ok: true,
        data: {
          formula: "base + usage",
          options: {
            economica: { recommended: { label: "Solo", code: "solo", totalCents: 66500 } },
            equilibrio: { recommended: { label: "Starter", code: "starter", totalCents: 149000 } },
            escala: { recommended: { label: "Growth", code: "growth", totalCents: 399000 } },
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    )) as typeof fetch;

  try {
    const decision = await resolveLauncherProposalDecision({
      input: "Tenho 3 usuários e 2000 runs/mês. Qual plano?",
      routeIntent: "proposal",
      proposalMode: true,
      eiahMode: "proposal",
      agentProfile: null,
    });

    assert.ok(decision);
    assert.equal(decision.kind, "proposal_reply");
    assert.equal(decision.conversationStage, "proposal_recommended");
    assert.equal(decision.proposalDomain, "saas");
    assert.match(decision.content ?? "", /Starter \(STARTER\)/);
    assert.match(decision.content ?? "", /Abrir proposta comercial/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("opening a commercial proposal reuses prior users and runs context", async () => {
  const decision = await resolveLauncherProposalDecision({
    input: "Abrir proposta comercial",
    routeIntent: "proposal",
    proposalMode: true,
    eiahMode: "proposal",
    agentProfile: null,
    previousUserMessage: "Tenho 3 usuários e 2000 runs/mês. Qual plano?",
    previousAssistantMessage: "Resumo do cenário 3 usuários e 2000 runs/mês.",
    previousAssistantSnapshot: createProposalSnapshot({
      proposalDomain: "saas",
      conversationStage: "proposal_recommended",
    }),
  });

  assert.ok(decision);
  assert.equal(decision.conversationStage, "proposal_ready_to_open");
  assert.equal(decision.proposalContextRecovered, true);
  assert.match(decision.content ?? "", /compra nova ou expansão do workspace/i);
});

test("scheduling a demo preserves recovered proposal usage context", async () => {
  const decision = await resolveLauncherProposalDecision({
    input: "Agendar demonstração",
    routeIntent: "proposal",
    proposalMode: true,
    eiahMode: "proposal",
    agentProfile: null,
    previousUserMessage: "Tenho 3 usuários e 2000 runs/mês. Qual plano?",
    previousAssistantMessage: "Resumo do cenário 3 usuários e 2000 runs/mês.",
    previousAssistantSnapshot: createProposalSnapshot({
      proposalDomain: "saas",
      conversationStage: "proposal_recommended",
    }),
  });

  assert.ok(decision);
  assert.equal(decision.conversationStage, "proposal_demo_ready");
  assert.equal(decision.proposalContextRecovered, true);
  assert.match(decision.content ?? "", /3 usuários e 2000 runs\/mês/i);
});

test("workspace expansion continues the commercial flow instead of resetting to generic help", async () => {
  const decision = await resolveLauncherProposalDecision({
    input: "É expansão do workspace",
    routeIntent: "proposal",
    proposalMode: true,
    eiahMode: "proposal",
    agentProfile: null,
    previousUserMessage: "Tenho 3 usuários e 2000 runs/mês. Qual plano?",
    previousAssistantMessage: "Já registrei 3 usuários e 2000 runs/mês para a proposta.",
    previousAssistantSnapshot: createProposalSnapshot({
      proposalDomain: "saas",
      conversationStage: "proposal_ready_to_open",
    }),
  });

  assert.ok(decision);
  assert.equal(decision.conversationStage, "proposal_opening");
  assert.match(decision.content ?? "", /expansão do workspace/i);
});
