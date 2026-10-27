import test from "node:test";
import assert from "node:assert/strict";
import type { ImobChatConversation, ImobChatMessage } from "@/lib/api";
import {
  buildFrontDoorPersistedMessage, FRONT_DOOR_CLOSED_FORM_NOTE, FRONT_DOOR_RESTORED_REVIEW_TEXT, FRONT_DOOR_SURFACE_ROUTE,
  FRONT_DOOR_SYNTHETIC_THREAD_ID, mapStoredMessageToFrontDoor, restoreFrontDoorMessages,
} from "./imobChatHistory";
import { createImobPersistenceCore, titleFromFirstMessage, type ImobPersistenceApi } from "./imobConversationPersistence";
import { buildPersistedImobChatMessageMetadata, mapStoredMessageToChat } from "@/pages/app/imob/chat";

// FD-IMOB-PERSISTENCE-001 — o Front Door grava/lê o MESMO registro do chat IMOB; nunca thread artificial, credencial ou rascunho.
const stored = (patch: Partial<ImobChatMessage> & { id: string }): ImobChatMessage => ({
  conversationId: "conv_1", role: "assistant", content: "ok", createdAt: "2026-10-21T10:00:00.000Z", ...patch,
});

test("gravação: usuário vira texto puro; thread sintética do Front Door NÃO é gravada; thread real é", () => {
  assert.deepEqual(buildFrontDoorPersistedMessage({ role: "user", text: "  Cadastrar imóvel " }), {
    role: "user", content: "Cadastrar imóvel", metadata: { card: null, caseContext: null, surface: "front_door" },
  });
  const synthetic = buildFrontDoorPersistedMessage({ id: "a", role: "assistant", text: "r", thread: { id: FRONT_DOOR_SYNTHETIC_THREAD_ID, label: "IMOB", status: "active" } });
  assert.ok(synthetic && !("threadId" in synthetic));
  const real = buildFrontDoorPersistedMessage({ id: "a", role: "assistant", text: "r", thread: { id: "thr_9", label: "Captação", status: "waiting" } });
  assert.equal(real && "threadId" in real && real.threadId, "thr_9");
  assert.equal(real && "threadStatus" in real && real.threadStatus, "waiting");
  assert.equal(buildFrontDoorPersistedMessage({ role: "user", text: "   " }), null);
  assert.equal(buildFrontDoorPersistedMessage({ role: "system", text: "x" }), null);
});

test("gravação: a definição do formulário (opções do CRM, valores) NÃO é copiada; fica só o indício", () => {
  const body = buildFrontDoorPersistedMessage({ id: "a", role: "assistant", text: "Escolha", form: { label: "Editar", fields: [{ name: "ownerId", label: "Proprietário", type: "select", options: [{ value: "o1", label: "Fulano de Tal" }] }], actions: [] } as never });
  assert.equal((body!.metadata as Record<string, unknown>).hadForm, true);
  assert.doesNotMatch(JSON.stringify(body), /Fulano de Tal/);
});

test("gravação: revisão de proposta guarda só o marcador (pending:null) — nunca credencial de pergunta ativa", () => {
  const body = buildFrontDoorPersistedMessage({
    id: "a", role: "assistant", text: "Revisão",
    conversationState: { mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {} as never,
      operational: { flow: "proposal.create", status: "ready_for_review", pendingFields: [], continuity: { version: "v1", phase: "review", pending: { ref: "SECRET-REF", contextRef: "c", caseId: "c1", threadId: "t1" } } } as never },
  });
  const metadata = body!.metadata as Record<string, unknown>;
  assert.deepEqual(metadata.operationalContinuity, { version: "v1", phase: "review", pending: null });
  assert.doesNotMatch(JSON.stringify(body), /SECRET-REF/);
});

test("restauração: formulário volta FECHADO; revisão falha fechada; oculta não volta; CTA sem href é descartado; thread sintética some", () => {
  const withForm = mapStoredMessageToFrontDoor(stored({ id: "m1", content: "Preencha", metadata: { form: { label: "Imóvel", fields: [], submitTarget: "x" } } }))!;
  const indicio = mapStoredMessageToFrontDoor(stored({ id: "m1b", content: "Preencha", metadata: { hadForm: true } }))!;
  assert.ok(indicio.text.endsWith(FRONT_DOOR_CLOSED_FORM_NOTE));
  assert.equal(withForm.form, undefined);
  assert.ok(withForm.text.endsWith(FRONT_DOOR_CLOSED_FORM_NOTE));
  const review = mapStoredMessageToFrontDoor(stored({ id: "m2", content: "Revise", action: "crm.proposal.review" }))!;
  assert.equal(review.text, FRONT_DOOR_RESTORED_REVIEW_TEXT);
  assert.equal(mapStoredMessageToFrontDoor(stored({ id: "m3", metadata: { hiddenFromTimeline: true } })), null);
  const card = mapStoredMessageToFrontDoor(stored({ id: "m4", threadId: FRONT_DOOR_SYNTHETIC_THREAD_ID, metadata: {
    card: { type: "action", title: "Próximo passo", lines: ["a", 1], ctas: [{ id: "c1", label: "Abrir", href: "/app/chat?domain=imob" }, { id: "c2", label: "Executar", action: "run" }, { id: "c3", label: "Fora", href: "https://x.test" }] } } }))!;
  assert.equal(card.thread, undefined);
  assert.deepEqual(card.card?.lines, ["a"]);
  assert.deepEqual(card.card?.ctas?.map((cta) => cta.id), ["c1"], "só link interno vira botão; ação do chat legado não tem o que executar aqui");
});

test("restauração em lote: ordem do servidor, sem repetir ids, usuário em texto puro, todas marcadas como já gravadas", () => {
  const out = restoreFrontDoorMessages("conv_1", [
    stored({ id: "u1", role: "user", content: "Quero cadastrar" }), stored({ id: "a1", content: "Abra o formulário" }),
    stored({ id: "a1", content: "duplicado do servidor" }), stored({ id: "a2", content: "Pronto", threadId: "thr_1", threadLabel: "Captação" }),
  ]);
  assert.deepEqual(out.map((item) => item.id), ["u1", "a1", "a2"]);
  assert.equal(out[0].imobStructured, undefined);
  assert.equal(out[2].imobStructured?.thread?.id, "thr_1");
  assert.ok(out.every((item) => item.imobPersisted.conversationId === "conv_1" && item.imobPersisted.messageId === item.id));
});

test("compatibilidade nos dois sentidos com o chat legado: registro do Front Door é lido pelo legado; registro legado é lido pelo Front Door", () => {
  const body = buildFrontDoorPersistedMessage({ id: "a", role: "assistant", text: "Imóvel cadastrado", thread: { id: "thr_1", label: "Captação", status: "active" },
    caseContext: { caseId: "case_1", flow: "property.create", stage: "captacao", status: "collecting", threadId: "thr_1" },
    card: { type: "action", title: "Próximo", lines: ["linha"], ctas: [{ id: "x", label: "Abrir", href: "/app/chat" }] } })!;
  const record = stored({ id: "s1", content: body.content, threadId: "thr_1", threadLabel: "Captação", threadStatus: "active", metadata: body.metadata as Record<string, unknown> });
  const legacy = mapStoredMessageToChat(record);
  assert.equal(legacy.text, "Imóvel cadastrado");
  assert.equal(legacy.thread?.id, "thr_1");
  assert.equal(legacy.caseContext?.caseId, "case_1");
  assert.equal(legacy.card?.title, "Próximo");
  const legacyRecord = stored({ id: "s2", content: "Resposta do chat legado", threadId: "thr_2", threadLabel: "Operação", threadStatus: "waiting",
    metadata: buildPersistedImobChatMessageMetadata({ card: { type: "action", title: "Legado", lines: ["l"], ctas: [] } as never, proof: null as never, caseContext: { caseId: "case_2", flow: "f", stage: "s", status: "st", threadId: "thr_2" } as never, presentationMetadata: undefined, blocks: undefined, widget: undefined, form: undefined, slotCollection: undefined }) });
  const fd = mapStoredMessageToFrontDoor(legacyRecord)!;
  assert.equal(fd.text, "Resposta do chat legado");
  assert.equal(fd.thread?.id, "thr_2");
  assert.equal(fd.caseContext?.caseId, "case_2");
  assert.equal(fd.card?.title, "Legado");
});

type Calls = { creates: Array<{ title?: string }>; messages: Array<{ conversationId: string; role: string; content: string }>; telemetry: Array<Record<string, unknown>> };
function fakeApi(options?: { failMessages?: boolean; conversations?: ImobChatConversation[]; history?: Record<string, ImobChatMessage[]>; delayCreate?: number }) {
  const calls: Calls = { creates: [], messages: [], telemetry: [] };
  let sequence = 0;
  const api = {
    listConversations: async () => ({ ok: true as const, items: options?.conversations ?? [] }),
    createConversation: async (body?: { title?: string }) => { calls.creates.push({ title: body?.title }); if (options?.delayCreate) await new Promise((r) => setTimeout(r, options.delayCreate)); return { ok: true as const, conversation: { conversationId: `conv_${calls.creates.length}`, title: body?.title ?? "Nova conversa IMOB", status: "active" as const, createdAt: "", updatedAt: "", lastMessagePreview: null } }; },
    listMessages: async (id: string) => ({ ok: true as const, items: options?.history?.[id] ?? [] }),
    createMessage: async (conversationId: string, body: { role: string; content: string }) => {
      if (options?.failMessages) throw new Error("boom");
      calls.messages.push({ conversationId, role: body.role, content: body.content });
      return { ok: true as const, message: stored({ id: `srv_${++sequence}`, conversationId, content: body.content }) };
    },
    listThreads: async () => ({ ok: true as const, items: [] }),
    getInterviewState: async () => ({ ok: true as const, state: null, updatedAt: null }),
    telemetry: async (body: Record<string, unknown>) => { calls.telemetry.push(body); return { ok: true as const, telemetry: { id: "t", createdAt: "" } }; },
  } as unknown as ImobPersistenceApi;
  return { api, calls };
}
const body = (content: string, role: "user" | "assistant" = "user") => ({ role, content });

test("núcleo: gravações simultâneas criam UMA conversa e preservam a ordem; mesma chave não grava duas vezes", async () => {
  const { api, calls } = fakeApi({ delayCreate: 20 });
  const core = createImobPersistenceCore(api);
  const results = await Promise.all([core.persist("k1", body("primeira frase longa")), core.persist("k2", body("resposta", "assistant")), core.persist("k1", body("primeira frase longa")), core.persist("k3", body("terceira"))]);
  assert.equal(calls.creates.length, 1);
  assert.equal(calls.creates[0].title, "primeira frase longa");
  assert.deepEqual(calls.messages.map((m) => m.content), ["primeira frase longa", "resposta", "terceira"]);
  assert.equal(new Set(results.filter(Boolean).map((r) => r!.conversationId)).size, 1);
  assert.equal(results[0], results[2], "chave repetida devolve o mesmo resultado");
});

test("núcleo: falha da API não bloqueia (retorna null), registra telemetria value 0 e usa a superfície do Front Door", async () => {
  const { api, calls } = fakeApi({ failMessages: true });
  const core = createImobPersistenceCore(api);
  assert.equal(await core.persist("k", body("pedido")), null);
  await new Promise((r) => setTimeout(r, 5));
  const failed = calls.telemetry.find((t) => t.event === "message_persist_success_rate");
  assert.equal(failed?.value, 0);
  assert.equal((failed?.metadata as Record<string, unknown>).surfaceRoute, FRONT_DOOR_SURFACE_ROUTE);
  assert.doesNotMatch(JSON.stringify(calls.telemetry), /pedido/, "telemetria nunca carrega o conteúdo");
});

test("núcleo: sucesso registra telemetria value 1; reset começa outra conversa e descarta gravação pendente do contexto anterior", async () => {
  const { api, calls } = fakeApi({ delayCreate: 20 });
  const core = createImobPersistenceCore(api);
  const first = core.persist("k1", body("antes do reset"));
  core.reset();
  assert.equal(await first, null, "gravação em voo do contexto anterior não escreve");
  assert.equal(calls.messages.length, 0);
  await core.persist("k2", body("depois do reset"));
  assert.equal(calls.creates.length, 1, "o contexto anterior nem chegou a abrir conversa");
  assert.deepEqual(calls.messages.map((m) => m.content), ["depois do reset"]);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(calls.telemetry.find((t) => t.event === "message_persist_success_rate")?.value, 1);
});

test("núcleo: restore escolhe a conversa pedida ou a mais recente COM histórico; sem histórico devolve null", async () => {
  const conv = (id: string, last: string | null): ImobChatConversation => ({ conversationId: id, title: id, status: "active", createdAt: "", updatedAt: "", lastMessagePreview: last, lastMessageAt: last ? "2026-10-21T10:00:00Z" : null });
  const history = { conv_b: [stored({ id: "x1", conversationId: "conv_b", content: "oi" })], conv_a: [stored({ id: "y1", conversationId: "conv_a", content: "ola" })] };
  const { api } = fakeApi({ conversations: [conv("conv_vazia", null), conv("conv_b", "oi"), conv("conv_a", "ola")], history });
  const core = createImobPersistenceCore(api);
  assert.equal((await core.restore())?.conversationId, "conv_b");
  assert.equal(core.getConversationId(), "conv_b");
  assert.equal((await core.restore({ conversationId: "conv_a" }))?.conversationId, "conv_a");
  assert.equal(core.getConversationId(), "conv_b", "restauração automática não atropela a conversa em uso");
  assert.equal((await core.restore({ conversationId: "conv_a", force: true }))?.conversationId, "conv_a");
  assert.equal(core.getConversationId(), "conv_a");
  assert.equal((await createImobPersistenceCore(fakeApi({ conversations: [conv("so_vazia", null)] }).api).restore()), null);
});

test("título: curto demais não vira título; longo é truncado como no chat legado", () => {
  assert.equal(titleFromFirstMessage("oi"), undefined);
  assert.equal(titleFromFirstMessage("a".repeat(100)), `${"a".repeat(72)}...`);
});
