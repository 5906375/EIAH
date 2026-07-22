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
  buildLauncherPersistenceTelemetry,
  buildQuickRepliesForContext,
  createLauncherPresentationSnapshot,
  createPresentationSnapshotV1,
  resolveEiahDecision,
  detectLauncherRouteIntent,
  fallbackHelpMarkdown,
  resolveLauncherAgentProfile,
  resolveQuickReplyUsed,
  resolveLauncherProposalDecision,
  resolveImobRuntimeShadowQuickSummary,
  resolveImobRuntimeShadowRenderState,
  resolveImobRuntimeShadowSummaryForTurn,
  enrichLauncherDecisionWithImobRuntimeShadow,
  resolveLauncherTurnDecision,
  type LauncherLocalDecision,
} from "./chatLauncherEngine.ts";
import type { ImobRuntimeShadowEngineRequest } from "../../features/imob/imobRuntimeShadowClient";
import {
  resolveImobJourneyStage,
  resolveImobLauncherSurfaceDecision,
  buildImobInputPlaceholderForInput,
} from "./imobContextResolver.ts";
import { resolveHelpDictionarySnapshot } from "./helpDictionaryResolver.ts";
import {
  buildChatRouteEntryTelemetry,
  resolveChatRouteEntryKind,
  sanitizeChatRouteTelemetryPayload,
} from "./chatRouteTelemetry.ts";

test("chat route telemetry distinguishes plain and deep-link entries", () => {
  assert.equal(resolveChatRouteEntryKind({ search: "", hash: "" }), "plain");
  assert.equal(resolveChatRouteEntryKind({ search: "?domain=imob", hash: "" }), "deep_link");
  assert.equal(resolveChatRouteEntryKind({ search: "", hash: "#chat-agent-launcher" }), "deep_link");
});

test("chat route telemetry emits a content-free route baseline envelope", () => {
  assert.deepEqual(
    buildChatRouteEntryTelemetry({
      surfaceRoute: "/app/chat",
      search: "?domain=imob",
      hash: "#chat-agent-launcher",
      domainHint: " imob ",
    }),
    {
      event: "route_entry",
      surfaceRoute: "/app/chat",
      entryKind: "deep_link",
      domainHint: "imob",
      selectedVertical: null,
    },
  );
});

test("chat route telemetry omits arbitrary domain hints containing fake PII", () => {
  assert.deepEqual(
    sanitizeChatRouteTelemetryPayload({
      event: "route_entry",
      surfaceRoute: "/app/chat",
      domainHint: "email@example.com",
    }),
    {
      event: "route_entry",
      surfaceRoute: "/app/chat",
    },
  );
});

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

test("governed fallback help markdown preserves current launcher copy", () => {
  assert.equal(
    fallbackHelpMarkdown(),
    [
      "**Resumo**",
      "Não consegui montar uma resposta útil com clareza para esse pedido.",
      "",
      "Se quiser, você pode me pedir de um destes jeitos:",
      "- `como usar o IMOB`",
      "- `como criar um run`",
      "- `quais agentes posso usar`",
      "- `como funciona o billing`",
    ].join("\n")
  );
});

test("resolveQuickReplyUsed returns true when input matches previous quick reply", () => {
  assert.equal(
    resolveQuickReplyUsed({
      previousAssistantSnapshot: {
        ...createProposalSnapshot(),
        quickReplies: ["Explicar plataforma", "Como criar um run"],
      },
      input: "como criar um run",
    }),
    true
  );
});

test("resolveQuickReplyUsed returns false when input does not match previous quick replies", () => {
  assert.equal(
    resolveQuickReplyUsed({
      previousAssistantSnapshot: {
        ...createProposalSnapshot(),
        quickReplies: ["Explicar plataforma", "Como criar um run"],
      },
      input: "quero falar sobre billing",
    }),
    false
  );
});

test("resolveQuickReplyUsed returns false without previous snapshot or quick replies", () => {
  assert.equal(
    resolveQuickReplyUsed({
      previousAssistantSnapshot: null,
      input: "como criar um run",
    }),
    false
  );

  assert.equal(
    resolveQuickReplyUsed({
      previousAssistantSnapshot: {
        ...createProposalSnapshot(),
        quickReplies: [],
      },
      input: "como criar um run",
    }),
    false
  );
});

test("buildLauncherPersistenceTelemetry marks fallback persistence flags and transports quick reply usage", () => {
  const telemetry = buildLauncherPersistenceTelemetry({
    decision: {
      kind: "contextual_fallback",
      presentationRouteIntent: "help",
      proposalContextRecovered: true,
      proposalContextLost: false,
      proposalDomainMismatch: true,
    },
    quickReplyUsed: true,
  });

  assert.deepEqual(telemetry, {
    responseRejected: true,
    fallbackUsed: true,
    clarificationIssued: false,
    handoffOffered: false,
    handoffEligible: false,
    genericTutorialObserved: false,
    proposalDomain: null,
    conversationStage: null,
    proposalContextRecovered: true,
    proposalContextLost: false,
    proposalDomainMismatch: true,
    quickReplyUsed: true,
  });
});

test("buildLauncherPersistenceTelemetry preserves non-fallback shape for clarification decisions", () => {
  const telemetry = buildLauncherPersistenceTelemetry({
    decision: {
      kind: "clarification",
      presentationRouteIntent: "help",
    },
  });

  assert.equal(telemetry.responseRejected, false);
  assert.equal(telemetry.fallbackUsed, false);
  assert.equal(telemetry.quickReplyUsed, false);
  assert.equal(telemetry.clarificationIssued, true);
  assert.equal(telemetry.handoffOffered, false);
  assert.equal(telemetry.handoffEligible, false);
  assert.equal(telemetry.genericTutorialObserved, false);
  assert.equal(telemetry.proposalDomain, null);
  assert.equal(telemetry.conversationStage, null);
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
  const snapshot = resolveHelpDictionarySnapshot({
    input: "como funciona o self-service?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.match(snapshot?.content ?? "", /Como funciona o Self-service/i);
  assert.match(snapshot?.content ?? "", /fluxos guiados|recipes|workspace/i);
  assert.equal(snapshot?.intent.scopeHint, "workflow");
});

test("recipes help reply explains draft and homologated states", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "qual a diferenca entre draft e homologado?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.match(snapshot?.content ?? "", /Como funcionam recipes/i);
  assert.match(snapshot?.content ?? "", /draft|homologated/i);
  assert.equal(snapshot?.intent.scopeHint, "workflow");
});

test("preview and production help reply differentiates simulation from execution", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "qual a diferenca entre preview e producao?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.match(snapshot?.content ?? "", /Preview, rodar agora e promover para producao/i);
  assert.match(snapshot?.content ?? "", /Simular|Promover para producao|execucao real/i);
  assert.equal(snapshot?.intent.scopeHint, "workflow");
});

test("run creation help reply exposes clickable shortcut markdown", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "como criar um run no eiah?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.match(snapshot?.content ?? "", /\[Runs · criar\]\(\/app\/runs#runs-criar\)/);
  assert.equal(snapshot?.intent.scopeHint, "workflow");
});

test("billing help reply exposes clickable billing link", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "como funciona o billing?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.match(snapshot?.content ?? "", /Controle financeiro|Billing & Quotas/i);
  assert.match(snapshot?.content ?? "", /filtro por período|ledger gaps|audit gaps|custo auditável/i);
  assert.match(snapshot?.content ?? "", /Pricing oficial|Controle financeiro|Guia Interativo/i);
  assert.match(snapshot?.content ?? "", /\[Billing\]\(\/app\/billing\)/);
  assert.match(snapshot?.content ?? "", /\[Guia Interativo de Billing & Quotas\]\(\/app\/billing#billing-guide-footer\)/);
  assert.match(snapshot?.content ?? "", /\[Pricing oficial\]\(\/app\/self-service#pricing-oficial\)/);
  assert.equal(snapshot?.intent.scopeHint, "page");
});

test("billing semantic help clarifies where to see price and difference from billing", () => {
  const wherePriceReply = resolveHelpDictionarySnapshot({
    input: "onde vejo o preço?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const compareReply = resolveHelpDictionarySnapshot({
    input: "qual a diferença entre pricing e billing?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(wherePriceReply);
  assert.match(wherePriceReply?.content ?? "", /Onde ver preço no EIAH|Pricing oficial/i);
  assert.match(wherePriceReply?.content ?? "", /Billing/i);
  assert.equal(wherePriceReply?.intent.scopeHint, "billing");

  assert.ok(compareReply);
  assert.match(compareReply?.content ?? "", /Pricing oficial|Controle financeiro|Guia Interativo/i);
  assert.match(compareReply?.content ?? "", /preço do plano|visão financeira ampla|consumo real/i);
  assert.equal(compareReply?.intent.scopeHint, "billing");
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
  const snapshot = resolveHelpDictionarySnapshot({
    input: "por que o agente nao esta habilitado no workspace?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.match(snapshot?.content ?? "", /agente nao esta habilitado no workspace/i);
  assert.match(snapshot?.content ?? "", /billing|workspace/i);
  assert.equal(snapshot?.intent.scopeHint, "governance");
});

test("site capabilities follow-up maps to platform overview instead of generic fallback", () => {
  const reply = buildDeterministicHelpReply("o que dá para fazer no site");

  assert.ok(reply);
  assert.match(reply, /Como a plataforma EIAH se organiza/i);
  assert.match(reply, /Runs|Agentes|Billing|Marketplace|IMOB/i);
});

test("fast-path follow-up does not fall into API help", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "passo a passo rápido sem cair em burocracia",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.match(snapshot?.content ?? "", /Caminho rápido sem burocracia/i);
  assert.doesNotMatch(snapshot?.content ?? "", /API no EIAH/i);
  assert.equal(snapshot?.intent.scopeHint, "workflow");
});

test("agents follow-up returns agents overview", () => {
  const snapshot = resolveHelpDictionarySnapshot({
    input: "Agentes.",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(snapshot);
  assert.match(snapshot?.content ?? "", /Como pensar a área de Agentes/i);
  assert.match(snapshot?.content ?? "", /especialista|workspace/i);
  assert.equal(snapshot?.intent.scopeHint, "agent");
});

test("agents help replies explain cards and when to use EIAH versus specialist", () => {
  const cardsReply = resolveHelpDictionarySnapshot({
    input: "como ler os cards dos agentes?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const comparisonReply = resolveHelpDictionarySnapshot({
    input: "quando usar o EIAH e quando usar especialista?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(cardsReply);
  assert.match(cardsReply?.content ?? "", /Como ler os cards dos agentes/i);
  assert.match(cardsReply?.content ?? "", /especialidade|disponibilidade|risco|integrações|comprovantes/i);
  assert.equal(cardsReply?.intent.scopeHint, "agent");

  assert.ok(comparisonReply);
  assert.match(comparisonReply?.content ?? "", /Quando usar o EIAH e quando usar especialista/i);
  assert.match(comparisonReply?.content ?? "", /triagem|profundidade/i);
  assert.equal(comparisonReply?.intent.scopeHint, "agent");
});

test("chat help replies explain chat versus chat IMOB, triage, handoff and chat versus runs", () => {
  const chatVsImobReply = resolveHelpDictionarySnapshot({
    input: "qual a diferença entre chat e chat imob?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const triageReply = resolveHelpDictionarySnapshot({
    input: "como funciona a triagem do eiah?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const handoffReply = resolveHelpDictionarySnapshot({
    input: "como o eiah faz handoff para especialista?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });
  const chatVsRunsReply = resolveHelpDictionarySnapshot({
    input: "quando usar chat versus runs?",
    routeIntent: "help",
    accessContext: { tenantId: "tenant-A", workspaceId: "workspace-A" },
  });

  assert.ok(chatVsImobReply);
  assert.match(chatVsImobReply?.content ?? "", /Chat principal e Chat IMOB/i);
  assert.match(chatVsImobReply?.content ?? "", /triagem|imobiliária|imobiliario|imobiliário/i);
  assert.equal(chatVsImobReply?.intent.scopeHint, "workflow");

  assert.ok(triageReply);
  assert.match(triageReply?.content ?? "", /triagem do EIAH/i);
  assert.match(triageReply?.content ?? "", /intenção|plataforma|especialista/i);
  assert.equal(triageReply?.intent.scopeHint, "workflow");

  assert.ok(handoffReply);
  assert.match(handoffReply?.content ?? "", /handoff para especialista/i);
  assert.match(handoffReply?.content ?? "", /profundidade|domínio|contexto/i);
  assert.equal(handoffReply?.intent.scopeHint, "workflow");

  assert.ok(chatVsRunsReply);
  assert.match(chatVsRunsReply?.content ?? "", /Quando usar Chat e quando usar Runs/i);
  assert.match(chatVsRunsReply?.content ?? "", /executar|caminho|especialista/i);
  assert.equal(chatVsRunsReply?.intent.scopeHint, "workflow");
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

// ---------------------------------------------------------------------------
// PR8G — ampliação da biblioteca conversacional IMOB (estende
// imobContextResolver.ts, não cria catálogo paralelo): lead, documentação,
// negociação e variações naturais de compra/venda/locação.
// ---------------------------------------------------------------------------

test("imob lead journey stage: qualification signals resolve to a deterministic, read-only reply", () => {
  for (const input of [
    "qualificar lead comprador",
    "lead para locação",
    "recebi um lead comprador",
    "lead comprador",
  ]) {
    const stage = resolveImobJourneyStage(input);
    assert.equal(stage?.stage, "lead", input);

    const reply = buildDeterministicImobReply(input);
    assert.ok(reply, input);
    assert.match(reply ?? "", /qualifica..o de lead/i, input);
    assert.match(reply ?? "", /interesse, or.amento, cidade/i, input);
  }
});

test("imob lead journey stage exposes lead-specific quick replies and placeholder, not the generic fallback", () => {
  const decision = resolveImobLauncherSurfaceDecision({
    input: "qualificar lead comprador",
    hasAccess: true,
    hasKnowledgeSearchIntent: false,
    isContextEntryQuestion: true,
  });

  assert.equal(decision?.launcherRouteIntent, "imob");
  assert.deepEqual(decision?.resolvedQuickReplies, [
    "É lead de compra",
    "É lead de locação",
    "Já tenho orçamento e cidade",
  ]);
  assert.match(
    buildImobInputPlaceholderForInput("lead comprador"),
    /lead comprador/i,
  );
});

test("imob documentacao journey stage: checklist signals resolve to a deterministic, read-only reply", () => {
  for (const input of [
    "documentos do imóvel",
    "checklist de documentos",
    "checklist de documentos do imóvel",
    "documentos necessários",
    "pendências documentais",
  ]) {
    const stage = resolveImobJourneyStage(input);
    assert.equal(stage?.stage, "documentacao", input);

    const reply = buildDeterministicImobReply(input);
    assert.ok(reply, input);
    assert.match(reply ?? "", /checklist inicial/i, input);
    assert.match(reply ?? "", /partes envolvidas|dados do im.vel|condi..es financeiras|garantia/i, input);
  }
});

test("imob documentacao journey stage exposes documentation-specific quick replies and placeholder", () => {
  const decision = resolveImobLauncherSurfaceDecision({
    input: "checklist de documentos do imóvel",
    hasAccess: true,
    hasKnowledgeSearchIntent: false,
    isContextEntryQuestion: true,
  });

  assert.equal(decision?.launcherRouteIntent, "imob");
  assert.deepEqual(decision?.resolvedQuickReplies, [
    "É documentação de compra",
    "É documentação de venda",
    "É documentação de locação",
  ]);
  assert.match(
    buildImobInputPlaceholderForInput("quais documentos para locação"),
    /documentos preciso reunir/i,
  );
});

test("imob negociacao journey stage: expanded vocabulary (condições, valor, abrir negociação) resolves correctly", () => {
  for (const input of ["negociar condições", "negociar valor", "abrir negociação", "quero negociar condicoes"]) {
    const stage = resolveImobJourneyStage(input);
    assert.equal(stage?.stage, "negociacao", input);
  }

  const decision = resolveImobLauncherSurfaceDecision({
    input: "negociar valor",
    hasAccess: true,
    hasKnowledgeSearchIntent: false,
    isContextEntryQuestion: true,
  });
  assert.deepEqual(decision?.resolvedQuickReplies, ["Negociar valor", "Negociar condições", "Organizar contraproposta"]);
});

test("imob compra/venda/locacao journey stages accept the expanded natural-language variants without regressing the original signals", () => {
  const cases: Array<{ input: string; stage: string }> = [
    { input: "quero comprar uma casa", stage: "compra" },
    { input: "quero comprar um apartamento", stage: "compra" },
    { input: "financiamento imobiliário", stage: "compra" },
    { input: "aprovação de crédito imobiliário", stage: "compra" },
    { input: "avaliar meu imóvel", stage: "venda" },
    { input: "colocar à venda", stage: "venda" },
    { input: "anunciar para vender", stage: "venda" },
    { input: "quero alugar meu imóvel", stage: "locacao" },
    { input: "quero alugar um imóvel", stage: "locacao" },
    // sinais originais, pré-existentes, precisam continuar funcionando:
    { input: "comprar apartamento", stage: "compra" },
    { input: "vender imóvel", stage: "venda" },
    { input: "aluguel", stage: "locacao" },
  ];

  for (const { input, stage } of cases) {
    assert.equal(resolveImobJourneyStage(input)?.stage, stage, input);
  }
});

test("imob library extension does not regress billing/proposal or non-IMOB routing", () => {
  // "proposta" pura continua batendo no estágio "proposta", não no novo
  // vocabulário de negociação — o novo vocabulário exige as frases compostas.
  assert.equal(resolveImobJourneyStage("proposta")?.stage, "proposta");
  assert.equal(resolveImobJourneyStage("negociar")?.stage, "negociacao");

  // Perguntas de billing/plataforma genérica continuam fora do IMOB.
  assert.equal(resolveImobJourneyStage("como funciona o billing")?.stage, undefined);
  assert.equal(resolveImobJourneyStage("quais os planos disponíveis")?.stage, undefined);

  // As novas etapas não capturam vocabulário genérico/de outros domínios por acidente.
  assert.equal(resolveImobJourneyStage("quero qualificar um lead de vendas do time comercial")?.stage, undefined);
  assert.equal(resolveImobJourneyStage("preciso do checklist de onboarding do workspace")?.stage, undefined);
  assert.equal(resolveImobJourneyStage("quais documentos para abrir empresa")?.stage, undefined);
  assert.equal(resolveImobJourneyStage("checklist inicial do onboarding do workspace")?.stage, undefined);
  assert.equal(resolveImobJourneyStage("financiamento da empresa")?.stage, undefined);
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

test("launcher snapshot helper preserves governed render-only payload without launcher reinterpretation", () => {
  const snapshot = createLauncherPresentationSnapshot({
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
    usedReplyInputs: ["consultar caso case-1"],
    resolvedQuickReplies: ["consultar caso case-1", "revisar documentos"],
  });

  assert.equal(snapshot.snapshotVersion, PRESENTATION_SNAPSHOT_VERSION);
  assert.equal(snapshot.routeIntent, "imob");
  assert.equal(snapshot.governedRuntime?.launcherPolicy, "render_only");
  assert.deepEqual(snapshot.quickReplies, ["revisar documentos"]);
  assert.deepEqual(resolveSnapshotQuickReplies(snapshot), ["revisar documentos"]);
});

test("launcher engine helper resolves mode-specific contract without direct launcher selection", () => {
  const agentProfile = resolveLauncherAgentProfile({
    selectedAgent: {
      id: "EIAH",
      name: "EIAH",
      chatCopy: { quickReplies: ["fallback copy"] },
      uxContract: { trustSignals: [], defaultCTA: "", responseShape: "brief_answer", maxCognitiveLoad: "low" },
      knowledgePolicy: { provenancePolicy: "none" },
      modeContracts: [
        {
          mode: "help",
          chatCopy: { quickReplies: ["ajuda 1", "ajuda 2"] },
          uxContract: {
            trustSignals: ["help_mode"],
            defaultCTA: "",
            responseShape: "brief_answer",
            maxCognitiveLoad: "low",
          },
        },
      ],
    } as any,
    eiahMode: "help",
  });

  assert.deepEqual(agentProfile?.chatCopy?.quickReplies, ["ajuda 1", "ajuda 2"]);
  assert.deepEqual(agentProfile?.uxContract?.trustSignals, ["help_mode"]);
});

test("launcher snapshot helper resolves contract in engine and keeps render-only snapshot free of backend proof fields", () => {
  const snapshot = createLauncherPresentationSnapshot({
    selectedAgent: {
      id: "EIAH",
      name: "EIAH",
      chatCopy: { quickReplies: ["fallback copy"] },
      uxContract: { trustSignals: [], defaultCTA: "", responseShape: "brief_answer", maxCognitiveLoad: "low" },
      knowledgePolicy: { provenancePolicy: "none" },
      modeContracts: [
        {
          mode: "help",
          chatCopy: { quickReplies: ["consultar caso case-1", "revisar documentos"] },
        },
      ],
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
    usedReplyInputs: ["consultar caso case-1"],
    resolvedQuickReplies: ["consultar caso case-1", "revisar documentos"],
  });

  assert.equal(snapshot.snapshotVersion, PRESENTATION_SNAPSHOT_VERSION);
  assert.equal(snapshot.routeIntent, "imob");
  assert.equal(snapshot.governedRuntime?.launcherPolicy, "render_only");
  assert.deepEqual(snapshot.quickReplies, ["revisar documentos"]);
  assert.ok(!("tenantId" in snapshot));
  assert.ok(!("payload" in snapshot));
  assert.ok(!("proofHash" in snapshot));
  assert.ok(!("sourceRefs" in snapshot));
  assert.ok(!("receiptId" in snapshot));
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

test("presentation snapshot v1 serializes as render-only contract without backend or proof fields", () => {
  const snapshot = createPresentationSnapshotV1({
    agentProfile: {
      id: "EIAH",
      name: "EIAH",
      chatCopy: { quickReplies: ["copy A", "copy B"] },
      uxContract: { trustSignals: ["signal_a"], defaultCTA: "", responseShape: "brief_answer", maxCognitiveLoad: "low" },
      knowledgePolicy: { provenancePolicy: "recommended" },
    } as any,
    routeIntent: "imob",
    eiahMode: "help",
    confidence: 0.82,
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

  const serialized = JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;

  assert.equal(serialized.snapshotVersion, PRESENTATION_SNAPSHOT_VERSION);
  assert.equal((serialized.governedRuntime as Record<string, unknown> | null)?.launcherPolicy, "render_only");
  assert.ok(Array.isArray(serialized.quickReplies));
  assert.ok(((serialized.quickReplies as unknown[]) ?? []).length <= 3);

  for (const field of [
    "tenantId",
    "workspaceId",
    "payload",
    "proofHash",
    "sourceRefs",
    "receiptId",
    "ledger",
    "receipt",
    "txId",
    "runId",
  ]) {
    assert.ok(!(field in serialized));
  }
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

const imobRuntimeShadowRequest: ImobRuntimeShadowEngineRequest = {
  intent: { verticalId: "imob", label: "Untrusted label", capabilityId: "inventory.preview" },
  confidenceSignals: { verticalEvidence: "explicit", capabilityEvidence: "explicit", competingIntent: false },
  registry: {
    version: "vertical.registry.v1",
    registryVersion: "registry-imob-runtime-shadow-engine-summary-test-1",
    scope: { tenantId: "tenant-imob-shadow-summary-test", workspaceId: "workspace-imob-shadow-summary-test" },
    verticals: [
      {
        id: "imob",
        label: "IMOB",
        status: "enabled",
        capabilities: [{ id: "inventory.preview", allowedModes: ["read_only"] }],
        entitlement: { required: true, key: "REAL_ESTATE_CORE" },
        rbac: { requiredRoles: ["workspace.member"] },
        policyGates: ["vertical.read_only"],
        rolloutStage: "context_only",
      },
    ],
  },
  handoffId: "handoff-imob-shadow-summary-test",
  refs: { conversationId: "conversation-imob-shadow-summary-test", threadId: "thread-imob-shadow-summary-test" },
  governance: {
    tenantId: "tenant-imob-shadow-summary-test",
    workspaceId: "workspace-imob-shadow-summary-test",
    scope: "imob:inventory:read",
    registry: { decision: "allowed" },
    rbac: { decision: "allowed" },
    entitlement: { decision: "allowed" },
    policy: { decision: "allowed" },
    hitl: { status: "not_required" },
  },
};

test("IMOB runtime shadow quick summary: handoff stage maps to a redacted label", () => {
  const summary = resolveImobRuntimeShadowQuickSummary({
    available: true,
    state: {
      kind: "chat.vertical_runtime_shadow_state.v1",
      verticalId: "imob",
      stage: "handoff",
      source: "runtime_shadow",
      sideEffects: 0,
      handoff: {
        kind: "chat.vertical_handoff_preflight.v1",
        verticalId: "imob",
        capabilityId: "inventory.preview",
        handoffIntentKey: "imob.inventory.preview.open_context",
        source: "high_confidence",
        allowedNextActions: ["open_context_preview", "keep_chat_context", "cancel"],
        defaultNextAction: "open_context_preview",
        sideEffects: 0,
      },
    },
  });

  assert.deepEqual(summary, { label: "IMOB (shadow): pré-visualização de inventário disponível", stage: "handoff" });
});

test("IMOB runtime shadow quick summary: clarification stage maps to a redacted label", () => {
  const summary = resolveImobRuntimeShadowQuickSummary({
    available: true,
    state: {
      kind: "chat.vertical_runtime_shadow_state.v1",
      verticalId: "imob",
      stage: "clarification",
      source: "runtime_shadow",
      sideEffects: 0,
      clarification: {
        kind: "chat.vertical_clarification.v1",
        verticalId: "imob",
        capabilityId: "inventory.preview",
        reason: "IMOB_INVENTORY_INTENT_AMBIGUOUS",
        questionKey: "imob.inventory.preview.clarify_intent",
        allowedReplies: ["confirm_inventory_preview", "refine_inventory_intent", "cancel_vertical_switch"],
        defaultReply: "refine_inventory_intent",
        sideEffects: 0,
      },
    },
  });

  assert.deepEqual(summary, {
    label: "IMOB (shadow): aguardando confirmação para pré-visualizar inventário",
    stage: "clarification",
  });
});

test("IMOB runtime shadow quick summary: blocked/not_applicable/unavailable degrade to null", () => {
  assert.equal(resolveImobRuntimeShadowQuickSummary({ available: false }), null);
  assert.equal(
    resolveImobRuntimeShadowQuickSummary({
      available: true,
      state: {
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "blocked",
        source: "runtime_shadow",
        sideEffects: 0,
        reasonCode: "VERTICAL_POLICY_DENIED",
      },
    }),
    null,
  );
  assert.equal(
    resolveImobRuntimeShadowQuickSummary({
      available: true,
      state: {
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "not_applicable",
        source: "runtime_shadow",
        sideEffects: 0,
      },
    }),
    null,
  );
});

test("IMOB runtime shadow render state: degrades to null when the route is disabled (flag OFF / 404)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const summary = await resolveImobRuntimeShadowRenderState(imobRuntimeShadowRequest);
    assert.equal(summary, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IMOB runtime shadow render state: surfaces a redacted handoff label when the flag is ON", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "handoff",
        source: "runtime_shadow",
        sideEffects: 0,
        handoff: {
          kind: "chat.vertical_handoff_preflight.v1",
          verticalId: "imob",
          capabilityId: "inventory.preview",
          handoffIntentKey: "imob.inventory.preview.open_context",
          source: "high_confidence",
          allowedNextActions: ["open_context_preview", "keep_chat_context", "cancel"],
          defaultNextAction: "open_context_preview",
          sideEffects: 0,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    const summary = await resolveImobRuntimeShadowRenderState(imobRuntimeShadowRequest);
    assert.deepEqual(summary, {
      label: "IMOB (shadow): pré-visualização de inventário disponível",
      stage: "handoff",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IMOB runtime shadow summary for turn: non-IMOB routeIntent short-circuits without any fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("must not be called for non-imob routeIntent");
  }) as typeof fetch;

  try {
    const summary = await resolveImobRuntimeShadowSummaryForTurn({
      routeIntent: "help",
      tenantId: "tenant-turn-summary-test",
      workspaceId: "workspace-turn-summary-test",
    });
    assert.equal(summary, null);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IMOB runtime shadow summary for turn: missing tenantId/workspaceId short-circuits without any fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("must not be called without tenant/workspace context");
  }) as typeof fetch;

  try {
    const withoutTenant = await resolveImobRuntimeShadowSummaryForTurn({
      routeIntent: "imob",
      tenantId: null,
      workspaceId: "workspace-turn-summary-test",
    });
    const withoutWorkspace = await resolveImobRuntimeShadowSummaryForTurn({
      routeIntent: "imob",
      tenantId: "tenant-turn-summary-test",
      workspaceId: undefined,
    });
    assert.equal(withoutTenant, null);
    assert.equal(withoutWorkspace, null);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IMOB runtime shadow summary for turn: route disabled (404, default OFF) degrades to null", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const summary = await resolveImobRuntimeShadowSummaryForTurn({
      routeIntent: "imob",
      tenantId: "tenant-turn-summary-test",
      workspaceId: "workspace-turn-summary-test",
    });
    assert.equal(summary, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IMOB runtime shadow summary for turn: honestly declares governance as not_evaluated (no fabricated allow)", async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: Record<string, unknown> | null = null;
  globalThis.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return new Response(
      JSON.stringify({
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "blocked",
        source: "runtime_shadow",
        sideEffects: 0,
        reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const summary = await resolveImobRuntimeShadowSummaryForTurn({
      routeIntent: "imob",
      tenantId: "tenant-turn-summary-test",
      workspaceId: "workspace-turn-summary-test",
    });
    assert.equal(summary, null);
    const governance = (capturedBody as unknown as { governance: Record<string, { decision?: string; status?: string }> })
      .governance;
    assert.equal(governance.registry.decision, "not_evaluated");
    assert.equal(governance.rbac.decision, "not_evaluated");
    assert.equal(governance.entitlement.decision, "not_evaluated");
    assert.equal(governance.policy.decision, "not_evaluated");
    assert.equal(governance.hitl.status, "not_evaluated");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("IMOB runtime shadow summary for turn: flag ON with a high-confidence shadow state surfaces a redacted label", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "handoff",
        source: "runtime_shadow",
        sideEffects: 0,
        handoff: {
          kind: "chat.vertical_handoff_preflight.v1",
          verticalId: "imob",
          capabilityId: "inventory.preview",
          handoffIntentKey: "imob.inventory.preview.open_context",
          source: "high_confidence",
          allowedNextActions: ["open_context_preview", "keep_chat_context", "cancel"],
          defaultNextAction: "open_context_preview",
          sideEffects: 0,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    const summary = await resolveImobRuntimeShadowSummaryForTurn({
      routeIntent: "imob",
      tenantId: "tenant-turn-summary-test",
      workspaceId: "workspace-turn-summary-test",
    });
    assert.deepEqual(summary, { label: "IMOB (shadow): pré-visualização de inventário disponível", stage: "handoff" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function buildImobDecisionFixture(overrides?: Partial<LauncherLocalDecision>): LauncherLocalDecision {
  return {
    kind: "imob_reply",
    shouldCreateRun: false,
    content: "Conteúdo determinístico do IMOB para este turno.",
    launcherRouteIntent: "imob",
    presentationRouteIntent: "imob",
    renderVariant: "simple_help",
    ...overrides,
  };
}

test("enrich decision with IMOB shadow: null or content-less decisions pass through unchanged, no fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("must not fetch for null/content-less decisions");
  }) as typeof fetch;

  try {
    const nullResult = await enrichLauncherDecisionWithImobRuntimeShadow(null, {
      tenantId: "tenant-enrich-test",
      workspaceId: "workspace-enrich-test",
    });
    assert.equal(nullResult, null);

    const contentless = buildImobDecisionFixture({ content: undefined });
    const contentlessResult = await enrichLauncherDecisionWithImobRuntimeShadow(contentless, {
      tenantId: "tenant-enrich-test",
      workspaceId: "workspace-enrich-test",
    });
    assert.equal(contentlessResult, contentless);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enrich decision with IMOB shadow: non-IMOB decisions pass through unchanged, no fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("must not fetch for non-imob decisions");
  }) as typeof fetch;

  try {
    const helpDecision = buildImobDecisionFixture({
      launcherRouteIntent: "help",
      presentationRouteIntent: "help",
    });
    const result = await enrichLauncherDecisionWithImobRuntimeShadow(helpDecision, {
      tenantId: "tenant-enrich-test",
      workspaceId: "workspace-enrich-test",
    });
    assert.equal(result, helpDecision);
    assert.equal(fetchCalled, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enrich decision with IMOB shadow: route disabled (404, default OFF) leaves content unchanged (safe degrade)", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const decision = buildImobDecisionFixture();
    const result = await enrichLauncherDecisionWithImobRuntimeShadow(decision, {
      tenantId: "tenant-enrich-test",
      workspaceId: "workspace-enrich-test",
    });
    assert.deepEqual(result, decision);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enrich decision with IMOB shadow: flag ON with a handoff shadow state appends a redacted summary to content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "handoff",
        source: "runtime_shadow",
        sideEffects: 0,
        handoff: {
          kind: "chat.vertical_handoff_preflight.v1",
          verticalId: "imob",
          capabilityId: "inventory.preview",
          handoffIntentKey: "imob.inventory.preview.open_context",
          source: "high_confidence",
          allowedNextActions: ["open_context_preview", "keep_chat_context", "cancel"],
          defaultNextAction: "open_context_preview",
          sideEffects: 0,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    const decision = buildImobDecisionFixture();
    const result = await enrichLauncherDecisionWithImobRuntimeShadow(decision, {
      tenantId: "tenant-enrich-test",
      workspaceId: "workspace-enrich-test",
    });
    assert.notEqual(result, decision);
    assert.equal(
      result?.content,
      "Conteúdo determinístico do IMOB para este turno.\n\nIMOB (shadow): pré-visualização de inventário disponível",
    );
    assert.equal(result?.launcherRouteIntent, "imob");
    assert.equal(result?.kind, decision.kind);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("enrich decision with IMOB shadow: never surfaces tenant, workspace, governance or refs in the appended content", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "clarification",
        source: "runtime_shadow",
        sideEffects: 0,
        clarification: {
          kind: "chat.vertical_clarification.v1",
          verticalId: "imob",
          capabilityId: "inventory.preview",
          reason: "IMOB_INVENTORY_INTENT_AMBIGUOUS",
          questionKey: "imob.inventory.preview.clarify_intent",
          allowedReplies: ["confirm_inventory_preview", "refine_inventory_intent", "cancel_vertical_switch"],
          defaultReply: "refine_inventory_intent",
          sideEffects: 0,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    const decision = buildImobDecisionFixture();
    const result = await enrichLauncherDecisionWithImobRuntimeShadow(decision, {
      tenantId: "tenant-enrich-secret-test",
      workspaceId: "workspace-enrich-secret-test",
    });
    for (const forbidden of [
      "tenantId",
      "workspaceId",
      "governance",
      "refs",
      "tenant-enrich-secret-test",
      "workspace-enrich-secret-test",
    ]) {
      assert.equal((result?.content ?? "").includes(forbidden), false, forbidden);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ---------------------------------------------------------------------------
// PR8F — E2E controlado: /app/chat + IMOB.
//
// Exercita o caminho completo e real (não um fixture de decisão fabricado):
// texto de usuário -> detectLauncherRouteIntent -> resolveLauncherTurnDecision
// (motor real, mesma função chamada por ChatAgentLauncher.tsx) ->
// enrichLauncherDecisionWithImobRuntimeShadow (wiring do PR8E-B). Sem
// servidor real, sem rede real (fetch mockado), sem Playwright/browser —
// controlado e determinístico via node:test, reutilizando a mesma estrutura
// já usada em todo o resto deste arquivo.
// ---------------------------------------------------------------------------

const e2eImobAccessContext = {
  tenantId: "tenant-e2e-imob-frontdoor",
  workspaceId: "workspace-e2e-imob-frontdoor",
  roleProfile: null,
  activeDomain: "imob" as const,
  installedProducts: ["IMOB"],
  entitlements: { REAL_ESTATE_CORE: true },
};

async function resolveRealTurnDecision(input: string) {
  const routeIntent = detectLauncherRouteIntent(input, false);
  const decision = await resolveLauncherTurnDecision({
    input,
    trimmedInput: input,
    routeIntent,
    proposalMode: false,
    isUnifiedEiah: true,
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    confidence: 1,
    previousUserMessage: null,
    previousAssistantMessage: null,
    previousAssistantSnapshot: null,
    accessContext: e2eImobAccessContext,
  });
  return { routeIntent, decision };
}

test("E2E controlado (OFF/404): input real de IMOB produz decisão real com conteúdo preservado quando a shadow route está indisponível", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  try {
    const { routeIntent, decision } = await resolveRealTurnDecision("explica imob");
    assert.equal(routeIntent, "imob");
    assert.ok(decision, "expected a real local IMOB decision");
    assert.ok(decision?.content, "expected the real IMOB decision to have content");
    const originalContent = decision!.content!;

    const enriched = await enrichLauncherDecisionWithImobRuntimeShadow(decision, {
      tenantId: e2eImobAccessContext.tenantId,
      workspaceId: e2eImobAccessContext.workspaceId,
    });

    assert.equal(enriched?.content, originalContent, "content must be preserved unchanged when the shadow route is OFF/404");
    assert.equal(enriched?.content?.includes("(shadow)"), false, "no shadow label must leak when the route is unavailable");
    assert.equal(enriched?.content?.includes("pré-visualização de inventário"), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("E2E controlado (ON/200): input real de IMOB produz decisão real com label redigido quando a shadow route responde com fixture válido", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        kind: "chat.vertical_runtime_shadow_state.v1",
        verticalId: "imob",
        stage: "handoff",
        source: "runtime_shadow",
        sideEffects: 0,
        handoff: {
          kind: "chat.vertical_handoff_preflight.v1",
          verticalId: "imob",
          capabilityId: "inventory.preview",
          handoffIntentKey: "imob.inventory.preview.open_context",
          source: "high_confidence",
          allowedNextActions: ["open_context_preview", "keep_chat_context", "cancel"],
          defaultNextAction: "open_context_preview",
          sideEffects: 0,
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    const { routeIntent, decision } = await resolveRealTurnDecision("como usar imob");
    assert.equal(routeIntent, "imob");
    assert.ok(decision?.content, "expected the real IMOB decision to have content");
    const originalContent = decision!.content!;

    const enriched = await enrichLauncherDecisionWithImobRuntimeShadow(decision, {
      tenantId: e2eImobAccessContext.tenantId,
      workspaceId: e2eImobAccessContext.workspaceId,
    });

    assert.ok(enriched?.content?.startsWith(originalContent), "original agent content must be preserved, not replaced");
    assert.match(enriched?.content ?? "", /IMOB \(shadow\): pré-visualização de inventário disponível/);

    for (const forbidden of [
      "tenantId",
      "workspaceId",
      "governance",
      "refs",
      e2eImobAccessContext.tenantId,
      e2eImobAccessContext.workspaceId,
      "prompt",
      "response",
      "rawDocument",
      "documentBody",
    ]) {
      assert.equal((enriched?.content ?? "").includes(forbidden), false, forbidden);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("E2E controlado: input real não-IMOB nunca aciona o shadow adapter (sem fetch)", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalled = false;
  globalThis.fetch = (async () => {
    fetchCalled = true;
    throw new Error("must not fetch for a non-imob real turn");
  }) as typeof fetch;

  try {
    const { routeIntent, decision } = await resolveRealTurnDecision("como funciona o billing");
    assert.notEqual(routeIntent, "imob");

    const enriched = await enrichLauncherDecisionWithImobRuntimeShadow(decision, {
      tenantId: e2eImobAccessContext.tenantId,
      workspaceId: e2eImobAccessContext.workspaceId,
    });

    assert.equal(fetchCalled, false, "non-imob real turns must never reach the shadow client");
    assert.equal(enriched, decision);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("E2E controlado: ChatAgentLauncher.tsx não contém fetch nem chamadas diretas ao client IMOB shadow", async () => {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const launcherPath = path.resolve(
    import.meta.dirname,
    "ChatAgentLauncher.tsx",
  );
  const source = await fs.readFile(launcherPath, "utf8");

  for (const forbidden of ["fetch(", "apiGetImobRuntimeShadowState", "fetchImobRuntimeShadowState"]) {
    assert.equal(source.includes(forbidden), false, `ChatAgentLauncher.tsx must not contain "${forbidden}"`);
  }
  assert.ok(source.includes("enrichLauncherDecisionWithImobRuntimeShadow"), "launcher must consume the already-resolved engine decision, not fetch itself");
});
