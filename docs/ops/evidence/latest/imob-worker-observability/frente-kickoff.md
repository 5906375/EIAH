# IMOB Worker Observability & Regression Gates — Kickoff

**Data de abertura:** 2026-06-16
**Status:** PROPOSTA — frente definida, sem implementação iniciada.
**Frente anterior:** CC→Chat IMOB (Fases 1–4.2) — ENCERRADA/EVIDENCIADA.
**Premissa:** nenhuma nova feature funcional antes deste hardening.

---

## Contexto

A cadeia CC→Chat→confirmação→run→worker→mutation governada→canonical→CC refresh está integralmente evidenciada contra banco de dados real (Phase 4.2, 9/9 testes E2E). A nova frente não altera lógica funcional — protege e observa o fluxo existente.

Texto de marco (roadmap):

> Fase 4 IMOB CC→Chat evidenciada: cadeia completa CC→Chat→confirmação→run→worker→mutation governada→canonical→CC refresh validada contra banco real, com IDs reais, idempotência, simulated guard, run failure guard, cross-workspace fail-closed, receipt/txId policy e summary final REAL/INDEXÁVEL.

---

## Objetivo

Garantir que o fluxo evidenciado continue protegido por métricas, alertas e regressão automatizada — sem tocar na lógica funcional do worker, dispatcher, mutation service ou canonical.

---

## Pacote de hardening (5 itens)

### H1 — Métricas do worker

**Arquivo alvo:** `apps/api/src/workers/imobPostRunMutationWorker.ts` + `apps/api/src/routes/metrics-prom.ts` (ou equivalente)

Contadores a implementar:

```
imob_run_completed_jobs_total                    # jobs recebidos
imob_post_run_mutations_applied_total            # mutations aplicadas com sucesso
imob_post_run_skips_total{reason}                # skips por reason code:
  - simulated
  - run_not_success
  - no_txid
  - already_processed
  - cross_workspace
  - unknown_action
  - case_not_found
  - commission_settle_missing_owner
imob_post_run_failures_total                     # jobs que falharam (após retries)
imob_case_duplicate_event_skips_total            # idempotência DB ativada
```

Implementação: incremento nos pontos de log existentes (`imob-worker.*`). Zero mudança de fluxo.

**DoD:** métricas expostas no endpoint Prometheus; counters incrementados em todos os branches do processador; teste unitário verifica que o counter correto é incrementado por path.

---

### H2 — Alertas de fila

**Arquivo alvo:** configuração de alertas (Grafana/Prometheus ou equivalente do stack)

Regras:

| Condition | Severity | Ação |
|---|---|---|
| Fila `imob-run-completed` sem jobs processados > 5 min (e jobs pending > 0) | WARNING | Worker potencialmente travado; checar Redis e startup |
| `imob_post_run_failures_total` aumenta > 0 em 10 min | ERROR | Jobs falhando após retries; inspecionar DLQ BullMQ |
| `imob_post_run_skips_total{reason=no_txid}` para ações HIGH | ERROR | Ação HIGH sem txId = falha de ledger upstream |
| `imob_post_run_skips_total{reason=simulated}` > threshold em produção | WARNING | Engine emitindo `simulated=true` indevidamente |
| BullMQ job `imob-run-completed` com `attemptsMade >= maxAttempts` | ERROR | Job exauriu retries; intervenção manual necessária |

**DoD:** pelo menos 3 regras de alerta ativas em staging; documento de runbook associado.

---

### H3 — E2E recorrente em CI/staging

**Arquivo alvo:** `apps/api/src/tests/imob-post-run-mutation-e2e.test.ts` (já existe — 9/9 passando)

Ações:
- Adicionar ao pipeline de staging como smoke gate obrigatório pré-deploy
- Garantir que o teste roda contra banco de staging (não apenas local)
- Adicionar ao `package.json` script `test:e2e:imob` separado de `test:unit`
- Confirmar que teardown completo (`closePrismaResources`, `finalizeHttpContractCleanup`) impede leak entre execuções CI

**DoD:** pipeline executa o teste E2E IMOB antes de cada merge para `main`; falha bloqueia o deploy; resultado visível no CI dashboard.

---

### H4 — Monitor de skipped/blocked reasons

**Objetivo:** dashboard ou log agregado que mostra, por período (diário/semanal):
- Top skip reasons por volume
- Taxa de `no_txid` por actionId (detectar actionIds HIGH que não passam txId)
- Taxa de `already_processed` (idempotência ativada — sinal de retry loop ou publisher duplicado)
- Taxa de `simulated` em produção (não deve aparecer)

**Implementação sugerida:** query Grafana sobre `imob_post_run_skips_total{reason}` + alertas de anomalia; ou log analytics sobre `imob-worker.*` logs.

**DoD:** monitor visível ao oncall; revisão semanal definida.

---

### H5 — Demo final controlada

**Roteiro mínimo** (ambiente de staging com dados reais):

1. Abrir Command Center → selecionar caso em `stage=intake` com `owner.register` em `recommendedActions`
2. Clicar CTA "Executar no chat" → verificar URL com `actionId=owner.register`
3. Chat abre com badge "ação direcionada — aguardando confirmação"
4. Confirmar → run criado → worker processa
5. Mostrar logs: `imob-worker.mutation_applied` com `outcomeStage=property_collecting`, `receiptPath`
6. CC: auto-refresh → card do caso mostra `stage=property_collecting`, `status=ready_for_review`
7. Dossier: `ImobCaseEvent.case.action.completed` presente com `runId`

**Resultado esperado:** demo completa em < 3 min com zero intervenção manual.

**DoD:** demo gravada ou com screen recording; artefato em `docs/ops/evidence/latest/imob-worker-observability/demo-final.md`.

---

## Invariantes que NÃO mudam nesta frente

| Invariante | Proteção |
|---|---|
| `ImobCase.status` decidido exclusivamente no backend | Não tocar em `imobPostRunMutationWorker.ts` flow |
| React sem regra de status | Não tocar em `chat.tsx` ou CC para lógica |
| `processImobRunCompletedJob` sem efeitos colaterais novos | Métricas como side-effect puro (counter++) |
| Canonical recalculation via `buildImobCanonicalCase` (puro) | Não adicionar escrita de canonical ao DB |

---

## Sequência recomendada

```
H3 (E2E em CI) → H1 (métricas) → H2 (alertas) → H4 (monitor) → H5 (demo)
```

H3 primeiro: protege o trabalho já evidenciado imediatamente. H1 antes de H2: alertas dependem das métricas. H5 fecha o ciclo como artefato de comunicação.

---

## DoD da frente

- [ ] H1: counters no worker + teste verificando incremento por path
- [ ] H2: 3+ alertas ativos em staging + runbook
- [ ] H3: E2E IMOB em CI como gate de merge
- [ ] H4: monitor de skip reasons visível ao oncall
- [ ] H5: demo gravada + artefato `demo-final.md`
- [ ] EVIDENCE_INDEX atualizado após cada item concluído
- [ ] Nenhuma alteração no fluxo funcional evidenciado
