import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachImobManagementCardToSnapshot, IMOB_MANAGEMENT_ENTRY_PROMPT, isImobManagementRequest } from "./imobManagementConversationEngine";
import { resolveLauncherNavigationDecision, resolveLauncherTurnDecision } from "./chatLauncherEngine";
import { IMOB_ACTION_MENUS, listImobActionMenuPrompts } from "@/features/imob/imobActionMenus";
import { buildApprovalDelegateTarget, buildApprovalEscalationTarget, buildImobApprovalActionInput } from "@/features/imob/imobApprovalActions";

// FD-SINGLE-ENTRY-001: a gestão do IMOB abre NA conversa (cartão do launcher), por vocabulário controlado; nunca por página própria.
test("pedidos claros de ver a gestão do IMOB abrem o cartão", () => {
  for (const input of ["ver painel de gestão do IMOB", "Quero ver o painel de gestão.", "Abrir a central operacional do IMOB", "Mostrar as aprovações pendentes", "Quero acompanhar o funil de vendas", "ver fila de prioridades", IMOB_MANAGEMENT_ENTRY_PROMPT]) {
    assert.equal(isImobManagementRequest(input), true, input);
  }
});
test("perguntas, operações de cadastro, Logística e frases soltas NÃO abrem o cartão", () => {
  for (const input of ["Como funciona o painel de gestão?", "Quero cadastrar um imóvel", "gestão", "painel", "Quero ver o painel do Pré-DUIMP", "Quero ver o painel de gestão de contêineres", "", "ver painel de gestão e apagar tudo"]) {
    assert.equal(isImobManagementRequest(input), false, input);
  }
});
test("no engine do launcher: o pedido vira decisão com o cartão (sem run, sem handoff); cadastro continua sendo handoff do IMOB", async () => {
  const base = { proposalMode: false, isUnifiedEiah: true, eiahMode: "help" as const, agentProfile: null, catalogAgents: [], intentUnknown: false, confidence: 0.9, routeIntent: "help" as const };
  const turn = (input: string) => resolveLauncherTurnDecision({ ...base, input, trimmedInput: input });
  const decision = await turn("ver painel de gestão do IMOB");
  assert.equal(decision?.kind, "imob_management_entry");
  assert.equal(decision?.imobManagementCard, true);
  assert.equal(decision?.shouldCreateRun, false);
  assert.equal(decision?.verticalHandoffRequest, undefined);
  assert.equal((await turn("Quero cadastrar um imóvel."))?.kind, "vertical_handoff");
  const outsideUnified = await resolveLauncherTurnDecision({ ...base, isUnifiedEiah: false, input: "ver painel de gestão do IMOB", trimmedInput: "ver painel de gestão do IMOB" });
  assert.notEqual(outsideUnified?.kind, "imob_management_entry");
});
test("entrada pelo menu (?domain=imob) abre o handoff do IMOB no mesmo launcher; intenção na conversa chega à mesma especialidade", async () => {
  const menu = await resolveLauncherNavigationDecision({ domainHint: "imob", isUnifiedEiah: true });
  assert.equal(menu?.kind, "vertical_handoff");
  assert.equal(menu?.verticalHandoffRequest?.verticalId, "imob");
  const base = { proposalMode: false, isUnifiedEiah: true, eiahMode: "help" as const, agentProfile: null, catalogAgents: [], intentUnknown: false, confidence: 0.9, routeIntent: "help" as const };
  const spoken = await resolveLauncherTurnDecision({ ...base, input: "Quero cadastrar um imóvel.", trimmedInput: "Quero cadastrar um imóvel." });
  assert.equal(spoken?.verticalHandoffRequest?.verticalId, menu?.verticalHandoffRequest?.verticalId);
});
test("snapshot: marca só quando a decisão pede o cartão", () => {
  assert.equal(attachImobManagementCardToSnapshot({ a: 1 } as { a: number; imobManagementCard?: boolean | null }, { imobManagementCard: true }).imobManagementCard, true);
  assert.equal("imobManagementCard" in attachImobManagementCardToSnapshot({ a: 1 }, {}), false);
});
test("o item de menu 'Painel de gestão' envia exatamente o pedido que o engine reconhece", () => {
  const item = IMOB_ACTION_MENUS.flatMap((menu) => menu.items).find((entry) => entry.id === "management-panel");
  assert.equal(item?.kind, "front_door");
  assert.ok(item?.kind === "front_door" && isImobManagementRequest(item.prompt));
  // não vai ao resolvedor do IMOB: o launcher trata e abre o cartão na conversa
  assert.ok(!listImobActionMenuPrompts().some((entry) => entry.label === "Painel de gestão"));
});
test("ações de aprovação: mesmos destinos e corpo que o command center enviava (aprovar não leva destino; delegar/escalar sim)", () => {
  const item = { caseId: "c-1", reasonCode: "DOCUMENT_BLOCKER", specialistId: "s-1", waitingOn: "legal" } as never;
  assert.equal(buildApprovalDelegateTarget(item), "juridico");
  assert.equal(buildApprovalEscalationTarget(item), "coordenacao-juridica");
  const approve = buildImobApprovalActionInput(item, "approve", "conversa");
  assert.equal(approve.delegatedTo, undefined); assert.equal(approve.escalationTarget, undefined);
  assert.match(approve.note, /Aprovado via conversa/);
  assert.equal(buildImobApprovalActionInput(item, "delegate", "conversa").delegatedTo, "juridico");
  assert.equal(buildImobApprovalActionInput(item, "escalate", "conversa").escalationTarget, "coordenacao-juridica");
});
test("o cartão não navega para página operacional do IMOB: links dos painéis voltam ao Front Door e a lógica não está no launcher", () => {
  const card = readFileSync(new URL("../../features/imob/ImobManagementConversationCard.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(card, /["`']\/app\/imob/);
  assert.match(card, /\/app\/chat\?domain=imob/);
  const launcher = readFileSync(new URL("./ChatAgentLauncher.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(launcher, /apiListImobApprovalContext|apiPostImobApprovalAction|apiListImobPriorityQueue/);
});
