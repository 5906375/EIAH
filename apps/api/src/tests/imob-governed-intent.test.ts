import test from "node:test";
import assert from "node:assert/strict";

import { classifyImobGovernedIntent } from "../services/imob/imobGovernedIntent";
import { buildGovernedImobOperationalConsultContext, isArchivedPropertyConsultText } from "../services/imob/crm/imobCrmGovernedOperationalContext";
import { resolveImobPropertyList } from "../services/imob/crm/imobCrmOperationalPropertyList";
import { resolveImobOperationalConsultImpl } from "../services/imob/crm/imobCrmOperationalResolvers";
import { scopeImobPrismaToStage, withStageScopedPrisma, type ImobOperationalResolverParams, type ImobStageGate, type ResolverHelpers } from "../services/imob/crm/imobCrmOperationalResolverShared";
import { resolveImobCrmTurnEngine, type ImobCrmTurnEngineHelpers, type ImobCrmTurnEngineParams } from "../services/imob/crm/imobCrmTurnEngine";

test("governed IMOB intent classifier flags high-signal ambiguity instead of collapsing it silently", () => {
  const result = classifyImobGovernedIntent("quero agendar visita e preparar contrato");

  assert.equal(result.version, "imob.intent.v1");
  assert.equal(result.ambiguous, true);
  assert.ok(result.candidates.some((candidate) => candidate.intent === "visit"));
  assert.ok(result.candidates.some((candidate) => candidate.intent === "contract"));
});

const baseResolverHelpers: ResolverHelpers = {
  auditAgentId: "audit-agent",
  resolveImobCrmOperationalUpdate: async () => null,
  resolveImobCrmOperationalConsult: async () => null,
  normalizeImobRouteText: (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(),
  extractOwnerNameFromMessage: () => null,
  extractOwnerExplicitNameFromMessage: () => null,
  extractOwnerExplicitPhoneFromMessage: () => null,
  extractOwnerExplicitEmailFromMessage: () => null,
  extractOwnerExplicitDocumentFromMessage: () => null,
  extractLeadNameFromMessage: () => null,
  extractDocumentFromMessage: () => null,
  extractAddressFromMessage: () => null,
  extractExplicitAddressFieldFromMessage: () => null,
  extractPropertyRefFromMessage: () => null,
  extractLeadPhoneFromMessage: () => null,
  extractLeadEmailFromMessage: () => null,
  extractLeadGoalFromMessage: () => null,
  extractAmountAfterKeywords: () => null,
  extractFreeformCityAfterKeywords: () => null,
  extractOwnerCrudIdFromMessage: () => null,
  extractPropertyCrudIdFromMessage: () => null,
  extractPropertyTypeFromMessage: () => null,
  extractPropertyGoalFromMessage: () => null,
  extractPropertyCityFromMessage: () => null,
  resolveOwnerDisplayName: async () => "",
  recordImobCrmAuditEvent: async () => undefined,
  resolveOwnerDocumentForDisplay: () => null,
  formatImobStatusLabel: () => "",
  formatImobPendingList: () => "",
  createEmptyThreadState: () => null,
  formatBudgetCentsForImob: () => null,
  formatPropertyLookupLabel: () => "",
  isOwnerDeleteConfirmationMessage: () => false,
  isPropertyDeleteConfirmationMessage: () => false,
  asObject: () => null,
  asString: () => null,
  asStringList: () => [],
  buildOwnerPendingSuggestion: () => null,
  buildLeadPendingSuggestion: () => null,
  buildPropertyPendingSuggestion: () => null,
  extractListCityFilter: () => null,
  resolveImobBusinessReadIntent: () => null,
  buildCaseContextFromRecord: () => null,
  formatImobCaseFlowLabel: () => "",
  buildImobBusinessReadPresentation: () => ({}),
  isBulkPropertyOnboardingQuestion: () => false,
  buildBulkPropertyOnboardingConsult: () => ({}),
  isImobRecentRegistrationReadRequest: () => false,
  buildImobRecentRegistrationConsult: async () => ({}),
  titleCaseRouteWords: () => "",
  findOwnerIdByAuditName: async () => null,
  buildOwnerUpdateForm: () => ({}),
  buildPropertyUpdateForm: () => ({}),
};

test("governed IMOB operational consult context centralizes consult signals", () => {
  const context = buildGovernedImobOperationalConsultContext(
    {
      prisma: {} as any,
      tenantId: "tenant-A",
      workspaceId: "workspace-A",
      message: "listar imóveis prontos para revisão em itajai",
      threadState: null,
    },
    { ...baseResolverHelpers, extractListCityFilter: () => "itajai" },
  );

  assert.equal(context.intentVersion, "imob.crm.operational.v1");
  assert.equal(context.wantsProperty, true);
  assert.equal(context.asksPropertyList, true);
  assert.equal(context.asksReadyForReview, true);
  assert.equal(context.hasOperationalTarget, true);
  assert.equal(context.hasOperationalAction, true);
  assert.ok(context.intentSignals?.includes("property_list"));
});

// ---------------------------------------------------------------------------
// ARCHIVED-READ: consulta somente leitura de imóveis arquivados (qualificador do contexto governado, listagem existente,
// guard do workflow e turno do engine com a cadeia governada real).
// ---------------------------------------------------------------------------

const stripAccents = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Mesmo objeto de base da suíte; só o que a listagem apresenta ganha implementação real.
const listHelpers: ResolverHelpers = {
  ...baseResolverHelpers,
  createEmptyThreadState: () => ({ mode: "consult", pendingSlot: "none", resultOffset: 0, slots: {}, operational: null }),
  formatImobStatusLabel: (status) => status ?? "",
  formatPropertyLookupLabel: (item) => (item.metadata as { externalPropertyRef?: string } | null)?.externalPropertyRef ?? item.id,
  titleCaseRouteWords: (value) => value.charAt(0).toUpperCase() + value.slice(1),
};

function consultContext(message: string) {
  return buildGovernedImobOperationalConsultContext(
    { prisma: {} as ImobOperationalResolverParams["prisma"], tenantId: "tenant-A", workspaceId: "workspace-A", message, threadState: null },
    listHelpers,
  );
}

test("ARCHIVED-READ: consulta de arquivados vira qualificador de leitura; 'arquivar' continua sendo escrita", () => {
  for (const message of [
    "listar imóveis arquivados",
    "mostrar os imóveis arquivados",
    "consultar imóveis arquivados",
    "ver imóveis arquivados",
    "quais imóveis foram arquivados?",
    "quais imóveis eu arquivei?",
  ]) {
    const context = consultContext(message);
    assert.equal(context.asksArchived, true, message);
    assert.equal(context.asksPropertyList, true, message);
    assert.equal(context.asksDelete, false, message);
    assert.equal(Boolean(context.hasOperationalTarget && context.hasOperationalAction), true, message);
    assert.equal(isArchivedPropertyConsultText(stripAccents(message)), true, message);
  }
  for (const message of ["arquivar imóvel", "arquivar o imóvel Kitnet 301", "arquivar os imóveis arquivados"]) {
    const context = consultContext(message);
    assert.equal(context.asksDelete, true, message);
    assert.equal(context.asksArchived, false, `${message}: comando de escrita nunca vira leitura`);
    assert.equal(context.asksPropertyList, false, message);
    assert.equal(isArchivedPropertyConsultText(stripAccents(message)), false, message);
  }
  const active = consultContext("listar imóveis");
  assert.equal(active.asksPropertyList, true, "listagem ativa preservada");
  assert.equal(active.asksArchived, false);
  // Sem verbo de leitura, "imóveis arquivados" sozinho não dispara listagem: a consulta precisa ser explícita.
  assert.equal(consultContext("imóveis arquivados").asksPropertyList, false);
  assert.equal(isArchivedPropertyConsultText("imoveis arquivados"), false);
});

type PropertyRow = {
  id: string; tenantId: string; workspaceId: string; status: string; goal: string | null; city: string | null;
  updatedAt: Date; metadata: Record<string, unknown>; owner: { name: string } | null;
};
type FindManyArgs = { where: { tenantId: string; workspaceId: string; status: string | { not: string } }; orderBy: unknown; take: number };

/** Banco simulado fiel à consulta: aplica tenant, workspace, status (igual/diferente), ordem por updatedAt e `take`; qualquer escrita é registrada e falha. */
function fakePropertyPrisma(rows: PropertyRow[]) {
  const findManyCalls: FindManyArgs[] = [];
  const writes: string[] = [];
  const forbidden = (name: string) => async () => {
    writes.push(name);
    throw new Error(`escrita proibida na consulta: ${name}`);
  };
  const prisma = {
    imobProperty: {
      findMany: async (args: FindManyArgs) => {
        findManyCalls.push(args);
        const { where, take } = args;
        return rows
          .filter((item) => item.tenantId === where.tenantId && item.workspaceId === where.workspaceId
            && (typeof where.status === "string" ? item.status === where.status : item.status !== where.status.not))
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .slice(0, take);
      },
      create: forbidden("imobProperty.create"), update: forbidden("imobProperty.update"), updateMany: forbidden("imobProperty.updateMany"),
      delete: forbidden("imobProperty.delete"), deleteMany: forbidden("imobProperty.deleteMany"), upsert: forbidden("imobProperty.upsert"),
    },
    memoryEvent: { create: forbidden("memoryEvent.create") },
    $executeRaw: forbidden("$executeRaw"),
  };
  return { prisma: prisma as unknown as ImobOperationalResolverParams["prisma"], findManyCalls, writes };
}

const propertyRow = (id: string, ref: string, over: Partial<PropertyRow> = {}): PropertyRow => ({
  id, tenantId: "tenant-A", workspaceId: "workspace-A", status: "archived", goal: "locacao", city: "Cidade Exemplo",
  updatedAt: new Date("2026-11-11T12:00:00.000Z"), owner: null, ...over, metadata: { externalPropertyRef: ref, ...(over.metadata ?? {}) },
});
const consultRows = (): PropertyRow[] => [
  propertyRow("a-301", "Kitnet 301", { metadata: { archivedAt: "2026-11-11T12:00:00.000Z" } }),
  propertyRow("a-302", "Kitnet 302", { metadata: { archivedAt: "2026-11-10T09:00:00.000Z" }, updatedAt: new Date("2026-11-10T09:00:00.000Z"), owner: { name: "Proprietário Sintético" } }),
  propertyRow("ativo", "Apto Ativo", { status: "ready", goal: "venda", owner: { name: "Outro Proprietário" } }),
  propertyRow("b-ws", "Kitnet Outro Workspace", { workspaceId: "workspace-B" }),
  propertyRow("b-tenant", "Kitnet Outro Tenant", { tenantId: "tenant-B" }),
];

type ListResolution = { mode: string; presentation: { text: string; card: { title: string; lines: string[]; ctas: unknown[] } } };

function listFor(message: string, prisma: ImobOperationalResolverParams["prisma"]) {
  const params: ImobOperationalResolverParams = { prisma, tenantId: "tenant-A", workspaceId: "workspace-A", message, threadState: null };
  return resolveImobPropertyList(params, listHelpers, buildGovernedImobOperationalConsultContext(params, listHelpers)) as Promise<ListResolution>;
}

test("ARCHIVED-READ: lista só arquivados do próprio tenant/workspace, sem proprietário inferido, sem CTAs e sem nenhuma escrita", async () => {
  const { prisma, findManyCalls, writes } = fakePropertyPrisma(consultRows());
  const resolved = await listFor("listar imóveis arquivados", prisma);

  assert.equal(resolved.mode, "consult");
  assert.equal(findManyCalls.length, 1);
  assert.deepEqual(findManyCalls[0].where, { tenantId: "tenant-A", workspaceId: "workspace-A", status: "archived" });
  assert.equal(resolved.presentation.card.title, "Imóveis arquivados");
  assert.deepEqual(resolved.presentation.card.lines, [
    "Kitnet 301 | locacao | Cidade Exemplo | arquivado em 11/11/2026 | Proprietário: Sem proprietário vinculado",
    "Kitnet 302 | locacao | Cidade Exemplo | arquivado em 10/11/2026 | Proprietário: Proprietário Sintético",
  ]);
  const everything = JSON.stringify(resolved);
  for (const leaked of ["Apto Ativo", "Outro Workspace", "Outro Tenant", "Outro Proprietário"]) assert.ok(!everything.includes(leaked), leaked);
  assert.deepEqual(resolved.presentation.card.ctas, [], "leitura pura: sem restaurar, editar ou abrir");
  assert.match(resolved.presentation.text, /Encontrei 2 imóvel\(is\) arquivado\(s\) neste workspace\./);
  assert.match(resolved.presentation.text, /Consulta somente leitura/);
  assert.deepEqual(writes, [], "nenhuma escrita e nenhum evento de auditoria");
});

test("ARCHIVED-READ: sem arquivados a resposta é vazia e explícita; a listagem de ativos permanece inalterada", async () => {
  const none = fakePropertyPrisma(consultRows().filter((item) => item.status !== "archived"));
  const empty = await listFor("mostrar os imóveis arquivados", none.prisma);
  assert.equal(empty.presentation.card.lines[0], "Nenhum imóvel arquivado até o momento.");
  assert.match(empty.presentation.text, /Não encontrei imóveis arquivados neste workspace\./);

  const { prisma, findManyCalls, writes } = fakePropertyPrisma(consultRows());
  const active = await listFor("listar imóveis", prisma);
  assert.deepEqual(findManyCalls[0].where, { tenantId: "tenant-A", workspaceId: "workspace-A", status: { not: "archived" } });
  assert.equal(active.presentation.card.title, "Imóveis cadastrados");
  assert.deepEqual(active.presentation.card.lines, ["Apto Ativo | venda | Cidade Exemplo | ready | Proprietário: Outro Proprietário"]);
  assert.equal(active.presentation.card.ctas.length, 1, "CTAs da listagem ativa preservados");
  assert.match(active.presentation.text, /^Encontrei 1 imóvel\(is\) no CRM operacional do IMOB\./);
  assert.deepEqual(writes, []);
});

test("ARCHIVED-READ: a permissão de etapa existente (wrapper do turno) vale para o status 'archived'", async () => {
  const restricted = fakePropertyPrisma(consultRows());
  const denied = await listFor("listar imóveis arquivados", scopeImobPrismaToStage(restricted.prisma, (stage) => stage === "pending_data"));
  assert.deepEqual(denied.presentation.card.lines, ["Nenhum imóvel arquivado até o momento."], "etapa archived não operada: nada devolvido, sem oráculo");
  assert.ok(!JSON.stringify(denied).includes("Kitnet 301"));

  const allowed = fakePropertyPrisma(consultRows());
  const granted = await listFor("listar imóveis arquivados", scopeImobPrismaToStage(allowed.prisma, (stage) => stage === "pending_data" || stage === "archived"));
  assert.equal(granted.presentation.card.lines.length, 2);
  assert.deepEqual([...restricted.writes, ...allowed.writes], []);
});

/** Turno do engine com a cadeia governada REAL (como o `resolve-turn` a monta: gate de etapa aplicado ao Prisma). */
function archivedReadTurn(message: string, operational: Record<string, unknown> | null, canOperateStage?: ImobStageGate) {
  const fake = fakePropertyPrisma(consultRows());
  const upserts: string[] = [];
  const helpers: ImobCrmTurnEngineHelpers = {
    asString: (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    hydrateThreadStateWithPersistedLead: async ({ threadState }) => threadState,
    resolveImobOperationalUpdate: async () => null,
    resolveImobOperationalConsult: (consultParams) => resolveImobOperationalConsultImpl(withStageScopedPrisma({ ...consultParams, canOperateStage }), listHelpers),
    applyCanonicalJourneyToResolvedData: (data) => data,
    applyExistingRegistrationResolution: async () => { throw new Error("uma consulta não pode retomar o cadastro em andamento"); },
    injectResolvedPendingSuggestion: (resolved) => resolved,
    upsertImobCaseFromResolvedTurn: async () => { upserts.push("upsert"); return null; },
    normalizeImobRouteText: stripAccents,
    formatImobCaseFlowLabel: (flow) => flow,
  };
  const params: ImobCrmTurnEngineParams = {
    prisma: fake.prisma,
    authContext: { tenantId: "tenant-A", workspaceId: "workspace-A", userId: "user-1" },
    body: { message, threadState: { mode: "execute", pendingSlot: "none", resultOffset: 0, slots: {}, operational } },
    workspaceResponsibleLabel: "Corretor",
    entitlements: { REAL_ESTATE_CORE: true },
    helpers,
  };
  return { run: () => resolveImobCrmTurnEngine(params), fake, upserts };
}

// Estados derivados do threadState que NÃO aceitam read_only_query (owner.update não é derivável do threadState;
// o mais próximo é a revisão de duplicidade de proprietário, owner.dedupe_review).
const creationStates: Array<[string, Record<string, unknown>]> = [
  ["property.create", { flow: "property.create", status: "ready_for_review", pendingFields: [], propertyDraft: { propertyType: "kitnet", city: "Cidade Exemplo", address: "Rua Sintética, 100" } }],
  ["owner.create", { flow: "owner.create", status: "collecting", pendingFields: ["ownerDocument"], ownerDraft: { ownerName: "Pessoa Sintética" } }],
  ["owner.dedupe_review", { flow: "owner.create", status: "awaiting_dedupe_decision", pendingFields: [], ownerDraft: { ownerName: "Pessoa Sintética" } }],
  ["lead.qualify", { flow: "lead.qualify", status: "ready_for_review", pendingFields: [], leadDraft: { leadName: "Lead Sintético" } }],
];

test("ARCHIVED-READ turno do engine: a consulta atravessa os estados de cadastro (que não aceitam read_only_query) e não escreve nada", async () => {
  for (const [state, operational] of creationStates) {
    const turn = archivedReadTurn("listar imóveis arquivados", operational);
    const resolved = await turn.run() as { action: string; presentation: { card: { title: string; lines: string[] } } };
    assert.equal(resolved.action, "crm.property.list", state);
    assert.equal(resolved.presentation.card.title, "Imóveis arquivados", state);
    assert.deepEqual(resolved.presentation.card.lines.map((line) => line.split(" | ")[0]), ["Kitnet 301", "Kitnet 302"], state);
    assert.ok(!JSON.stringify(resolved).includes("acao nao e valida"), `${state}: sem bloqueio de workflow`);
    assert.ok(!/processado com sucesso|success_(created|updated)/.test(JSON.stringify(resolved)), `${state}: a lista não é apresentada como cadastro concluído`);
    assert.deepEqual(turn.upserts, [], `${state}: nenhum caso criado ou atualizado`);
    assert.deepEqual(turn.fake.writes, [], `${state}: nenhuma escrita no banco`);
  }
});

test("ARCHIVED-READ turno do engine: o workflow não muda — leitura comum continua bloqueada nos estados de cadastro", async () => {
  for (const [state, operational] of creationStates) {
    const turn = archivedReadTurn("listar imóveis", operational);
    const resolved = await turn.run() as { action: string };
    assert.equal(resolved.action, "crm.workflow.blocked", state);
    assert.match(JSON.stringify(resolved), /transition_not_allowed/, state);
    assert.deepEqual(turn.fake.findManyCalls, [], `${state}: bloqueado antes de qualquer leitura`);
  }
});

test("ARCHIVED-READ turno do engine: sem permissão da etapa 'archived' nada é devolvido, mesmo em estado de cadastro", async () => {
  const turn = archivedReadTurn("quais imóveis foram arquivados?", creationStates[0][1], (stage) => stage === "pending_data");
  const resolved = await turn.run() as { action: string; presentation: { card: { lines: string[] } } };
  assert.equal(resolved.action, "crm.property.list");
  assert.deepEqual(resolved.presentation.card.lines, ["Nenhum imóvel arquivado até o momento."]);
  assert.ok(!JSON.stringify(resolved).includes("Kitnet 30"));
  assert.deepEqual(turn.fake.writes, []);
});
