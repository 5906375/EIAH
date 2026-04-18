import test from "node:test";
import assert from "node:assert/strict";

import { resolveImobCrmOperationalConsult } from "../services/imob/crm/imobCrmResolver";
import { buildImobCrmCaseContextFromRecord } from "../services/imob/crm/imobCrmCaseContext";
import { buildImobControlSurface } from "../services/imob/control/imobControlSurface";
import {
  buildImobApprovalContext,
  buildImobBottleneckHeatmap,
  buildImobPriorityQueue,
} from "../services/imob/control/imobControlSurfaceAggregates";
import { resolveImobBackingSpecialists } from "../services/imob/imobSpecialistBridge";

function createThreadState() {
  return {
    mode: "consult",
    pendingSlot: "none",
    resultOffset: 0,
    slots: {},
    operational: null,
  };
}

type MockCaseRecord = {
  id: string;
  tenantId: string;
  workspaceId: string;
  threadId: string;
  flow: string;
  stage: string;
  status: string;
  ownerResponsible: string;
  nextStep: string;
  blockers: string[];
  pendingItems: string[];
  updatedAt: Date;
  lead: Record<string, unknown>;
  owner: Record<string, unknown>;
  property: Record<string, unknown>;
  canonical: {
    journeyType: string;
    recommendedActions: Array<{ id: string; label: string; actionType: "consultive" | "operational" | "governed"; inputHint?: string }>;
    blockedActions: string[];
    missingContext: string[];
    reasonCodes: string[];
  };
};

function buildCanonicalCase(item: MockCaseRecord) {
  return item.canonical;
}

function createMockPrisma(cases: MockCaseRecord[]) {
  return {
    imobCase: {
      findFirst: async ({ where }: any) => cases.find((item) => (
        item.tenantId === where.tenantId &&
        item.workspaceId === where.workspaceId &&
        (!where.id || item.id === where.id)
      )) ?? null,
    },
  };
}

const tenantId = "tenant-imob-regression";
const workspaceId = "workspace-imob-regression";

function buildProposalCase(): MockCaseRecord {
  return {
    id: "case-proposal-1",
    tenantId,
    workspaceId,
    threadId: "thread-proposal-1",
    flow: "proposal.create",
    stage: "proposal_review",
    status: "running",
    ownerResponsible: "Corretor",
    nextStep: "retomar proposta com contraproposta objetiva",
    blockers: ["lead ainda não confirmou condição de pagamento"],
    pendingItems: ["confirmação final do lead"],
    updatedAt: new Date("2026-01-05T10:00:00Z"),
    lead: {
      id: "lead-proposal-1",
      name: "Ana",
      phone: "47999990000",
      email: "ana@example.com",
      goal: "venda",
      targetCity: "Itapema",
      budgetMaxCents: 95000000,
    },
    owner: {
      id: "owner-proposal-1",
      name: "Carlos",
      phone: "47999991111",
      email: "carlos@example.com",
      document: "12345678901",
    },
    property: {
      id: "property-proposal-1",
      propertyType: "apartamento",
      city: "Itapema",
      neighborhood: "Meia Praia",
      address: "Rua 300, 45",
      goal: "venda",
      askingPriceCents: 98000000,
      owner: { id: "owner-proposal-1", name: "Carlos" },
    },
    canonical: {
      journeyType: "proposal",
      recommendedActions: [
        {
          id: "review_proposal",
          label: "Retomar proposta",
          actionType: "consultive",
          inputHint: "qual próximo passo desse caso?",
        },
      ],
      blockedActions: [],
      missingContext: [],
      reasonCodes: ["COMMERCIAL_PRIORITY"],
    },
  };
}

function buildDocumentationCase(): MockCaseRecord {
  return {
    id: "case-docs-1",
    tenantId,
    workspaceId,
    threadId: "thread-docs-1",
    flow: "documents.collect",
    stage: "documentacao",
    status: "running",
    ownerResponsible: "Jurídico",
    nextStep: "validar matrícula e corrigir documentação do imóvel",
    blockers: ["matrícula inconsistente e pendência documental do imóvel"],
    pendingItems: ["matricula do imóvel"],
    updatedAt: new Date("2026-01-04T10:00:00Z"),
    lead: {
      id: "lead-docs-1",
      name: "Bruna",
      phone: "47999992222",
      email: "bruna@example.com",
      goal: "venda",
      targetCity: "Balneário Camboriú",
      budgetMaxCents: 120000000,
    },
    owner: {
      id: "owner-docs-1",
      name: "Marcos",
      phone: "47999993333",
      email: "marcos@example.com",
      document: "99999999999",
    },
    property: {
      id: "property-docs-1",
      propertyType: "casa",
      city: "Balneário Camboriú",
      neighborhood: "Centro",
      address: "Rua 1000, 123",
      goal: "venda",
      askingPriceCents: 150000000,
      owner: { id: "owner-docs-1", name: "Marcos" },
    },
    canonical: {
      journeyType: "documentation",
      recommendedActions: [
        {
          id: "resolve_documents",
          label: "Resolver pendências documentais",
          actionType: "consultive",
          inputHint: "mostrar bloqueios do caso",
        },
      ],
      blockedActions: [],
      missingContext: [],
      reasonCodes: ["DOCUMENT_BLOCKER"],
    },
  };
}

function buildSensitiveClosingCase(): MockCaseRecord {
  return {
    id: "case-closing-1",
    tenantId,
    workspaceId,
    threadId: "thread-closing-1",
    flow: "contract.prepare",
    stage: "fechamento",
    status: "running",
    ownerResponsible: "Diretoria",
    nextStep: "validar evidência antes de assinatura final",
    blockers: ["receipt e verify pendentes para o fechamento auditável"],
    pendingItems: ["bundle"],
    updatedAt: new Date("2026-01-03T10:00:00Z"),
    lead: {
      id: "lead-closing-1",
      name: "Luiza",
      phone: "47999994444",
      email: "luiza@example.com",
      goal: "venda",
      targetCity: "Itajaí",
      budgetMaxCents: 130000000,
    },
    owner: {
      id: "owner-closing-1",
      name: "Paulo",
      phone: "47999995555",
      email: "paulo@example.com",
      document: "88888888888",
    },
    property: {
      id: "property-closing-1",
      propertyType: "apartamento",
      city: "Itajaí",
      neighborhood: "Fazenda",
      address: "Avenida 7, 80",
      goal: "venda",
      askingPriceCents: 145000000,
      owner: { id: "owner-closing-1", name: "Paulo" },
    },
    canonical: {
      journeyType: "contract",
      recommendedActions: [
        {
          id: "check_audit_evidence",
          label: "Validar evidência do fechamento",
          actionType: "governed",
          inputHint: "mostrar bloqueios do caso",
        },
      ],
      blockedActions: [],
      missingContext: [],
      reasonCodes: ["AUDIT_BLOCKER"],
    },
  };
}

async function resolveCaseRead(item: MockCaseRecord, message: string) {
  return resolveImobCrmOperationalConsult({
    prisma: createMockPrisma([item]) as any,
    tenantId,
    workspaceId,
    caseId: item.id,
    message,
    threadState: createThreadState(),
  });
}

function buildSurfaceFromCase(item: MockCaseRecord) {
  const caseContext = buildImobCrmCaseContextFromRecord(item as any, buildCanonicalCase as any);
  const specialists = resolveImobBackingSpecialists(caseContext as any);
  return {
    caseContext,
    specialists,
    surface: buildImobControlSurface({ caseContext: caseContext as any, specialists }),
  };
}

test("IMOB cross-surface keeps proposal case consistent between consultive read, specialist support and queue", async () => {
  const proposalCase = buildProposalCase();
  const resolved = await resolveCaseRead(proposalCase, "qual status desse caso?");

  assert.equal(resolved?.action, "crm.case.pipeline_status");
  assert.equal(resolved?.presentation?.consultiveRead?.phase, "Proposta");
  assert.equal(resolved?.presentation?.consultiveRead?.specialists?.[0]?.agentId, "I_BC");

  const { surface } = buildSurfaceFromCase(proposalCase);
  assert.equal(surface.humanJourneyPhase, "proposta");
  assert.equal(surface.specialists[0]?.reasonCode, "COMMERCIAL_PRIORITY");

  const queue = buildImobPriorityQueue([surface]);
  assert.equal(queue[0]?.caseId, proposalCase.id);
  assert.match(queue[0]?.autoprompt ?? "", /abordagem sugerida/i);
});

test("IMOB cross-surface keeps documentation blocker aligned between consultive read, specialist support and heatmap", async () => {
  const docsCase = buildDocumentationCase();
  const resolved = await resolveCaseRead(docsCase, "mostrar bloqueios do caso");

  assert.equal(resolved?.action, "crm.case.blocked_run_resolution");
  assert.match(resolved?.presentation?.text ?? "", /jurídico|legal/i);
  assert.equal(resolved?.presentation?.consultiveRead?.specialists?.[0]?.agentId, "J_360");

  const { surface } = buildSurfaceFromCase(docsCase);
  assert.equal(surface.waitingOn, "legal");
  assert.equal(surface.specialists[0]?.reasonCode, "DOCUMENT_BLOCKER");

  const heatmap = buildImobBottleneckHeatmap([surface]);
  assert.equal(heatmap[0]?.phase, "documentacao");
  assert.equal(heatmap[0]?.reasonCode, "DOCUMENT_BLOCKER");
  assert.equal(heatmap[0]?.waitingOn, "legal");
});

test("IMOB cross-surface keeps sensitive closing aligned between consultive read, specialist ownership boundary and approval context", async () => {
  const closingCase = buildSensitiveClosingCase();
  const resolved = await resolveCaseRead(closingCase, "mostrar bloqueios do caso");

  assert.equal(resolved?.action, "crm.case.blocked_run_resolution");
  const consultiveGuardian = resolved?.presentation?.consultiveRead?.specialists?.find((item) => item.agentId === "guardian");
  assert.ok(consultiveGuardian);
  assert.match(
    consultiveGuardian?.ownershipBoundary ?? "",
    /não assume ownership do caso/i,
  );

  const { surface } = buildSurfaceFromCase(closingCase);
  const auditSpecialist = surface.specialists.find((item) => item.reasonCode === "AUDIT_BLOCKER");
  assert.ok(auditSpecialist);

  const approvalContext = buildImobApprovalContext({
    items: [surface],
    evidenceCountByCaseId: new Map([[closingCase.id, 0]]),
  });
  assert.equal(approvalContext.length, 1);
  assert.equal(approvalContext[0]?.reasonCode, "AUDIT_BLOCKER");
  assert.equal(approvalContext[0]?.requiresEvidence, true);
});
