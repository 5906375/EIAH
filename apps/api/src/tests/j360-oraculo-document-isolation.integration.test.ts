import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { ORACULO_UPLOAD_AGENT } from "@eiah/contracts";
import { prismaGlobal } from "@repo/db";

import { persistBuffer } from "../services/storage";
import { createUploadedDocument } from "../services/uploads";
import { collectJ360DocumentEvidence } from "../workers/runWorkerJ360Output";

// Documentos do Oráculo (agentSlug "oraculo-sc") só saem pelo contexto autorizado do próprio Oráculo: a coleta de evidência
// do J-360, que lê PDFs citados em metadata de run (controlada por quem cria a run), não pode consumi-los.
// Exige banco dedicado local (PostgreSQL descartável) e UPLOADS_DIR temporário.
function assertDedicatedLocalDatabase() {
  let url: URL;
  try { url = new URL(process.env.DATABASE_URL ?? "postgresql://unused/unused"); }
  catch { throw new Error("Dedicated local logistics database required"); }
  if (!["localhost", "127.0.0.1"].includes(url.hostname) || !url.pathname.startsWith("/eiah_logistica_core_")) {
    throw new Error("Dedicated local eiah_logistica_core_ database required");
  }
}
assertDedicatedLocalDatabase();

function buildSimplePdf(lines: string[]) {
  const body = ["BT", "/F1 12 Tf"];
  let y = 260;
  for (const line of lines) { body.push(`1 0 0 1 30 ${y} Tm`, `(${line}) Tj`); y -= 16; }
  body.push("ET");
  const stream = body.join("\n");
  return Buffer.from(["%PDF-1.4", "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj", "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>endobj", `4 0 obj<< /Length ${String(stream.length)} >>stream`, stream, "endstream", "endobj",
    "trailer<< /Root 1 0 R >>", "%%EOF"].join("\n"), "latin1");
}

const id = randomUUID();
const tenantId = `j360-iso-${id}`, workspaceId = `j360-iso-ws-${id}`;
let oraculoDocId = "", otherDocId = "";

before(async () => {
  await prismaGlobal.tenant.create({ data: { id: tenantId, name: "Synthetic J360 isolation" } });
  await prismaGlobal.workspace.create({ data: { id: workspaceId, tenantId, name: "Main" } });
  for (const [slug, text, setId] of [[ORACULO_UPLOAD_AGENT, "SIGILO DO ORACULO CONTEUDO PROTEGIDO", (v: string) => { oraculoDocId = v; }], ["j360", "Documento juridico comum anexado", (v: string) => { otherDocId = v; }]] as const) {
    const bytes = buildSimplePdf([text]);
    const persisted = await persistBuffer(bytes, `${slug}.pdf`, { tenantId, workspaceId, agentSlug: slug });
    const record = await createUploadedDocument({ tenantId, workspaceId, agentSlug: slug, fileName: `${slug}.pdf`, mimeType: "application/pdf", sizeBytes: bytes.length, storageKey: persisted.storageKey });
    setId(record.id);
  }
});

after(async () => { await prismaGlobal.$disconnect(); });

const meta = (docId: string, scoped = true) => ({ ...(scoped ? { tenantId, workspaceId } : {}), documents: [{ id: docId, name: "x.pdf", mimeType: "application/pdf" }] });
const textOf = (evidence: unknown) => JSON.stringify(evidence ?? null);

test("controle: documento comum do workspace continua sendo lido pelo J-360", async () => {
  const evidence = await collectJ360DocumentEvidence({ metadata: meta(otherDocId) });
  assert.notEqual(evidence, null);
  assert.match(textOf(evidence), /Documento juridico comum/);
});

test("documento do Oráculo citado na metadata da run NÃO é lido (escopado ou sem escopo)", async () => {
  for (const scoped of [true, false]) {
    const evidence = await collectJ360DocumentEvidence({ metadata: meta(oraculoDocId, scoped) });
    assert.equal(evidence, null, `scoped=${scoped}`);
    assert.doesNotMatch(textOf(evidence), /SIGILO/);
  }
});

test("lista mista: o documento do Oráculo é ignorado e o comum é usado", async () => {
  const metadata = { tenantId, workspaceId, documents: [{ id: oraculoDocId, mimeType: "application/pdf" }, { id: otherDocId, mimeType: "application/pdf" }] };
  const evidence = await collectJ360DocumentEvidence({ metadata });
  assert.doesNotMatch(textOf(evidence), /SIGILO/);
  assert.match(textOf(evidence), /Documento juridico comum/);
});
