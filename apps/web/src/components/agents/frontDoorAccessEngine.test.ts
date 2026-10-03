import test from "node:test";
import assert from "node:assert/strict";
import {
  attachFrontDoorAccessCardToSnapshot,
  describeAccessCreationHint,
  isAccessCreationRequest,
  maskAccessCreationInput,
  maskEmailsInText,
} from "./frontDoorAccessEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";

// ADR-011 §2.7: a conversa orienta para o painel "Criar acesso" e nunca guarda o e-mail do convidado.

test("reconhece pedidos de acesso sem confundir com cadastros do IMOB", () => {
  for (const text of ["criar acesso para a Maria", "quero dar acesso a um corretor", "gerar login para a equipe", "convidar pessoa para o workspace"]) {
    assert.equal(isAccessCreationRequest(text), true, text);
  }
  for (const text of ["cadastrar proprietário", "cadastrar imóvel", "criar contrato de locação", "como funciona o IMOB?"]) {
    assert.equal(isAccessCreationRequest(text), false, text);
  }
});

test("histórico guarda o e-mail mascarado só nos pedidos de acesso", () => {
  assert.equal(maskEmailsInText("maria.silva@Imob.com.br e jo@x.io"), "ma***@imob.com.br e jo***@x.io");
  assert.equal(maskAccessCreationInput("criar acesso para maria.silva@imob.com.br"), "criar acesso para ma***@imob.com.br");
  assert.equal(maskAccessCreationInput("meu e-mail é maria@imob.com.br"), "meu e-mail é maria@imob.com.br", "fora do pedido de acesso não muda");
});

test("launcher: pedido de acesso abre o cartão na conversa, sem run e sem pedir e-mail no texto", async () => {
  const decision = await resolveLauncherTurnDecision({
    input: "criar acesso para maria@imob.com.br",
    trimmedInput: "criar acesso para maria@imob.com.br",
    routeIntent: "help",
    proposalMode: false,
    isUnifiedEiah: true,
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    confidence: 0.9,
  });
  assert.equal(decision?.kind, "front_door_access_hint");
  assert.equal(decision?.shouldCreateRun, false);
  assert.equal(decision?.content, describeAccessCreationHint());
  assert.match(decision?.content ?? "", /72 horas/);
  assert.doesNotMatch(decision?.content ?? "", /maria/);
  assert.equal(decision?.frontDoorAccessCard, true, "o cartão aparece dentro da conversa");
  assert.deepEqual(attachFrontDoorAccessCardToSnapshot({ frontDoorAccessCard: null }, decision), { frontDoorAccessCard: true });
  assert.deepEqual(attachFrontDoorAccessCardToSnapshot({}, null), {});
});
