import test from "node:test";
import assert from "node:assert/strict";
import { ImobCrmDocumentService } from "../services/imob/crm/imobCrmDocumentService";

function createMockPrisma() {
  const docs = [
    { id: "doc-1", tenantId: "tenant-1", agentSlug: "imob", fileName: "rg.pdf" },
  ];
  const cases = [
    {
      id: "case-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      threadId: "thread-1",
      flow: "lead.qualify",
      stage: "ready_for_review",
      status: "ready_for_review",
      ownerId: null,
      owner: null,
      pendingItems: [],
      blockers: [],
      updatedAt: new Date("2026-01-01"),
    },
  ];

  return {
    uploadedDocument: {
      findMany: async ({ where }: any) => docs.filter((doc) => (
        where.id.in.includes(doc.id) &&
        doc.tenantId === where.tenantId &&
        doc.agentSlug === where.agentSlug
      )),
    },
    imobCase: {
      findFirst: async ({ where }: any) => cases.find((item) => (
        item.tenantId === where.tenantId &&
        item.workspaceId === where.workspaceId &&
        (!where.id || item.id === where.id) &&
        (!where.threadId || item.threadId === where.threadId)
      )) ?? null,
    },
  };
}

test("IMOB_CRM document service returns upload_not_found when any document is missing", async () => {
  const service = new ImobCrmDocumentService(createMockPrisma() as any);

  const result = await service.resolveAttachment({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
  }, {
    caseId: "case-1",
    documentIds: ["missing-doc"],
    workspaceResponsibleLabel: "Corretor",
    canOperateStage: () => true,
  });

  assert.equal(result.status, "upload_not_found");
});

test("IMOB_CRM document service keeps unresolved attachment contextual when case has no owner", async () => {
  const service = new ImobCrmDocumentService(createMockPrisma() as any);

  const result = await service.resolveAttachment({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
  }, {
    caseId: "case-1",
    documentIds: ["doc-1"],
    workspaceResponsibleLabel: "Corretor",
    canOperateStage: () => true,
  });

  assert.equal(result.status, "ok");
  assert.equal(result.status === "ok" ? result.data.resolved : null, false);
  assert.match(result.status === "ok" ? result.data.presentation.text : "", /continue o cadastro do proprietário/i);
});

test("IMOB_CRM document service returns stage_forbidden before mutating documents", async () => {
  const service = new ImobCrmDocumentService(createMockPrisma() as any);

  const result = await service.resolveAttachment({
    tenantId: "tenant-1",
    workspaceId: "workspace-1",
  }, {
    caseId: "case-1",
    documentIds: ["doc-1"],
    workspaceResponsibleLabel: "Corretor",
    canOperateStage: () => false,
  });

  assert.equal(result.status, "stage_forbidden");
});
