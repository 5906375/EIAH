import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import supertest from "supertest";

process.env.DATABASE_URL ??= "postgresql://ci:ci@127.0.0.1:5432/eiah_ci?schema=public";
process.env.REDIS_URL ??= "redis://127.0.0.1:6379";

let prismaGlobal: typeof import("@repo/db").prismaGlobal;
let persistBuffer: typeof import("../services/storage").persistBuffer;
let createUploadedDocument: typeof import("../services/uploads").createUploadedDocument;
let upsertWorkspaceRoleConfig: typeof import("../services/workspaceResponsibility").upsertWorkspaceRoleConfig;

let request: ReturnType<typeof supertest>;
let uploadsDir = "";

const suffix = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
const tenantId = "tenant-imob-attach-" + suffix;
const workspaceId = "workspace-imob-attach-" + suffix;
const userId = "user-imob-attach-" + suffix;
const apiToken = "tok-imob-attach-" + suffix;

async function createTextUpload(name: string, content: string) {
  const persisted = await persistBuffer(Buffer.from(content, "utf8"), name);
  return createUploadedDocument({
    prisma: prismaGlobal,
    tenantId,
    workspaceId,
    agentSlug: "imob",
    fileName: name,
    mimeType: "text/plain",
    sizeBytes: Buffer.byteLength(content, "utf8"),
    storageKey: persisted.storageKey,
    url: "/api/uploads/" + name,
  });
}

async function createBinaryUpload(name: string, mimeType: string, content: Buffer) {
  const persisted = await persistBuffer(content, name);
  return createUploadedDocument({
    prisma: prismaGlobal,
    tenantId,
    workspaceId,
    agentSlug: "imob",
    fileName: name,
    mimeType,
    sizeBytes: content.byteLength,
    storageKey: persisted.storageKey,
    url: "/api/uploads/" + name,
  });
}

function createPdfBuffer(lines: string[]) {
  const bodyLines = ["BT", "/F1 12 Tf", "72 720 Td"];
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) bodyLines.push("0 -14 Td");
    bodyLines.push("(" + lines[index] + ") Tj");
  }
  bodyLines.push("ET");
  const stream = bodyLines.join("\n");
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>endobj",
    "4 0 obj<< /Length " + String(stream.length) + " >>stream",
    stream,
    "endstream",
    "endobj",
    "trailer<< /Root 1 0 R >>",
    "%%EOF",
  ].join("\n");
  return Buffer.from(pdf, "latin1");
}

before(async () => {
  ({ prismaGlobal } = await import("@repo/db"));
  ({ persistBuffer } = await import("../services/storage"));
  ({ createUploadedDocument } = await import("../services/uploads"));
  ({ upsertWorkspaceRoleConfig } = await import("../services/workspaceResponsibility"));

  uploadsDir = await mkdtemp(path.join(os.tmpdir(), "imob-attach-validation-"));
  process.env.NODE_ENV = "test";
  process.env.UPLOADS_DIR = uploadsDir;
  const { default: app } = await import("../index");
  request = supertest(app);

  await prismaGlobal.tenant.create({ data: { id: tenantId, name: tenantId } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: workspaceId } });
  await prismaGlobal.user.create({
    data: { id: userId, tenantId, email: userId + "@example.com", displayName: "IMOB Attachment Tester" },
  });
  await prismaGlobal.apiToken.create({
    data: {
      token: apiToken,
      tenantId,
      workspaceId,
      userId,
      description: "imob-attachment-validation-test",
      revoked: false,
    },
  });
});

after(async () => {
  await prismaGlobal.$executeRaw`
    DELETE FROM memory_events
    WHERE tenant_id = ${tenantId}
      AND workspace_id = ${workspaceId}
  `;
  await prismaGlobal.imobCaseEvent.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobCase.deleteMany({ where: { tenantId } });
  await prismaGlobal.imobOwner.deleteMany({ where: { tenantId } });
  await prismaGlobal.uploadedDocument.deleteMany({ where: { tenantId } });
  await prismaGlobal.apiToken.deleteMany({ where: { tenantId } });
  await prismaGlobal.user.deleteMany({ where: { tenantId } });
  await prismaGlobal.workspace.deleteMany({ where: { tenantId } });
  await prismaGlobal.tenant.deleteMany({ where: { id: tenantId } });
  await prismaGlobal.$disconnect();
  if (uploadsDir) {
    await rm(uploadsDir, { recursive: true, force: true });
  }
});

test("IMOB attachment resolve validates owner document against case data", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "João Silva",
      document: "12345678901",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "11222333" },
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: "thread-" + suffix + "-ok",
      pendingItems: ["ownerDocument"],
    },
  });
  const upload = await createTextUpload(
    "documento_proprietario.txt",
    ["Nome: João Silva", "CPF: 123.456.789-01", "RG: 11.222.333"].join("\n")
  );

  await upsertWorkspaceRoleConfig({
    prisma: prismaGlobal,
    tenantId,
    workspaceId,
    userId,
    roleLabels: ["Corretor", "Gestor"],
    selectedRoleKey: "corretor",
  });

  const response = await request
    .post("/api/imob/attachments/resolve")
    .set("Authorization", "Bearer " + apiToken)
    .send({ caseId: imobCase.id, threadId: imobCase.threadId, documentIds: [upload.id] });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.resolved, true);
  assert.match(response.body?.data?.presentation?.text ?? "", /aprovado automaticamente com os dados do caso/i);
  assert.equal(response.body?.data?.presentation?.card?.title, "Validação documental aprovada");
  assert.match(response.body?.data?.presentation?.text ?? "", /Próximo passo: Concluir vínculo do proprietário com este imóvel\./i);
  assert.equal(response.body?.data?.presentation?.card?.lines?.[0], "Decisão: aprovado automaticamente.");
  assert.equal(response.body?.data?.presentation?.card?.lines?.[1]?.includes("Nome: Confere"), true);
  assert.equal(response.body?.data?.presentation?.card?.lines?.[2]?.includes("CPF: Confere"), true);
  assert.equal(response.body?.data?.presentation?.card?.lines?.[3]?.includes("RG: Confere"), true);
  assert.equal(response.body?.data?.presentation?.metadata?.context?.caseId, imobCase.id);
  assert.equal(response.body?.data?.presentation?.metadata?.context?.threadId, imobCase.threadId);
  assert.equal(response.body?.data?.presentation?.metadata?.context?.resolutionSource, "case_id");
  assert.equal(response.body?.data?.conversationState?.operational?.ownerDraft?.ownerDocument, "12345678901");
});

test("IMOB attachment resolve resolves case by conversationId when caseId/threadId are missing", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Ana Lopes",
      document: "12345678901",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "11222333" },
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: "thread-" + suffix + "-conversation-fallback",
      pendingItems: ["ownerDocument"],
    },
  });
  const conversationId = "conv-" + suffix + "-conversation-fallback";
  await prismaGlobal.memoryEvent.create({
    data: {
      tenantId,
      workspaceId,
      agentId: "imob-chat",
      runId: null,
      key: "conversation.message",
      content: "Documento anexado para validação",
      metadata: {
        conversationId,
        threadId: imobCase.threadId,
        caseContext: { caseId: imobCase.id, threadId: imobCase.threadId },
      },
    },
  });

  const upload = await createTextUpload(
    "documento_conversation_fallback.txt",
    ["Nome: Ana Lopes", "CPF: 123.456.789-01", "RG: 11.222.333"].join("\n")
  );

  const response = await request
    .post("/api/imob/attachments/resolve")
    .set("Authorization", "Bearer " + apiToken)
    .send({ conversationId, documentIds: [upload.id] });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.resolved, true);
  assert.equal(response.body?.data?.caseContext?.caseId, imobCase.id);
  assert.equal(response.body?.data?.presentation?.metadata?.context?.caseId, imobCase.id);
  assert.equal(response.body?.data?.presentation?.metadata?.context?.threadId, imobCase.threadId);
  assert.equal(response.body?.data?.presentation?.metadata?.context?.conversationId, conversationId);
  assert.equal(response.body?.data?.presentation?.metadata?.context?.resolutionSource, "conversation_case_context");
});

test("IMOB attachment resolve blocks ambiguous context when conversationId/caseId/threadId conflict", async () => {
  const ownerA = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Owner A",
      document: "12345678901",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "11111111" },
    },
  });
  const caseA = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: ownerA.id,
      threadId: "thread-" + suffix + "-mismatch-a",
      pendingItems: ["ownerDocument"],
    },
  });
  const ownerB = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Owner B",
      document: "98765432100",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "22222222" },
    },
  });
  const caseB = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: ownerB.id,
      threadId: "thread-" + suffix + "-mismatch-b",
      pendingItems: ["ownerDocument"],
    },
  });

  const conversationId = "conv-" + suffix + "-mismatch";
  await prismaGlobal.memoryEvent.create({
    data: {
      tenantId,
      workspaceId,
      agentId: "imob-chat",
      runId: null,
      key: "conversation.message",
      content: "Conversa vinculada ao caso A",
      metadata: {
        conversationId,
        threadId: caseA.threadId,
        caseContext: { caseId: caseA.id, threadId: caseA.threadId },
      },
    },
  });

  const upload = await createTextUpload(
    "documento_mismatch.txt",
    ["Nome: Owner A", "CPF: 123.456.789-01", "RG: 11.111.111"].join("\n")
  );

  const response = await request
    .post("/api/imob/attachments/resolve")
    .set("Authorization", "Bearer " + apiToken)
    .send({
      conversationId,
      caseId: caseA.id,
      threadId: caseB.threadId,
      documentIds: [upload.id],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.resolved, false);
  assert.match(response.body?.data?.presentation?.text ?? "", /contexto informado ficou inconsistente/i);
  assert.equal(response.body?.data?.presentation?.metadata?.context?.resolutionSource, "identifier_mismatch");
});

test("IMOB attachment resolve returns structured divergence when document conflicts with case", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Maria Souza",
      document: "98765432100",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "99888777" },
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: "thread-" + suffix + "-diverge",
      pendingItems: ["ownerDocument"],
    },
  });
  const upload = await createTextUpload(
    "documento_divergente.txt",
    ["Nome: Maria Souza", "CPF: 111.222.333-44", "RG: 99.888.777"].join("\n")
  );

  const response = await request
    .post("/api/imob/attachments/resolve")
    .set("Authorization", "Bearer " + apiToken)
    .send({ caseId: imobCase.id, threadId: imobCase.threadId, documentIds: [upload.id] });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.resolved, false);
  assert.match(response.body?.data?.presentation?.text ?? "", /encaminhado para revisão/i);
  assert.equal(response.body?.data?.presentation?.card?.title, "Validação documental em revisão");
  assert.equal(response.body?.data?.presentation?.card?.lines?.[0], "Decisão: encaminhado para revisão humana.");
  assert.equal(response.body?.data?.presentation?.card?.lines?.[2]?.includes("CPF: Diverge"), true);
});

test("IMOB attachment resolve falls back to review when image validation provider fails", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Carlos Lima",
      document: "12345678901",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "55444333" },
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: "thread-" + suffix + "-provider-fail",
      pendingItems: ["ownerDocument"],
    },
  });
  const upload = await createBinaryUpload("documento_frente.png", "image/png", Buffer.from("fake-image-content"));

  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = (async () => {
    throw new Error("provider offline");
  }) as typeof fetch;

  try {
    const response = await request
      .post("/api/imob/attachments/resolve")
      .set("Authorization", "Bearer " + apiToken)
      .send({ caseId: imobCase.id, threadId: imobCase.threadId, documentIds: [upload.id] });

    assert.equal(response.status, 200);
    assert.equal(response.body?.ok, true);
    assert.equal(response.body?.data?.resolved, false);
    assert.equal(response.body?.data?.presentation?.card?.title, "Validação documental em revisão");
    assert.match(response.body?.data?.presentation?.text ?? "", /encaminhado para revisão/i);
    assert.equal(
      response.body?.data?.presentation?.card?.lines?.some((line: string) => /temporariamente indisponível/i.test(line)),
      true
    );
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    global.fetch = originalFetch;
  }
});

test("IMOB attachment resolve approves a textual PDF automatically", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Paulo Nunes",
      document: "32165498700",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "55666777" },
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: "thread-" + suffix + "-pdf",
      pendingItems: ["ownerDocument"],
    },
  });
  const upload = await createBinaryUpload(
    "documento_proprietario.pdf",
    "application/pdf",
    createPdfBuffer(["Nome: Paulo Nunes", "CPF: 321.654.987-00", "RG: 55.666.777"])
  );

  const response = await request
    .post("/api/imob/attachments/resolve")
    .set("Authorization", "Bearer " + apiToken)
    .send({ caseId: imobCase.id, threadId: imobCase.threadId, documentIds: [upload.id] });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.resolved, true);
  assert.equal(response.body?.data?.presentation?.card?.title, "Validação documental aprovada");
  assert.equal(response.body?.data?.presentation?.card?.lines?.[0], "Decisão: aprovado automaticamente.");
  assert.equal(response.body?.data?.presentation?.card?.lines?.[1]?.includes("Nome: Confere"), true);
  assert.equal(response.body?.data?.presentation?.card?.lines?.[2]?.includes("CPF: Confere"), true);
});

test("IMOB attachment resolve uses provider for scanned PDF and approves when OCR matches", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Helena Prado",
      document: "74185296300",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "44556677" },
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: "thread-" + suffix + "-scanned-pdf",
      pendingItems: ["ownerDocument"],
    },
  });
  const upload = await createBinaryUpload(
    "documento_escaneado.pdf",
    "application/pdf",
    Buffer.from("%PDF-1.4\n1 0 obj<<>>stream\n\x00\x01\x02\nendstream\nendobj\n%%EOF", "binary")
  );

  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;
  let capturedBody: any = null;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return {
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          name: "Helena Prado",
          cpf: "74185296300",
          rg: "44556677",
          legible: true,
          notes: ["OCR via PDF escaneado."],
        }),
      }),
    } as any;
  }) as typeof fetch;

  try {
    const response = await request
      .post("/api/imob/attachments/resolve")
      .set("Authorization", "Bearer " + apiToken)
      .send({ caseId: imobCase.id, threadId: imobCase.threadId, documentIds: [upload.id] });

    assert.equal(response.status, 200);
    assert.equal(response.body?.ok, true);
    assert.equal(response.body?.data?.resolved, true);
    assert.equal(response.body?.data?.presentation?.card?.title, "Validação documental aprovada");
    const userMessage = capturedBody?.input?.find((item: any) => item.role === "user");
    assert.equal(userMessage?.content?.some((item: any) => item.type === "input_file" && item.filename === "documento_escaneado.pdf"), true);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    global.fetch = originalFetch;
  }
});

test("IMOB attachment resolve consolidates front and back images in one provider call", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Roberta Dias",
      document: "15975348620",
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: { rg: "88776655" },
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: "thread-" + suffix + "-multi-image",
      pendingItems: ["ownerDocument"],
    },
  });
  const front = await createBinaryUpload("documento_frente.png", "image/png", Buffer.from("front-image"));
  const back = await createBinaryUpload("documento_verso.png", "image/png", Buffer.from("back-image"));

  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalFetch = global.fetch;
  let capturedBody: any = null;
  process.env.OPENAI_API_KEY = "test-key";
  global.fetch = (async (_input, init) => {
    capturedBody = JSON.parse(String(init?.body ?? "{}"));
    return {
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          name: "Roberta Dias",
          cpf: "15975348620",
          rg: "88776655",
          legible: true,
          notes: ["Documento consolidado a partir de frente e verso."],
        }),
      }),
    } as any;
  }) as typeof fetch;

  try {
    const response = await request
      .post("/api/imob/attachments/resolve")
      .set("Authorization", "Bearer " + apiToken)
      .send({ caseId: imobCase.id, threadId: imobCase.threadId, documentIds: [front.id, back.id] });

    assert.equal(response.status, 200);
    assert.equal(response.body?.ok, true);
    assert.equal(response.body?.data?.resolved, true);
    assert.equal(response.body?.data?.presentation?.card?.title, "Validação documental aprovada");
    const userMessage = capturedBody?.input?.find((item: any) => item.role === "user");
    const imageItems = Array.isArray(userMessage?.content)
      ? userMessage.content.filter((item: any) => item.type === "input_image")
      : [];
    assert.equal(imageItems.length, 2);
  } finally {
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    global.fetch = originalFetch;
  }
});


test("IMOB attachment CRM suggestion applies extracted fields into owner record and stores audit event", async () => {
  const owner = await prismaGlobal.imobOwner.create({
    data: {
      tenantId,
      workspaceId,
      name: "Cadastro parcial",
      document: null,
      status: "pending_data",
      pendingItems: ["ownerDocument"],
      metadata: {},
    },
  });
  const imobCase = await prismaGlobal.imobCase.create({
    data: {
      tenantId,
      workspaceId,
      flow: "owner.create",
      stage: "pending_data",
      status: "pending_data",
      ownerId: owner.id,
      threadId: "thread-" + suffix + "-crm-suggestion",
      pendingItems: ["ownerDocument"],
    },
  });
  const upload = await createTextUpload(
    "documento_crm_suggestion.txt",
    ["Nome: Carla Mendes", "CPF: 456.789.123-00", "RG: 12.345.678"].join("\n")
  );

  const response = await request
    .post("/api/imob/attachments/crm-suggestion")
    .set("Authorization", "Bearer " + apiToken)
    .send({ caseId: imobCase.id, threadId: imobCase.threadId, documentIds: [upload.id], mode: "include" });

  assert.equal(response.status, 200);
  assert.equal(response.body?.ok, true);
  assert.equal(response.body?.data?.applied, true);
  assert.match(response.body?.data?.presentation?.text ?? "", /Incluí no CRM os campos vazios preenchidos pelo documento/i);

  const refreshedOwner = await prismaGlobal.imobOwner.findUniqueOrThrow({ where: { id: owner.id } });
  assert.equal(refreshedOwner.name, "Cadastro parcial");
  assert.equal(refreshedOwner.document, "45678912300");
  assert.equal((refreshedOwner.metadata as Record<string, unknown> | null)?.rg, "12345678");

  const crmEvent = await prismaGlobal.imobCaseEvent.findFirst({
    where: { caseId: imobCase.id, type: "case.crm_suggestion_applied" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(crmEvent);
  assert.equal((crmEvent?.payload as Record<string, unknown> | null)?.mode, "include");
  assert.equal(Array.isArray((crmEvent?.payload as Record<string, unknown> | null)?.documentIds), true);
});
