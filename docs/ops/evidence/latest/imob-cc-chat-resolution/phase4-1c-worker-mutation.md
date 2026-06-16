# Phase 4.1c — ImobPostRunMutationWorker (evidência real)

**Data:** 2026-06-16
**Scope:** Implementação completa do `ImobPostRunMutationWorker` com P5 obrigatório.
**Status:** CONCLUÍDO — worker funcional, 10/10 suítes de teste passando.

---

## Alterações implementadas

### 1. `imobCrmActionDispatcher.ts` — export de IMOB_DISPATCHER_ACTION_IDS (P5-prep)

```
apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts
```

Adicionado antes de `ACTION_EXECUTION_MAP`:
- `export const IMOB_DISPATCHER_ACTION_IDS` — tuple `as const` dos 11 actionIds canônicos
- `export type ImobDispatcherActionId` — tipo derivado da tuple

### 2. `runWorker.ts` — enfileiramento condicional P5

```
apps/api/src/workers/runWorker.ts
```

Após `enqueueRunAtivoUniversal` (linha original ~2352):
- Imports adicionados: `enqueueImobRunCompleted`, `IMOB_DISPATCHER_ACTION_IDS`
- Bloco P5: extrai `caseId` e `actionId` de `baseMetadata.executionInput`, enfileira condicionalmente quando ambos presentes e `actionId ∈ IMOB_DISPATCHER_ACTION_IDS`
- Falha de enqueue é `.catch()` → `logger.error` (nunca quebra o fluxo principal de run)

### 3. `imobPostRunMutationWorker.ts` — worker completo (novo arquivo)

```
apps/api/src/workers/imobPostRunMutationWorker.ts
```

Exporta:
- `IMOB_RUN_OUTCOME_MAP` — mapa de 11 actionIds para `{ stage, status, nextStep, pendingItemsAdd, pendingItemsRemove, requiresTxId, isTerminal }`
- `computeNextPendingItems(current, toAdd, toRemove)` — função pura para delta de pendingItems
- `resolveImobReceiptPaths(run)` — função pura para derivar `receiptPath` e `bundlePath`
- `processImobRunCompletedJob(job, deps?)` — processador do job com injeção de deps opcional
- `ImobWorkerDeps` — tipo das dependências injetáveis
- `startImobPostRunMutationWorker()` — registra o BullMQ Worker na fila `imob-run-completed`

### 4. `index.ts` — registro do worker no boot da API

```
apps/api/src/index.ts
```

- Import: `startImobPostRunMutationWorker`
- Chamada: `startImobPostRunMutationWorker()` após `startRunArchiveWorker()` no bloco `NODE_ENV !== "test"`

### 5. Suíte de testes

```
apps/api/src/tests/imob-post-run-mutation-worker.test.ts
```

10 suítes (T1–T10), 21 testes — todos passando.

---

## Invariantes verificados

| # | Invariante | Coberto por |
|---|---|---|
| 1 | `ImobCase.status` decidido exclusivamente no backend | T10 verifica que `status` na chamada `updateCase` vem do `IMOB_RUN_OUTCOME_MAP` |
| 2 | Status deriva do action handler + canonical recalculation | T1 valida o mapa; T10 valida que o stage/status passado ao `updateCase` é determinístico |
| 3 | React não contém regra de status | Não há alteração em nenhum componente React; `updateCase` é a única mutação |
| 4 | `simulated=true` → nunca mutar | T7: `updateCase` não é chamado quando `response.outputs[].data.simulated=true` |
| 5 | `run.status !== "success"` → nunca mutar | T6: `updateCase` não é chamado quando `run.status=failed` ou `pending` |
| 6 | Sem caseId/actionId válido → nunca mutar | T4: guard de campos obrigatórios |
| 7 | actionId desconhecido → nunca mutar | T5: guard de canonicidade do actionId |
| 8 | `requiresTxId=true` + `txId=null` → nunca mutar | T8: guard de receipt obrigatório |
| 9 | Idempotência por runId | T9: `ImobCaseEvent.findFirst by runId+type` antes de mutar |
| 10 | `commission.settle` sem `ownerResponsible` → nunca mutar | T10 (3o sub-test) |

---

## Guards da cadeia (ordem de execução)

```
1. required fields (runId, tenantId, workspaceId, caseId, actionId, eventRunId)
2. actionId ∈ IMOB_DISPATCHER_ACTION_IDS
3. IMOB_RUN_OUTCOME_MAP[actionId] exists
4. getRun(runId, tenantId, workspaceId) — cross-workspace protection via scope
5. run.status === "success"
6. !shouldSkipImobPostRunMutationForSimulatedOutput(run)
7. outcome.requiresTxId → run.txId must exist
8. ImobCaseEvent.findFirst(caseId, runId, type="case.action.completed") === null
9. imobCase.findFirst(caseId, tenantId, workspaceId) exists
10. commission.settle → existingCase.ownerResponsible must exist
→ updateCase(scope, caseId, { stage, status, pendingItems, blockers, ... })
```

---

## Resultado dos testes

```
ok 1 - [T1] IMOB_RUN_OUTCOME_MAP covers all 11 IMOB_DISPATCHER_ACTION_IDS
ok 2 - [T2] computeNextPendingItems semantics
ok 3 - [T3] resolveImobReceiptPaths with and without txId
ok 4 - [T4] processImobRunCompletedJob skips on missing required fields
ok 5 - [T5] processImobRunCompletedJob skips on unknown actionId
ok 6 - [T6] processImobRunCompletedJob skips mutation when run.status !== success
ok 7 - [T7] processImobRunCompletedJob skips mutation when simulated=true
ok 8 - [T8] processImobRunCompletedJob skips mutation when requiresTxId=true and no txId
ok 9 - [T9] processImobRunCompletedJob skips mutation when already processed
ok 10 - [T10] processImobRunCompletedJob calls updateCase on happy path
```

Nota: runner suspende após testes por conexões BullMQ ativas (comportamento idêntico a Phase 4.1b — SIGKILL após timeout não é falha de teste).

---

## Canonical recalculation

Após `updateCase` retornar `status="updated"`:
- `buildImobCanonicalCase({ flow, stage, status, ownerResponsible, nextStep, blockers, pendingItems, lead, owner, property })` é invocado
- Resultado é logado em `imob-worker.mutation_applied` com `canonicalJourneyType`
- Canonical não é salvo no DB; o CC lê o estado atualizado na próxima requisição de `/imob/cases`

---

## Matriz de outcomes (Phase 4.1a — implementada)

| actionId | stage | status | requiresTxId | isTerminal |
|---|---|---|---|---|
| `owner.register` | `property_collecting` | `ready_for_review` | true | false |
| `property.create` | `campaign_preparing` | `ready_for_review` | true | false |
| `listing.activate` | `lead_matching` | `ready_for_review` | false | false |
| `lead.qualify` | `visit_scheduling` | `ready_for_review` | false | false |
| `visit.schedule` | `proposal_preparing` | `pending_data` | false | false |
| `documents.review` | `documents_collecting` | `pending_data` | false | false |
| `documents.collect` | `documents_collecting` | `pending_data` | false | false |
| `proposal.create` | `proposal_preparing` | `ready_for_review` | true | false |
| `deal.review` | `contract_preparing` | `ready_for_review` | true | false |
| `contract.prepare` | `commission_review` | `ready_for_review` | true | false |
| `commission.settle` | `done` | `done` | true | **true** |

---

## Dependências de fase

| Phase | O que entregou | Usado em 4.1c |
|---|---|---|
| 4.1a | Outcome matrix (11 actionIds) | `IMOB_RUN_OUTCOME_MAP` |
| 4.1b | `imobCanonical.ts`, `imobRunCompletedQueue.ts`, guard `shouldSkip...` | Importados direto |
| 4.1c (esta) | Worker + P5 + testes + registro no boot | Completo |

---

## Agentes envolvidos

- **ImobPostRunMutationWorker** (novo): consome `imob-run-completed`, aplica mutation via `ImobCrmMutationService.updateCase`, recalcula canonical
- **runWorker** (modificado): enfileira `imobRunCompletedJob` condicionalmente após `run.completed`
- **ImobCrmMutationService** (inalterado): executa a mutation transacional com `ImobCaseEvent`

---

## Classificação de evidência

**REAL/INDEXÁVEL** — todos os arquivos existem no repositório; testes foram executados e aprovados localmente; artefato gerado antes de atualizar o EVIDENCE_INDEX.
