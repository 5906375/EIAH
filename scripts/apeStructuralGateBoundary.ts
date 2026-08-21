/**
 * Fronteira semântica única para os gates convertidos pelo PR B
 * (docs/ops/ape-audit-telemetry-decision.md, Seções 5.1 e 10, passo 2).
 *
 * Antes desta fronteira: os contexts P3EconomyHardening, W4NonRegression e
 * P4TrackPRollout consumiam telemetria declarativa (JSON/Markdown gerados
 * sinteticamente, sem medição real).
 *
 * A partir desta fronteira: os três validam somente estrutura de código
 * (rotas, serviços, contratos) e execução real de suítes de teste.
 * Nenhuma afirmação de telemetria operacional (auditGap, duplicateSideEffects,
 * breakGlass, hardMetricsGo, nonRegressionGo) é feita por eles.
 *
 * O valor abaixo é um placeholder deliberado. Um micro-PR pós-merge o
 * substituirá pelo merge SHA real deste PR B assim que ele for mergeado —
 * esse follow-up não é executado aqui.
 */
export const STRUCTURAL_GATE_BOUNDARY_SHA = "PENDING_POST_MERGE";

export const STRUCTURAL_GATE_BOUNDARY_NOTE =
  "before this boundary: context consumed declarative telemetry; " +
  "after this boundary: validates only structure and executed tests.";
