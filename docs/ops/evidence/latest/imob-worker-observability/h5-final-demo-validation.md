# H5 — Demo Final & Validação Recorrente (IMOB Worker Observability)

**Data:** 2026-06-16
**Frente:** IMOB Worker Observability & Regression Gates
**Status:** EVIDENCIADO — frente encerrada.

---

## Objetivo

Fechar a frente IMOB Worker Observability & Regression Gates com uma validação final reproduzível que demonstra: regressão E2E protegida em CI, métricas expostas, alertas avaliáveis e runbook operacional completo.

A frente não inclui gravação de tela (ambiente de staging com dados reais não estava disponível nesta sessão). A validação é feita via roteiro reproduzível e resultados de testes locais contra banco e Redis locais.

---

## Pré-requisitos

| Requisito | Verificação |
|---|---|
| Banco Postgres local rodando | `DATABASE_URL=postgresql://postgres:senha@127.0.0.1:5433/eiah_builder?schema=public` |
| Redis local rodando | `REDIS_URL=redis://127.0.0.1:6379/0` |
| Migrações aplicadas | `pnpm --filter @repo/db migrate:deploy` |
| Dependências instaladas | `pnpm install --frozen-lockfile` |
| Sem alterações no fluxo funcional | Garantido: outcome map, guards, React/Chat inalterados |

---

## Roteiro reproduzível

### Passo 1 — Validação E2E do worker (H3)

```bash
pnpm test:imob-worker:e2e
```

Cobre os 8 cenários E2E-01..E2E-08 contra banco e Redis reais:

| Cenário | O que prova |
|---|---|
| E2E-01 | Happy path: `owner.register` → `stage=property_collecting`, `status=ready_for_review`, `receiptPath` presente |
| E2E-02 | Idempotência: segundo run com mesmo `runId` → `already_processed`, caso inalterado |
| E2E-03 | Simulated=true → `skipped_simulated_run`, caso inalterado |
| E2E-04 | `run.status=error` → `run_not_success_skip`, caso inalterado |
| E2E-05 | Cross-workspace → `run_not_found`, caso inalterado |
| E2E-06 | `commission.settle` → `stage=done`, `status=done`, `pendingItems=[]`, terminal event gravado |
| E2E-07 | `lead.qualify` sem txId → mutado (`requiresTxId=false`) |
| E2E-08 | `owner.register` sem txId → `receipt_required_no_tx_id`, caso inalterado |

**Resultado capturado (2026-06-16):**
```
# tests 9
# suites 8
# pass 9
# fail 0
# duration_ms 6178
```

---

### Passo 2 — Validação de métricas, alertas e runbook (H1 + H2 + H4)

```bash
pnpm test:imob-worker:observability
```

Roda H1 → H2 → H4 em sequência.

**Resultado capturado (2026-06-16):**

```
# H1 — ImobWorkerMetrics
# tests 14  # suites 6  # pass 14  # fail 0  # duration_ms 774

# H2 — ImobWorkerAlerts
# tests 21  # suites 8  # pass 21  # fail 0  # duration_ms 255

# H4 — Runbook validation
# tests 25  # suites 5  # pass 25  # fail 0  # duration_ms 251
```

---

### Passo 3 — Verificação de métricas em `/metrics-prom`

Com o servidor API em execução:

```bash
curl -s http://localhost:3001/metrics-prom | grep imob_
```

Saída esperada (após worker processar ao menos 1 job):

```
# IMOB Worker Mutation counters
imob_run_completed_jobs_total{actionId="owner.register"} 1
imob_post_run_mutations_applied_total{actionId="owner.register",requiresTxId="true",terminal="false"} 1
```

Os counters são acumulativos em memória (in-process). Reiniciar o servidor reseta os contadores.

---

### Passo 4 — Verificação de alertas (avaliação manual)

```typescript
import { evaluateImobWorkerAlerts, evaluateImobWorkerStall } from "./apps/api/src/workers/imobWorkerAlerts";
import { getCounterSnapshot } from "./apps/api/src/workers/imobWorkerMetrics";

// Avaliar alertas no snapshot atual
const alerts = evaluateImobWorkerAlerts(getCounterSnapshot());
console.log(alerts); // [] = all-clear
```

Todas as 7 regras avaliáveis via `pnpm test:imob-worker:alerts` (21/21 pass).

---

## Evidência de E2E worker (H3)

- **Arquivo:** `apps/api/src/tests/imob-post-run-mutation-e2e.test.ts`
- **Cenários:** E2E-01..E2E-08 (9 testes em 8 suítes)
- **Gate CI:** `.github/workflows/imob-worker-e2e.yml` — bloqueia merge em `main` se qualquer cenário falhar
- **Resultado local confirmado:** 9/9 pass, `duration_ms ~6s`, exit limpo

---

## Evidência de métricas (H1)

- **Módulo:** `apps/api/src/workers/imobWorkerMetrics.ts`
- **4 counters:** `jobs_total`, `mutations_applied_total`, `skips_total{reason}`, `failures_total{reason}`
- **12 pontos de incremento** no `imobPostRunMutationWorker.ts`
- **Endpoint:** `/metrics-prom` expõe os counters em formato Prometheus text
- **Zero PII** em labels — verificado em T-M6
- **Resultado local confirmado:** 14/14 pass

---

## Evidência de alertas (H2)

- **Módulo:** `apps/api/src/workers/imobWorkerAlerts.ts`
- **7 regras:** IMOB-W-001..IMOB-W-007
- **Avaliadores puros** — sem dependências externas, sem PII em outputs
- **Thresholds configuráveis** via `AlertConfig`
- **Resultado local confirmado:** 21/21 pass (T-A1..T-A8)

---

## Link para runbook H4

Runbook operacional: [docs/ops/runbooks/imob-worker-observability.md](../../../runbooks/imob-worker-observability.md)

Monitor de skip reasons: [docs/ops/evidence/latest/imob-worker-observability/h4-skip-reason-monitor.md](h4-skip-reason-monitor.md)

---

## Checklist de encerramento da frente (sem PII)

- [x] H1 — Métricas: 14/14 testes, 4 counters, 12 pontos, `/metrics-prom` atualizado
- [x] H2 — Alertas: 21/21 testes, 7 regras IMOB-W-001..IMOB-W-007, zero PII em AlertEvent
- [x] H3 — CI Regression Gate: 9/9 testes E2E, gate ativo em `main`/`release/**`
- [x] H4 — Runbook + Monitor: 25/25 testes, runbook completo por ruleId, política de PII
- [x] H5 — Demo/validação final: este artefato + resultados de testes confirmados
- [x] Script agregador: `pnpm test:imob-worker:observability` (H1 + H2 + H4)
- [x] EVIDENCE_INDEX: atualizado após cada item
- [x] Nenhum código funcional alterado: outcome map, guards, React/Chat, MutationService inalterados

---

## Correção H1 — teardown do metrics test

Durante esta sessão foi identificado que `pnpm test:imob-worker:metrics` pendurava indefinidamente. Causa raiz: o módulo `@repo/db` cria um `pg.Pool` ao ser importado (module-level singleton), que mantém timers internos mesmo sem queries abertas.

**Fixes aplicados:**
1. `imob-worker-metrics.test.ts`: adicionado `after()` hook com `imobRunCompletedQueue.close()` + `closePrismaResources()` para fechar handles corretamente
2. `package.json` script `test:imob-worker:metrics`: adicionado `--test-force-exit` (Node.js 22 flag) para garantir exit limpo

Mesma raiz documentada em H3 para o E2E test — padrão consistente no projeto: qualquer arquivo que importe `imobPostRunMutationWorker.ts` transitivamente (que por sua vez importa `imobRunCompletedQueue` e `@repo/db`) precisa fechar essas connections no teardown.

---

## Status final da frente

**IMOB Worker Observability & Regression Gates — ENCERRADA/EVIDENCIADA**

| Item | Testes | Status |
|---|---|---|
| H1 — Métricas do worker | 14/14 | EVIDENCIADO |
| H2 — Alertas de fila | 21/21 | EVIDENCIADO |
| H3 — CI Regression Gate | 9/9 | EVIDENCIADO |
| H4 — Runbook + Monitor | 25/25 | EVIDENCIADO |
| H5 — Demo final | este artefato | EVIDENCIADO |

**Total: 69/69 testes passando. Zero alterações no fluxo funcional.**

Próximo passo operacional: H5 com screen recording em staging (quando ambiente disponível) para substituir esta validação por uma demo interativa completa da cadeia CC→Chat→run→worker→CC refresh.
