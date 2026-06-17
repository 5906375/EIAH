# H4 — Skip Reason Monitor (IMOB Worker Observability)

**Data:** 2026-06-16
**Frente:** IMOB Worker Observability & Regression Gates
**Status:** EVIDENCIADO — runbook e monitor operacional criados, testes passando.

---

## Objetivo

Mapear todos os `reasonCode`s que o `ImobPostRunMutationWorker` pode emitir — com threshold, severidade, owner operacional e link para o runbook — de modo que on-call identifique a ação correta sem precisar inspecionar código.

---

## Counters cobertos

Os reasonCodes abaixo são emitidos como labels do counter `imob_post_run_skips_total` e `imob_post_run_failures_total` (H1). O endpoint `/metrics-prom` expõe os valores acumulados.

---

## Tabela de reasonCodes e ruleIds associados

| reasonCode | Counter | ruleId | Severidade | Threshold | Owner operacional | Runbook |
|---|---|---|---|---|---|---|
| `job_permanently_failed` | `imob_post_run_failures_total` | IMOB-W-001 | ERROR | > 0 | On-call sênior | [§IMOB-W-001](../../../runbooks/imob-worker-observability.md#imob-w-001--imobworkerpermanentfailure-error) |
| `receipt_required_no_tx_id` | `imob_post_run_skips_total` | IMOB-W-002 | ERROR | > 0 | On-call sênior + ledger | [§IMOB-W-002](../../../runbooks/imob-worker-observability.md#imob-w-002--imobworkerreceiptrequirednotxid-error) |
| `simulated` | `imob_post_run_skips_total` | IMOB-W-003 | WARNING | > 0 (configurável) | Plataforma/produto | [§IMOB-W-003](../../../runbooks/imob-worker-observability.md#imob-w-003--imobworkersimulatedinproduction-warning) |
| `already_processed` | `imob_post_run_skips_total` | IMOB-W-004 | WARNING | > 30% de `jobs_total` | On-call | [§IMOB-W-004](../../../runbooks/imob-worker-observability.md#imob-w-004--imobworkerhighduplicaterate-warning) |
| `run_not_success` | `imob_post_run_skips_total` | IMOB-W-005 | WARNING | > 20% de `jobs_total` | Infra + produto | [§IMOB-W-005](../../../runbooks/imob-worker-observability.md#imob-w-005--imobworkerhighrunfailurerate-warning) |
| `job_error` | `imob_post_run_failures_total` | IMOB-W-006 | ERROR | > 5% de `jobs_total` | On-call sênior | [§IMOB-W-006](../../../runbooks/imob-worker-observability.md#imob-w-006--imobworkerhighjoberrorrate-error) |
| _(queue stall)_ | `imob_run_completed_jobs_total` | IMOB-W-007 | WARNING | Δ = 0 em ≥ 5 min | On-call | [§IMOB-W-007](../../../runbooks/imob-worker-observability.md#imob-w-007--imobworkerqueuestall-warning) |

---

## reasonCodes monitorados sem ruleId (skip silencioso)

Estes códigos são emitidos como `imob_post_run_skips_total{reason=...}` mas não disparam alerta automático. São visíveis nos counters para diagnóstico manual.

| reasonCode | Significado | Owner |
|---|---|---|
| `missing_required_fields` | Payload do job incompleto — contrato de dados violado | Produto (revisão de contrato BullMQ) |
| `unknown_action_id` | `actionId` não consta em `IMOB_DISPATCHER_ACTION_IDS` | Produto (atualizar dispatcher) |
| `no_outcome_for_action` | `actionId` sem entrada em `IMOB_RUN_OUTCOME_MAP` | Produto (atualizar outcome map) |
| `run_not_found` | `runId` do job não existe no banco | Produto (race condition ou payload inválido) |
| `case_not_found` | `ImobCase` associado ao run não encontrado | Produto (race condition ou dados corrompidos) |
| `commission_settle_missing_owner` | `commission.settle` sem `ownerResponsible` no canonical | Produto (dados incompletos no case) |
| `update_case_not_found` | Case não encontrado na mutação final (race condition) | Produto / investigação ad-hoc |
| `update_case_responsible_required` | `updateCase` exige owner mas não encontrou | Produto (contrato de mutação) |

---

## Thresholds configuráveis (`DEFAULT_ALERT_CONFIG`)

Definidos em `apps/api/src/workers/imobWorkerAlerts.ts`:

| Campo | Default | ruleId | Interpretação |
|---|---|---|---|
| `simulatedSkipThreshold` | 0 | IMOB-W-003 | Qualquer skip simulated em produção = WARNING |
| `duplicateSkipRateThreshold` | 0.30 (30%) | IMOB-W-004 | Taxa de `already_processed` acima de 30% = WARNING |
| `runNotSuccessRateThreshold` | 0.20 (20%) | IMOB-W-005 | Taxa de `run_not_success` acima de 20% = WARNING |
| `jobErrorRateThreshold` | 0.05 (5%) | IMOB-W-006 | Taxa de `job_error` acima de 5% = ERROR |
| `stallWindowMs` | 300000 (5 min) | IMOB-W-007 | Janela de detecção de fila parada |

---

## Política de PII

Nenhum reasonCode, label de counter ou campo de `AlertEvent` contém PII. Os únicos dados nos counters são:
- `actionId`: código de ação (ex: `owner.register`) — não é PII
- `reason`: código de skip (ex: `already_processed`) — não é PII

Proibido em logs de incidente: `caseId`, `tenantId`, `workspaceId`, `ownerResponsible`, textos livres do usuário.

---

## Arquivos criados nesta frente (H1–H4)

| Item | Arquivo | Status |
|---|---|---|
| H1 — Métricas | `apps/api/src/workers/imobWorkerMetrics.ts` | EVIDENCIADO |
| H1 — Testes | `apps/api/src/tests/imob-worker-metrics.test.ts` | 13/13 pass |
| H2 — Alertas | `apps/api/src/workers/imobWorkerAlerts.ts` | EVIDENCIADO |
| H2 — Testes | `apps/api/src/tests/imob-worker-alerts.test.ts` | 21/21 pass |
| H3 — CI Gate | `.github/workflows/imob-worker-e2e.yml` | EVIDENCIADO |
| H3 — Testes E2E | `apps/api/src/tests/imob-post-run-mutation-e2e.test.ts` | 9/9 pass |
| H4 — Runbook | `docs/ops/runbooks/imob-worker-observability.md` | EVIDENCIADO |
| H4 — Monitor | `docs/ops/evidence/latest/imob-worker-observability/h4-skip-reason-monitor.md` | EVIDENCIADO |
| H4 — Testes | `apps/api/src/tests/imob-worker-h4-runbook.test.ts` | ver resultado abaixo |
