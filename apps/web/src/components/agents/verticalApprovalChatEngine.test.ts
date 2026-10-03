import test from "node:test";
import assert from "node:assert/strict";
import { ApiError, type VerticalApprovalAdminItem } from "@/lib/api";
import {
  attachVerticalApprovalChatToSnapshot,
  confirmReplyFor,
  describeApprovalQueue,
  enrichLauncherDecisionWithVerticalApprovalChat,
  resolveVerticalApprovalChatStep,
  type VerticalApprovalChatSnapshot,
} from "./verticalApprovalChatEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";

// ADR-011 §2.3: decisão do administrador EIAH pela conversa, sempre com confirmação explícita.

const item = (over: Partial<VerticalApprovalAdminItem>): VerticalApprovalAdminItem => ({
  id: "a1",
  tenantName: "Imobiliária Sol",
  workspaceName: "Principal",
  vertical: "IMOB",
  status: "aguardando_humano",
  source: "request",
  revocationMode: null,
  requestedBy: "Dona",
  requestedAt: null,
  decidedBy: null,
  decidedAt: null,
  note: null,
  score: 55,
  recommendation: "revisar",
  scoreReasons: [
    { rule: "conta_billing_ativa", ok: false, points: 0, maxPoints: 25, message: "Sem conta de billing ativa." },
    { rule: "sem_disputa_aberta", ok: true, points: 20, maxPoints: 20, message: "Nenhuma disputa aberta." },
  ],
  scoreRuleVersion: "vertical-access-score.v1",
  ...over,
});

test("fila: só pedidos aguardando, com score e motivos não atendidos; nada decidido ainda", () => {
  const queue = describeApprovalQueue([
    item({}),
    item({ id: "a2", tenantName: "Casa Azul", recommendation: "nao_recomendado", score: 30 }),
    item({ id: "x", status: "aprovado" }),
  ]);
  assert.equal(queue.approvalChat.status, "queue");
  assert.match(queue.content, /\*\*Pedido 1:\*\* IMOB para Imobiliária Sol · Principal — score 55 \(Revisar\)\n\n- ✗ Sem conta de billing ativa\./);
  assert.match(queue.content, /\n\n\*\*Pedido 2:\*\* IMOB para Casa Azul/, "um bloco por pedido");
  assert.doesNotMatch(queue.content, /^\s+✗/m, "sem recuo (o markdown juntaria as linhas)");
  assert.doesNotMatch(queue.content, /Nenhuma disputa aberta/, "mostra só o que falhou");
  assert.deepEqual(queue.quickReplies, [
    "Aprovar pedido 1: IMOB para Imobiliária Sol · Principal",
    "Recusar pedido 1: IMOB para Imobiliária Sol · Principal",
    "Aprovar pedido 2: IMOB para Casa Azul · Principal",
    "Recusar pedido 2: IMOB para Casa Azul · Principal",
  ]);
  assert.equal(describeApprovalQueue([item({ status: "recusado" })]).approvalChat.status, "empty");
});

test("passos: escolher → (observação quando obrigatória) → confirmação explícita → decide", () => {
  const queue = describeApprovalQueue([item({}), item({ id: "a2", tenantName: "Casa Azul", recommendation: "nao_recomendado" })]).approvalChat;
  assert.deepEqual(resolveVerticalApprovalChatStep("aprovações pendentes", null), { step: "list" });
  assert.equal(resolveVerticalApprovalChatStep("Aprovar pedido 1", null), null, "sem fila não decide");
  assert.equal(resolveVerticalApprovalChatStep("Aprovar pedido 9", queue), null, "número fora da fila");

  const approve = resolveVerticalApprovalChatStep("Aprovar pedido 1: IMOB para Imobiliária Sol · Principal", queue);
  assert.deepEqual(approve, { step: "choose", approvalId: "a1", decision: "aprovar", label: "IMOB para Imobiliária Sol · Principal", noteRequired: false });
  const refuse = resolveVerticalApprovalChatStep("recusar pedido 1", queue);
  assert.equal(refuse?.step === "choose" && refuse.noteRequired, true, "recusar exige observação");
  const againstAgent = resolveVerticalApprovalChatStep("aprovar pedido 2", queue);
  assert.equal(againstAgent?.step === "choose" && againstAgent.noteRequired, true, "aprovar contra a recomendação exige observação");

  const noteNeeded: VerticalApprovalChatSnapshot = { status: "note_needed", approvalId: "a1", decision: "recusar", label: "IMOB para Imobiliária Sol · Principal" };
  assert.deepEqual(resolveVerticalApprovalChatStep("Inadimplente desde agosto", noteNeeded), {
    step: "note", approvalId: "a1", decision: "recusar", label: "IMOB para Imobiliária Sol · Principal", note: "Inadimplente desde agosto",
  });
  assert.deepEqual(resolveVerticalApprovalChatStep("cancelar", noteNeeded), { step: "cancel" });

  const confirm: VerticalApprovalChatSnapshot = { status: "confirm", approvalId: "a1", decision: "recusar", label: "IMOB para Imobiliária Sol · Principal", note: "x" };
  assert.equal(resolveVerticalApprovalChatStep("sim", confirm), null, "um 'sim' solto não decide");
  assert.equal(resolveVerticalApprovalChatStep("Confirmar aprovação", confirm), null, "confirmar a outra decisão não vale");
  assert.equal(resolveVerticalApprovalChatStep(confirmReplyFor("recusar", "IMOB para Imobiliária Sol · Principal"), confirm)?.step, "confirm");
  assert.equal(resolveVerticalApprovalChatStep("Confirmar recusa", confirm)?.step, "confirm");
});

test("engine assíncrono: lista, decide pelo canal chat e não revela a fila a quem não é administrador", async () => {
  const decided: unknown[] = [];
  const api = {
    list: async () => ({ ok: true as const, data: { awaiting: 1, items: [item({})] } }),
    decide: async (id: string, body: unknown) => {
      decided.push([id, body]);
      return { ok: true as const, data: {} };
    },
  };
  const listed = await enrichLauncherDecisionWithVerticalApprovalChat({ verticalApprovalChatRequest: { step: "list" } }, api);
  assert.equal(listed?.verticalApprovalChat?.status, "queue");

  const chosen = await enrichLauncherDecisionWithVerticalApprovalChat(
    { verticalApprovalChatRequest: { step: "choose", approvalId: "a1", decision: "aprovar", label: "IMOB para Imobiliária Sol · Principal", noteRequired: false } },
    api,
  );
  assert.equal(chosen?.verticalApprovalChat?.status, "confirm");
  assert.deepEqual(chosen?.resolvedQuickReplies, ["Confirmar aprovação: IMOB para Imobiliária Sol · Principal", "Cancelar decisão"]);
  assert.equal(decided.length, 0, "escolher não decide");

  const done = await enrichLauncherDecisionWithVerticalApprovalChat(
    { verticalApprovalChatRequest: { step: "confirm", approvalId: "a1", decision: "aprovar", label: "IMOB para Imobiliária Sol · Principal", note: null } },
    api,
  );
  assert.deepEqual(decided, [["a1", { decision: "aprovar", note: undefined, channel: "chat" }]]);
  assert.equal(done?.verticalApprovalChat?.status, "done");

  const notAdmin = await enrichLauncherDecisionWithVerticalApprovalChat(
    { verticalApprovalChatRequest: { step: "list" } },
    { ...api, list: async () => { throw new ApiError(404, "Not Found", { error: { code: "NOT_FOUND" } }); } },
  );
  assert.equal(notAdmin?.content, "Não encontrei aprovações aguardando decisão para você.");

  const conflict = await enrichLauncherDecisionWithVerticalApprovalChat(
    { verticalApprovalChatRequest: { step: "confirm", approvalId: "a1", decision: "aprovar", label: "x", note: null } },
    { ...api, decide: async () => { throw new ApiError(409, "Conflict", { error: { code: "VERTICAL_ACCESS_NOT_AWAITING_DECISION", message: "Este pedido não está aguardando decisão." } }); } },
  );
  assert.equal(conflict?.content, "Nada foi decidido. Este pedido não está aguardando decisão.");

  const snapshot = attachVerticalApprovalChatToSnapshot({ verticalApprovalChat: null }, done);
  assert.deepEqual(snapshot.verticalApprovalChat, { status: "done" });
});

test("launcher: pedido de fila no front door vira passo do engine, sem run", async () => {
  const decision = await resolveLauncherTurnDecision({
    input: "quais aprovações pendentes?",
    trimmedInput: "quais aprovações pendentes?",
    routeIntent: "help",
    proposalMode: false,
    isUnifiedEiah: true,
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    confidence: 0.9,
  });
  assert.equal(decision?.shouldCreateRun, false);
  assert.deepEqual(decision?.verticalApprovalChatRequest, { step: "list" });
});
