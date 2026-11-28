// Cenário D — validação estrutural pura (sem banco) dos contratos de
// análise/recomendação: generationConfig, attemptOperationKey, tamanho e
// hash do resultado preservado, e validação de candidato/referências.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateObjective, validateAdditionalContext, OBJECTIVE_MAX_BYTES, ADDITIONAL_CONTEXT_MAX_BYTES,
  analysisRequestIdentityMatches, RadarAnalysisRequestError,
} from "../radarAnalysisRequestContract";
import {
  resolveGenerationConfig, parseGenerationConfig, GENERATION_CONFIG_CONTRACT_VERSION,
  RADAR_TEST_MODEL, REQUESTED_MAX_TOKENS_DEFAULT, REQUESTED_MAX_TOKENS_MAX,
  preparePreservedResult, measurePreservedResultBytes, computePreservedResultHash,
  PRESERVED_RESULT_MAX_BYTES, RadarAnalysisAttemptError,
} from "../radarAnalysisAttemptContract";
import {
  validateRecommendationCandidate, verifyReferencesAgainstSources, RadarRecommendationError,
} from "../radarRecommendationContract";
import { defaultGenerationConfigInput, defaultRecommendationCandidate } from "./helpers";

test("objective: preserva exatamente, rejeita vazio/whitespace, mede em bytes UTF-8", () => {
  assert.equal(validateObjective("Investigar expansão da empresa"), "Investigar expansão da empresa");
  assert.throws(() => validateObjective(""), RadarAnalysisRequestError);
  assert.throws(() => validateObjective("   "), RadarAnalysisRequestError);
  assert.equal(validateObjective("a".repeat(OBJECTIVE_MAX_BYTES)).length, OBJECTIVE_MAX_BYTES);
  assert.throws(() => validateObjective("a".repeat(OBJECTIVE_MAX_BYTES + 1)), RadarAnalysisRequestError);
});

test("additionalContext: ausência e null equivalentes; vazio rejeitado quando fornecido", () => {
  assert.equal(validateAdditionalContext(undefined), null);
  assert.equal(validateAdditionalContext(null), null);
  assert.throws(() => validateAdditionalContext(""), RadarAnalysisRequestError);
  const accepted = validateAdditionalContext("a".repeat(ADDITIONAL_CONTEXT_MAX_BYTES));
  assert.equal(accepted?.length, ADDITIONAL_CONTEXT_MAX_BYTES);
  assert.throws(() => validateAdditionalContext("a".repeat(ADDITIONAL_CONTEXT_MAX_BYTES + 1)), RadarAnalysisRequestError);
});

test("identidade da solicitação: divergência em qualquer campo é detectada", () => {
  const base = { entityId: "e1", materialId: "m1", objective: "obj", additionalContext: null, requestedByUserId: "u1" };
  assert.equal(analysisRequestIdentityMatches(base, { ...base }), true);
  assert.equal(analysisRequestIdentityMatches(base, { ...base, materialId: "m2" }), false);
  assert.equal(analysisRequestIdentityMatches(base, { ...base, objective: "outro" }), false);
});

test("generationConfig: rejeita chave desconhecida", () => {
  const input = defaultGenerationConfigInput() as Record<string, unknown>;
  input.extraField = "não deveria existir";
  assert.throws(() => resolveGenerationConfig(input as never), RadarAnalysisAttemptError);
});

test("generationConfig: rejeita requestedModel fora do catálogo suportado", () => {
  assert.throws(() => resolveGenerationConfig(defaultGenerationConfigInput({ requestedModel: "gpt-4" }) as never), RadarAnalysisAttemptError);
});

test("generationConfig: aceita radar-test-model-v1 e aplica default de requestedMaxTokens quando ausente/null", () => {
  const resolved = resolveGenerationConfig(defaultGenerationConfigInput() as never);
  assert.equal(resolved.requestedModel, RADAR_TEST_MODEL);
  assert.equal(resolved.requestedMaxTokens, REQUESTED_MAX_TOKENS_DEFAULT);
  assert.equal(resolved.contractVersion, GENERATION_CONFIG_CONTRACT_VERSION);

  const withNull = resolveGenerationConfig(defaultGenerationConfigInput({ requestedMaxTokens: null }) as never);
  assert.equal(withNull.requestedMaxTokens, REQUESTED_MAX_TOKENS_DEFAULT);
});

test("generationConfig: requestedMaxTokens fora de 1–2048 é rejeitado sem clamping", () => {
  assert.throws(() => resolveGenerationConfig(defaultGenerationConfigInput({ requestedMaxTokens: 0 }) as never), RadarAnalysisAttemptError);
  assert.throws(() => resolveGenerationConfig(defaultGenerationConfigInput({ requestedMaxTokens: REQUESTED_MAX_TOKENS_MAX + 1 }) as never), RadarAnalysisAttemptError);
  assert.throws(() => resolveGenerationConfig(defaultGenerationConfigInput({ requestedMaxTokens: 1.5 }) as never), RadarAnalysisAttemptError);
});

test("generationConfig: round-trip resolve -> parse preserva os valores", () => {
  const resolved = resolveGenerationConfig(defaultGenerationConfigInput({ requestedMaxTokens: 500 }) as never);
  const parsed = parseGenerationConfig(JSON.parse(JSON.stringify(resolved)));
  assert.deepEqual(parsed, resolved);
});

test("resultado preservado: tamanho medido em bytes UTF-8 sobre a forma serializada, não reordenada", () => {
  const small = { a: 1, b: "x" };
  const bytes = measurePreservedResultBytes(small);
  assert.equal(bytes, Buffer.byteLength(JSON.stringify(small), "utf8"));
});

test("resultado preservado: exatamente no limite é aceito; um byte a mais é rejeitado", () => {
  // Fixture de fronteira: preenche "padding" até o objeto serializado medir
  // exatamente PRESERVED_RESULT_MAX_BYTES.
  const base = { padding: "" };
  const overheadBytes = Buffer.byteLength(JSON.stringify(base), "utf8");
  const padded = { padding: "a".repeat(PRESERVED_RESULT_MAX_BYTES - overheadBytes) };
  assert.equal(measurePreservedResultBytes(padded), PRESERVED_RESULT_MAX_BYTES);
  const prepared = preparePreservedResult(padded);
  assert.equal(prepared.sizeBytes, PRESERVED_RESULT_MAX_BYTES);

  const tooLarge = { padding: padded.padding + "a" };
  assert.equal(measurePreservedResultBytes(tooLarge), PRESERVED_RESULT_MAX_BYTES + 1);
  assert.throws(() => preparePreservedResult(tooLarge), (e: unknown) => e instanceof RadarAnalysisAttemptError && e.reasonCode === "preserved_result_exceeds_size_limit");
});

test("resultado preservado: conteúdo multibyte é medido em bytes UTF-8, não em caracteres", () => {
  const ascii = { text: "a".repeat(100) };
  const multibyte = { text: "á".repeat(100) };
  const asciiBytes = measurePreservedResultBytes(ascii);
  const multibyteBytes = measurePreservedResultBytes(multibyte);
  assert.equal(multibyteBytes - asciiBytes, 100); // "á" = 2 bytes UTF-8 vs 1 byte ASCII
});

test("resultado preservado: hash é estável independente da ordem de inserção de chaves (chaves ordenadas só para o hash)", () => {
  const a = { b: 2, a: 1 };
  const b = { a: 1, b: 2 };
  assert.equal(computePreservedResultHash(a), computePreservedResultHash(b));
  // Mas a MEDIÇÃO de tamanho não reordena — as duas formas serializam diferente
  // em ordem de chaves (não testamos igualdade de bytes aqui, só que o hash
  // ignora essa diferença enquanto o conteúdo semântico é o mesmo).
});

test("candidato de recomendação: válido para actionable exige suggestedAction", () => {
  const candidate = validateRecommendationCandidate(defaultRecommendationCandidate());
  assert.equal(candidate.recommendationType, "actionable");
  assert.equal(candidate.statements.length, 1);
  assert.throws(
    () => validateRecommendationCandidate(defaultRecommendationCandidate({ suggestedAction: undefined })),
    RadarRecommendationError
  );
});

test("candidato de recomendação: insufficient_evidence exige insufficientEvidenceReason; do_not_act exige doNotActReason", () => {
  assert.throws(
    () => validateRecommendationCandidate(defaultRecommendationCandidate({ recommendationType: "insufficient_evidence", suggestedAction: undefined })),
    RadarRecommendationError
  );
  const insufficient = validateRecommendationCandidate(
    defaultRecommendationCandidate({ recommendationType: "insufficient_evidence", suggestedAction: undefined, insufficientEvidenceReason: "Sem fato concreto." })
  );
  assert.equal(insufficient.recommendationType, "insufficient_evidence");

  const doNotAct = validateRecommendationCandidate(
    defaultRecommendationCandidate({ recommendationType: "do_not_act", suggestedAction: undefined, doNotActReason: "Risco não mitigável." })
  );
  assert.equal(doNotAct.recommendationType, "do_not_act");
});

test("candidato de recomendação: referenceIds inexistente em references[] é rejeitado", () => {
  const bad = defaultRecommendationCandidate({
    statements: [{ content: "x", natureza: "FACT_IN_MATERIAL", referenceIds: ["ref-inexistente"] }],
  });
  assert.throws(() => validateRecommendationCandidate(bad), RadarRecommendationError);
});

test("candidato de recomendação: natureza e confidenceLevel são dimensões independentes", () => {
  const candidate = validateRecommendationCandidate(
    defaultRecommendationCandidate({
      statements: [{ content: "x", natureza: "INFERENCE", referenceIds: ["ref-1"], confidenceLevel: "low" }],
    })
  );
  assert.equal(candidate.statements[0]!.natureza, "INFERENCE");
  assert.equal(candidate.statements[0]!.confidenceLevel, "low");
});

test("referências: quote existente no material é aceita; quote inexistente é rejeitada, sem expor a fonte no erro", () => {
  const sources = ["A empresa anunciou abertura de filial em Recife ainda este ano."];
  assert.doesNotThrow(() => verifyReferencesAgainstSources([{ id: "ref-1", quote: "abertura de filial em Recife" }], sources));
  assert.throws(
    () => verifyReferencesAgainstSources([{ id: "ref-2", quote: "vamos abrir 5 novas filiais" }], sources),
    (e: unknown) => {
      if (!(e instanceof RadarRecommendationError)) return false;
      assert.equal(e.reasonCode, "reference_not_verifiable");
      assert.equal(e.context.referenceId, "ref-2");
      return true;
    }
  );
});
