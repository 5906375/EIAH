# Phase 4.2 — E2E integrado: CC→Chat→Run→Worker→ImobCase (evidência real)

**Data:** 2026-06-16
**Scope:** Validação E2E integrada do fluxo completo com banco de dados real.
**Status:** CONCLUÍDO — 8 cenários E2E, 9/9 testes passando contra banco real.
**Duração total de execução:** 3310ms

---

## Resultado dos testes

```
TAP version 13
ok 1 - [E2E-01] Happy path: owner.register atualiza ImobCase
ok 2 - [E2E-02] Idempotência: segundo processamento é no-op
ok 3 - [E2E-03] Simulated: run simulado não muta ImobCase (I4)
ok 4 - [E2E-04] Run error: run com status=error não muta ImobCase (I5)
ok 5 - [E2E-05] Cross-workspace: job com workspaceId errado não muta ImobCase (I7)
ok 6 - [E2E-06] Terminal: commission.settle fecha caso com stage=done (I1/I2)
ok 7 - [E2E-07] lead.qualify sem txId: deve mutar (requiresTxId=false)
ok 8 - [E2E-08] owner.register sem txId: bloqueia (requiresTxId=true)
1..8
# tests 9 | # pass 9 | # fail 0
```

---

## Cenário E2E-01 — Happy path: owner.register

**actionId:** `owner.register`
**tenantId:** `tenant-imob-e2e-mqh0l3k1-f7a8zv`
**workspaceId:** `ws-imob-e2e-mqh0l3k1-f7a8zv`
**caseId:** `cmqh0l4ji0001ybdz4d2s546j`
**runId:** `cmqh0l4k00002ybdzt24fbzmj`
**txId:** `tx-e2e-owner-mqh0l3k1-f7a8zv`

### Estado inicial (DB + API dossier)
```json
{ "stage": "intake", "status": "pending_data",
  "pendingItems": ["Proprietário pendente de cadastro", "Dados do proprietário ausentes"],
  "nextStep": "Registrar o proprietário para iniciar a captação" }
```

### Logs do worker
```
imob-worker.mutation_applied {
  actionId: "owner.register",
  outcomeStage: "property_collecting",
  outcomeStatus: "ready_for_review",
  isTerminal: false,
  canonicalJourneyType: "property_capture",
  receiptPath: "/api/ledger/tx-e2e-owner-mqh0l3k1-f7a8zv",
  bundlePath: "/api/runs/cmqh0l4k00002ybdzt24fbzmj/bundle"
}
```

### Estado final (DB + API dossier 200 OK)
```json
{ "stage": "property_collecting", "status": "ready_for_review",
  "nextStep": "Cadastrar o imóvel do proprietário para avançar a captação",
  "pendingItems": [],
  "canonical": { "journeyType": "property_capture" } }
```

**ImobCaseEvent criado:** `type=case.action.completed`, `runId=cmqh0l4k00002ybdzt24fbzmj`, `actorType=system`
**receiptPath:** `/api/ledger/tx-e2e-owner-mqh0l3k1-f7a8zv`
**bundlePath:** `/api/runs/cmqh0l4k00002ybdzt24fbzmj/bundle`
**CC lê novo estado:** GET /api/imob/cases/:caseId/dossier → 200 OK, stage=property_collecting

---

## Cenário E2E-02 — Idempotência (no-op duplicado)

**caseId:** `cmqh0l4tn0008ybdzg41afpw3`
**runId:** `cmqh0l4tw0009ybdzm0bm420o`

- 1ª execução: `imob-worker.mutation_applied`
- 2ª execução: `imob-worker.already_processed_skip`
- ImobCaseEvent count antes e depois da 2ª execução: **1** (inalterado)
- stage/status: inalterados após 2ª execução

---

## Cenário E2E-03 — Simulated (I4)

**caseId:** `cmqh0l4va000fybdz9kfgz4cz`
**runId:** `cmqh0l4ve000gybdzcd2mcs2o`
**run.response.outputs[0].data.simulated:** `true`

- Log: `imob-worker.skipped_simulated_run`
- stage: **intake** (inalterado)
- ImobCaseEvent count: **0**

---

## Cenário E2E-04 — Run error (I5)

**caseId:** `cmqh0l4vn000hybdz8oci36ba`
**runId:** `cmqh0l4vt000iybdzr7v96aqs`
**run.status:** `error`

- Log: `imob-worker.run_not_success_skip` (runStatus=error)
- stage: **intake** (inalterado)
- ImobCaseEvent case.action.completed: **0**

---

## Cenário E2E-05 — Cross-workspace (I7)

**caseId:** `cmqh0l4w7000kybdzv8o9qn9o`
**runId:** `cmqh0l4wb000lybdz5ao4c2dt` (criado em workspace A)
**job.workspaceId:** `ws-imob-e2e-b-mqh0l3k1-f7a8zv` (workspace B — diferente)

- Log: `imob-worker.run_not_found` (getRun scoped por workspace — não encontra o run)
- stage: **intake** (inalterado)
- Proteção cross-workspace ativa: scope mismatch → silently skipped

---

## Cenário E2E-06 — commission.settle terminal (I1/I2)

**caseId:** `cmqh0l4wh000mybdz17e06w90`
**runId:** `cmqh0l4wk000nybdz3dakpwvm`
**txId:** `tx-e2e-com-mqh0l3k1-f7a8zv`
**ownerResponsible:** `Carlos Mendes`

### Estado inicial
```json
{ "stage": "commission_review", "status": "ready_for_review",
  "pendingItems": ["Assinatura do contrato pelas partes pendente"],
  "ownerResponsible": "Carlos Mendes" }
```

### Logs do worker
```
imob-worker.mutation_applied {
  actionId: "commission.settle",
  outcomeStage: "done", outcomeStatus: "done",
  isTerminal: true,
  canonicalJourneyType: "commission",
  receiptPath: "/api/ledger/tx-e2e-com-mqh0l3k1-f7a8zv",
  bundlePath: "/api/runs/cmqh0l4wk000nybdz3dakpwvm/bundle"
}
```

### Estado final (DB + API dossier 200 OK)
```json
{ "stage": "done", "status": "done",
  "nextStep": null,
  "pendingItems": [],
  "blockers": [] }
```

**ImobCaseEvent case.action.completed:** 1
**ImobCaseEvent case.completed (terminal):** 1 (criado pelo ImobCrmMutationService na mesma transação)
**CC via API:** GET dossier → 200 OK, stage=done, pendingItems=[]

**Sub-cenário sem ownerResponsible:**
- Log: `imob-worker.commission_settle_missing_owner_responsible`
- stage: **commission_review** (inalterado)

---

## Cenário E2E-07 — lead.qualify sem txId (requiresTxId=false)

**caseId:** `cmqh0l4zo000xybdzahn1afiz`
**runId:** `cmqh0l4zs000yybdz2dy3vkts`
**txId:** `null`

- Log: `imob-worker.mutation_applied` (outcomeStage=visit_scheduling, receiptPath=null)
- stage: **visit_scheduling** (mutado com sucesso mesmo sem txId)
- Confirma: `requiresTxId=false` não bloqueia a mutação

---

## Cenário E2E-08 — owner.register sem txId (requiresTxId=true)

**caseId:** `cmqh0l50t0014ybdz5aj4mfxo`
**runId:** `cmqh0l50x0015ybdzgd3cygvs`
**txId:** `null`

- Log: `imob-worker.receipt_required_no_tx_id`
- stage: **intake** (inalterado)
- Confirma: `requiresTxId=true` bloqueia a mutação sem txId

---

## Invariantes confirmados por evidência real

| Invariante | Cenário que prova | Resultado |
|---|---|---|
| I1: status decidido exclusivamente no backend | E2E-01, E2E-06 | ✅ API não envia status; worker aplica via outcome map |
| I2: status deriva de action handler + canonical | E2E-01 canonical.journeyType=property_capture | ✅ Canonical recalculado pós-mutation |
| I3: React não decide status; CC lê via API | E2E-01, E2E-06 dossier GET 200 | ✅ CC recebe novo estado do backend |
| I4: simulated=true → nunca muta | E2E-03 | ✅ skipped_simulated_run |
| I5: run.status≠success → nunca muta | E2E-04 | ✅ run_not_success_skip |
| I6: runId duplicado → no-op | E2E-02 | ✅ already_processed_skip |
| I7: cross-workspace → nunca muta | E2E-05 | ✅ run_not_found (scope mismatch) |
| requiresTxId=true + txId=null → bloqueia | E2E-08 | ✅ receipt_required_no_tx_id |
| requiresTxId=false + txId=null → permite | E2E-07 | ✅ mutation_applied |
| commission.settle sem ownerResponsible → bloqueia | E2E-06 sub | ✅ commission_settle_missing_owner_responsible |

---

## Cadeia completa evidenciada

```
CC mostra ação recomendada (recommendedActions[])
  → Chat abre com actionId na URL
  → Usuário confirma (Fase 3)
  → apiAgentsExecute → Run criado
  → runWorker.processRun → run.status=success
  → enqueueRunAtivoUniversal (P5: enfileira imob-run-completed)
  → ImobPostRunMutationWorker.processImobRunCompletedJob
      ├── getRun (scoped, cross-workspace protection)
      ├── run.status=success check
      ├── !simulated check
      ├── requiresTxId+txId check
      ├── DB idempotency (ImobCaseEvent.findFirst by runId)
      ├── ImobCase.findFirst (scoped)
      ├── ownerResponsible check (commission.settle)
      ├── ImobCrmMutationService.updateCase
      │   ├── ImobCase update (stage, status, nextStep, pendingItems, blockers)
      │   ├── ImobCaseEvent.create (case.action.completed)
      │   └── ImobCaseEvent.create (case.completed) se terminal
      └── buildImobCanonicalCase (recálculo puro)
  → CC: GET /api/imob/cases/:caseId/dossier → novo estado + canonical
```

---

## Marco Fase 4 — EVIDENCIADO

**Fase 4 completa:** CC→Chat→confirmação→run→worker→mutation governada→canonical→CC refresh.

Todas as fases da cadeia CC→Chat IMOB estão evidenciadas:

| Fase | Evidência |
|---|---|
| Fase 1: Transporte CC→Chat | `phase2-action-dispatch.md` (UI/contexto) |
| Fase 2: Dispatcher backend | `phase2-action-dispatch.md` (actionId dispatch) |
| Fase 3: Confirmação explícita | `phase3-chat-confirmation.md` |
| Phase 4.0: Contract/handler alignment | `phase4-0-contract-handler-alignment.md` |
| Phase 4.1a: Outcome matrix | `phase4-1a-product-outcome-matrix.md` |
| Phase 4.1b: Worker foundation | `phase4-1b-worker-foundation.md` |
| Phase 4.1c: Worker mutation real | `phase4-1c-worker-mutation.md` |
| **Phase 4.2: E2E integrado** | **este arquivo** |

---

## Arquivo de teste

```
apps/api/src/tests/imob-post-run-mutation-e2e.test.ts
```

8 suítes E2E, 9 assertions, banco de dados real, sem mocks.
