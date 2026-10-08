import test from "node:test";
import assert from "node:assert/strict";
import type { ChatVerticalHandoffResult } from "@/lib/api";
import {
  attachVerticalHandoffToSnapshot,
  describeVerticalHandoffResult,
  enrichLauncherDecisionWithVerticalHandoff,
  isImobOperationalRequest,
} from "./verticalHandoffEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";
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
