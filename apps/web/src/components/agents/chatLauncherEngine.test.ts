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
  assert.match(reply, /\[Billing\]\(\/app\/billing\)/);
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
