import assert from "node:assert/strict";
import test from "node:test";

import { extractPdfDocumentEvidenceFromBuffer } from "../services/documents/pdfTextExtractor";

function buildSimplePdf(lines: string[]) {
  const bodyLines = ["BT", "/F1 12 Tf"];
  let y = 260;
  for (const line of lines) {
    bodyLines.push(`1 0 0 1 30 ${y} Tm`);
    bodyLines.push(`(${line}) Tj`);
    y -= 16;
  }
  bodyLines.push("ET");
  const stream = bodyLines.join("\n");
  const pdf = [
    "%PDF-1.4",
    "1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj",
    "2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj",
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 300] /Contents 4 0 R >>endobj",
    `4 0 obj<< /Length ${String(stream.length)} >>stream`,
    stream,
    "endstream",
    "endobj",
    "trailer<< /Root 1 0 R >>",
    "%%EOF",
  ].join("\n");
  return Buffer.from(pdf, "latin1");
}

test("extractPdfDocumentEvidenceFromBuffer extracts pages, lines and sections from simple pdf", () => {
  const buffer = buildSimplePdf([
    "POLITICA DE PREMIACAO",
    "Natureza juridica da premiacao",
    "A premiacao depende de desempenho extraordinario.",
    "Base de calculo, coerencia e ambiguidades",
    "A formula considera salario-base e faturamento do periodo.",
  ]);

  const extracted = extractPdfDocumentEvidenceFromBuffer(buffer, "politica.pdf");

  assert.equal(extracted.document, "politica.pdf");
  assert.equal(extracted.pageCount, 1);
  assert.match(extracted.pages[0]?.text ?? "", /Natureza juridica da premiacao/i);
  assert.match(extracted.pages[0]?.text ?? "", /Base de calculo/i);
  assert.equal(extracted.sections.length >= 2, true);
});
