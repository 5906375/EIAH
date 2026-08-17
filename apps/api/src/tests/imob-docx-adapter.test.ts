import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { extractTextFromDocxBuffer } from "../services/imob/intake/imobDocxAdapter";

// Repository-owned synthetic fixture — stable across mammoth package layouts.
const DOCX_FIXTURE = new URL("./fixtures/imob/minimal-lease-contract.docx", import.meta.url);

test("T-DOCX-1: buffer .docx válido retorna ok=true e text não-vazio", async () => {
  const buffer = readFileSync(DOCX_FIXTURE);
  const result = await extractTextFromDocxBuffer(buffer);
  assert.equal(result.ok, true);
  assert.ok(result.text.length > 0, "text deve ser não-vazio");
});

test("T-DOCX-2: buffer inválido (random bytes) retorna ok=false", async () => {
  const buffer = Buffer.from("not a docx file at all — invalid zip header");
  const result = await extractTextFromDocxBuffer(buffer);
  assert.equal(result.ok, false);
  assert.ok(result.messages.length > 0, "deve ter mensagem de erro");
});

test("T-DOCX-3: buffer vazio retorna ok=false", async () => {
  const buffer = Buffer.alloc(0);
  const result = await extractTextFromDocxBuffer(buffer);
  assert.equal(result.ok, false);
});

test("T-DOCX-4: resultado tem shape correto (ok, text, messages)", async () => {
  const buffer = readFileSync(DOCX_FIXTURE);
  const result = await extractTextFromDocxBuffer(buffer);
  assert.ok("ok" in result);
  assert.ok("text" in result);
  assert.ok("messages" in result);
  assert.ok(Array.isArray(result.messages));
});

test("T-DOCX-5: fixture .docx imobiliária retorna shape estável", async () => {
  const buffer = readFileSync(DOCX_FIXTURE);
  const result = await extractTextFromDocxBuffer(buffer);
  // The adapter contract remains stable for the repository-owned fixture.
  assert.equal(typeof result.ok, "boolean");
  assert.equal(typeof result.text, "string");
});

test("T-DOCX-6: extração não lança exceção em qualquer input Buffer", async () => {
  // Garante que a função nunca rejeita — sempre resolve com ok=false em erro
  const inputs = [
    Buffer.from("garbage"),
    Buffer.from([0x50, 0x4b]), // PK header mas truncado
    Buffer.alloc(100, 0x00),
  ];
  for (const buf of inputs) {
    await assert.doesNotReject(extractTextFromDocxBuffer(buf));
  }
});
