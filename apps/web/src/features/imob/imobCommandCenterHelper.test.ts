import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";

import type { ImobCase } from "@/lib/api";
import {
  buildImobCasePriority,
  buildImobCaseFallbackActions,
  DEFAULT_COMMAND_CENTER_STATUS_FILTER,
  formatImobCaseStatusLabel,
  formatImobStageLabel,
  normalizeCommandCenterStatusFilter,
} from "./imobCommandCenterHelper";
import { describeChatTurnFailure } from "../../pages/app/imob/chatFailureCopy";

function makeCase(overrides: Partial<ImobCase>): ImobCase {
  return {
    id: "case-test",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    threadId: "thread-1",
    flow: "property.create",
    stage: "collecting",
    status: "pending_data",
    ownerResponsible: null,
    nextStep: null,
    blockers: [],
    pendingItems: [],
    ownerId: null,
    propertyId: null,
    leadId: null,
    externalDealId: null,
    metadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    canonical: null,
    owner: null,
    property: null,
    lead: null,
    _count: { events: 0 },
    ...overrides,
  };
}

test("buildImobCasePriority returns alta when there are blocked actions", () => {
  const result = buildImobCasePriority(
    makeCase({ canonical: { blockedActions: ["missing signature"], missingContext: [], recommendedActions: [] } }),
  );
  assert.equal(result.label, "alta");
  assert.ok(result.score >= 5);
});

test("buildImobCasePriority returns média when there are missing context items", () => {
  const result = buildImobCasePriority(
    makeCase({ canonical: { blockedActions: [], missingContext: ["owner document"], recommendedActions: [{ id: "a1", label: "Ação", actionType: "operational" }] } }),
  );
  assert.equal(result.label, "média");
});

test("buildImobCasePriority returns normal for a clean recent case", () => {
  const result = buildImobCasePriority(
    makeCase({
      updatedAt: new Date().toISOString(),
      canonical: {
        blockedActions: [],
        missingContext: [],
        recommendedActions: [{ id: "a1", label: "Ação", actionType: "operational" }],
      },
    }),
  );
  assert.equal(result.label, "normal");
});

test("buildImobCasePriority returns score 0 for completely empty case updated now", () => {
  const result = buildImobCasePriority(
    makeCase({
      updatedAt: new Date().toISOString(),
      canonical: {
        blockedActions: [],
        missingContext: [],
        recommendedActions: [{ id: "a1", label: "Ação", actionType: "operational" }],
      },
    }),
  );
  assert.equal(result.score, 0);
});

test("buildImobCaseFallbackActions includes owner.register for owner.create flow", () => {
  const actions = buildImobCaseFallbackActions(makeCase({ flow: "owner.create" }));
  assert.ok(actions.some((a) => a.id === "owner.register"));
});

test("buildImobCaseFallbackActions includes property.create for property.create flow", () => {
  const actions = buildImobCaseFallbackActions(makeCase({ flow: "property.create" }));
  assert.ok(actions.some((a) => a.id === "property.create"));
});

test("buildImobCaseFallbackActions always includes case.consult as fallback", () => {
  const actions = buildImobCaseFallbackActions(makeCase({ flow: "commission.settle" }));
  assert.ok(actions.some((a) => a.id === "case.consult"));
});

test("buildImobCaseFallbackActions caps output at 4 actions", () => {
  const actions = buildImobCaseFallbackActions(
    makeCase({
      flow: "owner.create",
      pendingItems: ["imóvel pendente", "document needed", "lead em aberto"],
    }),
  );
  assert.ok(actions.length <= 4);
});

test("buildImobCaseFallbackActions does not produce duplicate ids", () => {
  const actions = buildImobCaseFallbackActions(
    makeCase({ flow: "case.consult", pendingItems: [] }),
  );
  const ids = actions.map((a) => a.id);
  assert.equal(ids.length, new Set(ids).size);
});

// Non-regression: dashboard.tsx must not define buildCasePriority or buildCaseFallbackActions
test("dashboard.tsx does not define buildCasePriority or buildCaseFallbackActions", () => {
  const dashboardPath = path.resolve(
    import.meta.dirname ?? __dirname,
    "../../pages/app/imob/dashboard.tsx",
  );
  const source = fs.readFileSync(dashboardPath, "utf8");
  assert.ok(
    !source.includes("function buildCasePriority("),
    "dashboard.tsx must not define buildCasePriority — move to domain layer",
  );
  assert.ok(
    !source.includes("function buildCaseFallbackActions("),
    "dashboard.tsx must not define buildCaseFallbackActions — move to domain layer",
  );
});

// P10-E: a Central Operacional não esconde casos em andamento por padrão e não mostra identificadores técnicos.
test("Central Operacional: filtro padrão é TODOS; valor desconhecido volta ao padrão; estados do filtro continuam válidos", () => {
  assert.equal(DEFAULT_COMMAND_CENTER_STATUS_FILTER, "all");
  assert.equal(normalizeCommandCenterStatusFilter(undefined), "all");
  assert.equal(normalizeCommandCenterStatusFilter(null), "all");
  assert.equal(normalizeCommandCenterStatusFilter("running"), "all", "estado fora do filtro não vira filtro (e não esconde casos)");
  assert.equal(normalizeCommandCenterStatusFilter("<script>"), "all");
  for (const value of ["pending_data", "ready_for_review", "blocked", "done", "all"]) {
    assert.equal(normalizeCommandCenterStatusFilter(` ${value.toUpperCase()} `), value);
  }
});

test("Central Operacional: estados do caso têm texto de leitura; desconhecido não é inventado", () => {
  assert.equal(formatImobCaseStatusLabel("running"), "em andamento");
  assert.equal(formatImobCaseStatusLabel("pending_data"), "pendente de dados");
  assert.equal(formatImobCaseStatusLabel("ready_for_review"), "pronto para revisão");
  assert.equal(formatImobCaseStatusLabel("estado_novo"), "estado_novo", "sem tradução conhecida, mostra o dado real em vez de inventar");
  assert.equal(formatImobCaseStatusLabel(""), "—");
});

// P10-F: falha de turno descreve a causa provável sem inventar motivo; o detalhe técnico fica em `reason`.
test("falha de turno do chat: cada causa tem explicação própria e nenhuma vira 'restrição de segurança'", () => {
  const withStatus = (status: number) => Object.assign(new Error("HTTP " + status), { status });
  const cases: Array<[unknown, RegExp]> = [
    [withStatus(401), /sessão expirou/],
    [withStatus(403), /não tem permissão/],
    [withStatus(422), /não aceitou os dados/],
    [withStatus(500), /falha temporária/],
    [new Error("Failed to fetch"), /falha temporária/],
    [undefined, /falha temporária/],
  ];
  for (const [error, expected] of cases) {
    for (const kind of ["turn", "directed"] as const) {
      const copy = describeChatTurnFailure(error, kind, "CHAT_TURN_FAILED");
      assert.match(`${copy.text} ${copy.lines.join(" ")}`, expected);
      assert.doesNotMatch(`${copy.text} ${copy.lines.join(" ")}`, /restrição de segurança|reason|CHAT_TURN_FAILED/i);
      assert.ok(copy.reason.length > 0, "o detalhe técnico é preservado para diagnóstico");
    }
  }
  assert.equal(describeChatTurnFailure(undefined, "turn", "CHAT_TURN_FAILED").reason, "CHAT_TURN_FAILED");
  assert.match(describeChatTurnFailure(withStatus(403), "directed", "x").text, /preparar esta ação/);
  assert.match(describeChatTurnFailure(withStatus(403), "turn", "x").text, /continuar essa solicitação/);
});

test("etapa do caso: identificadores conhecidos ganham texto de leitura; desconhecido segue visível; vazio vira traço", () => {
  assert.equal(formatImobStageLabel("listing"), "Anúncio");
  assert.equal(formatImobStageLabel(" Collecting "), "Coleta de dados");
  assert.equal(formatImobStageLabel("etapa_nova_sem_traducao"), "etapa_nova_sem_traducao");
  assert.equal(formatImobStageLabel(undefined), "—");
  assert.equal(formatImobStageLabel(""), "—");
});
