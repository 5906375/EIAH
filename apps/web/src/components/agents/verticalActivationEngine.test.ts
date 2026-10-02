import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "@/lib/api";
import {
  ACTIVATION_CONFIRM_REPLY,
  describeActivationFailure,
  describeActivationPreview,
  enrichLauncherDecisionWithVerticalActivation,
  isActivationConfirmation,
  resolveVerticalActivationStep,
} from "./verticalActivationEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";
import { attachVerticalHandoffToSnapshot, describeVerticalHandoffResult } from "./verticalHandoffEngine";

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
  assert.deepEqual(calls, ["preview", "confirm:vr1-b:true"]);
  assert.match(confirmed?.content ?? "", /^IMOB ativado neste workspace/);
  assert.equal(attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | null }, confirmed).verticalContext, "IMOB");

  const cancelled = await enrichLauncherDecisionWithVerticalActivation({ verticalActivationRequest: { step: "cancel", verticalId: "imob" } }, api as never);
  assert.equal(cancelled?.content, "Ativação cancelada. Nada foi alterado.");
  assert.equal(calls.length, 2, "cancelar não chama o servidor");
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
  assert.match(notRequested.content, /Solicitar liberação/, "aponta onde pedir");
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
