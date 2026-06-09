import { readFile } from "node:fs/promises";
import zlib from "node:zlib";

export type ExtractedPdfSection = {
  page: number;
  title: string;
  excerpt: string;
};

export type ExtractedPdfPage = {
  page: number;
  text: string;
  lines: string[];
};

export type ExtractedPdfDocument = {
  document: string;
  pageCount: number;
  pages: ExtractedPdfPage[];
  sections: ExtractedPdfSection[];
  fullText: string;
};

type TextItem = {
  y: number;
  text: string;
};

function decodePdfLiteral(input: string) {
  let result = "";
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (char !== "\\") {
      result += char;
      continue;
    }
    const next = input[index + 1];
    if (!next) break;
    if (next === "n") {
      result += "\n";
      index += 1;
      continue;
    }
    if (next === "r") {
      result += "\r";
      index += 1;
      continue;
    }
    if (next === "t") {
      result += "\t";
      index += 1;
      continue;
    }
    if (next === "b") {
      result += "\b";
      index += 1;
      continue;
    }
    if (next === "f") {
      result += "\f";
      index += 1;
      continue;
    }
    if (/[0-7]/.test(next)) {
      const octal = input.slice(index + 1, index + 4).match(/^[0-7]{1,3}/)?.[0] ?? next;
      result += String.fromCharCode(Number.parseInt(octal, 8));
      index += octal.length;
      continue;
    }
    result += next;
    index += 1;
  }
  return result;
}

function extractPdfStringsFromArray(content: string) {
  const matches = content.match(/\((?:\\.|[^\\)])*\)/g) ?? [];
  return matches
    .map((entry) => decodePdfLiteral(entry.slice(1, -1)))
    .join("")
    .trim();
}

function extractPdfStringsFromStream(content: string) {
  const items: TextItem[] = [];
  let currentY = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const matrixMatch = line.match(
      /-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+Tm\b/
    );
    if (matrixMatch) {
      currentY = Number(matrixMatch[2] ?? currentY);
    }

    const literalMatches = Array.from(line.matchAll(/(\((?:\\.|[^\\)])*\)|\[[^\]]*\])\s*T[Jj]\b/g));
    for (const match of literalMatches) {
      const token = match[1] ?? "";
      const text = token.startsWith("[")
        ? extractPdfStringsFromArray(token)
        : decodePdfLiteral(token.slice(1, -1)).trim();
      if (text) items.push({ y: currentY, text });
    }
  }

  return items;
}

function groupTextLines(items: TextItem[]) {
  const sorted = items
    .map((item) => ({ ...item, text: item.text.replace(/\s+/g, " ").trim() }))
    .filter((item) => item.text.length > 0)
    .sort((a, b) => b.y - a.y);
  const lines: Array<{ y: number; text: string }> = [];
  for (const item of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - item.y) <= 2) {
      last.text = `${last.text} ${item.text}`.replace(/\s+/g, " ").trim();
      continue;
    }
    lines.push({ y: item.y, text: item.text });
  }
  return lines.map((line) => line.text);
}

function normalizeForHeading(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function isLikelyHeading(line: string) {
  const normalized = normalizeForHeading(line);
  if (/^\d+(\.\d+)*[.)]?\s+/.test(line)) return true;
  if (
    normalized.includes("natureza juridica") ||
    normalized.includes("criterios de concessao") ||
    normalized.includes("base de calculo") ||
    normalized.includes("reducoes") ||
    normalized.includes("vigencia") ||
    normalized.includes("lgpd") ||
    normalized.includes("conclusao") ||
    normalized.includes("ementa") ||
    normalized.includes("relatorio")
  ) {
    return true;
  }
  const letters = line.replace(/[^A-Za-zÀ-ÿ]/g, "");
  if (letters.length < 5 || line.length > 140) return false;
  const uppercaseChars = letters.split("").filter((char) => char === char.toUpperCase()).length;
  return uppercaseChars / letters.length >= 0.7;
}

function buildSections(pages: ExtractedPdfPage[]) {
  const sections: ExtractedPdfSection[] = [];
  for (const page of pages) {
    for (let index = 0; index < page.lines.length; index += 1) {
      const line = page.lines[index] ?? "";
      if (!isLikelyHeading(line)) continue;
      const excerpt = [page.lines[index + 1], page.lines[index + 2]].filter(Boolean).join(" ").slice(0, 280);
      sections.push({
        page: page.page,
        title: line,
        excerpt,
      });
    }
  }
  return sections;
}

function parsePdfObjects(rawLatin1: string) {
  const objects = new Map<number, string>();
  const objectPattern = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  for (const match of rawLatin1.matchAll(objectPattern)) {
    objects.set(Number(match[1]), match[2] ?? "");
  }
  return objects;
}

function extractPageContentRefs(objectBody: string) {
  const arrayMatch = objectBody.match(/\/Contents\s*\[(.*?)\]/s);
  if (arrayMatch?.[1]) {
    return Array.from(arrayMatch[1].matchAll(/(\d+)\s+0\s+R/g)).map((match) => Number(match[1]));
  }
  const singleMatch = objectBody.match(/\/Contents\s+(\d+)\s+0\s+R/);
  return singleMatch?.[1] ? [Number(singleMatch[1])] : [];
}

function decompressPdfStream(objectBody: string) {
  const streamMatch = objectBody.match(/stream\r?\n([\s\S]*?)\r?\nendstream/s);
  if (!streamMatch?.[1]) return null;
  const streamBuffer = Buffer.from(streamMatch[1], "latin1");
  const isFlate = /\/Filter\s*\/FlateDecode/.test(objectBody);
  try {
    return isFlate ? zlib.inflateSync(streamBuffer).toString("latin1") : streamBuffer.toString("latin1");
  } catch {
    return null;
  }
}

export function extractPdfDocumentEvidenceFromBuffer(buffer: Buffer, documentName: string): ExtractedPdfDocument {
  const rawLatin1 = buffer.toString("latin1");
  const objects = parsePdfObjects(rawLatin1);
  const pages: ExtractedPdfPage[] = [];

  for (const [objectId, body] of objects.entries()) {
    if (!/\/Type\s*\/Page\b/.test(body)) continue;
    const contentRefs = extractPageContentRefs(body);
    const textItems: TextItem[] = [];
    for (const ref of contentRefs) {
      const contentObject = objects.get(ref);
      if (!contentObject) continue;
      const streamContent = decompressPdfStream(contentObject);
      if (!streamContent) continue;
      textItems.push(...extractPdfStringsFromStream(streamContent));
    }
    if (textItems.length === 0) continue;
    const lines = groupTextLines(textItems);
    pages.push({
      page: pages.length + 1,
      lines,
      text: lines.join("\n"),
    });
  }

  const sections = buildSections(pages);
  return {
    document: documentName,
    pageCount: pages.length,
    pages,
    sections,
    fullText: pages.map((page) => page.text).join("\n\n"),
  };
}

export async function extractPdfDocumentEvidenceFromFile(absolutePath: string, documentName: string) {
  const buffer = await readFile(absolutePath);
  return extractPdfDocumentEvidenceFromBuffer(buffer, documentName);
}
