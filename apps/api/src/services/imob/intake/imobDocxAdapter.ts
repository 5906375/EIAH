// .docx → plain text adapter using mammoth.
// This is the only file in Phase 1A/1B that depends on mammoth.
// Unit tests for the extractor use plain text fixtures and do not import this module.

import mammoth from "mammoth";

export type DocxExtractionResult = {
  ok: boolean;
  text: string;
  messages: string[];
};

export async function extractTextFromDocxBuffer(buffer: Buffer): Promise<DocxExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    const messages = result.messages
      .filter((m) => m.type === "warning" || m.type === "error")
      .map((m) => m.message);
    return { ok: text.length > 0, text, messages };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Falha ao processar arquivo .docx";
    return { ok: false, text: "", messages: [message] };
  }
}
