# CC→Chat IMOB — Marco Final de Evidência (Fases 1–4.2)

**Data de consolidação:** 2026-06-16
**Status:** FRENTE EVIDENCIADA — operacionalmente validada contra banco de dados real.
**Arquivo de referência:** `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`

---

## Cadeia final validada

```
Command Center
  └─▶ CTA "Executar no chat" (actionId + reasonCode na URL)
        └─▶ Chat IMOB abre com contexto dirigido
              └─▶ Usuário confirma (badge "ação direcionada — aguardando confirmação")
                    └─▶ apiAgentsExecute → Run criado
                          └─▶ runWorker.processRun → run.status = success
                                ├─▶ enqueueRunAtivoUniversal (universal)
                                └─▶ enqueueImobRunCompleted (P5 condicional)
                                      └─▶ ImobPostRunMutationWorker.processImobRunCompletedJob
                                            ├─▶ [10 guards em sequência]
                                            ├─▶ ImobCrmMutationService.updateCase
                                            │   ├─▶ ImobCase.update (stage, status, nextStep,
                                            │   │                    pendingItems, blockers)
                                            │   ├─▶ ImobCaseEvent.create (case.action.completed)
                                            │   └─▶ ImobCaseEvent.create (case.completed) se terminal
                                            └─▶ buildImobCanonicalCase (recálculo puro)
                                                  └─▶ CC: GET /api/imob/cases/:id/dossier
                                                            → novo stage + status + canonical
```

**Invariante central:** `ImobCase.status` é decidido exclusivamente no backend por este worker. React não contém regra de status.

---

## Índice de evidências por fase

| Fase | Escopo | Arquivo | Testes |
|---|---|---|---|
| Fase 1 | Transporte CC→Chat (UI/contexto) | `phase2-action-dispatch.md`* | 5/5 |
| Fase 2 | Dispatcher backend (actionId→executionRequest) | `phase2-action-dispatch.md` | 16/16 |
| Fase 3 | Confirmação explícita antes de apiAgentsExecute | `phase3-chat-confirmation.md` | 12/12 |
| Phase 4.0 | Contract/handler alignment (11 actionIds, fail-closed stubs) | `phase4-0-contract-handler-alignment.md` | 5/5 suítes |
| Phase 4.1 pré-flight | Investigação técnica inicial (NO-GO → P1–P4 identificados) | `phase4-1-worker-preflight.md` | — |
| Phase 4.1a | Outcome matrix de produto (11 actionIds × outcome completo) | `phase4-1a-product-outcome-matrix.md` | — |
| Phase 4.1b | Worker foundation (canonical extract, guard simulated, queue) | `phase4-1b-worker-foundation.md` | 17/17 |
| Phase 4.1c pré-flight | Verificação pré-implementação (GO com P5) | `phase4-1c-worker-preflight.md` | — |
| Phase 4.1c | ImobPostRunMutationWorker real + P5 wiring | `phase4-1c-worker-mutation.md` | 10/10 suítes |
| **Phase 4.2** | **E2E integrado contra banco real** | **`phase4-2-e2e-worker-resolution.md`** | **9/9** |

*Fase 1 e 2 compartilham o mesmo artefato de evidência.

---

## Arquivos criados/modificados nesta frente

### Backend

| Arquivo | O que faz |
|---|---|
| `apps/api/src/services/imob/imobCanonical.ts` | Tipos e funções canônicas extraídos de `routes/imob.ts`; `buildImobCanonicalCase`, `shouldSkipImobPostRunMutationForSimulatedOutput` |
| `apps/api/src/queues/imobRunCompletedQueue.ts` | Fila BullMQ `imob-run-completed` com payload tipado e idempotência por jobId |
| `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` | `IMOB_DISPATCHER_ACTION_IDS` exportado (11 actionIds) |
| `apps/api/src/workers/imobPostRunMutationWorker.ts` | Worker completo: `IMOB_RUN_OUTCOME_MAP`, 10 guards, `updateCase`, `buildImobCanonicalCase`, `startImobPostRunMutationWorker()` |
| `apps/api/src/workers/runWorker.ts` | P5: enfileiramento condicional após `enqueueRunAtivoUniversal` |
| `apps/api/src/index.ts` | `startImobPostRunMutationWorker()` no boot |

### Frontend (fases anteriores)

| Arquivo | O que faz |
|---|---|
| `apps/web/src/features/imob/imobCommandCenterHelper.ts` | CTA com actionId/reasonCode/status na URL |
| `apps/web/src/features/imob/imobChatDirectedAction.ts` | Gate `shouldUseDirectedActionFlow`, confirmação antes de execute |
| `apps/web/src/pages/app/imob/chat.tsx` | Recebe contexto dirigido da URL, exibe badge, aguarda confirmação |

### Testes

| Arquivo | Escopo | Testes |
|---|---|---|
| `apps/api/src/tests/imob-crm-action-dispatcher.test.ts` | Dispatcher puro (Fase 2) | 16/16 |
| `apps/web/src/features/imob/imobChatPhase3DirectedAction.test.ts` | Confirmação frontend (Fase 3) | 12/12 |
| `apps/api/src/tests/imob-worker-foundation-phase4-1b.test.ts` | Foundation unitária (Phase 4.1b) | 17/17 |
| `apps/api/src/tests/imob-post-run-mutation-worker.test.ts` | Worker unitário com deps injetados (Phase 4.1c) | 21/10 suítes |
| `apps/api/src/tests/imob-post-run-mutation-e2e.test.ts` | E2E banco real (Phase 4.2) | 9/8 cenários |

---

## Invariantes operacionais — status final

| # | Invariante | Provado por |
|---|---|---|
| I1 | `ImobCase.status` decidido exclusivamente no backend | E2E-01, E2E-06 — worker aplica via outcome map, React não participa |
| I2 | Status deriva de action handler + canonical recalculation | E2E-01 canonical.journeyType, T1 (outcome map), T10 (updateCase input) |
| I3 | React não contém regra de status; CC lê via API | E2E-01, E2E-06 — GET dossier 200 OK com novo estado + canonical |
| I4 | `simulated=true` → nunca muta | E2E-03 (banco real), T7 (unitário) |
| I5 | `run.status ≠ success` → nunca muta | E2E-04 (banco real), T6 (unitário) |
| I6 | Execução duplicada → no-op (idempotência DB por runId) | E2E-02 (banco real), T9 (unitário) |
| I7 | Cross-workspace → nunca muta | E2E-05 (banco real), T5 (unitário) |
| I8 | `requiresTxId=true` + `txId=null` → bloqueia | E2E-08 (banco real), T8 (unitário) |
| I9 | `commission.settle` sem `ownerResponsible` → bloqueia | E2E-06 sub (banco real) |
| I10 | Sem `caseId`/`actionId`/campos obrigatórios → retorna antes de qualquer DB | T4 (unitário) |

---

## Recomendações de hardening operacional

### 1. Regressão contínua

Adicionar `imob-post-run-mutation-e2e.test.ts` ao pipeline de staging como smoke obrigatório antes de cada deploy. O teste já lida com cleanup completo.

### 2. Métricas (sugestão de implementação em `apps/api/src/routes/metrics-prom.ts`)

```
imob_run_completed_jobs_total           # jobs recebidos pela fila
imob_post_run_mutations_applied_total   # mutations confirmadas
imob_post_run_skips_total{reason}       # por: simulated, run_error, no_txid, already_processed, cross_workspace
imob_post_run_failures_total            # jobs que falharam após todos os retries
imob_case_duplicate_event_skips_total   # idempotência DB ativada
```

### 3. Alertas recomendados

| Condição | Severidade | Ação |
|---|---|---|
| Fila `imob-run-completed` parada > 5 min | WARNING | Checar Redis e worker startup |
| Jobs com retries esgotados (`removeOnFail=false`) > 0 | ERROR | Inspecionar DLQ do BullMQ |
| `imob_post_run_failures_total` > 0 em 10 min | ERROR | Checar logs do worker |
| `imob_post_run_skips_total{reason=simulated}` alto em produção | WARNING | Verificar se engine está emitindo `simulated=true` indevidamente |
| `imob_post_run_skips_total{reason=no_txid}` para ações HIGH | ERROR | Ação HIGH sem txId = falha de ledger upstream |

### 4. Documentação de produto (próximo ciclo)

Três fluxos a documentar para o usuário final:
- **"Consultar no chat"** — modo consult, sem mutação, badge informativo
- **"Confirmar execução"** — modo execute, badge "ação direcionada", aguarda confirmação explícita
- **"Caso atualizado após run governado"** — estado novo aparece no CC após auto-refresh

### 5. Demo final

Roteiro mínimo para demo curta:
1. Abrir Command Center → selecionar caso com `owner.register` recomendado
2. Clicar "Executar no chat" → chat abre com badge "ação direcionada"
3. Confirmar → run criado → worker processa → CC auto-refresh
4. Mostrar: stage=property_collecting, evento `case.action.completed` no dossier, receiptPath

---

## Texto de marco para roadmap/changelog

> **Fase 4 IMOB CC→Chat — EVIDENCIADA (2026-06-16)**
>
> Fluxo completo CC→Chat→confirmação→run→worker→mutation governada→canonical→CC refresh
> validado em E2E contra banco de dados real. Idempotência por runId, guard de simulated,
> guard de run failure, proteção cross-workspace fail-closed, política de receipt/txId por tier,
> e canonical recalculation pós-mutation — tudo provado com IDs reais no banco de staging.
> `ImobCase.status` é decidido exclusivamente no backend; React não contém nenhuma regra de status.

---

## Arquivos de evidência nesta frente

```
docs/ops/evidence/latest/imob-cc-chat-resolution/
├── phase2-action-dispatch.md          # Fase 1+2: UI/contexto + dispatcher
├── phase3-chat-confirmation.md        # Fase 3: confirmação explícita
├── phase4-preflight.md                # Phase 4 preflight inicial
├── phase4-worker-option-c-decision.md # Decisão arquitetural Option C
├── phase4-0-contract-handler-alignment.md # Phase 4.0: contratos
├── phase4-1-worker-preflight.md       # Phase 4.1 pré-flight (NO-GO)
├── phase4-1a-product-outcome-matrix.md # Phase 4.1a: matriz de produto
├── phase4-1b-worker-foundation.md     # Phase 4.1b: foundation
├── phase4-1c-worker-preflight.md      # Phase 4.1c pré-flight (GO)
├── phase4-1c-worker-mutation.md       # Phase 4.1c: worker real
├── phase4-2-e2e-worker-resolution.md  # Phase 4.2: E2E banco real
└── phase4-final-summary.md            # ← este arquivo
```
