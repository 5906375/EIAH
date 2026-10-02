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
  const ok = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => allowed);
  assert.match(ok?.content ?? "", /^Sigo com o IMOB nesta conversa/);
  assert.equal(ok?.verticalHandoff, allowed);
  const snapshot = attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | null }, ok);
  assert.equal(snapshot.verticalContext, "IMOB");

  const denied = await enrichLauncherDecisionWithVerticalHandoff(base, undefined, async () => ({ ok: false, reasonCode: "VERTICAL_NOT_REGISTERED" }));
  assert.match(denied?.content ?? "", /não está instalado/);
  assert.deepEqual(denied?.resolvedQuickReplies, ["Ver opções no Marketplace", "Entender planos com IMOB"]);
  assert.equal(attachVerticalHandoffToSnapshot({ verticalContext: null as "IMOB" | "LEGAL" | null }, denied).verticalContext, null);

  const untouched = { content: "olá" };
  assert.equal(await enrichLauncherDecisionWithVerticalHandoff(untouched), untouched, "sem pedido de handoff nada muda");
});

test("cada bloqueio explica sem prometer capacidade; motivo desconhecido cai no fail-closed", () => {
  assert.match(describeVerticalHandoffResult({ ok: false, reasonCode: "VERTICAL_SCOPE_DENIED" }).content, /Sua função/);
  assert.match(describeVerticalHandoffResult({ ok: false, reasonCode: "VERTICAL_DISABLED" }).content, /não está ativo/);
  const unknown = describeVerticalHandoffResult({ ok: false, reasonCode: "" });
  assert.match(unknown.content, /Nada foi executado/);
  assert.deepEqual(unknown.handoff, { ok: false, reasonCode: "VERTICAL_GOVERNANCE_NOT_EVALUATED" });
});
