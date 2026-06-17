# H2 — ImobWorkerAlerts (evidência real)

**Data:** 2026-06-16
**Frente:** IMOB Worker Observability & Regression Gates
**Status:** EVIDENCIADO — 7 regras de alerta implementadas, 21/8 suítes passando.

---

## Objetivo

Tornar detectáveis em produção falhas, anomalias e paradas do `ImobPostRunMutationWorker` via regras de avaliação puras sobre os counters do H1.

---

## Arquivos criados/modificados

| Arquivo | O que mudou |
|---|---|
| `apps/api/src/workers/imobWorkerAlerts.ts` | **CRIADO** — 7 regras de alerta: `evaluateImobWorkerAlerts` (snapshot-based) + `evaluateImobWorkerStall` (delta-based); tipos `AlertEvent`, `AlertConfig`; constante `DEFAULT_ALERT_CONFIG` |
| `apps/api/src/tests/imob-worker-alerts.test.ts` | **CRIADO** — T-A1..T-A8 (21 assertions em 8 suítes) |
| `package.json` (raiz) | Script `test:imob-worker:alerts` adicionado |

---

## Regras de alerta

| ruleId | Nome | Severidade | Condição | Ação operacional |
|---|---|---|---|---|
| IMOB-W-001 | ImobWorkerPermanentFailure | **ERROR** | `failures{reason=job_permanently_failed}` > 0 | Inspecionar DLQ da fila `imob-run-completed`; verificar logs do worker |
| IMOB-W-002 | ImobWorkerReceiptRequiredNoTxId | **ERROR** | `skips{reason=receipt_required_no_tx_id}` > 0 | Audit gap — verificar ledger upstream; ação HIGH sem txId |
| IMOB-W-003 | ImobWorkerSimulatedInProduction | WARNING | `skips{reason=simulated}` > `simulatedSkipThreshold` (default: 0) | Engine emitindo `simulated=true` em produção; verificar configuração do agente |
| IMOB-W-004 | ImobWorkerHighDuplicateRate | WARNING | `skips{reason=already_processed}` / `jobs_total` > 30% | Enfileiramento duplicado upstream; verificar `runWorker` P5 ou retry storms |
| IMOB-W-005 | ImobWorkerHighRunFailureRate | WARNING | `skips{reason=run_not_success}` / `jobs_total` > 20% | Engine degradado; taxa alta de runs com status ≠ success |
| IMOB-W-006 | ImobWorkerHighJobErrorRate | **ERROR** | `failures{reason=job_error}` / `jobs_total` > 5% | Exceções persistentes no handler; inspecionar logs do worker imediatamente |
| IMOB-W-007 | ImobWorkerQueueStall | WARNING | Nenhum job novo em janela ≥ 5 min (quando havia jobs antes) | Worker parado ou Redis indisponível; checar `startImobPostRunMutationWorker` e conexão Redis |

---

## Thresholds configuráveis (`AlertConfig`)

| Campo | Default | Interpretação |
|---|---|---|
| `simulatedSkipThreshold` | 0 | Qualquer simulated em produção = WARNING |
| `duplicateSkipRateThreshold` | 0.30 | 30% de jobs duplicados = WARNING |
| `runNotSuccessRateThreshold` | 0.20 | 20% de runs não-success = WARNING |
| `jobErrorRateThreshold` | 0.05 | 5% de exceptions no handler = ERROR |
| `stallWindowMs` | 300000 (5 min) | Janela de detecção de fila parada |

---

## Labels e ausência de PII

Os alertas são gerados a partir dos counters de H1, que por design nunca contêm PII. Os campos `message`, `counterKey`, `ruleId` e `name` de cada `AlertEvent` contêm apenas:
- Contagens numéricas
- System codes (reason codes canônicos)
- Percentuais computados
- Nomes de counters e regras (system-defined)

Verificado em T-A5: `caseId`, `tenantId`, `workspaceId`, `ownerResponsible` e nomes de usuário não aparecem em nenhum campo de `AlertEvent`.

---

## Resultado dos testes

```
ok 1 - [T-A1] IMOB-W-001 — job_permanently_failed fires ERROR        (3 sub-tests)
ok 2 - [T-A2] IMOB-W-002 — receipt_required_no_tx_id fires ERROR     (3 sub-tests)
ok 3 - [T-A3] IMOB-W-003 — simulated in production fires WARNING      (2 sub-tests)
ok 4 - [T-A4] IMOB-W-004 — duplicate skip rate fires WARNING          (3 sub-tests)
ok 5 - [T-A5] no PII in alert outputs                                  (2 sub-tests)
ok 6 - [T-A6] zero counters → no alerts (no false positives)          (3 sub-tests)
ok 7 - [T-A7] IMOB-W-007 — stall fires WARNING when queue is silent   (3 sub-tests)
ok 8 - [T-A8] stall does NOT fire when jobs are processing             (2 sub-tests)
# tests 21 | # pass 21 | # fail 0
# duration_ms 550
```

---

## Integração com /metrics-prom

As regras consomem snapshots gerados por `getCounterSnapshot()` de `imobWorkerMetrics.ts` (H1). O endpoint `/metrics-prom` expõe os counters brutos; um processo externo de polling (cron, APM, Grafana Prometheus scrape) pode chamar `evaluateImobWorkerAlerts(getCounterSnapshot())` para avaliar as regras.

Exemplo de integração via polling (futuro — não implementado nesta frente):
```typescript
// Avaliar a cada 60s:
setInterval(async () => {
  const events = evaluateImobWorkerAlerts(getCounterSnapshot());
  for (const event of events) {
    logger.warn({ ruleId: event.ruleId, severity: event.severity, value: event.value }, event.message);
    // Enviar para PagerDuty / Slack / alerting system
  }
}, 60_000);
```

---

## Nenhum código funcional alterado

- Outcome map inalterado
- Guards inalterados
- `ImobCrmMutationService` inalterado
- `buildImobCanonicalCase` inalterado
- React/Chat inalterado
- H1 (`imobWorkerMetrics.ts`) inalterado

---

## Regressão H1 + H3 confirmada

- `pnpm test:imob-worker:metrics` → 13/13 pass
- `pnpm test:imob-worker:e2e` → 9/9 pass

---

## Próximo: H4 — Monitor de skipped/blocked reasons

Runbook operacional associado: criar `docs/ops/imob-worker-observability-runbook.md` com procedimentos por ruleId.
