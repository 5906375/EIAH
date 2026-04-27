import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobTurn } from "../services/imob/imobTurnResolver";
import { resolveImobCrmOperationalConsult } from "../services/imob/crm/imobCrmResolver";

function createAccess() {
  return {
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    entitlements: { REAL_ESTATE_CORE: true },
  };
}

function createThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: null,
  };
}

function createMockPrisma() {
  const lead = {
    id: "lead-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    name: "Merlo",
    phone: "47 999674434",
    email: "mmerlon.adv@gmail.com",
    goal: "locacao",
    targetCity: "Balneário Camboriú",
    budgetMaxCents: 200000,
    stage: "pending_data",
    pendingItems: ["cidade de interesse"],
    updatedAt: new Date("2026-01-01"),
  };
  const owner = {
    id: "owner-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    name: "João",
    phone: "47 111111111",
    email: "joao@example.com",
    document: null,
    status: "pending_data",
    pendingItems: ["ownerDocument"],
    updatedAt: new Date("2026-01-01"),
  };
  const property = {
    id: "property-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    ownerId: "owner-1",
    propertyType: "apartamento",
    goal: "locacao",
    address: "Rua 1000, 123",
    city: "Balneário Camboriú",
    neighborhood: "Centro",
    askingPriceCents: null,
    status: "pending_data",
    pendingItems: ["preço do imóvel"],
    owner: { name: "João" },
    _count: { cases: 1 },
    updatedAt: new Date("2026-01-01"),
  };
  const latestCase = {
    id: "case-1",
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    threadId: "thread-1",
    flow: "lead.qualify",
    stage: "ready_for_review",
    status: "ready_for_review",
    ownerResponsible: "Corretor",
    nextStep: "qualificar lead deste caso",
    blockers: ["dados do proprietário ainda estão incompletos"],
    pendingItems: ["ownerDocument"],
    ownerId: "owner-1",
    propertyId: "property-1",
    leadId: "lead-1",
    updatedAt: new Date("2026-01-05"),
    lead,
    owner,
    property,
    _count: { events: 2 },
  };

  return {
    imobCase: {
      findFirst: async ({ where }: any) =>
        where.tenantId === "tenant-A" && where.workspaceId === "workspace-A" ? latestCase : null,
    },
  };
}

test("IMOB copiloto responde guidance documental sem exigir caso", () => {
  const result = resolveImobTurn({
    message: "quais documentos normalmente faltam nessa fase?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /Posso responder isso sem abrir cadastro agora/i);
  assert.match(result.presentation.text, /waitingOn/i);
  assert.match(result.presentation.text, /Próximo passo seguro/i);
});

test("IMOB copiloto prepara checklist documental sem abrir execução nova", () => {
  const result = resolveImobTurn({
    message: "como preparar a documentação desse caso?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /trabalho documental|pacote mínimo|cobrança documental/i);
  assert.ok(!result.presentation.form);
});

test("IMOB copiloto responde guidance de captação sem abrir cadastro por padrão", () => {
  const result = resolveImobTurn({
    message: "como conduzir a captação desse imóvel?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /captação/i);
  assert.match(result.presentation.text, /Próximo passo seguro/i);
  assert.ok(!result.presentation.form);
});

test("IMOB copiloto responde guidance de qualificação sem abrir formulário por padrão", () => {
  const result = resolveImobTurn({
    message: "como qualificar esse lead melhor?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /qualificação|qualificacao/i);
  assert.match(result.presentation.text, /waitingOn/i);
});

test("IMOB copiloto responde quando envolver jurídico sem cair em formulário", () => {
  const result = resolveImobTurn({
    message: "quando envolver jurídico?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /jurídico|juridico/i);
  assert.ok(!result.presentation.form);
});

test("IMOB copiloto explica handoff de specialist sem transferir ownership do caso", () => {
  const result = resolveImobTurn({
    message: "qual specialist entra nesse caso, jurídico ou financeiro?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /IMOB_CRM continua dono do caso/i);
  assert.match(result.presentation.text, /J_360|fin-nexus|guardian/i);
  assert.ok(!result.presentation.form);
});

test("IMOB copiloto responde retomada pós-visita como leitura operacional", () => {
  const result = resolveImobTurn({
    message: "fiz a visita e o cliente sumiu, como retomar?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /follow-up risk|follow up risk/i);
  assert.match(result.presentation.text, /waitingOn=lead|waitingOn/i);
});

test("IMOB copiloto prepara follow-up sem abrir execução nova", () => {
  const result = resolveImobTurn({
    message: "prepara mensagem de follow-up para esse caso",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /follow-up útil|mensagem de follow-up|ação única/i);
  assert.equal(result.presentation.preparedFollowUp?.recipientRole, "lead");
  assert.equal(result.presentation.preparedFollowUp?.variants?.length, 2);
  assert.match(result.presentation.preparedFollowUp?.variants?.[0]?.text ?? "", /retomando este atendimento|próximo passo/i);
  assert.ok(!result.presentation.form);
});

test("IMOB copiloto responde retomada de negociação sem abrir proposta por default", () => {
  const result = resolveImobTurn({
    message: "como retomar negociação parada?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /fase, blocker, waitingOn e owner/i);
  assert.ok(!result.presentation.form);
});

test("IMOB copiloto responde leitura antes de proposta sem exigir caseId", () => {
  const result = resolveImobTurn({
    message: "antes de montar proposta, o que preciso validar?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /Antes de montar proposta/i);
  assert.match(result.presentation.text, /waitingOn/i);
});

test("IMOB copiloto prepara resumo estruturado do caso sem abrir formulário", () => {
  const result = resolveImobTurn({
    message: "quero retomar um caso antigo rapidamente com resumo do caso",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /fase, blocker, waitingOn, owner da ação/i);
  assert.ok(!result.presentation.form);
});

test("IMOB copiloto prepara approval sem executar decisão sensível", () => {
  const result = resolveImobTurn({
    message: "o que preciso para approval nesse fechamento?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /approval forte|reasonCode|evidência mínima|policy/i);
  assert.ok(!result.presentation.form);
});

test("IMOB mantém formulário quando o comando operacional é explícito", () => {
  const result = resolveImobTurn({
    message: "gerar proposta para este caso",
    access: createAccess(),
  });

  assert.equal(result.mode, "execute");
  assert.equal(result.executionRequest?.operation, "proposal.create");
  assert.equal(result.action, "realestate.create_contract");
  assert.ok(result.presentation.form);
});

test("IMOB copiloto responde leitura de lead captado sem cair em intake", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    message: "qual status desse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.pipeline_status");
  assert.match(resolved?.presentation?.text ?? "", /Lead Merlo/i);
  assert.match(resolved?.presentation?.text ?? "", /Fase:/i);
  assert.match(resolved?.presentation?.text ?? "", /Owner da ação:/i);
  assert.match(resolved?.presentation?.caseBrief?.summary ?? "", /principal risco agora/i);
  assert.match(resolved?.presentation?.caseBrief?.phaseObjective ?? "", /qualificar|confirmar/i);
  assert.equal(resolved?.presentation?.preparedFollowUp?.variants?.length, 2);
});

test("IMOB copiloto responde blocker real com leitura operacional", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    message: "mostrar bloqueios do caso",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.blocked_run_resolution");
  assert.match(resolved?.presentation?.text ?? "", /Bloqueio principal:/i);
  assert.match(resolved?.presentation?.text ?? "", /Waiting on:/i);
  assert.match(resolved?.presentation?.text ?? "", /Para destravar:/i);
});

test("IMOB copiloto responde prioridade da fila como próximo movimento do caso", async () => {
  const resolved = await resolveImobCrmOperationalConsult({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-A",
    workspaceId: "workspace-A",
    message: "o que faço agora nesse caso?",
    threadState: createThreadState(),
  });

  assert.equal(resolved?.action, "crm.case.next_best_action");
  assert.match(resolved?.presentation?.text ?? "", /Melhor ação agora:/i);
  assert.match(resolved?.presentation?.text ?? "", /Owner da ação:/i);
});

test("IMOB copiloto responde quando envolver financeiro sem exigir caso", () => {
  const result = resolveImobTurn({
    message: "quando envolver financeiro?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /financeiro/i);
  assert.match(result.presentation.text, /waitingOn/i);
});

test("IMOB copiloto responde fechamento sensível como guidance antes de execução", () => {
  const result = resolveImobTurn({
    message: "caso sensível perto do fechamento, preciso de approval ou evidence?",
    access: createAccess(),
  });

  assert.equal(result.mode, "consult");
  assert.equal(result.action, "crm.operational_guidance");
  assert.match(result.presentation.text, /approval|evidence|fechamento sensível/i);
  assert.match(result.presentation.text, /legal|finance/i);
});
