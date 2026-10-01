import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { imobDocumentLinkSchema } from "../routes/imobCrmSchemas";
import { canAccessImobUploads } from "../services/imobUploadAccess";
import {
  CONTRACT_PENDING_ITEM,
  DOCUMENT_LINK_SOURCE,
  ImobDocumentLinkService,
  mergeLinkedDocuments,
  readLinkedDocuments,
} from "../services/imob/crm/imobDocumentLinkService";

const scope = { tenantId: "tenant-a", workspaceId: "workspace-a", userId: "user-a" };

type Row = Record<string, any>;

function matches(row: Row, where: Row = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected && typeof expected === "object" && "not" in expected) return row[key] !== expected.not;
    if (expected && typeof expected === "object" && "in" in expected) return expected.in.includes(row[key]);
    return row[key] === expected;
  });
}

function createPrisma(seed: { owners?: Row[]; properties?: Row[]; cases?: Row[]; uploads?: Row[] } = {}) {
  const owners = [...(seed.owners ?? [])];
  const properties = [...(seed.properties ?? [])];
  const cases = [...(seed.cases ?? [])];
  const uploads = [...(seed.uploads ?? [])];
  const caseEvents: Row[] = [];
  const memoryEvents: Row[] = [];
  const update = (rows: Row[]) => async ({ where, data }: { where: Row; data: Row }) => {
    const row = rows.find((item) => item.id === where.id)!;
    Object.assign(row, data);
    return row;
  };
  const prisma: any = {
    uploadedDocument: { findMany: async ({ where }: { where: Row }) => uploads.filter((row) => matches(row, where)) },
    imobOwner: { findFirst: async ({ where }: { where: Row }) => owners.find((row) => matches(row, where)) ?? null, update: update(owners) },
    imobProperty: { findFirst: async ({ where }: { where: Row }) => properties.find((row) => matches(row, where)) ?? null, update: update(properties) },
    imobCase: { findFirst: async ({ where }: { where: Row }) => cases.find((row) => matches(row, where)) ?? null, update: update(cases) },
    imobCaseEvent: { create: async ({ data }: { data: Row }) => caseEvents.push(data) },
    memoryEvent: { create: async ({ data }: { data: Row }) => memoryEvents.push(data) },
  };
  prisma.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma);
  return { prisma, owners, properties, cases, caseEvents, memoryEvents };
}

const upload = (id: string, overrides: Row = {}) => ({
  id,
  tenantId: scope.tenantId,
  workspaceId: scope.workspaceId,
  agentSlug: "imob",
  fileName: `${id}.pdf`,
  mimeType: "application/pdf",
  sizeBytes: 1000,
  url: `/api/uploads/${id}`,
  ...overrides,
});

const owner = {
  id: "owner-1",
  tenantId: scope.tenantId,
  workspaceId: scope.workspaceId,
  status: "ready",
  document: "52998224725",
  metadata: { personType: "pf" },
};

const property = {
  id: "property-1",
  tenantId: scope.tenantId,
  workspaceId: scope.workspaceId,
  status: "ready",
  metadata: { externalPropertyRef: "Kitnet 01" },
};

const lease = {
  id: "case-1",
  tenantId: scope.tenantId,
  workspaceId: scope.workspaceId,
  propertyId: "property-1",
  flow: "rental.lease",
  status: "active",
  pendingItems: ["inquilino_documento", CONTRACT_PENDING_ITEM],
  metadata: { hasLinkedDocument: false, stableAgreementKey: "rental:property-1:2025-03-01" },
};

test("document link schema accepts the three subjects and rejects others", () => {
  assert.equal(imobDocumentLinkSchema.safeParse({ subjectType: "owner", subjectId: "o", category: "outro", documentIds: ["d"] }).success, true);
  assert.equal(imobDocumentLinkSchema.safeParse({ subjectType: "lead", subjectId: "o", category: "outro", documentIds: ["d"] }).success, false);
  assert.equal(imobDocumentLinkSchema.safeParse({ subjectType: "owner", subjectId: "o", category: "outro", documentIds: [] }).success, false);
});

test("links a document to the owner keeping the rest of the metadata and auditing without PII", async () => {
  const { prisma, owners, memoryEvents } = createPrisma({ owners: [{ ...owner }], uploads: [upload("doc-1")] });
  const result = await new ImobDocumentLinkService(prisma).link(scope, {
    subjectType: "owner",
    subjectId: "owner-1",
    category: "documento_identidade",
    documentIds: ["doc-1"],
  });

  assert.equal(result.status, "linked");
  assert.equal(owners[0].metadata.personType, "pf");
  const docs = readLinkedDocuments(owners[0].metadata);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].documentId, "doc-1");
  assert.equal(docs[0].category, "documento_identidade");
  assert.equal(docs[0].source, DOCUMENT_LINK_SOURCE);
  assert.equal(memoryEvents.length, 1);
  assert.doesNotMatch(JSON.stringify(memoryEvents[0]), /52998224725/);
});

test("does not duplicate a document already linked", async () => {
  const { prisma, properties, memoryEvents } = createPrisma({ properties: [{ ...property, metadata: { ...property.metadata } }], uploads: [upload("doc-1")] });
  const service = new ImobDocumentLinkService(prisma);
  const input = { subjectType: "property" as const, subjectId: "property-1", category: "matricula", documentIds: ["doc-1"] };
  await service.link(scope, input);
  const again = await service.link(scope, input);

  assert.equal(again.status, "linked");
  assert.equal(readLinkedDocuments(properties[0].metadata).length, 1);
  assert.equal(memoryEvents.length, 1);
});

test("rejects category that does not belong to the subject", async () => {
  const { prisma } = createPrisma({ properties: [{ ...property }], uploads: [upload("doc-1")] });
  const result = await new ImobDocumentLinkService(prisma).link(scope, {
    subjectType: "property",
    subjectId: "property-1",
    category: "contrato_assinado",
    documentIds: ["doc-1"],
  });
  assert.equal(result.status, "invalid_category");
});

test("rejects uploads from another workspace or another agent", async () => {
  const { prisma } = createPrisma({
    owners: [{ ...owner }],
    uploads: [upload("doc-other-ws", { workspaceId: "workspace-b" }), upload("doc-other-agent", { agentSlug: "j360" })],
  });
  const service = new ImobDocumentLinkService(prisma);
  for (const id of ["doc-other-ws", "doc-other-agent", "missing"]) {
    const result = await service.link(scope, { subjectType: "owner", subjectId: "owner-1", category: "outro", documentIds: [id] });
    assert.equal(result.status, "upload_not_found", id);
  }
});

test("archived owner or property is not found", async () => {
  const { prisma } = createPrisma({
    owners: [{ ...owner, status: "archived" }],
    properties: [{ ...property, status: "archived" }],
    uploads: [upload("doc-1")],
  });
  const service = new ImobDocumentLinkService(prisma);
  assert.equal((await service.link(scope, { subjectType: "owner", subjectId: "owner-1", category: "outro", documentIds: ["doc-1"] })).status, "subject_not_found");
  assert.equal((await service.link(scope, { subjectType: "property", subjectId: "property-1", category: "outro", documentIds: ["doc-1"] })).status, "subject_not_found");
});

test("signed contract on the active lease clears the contract pending item and records a case event", async () => {
  const { prisma, cases, caseEvents } = createPrisma({ cases: [{ ...lease, metadata: { ...lease.metadata } }], uploads: [upload("contract-1")] });
  const result = await new ImobDocumentLinkService(prisma).link(scope, {
    subjectType: "rental",
    subjectId: "property-1",
    category: "contrato_assinado",
    documentIds: ["contract-1"],
  });

  assert.equal(result.status, "linked");
  if (result.status !== "linked") return;
  assert.equal(result.data.subjectId, "case-1");
  assert.equal(result.data.contractPendingCleared, true);
  assert.deepEqual(cases[0].pendingItems, ["inquilino_documento"]);
  assert.equal(cases[0].metadata.hasLinkedDocument, true);
  assert.equal(cases[0].metadata.stableAgreementKey, "rental:property-1:2025-03-01");
  assert.equal(caseEvents.length, 1);
  assert.equal(caseEvents[0].type, "rental.lease.document_linked");
});

test("other rental documents keep the contract pending item", async () => {
  const { prisma, cases } = createPrisma({ cases: [{ ...lease, metadata: { ...lease.metadata } }], uploads: [upload("vistoria-1")] });
  const result = await new ImobDocumentLinkService(prisma).link(scope, {
    subjectType: "rental",
    subjectId: "property-1",
    category: "vistoria",
    documentIds: ["vistoria-1"],
  });

  assert.equal(result.status, "linked");
  assert.ok(cases[0].pendingItems.includes(CONTRACT_PENDING_ITEM));
  assert.equal(cases[0].metadata.hasLinkedDocument, false);
});

test("rental without active lease is not found", async () => {
  const { prisma } = createPrisma({ cases: [{ ...lease, status: "closed" }], uploads: [upload("contract-1")] });
  const result = await new ImobDocumentLinkService(prisma).link(scope, {
    subjectType: "rental",
    subjectId: "property-1",
    category: "contrato_assinado",
    documentIds: ["contract-1"],
  });
  assert.equal(result.status, "subject_not_found");
});

test("mergeLinkedDocuments keeps order and ignores repeated ids", () => {
  const ref = (documentId: string) => ({ documentId } as any);
  const merged = mergeLinkedDocuments([ref("a")], [ref("a"), ref("b")]);
  assert.deepEqual(merged.documents.map((item) => item.documentId), ["a", "b"]);
  assert.deepEqual(merged.added.map((item) => item.documentId), ["b"]);
});

test("IMOB uploads require imob.chat.use; other agents and service tokens are unchanged", async () => {
  const denied = async () => false;
  const granted = async () => true;
  assert.equal(await canAccessImobUploads({ agentSlug: "imob", userId: "user-a", hasImobChatPermission: denied }), false);
  assert.equal(await canAccessImobUploads({ agentSlug: "imob", userId: "user-a", hasImobChatPermission: granted }), true);
  assert.equal(await canAccessImobUploads({ agentSlug: "j360", userId: "user-a", hasImobChatPermission: denied }), true);
  assert.equal(await canAccessImobUploads({ agentSlug: "imob", userId: null, hasImobChatPermission: denied }), true);
  const uploadsRoute = readFileSync(new URL("../routes/uploads.ts", import.meta.url), "utf8");
  assert.equal((uploadsRoute.match(/canAccessImobUploads\(/g) ?? []).length, 2, "upload e download passam pela verificação");
});

test("document link route requires imob.chat.use and stage permission for rentals", () => {
  const source = readFileSync(new URL("../routes/imobCrmRouter.ts", import.meta.url), "utf8");
  const start = source.indexOf('router.post("/documents/link"');
  assert.ok(start > 0);
  const block = source.slice(start, source.indexOf("router.post(\"/cases\"", start));
  assert.match(block, /"imob\.chat\.use"/);
  assert.match(block, /subjectType === "rental"[\s\S]*ensureImobStagePermission/);
});
