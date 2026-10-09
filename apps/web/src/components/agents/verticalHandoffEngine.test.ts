import test from "node:test";
import assert from "node:assert/strict";
import type { ChatVerticalHandoffResult } from "@/lib/api";
import {
  attachVerticalHandoffToSnapshot,
  describeVerticalHandoffResult,
  enrichLauncherDecisionWithVerticalHandoff,
  isImobOperationalRequest,
  requestVerticalHandoff,
  resolveExplicitVerticalHandoffRequest,
} from "./verticalHandoffEngine";
import { resolveEiahJourneyContract, resolveLauncherNavigationDecision, resolveLauncherTurnDecision } from "./chatLauncherEngine";
import { eiahProfile } from "../../../../../packages/core/src/actions/agents/eiahAction";
import { composeVerticalRegistry, projectVerticalRegistryForSurface, buildAndEvaluateVerticalHandoff } from "../../../../api/src/services/chat/verticalRegistryComposition";
import { isImobSurfaceAvailable } from "@/lib/entitlements";
import { syncSessionContext } from "@/state/sessionContextSync";
import { getSession, updateSession } from "@/state/sessionStore";

const allowed: ChatVerticalHandoffResult = {
  ok: true,
  handoff: {
    version: "chat.vertical_handoff.v2",
    handoffId: "h1",
    vertical: { id: "imob", label: "IMOB", registryVersion: "vr1-x" },
    capability: { id: "crm.forms", mode: "requires_write" },
    presentation: { source: "operational", variant: "chat_card" },
    outcome: "allowed",
    reasonCode: "VERTICAL_HANDOFF_ALLOWED",
  },
};

test("jornada IMOB usa o alias compatível do Front Door e mantém o hub auxiliar", () => {
  const journey = resolveEiahJourneyContract({
    agentProfile: { id: "EIAH", name: "EIAH", journeyContract: eiahProfile.journeyContract ?? undefined },
    accessContext: { roleProfile: "workspace_admin", activeDomain: "imob", installedProducts: ["IMOB"] },
  });
  assert.ok(journey);
  assert.equal(journey.frontDoorSurface, "agents");
  assert.equal(journey.frontDoorLabel, "Chat EIAH");
  assert.ok(journey.prioritySurfaces.includes("imob_dashboard"));
  assert.equal(journey.prioritySurfaces.includes("imob_chat"), false);
  assert.match(journey.beginnerExplanation, /nesta conversa/);
});

test("pedido operacional de IMOB é reconhecido; perguntas sobre o produto não", () => {
  for (const text of [
    "quero cadastrar um imóvel",
    "cadastrar proprietário Carlos",
    "encerrar a locação da kitnet 01",
    "gerar contrato de locação",
    "anexar a vistoria do apartamento",
    "quero cadastrar mais imóveis no proprietário carlos a merlo",
  ]) {
    assert.equal(isImobOperationalRequest(text), true, text);
  }
  for (const text of ["como funciona o cadastro de imóvel?", "o que é o IMOB?", "quanto custa o plano?", "bom dia", "gerar relatório de vendas"]) {
    assert.equal(isImobOperationalRequest(text), false, text);
  }
});

test("engine: no EIAH unificado o pedido operacional vira decisão de handoff para o IMOB (sem run)", async () => {
  const decision = await resolveLauncherTurnDecision({
    input: "quero cadastrar um imóvel",
    trimmedInput: "quero cadastrar um imóvel",
    routeIntent: "imob",
    proposalMode: false,
    isUnifiedEiah: true,
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    confidence: 0.9,
  });
  assert.equal(decision?.kind, "vertical_handoff");
  assert.equal(decision?.shouldCreateRun, false);
  assert.deepEqual(decision?.verticalHandoffRequest, { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" });
});

test("enriquecimento: resultado do servidor vira texto, próximos passos e contexto IMOB no snapshot", async () => {
  const base = { content: "…", verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" as const } };
  const ok = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowed, async () => undefined);
  assert.match(ok?.content ?? "", /^Sigo com o IMOB nesta conversa/);
  assert.equal(ok?.verticalHandoff, allowed);
  const snapshot = attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | null }, ok);
  assert.equal(snapshot.verticalContext, "IMOB");

  const denied = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => ({ ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" }));
  assert.match(denied?.content ?? "", /não está ativo neste workspace/);
  assert.deepEqual(denied?.resolvedQuickReplies, ["Ativar o IMOB neste workspace", "Ver opções no Marketplace"]);
  assert.equal(attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | null }, denied).verticalContext, null);

  const untouched = { content: "olá" };
  assert.equal(await enrichLauncherDecisionWithVerticalHandoff(untouched), untouched, "sem pedido de handoff nada muda");
});

test("cada bloqueio explica sem prometer capacidade; motivo desconhecido cai no fail-closed", () => {
  assert.match(describeVerticalHandoffResult({ ok: false, reasonCode: "VERTICAL_SCOPE_DENIED" }).content, /Sua função/);
  assert.match(describeVerticalHandoffResult({ ok: false, reasonCode: "VERTICAL_DISABLED" }).content, /não está pronto para uso/);
  const unknown = describeVerticalHandoffResult({ ok: false, reasonCode: "" });
  assert.match(unknown.content, /Nada foi executado/);
  assert.deepEqual(unknown.handoff, { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" });
});

test("histórico IMOB: handoff permitido ou ativação confirmada, pela última decisão de vertical", async () => {
  const { isImobActiveInConversation } = await import("./verticalHandoffEngine");
  assert.equal(isImobActiveInConversation([]), false);
  assert.equal(isImobActiveInConversation([{ verticalHandoff: allowed }]), true);
  assert.equal(isImobActiveInConversation([{ verticalHandoff: allowed }, null, {}]), true, "mensagens sem decisão de vertical não mudam");
  assert.equal(isImobActiveInConversation([{ verticalHandoff: allowed }, { verticalHandoff: { ok: false, reasonCode: "VERTICAL_SCOPE_DENIED" } }]), false);
  assert.equal(isImobActiveInConversation([{ verticalActivation: { status: "proposed", verticalId: "imob", registryVersion: "v" } }]), false);
  assert.equal(isImobActiveInConversation([{ verticalActivation: { status: "activated", verticalId: "imob" } }]), true);
});

test("o pedido original só segue para o IMOB quando o handoff foi permitido", async () => {
  const base = { content: "…", verticalHandoffForwardInput: "quero cadastrar um imóvel", verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" as const } };
  assert.equal((await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowed, async () => undefined))?.verticalHandoffForwardInput, "quero cadastrar um imóvel");
  assert.equal((await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => ({ ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" })))?.verticalHandoffForwardInput, undefined);
});

test("handoff permitido sincroniza domínio no engine; bloqueio ou outra vertical não sincronizam IMOB", async () => {
  const base = { verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" as const } };
  const calls: string[] = [];
  updateSession({ activeDomain: "core", availableDomains: ["core", "imob"], entitlements: { IMOB_INSTALLED: true }, accessGate: null,
    verticals: [{ verticalId: "IMOB", label: "IMOB", activeDomain: "imob", installedProduct: "IMOB", enabled: true,
      rolloutStage: "operationalized", frontDoorSurface: "imob_chat", operationalHubSurface: "imob_dashboard",
      governanceHubSurface: "marketplace", investigationSurfaces: ["runs"], contextSpecRef: "vertical-context-imob.md" }] });
  const sync = async (domain: "imob") => { calls.push(domain); updateSession({ activeDomain: domain }); };
  assert.equal(isImobSurfaceAvailable(getSession()), false);
  const result = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowed, sync);
  assert.deepEqual(calls, ["imob"]);
  assert.equal(isImobSurfaceAvailable(getSession()), true);
  assert.equal(attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | null }, result).verticalContext, "IMOB");
  await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => ({ ok: false, reasonCode: "VERTICAL_SCOPE_DENIED" }), sync);
  await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => ({ ...allowed, handoff: { ...allowed.handoff, vertical: { ...allowed.handoff.vertical, id: "legal" } } }), sync);
  assert.deepEqual(calls, ["imob"]);
});

test("falha de sincronização preserva handoff autorizado e não fabrica sessão disponível", async () => {
  updateSession({ activeDomain: "core" });
  const before = getSession();
  const base = { verticalHandoffForwardInput: "cadastrar imóvel", verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" as const } };
  const result = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowed, async () => { throw new Error("context unavailable"); });
  assert.equal(result?.verticalHandoff, allowed);
  assert.equal(result?.verticalHandoffForwardInput, undefined);
  assert.equal(result?.verticalHandoffSessionSync, "failed");
  assert.match(result?.content ?? "", /acesso ao IMOB foi confirmado/);
  assert.match(result?.content ?? "", /Atualize a página/);
  assert.equal(getSession(), before);
  assert.equal(isImobSurfaceAvailable(getSession()), false);
});


test("handoff confirmado + workspace alterado durante sync não encaminha automaticamente", async () => {
  updateSession({ token: "synthetic-token", tenantId: "tenant-test", workspaceId: "workspace-test", activeDomain: "core" });
  const base = { verticalHandoffForwardInput: "gerar proposta", verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" as const } };
  const result = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowed, async () => {
    updateSession({ workspaceId: "workspace-other" });
    throw new Error("A sessão mudou durante a atualização do contexto.");
  });
  assert.equal(result?.verticalHandoff, allowed);
  assert.equal(result?.verticalHandoffForwardInput, undefined);
  assert.equal(result?.verticalHandoffSessionSync, "failed");
});

test("handoff confirmado + sync superado não fabrica sucesso nem auto-forward", async () => {
  updateSession({ token: "synthetic-token", tenantId: "tenant-test", workspaceId: "workspace-test" });
  const base = { verticalHandoffForwardInput: "gerar proposta", verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" as const } };
  const result = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowed, async () => {
    const context = { tenantId: "tenant-test", workspaceId: "workspace-test", userId: null, activeDomain: "imob" as const,
      availableDomains: ["core", "imob"] as Array<"core" | "imob">, entitlements: { REAL_ESTATE_CORE: true, IMOB_INSTALLED: true, EXPORTS_ADDON: false, BILLING_INSIGHTS_ADDON: false },
      roles: [], branding: { brandName: "Test", logoUrl: null, primaryColor: "#123456", workspaceLabel: "Test" } };
    await syncSessionContext("imob", async () => {
      await syncSessionContext("core", async () => ({ ok: true, data: { ...context, activeDomain: "core" } }));
      return { ok: true, data: context };
    });
  });
  assert.equal(result?.verticalHandoff, allowed);
  assert.equal(result?.verticalHandoffForwardInput, undefined);
  assert.equal(result?.verticalHandoffSessionSync, "failed");
  const synced = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowed, async () => undefined);
  assert.equal(synced?.verticalHandoffSessionSync, "synced");
  assert.equal(synced?.verticalHandoffForwardInput, base.verticalHandoffForwardInput);
});


test("mudança de workspace durante avaliação não usa sync bem-sucedido de outro escopo para forward", async () => {
  updateSession({ tenantId: "tenant-test", workspaceId: "workspace-test" });
  const base = { verticalHandoffForwardInput: "gerar proposta", verticalHandoffRequest: { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" as const } };
  const result = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => {
    updateSession({ workspaceId: "workspace-other" });
    return allowed;
  }, async () => undefined);
  assert.equal(result?.verticalHandoff, allowed);
  assert.equal(result?.verticalHandoffForwardInput, undefined);
  assert.equal(result?.verticalHandoffSessionSync, "failed");
});

for (const scenario of ["allowed", "unknown", "disabled", "no_read_capability", "registry_failure", "mismatched_handoff"]) {
  test(`FDC-03A-R3 explicit transfer uses existing registry and backend preflight: ${scenario}`, async (t) => {
    const previous = globalThis.fetch;
    t.after(() => { globalThis.fetch = previous; });
    const calls: Array<{ path: string; body: any }> = [];
    globalThis.fetch = (async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push({ path, body: init?.body ? JSON.parse(String(init.body)) : null });
      if (path.endsWith("/vertical-registry")) {
        if (scenario === "registry_failure") throw new Error("registry unavailable");
        return new Response(JSON.stringify({ ok: true, data: { version: "vertical.registry.v1", registryVersion: "r1",
          verticals: scenario === "unknown" ? [] : [{ id: "future", label: "Future", rolloutStage: "context_only",
            status: scenario === "disabled" ? "disabled" : "enabled", capabilities: [
              { id: "write.operation", allowedModes: ["requires_write"] },
              ...(scenario === "no_read_capability" ? [] : [{ id: "context.read", allowedModes: ["read_only"] }]),
            ] }] } }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true, data: { ok: true, handoff: {
        ...allowed.handoff, vertical: { id: scenario === "mismatched_handoff" ? "other" : "future", registryVersion: "r1" },
        capability: { id: "context.read", mode: "read_only" } } } }), { status: 200 });
    }) as typeof fetch;
    const request = resolveExplicitVerticalHandoffRequest("Quero mudar para future");
    assert.ok(request);
    const result = await requestVerticalHandoff(request, { threadId: "thread-test" });
    assert.equal(result.ok, scenario === "allowed");
    const posted = calls.find((call) => call.path.endsWith("/vertical-handoff"));
    if (["allowed", "mismatched_handoff"].includes(scenario)) {
      assert.deepEqual(posted?.body, { verticalId: "future", capabilityId: "context.read", mode: "read_only", refs: { threadId: "thread-test" } });
    } else assert.equal(posted, undefined);
    if (!result.ok) {
      const presentation = describeVerticalHandoffResult(result, "future");
      assert.deepEqual(presentation.quickReplies, []);
      assert.doesNotMatch(presentation.content, /ativar|confirmado/i);
    }
  });
}

test("FDC-03A-R3 transfer grammar does not promote a domain word, a correction or an operational surface", () => {
  for (const input of ["LEGAL", "venda", "O valor de venda precisa ser 90000", "Quero corrigir o imóvel", "Quero mudar para billing", "Ir para marketplace"]) {
    assert.equal(resolveExplicitVerticalHandoffRequest(input), null, input);
  }
});

async function frontDoorTurn(input: string) {
  return resolveLauncherTurnDecision({ input, trimmedInput: input, routeIntent: "imob", proposalMode: false,
    isUnifiedEiah: true, eiahMode: "help", agentProfile: null, catalogAgents: [], intentUnknown: false, confidence: 1 });
}

test("transferência explícita fora da revisão usa o mesmo handoff, sem criar execução", async () => {
  for (const input of ["Quero mudar para o IMOB", "Trocar para IMOB", "Quero mudar para LEGAL", "Ir para COMEX"]) {
    const decision = await frontDoorTurn(input);
    assert.equal(decision?.kind, "vertical_handoff", input);
    assert.deepEqual(decision?.verticalHandoffRequest, resolveExplicitVerticalHandoffRequest(input));
    assert.equal(decision?.shouldCreateRun, false);
    assert.equal(decision?.verticalActivationRequest, undefined);
  }
  for (const input of ["O que é o IMOB?", "IMOB", "Como funciona o billing?", "Quero ativar o IMOB"]) {
    const decision = await frontDoorTurn(input);
    assert.equal(decision?.verticalHandoffRequest, undefined, input);
    assert.equal(decision?.shouldCreateRun, false, input);
  }
  const operational = await frontDoorTurn("quero cadastrar um imóvel");
  assert.deepEqual(operational?.verticalHandoffRequest, { verticalId: "imob", capabilityId: "crm.forms", mode: "requires_write" });
});

test("entrada de navegação é somente intenção de leitura; não ativa nem simula autorização", async () => {
  const decision = await resolveLauncherNavigationDecision({ domainHint: "imob", isUnifiedEiah: true });
  assert.deepEqual(decision?.verticalHandoffRequest, { verticalId: "imob", mode: "read_only" });
  assert.equal(decision?.shouldCreateRun, false);
  assert.equal(decision?.verticalHandoff, undefined);
  assert.equal(decision?.verticalActivationRequest, undefined);
  for (const domainHint of [null, "core", "unknown", "imob&mode=execute"]) {
    assert.equal(await resolveLauncherNavigationDecision({ domainHint, isUnifiedEiah: true }), null);
  }
  assert.equal(await resolveLauncherNavigationDecision({ domainHint: "imob", isUnifiedEiah: false }), null);
});

for (const scenario of ["allowed", "not_installed", "agents_missing", "permission_denied", "revoked", "different_workspace"]) {
  test(`Marketplace → engine → registry → handoff governado: ${scenario}`, async (t) => {
    updateSession({ token: "synthetic-token", userId: "user-test", tenantId: "tenant-test", workspaceId: "workspace-test", activeDomain: "core" });
    const originalFetch = globalThis.fetch;
    t.after(() => { globalThis.fetch = originalFetch; });
    const calls: Array<{ path: string; method: string; workspace: string | null }> = [];
    const composed = composeVerticalRegistry({ scope: { tenantId: "tenant-test", workspaceId: scenario === "different_workspace" ? "workspace-other" : "workspace-test" },
      imob: { installationStatus: scenario === "not_installed" ? "missing" : "active", entitled: true,
        agentsReady: scenario !== "agents_missing", userCanUse: !["permission_denied", "different_workspace"].includes(scenario),
        usage: scenario === "revoked" ? "blocked" : "full" } });
    if (scenario === "different_workspace") updateSession({ workspaceId: "workspace-other" });
    globalThis.fetch = (async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push({ path, method: init?.method ?? "GET", workspace: new Headers(init?.headers).get("x-eiah-workspace") });
      if (path.endsWith("/vertical-registry")) return new Response(JSON.stringify({ ok: true, data: projectVerticalRegistryForSurface(composed.registry) }));
      assert.ok(path.endsWith("/vertical-handoff"), "não chama ativação, run, aprovação ou domínio operacional");
      const request = JSON.parse(String(init?.body));
      assert.equal(request.mode, "read_only");
      return new Response(JSON.stringify({ ok: true, data: buildAndEvaluateVerticalHandoff(composed, request, "test-handoff") }));
    }) as typeof fetch;
    let syncs = 0;
    const decision = await resolveLauncherNavigationDecision({ domainHint: "imob", isUnifiedEiah: true });
    const resolved = await enrichLauncherDecisionWithVerticalHandoff(decision, undefined, undefined, async () => {
      syncs += 1; updateSession({ activeDomain: "imob" });
    });
    assert.equal(resolved?.verticalHandoff?.ok, scenario === "allowed");
    assert.equal(syncs, scenario === "allowed" ? 1 : 0);
    assert.equal(getSession().activeDomain, scenario === "allowed" ? "imob" : "core");
    assert.equal(resolved?.shouldCreateRun, false);
    assert.ok(calls.every((call) => call.workspace === (scenario === "different_workspace" ? "workspace-other" : "workspace-test")));
  });
}

for (const outcome of ["allowed", "denied"]) {
  test(`entrada superada durante handoff ${outcome} é descartada antes de sincronizar`, async () => {
    let current = true;
    let syncs = 0;
    const decision = await resolveLauncherNavigationDecision({ domainHint: "imob", isUnifiedEiah: true });
    const result = await enrichLauncherDecisionWithVerticalHandoff(decision, undefined, async () => {
      current = false;
      return outcome === "allowed" ? allowed : { ok: false, reasonCode: "VERTICAL_SCOPE_DENIED" };
    }, async () => { syncs += 1; }, () => current);
    assert.equal(result, null);
    assert.equal(syncs, 0);
  });
}

test("entrada superada durante sync não apresenta resposta nem encaminha input", async () => {
  let current = true;
  const decision = await resolveLauncherNavigationDecision({ domainHint: "imob", isUnifiedEiah: true });
  const result = await enrichLauncherDecisionWithVerticalHandoff(decision, undefined, async () => allowed,
    async () => { current = false; }, () => current);
  assert.equal(result, null);
});
