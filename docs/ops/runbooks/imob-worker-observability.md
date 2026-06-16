# Runbook — IMOB Worker Observability (ImobPostRunMutationWorker)

## Resumo da cadeia

```
CC (Command Center) → CTA (ação) → Chat (confirmação) → /api/agents/execute
  → runWorker.ts (enfileira após run.success) → BullMQ: imob-run-completed
  → ImobPostRunMutationWorker → ImobCrmMutationService.updateCase
  → buildImobCanonicalCase → CC refresh
```

O worker é a **única** fonte de mutação de `ImobCase` após um run. Falha nele = caso travado sem resolução visível no CC.

---

## Regras de alerta (ruleId → severidade)

| ruleId | Severidade | Nome | Condição | Causa provável |
|---|---|---|---|---|
| IMOB-W-001 | ERROR | ImobWorkerPermanentFailure | `failures{reason=job_permanently_failed}` > 0 | Exception não recuperável; job exauriu retries no BullMQ |
| IMOB-W-002 | ERROR | ImobWorkerReceiptRequiredNoTxId | `skips{reason=receipt_required_no_tx_id}` > 0 | Ação HIGH tier sem `txId` — ledger upstream não commitou |
| IMOB-W-003 | WARNING | ImobWorkerSimulatedInProduction | `skips{reason=simulated}` > threshold (default: 0) | Engine com `devMode` ou `simulatedRun=true` em produção |
| IMOB-W-004 | WARNING | ImobWorkerHighDuplicateRate | `already_processed / jobs_total` > 30% | Retry storm upstream; enfileiramento duplicado de `run.completed` |
| IMOB-W-005 | WARNING | ImobWorkerHighRunFailureRate | `run_not_success / jobs_total` > 20% | Engine degradado; taxa alta de runs com `status ≠ success` |
| IMOB-W-006 | ERROR | ImobWorkerHighJobErrorRate | `job_error / jobs_total` > 5% | Bug no handler; Prisma ou Redis com falha persistente |
| IMOB-W-007 | WARNING | ImobWorkerQueueStall | Nenhum job em ≥ 5 min (quando havia jobs antes) | Worker não iniciado; Redis indisponível; BullMQ travado |

---

## Investigação inicial

### IMOB-W-001 — ImobWorkerPermanentFailure (ERROR)

**O que procurar:**
1. Logs do worker: `grep "job_permanently_failed\|BullMQ.*failed" api.log`
2. DLQ da fila `imob-run-completed` no painel BullMQ
3. Exception stack trace (sem logar PII — ver [Política de PII](#política-de-pii))
4. Métrica: `imob_post_run_failures_total{reason="job_permanently_failed"}`

**Ação de mitigação:**
- Exception conhecida e fixável: aplicar fix + re-enqueue manual via BullMQ admin
- Dados corrompidos no payload: escalar imediatamente
- DLQ crescendo: suspender enfileiramento upstream via flag `IMOB_WORKER_ENABLED=false`

**Escalonamento:** On-call sênior imediatamente.

**Evidência pós-incidente:** job ID BullMQ, `runId`, `actionId`, exception trace — sem PII.

---

### IMOB-W-002 — ImobWorkerReceiptRequiredNoTxId (ERROR)

**O que procurar:**
1. Ações HIGH tier sem `txId`: `owner.register`, `commission.settle` e similares
2. Verificar se ledger commitou antes do enfileiramento: `GET /api/ledger/<txId>`
3. Verificar propagação de `txId` no `runWorker.ts` (campo `run.txId`)
4. Métrica: `imob_post_run_skips_total{reason="receipt_required_no_tx_id"}`

**Ação de mitigação:**
- NÃO re-executar sem confirmar que o ledger commitou
- Verificar se `run.txId` é propagado corretamente no payload BullMQ
- Isolar a janela de tempo e cruzar com logs do ledger

**Escalonamento:** On-call sênior + equipe de ledger/compliance.

**Evidência pós-incidente:** `runId`, `actionId`, timestamp do skip, status do ledger — sem `caseId`/`tenantId` nos logs.

---

### IMOB-W-003 — ImobWorkerSimulatedInProduction (WARNING)

**O que procurar:**
1. Variáveis de ambiente do agente: `devMode`, `simulatedRun`, `SIMULATION_MODE`
2. `outputs[].data.simulated === true` no payload do run
3. Métrica: `imob_post_run_skips_total{reason="simulated"}`

**Ação de mitigação:**
- Identificar instância do agente com `devMode=true` em produção
- Corrigir configuração ou isolar a instância
- Casos não são afetados pelo skip (conservativo)

**Escalonamento:** Responsável de plataforma/produto.

---

### IMOB-W-004 — ImobWorkerHighDuplicateRate (WARNING)

**O que procurar:**
1. `imob_post_run_skips_total{reason="already_processed"}` crescendo acima de 30%
2. Múltiplos eventos `run.completed` para o mesmo `runId` no `runWorker.ts`
3. Retry storms no BullMQ (jobs sendo re-enfileirados múltiplas vezes)

**Ação de mitigação:**
- A idempotência está ativa — casos não são afetados (skip seguro)
- Investigar origem dos duplicados upstream se taxa persistir
- Verificar deduplicação de `run.completed` no `runWorker.ts`

---

### IMOB-W-005 — ImobWorkerHighRunFailureRate (WARNING)

**O que procurar:**
1. `imob_post_run_skips_total{reason="run_not_success"}` acima de 20%
2. Logs do agente: runs completando com `status !== "success"`
3. Erros de execução no `runWorker.ts` e no agente

**Ação de mitigação:**
- Acionar on-call de infraestrutura se engine degradado
- Casos permanecem inalterados (skip conservativo)
- Verificar quotas e saúde do modelo

---

### IMOB-W-006 — ImobWorkerHighJobErrorRate (ERROR)

**O que procurar:**
1. Exceptions no handler: `grep "processImobRunCompletedJob.*throw\|worker.*error" api.log`
2. `imob_post_run_failures_total{reason="job_error"}` crescendo acima de 5%
3. Saúde de dependências: Prisma pool, conexão Redis, serviços externos

**Ação de mitigação:**
- Prisma timeout: verificar pool de conexões e saúde do Postgres
- Redis: verificar `REDIS_URL` e conectividade do BullMQ
- Bug no handler: aplicar fix + restart do worker (`apps/api`)

**Escalonamento:** On-call sênior imediatamente.

---

### IMOB-W-007 — ImobWorkerQueueStall (WARNING)

**O que procurar:**
1. Worker rodando? Verificar logs de startup do `apps/api`
2. Redis responsivo? `redis-cli -u $REDIS_URL ping`
3. Jobs na fila painel BullMQ: `imob-run-completed` com jobs pendentes?
4. `imob_run_completed_jobs_total` sem variação em ≥ 5 min

**Ação de mitigação:**
- Worker não iniciado: reiniciar `apps/api`
- Redis down: restaurar conexão — BullMQ reconecta automaticamente
- Fila vazia sem novos runs: pode ser inatividade legítima — verificar se há runs sendo criados

---

## Queries seguras (sem PII)

```sql
-- Runs recentes por status (sem caseId/tenantId nos resultados)
SELECT status, COUNT(*) AS total, DATE_TRUNC('hour', created_at) AS hora
FROM "Run"
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY status, hora
ORDER BY hora DESC;

-- Contagem de eventos de run (sem dados de caso)
SELECT type, COUNT(*) AS total
FROM run_event
WHERE created_at > NOW() - INTERVAL '30 minutes'
GROUP BY type
ORDER BY total DESC;
```

```bash
# Counters Prometheus do worker
curl -s http://localhost:3001/metrics-prom | grep imob_

# Fila BullMQ via Redis (sem PII)
redis-cli -u $REDIS_URL LLEN "bull:imob-run-completed:wait"
redis-cli -u $REDIS_URL LLEN "bull:imob-run-completed:failed"

# Rodar testes locais de regressão (H3)
pnpm test:imob-worker:e2e

# Verificar counters e alertas
pnpm test:imob-worker:metrics
pnpm test:imob-worker:alerts
```

---

## Política de PII

**PROIBIDO em logs de incidente, dumps de DLQ e evidências:**
- `caseId` — identificador do caso (UUID ou slug de caso)
- `tenantId` cru — identificador do tenant
- `workspaceId` cru — identificador do workspace
- `ownerResponsible` — nome, CPF ou e-mail do responsável
- Textos livres de inputs do usuário

**PERMITIDO:**
- `runId` (UUID opaco)
- `actionId` (código: `owner.register`, `commission.settle`)
- `reason` (código de skip: `already_processed`, `simulated`)
- Contagens, taxas percentuais, timestamps
- `ruleId` (IMOB-W-001..IMOB-W-007)

Todos os counters e `AlertEvent`s são PII-free por design (verificado em T-M6 e T-A5 dos testes).

---

## Arquivos relevantes

| Arquivo | Papel |
|---|---|
| `apps/api/src/workers/imobPostRunMutationWorker.ts` | Handler do job BullMQ |
| `apps/api/src/workers/imobWorkerMetrics.ts` | Counters in-memory (H1) |
| `apps/api/src/workers/imobWorkerAlerts.ts` | Avaliadores de alerta (H2) |
| `apps/api/src/queues/imobRunCompletedQueue.ts` | Fila BullMQ |
| `apps/api/src/services/imob/crm/imobCrmMutationService.ts` | Mutação do ImobCase |
| `apps/api/src/services/imob/imobCanonical.ts` | `buildImobCanonicalCase` |
| `.github/workflows/imob-worker-e2e.yml` | CI gate (H3) |
| `docs/ops/evidence/latest/imob-worker-observability/` | Evidências H1–H4 |
