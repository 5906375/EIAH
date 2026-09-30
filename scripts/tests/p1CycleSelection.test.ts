import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateSingleCycle,
  selectCycles,
  computeLastClosedWeekUtc,
} from "../lib/p1CycleSelection.js";
import {
  fixtureCycle,
  fixturePolicy,
  fixtureReceipt,
  referenceThreeCycles,
} from "./fixtures/p1ApeWeeklyCycleV3Fixtures.js";

const REEVAL = new Date("2026-10-12T15:00:00Z");

// ---------------------------------------------------------------------------
// computeLastClosedWeekUtc — pure week-boundary math, cross-checked against
// the values already confirmed live against the real service in this session.
// ---------------------------------------------------------------------------

test("computeLastClosedWeekUtc matches the real service's confirmed outputs", () => {
  assert.deepEqual(computeLastClosedWeekUtc(new Date("2026-10-04T12:00:00Z")), {
    from: "2026-09-21T00:00:00.000Z",
    to: "2026-09-28T00:00:00.000Z",
  });
  assert.deepEqual(computeLastClosedWeekUtc(new Date("2026-10-05T12:00:00Z")), {
    from: "2026-09-28T00:00:00.000Z",
    to: "2026-10-05T00:00:00.000Z",
  });
  assert.deepEqual(computeLastClosedWeekUtc(new Date("2026-10-12T12:00:00Z")), {
    from: "2026-10-05T00:00:00.000Z",
    to: "2026-10-12T00:00:00.000Z",
  });
});

// ---------------------------------------------------------------------------
// Reference happy path (MIN_CYCLES=3, MAX_AGE_DAYS=14).
// ---------------------------------------------------------------------------

test("conjunto válido sob política explícita (MIN_CYCLES=3, MAX_AGE_DAYS=14) selects and passes all checks", () => {
  const cycles = referenceThreeCycles();
  const policy = fixturePolicy();
  const selection = selectCycles(cycles, policy, REEVAL);

  assert.equal(selection.failureReasons.length, 0);
  assert.equal(selection.consecutive, true);
  assert.equal(selection.latestWindowIsLastClosed, true);
  assert.equal(selection.selectedCycleIds.length, 3);
  assert.ok(selection.considered.every((c) => c.included));

  for (const cycle of cycles) {
    const g = evaluateSingleCycle(cycle, policy, REEVAL);
    assert.equal(g.packageConsistency.status, "passed");
    assert.equal(g.metricsVerifiedAgainstSource.status, "not_demonstrated"); // always, in this entrega — never conflated with packageConsistency
    assert.equal(g.thresholds.status, "passed");
    assert.equal(g.recency.status, "passed");
    assert.equal(g.historyProvenance.status, "absent"); // no history supplied — never silently upgraded
  }
});

// ---------------------------------------------------------------------------
// Recência: vencida, futura, e fronteiras exatas.
// ---------------------------------------------------------------------------

test("evidência vencida falha recência (idade > MAX_AGE_DAYS)", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-09-01T00:00:00Z" });
  const g = evaluateSingleCycle(cycle, fixturePolicy(), REEVAL);
  assert.equal(g.recency.status, "failed");
  assert.ok(g.recency.failureReasons.includes("stale_evidence"));
});

test("evidência futura (generatedAt > checkerNow) é rejeitada", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-20T00:00:00Z" });
  const g = evaluateSingleCycle(cycle, fixturePolicy(), REEVAL);
  assert.equal(g.recency.status, "failed");
  assert.ok(g.recency.failureReasons.includes("future_generated_at"));
});

test("fronteira exata de recência: 14,000 dias passa, 14,001 dias falha (comparação estrita)", () => {
  const exactlyAtLimit = new Date(REEVAL.getTime() - 14 * 86400000).toISOString();
  const justOverLimit = new Date(REEVAL.getTime() - 14 * 86400000 - 1000).toISOString();

  const atLimit = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: exactlyAtLimit });
  const overLimit = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: justOverLimit });

  const policy = fixturePolicy();
  assert.equal(evaluateSingleCycle(atLimit, policy, REEVAL).recency.status, "passed");
  assert.equal(evaluateSingleCycle(overLimit, policy, REEVAL).recency.status, "failed");
});

test("Opção C (proposta): effectiveMaxAgeDays explícito substitui policy.maxAgeDays só para o ciclo chamado com ele", () => {
  const cycle21Old = fixtureCycle({
    windowFrom: "2026-09-21T00:00:00.000Z",
    windowTo: "2026-09-28T00:00:00.000Z",
    generatedAt: new Date(REEVAL.getTime() - 21 * 86400000).toISOString(),
  });
  const policy = fixturePolicy(); // maxAgeDays: 14 (vigente, inalterado)

  // Sem override explícito: usa policy.maxAgeDays (Opção A / comportamento de hoje) — falha aos 21 dias.
  assert.equal(evaluateSingleCycle(cycle21Old, policy, REEVAL).recency.status, "failed");
  assert.equal(evaluateSingleCycle(cycle21Old, policy, REEVAL).recency.appliedMaxAgeDays, 14);

  // Com override explícito de 21 dias (o chamador decide, por posição — não a política sozinha): passa.
  const withOverride = evaluateSingleCycle(cycle21Old, policy, REEVAL, 21);
  assert.equal(withOverride.recency.status, "passed");
  assert.equal(withOverride.recency.appliedMaxAgeDays, 21);
  // MAX_AGE_DAYS vigente (14) não foi alterado na política — só o limite efetivamente aplicado a ESTE ciclo mudou.
  assert.equal(policy.maxAgeDays, 14);
});

test("tolerância não estende a recência: fresh generatedAt não sobrevive a uma âncora de primeira geração vencida", () => {
  // Anti-gaming case (ADR-009 §14.4): the record's OWN generatedAt is fresh,
  // but its self-declared history reveals a first generation that is
  // already stale. The anchor — not the fresh current record — must govern.
  const staleFirstGeneration = "2026-08-01T00:00:00Z";
  const cycle = fixtureCycle({
    windowFrom: "2026-09-21T00:00:00.000Z",
    windowTo: "2026-09-28T00:00:00.000Z",
    generatedAt: "2026-10-12T00:00:00Z", // fresh on its own
    history: [{ evidenceDigest: "will-be-replaced", generatedAt: staleFirstGeneration }],
  });
  // Patch history to reference the actual digest (built after fixtureCycle constructs it).
  const withRealDigestHistory = { ...cycle, history: [
    { evidenceDigest: "earlier-version-digest", generatedAt: staleFirstGeneration },
    { evidenceDigest: cycle.evidence.evidenceDigest, generatedAt: cycle.evidence.generatedAt },
  ] };
  const g = evaluateSingleCycle(withRealDigestHistory, fixturePolicy(), REEVAL);
  assert.equal(g.recency.status, "failed", "the stale first-generation anchor must govern, not the fresh current record");
  assert.equal(g.recency.anchorGeneratedAt, staleFirstGeneration);
  assert.equal(g.historyProvenance.status, "self_declared_unverified");
});

// ---------------------------------------------------------------------------
// Digest / receipt linkage / consistência.
// ---------------------------------------------------------------------------

test("receipt ausente falha packageConsistency (raw_receipt_missing) — nunca é chamado de verificação contra a fonte", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z" });
  const withoutReceipt = { ...cycle, rawReceipts: [] };
  const g = evaluateSingleCycle(withoutReceipt, fixturePolicy(), REEVAL);
  assert.equal(g.packageConsistency.status, "failed");
  assert.ok(g.packageConsistency.failureReasons.includes("raw_receipt_missing"));
  // Independent of the above: this local checker never demonstrates source verification, pass or fail.
  assert.equal(g.metricsVerifiedAgainstSource.status, "not_demonstrated");
});

test("receipt com digest inconsistente falha packageConsistency (raw_receipt_digest_mismatch)", () => {
  const receipt = fixtureReceipt("2026-09-21T00:00:00.000Z", { digest: "tampered-digest" });
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z" });
  // The evidence's measurement still points at the ORIGINAL digest, but the
  // receipt actually supplied now carries a different one — a real, tampered mismatch.
  const withMismatchedReceipt = { ...cycle, rawReceipts: [receipt] };
  const g = evaluateSingleCycle(withMismatchedReceipt, fixturePolicy(), REEVAL);
  assert.equal(g.packageConsistency.status, "failed");
  assert.ok(g.packageConsistency.failureReasons.includes("raw_receipt_digest_mismatch"));
});

test("consistência com os receipts incluídos passa sem que isso constitua comprovação contra a fonte", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z" });
  const g = evaluateSingleCycle(cycle, fixturePolicy(), REEVAL);
  assert.equal(g.packageConsistency.status, "passed", "consistent with the receipts included in the package");
  assert.equal(g.metricsVerifiedAgainstSource.status, "not_demonstrated", "internal consistency is not source verification — independent categories");
  assert.match(g.metricsVerifiedAgainstSource.reason, /Run\/RunUsageBreakdown\/BillingLedger/);
});

// ---------------------------------------------------------------------------
// Thresholds e sampleSize.
// ---------------------------------------------------------------------------

test("métricas fora do threshold (auditGap real > 0) falham mesmo com evidência consistente com o receipt", () => {
  const receipt = fixtureReceipt("2026-09-21T00:00:00.000Z", { auditGapCount: 1 });
  const cycle = fixtureCycle({
    windowFrom: "2026-09-21T00:00:00.000Z",
    windowTo: "2026-09-28T00:00:00.000Z",
    generatedAt: "2026-10-04T12:00:00Z",
    receipt,
    measurementAuditGap: 1, // declared value matches the receipt — consistency passes, threshold does not
  });
  const g = evaluateSingleCycle(cycle, fixturePolicy(), REEVAL);
  assert.equal(g.packageConsistency.status, "passed", "declared value matches receipt — this is a threshold failure, not a consistency failure");
  assert.equal(g.thresholds.status, "failed");
  assert.ok(g.thresholds.failureReasons.includes("threshold_exceeded"));
});

test("sampleSize=0 falha thresholds (sample_size_zero) mesmo com measurementStatus=measured", () => {
  const receipt = fixtureReceipt("2026-09-21T00:00:00.000Z", { sampleSize: 0 });
  const cycle = fixtureCycle({
    windowFrom: "2026-09-21T00:00:00.000Z",
    windowTo: "2026-09-28T00:00:00.000Z",
    generatedAt: "2026-10-04T12:00:00Z",
    receipt,
    measurementSampleSize: 0,
  });
  const g = evaluateSingleCycle(cycle, fixturePolicy(), REEVAL);
  assert.equal(g.thresholds.status, "failed");
  assert.ok(g.thresholds.failureReasons.includes("sample_size_zero"));
});

// ---------------------------------------------------------------------------
// Escopo, janelas, consecutividade, deduplicação e conflitos.
// ---------------------------------------------------------------------------

test("mistura de escopos: cycle de outro tenant é excluído, nunca contado", () => {
  const cycles = [
    ...referenceThreeCycles().slice(0, 2),
    fixtureCycle({ windowFrom: "2026-10-05T00:00:00.000Z", windowTo: "2026-10-12T00:00:00.000Z", generatedAt: "2026-10-12T12:00:00Z", tenantId: "some-other-tenant" }),
  ];
  const selection = selectCycles(cycles, fixturePolicy(), REEVAL);
  const outOfScope = selection.considered.find((c) => c.cycleId.includes("some-other-tenant"));
  assert.ok(outOfScope);
  assert.equal(outOfScope!.included, false);
  assert.deepEqual(outOfScope!.exclusionReasons, ["scope_out_of_policy"]);
  assert.ok(selection.failureReasons.includes("insufficient_distinct_cycles"));
});

test("janela ausente (measurementStatus != measured) é detectada e excluída, não escondida", () => {
  const base = fixtureCycle({ windowFrom: "2026-10-05T00:00:00.000Z", windowTo: "2026-10-12T00:00:00.000Z", generatedAt: "2026-10-12T12:00:00Z" });
  const brokenEvidence = {
    ...base.evidence,
    measurements: base.evidence.measurements.map((m) => ({ ...m, measurementStatus: "not_measured" as const, observedAt: null })),
  };
  const cycle = { ...base, evidence: brokenEvidence };
  const g = evaluateSingleCycle(cycle, fixturePolicy(), REEVAL);
  assert.ok(g.packageConsistency.failureReasons.includes("missing_window"));
});

test("janelas não consecutivas (lacuna de uma semana) falham window_not_consecutive", () => {
  const cycles = [
    fixtureCycle({ windowFrom: "2026-09-14T00:00:00.000Z", windowTo: "2026-09-21T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z" }),
    // gap: 2026-09-21 -> 2026-09-28 is missing entirely
    fixtureCycle({ windowFrom: "2026-09-28T00:00:00.000Z", windowTo: "2026-10-05T00:00:00.000Z", generatedAt: "2026-10-05T12:00:00Z" }),
    fixtureCycle({ windowFrom: "2026-10-05T00:00:00.000Z", windowTo: "2026-10-12T00:00:00.000Z", generatedAt: "2026-10-12T12:00:00Z" }),
  ];
  const selection = selectCycles(cycles, fixturePolicy(), REEVAL);
  assert.equal(selection.consecutive, false);
  assert.ok(selection.failureReasons.includes("window_not_consecutive"));
});

test("mesmo digest repetido não aumenta a contagem de janelas distintas", () => {
  const cycle = referenceThreeCycles()[0];
  const cycles = [cycle, cycle, ...referenceThreeCycles().slice(1)];
  const selection = selectCycles(cycles, fixturePolicy(), REEVAL);
  const distinctWindows = new Set(selection.considered.filter((c) => c.included).map((c) => c.window!.from));
  assert.equal(distinctWindows.size, 3);
  assert.equal(selection.selectedCycleIds.length, 3);
});

test("versões conflitantes (mesma janela, digest diferente) são rejeitadas — nenhuma é descartada silenciosamente", () => {
  const [a, b, c] = referenceThreeCycles();
  const conflictingA = fixtureCycle({
    windowFrom: "2026-09-21T00:00:00.000Z",
    windowTo: "2026-09-28T00:00:00.000Z",
    generatedAt: "2026-10-04T18:00:00Z", // different generatedAt -> different evidenceDigest
  });
  const selection = selectCycles([a, conflictingA, b, c], fixturePolicy(), REEVAL);
  const conflicted = selection.considered.filter((entry) => entry.window?.from === "2026-09-21T00:00:00.000Z");
  assert.equal(conflicted.length, 2, "both conflicting versions must appear in `considered`, neither discarded");
  assert.ok(conflicted.every((entry) => entry.included === false));
  assert.ok(conflicted.every((entry) => entry.exclusionReasons.includes("version_conflict_unresolved")));
  assert.ok(selection.failureReasons.includes("insufficient_distinct_cycles"));
});

test("conflito provisório->final é rotulado como tal, mas continua não resolvido automaticamente (nenhuma versão é descartada)", () => {
  const [, b, c] = referenceThreeCycles();
  const provisional = fixtureCycle({
    windowFrom: "2026-09-21T00:00:00.000Z",
    windowTo: "2026-09-28T00:00:00.000Z",
    generatedAt: "2026-09-28T00:00:00Z",
    captureStatus: "provisional",
  });
  const final = fixtureCycle({
    windowFrom: "2026-09-21T00:00:00.000Z",
    windowTo: "2026-09-28T00:00:00.000Z",
    generatedAt: "2026-10-02T00:00:00Z", // different generatedAt -> different evidenceDigest -> still a real conflict
    captureStatus: "final",
    supersedesEvidenceRef: provisional.evidence.evidenceDigest,
  });
  const selection = selectCycles([provisional, final, b, c], fixturePolicy(), REEVAL);
  const conflicted = selection.considered.filter((entry) => entry.window?.from === "2026-09-21T00:00:00.000Z");
  assert.equal(conflicted.length, 2);
  assert.ok(conflicted.every((entry) => entry.included === false), "labeling the progression never auto-resolves it");
  const finalEntry = conflicted.find((entry) => entry.captureStatus === "final");
  assert.equal(finalEntry?.conflictKind, "provisional_superseded_by_final_unresolved");
});

test("conflito sem relação provisório/final é rotulado como divergência inexplicada", () => {
  const [a, b, c] = referenceThreeCycles();
  const unrelatedConflict = fixtureCycle({
    windowFrom: "2026-09-21T00:00:00.000Z",
    windowTo: "2026-09-28T00:00:00.000Z",
    generatedAt: "2026-10-04T18:00:00Z",
  });
  const selection = selectCycles([a, unrelatedConflict, b, c], fixturePolicy(), REEVAL);
  const conflicted = selection.considered.filter((entry) => entry.window?.from === "2026-09-21T00:00:00.000Z");
  assert.ok(conflicted.every((entry) => entry.conflictKind === "unexplained_divergence"));
});

// ---------------------------------------------------------------------------
// Atualidade da janela mais recente e tolerância de captura.
// ---------------------------------------------------------------------------

test("última janela não é a mais recente fechada, sem tolerância: falha window_not_latest_closed", () => {
  const cycles = [
    fixtureCycle({ windowFrom: "2026-09-14T00:00:00.000Z", windowTo: "2026-09-21T00:00:00.000Z", generatedAt: "2026-09-21T12:00:00Z" }),
    fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-09-28T12:00:00Z" }),
    fixtureCycle({ windowFrom: "2026-09-28T00:00:00.000Z", windowTo: "2026-10-05T00:00:00.000Z", generatedAt: "2026-10-05T12:00:00Z" }),
  ];
  // checkerNow is one week past the newest captured window's close (2026-10-12), so the
  // REAL last-closed window is [2026-10-05,2026-10-12), one ahead of what was captured.
  const selection = selectCycles(cycles, fixturePolicy({ captureToleranceDays: 0 }), new Date("2026-10-12T15:00:00Z"));
  assert.equal(selection.latestWindowIsLastClosed, false);
  assert.equal(selection.latestWindowWithinTolerance, false);
  assert.ok(selection.failureReasons.includes("window_not_latest_closed"));
});

test("tolerância de captura aceita o conjunto anterior dentro do prazo, mas nunca estende a recência de cada evidência", () => {
  const cycles = [
    fixtureCycle({ windowFrom: "2026-09-14T00:00:00.000Z", windowTo: "2026-09-21T00:00:00.000Z", generatedAt: "2026-09-21T12:00:00Z" }),
    fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-09-28T12:00:00Z" }),
    fixtureCycle({ windowFrom: "2026-09-28T00:00:00.000Z", windowTo: "2026-10-05T00:00:00.000Z", generatedAt: "2026-10-05T12:00:00Z" }),
  ];
  // Evaluated a few hours after the NEW window (2026-10-05..12) closed — within a 3-day tolerance.
  const checkerNow = new Date("2026-10-12T09:00:00Z");
  const policy = fixturePolicy({ captureToleranceDays: 3 });
  const selection = selectCycles(cycles, policy, checkerNow);
  assert.equal(selection.latestWindowIsLastClosed, false);
  assert.equal(selection.latestWindowWithinTolerance, true);
  assert.ok(!selection.failureReasons.includes("window_not_latest_closed"));

  // But the OLDEST cycle's own recency must still be judged strictly against maxAgeDays,
  // independent of the tolerance granted above.
  const oldest = cycles[0];
  const g = evaluateSingleCycle(oldest, policy, checkerNow);
  const ageDays = (checkerNow.getTime() - Date.parse(oldest.evidence.generatedAt)) / 86400000;
  assert.ok(ageDays > 14, "sanity: this fixture's oldest cycle is indeed already over 14 days old");
  assert.equal(g.recency.status, "failed", "tolerance governs which windows are required, never how long an individual evidence stays fresh");
});

// ---------------------------------------------------------------------------
// Ratificação.
// ---------------------------------------------------------------------------

test("ratificação exigida e ausente falha; ratificação exigida e presente passa", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z", ratified: false });
  const ratifiedCycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z", ratified: true });

  const policyRequiring = fixturePolicy({ requireRatification: true });
  assert.equal(evaluateSingleCycle(cycle, policyRequiring, REEVAL).ratification.status, "failed");
  assert.equal(evaluateSingleCycle(ratifiedCycle, policyRequiring, REEVAL).ratification.status, "passed");
});

test("sem exigência de ratificação: reportado not_required, nunca como dispensa da ratificação de release", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z", ratified: false });
  const g = evaluateSingleCycle(cycle, fixturePolicy({ requireRatification: false }), REEVAL);
  assert.equal(g.ratification.status, "not_required");
  // This status is scoped to THIS policy's P1 track only — it says nothing
  // about docs/ops/ape-audit-telemetry-decision.md's release-promotion gate,
  // which this module never reads or evaluates.
});

// ---------------------------------------------------------------------------
// Histórico insuficiente para provar primeira geração.
// ---------------------------------------------------------------------------

test("ausência de histórico com artefato recente: idade por generatedAt é diagnosticada, mas historyProvenance nunca vira válido/passed", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z", history: null });
  const g = evaluateSingleCycle(cycle, fixturePolicy(), REEVAL);
  assert.equal(g.historyProvenance.status, "absent");
  assert.ok(g.historyProvenance.failureReasons.includes("insufficient_history"));
  assert.equal(g.recency.governingBasis, "generatedAt");
  assert.equal(g.recency.ageDaysFromGeneratedAt, 8.125);
  assert.equal(g.recency.ageDaysFromSelfDeclaredHistory, null);
  assert.equal(g.recency.status, "passed"); // recente o bastante — mas isso é diagnóstico local, não prova de primeira geração
});

test("histórico autodeclarado recente, sem comprovação externa: permanece self_declared_unverified, nunca 'verified'", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z" });
  const recentHistory = [{ evidenceDigest: cycle.evidence.evidenceDigest, generatedAt: "2026-10-04T12:00:00Z" }];
  const withHistory = { ...cycle, history: recentHistory };
  const g = evaluateSingleCycle(withHistory, fixturePolicy(), REEVAL);
  assert.equal(g.historyProvenance.status, "self_declared_unverified");
  assert.notEqual(g.historyProvenance.status, "verified" as unknown as string);
  assert.equal(g.recency.governingBasis, "self_declared_history");
  assert.equal(g.recency.ageDaysFromSelfDeclaredHistory, 8.125);
  assert.equal(g.recency.status, "passed"); // idade dentro do limite — mas historyProvenance NÃO vira "passed" por isso
});

test("âncora anterior vencida com artefato atual recente: idade pelo generatedAt e pelo histórico são diferenciadas, e a mais antiga governa", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-12T00:00:00Z" });
  const staleHistory = [
    { evidenceDigest: "earlier-version-digest", generatedAt: "2026-08-01T00:00:00Z" },
    { evidenceDigest: cycle.evidence.evidenceDigest, generatedAt: cycle.evidence.generatedAt },
  ];
  const g = evaluateSingleCycle({ ...cycle, history: staleHistory }, fixturePolicy(), REEVAL);
  assert.ok(g.recency.ageDaysFromGeneratedAt! < 14, "diagnóstico: pelo generatedAt sozinho pareceria fresco");
  assert.ok(g.recency.ageDaysFromSelfDeclaredHistory! > 14, "diagnóstico: pelo histórico autodeclarado já está vencido");
  assert.equal(g.recency.governingAgeDays, g.recency.ageDaysFromSelfDeclaredHistory, "a idade que governa é a do histórico, não a do artefato atual");
  assert.equal(g.recency.status, "failed", "uma geração anterior vencida não é renovada por uma versão recente");
});

test("histórico temporalmente inconsistente: entrada futura em relação a checkerNow falha", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z" });
  const futureHistory = [
    { evidenceDigest: cycle.evidence.evidenceDigest, generatedAt: "2026-10-04T12:00:00Z" },
    { evidenceDigest: "some-later-digest", generatedAt: "2027-01-01T00:00:00Z" }, // impossible: after checkerNow
  ];
  const g = evaluateSingleCycle({ ...cycle, history: futureHistory }, fixturePolicy(), REEVAL);
  assert.equal(g.historyProvenance.status, "failed");
});

test("histórico temporalmente inconsistente: mesmo digest com dois generatedAt contraditórios falha", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z" });
  const contradictoryHistory = [
    { evidenceDigest: cycle.evidence.evidenceDigest, generatedAt: "2026-10-04T12:00:00Z" },
    { evidenceDigest: cycle.evidence.evidenceDigest, generatedAt: "2026-09-01T00:00:00Z" }, // same digest, different generatedAt
  ];
  const g = evaluateSingleCycle({ ...cycle, history: contradictoryHistory }, fixturePolicy(), REEVAL);
  assert.equal(g.historyProvenance.status, "failed");
});

test("histórico inconsistente (digest atual ausente do próprio histórico declarado) falha", () => {
  const cycle = fixtureCycle({
    windowFrom: "2026-09-21T00:00:00.000Z",
    windowTo: "2026-09-28T00:00:00.000Z",
    generatedAt: "2026-10-04T12:00:00Z",
    history: [{ evidenceDigest: "some-other-digest-not-this-one", generatedAt: "2026-08-01T00:00:00Z" }],
  });
  const g = evaluateSingleCycle(cycle, fixturePolicy(), REEVAL);
  assert.equal(g.historyProvenance.status, "failed");
});

test("tentativa de declarar confiança pelo próprio pacote: um campo extra 'verified'/'trusted' no histórico não promove a status confiável", () => {
  const cycle = fixtureCycle({ windowFrom: "2026-09-21T00:00:00.000Z", windowTo: "2026-09-28T00:00:00.000Z", generatedAt: "2026-10-04T12:00:00Z" });
  // Deliberately supplies fields the CycleHistoryEntry type does not
  // declare, to prove the checker ignores them rather than honoring them.
  const selfAssertingHistory = [
    { evidenceDigest: cycle.evidence.evidenceDigest, generatedAt: "2026-10-04T12:00:00Z", verified: true, trusted: true, source: "append-only-index" },
  ];
  const g = evaluateSingleCycle({ ...cycle, history: selfAssertingHistory }, fixturePolicy(), REEVAL);
  assert.equal(g.historyProvenance.status, "self_declared_unverified", "a package cannot promote its own history to verified via any extra field");
});

// ---------------------------------------------------------------------------
// Torne explícitos os ciclos considerados — nenhum subconjunto conveniente escondido.
// ---------------------------------------------------------------------------

test("todo ciclo de entrada aparece em `considered`, incluído ou excluído com motivo explícito", () => {
  const cycles = [
    ...referenceThreeCycles(),
    fixtureCycle({ windowFrom: "2026-08-01T00:00:00.000Z", windowTo: "2026-08-08T00:00:00.000Z", generatedAt: "2026-08-08T12:00:00Z" }), // older, out of the 3 most recent
  ];
  const selection = selectCycles(cycles, fixturePolicy(), REEVAL);
  assert.equal(selection.considered.length, 4);
  const older = selection.considered.find((c) => c.window?.from === "2026-08-01T00:00:00.000Z");
  assert.ok(older);
  assert.equal(older!.included, false);
});
