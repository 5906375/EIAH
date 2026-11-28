// Cenário P — suggestedPromptGenerator (D6): determinismo, preservação da
// entrada, ausência de chamadas externas. Puro, sem banco.
import test from "node:test";
import assert from "node:assert/strict";
import { generateSuggestedPrompt, SUGGESTED_PROMPT_RULE_VERSION } from "../suggestedPromptGenerator";
import type { RadarSignalResultV1 } from "../radarSignalResultValidator";

function fixedRadarSignal(): RadarSignalResultV1 {
  return {
    contractVersion: "radar-signal-result.v1",
    signalType: "lead_intent_signal",
    subject: { subjectType: "internal_reference", subjectId: "lead-fic-p-0001" },
    title: "Lead reengajou apos 30 dias de inatividade",
    summary: "O lead solicitou uma demonstracao pelo formulario de contato do site.",
    detectedAt: "2026-09-08T11:00:00Z",
    confidenceLevel: "medium",
    evidence: [{ description: "Abriu 3 e-mails de nutricao na ultima semana" }],
    opportunity: { summary: "Boa janela para reengajamento comercial", suggestedAction: "Agendar ligacao em 48h" },
  } as unknown as RadarSignalResultV1;
}

test("saída esperada: contém título, resumo, sujeito, evidência e oportunidade do sinal", () => {
  const prompt = generateSuggestedPrompt(fixedRadarSignal());
  assert.match(prompt, /Lead reengajou apos 30 dias de inatividade/);
  assert.match(prompt, /solicitou uma demonstracao/);
  assert.match(prompt, /lead-fic-p-0001/);
  assert.match(prompt, /Abriu 3 e-mails de nutricao/);
  assert.match(prompt, /Boa janela para reengajamento comercial/);
  assert.match(prompt, /Agendar ligacao em 48h/);
});

test("determinismo: mesma entrada produz sempre a mesma saída, em chamadas repetidas", () => {
  const signal = fixedRadarSignal();
  const a = generateSuggestedPrompt(signal);
  const b = generateSuggestedPrompt(signal);
  const c = generateSuggestedPrompt(fixedRadarSignal());
  assert.equal(a, b);
  assert.equal(a, c);
});

test("não modifica o objeto de entrada", () => {
  const signal = fixedRadarSignal();
  const before = JSON.parse(JSON.stringify(signal));
  generateSuggestedPrompt(signal);
  assert.deepEqual(signal, before);
});

test("sem evidence/opportunity: gera prompt válido sem essas seções", () => {
  const signal = fixedRadarSignal();
  delete (signal as any).evidence;
  delete (signal as any).opportunity;
  const prompt = generateSuggestedPrompt(signal);
  assert.match(prompt, /Lead reengajou apos 30 dias de inatividade/);
  assert.doesNotMatch(prompt, /Evidências reportadas/);
});

test("versão da regra é uma constante exportada, estável", () => {
  assert.equal(typeof SUGGESTED_PROMPT_RULE_VERSION, "string");
  assert.ok(SUGGESTED_PROMPT_RULE_VERSION.length > 0);
});
