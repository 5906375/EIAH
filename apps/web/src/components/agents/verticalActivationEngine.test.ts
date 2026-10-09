import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "@/lib/api";
import {
  ACCESS_REQUEST_CONFIRM_REPLY,
  ACTIVATION_CONFIRM_REPLY,
  describeActivationFailure,
  describeActivationPreview,
  enrichLauncherDecisionWithVerticalActivation,
  isActivationConfirmation,
  resolveVerticalActivationStep,
} from "./verticalActivationEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";
import { attachVerticalHandoffToSnapshot, describeVerticalHandoffResult } from "./verticalHandoffEngine";
import { getSession, updateSession } from "@/state/sessionStore";

const proposed = { status: "proposed" as const, verticalId: "imob" as const, registryVersion: "vr1-a" };

test("ativação só acontece com confirmação explícita logo após a proposta", () => {
  assert.deepEqual(resolveVerticalActivationStep("ativar o IMOB neste workspace", null), { step: "preview", verticalId: "imob" });
  assert.equal(resolveVerticalActivationStep(ACTIVATION_CONFIRM_REPLY, null), null, "confirmar sem proposta não ativa");
  assert.deepEqual(resolveVerticalActivationStep(ACTIVATION_CONFIRM_REPLY, proposed), { step: "confirm", verticalId: "imob", registryVersion: "vr1-a" });
  assert.deepEqual(resolveVerticalActivationStep("cancelar", proposed), { step: "cancel", verticalId: "imob" });
  assert.equal(resolveVerticalActivationStep("sim", proposed), null, "um 'sim' solto não ativa");
  assert.equal(resolveVerticalActivationStep(ACTIVATION_CONFIRM_REPLY, { status: "activated", verticalId: "imob" }), null);
  assert.equal(resolveVerticalActivationStep("como ativar o imob?", null), null, "pergunta não vira proposta");
  for (const text of ["Confirmar ativação do IMOB", "confirmo a ativação", "sim, pode ativar o imob"]) assert.equal(isActivationConfirmation(text), true, text);
});

test("engine: pedido de ativação vira proposta; confirmação usa a versão do registry da proposta", async () => {
  const base = {
    trimmedInput: "",
    routeIntent: "imob" as const,
    proposalMode: false,
    isUnifiedEiah: true,
    eiahMode: "help" as const,
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    confidence: 0.9,
  };
  const preview = await resolveLauncherTurnDecision({ ...base, input: "ativar o imob" });
  assert.equal(preview?.kind, "vertical_activation_preview");
  const confirm = await resolveLauncherTurnDecision({
    ...base,
    input: ACTIVATION_CONFIRM_REPLY,
    previousAssistantSnapshot: { verticalActivation: proposed } as never,
  });
  assert.equal(confirm?.kind, "vertical_activation_confirm");
  assert.deepEqual(confirm?.verticalActivationRequest, { step: "confirm", verticalId: "imob", registryVersion: "vr1-a" });
  assert.equal(confirm?.shouldCreateRun, false);
});

test("proposta lista os efeitos e pede a frase de confirmação; confirmação ativa e põe a conversa no IMOB", async () => {
  const calls: string[] = [];
  const api = {
    syncSession: async () => { calls.push("sync:imob"); },
    preview: async () => {
      calls.push("preview");
      return { ok: true as const, data: { status: "available" as const, verticalId: "imob", product: "IMOB", registryVersion: "vr1-b", effects: ["instala o IMOB"] } };
    },
    confirm: async (body: { registryVersion: string; confirmed: true }) => {
      calls.push(`confirm:${body.registryVersion}:${body.confirmed}`);
      return { ok: true as const, data: { status: "activated" as const, verticalId: "imob", registryVersion: "vr1-c", releasedRoutes: [] } };
    },
  };
  const previewed = await enrichLauncherDecisionWithVerticalActivation({ verticalActivationRequest: { step: "preview", verticalId: "imob" } }, api as never);
  assert.match(previewed?.content ?? "", /- instala o IMOB/);
  assert.match(previewed?.content ?? "", /Nada muda até você confirmar/);
  assert.deepEqual(previewed?.resolvedQuickReplies, [ACTIVATION_CONFIRM_REPLY, "Cancelar ativação"]);
  assert.deepEqual(previewed?.verticalActivation, { status: "proposed", verticalId: "imob", registryVersion: "vr1-b" });

  const confirmed = await enrichLauncherDecisionWithVerticalActivation(
    { verticalActivationRequest: { step: "confirm", verticalId: "imob", registryVersion: "vr1-b" } },
    api as never,
  );
  assert.deepEqual(calls, ["preview", "confirm:vr1-b:true", "sync:imob"]);
  assert.match(confirmed?.content ?? "", /^IMOB ativado neste workspace/);
  assert.equal(attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | null }, confirmed).verticalContext, "IMOB");

  const cancelled = await enrichLauncherDecisionWithVerticalActivation({ verticalActivationRequest: { step: "cancel", verticalId: "imob" } }, api as never);
  assert.equal(cancelled?.content, "Ativação cancelada. Nada foi alterado.");
  assert.equal(calls.length, 3, "cancelar não chama o servidor nem sincroniza");
});

test("proposta vencida ou erro: nada é ativado e a conversa explica", async () => {
  const stale = await enrichLauncherDecisionWithVerticalActivation(
    { verticalActivationRequest: { step: "confirm", verticalId: "imob", registryVersion: "old" } },
    {
      preview: async () => { throw new Error("x"); },
      confirm: async () => { throw new ApiError(409, "conflict", { error: { code: "ACTIVATION_PROPOSAL_STALE" } }); },
    } as never,
  );
  assert.match(stale?.content ?? "", /nada foi ativado/);
  assert.equal(stale?.verticalActivation?.status, "failed");
});

for (const step of ["preview", "confirm"] as const) {
  test(`already_active no ${step} aguarda sincronização IMOB antes de devolver o resultado`, async () => {
    const calls: string[] = [];
    let finishSync!: () => void;
    const syncPending = new Promise<void>((resolve) => { finishSync = resolve; });
    const pending = enrichLauncherDecisionWithVerticalActivation(
      { verticalActivationRequest: step === "preview"
        ? { step, verticalId: "imob" }
        : { step, verticalId: "imob", registryVersion: "vr1-a" } },
      {
        preview: async () => ({ ok: true, data: { status: "already_active", verticalId: "imob", registryVersion: "vr1-a" } }),
        confirm: async () => ({ ok: true, data: { status: "already_active", verticalId: "imob", registryVersion: "vr1-a", releasedRoutes: [] } }),
        syncSession: async (domain) => { calls.push(domain); await syncPending; },
      },
    );
    let settled = false;
    void pending.then(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(calls, ["imob"]);
    assert.equal(settled, false);
    finishSync();
    assert.equal((await pending)?.verticalActivation?.status, "already_active");
  });
}

test("failed, cancelled, proposta e pedido de acesso não sincronizam sessão", async () => {
  const calls: string[] = [];
  const api = {
    preview: async () => { throw new Error("synthetic failure"); },
    confirm: async () => { throw new Error("synthetic failure"); },
    syncSession: async (domain: "imob") => { calls.push(domain); },
  };
  for (const step of ["preview", "confirm", "cancel", "cancel_access_request"] as const) {
    const result = await enrichLauncherDecisionWithVerticalActivation(
      { verticalActivationRequest: step === "confirm"
        ? { step, verticalId: "imob", registryVersion: "vr1-a" }
        : { step, verticalId: "imob" } }, api,
    );
    assert.ok(["failed", "cancelled"].includes(result!.verticalActivation!.status));
  }
  await enrichLauncherDecisionWithVerticalActivation(
    { verticalActivationRequest: { step: "preview", verticalId: "imob" } },
    { ...api, preview: async () => ({ ok: true, data: { status: "available", verticalId: "imob", product: "IMOB", registryVersion: "vr1-a", effects: [] } }) },
  );
  await enrichLauncherDecisionWithVerticalActivation(
    { verticalActivationRequest: { step: "request_access", verticalId: "imob" } },
    { ...api, requestAccess: async () => ({ ok: true, data: { outcome: "requested", vertical: "IMOB", status: "aguardando_humano", usage: "full", revocationMode: null, requestedAt: null, decidedAt: null } }) },
  );
  assert.deepEqual(calls, []);
});

for (const status of ["activated", "already_active"] as const) test(`falha de sync preserva ${status} e orienta atualizar a página sem reativar`, async () => {
  const result = await enrichLauncherDecisionWithVerticalActivation(
    { verticalActivationRequest: { step: "confirm", verticalId: "imob", registryVersion: "vr1-a" } },
    {
      preview: async () => { throw new Error("unexpected preview"); },
      confirm: async () => ({ ok: true, data: { status, verticalId: "imob", registryVersion: "vr1-b", releasedRoutes: [] } }),
      syncSession: async () => { throw new Error("synthetic sync failure"); },
    },
  );
  assert.equal(result?.verticalActivation?.status, status);
  assert.equal(result?.content, "O IMOB foi ativado, mas não consegui atualizar o contexto local da sessão. Atualize a página para sincronizar a conversa.");
  assert.doesNotMatch(result?.content ?? "", /ativar.*novamente|Nada foi alterado/);
  assert.deepEqual(result?.resolvedQuickReplies, []);
});

for (const status of ["activated", "already_active"] as const) {
  test(`${status}: integração do engine com helper padrão reidrata a sessão antes do próximo turno`, async (t) => {
    const before = getSession();
    t.after(() => updateSession({ ...before, token: before.token, activeDomain: before.activeDomain }));
    updateSession({ token: "synthetic-token", activeDomain: "core", installedProducts: [] });
    const requests: string[] = [];
    t.mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
      requests.push(String(url));
      assert.match(String(url), /\/session\/context\?domain=imob$/);
      return new Response(JSON.stringify({ ok: true, data: {
        tenantId: before.tenantId, workspaceId: before.workspaceId, activeDomain: "imob",
        availableDomains: ["core", "imob"], roles: ["admin"],
        entitlements: { REAL_ESTATE_CORE: true, IMOB_INSTALLED: true },
        productInstallations: [{ product: "IMOB", status: "active" }],
        verticals: [], branding: { brandName: "Test", logoUrl: null, primaryColor: "#123456", workspaceLabel: "Test" },
      } }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await enrichLauncherDecisionWithVerticalActivation(
      { verticalActivationRequest: { step: "confirm", verticalId: "imob", registryVersion: "vr1-a" } },
      {
        preview: async () => { throw new Error("unexpected preview"); },
        confirm: async () => ({ ok: true, data: { status, verticalId: "imob", registryVersion: "vr1-b", releasedRoutes: [] } }),
      },
    );
    assert.equal(result?.verticalActivation?.status, status);
    assert.equal(requests.length, 1);
    assert.equal(getSession().activeDomain, "imob");
    assert.deepEqual(getSession().installedProducts, ["IMOB"]);
    assert.equal(getSession().entitlements?.IMOB_INSTALLED, true);
    assert.equal(getSession().accessGate, null);
  });
}

test("handoff bloqueado por IMOB inativo oferece ativar pela conversa", () => {
  assert.deepEqual(describeVerticalHandoffResult({ ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" }).quickReplies, ["Ativar o IMOB neste workspace", "Ver opções no Marketplace"]);
  assert.deepEqual(describeVerticalHandoffResult({ ok: false, reasonCode: "VERTICAL_SCOPE_DENIED" }).quickReplies, [], "sem permissão não oferece ativar");
});

test("sem permissão de ativar: a conversa explica quem pode e não oferece confirmar", async () => {
  const notPermitted = await enrichLauncherDecisionWithVerticalActivation(
    { verticalActivationRequest: { step: "preview", verticalId: "imob" } },
    { preview: async () => ({ ok: true as const, data: { status: "not_permitted" as const, verticalId: "imob" } }), confirm: async () => { throw new Error("não deve confirmar"); } } as never,
  );
  assert.match(notPermitted?.content ?? "", /Só o proprietário do tenant/);
  assert.deepEqual(notPermitted?.resolvedQuickReplies, []);
  assert.equal(notPermitted?.verticalActivation?.status, "failed");

  const forbidden = await enrichLauncherDecisionWithVerticalActivation(
    { verticalActivationRequest: { step: "confirm", verticalId: "imob", registryVersion: "v" } },
    { preview: async () => { throw new Error("x"); }, confirm: async () => { throw new ApiError(403, "forbidden", { error: { code: "PRODUCT_ACTIVATION_FORBIDDEN" } }); } } as never,
  );
  assert.match(forbidden?.content ?? "", /Só o proprietário do tenant/);
});

test("ADR-011: sem liberação da EIAH a conversa explica o estado e não propõe ativar", () => {
  const notRequested = describeActivationPreview({
    status: "approval_required",
    verticalId: "imob",
    approval: { code: "VERTICAL_NOT_APPROVED", message: "Esta vertical precisa ser liberada pela EIAH antes de ativar. Solicite a liberação.", accessStatus: null },
  });
  assert.match(notRequested.content, /liberada pela EIAH/);
  assert.match(notRequested.content, /pode pedir a liberação/, "explica quem pode pedir");
  assert.deepEqual(notRequested.quickReplies, [], "não oferece confirmar");
  assert.equal(notRequested.activation.status, "failed");

  const pending = describeActivationPreview({
    status: "approval_required",
    verticalId: "imob",
    approval: { code: "VERTICAL_APPROVAL_PENDING", message: "O pedido de liberação está em análise pela EIAH.", accessStatus: "aguardando_humano" },
  });
  assert.equal(pending.content, "O pedido de liberação está em análise pela EIAH.");

  const refusedOnConfirm = describeActivationFailure(
    new ApiError(403, "Forbidden", { error: { code: "VERTICAL_APPROVAL_REFUSED", message: "A EIAH não liberou esta vertical." } }),
  );
  assert.equal(refusedOnConfirm.content, "A EIAH não liberou esta vertical.");
  assert.deepEqual(refusedOnConfirm.quickReplies, []);
});

test("ADR-011 §2.4: quem pode ativar recebe a oferta de pedir a liberação; só a confirmação explícita envia", async () => {
  const offer = describeActivationPreview({
    status: "approval_required",
    verticalId: "imob",
    approval: { code: "VERTICAL_NOT_APPROVED", message: "Esta vertical precisa ser liberada pela EIAH antes de ativar.", accessStatus: null },
    canRequest: true,
  });
  assert.equal(offer.activation.status, "access_request_proposed");
  assert.deepEqual(offer.quickReplies, [ACCESS_REQUEST_CONFIRM_REPLY, "Agora não"]);
  assert.match(offer.content, /Nada é enviado até você confirmar/);

  const pending = { status: "access_request_proposed" as const, verticalId: "imob" as const };
  assert.equal(resolveVerticalActivationStep("sim", pending), null, "um 'sim' solto não pede nada");
  assert.equal(resolveVerticalActivationStep(ACCESS_REQUEST_CONFIRM_REPLY, null), null, "sem oferta não pede");
  assert.deepEqual(resolveVerticalActivationStep(ACCESS_REQUEST_CONFIRM_REPLY, pending), { step: "request_access", verticalId: "imob" });
  assert.deepEqual(resolveVerticalActivationStep("agora não", pending), { step: "cancel_access_request", verticalId: "imob" });

  const calls: unknown[] = [];
  const api = {
    preview: async () => { throw new Error("não deveria chamar"); },
    confirm: async () => { throw new Error("não deveria chamar"); },
    requestAccess: async (body: unknown) => {
      calls.push(body);
      return { ok: true as const, data: { outcome: "requested" as const, vertical: "IMOB", status: "aguardando_humano" as const, usage: "full" as const, revocationMode: null, requestedAt: null, decidedAt: null } };
    },
  };
  const sent = await enrichLauncherDecisionWithVerticalActivation({ verticalActivationRequest: { step: "request_access", verticalId: "imob" } }, api);
  assert.deepEqual(calls, [{ vertical: "IMOB", channel: "chat" }], "canal registrado");
  assert.equal(sent?.verticalActivation?.status, "access_requested");
  assert.match(sent?.content ?? "", /Pedido de liberação enviado/);

  const cancelled = await enrichLauncherDecisionWithVerticalActivation({ verticalActivationRequest: { step: "cancel_access_request", verticalId: "imob" } }, api);
  assert.equal(calls.length, 1, "cancelar não envia");
  assert.equal(cancelled?.verticalActivation?.status, "cancelled");

  const forbidden = await enrichLauncherDecisionWithVerticalActivation(
    { verticalActivationRequest: { step: "request_access", verticalId: "imob" } },
    { ...api, requestAccess: async () => { throw new ApiError(403, "Forbidden", { error: { code: "VERTICAL_ACCESS_REQUEST_FORBIDDEN" } }); } },
  );
  assert.equal(forbidden?.verticalActivation?.status, "failed");
  assert.match(forbidden?.content ?? "", /proprietário do tenant/);
});
