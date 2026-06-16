# H1 — ImobWorkerMetrics (evidência real)

**Data:** 2026-06-16
**Frente:** IMOB Worker Observability & Regression Gates
**Status:** EVIDENCIADO — counters implementados, expostos no /metrics-prom, 13/7 suítes passando.

---

## Objetivo

Tornar visíveis em produção os skips, mutations e failures do `ImobPostRunMutationWorker` sem expor PII.

---

## Arquivos criados/modificados

| Arquivo | O que mudou |
|---|---|
| `apps/api/src/workers/imobWorkerMetrics.ts` | **CRIADO** — módulo de counters in-memory puro: `incrementCounter`, `getCounterSnapshot`, `renderCountersAsPrometheusText`, `resetCountersForTesting`, `IMOB_WORKER_COUNTER` |
| `apps/api/src/workers/imobPostRunMutationWorker.ts` | Import de `incrementCounter` + `IMOB_WORKER_COUNTER`; 12 pontos de incremento adicionados |
| `apps/api/src/routes/metrics-prom.ts` | Import de `renderCountersAsPrometheusText`; seção IMOB Worker adicionada ao output Prometheus |
| `apps/api/src/tests/imob-worker-metrics.test.ts` | **CRIADO** — T-M1..T-M7 (13 assertions em 7 suítes) |
| `package.json` (raiz) | Script `test:imob-worker:metrics` adicionado |

---

## Counters implementados

| Counter | Labels | Quando incrementa |
|---|---|---|
| `imob_run_completed_jobs_total` | `actionId` | Toda entrada em `processImobRunCompletedJob` — antes de qualquer guard |
| `imob_post_run_mutations_applied_total` | `actionId`, `terminal`, `requiresTxId` | Após `updateCase` retornar `status=updated` e canonical recalculado |
| `imob_post_run_skips_total` | `actionId`, `reason` | Qualquer guard exit sem mutação |
| `imob_post_run_failures_total` | `reason` | Unexpected updateCase status; exception no handler BullMQ; job_permanently_failed |

---

## Reason codes de SKIPS

| `reason` | Guard | Situação |
|---|---|---|
| `missing_required_fields` | Guard 1 | Campo obrigatório ausente no payload |
| `unknown_action_id` | Guard 2 | actionId fora da lista canônica |
| `no_outcome_for_action` | Guard 3 | actionId sem entrada no IMOB_RUN_OUTCOME_MAP |
| `run_not_found` | Guard 4 (getRun) | Run não existe ou workspace errado (cross-workspace) |
| `run_not_success` | Guard 4b | run.status ≠ success |
| `simulated` | Guard 5 | outputs[].data.simulated=true |
| `receipt_required_no_tx_id` | Guard 6 | HIGH tier sem txId |
| `already_processed` | Guard 7 (DB idempotency) | ImobCaseEvent.findFirst por runId já existe |
| `case_not_found` | Guard 8 | Case não existe ou cross-workspace no load |
| `commission_settle_missing_owner` | Guard 9 | commission.settle sem ownerResponsible |
| `update_case_not_found` | Post-mutation | updateCase retornou not_found |
| `update_case_responsible_required` | Post-mutation | updateCase retornou responsible_required |

---

## Labels e ausência de PII

Labels permitidas (verificado em T-M6):

| Label | Valores possíveis | PII? |
|---|---|---|
| `actionId` | owner.register, commission.settle, ... (11 valores canônicos) | ✅ Não |
| `reason` | reason codes acima (system-defined) | ✅ Não |
| `terminal` | "true", "false" | ✅ Não |
| `requiresTxId` | "true", "false" | ✅ Não |

Labels **ausentes** (PII bloqueado por design):

- `caseId` — identificador de caso do usuário
- `tenantId` — identificador de tenant
- `workspaceId` — identificador de workspace
- `ownerResponsible` — nome de responsável
- Qualquer texto livre de negócio

---

## Exemplo de output em /metrics-prom

```
# IMOB Worker Mutation counters
imob_run_completed_jobs_total{actionId="owner.register"} 42
imob_run_completed_jobs_total{actionId="lead.qualify"} 18
imob_post_run_mutations_applied_total{actionId="owner.register",requiresTxId="true",terminal="false"} 39
imob_post_run_mutations_applied_total{actionId="commission.settle",requiresTxId="true",terminal="true"} 3
imob_post_run_skips_total{actionId="owner.register",reason="already_processed"} 3
imob_post_run_skips_total{actionId="owner.register",reason="simulated"} 0
imob_post_run_skips_total{actionId="owner.register",reason="receipt_required_no_tx_id"} 0
imob_post_run_failures_total{reason="job_error"} 0
```

---

## Resultado dos testes

```
ok 1 - [T-M1] mutation_applied increments correct counters (2 sub-tests)
ok 2 - [T-M2] simulated skip increments correct counter (1 sub-test)
ok 3 - [T-M3] run_not_success skip increments correct counter (2 sub-tests)
ok 4 - [T-M4] already_processed increments correct counter (1 sub-test)
ok 5 - [T-M5] worker failure counter (direct incrementCounter) (3 sub-tests)
ok 6 - [T-M6] no PII in counter keys (2 sub-tests)
ok 7 - [T-M7] renderCountersAsPrometheusText emits valid format (3 sub-tests)
# tests 13 | # pass 13 | # fail 0
```

Processo encerrou limpo — nenhum BullMQ connection aberta neste teste.

---

## Regressão E2E (H3) confirmada

```
pnpm test:imob-worker:e2e → 9/9 pass, duration_ms 2365
```

E2E continua passando após as modificações no worker.

---

## Nenhum código funcional alterado

- Outcome map inalterado
- Guards inalterados (counters são side-effects após o log existente)
- `ImobCrmMutationService` inalterado
- `buildImobCanonicalCase` inalterado
- React/Chat inalterado

---

## Próximo: H2 — Alertas de fila

Ver `frente-kickoff.md` seção H2 para regras e DoD.
