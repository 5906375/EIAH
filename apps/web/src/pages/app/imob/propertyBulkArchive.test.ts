import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { ImobProperty } from "@/lib/api";
import { ImobPropertyBulkArchivePanel } from "@/features/imob/structured/ImobPropertyBulkArchivePanel";
import {
  IMOB_PROPERTY_LIST_SERVER_CAP,
  NO_OWNER_LABEL,
  applyBulkArchiveEligibility,
  backToBulkArchiveSelection,
  buildPropertyBulkArchiveForm,
  buildBulkArchiveResultText,
  bulkArchiveConfirmLabel,
  classifyBulkArchiveFailure,
  clearBulkArchiveSelection,
  describeCandidateOwner,
  enterBulkArchiveReview,
  filterBulkArchiveCandidates,
  finishBulkArchiveRun,
  formatBulkArchiveSummary,
  initialBulkArchiveState,
  isPropertyBulkArchiveForm,
  loadedBulkArchiveState,
  pendingBulkArchiveIds,
  prepareBulkArchiveRetry,
  recordBulkArchiveOutcome,
  runBulkArchive,
  selectVisibleBulkArchive,
  setBulkArchiveQuery,
  startBulkArchiveRun,
  summarizeBulkArchiveOutcomes,
  summarizeBulkArchiveSelection,
  toBulkArchiveCandidates,
  toggleBulkArchiveSelection,
  type BulkArchiveOutcome,
  type PropertyBulkArchiveState,
} from "./propertyBulkArchive";
import { IMOB_ACTION_MENUS } from "@/features/imob/imobActionMenus";

/** Fixtures 100% sintéticas: nenhum dado real de staging. */
function property(id: string, unit: string | null, owner: { id: string; name: string } | null, extra: Partial<ImobProperty> = {}): ImobProperty {
  return {
    id, tenantId: "tenant-sintetico", workspaceId: "workspace-sintetico", ownerId: owner?.id ?? null, propertyType: "kitnet", goal: "locacao",
    address: "Rua Sintética, 100", city: "Cidade Exemplo", neighborhood: null, bedrooms: null, bathrooms: null, areaM2: null, garageSpots: null,
    askingPriceCents: null, description: null, status: "ready", pendingItems: null, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    metadata: unit ? { externalPropertyRef: unit } : {}, owner, ...extra,
  } as ImobProperty;
}

const ownerA = { id: "owner-a", name: "Proprietário Sintético A" };
const ownerB = { id: "owner-b", name: "Proprietário Sintético B" };
const items = [
  property("p-303", "Kitnet 303", null),
  property("p-301", "Kitnet 301", ownerA),
  property("p-302", "Kitnet 302", ownerB),
  property("p-old", "Kitnet 099", ownerA, { status: "archived" }),
  property("p-101", "Apto 101", ownerA, { propertyType: "apartamento", address: "Av. Sintética, 7" }),
];

function loaded(): PropertyBulkArchiveState {
  return loadedBulkArchiveState(initialBulkArchiveState(), items);
}

function selecting(...ids: string[]) {
  let state = loaded();
  for (const id of ids) state = toggleBulkArchiveSelection(state, id);
  return state;
}

test("candidatos: arquivados não entram; proprietário vem só do vínculo; sem inferência por endereço", () => {
  const candidates = toBulkArchiveCandidates(items);
  assert.deepEqual(candidates.map((c) => c.id), ["p-101", "p-301", "p-302", "p-303"]);
  const noOwner = candidates.find((c) => c.id === "p-303")!;
  assert.equal(describeCandidateOwner(noOwner), NO_OWNER_LABEL);
  assert.equal(NO_OWNER_LABEL, "Sem proprietário vinculado");
  // Mesmo endereço do p-301, mas sem ownerId: continua sem proprietário.
  assert.equal(noOwner.address, candidates.find((c) => c.id === "p-301")!.address);
  assert.equal(describeCandidateOwner(candidates.find((c) => c.id === "p-301")!), ownerA.name);
  // ownerId presente sem objeto owner: não finge nem some, e não vira "sem proprietário".
  const [orphan] = toBulkArchiveCandidates([property("p-x", "Kitnet 500", null, { ownerId: "owner-x" })]);
  assert.equal(describeCandidateOwner(orphan), "Proprietário não identificado");
});

test("filtro ignora caixa e acentos e busca em unidade, proprietário e endereço", () => {
  const candidates = toBulkArchiveCandidates(items);
  assert.deepEqual(filterBulkArchiveCandidates(candidates, "KITNET 30").map((c) => c.id), ["p-301", "p-302", "p-303"]);
  assert.deepEqual(filterBulkArchiveCandidates(candidates, "proprietario sintetico b").map((c) => c.id), ["p-302"]);
  assert.deepEqual(filterBulkArchiveCandidates(candidates, "sem proprietário").map((c) => c.id), ["p-303"]);
  assert.deepEqual(filterBulkArchiveCandidates(candidates, "av. sintetica").map((c) => c.id), ["p-101"]);
  assert.equal(filterBulkArchiveCandidates(candidates, "   ").length, 4);
});

test("seleção, desmarcação, id desconhecido ignorado e limpeza", () => {
  let state = selecting("p-301", "p-302", "p-303");
  assert.deepEqual(state.selectedIds, ["p-301", "p-302", "p-303"]);
  state = toggleBulkArchiveSelection(state, "p-302");
  assert.deepEqual(state.selectedIds, ["p-301", "p-303"]);
  assert.equal(toggleBulkArchiveSelection(state, "p-old"), state, "arquivado não é selecionável");
  assert.equal(toggleBulkArchiveSelection(state, "inexistente"), state);
  assert.deepEqual(clearBulkArchiveSelection(state).selectedIds, []);
  assert.equal(summarizeBulkArchiveSelection(state).selected, 2);
});

test("selecionar todos age só sobre o que o filtro exibe e sinaliza o que está fora do filtro", () => {
  let state = setBulkArchiveQuery(loaded(), "kitnet 30");
  state = selectVisibleBulkArchive(state);
  assert.deepEqual(state.selectedIds, ["p-301", "p-302", "p-303"], "o Apto 101 oculto pelo filtro não é selecionado");
  state = setBulkArchiveQuery(state, "kitnet 301");
  assert.deepEqual(summarizeBulkArchiveSelection(state), { selected: 3, visible: 1, hiddenSelected: 2 });
  state = setBulkArchiveQuery(selectVisibleBulkArchive(setBulkArchiveQuery(loaded(), "inexistente")), "");
  assert.deepEqual(state.selectedIds, [], "filtro sem resultado não seleciona nada");
});

test("lista no limite do servidor é sinalizada como possivelmente incompleta", () => {
  const many = Array.from({ length: IMOB_PROPERTY_LIST_SERVER_CAP }, (_, index) => property(`p-${index}`, `Unidade ${index}`, null));
  assert.equal(loadedBulkArchiveState(initialBulkArchiveState(), many).truncated, true);
  assert.equal(loaded().truncated, false);
});

test("revisão congela o lote exato, não escreve e permite voltar e corrigir", () => {
  assert.equal(enterBulkArchiveReview(loaded()).stage, "select", "sem seleção não há revisão");
  const review = enterBulkArchiveReview(selecting("p-301", "p-303"));
  assert.equal(review.stage, "review");
  assert.deepEqual(review.reviewedIds, ["p-301", "p-303"]);
  assert.deepEqual(review.outcomes, {});
  // A seleção só muda voltando à seleção; na revisão os toggles são ignorados.
  assert.equal(toggleBulkArchiveSelection(review, "p-302"), review);
  const back = backToBulkArchiveSelection(review);
  assert.equal(back.stage, "select");
  assert.deepEqual(back.selectedIds, ["p-301", "p-303"]);
  assert.deepEqual(back.reviewedIds, []);
  assert.equal(bulkArchiveConfirmLabel(3), "Confirmar arquivamento de 3 imóveis");
  assert.equal(bulkArchiveConfirmLabel(1), "Confirmar arquivamento de 1 imóvel");
});

test("elegibilidade preliminar é informativa e pode ficar desconhecida", () => {
  const review = enterBulkArchiveReview(selecting("p-301", "p-302"));
  const checked = applyBulkArchiveEligibility(review, new Set(["p-302"]));
  assert.deepEqual(checked.eligibility, { "p-301": "no_case_known", "p-302": "case_linked" });
  assert.equal(checked.stage, "review", "a verificação não decide nada nem avança a etapa");
  const unknown = applyBulkArchiveEligibility(review, null);
  assert.deepEqual(unknown.eligibility, { "p-301": "unknown", "p-302": "unknown" });
  assert.equal(unknown.eligibilityChecked, false);
});

test("classificação das falhas: item bloqueado/ausente/negado segue; falha sistêmica interrompe", () => {
  assert.deepEqual(classifyBulkArchiveFailure({ status: 409, code: "PROPERTY_DELETE_BLOCKED" }), { outcome: "blocked", fatal: false });
  assert.deepEqual(classifyBulkArchiveFailure({ status: 404 }), { outcome: "not_found", fatal: false });
  assert.deepEqual(classifyBulkArchiveFailure({ status: 403 }), { outcome: "denied", fatal: false });
  assert.deepEqual(classifyBulkArchiveFailure({ status: 409, code: "OUTRO" }), { outcome: "failed", fatal: false });
  assert.deepEqual(classifyBulkArchiveFailure({ status: 503 }), { outcome: "failed", fatal: true });
  assert.deepEqual(classifyBulkArchiveFailure({ status: 401 }), { outcome: "failed", fatal: true });
  assert.deepEqual(classifyBulkArchiveFailure({ status: 0 }), { outcome: "failed", fatal: true });
});

type Failure = { status: number; code?: string | null };
function runner(ids: string[], behavior: Record<string, Failure | "ok">, canContinue: (calls: string[]) => boolean = () => true) {
  const calls: string[] = [];
  const result = runBulkArchive({
    ids,
    archive: async (id) => {
      calls.push(id);
      const entry = behavior[id] ?? "ok";
      if (entry !== "ok") throw entry;
    },
    failureOf: (error) => error as Failure,
    canContinue: () => canContinue(calls),
  });
  return { calls, result };
}

test("três arquivamentos bem-sucedidos: um pedido por imóvel, em sequência, só os confirmados", async () => {
  const { calls, result } = runner(["p-301", "p-302", "p-303"], {});
  assert.deepEqual(await result, { "p-301": "archived", "p-302": "archived", "p-303": "archived" });
  assert.deepEqual(calls, ["p-301", "p-302", "p-303"]);
});

test("um sucesso e dois bloqueios por dependência: bloqueio de um item não impede os seguintes", async () => {
  const blocked = { status: 409, code: "PROPERTY_DELETE_BLOCKED" };
  const { calls, result } = runner(["p-301", "p-302", "p-303"], { "p-301": blocked, "p-302": "ok", "p-303": blocked });
  const outcomes = await result;
  assert.deepEqual(outcomes, { "p-301": "blocked", "p-302": "archived", "p-303": "blocked" });
  assert.deepEqual(calls, ["p-301", "p-302", "p-303"]);
  assert.equal(formatBulkArchiveSummary(summarizeBulkArchiveOutcomes(outcomes, Object.keys(outcomes))), "1 arquivado · 2 bloqueados · 0 não processados");
});

test("falha sistêmica no meio: preserva os arquivados e marca o resto como não processado, sem tentar", async () => {
  const { calls, result } = runner(["p-301", "p-302", "p-303"], { "p-302": { status: 503 } });
  assert.deepEqual(await result, { "p-301": "archived", "p-302": "failed", "p-303": "not_processed" });
  assert.deepEqual(calls, ["p-301", "p-302"], "o terceiro nunca foi chamado");
});

test("contexto que deixa de valer (sessão, formulário, interrupção) para antes da próxima escrita", async () => {
  const { calls, result } = runner(["p-301", "p-302", "p-303"], {}, (made) => made.length < 1);
  assert.deepEqual(await result, { "p-301": "archived", "p-302": "not_processed", "p-303": "not_processed" });
  assert.deepEqual(calls, ["p-301"]);
  const none = runner(["p-301"], {}, () => false);
  assert.deepEqual(await none.result, { "p-301": "not_processed" });
  assert.deepEqual(none.calls, []);
});

test("ids repetidos no lote não geram pedido duplicado", async () => {
  const { calls, result } = runner(["p-301", "p-301", "p-302"], {});
  assert.deepEqual(await result, { "p-301": "archived", "p-302": "archived" });
  assert.deepEqual(calls, ["p-301", "p-302"]);
});

test("resumo: pluralização e categorias extras só quando existem", () => {
  const base = { archived: 0, blocked: 0, not_found: 0, denied: 0, failed: 0, not_processed: 0 };
  assert.equal(formatBulkArchiveSummary({ ...base, archived: 3 }), "3 arquivados · 0 bloqueados · 0 não processados");
  assert.equal(formatBulkArchiveSummary({ ...base, archived: 1, blocked: 1, not_processed: 1 }), "1 arquivado · 1 bloqueado · 1 não processado");
  assert.equal(formatBulkArchiveSummary({ ...base, archived: 1, failed: 1, denied: 2, not_found: 1 }), "1 arquivado · 0 bloqueados · 0 não processados · 1 com falha · 2 sem acesso · 1 não encontrado");
});

function afterRun(outcomes: Record<string, BulkArchiveOutcome>): PropertyBulkArchiveState {
  let state = startBulkArchiveRun(enterBulkArchiveReview(selecting("p-301", "p-302", "p-303")));
  for (const [id, outcome] of Object.entries(outcomes)) state = recordBulkArchiveOutcome(state, id, outcome);
  return finishBulkArchiveRun(state);
}

test("falha parcial: resultados preservados, só falha/não processado são retomáveis e nunca um arquivado", () => {
  const state = afterRun({ "p-301": "archived", "p-302": "failed", "p-303": "not_processed" });
  assert.deepEqual(pendingBulkArchiveIds(state), ["p-302", "p-303"]);
  assert.equal(recordBulkArchiveOutcome(state, "p-301", "failed").outcomes["p-301"], "archived", "arquivado não é sobrescrito");
  const blocked = afterRun({ "p-301": "blocked", "p-302": "archived", "p-303": "denied" });
  assert.deepEqual(pendingBulkArchiveIds(blocked), [], "bloqueado/sem acesso não volta como pendente");
});

test("retomada: recarrega, descarta o que sumiu e volta à revisão sem executar", () => {
  const state = afterRun({ "p-301": "archived", "p-302": "failed", "p-303": "not_processed" });
  // Na lista recarregada o p-301 já está arquivado e o p-303 sumiu; só o p-302 continua elegível.
  const fresh = [property("p-301", "Kitnet 301", ownerA, { status: "archived" }), property("p-302", "Kitnet 302", ownerB)];
  const retry = prepareBulkArchiveRetry(state, fresh);
  assert.equal(retry.stage, "review", "exige nova confirmação explícita");
  assert.deepEqual(retry.reviewedIds, ["p-302"]);
  assert.equal(retry.outcomes["p-301"], "archived");
  assert.equal(retry.outcomes["p-303"], "not_found");
  assert.equal(retry.outcomes["p-302"], "failed", "ainda não foi tentado de novo");
  const nothing = prepareBulkArchiveRetry(state, []);
  assert.equal(nothing.stage, "result");
  assert.match(nothing.notice ?? "", /Nenhum item pendente/);
});

test("texto persistido na conversa traz totais e não expõe nomes de proprietários", () => {
  const state = afterRun({ "p-301": "archived", "p-302": "blocked", "p-303": "not_processed" });
  const text = buildBulkArchiveResultText(state);
  assert.equal(text, "Arquivamento de imóveis: 1 arquivado · 1 bloqueado · 1 não processado.");
  assert.ok(!/Sintético/.test(text));
});

test("formulário marca o tipo da mensagem e o item de menu 'Arquivar imóvel' continua o mesmo", () => {
  const form = buildPropertyBulkArchiveForm();
  assert.equal(isPropertyBulkArchiveForm(form), true);
  assert.deepEqual(form.fields, []);
  const item = IMOB_ACTION_MENUS.flatMap((menu) => menu.items).find((entry) => entry.label === "Arquivar imóvel");
  assert.ok(item && item.kind === "local" && item.form === "property_archive");
});

// --- Painel (renderização estática: estrutura, acessibilidade e responsividade) ---------------------------------

const noop = () => undefined;
const render = (state: PropertyBulkArchiveState | undefined) =>
  renderToStaticMarkup(React.createElement(ImobPropertyBulkArchivePanel, { messageId: "msg-1", state, onEvent: noop }));

test("painel: seleção usa checkboxes com rótulo, mostra proprietário/endereço e 'Sem proprietário vinculado'", () => {
  const html = render(selecting("p-301"));
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 4, "um checkbox por imóvel ativo");
  assert.equal((html.match(/checked=""/g) ?? []).length, 1, "só o selecionado vem marcado");
  assert.match(html, /<label[^>]*>[\s\S]*?type="checkbox"[\s\S]*?Kitnet 301/);
  assert.match(html, /Proprietário: Proprietário Sintético A/);
  assert.match(html, /Proprietário: Sem proprietário vinculado/);
  assert.match(html, /Rua Sintética, 100 · Cidade Exemplo/);
  assert.match(html, /1 selecionado/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /type="search"/);
  assert.match(html, /Revisar arquivamento/);
  assert.ok(!/Confirmar arquivamento/.test(html), "a confirmação só existe na revisão");
  assert.match(html, /min-h-\[44px\]/, "alvos de toque no mobile");
  assert.match(html, /max-h-\[50dvh\]/, "lista com rolagem própria, sem overflow da página");
});

test("painel: o botão de selecionar exibidos concorda em número (1 exibido / N exibidos)", () => {
  assert.match(render(loaded()), /Selecionar os 4 exibidos/);
  assert.match(render(setBulkArchiveQuery(loaded(), "apto")), /Selecionar o 1 exibido/);
  assert.ok(!/Selecionar os 1 exibidos/.test(render(setBulkArchiveQuery(loaded(), "apto"))));
});

test("painel: sem seleção o botão de revisar fica desabilitado; lista truncada é sinalizada", () => {
  const empty = render(loaded());
  assert.match(empty, /<button[^>]*disabled=""[^>]*>\s*Revisar arquivamento/);
  const many = Array.from({ length: IMOB_PROPERTY_LIST_SERVER_CAP }, (_, index) => property(`p-${index}`, `Unidade ${index}`, null));
  assert.match(render(loadedBulkArchiveState(initialBulkArchiveState(), many)), /no máximo 200 imóveis/);
});

test("painel: revisão lista o lote, avisa que nada foi arquivado e só então oferece confirmar N", () => {
  const html = render(applyBulkArchiveEligibility(enterBulkArchiveReview(selecting("p-301", "p-302", "p-303")), new Set(["p-302"])));
  assert.match(html, /Revisão: 3 imóveis serão arquivados se você confirmar\. Nada foi arquivado ainda\./);
  assert.match(html, /Confirmar arquivamento de 3 imóveis/);
  assert.match(html, /Voltar à seleção/);
  assert.match(html, /preserva o histórico/);
  assert.match(html, /Há caso ou locação ligados; o servidor deve bloquear\./);
  assert.match(html, /Sem proprietário vinculado/);
  assert.equal((html.match(/type="checkbox"/g) ?? []).length, 0, "a revisão não edita a seleção");
});

test("painel: durante a execução só há 'Interromper'; no resultado há resumo, itens e retomada dos pendentes", () => {
  const running = render(startBulkArchiveRun(enterBulkArchiveReview(selecting("p-301", "p-302"))));
  assert.match(running, /Arquivando…/);
  assert.match(running, /Interromper/);
  assert.ok(!/Confirmar arquivamento|Revisar arquivamento/.test(running), "sem segundo disparo");
  const result = render(afterRun({ "p-301": "archived", "p-302": "failed", "p-303": "not_processed" }));
  assert.match(result, /1 arquivado · 0 bloqueados · 1 não processado · 1 com falha/);
  assert.match(result, /Kitnet 301 — arquivado/);
  assert.match(result, /Kitnet 302 — falha operacional/);
  assert.match(result, /Tentar de novo os 2 imóveis pendentes/);
  const done = render(afterRun({ "p-301": "archived", "p-302": "archived", "p-303": "blocked" }));
  assert.ok(!/Tentar de novo/.test(done), "bloqueado não é retomável");
});

test("painel: carregando, erro e contexto obsoleto não oferecem arquivar", () => {
  assert.match(render(undefined), /Carregando imóveis…/);
  const stale = render({ ...loaded(), stage: "stale", notice: "O contexto mudou." });
  assert.match(stale, /O contexto mudou\./);
  assert.ok(!/type="checkbox"|Revisar arquivamento|Confirmar/.test(stale));
  assert.match(render({ ...loaded(), stage: "error", notice: "Falhou." }), /Tentar de novo/);
});
