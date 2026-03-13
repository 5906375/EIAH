# Runbook — Governanca de Experimentos (S4-06)

## Objetivo

Operar com seguranca o fluxo de experimento de policy em shadow, com promocao condicionada por KPI/FP/FN e rollback automatico quando houver regressao.

Escopo operacional:
- `POST /api/governance/experiments/shadow-policy/start`
- `POST /api/governance/experiments/shadow-policy/:id/decision`
- `POST /api/governance/experiments/shadow-policy/:id/rollback`
- `GET /api/governance/experiments/shadow-policy/:id`
- `GET /api/governance/outcome/dashboard`
- `GET /api/governance/telemetry/fpfn`
- `POST /api/governance/calibrations`

## Pre-requisitos

- Token com permissao:
  - `governance.trust.manage` para start/decision/rollback/calibrations.
  - `governance.view` para leitura de status/dashboard/telemetry.
- Contexto tenant/workspace valido no token.
- Feature de filas e ledger ativas no ambiente alvo.

## Parametros de gate de promocao (S4-04)

Variaveis de ambiente:
- `EXPERIMENT_MIN_SAMPLE_SIZE` (default `20`)
- `EXPERIMENT_MIN_SUCCESS_RATE` (default `0.8`)
- `EXPERIMENT_MAX_FALSE_POSITIVE_RATE` (default `0.1`)
- `EXPERIMENT_MAX_FALSE_NEGATIVE_RATE` (default `0.1`)
- `EXPERIMENT_MAX_SECURITY_REGRESSION_COUNT` (default `0`)
- `EXPERIMENT_AUTO_ROLLBACK_ON_PROMOTION_FAIL` (default `true`)

## Procedimento operacional

1. Iniciar experimento shadow
- `POST /api/governance/experiments/shadow-policy/start`
- Body minimo:
```json
{
  "name": "shadow-policy-rollout",
  "actionPrefix": "runs.",
  "notes": "S4 rollout"
}
```
- Esperado: `201`, `experiment.status = "active"`.

2. Coletar telemetria durante janela
- `GET /api/governance/outcome/dashboard?windowDays=30`
- `GET /api/governance/telemetry/fpfn?windowDays=30`
- Esperado: payload com `methodVersion`, `calculation.computedAt`, `judge`, `policy`, `byWriteLabel`.

3. Registrar calibracoes FP/FN (quando aplicavel)
- `POST /api/governance/calibrations`
- Body exemplo:
```json
{
  "runId": "run_123",
  "gate": "policy",
  "label": "false_positive",
  "comment": "bloqueio indevido"
}
```

4. Tomar decisao
- `POST /api/governance/experiments/shadow-policy/:id/decision`
- Valores:
  - `keep_shadow`
  - `promote_enforce`
  - `rollback`
- Para promocao:
  - Se gate passar: `200`, `status = "promoted"`.
  - Se gate falhar: `409 PROMOTION_GATE_FAILED`; com auto-rollback ligado, status final `rolled_back`.

5. Validar estado e trilha
- `GET /api/governance/experiments/shadow-policy/:id`
- Esperado:
  - timeline contem `started`, `decision_recorded` e, quando ocorrer, `rolled_back`.
  - `experiment.status` coerente com transicoes.

## Playbook de incidente (promocao falha)

- Sintoma: resposta `PROMOTION_GATE_FAILED`.
- Acao imediata:
  1. Verificar `promotionGate.reasons`.
  2. Confirmar se houve `auto_rollback`.
  3. Revisar `GET /governance/telemetry/fpfn` por writeLabel.
  4. Abrir acao corretiva:
     - tuning de policy,
     - correcoes de calibracao,
     - mitigacao de regressao de seguranca.

## Simulacao minima (tabletop)

Script de simulacao local:
- `node --experimental-strip-types scripts/simulateGovernanceExperimentS406.ts`

Saida:
- `ops/evidence/s4-06-governance-experiments-simulation-2026-02-24.json`

O artefato registra:
- input sintetico de KPI/FP/FN,
- avaliacao do gate de promocao,
- telemetria FP/FN calculada,
- timestamp de execucao e versoes de metodo.
