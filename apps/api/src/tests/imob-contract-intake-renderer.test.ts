// Phase 3 — Renderer unit tests
// Tests for imobContractIntakeRenderer: HTML, DOCX, exportHash, PII scan.
// No PII in fixtures, no DB access.

import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  buildExportHash,
  scanIntakeDataForPii,
  renderIntakeHtml,
  renderIntakeDocx,
  type IntakeExportData,
} from "../services/imob/intake/imobContractIntakeRenderer";

function baseData(overrides: Partial<IntakeExportData> = {}): IntakeExportData {
  return {
    caseId: "cjld2cjxh0000qzrmn831i7rn",
    runId: "run_test_abc123",
    documentHash: "a".repeat(64),
    documentKind: "lease_contract",
    stage: "documents_collecting",
    status: "ready_for_review",
    nextStep: "Analisar documentação recebida",
    pendingItems: ["Assinar procuração", "Enviar RGI"],
    riskFlags: ["Multa acima de 2%"],
    generatedAt: "2026-06-17T10:00:00.000Z",
    exportHash: "b".repeat(64),
    piiMasked: true,
    ...overrides,
  };
}

// ─── T-RND-1: buildExportHash is deterministic ──────────────────────────────
describe("T-RND-1: buildExportHash é determinístico", () => {
  it("mesmos dados → mesmo hash", () => {
    const data = baseData();
    const { exportHash: _h1, ...without } = data;
    const h1 = buildExportHash(without);
    const h2 = buildExportHash(without);
    assert.equal(h1, h2);
    assert.equal(h1.length, 64);
    assert.match(h1, /^[0-9a-f]{64}$/);
  });
});

// ─── T-RND-2: buildExportHash changes with data ────────────────────────────
describe("T-RND-2: buildExportHash muda com os dados", () => {
  it("caseId diferente → hash diferente", () => {
    const d1 = baseData({ caseId: "case-aaa" });
    const d2 = baseData({ caseId: "case-bbb" });
    const { exportHash: _h1, ...w1 } = d1;
    const { exportHash: _h2, ...w2 } = d2;
    assert.notEqual(buildExportHash(w1), buildExportHash(w2));
  });
});

// ─── T-RND-3: scanIntakeDataForPii — clean data passes ─────────────────────
describe("T-RND-3: scanIntakeDataForPii — dados limpos passam", () => {
  it("nenhum campo viola PII", () => {
    const result = scanIntakeDataForPii(baseData());
    assert.equal(result.hasPii, false);
    assert.deepEqual(result.fields, []);
  });
});

// ─── T-RND-4: scanIntakeDataForPii — CPF in nextStep is caught ─────────────
describe("T-RND-4: scanIntakeDataForPii — CPF em nextStep é detectado", () => {
  it("CPF inválido sintético em nextStep → hasPii=true, fields=['nextStep']", () => {
    const data = baseData({ nextStep: "Contato com 000.000.000-00 para assinar" });
    const result = scanIntakeDataForPii(data);
    assert.equal(result.hasPii, true);
    assert.ok(result.fields.includes("nextStep"), `expected nextStep in fields: ${JSON.stringify(result.fields)}`);
  });
});

// ─── T-RND-5: scanIntakeDataForPii — email in pendingItems is caught ────────
describe("T-RND-5: scanIntakeDataForPii — email em pendingItems é detectado", () => {
  it("email sintético em pendingItems → hasPii=true", () => {
    const data = baseData({ pendingItems: ["Enviar para example@test.com"] });
    const result = scanIntakeDataForPii(data);
    assert.equal(result.hasPii, true);
    assert.ok(result.fields.includes("pendingItems"));
  });
});

// ─── T-RND-6: renderIntakeHtml — returns valid HTML ────────────────────────
describe("T-RND-6: renderIntakeHtml — retorna HTML válido", () => {
  it("contém doctype, charset e dados do caso", () => {
    const data = baseData();
    const html = renderIntakeHtml(data);
    assert.ok(typeof html === "string");
    assert.ok(html.startsWith("<!DOCTYPE html>"));
    assert.ok(html.includes("charset="), "should include charset declaration");
    assert.ok(html.includes(data.caseId), "should include caseId");
    assert.ok(html.includes(data.stage), "should include stage");
    assert.ok(html.includes(data.status), "should include status");
    assert.ok(html.includes(data.nextStep!), "should include nextStep");
    assert.ok(html.includes("Mascarado"), "should include PII masking badge");
  });
});

// ─── T-RND-7: renderIntakeHtml — pending items and risk flags appear ────────
describe("T-RND-7: renderIntakeHtml — pendingItems e riskFlags aparecem", () => {
  it("cada item aparece na saída HTML", () => {
    const data = baseData({
      pendingItems: ["Item A", "Item B"],
      riskFlags: ["Risco X", "Risco Y"],
    });
    const html = renderIntakeHtml(data);
    assert.ok(html.includes("Item A"));
    assert.ok(html.includes("Item B"));
    assert.ok(html.includes("Risco X"));
    assert.ok(html.includes("Risco Y"));
  });
});

// ─── T-RND-8: renderIntakeHtml — empty lists show placeholder ──────────────
describe("T-RND-8: renderIntakeHtml — listas vazias mostram placeholder", () => {
  it("pendingItems=[] e riskFlags=[] → 'Nenhum' aparece", () => {
    const data = baseData({ pendingItems: [], riskFlags: [] });
    const html = renderIntakeHtml(data);
    // Both sections should have the placeholder
    const count = (html.match(/Nenhum/g) ?? []).length;
    assert.ok(count >= 2, `expected at least 2 occurrences of "Nenhum", got ${count}`);
  });
});

// ─── T-RND-9: renderIntakeHtml — XSS escaping ──────────────────────────────
describe("T-RND-9: renderIntakeHtml — escaping XSS", () => {
  it("conteúdo com < e & é escapado", () => {
    const data = baseData({
      nextStep: "a < b & c > d",
      pendingItems: ['<script>alert("x")</script>'],
    });
    const html = renderIntakeHtml(data);
    assert.ok(!html.includes("<script>alert"), "raw <script> must not appear");
    assert.ok(html.includes("&lt;script&gt;"), "script tags must be escaped");
    assert.ok(html.includes("&lt; b &amp; c"), "< and & must be escaped");
  });
});

// ─── T-RND-10: renderIntakeHtml — exportHash appears in footer ─────────────
describe("T-RND-10: renderIntakeHtml — exportHash aparece no footer", () => {
  it("footer contém exportHash e generatedAt", () => {
    const data = baseData();
    const html = renderIntakeHtml(data);
    assert.ok(html.includes(data.exportHash), "exportHash must appear");
    assert.ok(html.includes(data.generatedAt), "generatedAt must appear");
    assert.ok(html.includes(data.documentHash), "documentHash must appear");
  });
});

// ─── T-RND-11: renderIntakeDocx — returns a Buffer ─────────────────────────
describe("T-RND-11: renderIntakeDocx — retorna um Buffer", () => {
  it("resultado é Buffer com tamanho positivo", async () => {
    const data = baseData();
    const buf = await renderIntakeDocx(data);
    assert.ok(Buffer.isBuffer(buf), "should be a Buffer");
    assert.ok(buf.length > 0, "buffer should be non-empty");
  });
});

// ─── T-RND-12: renderIntakeDocx — ZIP magic bytes ──────────────────────────
describe("T-RND-12: renderIntakeDocx — magic bytes ZIP corretos", () => {
  it("primeiros 2 bytes são PK (50 4B)", async () => {
    const data = baseData();
    const buf = await renderIntakeDocx(data);
    // ZIP/DOCX files start with PK (0x50 0x4B)
    assert.equal(buf[0], 0x50);
    assert.equal(buf[1], 0x4b);
  });
});

// ─── T-RND-13: renderIntakeDocx — contains caseId in XML ───────────────────
describe("T-RND-13: renderIntakeDocx — caseId presente no XML interno", () => {
  it("descompressão via JSZip mostra caseId em document.xml", async () => {
    const JSZip = (await import("jszip")).default;
    const data = baseData();
    const buf = await renderIntakeDocx(data);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml")!.async("string");
    assert.ok(docXml.includes(data.caseId), "caseId must be in document.xml");
    assert.ok(docXml.includes(data.stage), "stage must be in document.xml");
    assert.ok(docXml.includes("Mascarado"), "PII badge must be in document.xml");
  });
});

// ─── T-RND-14: renderIntakeDocx — OOXML structure present ──────────────────
describe("T-RND-14: renderIntakeDocx — estrutura OOXML presente", () => {
  it("ZIP contém [Content_Types].xml, _rels/.rels e word/document.xml", async () => {
    const JSZip = (await import("jszip")).default;
    const data = baseData();
    const buf = await renderIntakeDocx(data);
    const zip = await JSZip.loadAsync(buf);
    assert.ok(zip.file("[Content_Types].xml"), "[Content_Types].xml must exist");
    assert.ok(zip.file("_rels/.rels"), "_rels/.rels must exist");
    assert.ok(zip.file("word/document.xml"), "word/document.xml must exist");
  });
});

// ─── T-RND-15: renderIntakeDocx — XML-escapes special characters ────────────
describe("T-RND-15: renderIntakeDocx — escaping XML em pendingItems", () => {
  it("& em pendingItems vira &amp; no XML", async () => {
    const JSZip = (await import("jszip")).default;
    const data = baseData({ pendingItems: ["Locador & Locatário"] });
    const buf = await renderIntakeDocx(data);
    const zip = await JSZip.loadAsync(buf);
    const docXml = await zip.file("word/document.xml")!.async("string");
    assert.ok(docXml.includes("Locador &amp; Locat"), "& must be escaped as &amp;");
    assert.ok(!docXml.includes("Locador & Locatário"), "raw & must not appear");
  });
});
