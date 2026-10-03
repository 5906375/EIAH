import test from "node:test";
import assert from "node:assert/strict";
import type { VerticalAccessNotice } from "@/lib/api";
import {
  attachVerticalAccessNoticeToSnapshot,
  describeUnshownNotices,
  enrichLauncherDecisionWithNoticeAck,
  noticeAckReply,
  noticeIdsShownInConversation,
  resolveNoticeAckStep,
} from "./verticalAccessNoticeEngine";
import { resolveLauncherTurnDecision } from "./chatLauncherEngine";

// ADR-011 §2.4: avisos da liberação EIAH dentro da conversa do front door.

const notice = (id: string, createdAt: string, message = "A EIAH liberou o IMOB neste workspace."): VerticalAccessNotice => ({
  id,
  vertical: "IMOB",
  kind: "aprovado",
  message,
  createdAt,
});

test("aviso chega como mensagem uma vez por conversa, com 'Entendi' próprio", () => {
  const first = describeUnshownNotices([notice("n1", "2026-10-03T08:23:00.000Z")], new Set());
  assert.ok(first);
  assert.match(first.content, /^\*\*Aviso da EIAH\*\*/);
  assert.match(first.content, /A EIAH liberou o IMOB neste workspace\./);
  assert.deepEqual(first.notice, { noticeIds: ["n1"], status: "pending" });
  assert.equal(first.quickReplies.length, 1);
  assert.match(first.quickReplies[0]!, /^Entendi o aviso de \d{2}\/\d{2},? \d{2}:\d{2}$/);

  const shown = noticeIdsShownInConversation([attachVerticalAccessNoticeToSnapshot({}, first.notice), null]);
  assert.equal(describeUnshownNotices([notice("n1", "2026-10-03T08:23:00.000Z")], shown), null, "não repete");

  const two = describeUnshownNotices(
    [notice("n3", "2026-10-03T09:00:00.000Z", "Revogado."), notice("n2", "2026-10-03T08:30:00.000Z", "Restaurado.")],
    shown,
  );
  assert.match(two?.content ?? "", /^\*\*Avisos da EIAH \(2\)\*\*/);
  assert.ok((two?.content.indexOf("Restaurado.") ?? 0) < (two?.content.indexOf("Revogado.") ?? 0), "em ordem de data");
  assert.deepEqual(two?.notice.noticeIds, ["n2", "n3"]);
});

test("'Entendi' marca como lidos os avisos daquela mensagem; um 'Entendi' antigo marca os mostrados", async () => {
  const pending = { noticeIds: ["n1"], status: "pending" as const };
  const reply = noticeAckReply("2026-10-03T08:23:00.000Z");
  assert.deepEqual(resolveNoticeAckStep(reply, pending), { noticeIds: ["n1"] });
  assert.deepEqual(resolveNoticeAckStep(reply, null), { noticeIds: "all_shown" });
  assert.equal(resolveNoticeAckStep("entendi", pending), null, "texto solto não marca nada");

  const marked: string[] = [];
  const api = {
    list: async () => ({ ok: true as const, data: { notices: [notice("n9", "2026-10-03T08:00:00.000Z")] } }),
    markRead: async (id: string) => {
      marked.push(id);
      return { ok: true as const };
    },
  };
  const done = await enrichLauncherDecisionWithNoticeAck({ verticalAccessNoticeAck: { noticeIds: ["n1"] } }, api);
  assert.deepEqual(marked, ["n1"]);
  assert.equal(done?.content, "Pronto, aviso marcado como lido.");
  assert.deepEqual(done?.verticalAccessNotice, { noticeIds: ["n1"], status: "acknowledged" });

  await enrichLauncherDecisionWithNoticeAck({ verticalAccessNoticeAck: { noticeIds: "all_shown" } }, api);
  assert.deepEqual(marked, ["n1", "n9"]);

  const failed = await enrichLauncherDecisionWithNoticeAck(
    { verticalAccessNoticeAck: { noticeIds: ["n1"] } },
    { ...api, markRead: async () => { throw new Error("offline"); } },
  );
  assert.match(failed?.content ?? "", /Não consegui marcar/);
});

test("launcher: o 'Entendi' do aviso vira passo do engine, sem run", async () => {
  const reply = noticeAckReply("2026-10-03T08:23:00.000Z");
  const decision = await resolveLauncherTurnDecision({
    input: reply,
    trimmedInput: reply,
    routeIntent: "help",
    proposalMode: false,
    isUnifiedEiah: true,
    eiahMode: "help",
    agentProfile: null,
    catalogAgents: [],
    intentUnknown: false,
    confidence: 0.9,
    previousAssistantSnapshot: { verticalAccessNotice: { noticeIds: ["n1"], status: "pending" } } as never,
  });
  assert.equal(decision?.kind, "vertical_access_notice_ack");
  assert.equal(decision?.shouldCreateRun, false);
  assert.deepEqual(decision?.verticalAccessNoticeAck, { noticeIds: ["n1"] });
});
