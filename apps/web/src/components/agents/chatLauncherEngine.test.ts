import test from "node:test";
import assert from "node:assert/strict";

import {
  PRESENTATION_SNAPSHOT_VERSION,
  type MessagePresentationSnapshot,
} from "./chatPresentationSnapshot.ts";
import {
  buildDeterministicHelpReply,
  buildDeterministicImobReply,
  buildEiahQuickReplies,
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

test("imob deterministic replies differentiate what is, end-to-end, navigation and install", () => {
  assert.match(buildDeterministicImobReply("Tá mas o que é IMOB ?") ?? "", /O que é o IMOB/i);
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
