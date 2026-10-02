import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "@/lib/api";
import {
  ACTIVATION_CONFIRM_REPLY,
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
