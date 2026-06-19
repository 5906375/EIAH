// Server-side export renderer for IMOB contract intake.
// Generates HTML (string) and DOCX (Buffer via JSZip) from persisted case/event data.
// Never reads from in-memory draft; never includes PII.

import crypto from "node:crypto";
import JSZip from "jszip";
import { hasPiiResidue } from "./imobContractPiiMasker";

export type IntakeExportData = {
  caseId: string;
  runId: string;
  documentHash: string;
  documentKind: "lease_contract" | "other";
  stage: string;
  status: string;
  nextStep: string | null;
  pendingItems: string[];
  riskFlags: string[];
  generatedAt: string;
  exportHash: string;
  piiMasked: true;
};

export function buildExportHash(data: Omit<IntakeExportData, "exportHash">): string {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

// Anti-PII scan on the human-readable text fields of the assembled export payload.
// documentHash and caseId are hex/cuid — no PII patterns match them.
export function scanIntakeDataForPii(data: IntakeExportData): { hasPii: boolean; fields: string[] } {
  const checks: Array<{ field: string; value: string }> = [
    { field: "nextStep", value: data.nextStep ?? "" },
    { field: "pendingItems", value: data.pendingItems.join(" ") },
    { field: "riskFlags", value: data.riskFlags.join(" ") },
  ];
  const violatingFields = checks
    .filter(({ value }) => value.length > 0 && hasPiiResidue(value))
    .map(({ field }) => field);
  return { hasPii: violatingFields.length > 0, fields: violatingFields };
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function renderIntakeHtml(data: IntakeExportData): string {
  const pendingList =
    data.pendingItems.length > 0
      ? data.pendingItems.map((item) => `      <li>${escHtml(item)}</li>`).join("\n")
      : "      <li><em>Nenhum</em></li>";

  const riskList =
    data.riskFlags.length > 0
      ? data.riskFlags.map((flag) => `      <li>${escHtml(flag)}</li>`).join("\n")
      : "      <li><em>Nenhum</em></li>";

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Relatório de Intake — Contrato de Locação</title>
<style>
  body{font-family:Arial,sans-serif;max-width:800px;margin:40px auto;color:#222;line-height:1.5}
  h1{font-size:1.4rem;border-bottom:2px solid #333;padding-bottom:8px;margin-bottom:16px}
  h2{font-size:1.05rem;margin-top:24px;margin-bottom:8px;color:#444}
  table{border-collapse:collapse;width:100%;margin-bottom:16px}
  th,td{border:1px solid #ccc;padding:7px 12px;text-align:left;vertical-align:top}
  th{background:#f5f5f5;width:32%;font-weight:600}
  ul{margin:4px 0;padding-left:20px}
  .mono{font-family:monospace;font-size:0.78rem;word-break:break-all;color:#555}
  .badge-ok{display:inline-block;padding:1px 8px;border-radius:4px;font-size:0.82rem;background:#e8f5e9;color:#2e7d32;border:1px solid #81c784}
  footer{margin-top:32px;font-size:0.72rem;color:#999;border-top:1px solid #eee;padding-top:8px}
</style>
</head>
<body>
<h1>Relatório de Intake — Contrato de Locação</h1>

<h2>Identificação</h2>
<table>
  <tr><th>Caso</th><td class="mono">${escHtml(data.caseId)}</td></tr>
  <tr><th>Run ID</th><td class="mono">${escHtml(data.runId)}</td></tr>
  <tr><th>Tipo de Documento</th><td>${escHtml(data.documentKind)}</td></tr>
  <tr><th>Stage</th><td>${escHtml(data.stage)}</td></tr>
  <tr><th>Status</th><td>${escHtml(data.status)}</td></tr>
  <tr><th>Próximo Passo</th><td>${escHtml(data.nextStep ?? "—")}</td></tr>
  <tr><th>PII</th><td><span class="badge-ok">Mascarado</span></td></tr>
</table>

<h2>Itens Pendentes</h2>
<ul>
${pendingList}
</ul>

<h2>Alertas de Risco</h2>
<ul>
${riskList}
</ul>

<footer>
  <p>Hash do documento: <span class="mono">${escHtml(data.documentHash)}</span></p>
  <p>Export hash (SHA-256): <span class="mono">${escHtml(data.exportHash)}</span></p>
  <p>Gerado em: ${escHtml(data.generatedAt)}</p>
</footer>
</body>
</html>`;
}

export async function renderIntakeDocx(data: IntakeExportData): Promise<Buffer> {
  const zip = new JSZip();

  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );

  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );

  function escXml(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function p(text: string, bold = false): string {
    const rpr = bold ? "<w:rPr><w:b/></w:rPr>" : "";
    return `<w:p><w:r>${rpr}<w:t xml:space="preserve">${escXml(text)}</w:t></w:r></w:p>`;
  }

  function tableRow(label: string, value: string): string {
    return `<w:tr>
      <w:tc><w:tcPr><w:tcW w:w="2400" w:type="dxa"/><w:shd w:val="clear" w:fill="F5F5F5"/></w:tcPr>
        <w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escXml(label)}</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t xml:space="preserve">${escXml(value)}</w:t></w:r></w:p></w:tc>
    </w:tr>`;
  }

  const pendingParas =
    data.pendingItems.length > 0
      ? data.pendingItems.map((item) => p(`• ${item}`)).join("\n    ")
      : p("Nenhum");

  const riskParas =
    data.riskFlags.length > 0
      ? data.riskFlags.map((flag) => p(`• ${flag}`)).join("\n    ")
      : p("Nenhum");

  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${p("Relatório de Intake — Contrato de Locação", true)}
    ${p("")}
    ${p("Identificação", true)}
    <w:tbl>
      <w:tblPr>
        <w:tblStyle w:val="TableGrid"/>
        <w:tblW w:w="9360" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
          <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
          <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
        </w:tblBorders>
      </w:tblPr>
      ${tableRow("Caso", data.caseId)}
      ${tableRow("Run ID", data.runId)}
      ${tableRow("Tipo de Documento", data.documentKind)}
      ${tableRow("Stage", data.stage)}
      ${tableRow("Status", data.status)}
      ${tableRow("Próximo Passo", data.nextStep ?? "—")}
      ${tableRow("PII", "Mascarado")}
    </w:tbl>
    ${p("")}
    ${p("Itens Pendentes", true)}
    ${pendingParas}
    ${p("")}
    ${p("Alertas de Risco", true)}
    ${riskParas}
    ${p("")}
    ${p(`Hash do documento: ${data.documentHash}`)}
    ${p(`Export hash (SHA-256): ${data.exportHash}`)}
    ${p(`Gerado em: ${data.generatedAt}`)}
    <w:sectPr/>
  </w:body>
</w:document>`;

  zip.folder("word")!.file("document.xml", docXml);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }) as Promise<Buffer>;
}
