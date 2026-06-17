# Phase 4.1c — Pré-flight Técnico
# CC → Chat IMOB: ImobPostRunMutationWorker — GO/NO-GO

Data: 2026-06-16
Tipo: Investigação técnica pura (sem alteração de código)
Objetivo: verificar se é seguro implementar `ImobPostRunMutationWorker` com chamada a `ImobCrmMutationService.updateCase`
Status do pré-flight: `concluído`
Referências predecessoras:
- `phase4-1-worker-preflight.md` (bloqueadores P1–P4)
- `phase4-1a-product-outcome-matrix.md` (P1 resolvido)
- `phase4-1b-worker-foundation.md` (P2/P3/P4 resolvidos)

---

## INVARIANTES OBRIGATÓRIOS (preservados neste pré-flight)

1. `ImobCase.status` novo é decidido exclusivamente no backend.
2. O status deriva do action handler + canonical recalculation.
3. React não contém regra de status; o Command Center apenas faz auto-refresh e lê o novo estado da API.
4. `simulated=true` → nunca mutar.
5. `run.status !== "success"` → nunca mutar.

---

## Resumo executivo

| # | Item verificado | Status |
|---|----------------|--------|
| 1 | 11 actionIds com outcome da matriz 4.1a | ✅ GO |
| 2 | `run.completed` pode alimentar `imobRunCompletedQueue` | ⚠️ **P5 — BLOCKER** |
| 3 | Worker consegue buscar run por runId | ✅ GO |
| 4 | Run contém todos os campos necessários | ✅ GO (com nota sobre actionId) |
| 5 | Guard simulated funciona | ✅ GO |
| 6 | `updateCase` aceita todos os parâmetros necessários | ✅ GO |
| 7 | Canonical recalculation possível pós-update | ✅ GO |
| 8 | Idempotência satisfatória (BullMQ + DB) | ✅ GO (com padrão explícito) |
| 9 | Receipt/bundle deriváveis do run | ✅ GO |
| 10 | Failure handling completo | ✅ GO |

**Veredicto:** **NO-GO** na forma atual. Torna-se **GO** quando P5 for incluído no escopo da Phase 4.1c.

> P5 não exige um ciclo separado — é uma adição de ~15 linhas em `runWorker.ts` que **deve** fazer parte da entrega da Phase 4.1c.

---

## 1. 11 actionIds com outcome da matriz 4.1a

**Status: ✅ GO**

Confirmado em `phase4-1a-product-outcome-matrix.md`. Tabela resumida:

| actionId | stage → | status → | terminal? |
|---------|---------|---------|---------|
| owner.register | property_collecting | ready_for_review | NÃO |
| property.create | campaign_preparing | ready_for_review | NÃO |
| listing.activate | lead_matching | ready_for_review | NÃO |
| lead.qualify | visit_scheduling | ready_for_review | NÃO |
| visit.schedule | proposal_preparing | pending_data | NÃO |
| documents.review | documents_collecting | pending_data | NÃO |
| documents.collect | documents_collecting | pending_data | NÃO |
| proposal.create | proposal_preparing | ready_for_review | NÃO |
| deal.review | contract_preparing | ready_for_review | NÃO |
| contract.prepare | commission_review | ready_for_review | NÃO |
| commission.settle | done | **done** | **SIM** |

`flow` nunca alterado pelo worker (invariante 4.1a).

---

## 2. Enqueue de `run.completed` → `imobRunCompletedQueue`

**Status: ⚠️ P5 — BLOCKER (mas resolvível em 4.1c)**

### Situação atual

`runWorker.ts` não contém nenhuma referência a `imob`, `IMOB`, `caseId` ou `actionId`.
`enqueueImobRunCompleted` **não está wired** em nenhum lugar além do arquivo de fila e do teste.

### Ponto de enqueue confirmado

O padrão já estabelecido está em `runWorker.ts:2350–2352`:

```typescript
// ✔ DISPARA SEMPRE O RUN ATIVO UNIVERSAL (SEM IF)
const runAtivoJob: ScopedRunAtivoJobPayload = { runId, tenantId, workspaceId };
await enqueueRunAtivoUniversal(runAtivoJob);
```

O enqueue do IMOB deve vir **imediatamente após** esta linha, condicionalmente.

### Dados disponíveis nesse ponto do código

Em `processRunPayload` (onde a linha 2352 está), as seguintes variáveis estão em escopo:

| variável | origem | disponível? |
|---------|--------|-------------|
| `runId` | parâmetro do payload | ✅ |
| `tenantId` | parâmetro do payload | ✅ |
| `workspaceId` | parâmetro do payload | ✅ |
| `baseMetadata` | `metadata` do payload (linha 1151) | ✅ |
| `baseMetadata.executionInput.caseId` | propagado via dispatcher → agents.ts | ✅ |
| `baseMetadata.executionInput.actionId` | propagado via dispatcher → agents.ts | ✅ |

`baseMetadata` é o metadata da request, que contém `executionInput` conforme confirmado na Phase 4.1 pré-flight original.

### Padrão de implementação para 4.1c

```typescript
// Wiring em runWorker.ts, APÓS enqueueRunAtivoUniversal (linha 2352):
import { enqueueImobRunCompleted } from "../queues/imobRunCompletedQueue";
import { IMOB_DISPATCHER_ACTION_IDS } from "../services/imob/crm/imobCrmActionDispatcher";

// ... no ponto de sucesso:
await enqueueRunAtivoUniversal(runAtivoJob);

// IMOB post-run mutation enqueue
const execInput = (baseMetadata?.executionInput as Record<string, unknown> | null | undefined);
const imobCaseId = typeof execInput?.caseId === "string" && execInput.caseId.trim() ? execInput.caseId.trim() : null;
const imobActionId = typeof execInput?.actionId === "string" && execInput.actionId.trim() ? execInput.actionId.trim() : null;
if (imobCaseId && imobActionId && IMOB_DISPATCHER_ACTION_IDS.includes(imobActionId as any)) {
  await enqueueImobRunCompleted({
    runId,
    tenantId,
    workspaceId,
    caseId: imobCaseId,
    actionId: imobActionId,
    eventRunId: runId,
  }).catch((err) => {
    logger.error({ runId, caseId: imobCaseId, actionId: imobActionId, err }, "imob.run_completed_enqueue_failed");
  });
}
```

**IMOB_DISPATCHER_ACTION_IDS** precisa ser exportado de `imobCrmActionDispatcher.ts` — atualmente os 11 actionIds estão declarados internamente. É necessário exportar a lista.

### Observação: dupla emissão de `run.completed`

Em `runWorker.ts`, `emitRunEvent({ type: "run.completed" })` é chamado **duas vezes** (linhas 2284 e 2314). O segundo emit é redundante — parece um artefato de código. O enqueue do IMOB não deve ser acoplado à emissão do evento — deve ficar junto com `enqueueRunAtivoUniversal` (linha 2352), que é o ponto correto pós-success.

---

## 3. Lookup do run por runId no worker

**Status: ✅ GO**

```typescript
// apps/api/src/services/runs.ts:138
export async function getRun(params: {
  prisma?: PrismaClient;
  id: string;
  tenantId: string;
  workspaceId: string;
}) {
  return client.run.findFirst({
    where: { id: params.id, tenantId: params.tenantId, workspaceId: params.workspaceId },
  });
}
```

- Scoped por `tenantId` + `workspaceId` — proteção cross-workspace ✅
- Retorna o record completo (`request`, `response`, `caseId`, `status`, `txId`, etc.) ✅
- Disponível em `apps/api/src/services/runs.ts` — importável pelo worker ✅

---

## 4. Campos do run disponíveis para o worker

**Status: ✅ GO (com nota)**

| campo | localização no Run DB | disponível? |
|------|----------------------|-------------|
| `runId` | `run.id` | ✅ |
| `tenantId` | `run.tenantId` | ✅ |
| `workspaceId` | `run.workspaceId` | ✅ |
| `caseId` | `run.caseId` (campo DB direto) | ✅ |
| `status` | `run.status` (RunStatus enum) | ✅ |
| `response.outputs` | `run.response.outputs` (JSON) | ✅ |
| `txId` | `run.txId` | ✅ (para receiptPath) |
| `metadata.executionInput` | `run.request.metadata.executionInput` | ✅ |
| `actionId` | `run.request.metadata.executionInput.actionId` | ✅ (via extração JSON) |

**Nota:** `actionId` NÃO é um campo de primeiro nível no `Run` — está embutido em `Run.request.metadata.executionInput.actionId`. O worker precisa extraí-lo do JSON. Padrão:

```typescript
const request = run.request as Record<string, unknown>;
const metadata = request?.metadata as Record<string, unknown> | undefined;
const executionInput = metadata?.executionInput as Record<string, unknown> | undefined;
const actionId = typeof executionInput?.actionId === "string" ? executionInput.actionId : null;
```

A queue payload já carrega `actionId` diretamente (enfileirado a partir de `baseMetadata.executionInput.actionId`), então o worker não precisa re-extraí-lo do request — pode usar o valor do job payload.

---

## 5. Guard simulated

**Status: ✅ GO**

`shouldSkipImobPostRunMutationForSimulatedOutput(run)` implementada e testada (17/17 na Phase 4.1b).

Comportamento confirmado:
- `run.response.outputs[].data.simulated === true` → retorna `true` → mutation não ocorre
- `run.response.outputs` vazio ou sem `simulated` → retorna `false` → fluxo normal
- `run.response` ausente → retorna `false` (safe default)

O guard deve ser a **primeira** verificação no worker (antes de qualquer DB query):

```typescript
if (shouldSkipImobPostRunMutationForSimulatedOutput(run)) {
  logger.warn({ runId }, "imob-worker.skipped_simulated_run");
  return;
}
```

---

## 6. `ImobCrmMutationService.updateCase` — compatibilidade

**Status: ✅ GO**

### Assinatura
```typescript
async updateCase(scope: Scope, caseId: string, input: Partial<CaseInput>): Promise<
  | { status: "updated"; data: ImobCase; previous: ImobCase }
  | { status: "not_found" }
  | { status: "responsible_required"; reasonCode: "CASE_RESPONSIBLE_REQUIRED"; ... }
  | { status: "assignment_forbidden"; ... }
>
```

### CaseInput campos usados pelo worker
```typescript
type CaseInput = {
  flow: string;          // NÃO passado pelo worker (não muda)
  stage: string;         // ✅ passado pelo worker (da matriz 4.1a)
  status: string;        // ✅ passado pelo worker
  nextStep?: string | null; // ✅ passado pelo worker
  blockers?: string[];   // ✅ passado pelo worker
  pendingItems?: string[]; // ✅ passado pelo worker
  eventRunId?: string | null; // ✅ passado pelo worker (= runId)
  eventType?: string | null; // ✅ "case.action.completed"
  eventSummary?: string | null; // ✅ mensagem de sumário
  eventPayload?: unknown; // ✅ { actionId, runId, outcomeStage, outcomeStatus }
  eventActorType?: string | null; // ✅ "system"
  eventEvidenceRef?: string | null; // ✅ para idempotência
};
```

### Comportamentos verificados

- **Cross-workspace**: `findFirst({ where: { id, tenantId, workspaceId } })` → retorna `not_found` se caseId pertence a outro workspace ✅
- **Audit trail**: `recordImobCrmAuditEvent` chamado em cada `updateCase` ✅
- **Terminal guard**: `responsible_required` retornado quando tentativa de `status: "done"` sem `ownerResponsible` ✅
- **`pendingItems`/`blockers`**: tipo `Json?` no schema — worker passa `string[]`, Prisma serializa para JSON ✅
- **`flow` não obrigatório no input**: `Partial<CaseInput>` — se omitido, `updateCase` usa `existing.flow` ✅

### Handling de `responsible_required` para `commission.settle`

O worker deve verificar `ownerResponsible` ANTES de chamar `updateCase`, seguindo o padrão da matriz 4.1a:

```typescript
if (actionId === "commission.settle") {
  const kase = await prisma.imobCase.findFirst({
    where: { id: caseId, tenantId, workspaceId },
    select: { ownerResponsible: true },
  });
  if (!kase?.ownerResponsible) {
    await createBlockedCaseEvent(caseId, runId, "CASE_RESPONSIBLE_REQUIRED");
    return; // não é erro — não reprocessar
  }
}
```

Alternativamente, pode deixar `updateCase` retornar `responsible_required` e tratar no worker — ambas as abordagens são corretas. A pré-verificação evita uma write transaction desnecessária.

---

## 7. Canonical recalculation pós-update

**Status: ✅ GO**

`buildImobCanonicalCase` exportada de `apps/api/src/services/imob/imobCanonical.ts` (Phase 4.1b).

### Inputs necessários (todos disponíveis após `updateCase`)

`updateCase` retorna `{ status: "updated", data: updatedCase, previous: ... }`. O `data` contém:
```typescript
{
  flow, stage, status, ownerResponsible, nextStep,
  blockers, pendingItems,
  owner: { id, name } | null,
  property: { id, propertyType, city, neighborhood } | null,
  lead: { id, name } | null,
}
```

Chamada esperada após update:

```typescript
const canonical = buildImobCanonicalCase({
  flow: updatedCase.flow,
  stage: updatedCase.stage,
  status: updatedCase.status,
  ownerResponsible: updatedCase.ownerResponsible ?? null,
  nextStep: updatedCase.nextStep ?? null,
  blockers: (updatedCase.blockers as string[]) ?? [],
  pendingItems: (updatedCase.pendingItems as string[]) ?? [],
  lead: updatedCase.lead ?? null,
  owner: updatedCase.owner ?? null,
  property: updatedCase.property ?? null,
});
```

**Observação:** O canonical recalculado neste ciclo é usado para popular o response do Command Center na próxima consulta (GET /imob/cases/:id). O worker não precisa persistir o canonical — ele é recalculado a cada leitura. A Phase 4.2 pode adicionar persistência se necessário.

---

## 8. Idempotência

**Status: ✅ GO (padrão duplo: BullMQ + DB)**

### Nível 1 — BullMQ jobId
```typescript
jobId = `imob-run-completed:${tenantId}:${workspaceId}:${runId}`
```
Jobs duplicados com o mesmo `jobId` são descartados automaticamente pelo BullMQ. ✅

### Nível 2 — DB check antes de mutation

`ImobCaseEvent.evidenceRef` **NÃO é unique** no schema. Portanto, a idempotência DB-level deve usar `runId`:

```typescript
const alreadyProcessed = await prisma.imobCaseEvent.findFirst({
  where: {
    caseId,
    tenantId,
    workspaceId,
    runId,
    type: "case.action.completed",
  },
  select: { id: true },
});
if (alreadyProcessed) {
  logger.info({ runId, caseId }, "imob-worker.already_processed_skip");
  return;
}
```

`ImobCaseEvent` tem índice em `runId` (linha 1051 do schema) — query eficiente ✅

### Retry seguro

Com os dois níveis:
- Retry BullMQ: job não será reenfileirado (mesmo `jobId`)
- Se o job foi parcialmente processado (falhou após criar `ImobCaseEvent` mas antes de `updateCase`): o DB check detecta e salta — a mutation não ocorrerá novamente
- `pendingItems_add` e `pendingItems_remove`: a lógica de filtro é idempotente (remover item já removido é no-op; adicionar item já presente é deduplicado)

---

## 9. Receipt/bundle

**Status: ✅ GO (derivação via runArchiveService)**

`receiptPath` e `bundlePath` não existem como campos no `Run` DB. São **computados** em runtime:

```typescript
// apps/api/src/services/runArchiveService.ts:171-172
const receiptPath = params.run.txId ? `/api/ledger/${encodeURIComponent(params.run.txId)}` : null;
const bundlePath = `/api/runs/${encodeURIComponent(params.run.id)}/bundle`;
```

### Para o worker
O worker tem acesso ao run record completo após `getRun`. Pode derivar os paths:

```typescript
const receiptPath = run.txId ? `/api/ledger/${encodeURIComponent(run.txId)}` : null;
const bundlePath = `/api/runs/${encodeURIComponent(run.id)}/bundle`;
```

Os campos opcionais `receiptPath?` e `bundlePath?` na fila podem ser omitidos na enqueue — o worker os deriva. Eles devem ser incluídos no `eventPayload` do `ImobCaseEvent` para referência auditável.

### Por actionId (da matriz 4.1a)

| receipt obrigatório? | actionIds |
|---------------------|---------|
| OBRIGATÓRIO | owner.register, property.create, proposal.create, deal.review, contract.prepare, commission.settle |
| OPCIONAL | listing.activate, lead.qualify, visit.schedule, documents.review, documents.collect |

Para ações OBRIGATÓRIAS: se `receiptPath` for nulo (run sem `txId`), o worker deve **não mutar** e registrar `ImobCaseEvent` tipo `case.action.blocked` com `reasonCode: RECEIPT_REQUIRED_NO_TX_ID`. Este guard previne que ações HIGH tier sem audit trail financeiro sejam registradas como concluídas.

---

## 10. Failure handling

**Status: ✅ GO**

| cenário | comportamento | mecanismo |
|---------|-------------|----------|
| `run.status !== "success"` | skip mutation; registrar `case.action.failed` | guard no início do handler |
| `simulated === true` | skip mutation; logar warn | `shouldSkipImobPostRunMutationForSimulatedOutput` |
| `actionId` ausente ou desconhecido | skip mutation; registrar `case.action.failed` | guard no início |
| `caseId` ausente | skip mutation; logar error | guard no início |
| cross-workspace | `updateCase` retorna `not_found` | nativo no mutation service |
| `responsible_required` (commission.settle) | skip mutation; registrar `case.action.blocked` | pré-verificação |
| `receipt` obrigatório ausente | skip mutation; registrar `case.action.blocked` | guard por actionId |
| BullMQ retry exhausted | job movido para DLQ (`removeOnFail: false`) | configuração da fila |

**Cada falha deve registrar `ImobCaseEvent`** — assim o Command Center tem visibilidade do que aconteceu sem que o run seja silenciado.

---

## Novo bloqueador identificado: P5

| # | Bloqueador | Criticidade | Escopo de resolução |
|---|-----------|------------|-------------------|
| P5 | `enqueueImobRunCompleted` não wired em `runWorker.ts` | CRÍTICO | Phase 4.1c (junto com o worker) |

### P5 — escopo completo de mudanças necessárias em `runWorker.ts`

1. Importar `enqueueImobRunCompleted` de `../queues/imobRunCompletedQueue`
2. Exportar `IMOB_DISPATCHER_ACTION_IDS` de `imobCrmActionDispatcher.ts` (lista dos 11 actionIds)
3. Adicionar ~15 linhas após `enqueueRunAtivoUniversal` (linha 2352) — enqueue condicional
4. Tratamento de erro com `.catch()` — falha na enqueue não deve falhar o run

**Total de arquivos afetados em P5:**
- `apps/api/src/workers/runWorker.ts` — +import, +~15 linhas
- `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` — +export IMOB_DISPATCHER_ACTION_IDS

---

## Testes obrigatórios para Phase 4.1c

| # | Teste | tipo | arquivo sugerido |
|---|-------|------|-----------------|
| T1 | run success com IMOB actionId → `ImobCase.stage` e `.status` atualizados | integração | `imob-post-run-mutation.test.ts` |
| T2 | `run.status = "error"` → `ImobCase` não alterado; `ImobCaseEvent.type = "case.action.failed"` | unitário | mesmo arquivo |
| T3 | `simulated=true` → `ImobCase` não alterado; log `imob-worker.skipped_simulated_run` | unitário | mesmo arquivo |
| T4 | `caseId` ausente no run → não mutation, não erro não-tratado | unitário | mesmo arquivo |
| T5 | Cross-workspace: `caseId` de outro workspace → `not_found`; nenhum `ImobCase` alterado | unitário | mesmo arquivo |
| T6 | `commission.settle` sem `ownerResponsible` → `case.action.blocked` com `CASE_RESPONSIBLE_REQUIRED` | unitário | mesmo arquivo |
| T7 | Idempotência: mesmo `runId` processado duas vezes → segunda execução é no-op | integração | mesmo arquivo |
| T8 | `commission.settle` com sucesso → `ImobCase.status = "done"`, `stage = "done"` | integração | mesmo arquivo |
| T9 | Ação HIGH tier sem `txId` → `case.action.blocked` com `RECEIPT_REQUIRED_NO_TX_ID` | unitário | mesmo arquivo |
| T10 | Canonical recalculado após update — `buildImobCanonicalCase` retorna resultado consistente | unitário | mesmo arquivo |

---

## Matriz final actionId → mutation (Phase 4.1c)

| actionId | executionRequest.action | stage | status | pendingItems_add | pendingItems_remove | receipt_obrig | notes |
|---------|------------------------|-------|--------|-----------------|-------------------|--------------|-------|
| owner.register | realestate.register_property | property_collecting | ready_for_review | [] | ["Proprietário pendente..."] | SIM | txId obrigatório |
| property.create | realestate.register_property | campaign_preparing | ready_for_review | ["Ativação do anúncio pendente"] | ["Imóvel pendente..."] | SIM | txId obrigatório |
| listing.activate | realestate.activate_listing | lead_matching | ready_for_review | [] | ["Ativação do anúncio pendente"] | NÃO | sem txId |
| lead.qualify | realestate.qualify_lead | visit_scheduling | ready_for_review | [] | ["Qualificação de lead pendente"] | NÃO | sem txId |
| visit.schedule | realestate.schedule_visit | proposal_preparing | pending_data | ["Resultado da visita pendente"] | ["Visita pendente de agendamento"] | NÃO | sem txId |
| documents.review | realestate.collect_documents | documents_collecting | pending_data | ["Documentos aguardando entrega"] | ["Revisão documental pendente"] | NÃO | sem txId |
| documents.collect | realestate.collect_documents | documents_collecting | pending_data | ["Documentação solicitada aguardando"] | ["Coleta não iniciada"] | NÃO | sem txId |
| proposal.create | realestate.create_contract | proposal_preparing | ready_for_review | ["Aceite da proposta pendente"] | ["Proposta não elaborada"] | SIM | txId obrigatório |
| deal.review | realestate.review_deal | contract_preparing | ready_for_review | [] | ["Revisão de negociação pendente"] | SIM | txId obrigatório |
| contract.prepare | realestate.create_contract | commission_review | ready_for_review | ["Assinatura do contrato pendente"] | ["Contrato não elaborado"] | SIM | txId obrigatório |
| commission.settle | realestate.release_commission | done | **done** | [] | [todos] | SIM | **TERMINAL**; exige ownerResponsible |

---

## Recomendação de implementação

### Ordem de implementação para Phase 4.1c

```
1. Exportar IMOB_DISPATCHER_ACTION_IDS de imobCrmActionDispatcher.ts  (~5 linhas)
2. Wiring em runWorker.ts — P5 — import + enqueue condicional  (~20 linhas)
3. Criar ImobPostRunMutationWorker  (~150 linhas)
   a. BullMQ Worker consuming imobRunCompletedQueue
   b. Guards: status !== "success", simulated, caseId, actionId, receipt HIGH
   c. DB idempotência check (ImobCaseEvent.findFirst por runId)
   d. Pré-verificação commission.settle + ownerResponsible
   e. updateCase com payload da matriz 4.1a
   f. Canonical recalculation pós-update
   g. ImobCaseEvent para sucesso/falha/bloqueio
4. Registrar o worker no startup da API (ou run-worker service)
5. Testes T1–T10
6. Artefato phase4-1c-mutation-worker.md
7. Atualizar EVIDENCE_INDEX.md
```

### Pontos de atenção de implementação

**A) Onde registrar o worker:**
`apps/api/src/workers/runWorker.ts` já é o embedded worker. O `ImobPostRunMutationWorker` pode ser registrado no mesmo processo ou como worker separado. A fila `imobRunCompletedQueue` usa a mesma infraestrutura Redis. Recomendado: mesmo processo que a API (similar ao `runAtivoUniversalQueue` worker atual).

**B) `IMOB_DISPATCHER_ACTION_IDS` como constante exportada:**
Atualmente a lista está implícita no dispatcher. Exportar como:
```typescript
export const IMOB_DISPATCHER_ACTION_IDS = [
  "owner.register", "property.create", "listing.activate", "lead.qualify",
  "visit.schedule", "documents.review", "documents.collect",
  "proposal.create", "deal.review", "contract.prepare", "commission.settle",
] as const;
```

**C) `pendingItems_remove` é tolerante:**
O worker remove apenas itens que existam — se o item já foi removido, é no-op. Padrão:
```typescript
const nextPendingItems = currentPendingItems
  .filter(item => !toRemove.some(r => item.toLowerCase().includes(r.toLowerCase())));
const finalPendingItems = [...nextPendingItems, ...toAdd];
```

**D) `commission.settle` limpa TODOS os pendingItems e blockers:**
Por ser a ação terminal, limpa o estado completo:
```typescript
const nextPendingItems = [];   // limpa tudo
const nextBlockers = [];        // limpa tudo
```

**E) `updateCase` retorna o case com relations:**
O retorno `{ status: "updated", data: updatedCase }` inclui `owner`, `property`, `lead` via `include` — usável diretamente em `buildImobCanonicalCase` sem query adicional. ✅

---

## GO/NO-GO final

| fase | condição | status |
|------|----------|--------|
| Phase 4.1c — implementar worker | P5 incluído no escopo + T1–T10 | **GO** (P5 obrigatório) |
| Fase de staging | ToolContract DB records criados | pendente (não bloqueia implementação local) |
| Fase de produção | 3 ciclos staging OK | pendente |

**GO para implementar Phase 4.1c**, com P5 como parte mandatória do escopo.

Todos os outros pré-requisitos estão satisfeitos:
- P1 (outcome matrix) ✅
- P2 (buildImobCanonicalCase exportada) ✅
- P3 (simulated guard) ✅
- P4 (fila durável) ✅
- P5 (enqueue wiring) → implementar em 4.1c
