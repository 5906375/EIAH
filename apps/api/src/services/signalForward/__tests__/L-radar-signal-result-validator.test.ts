// Cenário L — validador estrutural de RadarSignalResultV1 (D5-B), unitário
// puro: sem banco, sem rede, sem relógio real (instante de validação sempre
// injetado). Cobre o contrato ratificado em CONSULTATION_ORIGIN_AUTHZ_v2.md
// seção 9. Não testa resolução/autorização do sujeito nem classificação
// semântica do produtor — isso é, deliberadamente, fora do que o parser faz.
import test from "node:test";
import assert from "node:assert/strict";
import {
  validateRadarSignalResult,
  RADAR_SIGNAL_RESULT_CONTRACT_VERSION,
  RADAR_SIGNAL_TYPES,
} from "../radarSignalResultValidator";
import { SignalForwardOriginError } from "../originContract";

const NOW = new Date("2026-09-08T12:00:00Z");

function minimalValid(overrides: Record<string, unknown> = {}) {
  return {
    contractVersion: RADAR_SIGNAL_RESULT_CONTRACT_VERSION,
    signalType: "lead_intent_signal",
    subject: { subjectType: "internal_reference", subjectId: "lead-fic-l-0001" },
    title: "Lead solicitou contato comercial",
    summary: "O lead preencheu o formulario de contato solicitando retorno comercial no site.",
    detectedAt: "2026-09-08T11:00:00Z",
    confidenceLevel: "medium",
    ...overrides,
  };
}

function assertRejects(payload: unknown, reasonCode: string, contextCheck?: (ctx: Record<string, unknown>) => boolean) {
  assert.throws(
    () => validateRadarSignalResult(payload, { now: NOW }),
    (err: unknown) => {
      if (!(err instanceof SignalForwardOriginError)) return false;
      if (err.reasonCode !== reasonCode) return false;
      if (contextCheck && !contextCheck(err.context)) return false;
      return true;
    }
  );
}

// --- Cobertura dos quatro signalType estruturalmente válidos -------------

for (const signalType of RADAR_SIGNAL_TYPES) {
  test(`signalType "${signalType}" estruturalmente válido é aceito`, () => {
    const result = validateRadarSignalResult(minimalValid({ signalType }), { now: NOW });
    assert.equal(result.signalType, signalType);
  });
}

test("signalType desconhecido é rejeitado", () => {
  assertRejects(minimalValid({ signalType: "market_trend_signal" }), "radar_signal_type_unknown");
});

// --- Objeto raiz e contractVersion ----------------------------------------

test("payload que não é objeto (array) é rejeitado antes de qualquer leitura de campo", () => {
  assertRejects([], "radar_signal_payload_not_object");
});

test("payload que não é objeto (null) é rejeitado", () => {
  assertRejects(null, "radar_signal_payload_not_object");
});

test("payload que não é objeto (string) é rejeitado", () => {
  assertRejects("not-an-object", "radar_signal_payload_not_object");
});

test("contractVersion ausente é rejeitado", () => {
  const { contractVersion, ...rest } = minimalValid();
  assertRejects(rest, "radar_signal_field_missing", (ctx) => ctx.field === "contractVersion");
});

test("contractVersion diferente do exato é rejeitado", () => {
  assertRejects(minimalValid({ contractVersion: "radar-signal-result.v2" }), "radar_signal_contract_version_invalid");
});

// --- Campos obrigatórios, null, tipos, desconhecidos ----------------------

test("campo obrigatório ausente no nível raiz (title)", () => {
  const { title, ...rest } = minimalValid();
  assertRejects(rest, "radar_signal_field_missing", (ctx) => ctx.field === "title");
});

test("campo com null explícito é rejeitado (summary)", () => {
  assertRejects(minimalValid({ summary: null }), "radar_signal_field_invalid", (ctx) => ctx.field === "summary" && ctx.reason === "null_not_allowed");
});

test("tipo incorreto é rejeitado antes de qualquer leitura de subcampo (subject como string)", () => {
  assertRejects(minimalValid({ subject: "not-an-object" }), "radar_signal_field_invalid", (ctx) => ctx.field === "subject" && ctx.reason === "wrong_type");
});

test("campo desconhecido no nível raiz é rejeitado", () => {
  assertRejects(minimalValid({ producerAgentKey: "radar" }), "radar_signal_unknown_field", (ctx) => ctx.field === "producerAgentKey");
});

test("campo desconhecido aninhado (subject) é rejeitado, com caminho completo", () => {
  assertRejects(
    minimalValid({ subject: { subjectType: "internal_reference", subjectId: "x", extra: 1 } }),
    "radar_signal_unknown_field",
    (ctx) => ctx.field === "subject.extra"
  );
});

test("campo obrigatório ausente aninhado (subject.subjectId)", () => {
  assertRejects(
    minimalValid({ subject: { subjectType: "internal_reference" } }),
    "radar_signal_field_missing",
    (ctx) => ctx.field === "subject.subjectId"
  );
});

// --- Arrays vazios e limites de quantidade --------------------------------

test("evidence vazio (array com zero itens) é rejeitado", () => {
  assertRejects(minimalValid({ evidence: [] }), "radar_signal_field_invalid", (ctx) => ctx.field === "evidence" && ctx.reason === "empty_array_not_allowed");
});

test("evidence com mais de 5 itens é rejeitado", () => {
  const evidence = Array.from({ length: 6 }, (_, i) => ({ description: `item ${i}` }));
  assertRejects(minimalValid({ evidence }), "radar_signal_field_invalid", (ctx) => ctx.field === "evidence" && ctx.reason === "above_maximum_items");
});

test("externalContent presente sem items é rejeitado (obrigatório no objeto)", () => {
  assertRejects(minimalValid({ externalContent: {} }), "radar_signal_field_missing", (ctx) => ctx.field === "externalContent.items");
});

// --- confidenceLevel "high" e evidence -------------------------------------

test("confidenceLevel high COM evidence é aceito", () => {
  const result = validateRadarSignalResult(
    minimalValid({ confidenceLevel: "high", evidence: [{ description: "evidência estruturada suficiente" }] }),
    { now: NOW }
  );
  assert.equal(result.confidenceLevel, "high");
});

test("confidenceLevel high SEM evidence é rejeitado", () => {
  assertRejects(minimalValid({ confidenceLevel: "high" }), "radar_signal_field_missing", (ctx) => ctx.field === "evidence" && ctx.reason === "required_when_confidence_high");
});

test("confidenceLevel fora do enum é rejeitado", () => {
  assertRejects(minimalValid({ confidenceLevel: "certain" }), "radar_signal_field_invalid", (ctx) => ctx.field === "confidenceLevel" && ctx.reason === "unknown_enum_value");
});

// --- IDs duplicados e referências ------------------------------------------

test("externalContent.items com id duplicado é rejeitado", () => {
  const payload = minimalValid({
    externalContent: {
      items: [
        { id: "dup", rawExcerpt: "trecho 1", capturedAt: "2026-09-08T10:00:00Z" },
        { id: "dup", rawExcerpt: "trecho 2", capturedAt: "2026-09-08T10:01:00Z" },
      ],
    },
  });
  assertRejects(payload, "radar_external_content_duplicate_id", (ctx) => ctx.id === "dup");
});

test("evidence[].externalContentRef que não existe em externalContent.items é rejeitado", () => {
  const payload = minimalValid({ evidence: [{ description: "evidência", externalContentRef: "ev-99" }] });
  assertRejects(payload, "radar_evidence_reference_not_found", (ctx) => ctx.ref === "ev-99" && ctx.evidenceIndex === 0);
});

test("externalContent sem nenhuma referência de evidence é aceito (item de contexto avulso)", () => {
  const payload = minimalValid({
    externalContent: { items: [{ id: "ctx-1", rawExcerpt: "contexto avulso", capturedAt: "2026-09-08T10:00:00Z" }] },
  });
  const result = validateRadarSignalResult(payload, { now: NOW });
  assert.equal(result.externalContent?.items.length, 1);
});

test("múltiplas evidence podem referenciar o MESMO item externo", () => {
  const payload = minimalValid({
    evidence: [
      { description: "primeira evidência", externalContentRef: "ev-1" },
      { description: "segunda evidência, mesmo item externo", externalContentRef: "ev-1" },
    ],
    externalContent: { items: [{ id: "ev-1", rawExcerpt: "trecho compartilhado", capturedAt: "2026-09-08T10:00:00Z" }] },
  });
  const result = validateRadarSignalResult(payload, { now: NOW });
  assert.equal(result.evidence?.length, 2);
});

// --- Fronteiras de texto e Unicode ------------------------------------------

test("summary com 19 code points (abaixo do mínimo de 20) é rejeitado", () => {
  assertRejects(minimalValid({ summary: "a".repeat(19) }), "radar_signal_field_invalid", (ctx) => ctx.field === "summary" && ctx.reason === "below_minimum_length");
});

test("summary com exatamente 20 code points é aceito (fronteira inferior)", () => {
  const result = validateRadarSignalResult(minimalValid({ summary: "a".repeat(20) }), { now: NOW });
  assert.equal(result.summary, "a".repeat(20));
});

test("summary com 1001 code points (acima do máximo de 1000) é rejeitado", () => {
  assertRejects(minimalValid({ summary: "a".repeat(1001) }), "radar_signal_field_invalid", (ctx) => ctx.field === "summary" && ctx.reason === "above_maximum_length");
});

test("summary com exatamente 1000 code points é aceito (fronteira superior)", () => {
  validateRadarSignalResult(minimalValid({ summary: "a".repeat(1000) }), { now: NOW });
});

test("summary só com espaços é rejeitado mesmo respeitando o comprimento mínimo", () => {
  assertRejects(minimalValid({ summary: " ".repeat(25) }), "radar_signal_field_invalid", (ctx) => ctx.field === "summary" && ctx.reason === "empty_or_whitespace");
});

test("Unicode multibyte válido (emoji) em summary é contado em code points, não em bytes/UTF-16", () => {
  // "🚀" é 1 code point (Array.from), mas 2 code units UTF-16 e 4 bytes UTF-8.
  const summary = "🚀".repeat(20) + " completando vinte code points de emoji e texto.";
  const result = validateRadarSignalResult(minimalValid({ summary }), { now: NOW });
  assert.equal(result.summary, summary);
});

test("caractere de controle (NUL) em title é rejeitado", () => {
  assertRejects(minimalValid({ title: "Lead com nulo" }), "radar_signal_field_invalid", (ctx) => ctx.field === "title" && ctx.reason === "control_character_not_allowed");
});

test("'\\n' em summary é permitido (exceção explícita)", () => {
  const result = validateRadarSignalResult(minimalValid({ summary: "Primeira linha do resumo.\nSegunda linha do resumo." }), { now: NOW });
  assert.ok(result.summary.includes("\n"));
});

test("'\\n' em title NÃO é permitido (exceção é só para summary/rawExcerpt)", () => {
  assertRejects(minimalValid({ title: "Titulo com\nquebra" }), "radar_signal_field_invalid", (ctx) => ctx.field === "title" && ctx.reason === "control_character_not_allowed");
});

test("surrogate UTF-16 desemparelhado é rejeitado", () => {
  const lonelyHighSurrogate = "titulo com surrogate solto: \uD800 fim";
  assertRejects(minimalValid({ title: lonelyHighSurrogate }), "radar_signal_field_invalid", (ctx) => ctx.field === "title" && ctx.reason === "unpaired_surrogate");
});

// --- sourceUrl ---------------------------------------------------------------

function withExternalContent(sourceUrl: string) {
  return minimalValid({
    externalContent: { items: [{ id: "ev-1", sourceUrl, rawExcerpt: "trecho", capturedAt: "2026-09-08T10:00:00Z" }] },
  });
}

test("sourceUrl https absoluta e válida é aceita", () => {
  const result = validateRadarSignalResult(withExternalContent("https://exemplo.tenant.com/log/1"), { now: NOW });
  assert.equal(result.externalContent?.items[0]?.sourceUrl, "https://exemplo.tenant.com/log/1");
});

test("sourceUrl http (protocolo não permitido) é rejeitada", () => {
  assertRejects(withExternalContent("http://exemplo.tenant.com/log/1"), "radar_signal_field_invalid", (ctx) => String(ctx.field).endsWith("sourceUrl") && ctx.reason === "protocol_not_https");
});

test("sourceUrl com espaço literal não codificado é rejeitada", () => {
  assertRejects(withExternalContent("https://exemplo.tenant.com/log 1"), "radar_signal_field_invalid", (ctx) => ctx.reason === "unencoded_space");
});

test("sourceUrl com credenciais embutidas é rejeitada", () => {
  assertRejects(withExternalContent("https://user:pass@exemplo.tenant.com/log/1"), "radar_signal_field_invalid", (ctx) => ctx.reason === "embedded_credentials");
});

test("sourceUrl relativa é rejeitada", () => {
  assertRejects(withExternalContent("/log/1"), "radar_signal_field_invalid", (ctx) => ctx.reason === "malformed_or_relative_url");
});

test("sourceUrl acima de 500 code points é rejeitada", () => {
  const tooLong = "https://exemplo.tenant.com/" + "x".repeat(500);
  assertRejects(withExternalContent(tooLong), "radar_signal_field_invalid", (ctx) => ctx.reason === "above_maximum_length");
});

// --- Datas: calendário, fuso, precisão, tolerância --------------------------

test("data com dia inexistente (2026-02-30) é rejeitada", () => {
  assertRejects(minimalValid({ detectedAt: "2026-02-30T10:00:00Z" }), "radar_signal_field_invalid", (ctx) => ctx.field === "detectedAt" && ctx.reason === "invalid_rfc3339_or_calendar");
});

test("data com mês inexistente (2026-13-01) é rejeitada", () => {
  assertRejects(minimalValid({ detectedAt: "2026-13-01T10:00:00Z" }), "radar_signal_field_invalid", (ctx) => ctx.reason === "invalid_rfc3339_or_calendar");
});

test("data sem indicação de fuso é rejeitada", () => {
  assertRejects(minimalValid({ detectedAt: "2026-09-08T10:00:00" }), "radar_signal_field_invalid", (ctx) => ctx.reason === "invalid_rfc3339_or_calendar");
});

test("data com offset explícito (não Z) é aceita", () => {
  validateRadarSignalResult(minimalValid({ detectedAt: "2026-09-08T07:00:00-03:00" }), { now: NOW });
});

test("data com fração de segundo até 3 dígitos é aceita", () => {
  validateRadarSignalResult(minimalValid({ detectedAt: "2026-09-08T10:00:00.123Z" }), { now: NOW });
});

test("detectedAt exatamente 5 minutos no futuro (relógio controlado) é aceito", () => {
  validateRadarSignalResult(minimalValid({ detectedAt: "2026-09-08T12:05:00Z" }), { now: NOW });
});

test("detectedAt 5 minutos e 1 segundo no futuro (relógio controlado) é rejeitado", () => {
  assertRejects(minimalValid({ detectedAt: "2026-09-08T12:05:01Z" }), "radar_signal_field_invalid", (ctx) => ctx.field === "detectedAt" && ctx.reason === "too_far_in_future");
});

test("capturedAt posterior a detectedAt é rejeitado", () => {
  const payload = minimalValid({
    detectedAt: "2026-09-08T10:00:00Z",
    externalContent: { items: [{ id: "ev-1", rawExcerpt: "trecho", capturedAt: "2026-09-08T10:00:01Z" }] },
  });
  assertRejects(payload, "radar_captured_at_after_detected_at", (ctx) => ctx.itemId === "ev-1");
});

test("capturedAt igual a detectedAt é aceito (não posterior)", () => {
  const payload = minimalValid({
    detectedAt: "2026-09-08T10:00:00Z",
    externalContent: { items: [{ id: "ev-1", rawExcerpt: "trecho", capturedAt: "2026-09-08T10:00:00Z" }] },
  });
  validateRadarSignalResult(payload, { now: NOW });
});

// --- Etapa estrutural vs. relacional: regressão da Rodada 7 -----------------
//
// `capturedAt <= detectedAt` (9.5, passo 4d) e a unicidade de
// `externalContent.items[].id` (9.5, passo 4c) são regras RELACIONAIS —
// só avaliadas depois que TODO o payload já passou pela etapa estrutural
// (passo 3) inteira. Uma violação relacional num item anterior nunca pode
// se antecipar a uma violação estrutural genuína de um item posterior ainda
// não percorrido. Os quatro testes abaixo falhavam antes da correção desta
// rodada (relatavam o reasonCode relacional do item anterior, nunca
// alcançando o erro estrutural do item posterior).

test("capturedAt posterior a detectedAt em item[0] NÃO antecipa erro estrutural de item[1] (rawExcerpt ausente)", () => {
  const payload = minimalValid({
    detectedAt: "2026-09-08T10:00:00Z",
    externalContent: {
      items: [
        { id: "ev-1", rawExcerpt: "trecho valido", capturedAt: "2026-09-08T10:00:01Z" }, // relacional: posterior a detectedAt
        { id: "ev-2", capturedAt: "2026-09-08T09:00:00Z" }, // estrutural: rawExcerpt ausente
      ],
    },
  });
  assertRejects(payload, "radar_signal_field_missing", (ctx) => ctx.field === "externalContent.items[1].rawExcerpt");
});

test("IDs duplicados em itens iniciais NÃO antecipam erro estrutural de item posterior (não só entre a 1ª e a 2ª ocorrência)", () => {
  const payload = minimalValid({
    externalContent: {
      items: [
        { id: "dup", rawExcerpt: "trecho 1", capturedAt: "2026-09-08T09:00:00Z" }, // relacional: 1ª ocorrência de "dup"
        { id: "dup", rawExcerpt: "trecho 2", capturedAt: "2026-09-08T09:00:00Z" }, // relacional: 2ª ocorrência, duplicata já resolvida aqui
        { id: "ev-3", capturedAt: "2026-09-08T09:00:00Z" }, // estrutural: rawExcerpt ausente, item POSTERIOR à duplicata já detectada
      ],
    },
  });
  assertRejects(payload, "radar_signal_field_missing", (ctx) => ctx.field === "externalContent.items[2].rawExcerpt");
});

test("payload estruturalmente correto com capturedAt posterior continua retornando seu próprio reasonCode", () => {
  const payload = minimalValid({
    detectedAt: "2026-09-08T10:00:00Z",
    externalContent: {
      items: [{ id: "ev-1", rawExcerpt: "trecho", capturedAt: "2026-09-08T10:00:01Z" }],
    },
  });
  assertRejects(payload, "radar_captured_at_after_detected_at", (ctx) => ctx.itemId === "ev-1");
});

test("payload estruturalmente correto com IDs duplicados continua retornando seu próprio reasonCode", () => {
  const payload = minimalValid({
    externalContent: {
      items: [
        { id: "dup", rawExcerpt: "t1", capturedAt: "2026-09-08T09:00:00Z" },
        { id: "dup", rawExcerpt: "t2", capturedAt: "2026-09-08T09:00:00Z" },
      ],
    },
  });
  assertRejects(payload, "radar_external_content_duplicate_id", (ctx) => ctx.id === "dup");
});

test("múltiplas violações relacionais: referência de evidence não encontrada (4b) precede duplicidade de id (4c)", () => {
  const payload = minimalValid({
    confidenceLevel: "high",
    evidence: [{ description: "evidencia estruturada", externalContentRef: "ref-inexistente" }],
    externalContent: {
      items: [
        { id: "dup", rawExcerpt: "t1", capturedAt: "2026-09-08T09:00:00Z" },
        { id: "dup", rawExcerpt: "t2", capturedAt: "2026-09-08T09:00:00Z" },
      ],
    },
  });
  assertRejects(payload, "radar_evidence_reference_not_found", (ctx) => ctx.ref === "ref-inexistente");
});

test("múltiplas violações relacionais: duplicidade de id (4c) precede capturedAt posterior (4d)", () => {
  const payload = minimalValid({
    detectedAt: "2026-09-08T10:00:00Z",
    externalContent: {
      items: [
        { id: "dup", rawExcerpt: "t1", capturedAt: "2026-09-08T10:00:01Z" }, // também posterior a detectedAt (4d)
        { id: "dup", rawExcerpt: "t2", capturedAt: "2026-09-08T09:00:00Z" }, // duplicata (4c) — deve vencer
      ],
    },
  });
  assertRejects(payload, "radar_external_content_duplicate_id", (ctx) => ctx.id === "dup");
});

// --- Seleção determinística de erro -----------------------------------------

test("payload com múltiplas violações relata sempre a mesma (primeira, pela ordem fixa), independente da ordem de inserção das chaves", () => {
  // title ausente (primeiro na ordem fixa) E summary abaixo do mínimo
  // (depois, na ordem fixa) coexistem — o erro relatado deve ser sempre o de
  // `title`, nunca o de `summary`, em qualquer ordem de chaves do objeto de
  // entrada (JS preserva ordem de inserção, não a ordem de declaração do
  // contrato).
  const { title, ...withoutTitle } = minimalValid({ summary: "curto demais" });
  const orderedOneWay = { ...withoutTitle };
  const orderedOtherWay = Object.fromEntries(Object.entries(withoutTitle).reverse());

  for (const payload of [orderedOneWay, orderedOtherWay]) {
    assertRejects(payload, "radar_signal_field_missing", (ctx) => ctx.field === "title");
  }
});

// --- Teto agregado (fixture reproduzível, seção 9.15 corrigida) -------------

const FIXTURE_URL_PREFIX = "https://exemplo-fic.tenant.com/";

function buildSizeFixture(charUnit: string) {
  assert.equal(FIXTURE_URL_PREFIX.length, 31, "prefixo da fixture deve ter exatamente 31 caracteres");
  const sourceUrlPadding = "x".repeat(469);
  assert.equal(FIXTURE_URL_PREFIX.length + sourceUrlPadding.length, 500);

  return {
    contractVersion: RADAR_SIGNAL_RESULT_CONTRACT_VERSION,
    signalType: "content_engagement_signal",
    subject: { subjectType: "internal_reference", subjectId: "fixture-subject-0001" },
    title: charUnit.repeat(120),
    summary: charUnit.repeat(1000),
    detectedAt: "2026-09-08T12:00:00Z",
    confidenceLevel: "high",
    evidence: Array.from({ length: 5 }, (_, i) => ({
      description: charUnit.repeat(300),
      externalContentRef: `ext-${i + 1}`,
    })),
    opportunity: { summary: charUnit.repeat(300), suggestedAction: charUnit.repeat(200) },
    externalContent: {
      items: Array.from({ length: 5 }, (_, i) => ({
        id: `ext-${i + 1}`,
        sourceUrl: FIXTURE_URL_PREFIX + sourceUrlPadding,
        rawExcerpt: charUnit.repeat(800),
        capturedAt: "2026-09-08T11:59:00Z",
      })),
    },
  };
}

test("fixture: soma dos campos de texto variável é exatamente 7.120 code points", () => {
  const fixture = buildSizeFixture("a");
  const variableTextLength =
    fixture.title.length +
    fixture.summary.length +
    fixture.evidence.reduce((acc, item) => acc + item.description.length, 0) +
    fixture.opportunity.summary.length +
    fixture.opportunity.suggestedAction.length +
    fixture.externalContent.items.reduce((acc, item) => acc + item.rawExcerpt.length, 0);
  assert.equal(variableTextLength, 7120);
});

test("fixture ASCII fica abaixo do teto agregado de 16.384 bytes (medido, não estimado) e é válida", () => {
  const fixture = buildSizeFixture("a");
  const measuredSizeBytes = Buffer.byteLength(JSON.stringify(fixture), "utf8");
  assert.ok(measuredSizeBytes < 16384, `tamanho medido: ${measuredSizeBytes} bytes`);
  const result = validateRadarSignalResult(fixture, { now: NOW });
  assert.equal(result.contractVersion, RADAR_SIGNAL_RESULT_CONTRACT_VERSION);
});

test("fixture multibyte fica acima do teto agregado de 16.384 bytes (medido, não estimado), mesmo respeitando todo limite individual", () => {
  const fixture = buildSizeFixture("🚀");
  const measuredSizeBytes = Buffer.byteLength(JSON.stringify(fixture), "utf8");
  assert.ok(measuredSizeBytes > 16384, `tamanho medido: ${measuredSizeBytes} bytes`);
  assertRejects(fixture, "radar_payload_aggregate_size_exceeded", (ctx) => ctx.sizeBytes === measuredSizeBytes);
});

// --- Separação estrutural vs. resolução/autorização do sujeito --------------

test("subjectId fictício estruturalmente válido é aceito (o parser não resolve nem autoriza o sujeito)", () => {
  const result = validateRadarSignalResult(
    minimalValid({ subject: { subjectType: "internal_reference", subjectId: "lead-que-nao-existe-em-lugar-nenhum" } }),
    { now: NOW }
  );
  assert.equal(result.subject.subjectId, "lead-que-nao-existe-em-lugar-nenhum");
});

// --- Ausência de normalização/modificação -----------------------------------

test("o validador não modifica o payload e devolve a MESMA referência recebida", () => {
  const payload = minimalValid({ evidence: [{ description: "b" }, { description: "a" }] });
  const before = JSON.parse(JSON.stringify(payload));
  const result = validateRadarSignalResult(payload, { now: NOW });
  assert.equal(result, payload as unknown as typeof result, "mesma referência, não uma cópia");
  assert.deepEqual(payload, before, "payload de entrada não foi mutado");
});

test("ordem dos arrays é preservada na saída (evidence[] na mesma ordem recebida)", () => {
  const payload = minimalValid({ evidence: [{ description: "primeiro" }, { description: "segundo" }, { description: "terceiro" }] });
  const result = validateRadarSignalResult(payload, { now: NOW });
  assert.deepEqual(
    result.evidence?.map((e) => e.description),
    ["primeiro", "segundo", "terceiro"]
  );
});
