import test from "node:test";
import assert from "node:assert/strict";
import { resolveImobCrmRegistrationDedupe } from "../services/imob/crm/imobCrmDedupe";

function createMockPrisma() {
  const leads = [
    {
      id: "lead-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      name: "Merlo",
      phone: "47999674434",
      email: "mmerlon.adv@gmail.com",
      goal: "locacao",
      targetCity: "Balneário Camboriú",
      budgetMaxCents: 200000,
      updatedAt: new Date("2026-01-01"),
    },
    {
      id: "lead-2",
      tenantId: "tenant-1",
      workspaceId: "workspace-2",
      name: "Merlo",
      phone: "47000000000",
      email: "outro@example.com",
      goal: "venda",
      targetCity: "Itajaí",
      budgetMaxCents: 50000000,
      updatedAt: new Date("2026-01-02"),
    },
    {
      id: "lead-3",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      name: "Duplicado",
      phone: "47111111111",
      email: "dup1@example.com",
      goal: "locacao",
      targetCity: "Itapema",
      budgetMaxCents: null,
      updatedAt: new Date("2026-01-03"),
    },
    {
      id: "lead-4",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      name: "Duplicado",
      phone: "47222222222",
      email: "dup2@example.com",
      goal: "locacao",
      targetCity: "Itapema",
      budgetMaxCents: null,
      updatedAt: new Date("2026-01-04"),
    },
  ];

  const owners = [
    {
      id: "owner-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      name: "Proprietario",
      phone: "47999990000",
      email: "prop@example.com",
      document: "41741741785",
      updatedAt: new Date("2026-01-05"),
    },
  ];

  return {
    imobLead: {
      findFirst: async ({ where }: any) => leads.find((lead) => (
        lead.tenantId === where.tenantId &&
        lead.workspaceId === where.workspaceId &&
        ((where.id && where.id === lead.id) || (!where.OR || where.OR.some((condition: any) => (
          (condition.phone && condition.phone === lead.phone) ||
          (condition.email && condition.email === lead.email)
        ))))
      )) ?? null,
      findMany: async ({ where, take }: any) => leads.filter((lead) => (
        lead.tenantId === where.tenantId &&
        lead.workspaceId === where.workspaceId &&
        lead.name === where.name
      )).slice(0, take),
    },
    imobOwner: {
      findFirst: async ({ where }: any) => owners.find((owner) => (
        owner.tenantId === where.tenantId &&
        owner.workspaceId === where.workspaceId &&
        (!where.OR || where.OR.some((condition: any) => (
          (condition.phone && condition.phone === owner.phone) ||
          (condition.email && condition.email === owner.email) ||
          (condition.document && condition.document === owner.document)
        )))
      )) ?? null,
      findMany: async ({ where, take }: any) => owners.filter((owner) => (
        owner.tenantId === where.tenantId &&
        owner.workspaceId === where.workspaceId &&
        owner.name === where.name
      )).slice(0, take),
    },
    imobProperty: {
      findFirst: async () => null,
    },
  };
}

test("IMOB_CRM dedupe hydrates existing lead by strong identifier inside workspace", async () => {
  const decision = await resolveImobCrmRegistrationDedupe({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    flow: "lead.qualify",
    draft: { leadEmail: "mmerlon.adv@gmail.com" },
  });

  assert.equal(decision.kind, "hydrate");
  assert.equal(decision.kind === "hydrate" ? decision.entity.id : null, "lead-1");
  assert.equal(decision.kind === "hydrate" ? decision.draft.leadName : null, "Merlo");
  assert.equal(decision.kind === "hydrate" ? decision.draft.budgetMax : null, 2000);
});

test("IMOB_CRM dedupe keeps workspace isolation for identical lead names", async () => {
  const decision = await resolveImobCrmRegistrationDedupe({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-2",
    flow: "lead.qualify",
    draft: { leadName: "Merlo" },
  });

  assert.equal(decision.kind, "choice");
  assert.equal(decision.kind === "choice" ? decision.matches.length : 0, 1);
  assert.equal(decision.kind === "choice" ? decision.matches[0]?.id : null, "lead-2");
});

test("IMOB_CRM dedupe prioritizes case.leadId over heuristic matching", async () => {
  const decision = await resolveImobCrmRegistrationDedupe({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    flow: "lead.qualify",
    caseEntityId: "lead-1",
    draft: { leadName: "Outro nome", leadPhone: "47000000000", leadEmail: "outro@example.com" },
  });

  assert.equal(decision.kind, "hydrate");
  assert.equal(decision.kind === "hydrate" ? decision.entity.id : null, "lead-1");
  assert.equal(decision.kind === "hydrate" ? decision.draft.leadName : null, "Outro nome");
  assert.equal(decision.kind === "hydrate" ? decision.draft.leadEmail : null, "outro@example.com");
});

test("IMOB_CRM dedupe asks for a choice on unique name-only match", async () => {
  const decision = await resolveImobCrmRegistrationDedupe({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    flow: "lead.qualify",
    draft: { leadName: "Merlo" },
  });

  assert.equal(decision.kind, "choice");
  assert.match(decision.kind === "choice" ? decision.text : "", /Quer atualizar esse cadastro existente/);
});

test("IMOB_CRM dedupe asks for selection when multiple name matches exist", async () => {
  const decision = await resolveImobCrmRegistrationDedupe({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    flow: "lead.qualify",
    draft: { leadName: "Duplicado" },
  });

  assert.equal(decision.kind, "choice");
  assert.equal(decision.kind === "choice" ? decision.matches.length : 0, 2);
  assert.match(decision.kind === "choice" ? decision.title : "", /2 leads/);
});

test("IMOB_CRM dedupe allows empty new-conversation forms without identifiers", async () => {
  const decision = await resolveImobCrmRegistrationDedupe({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    flow: "lead.qualify",
    draft: {},
  });

  assert.deepEqual(decision, { kind: "none" });
});

test("IMOB_CRM dedupe owner choice routes update CTA to direct edit by owner id", async () => {
  const decision = await resolveImobCrmRegistrationDedupe({
    prisma: createMockPrisma() as any,
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
    flow: "owner.create",
    draft: { ownerName: "Proprietario" },
  });

  assert.equal(decision.kind, "choice");
  assert.equal(decision.kind === "choice" ? decision.nextMessages[0] : null, "editar proprietário owner-1");
});
