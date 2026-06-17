# Phase 4.1 Pré-Flight — ImobPostRunMutationWorker
# CC → Chat IMOB: Worker de Mutation Pós-Run

Data: 2026-06-16
Tipo: Relatório de pré-flight técnico (sem alteração de código)
Baseado em: Phase 4.0 evidenciada (`phase4-0-contract-handler-alignment.md`)

---

## INVARIANTES OBRIGATÓRIOS — preservados neste relatório

1. `ImobCase.status` novo é decidido exclusivamente no backend.
2. O status deriva do action handler + canonical recalculation.
3. React não contém regra de status; CC apenas faz auto-refresh e lê o novo estado da API.
4. Sem PATCH `/imob/cases/:caseId` do frontend.
5. `apiAgentsExecute` não é chamado automaticamente (guarda da Fase 3 preservado).

---

## VEREDICTO: NO-GO

**Razão:** 4 bloqueadores técnicos impedem a implementação segura do `ImobPostRunMutationWorker`.
Todos são resolvíveis; nenhum exige decisão arquitetural nova. O maior bloqueador é de produto.

---

## Seção 1 — Verificação dos 11 actionIds e ACTION_CONTRACTS

Status pós-Fase 4.0 (todos confirmados):

| actionId | executionRequest.action | ACTION_CONTRACT? | handler? |
|---------|------------------------|-----------------|---------|
| owner.register | realestate.register_property | ✅ | ✅ stub |
| property.create | realestate.register_property | ✅ | ✅ stub |
| listing.activate | realestate.activate_listing | ✅ | ✅ stub |
| lead.qualify | realestate.qualify_lead | ✅ | ✅ stub |
| visit.schedule | realestate.schedule_visit | ✅ | ✅ stub |
| documents.review | realestate.collect_documents | ✅ | ✅ stub |
| documents.collect | realestate.collect_documents | ✅ | ✅ stub |
| proposal.create | realestate.create_contract | ✅ | ✅ stub |
| deal.review | realestate.review_deal | ✅ | ✅ stub |
| contract.prepare | realestate.create_contract | ✅ | ✅ stub |
| commission.settle | realestate.release_commission | ✅ | ✅ stub |

**Conclusão:** 11/11 cobertos. Nenhum bloqueador residual de B1/B2/B5.

---

## Seção 2 — Propagação de caseId e actionId até o Run DB record

### 2.1 Caminho de propagação (CONFIRMADO ✅)

```
imobCrmActionDispatcher.resolveImobCrmActionDispatch()
  └─ executionRequest.input = { caseId, actionId, reasonCode, requestedAt }
        ↓
chat.tsx → apiAgentsExecute({ input: executionRequest.input, ... })
        ↓
agents.ts route (linha 510-542)
  └─ executionInput = parsed.data.input  ← inclui { caseId, actionId }
  └─ metadataBase = { ...parsed.data.metadata, executionInput, action, domain, ... }
  └─ requestPayloadBase = { prompt, metadata: metadataBase }
        ↓
createRunRecord({ request: requestPayloadBase, ... })
  └─ extractRunContextFromRequest(request)
       └─ caseId = metadata.executionInput.caseId  ← CONFIRMADO
       └─ threadId = metadata.executionInput.threadId
  └─ Run.caseId = runContext.caseId  ← armazenado na coluna `case_id` em `runs`
        ↓
Run.request.metadata.executionInput.actionId  ← preservado no JSON
```

**Referências no código:**
- `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` linha 130-141
- `apps/api/src/routes/agents.ts` linhas 510, 531-542
- `apps/api/src/services/runs.ts` linhas 40-58, 230

### 2.2 O que o worker pode recuperar via lookup por runId

```typescript
// Lookup suficiente para o worker:
const run = await prisma.run.findFirst({
  where: { id: runId, tenantId, workspaceId },
  select: {
    id: true,
    caseId: true,           // ← caseId do caso IMOB
    status: true,           // ← "success" | "error"
    request: true,          // ← JSON com metadata.executionInput.actionId
  }
});
// run.request.metadata.executionInput.actionId = actionId original
// run.request.metadata.executionInput.caseId = mesmo que run.caseId
```

---

## Seção 3 — ToolContract DB records: status e gaps

### 3.1 Modelo ToolContract (schema.prisma linha 461)

```prisma
model ToolContract {
  id          String  @id @default(cuid())
  name        String
  version     String
  tenantId    String  @map("tenant_id")  // ← scoped por tenant, sem workspaceId
  inputSchema Json
  outputSchema Json?
  executor    String
  trustLevel  Int
  ...
  @@index([tenantId, name, version])
}
```

**Importante:** ToolContract é scoped por `tenantId` apenas — sem `workspaceId`.
Uma mesma definição de contrato serve todos os workspaces de um tenant.

### 3.2 Comportamento quando ToolContract ausente (runWorker.ts linha 1447-1476)

```typescript
const tool = await ToolRegistry.get(actionName, version, tenantId);
if (!tool) {
  if (actionName.startsWith("realestate.")) {
    // Simula execução — NÃO falha
    await recordGuardrailAudit({ ..., eventType: "mcp.tool.simulated", ... });
    return {
      ok: true,
      simulated: true,          // ← flag presente no retorno da step
      action: actionName,
      status: "success",        // ← mas foi simulado!
      output: { message: `Simulated ${actionName} execution`, ... },
    };
  }
  throw new Error(`ToolContract missing: ${actionName}@${version}`);
}
```

**Consequência:** Runs de `realestate.*` com ToolContracts ausentes emitem `run.completed`
com `status: "success"` — mas a execução foi simulada. O worker precisa detectar isso.

### 3.3 Como detectar execução simulada no worker

O flag `simulated: true` está no output da step individual, que fica em `run.response.outputs`.
O worker deve verificar:

```typescript
const runRecord = await prisma.run.findFirst({ where: { id: runId }, select: { response: true, caseId: true } });
const outputs = (runRecord?.response as any)?.outputs ?? [];
const hasSimulatedStep = outputs.some((o: any) => o?.simulated === true);
if (hasSimulatedStep) {
  // Não muta o ImobCase — execução não foi real
  logger.warn({ runId }, "imob-worker.skipped_simulated_run");
  return;
}
```

### 3.4 Records necessários em DB (ausentes — precisam de seed/migration)

| action | version | tenantId | status |
|--------|---------|----------|--------|
| realestate.register_property | 1.0.0 | tenant-específico | ❌ ausente |
| realestate.activate_listing | 1.0.0 | tenant-específico | ❌ ausente |
| realestate.qualify_lead | 1.0.0 | tenant-específico | ❌ ausente |
| realestate.schedule_visit | 1.0.0 | tenant-específico | ❌ ausente |
| realestate.collect_documents | 1.0.0 | tenant-específico | ❌ ausente |
| realestate.review_deal | 1.0.0 | tenant-específico | ❌ ausente |
| realestate.create_contract | 1.0.0 | tenant-específico | ❌ ausente |
| realestate.release_commission | 1.0.0 | tenant-específico | ❌ ausente |
| realestate.apply_adjustment | 1.2.0 | tenant-específico | ❌ ausente |

**Nota:** Enquanto ausentes, o run-worker simula com sucesso e o worker deve ignorar.
Para execução real, os records precisam ser criados via seed de staging.

---

## Seção 4 — Mapeamento actionId → outcome (BLOQUEADOR CRÍTICO)

### 4.1 Status atual

**Nenhuma decisão de produto sobre outcome por ação foi registrada no codebase.**

O dispatcher define somente `conversationState.operational.status: "ready_for_review"` de forma
genérica — isso é o estado da conversa, não o novo estado do ImobCase.

### 4.2 Mapeamento necessário (a ser decidido pelo produto)

| actionId | action | status resultante? | stage resultante? | nextStep | pendingItems | blockers |
|---------|--------|-------------------|------------------|---------|-------------|---------|
| owner.register | realestate.register_property | ? | ? | ? | ? | ? |
| property.create | realestate.register_property | ? | ? | ? | ? | ? |
| listing.activate | realestate.activate_listing | ? | ? | ? | ? | ? |
| lead.qualify | realestate.qualify_lead | ? | ? | ? | ? | ? |
| visit.schedule | realestate.schedule_visit | ? | ? | ? | ? | ? |
| documents.review | realestate.collect_documents | ? | ? | ? | ? | ? |
| documents.collect | realestate.collect_documents | ? | ? | ? | ? | ? |
| proposal.create | realestate.create_contract | ? | ? | ? | ? | ? |
| deal.review | realestate.review_deal | ? | ? | ? | ? | ? |
| contract.prepare | realestate.create_contract | ? | ? | ? | ? | ? |
| commission.settle | realestate.release_commission | ? | ? | ? | ? | ? |

**`ImobCase.status` válidos:** `pending_data | ready_for_review | blocked | done`

**Sem este mapeamento, o worker não pode implementar a mutation corretamente.**
Esta é a razão primária para o veredicto NO-GO.

---

## Seção 5 — Caminho run.completed: evento, fila, durabilidade, retry/idempotência

### 5.1 Dois paths de execução distintos

**Path A: API-embedded worker (runWorker.ts)**
- Executa a maior parte das runs IMOB
- Emite `run.completed` via `emitRunEvent()` em dois pontos (linhas 2284-2304 e 2314-2330)
  - Primeira emissão: payload com `txId`, `criticalHash`, `sclTxId` (linhas 2284-2304)
  - Segunda emissão: payload sem campos de ledger (linhas 2314-2330) — aparente duplicata
- Payload da linha 2284:
  ```json
  {
    "status": "success",
    "costCents": <number>,
    "tools": [...],
    "toolCatalog": [...],
    "tookMs": <number>,
    "traceId": <string>,
    "planSteps": <number>,
    "recommendationsGenerated": <number>,
    "txId": <string|null>,
    "criticalHash": <string|null>
  }
  ```
- **Não inclui `caseId`, `actionId`, nem `simulated`** — worker deve fazer lookup no DB

**Path B: run-worker service (apps/workers/run-worker/src/index.ts)**
- Usado pelo consumidor BullMQ da fila `runQueue`
- Passa `actions: {}` para o orchestrator — realestate.* handlers **não registrados aqui**
- Emite `run.completed` com payload `{ result }` (retorno do orchestrator.run)
- IMOB runs provavelmente não passam por este path atualmente

### 5.2 Durabilidade dos eventos

| Store | Durabilidade | Canal | Perda em restart? |
|-------|-------------|-------|------------------|
| RedisRunEventStore | ❌ Não durável | pub/sub: `run-events:{tenantId}:{workspaceId}:{runId}` | Sim — pub/sub |
| PrismaRunEventStore | ✅ Durável | `runEvent` table (DB) | Não |
| CompositeRunEventStore | Ambos | Ambos | Redis perde; Prisma não |

**Implicação para o worker:** Não pode escutar somente Redis pub/sub.
Deve usar BullMQ com job enfileirado no momento do `run.completed` para garantir at-least-once.

### 5.3 Idempotência

O `ImobCaseEvent` não tem `@@unique` em `evidenceRef` — não há restrição de unicidade no banco.
O worker deve implementar idempotência explícita:

```typescript
// Verificar se já existe ImobCaseEvent com runId = runId para este caseId
const existing = await prisma.imobCaseEvent.findFirst({
  where: { caseId, runId, tenantId, workspaceId, type: "case.action.completed" },
  select: { id: true }
});
if (existing) {
  logger.info({ runId, caseId }, "imob-worker.skip_duplicate_mutation");
  return;
}
```

### 5.4 Retry e backoff

Padrão do projeto: BullMQ com `attempts: 3, backoff: { type: "exponential", delay: 1500 }` (ver `runAtivoUniversalQueue.ts`).
Worker deve usar a mesma configuração com DLQ.

---

## Seção 6 — Payload do resultado de run

### 6.1 Campos confirmados no runId disponível para o worker

```typescript
// Lookup via prisma.run.findFirst({ where: { id: runId, tenantId, workspaceId } })
{
  id: string,                              // runId
  tenantId: string,
  workspaceId: string,
  caseId: string | null,                   // ← caseId IMOB se presente
  status: "success" | "error",
  request: {
    prompt: string,
    metadata: {
      domain: "imob",
      action: "realestate.*",              // ← nome da action executada
      executionInput: {
        caseId: string,                    // ← mesmo que Run.caseId
        actionId: string,                  // ← actionId original (owner.register, etc.)
        reasonCode: string | null,
        requestedAt: string,               // ← ISO timestamp da solicitação
      }
    }
  },
  response: {
    outputs: [{ simulated?: true, ... }],  // ← detectar execução simulada
    guardianReport: {...},
    ...
  }
}
```

### 6.2 receiptPath e bundlePath

- `bundlePath`: `/api/runs/${runId}/bundle` — derivado do runId, sem DB record separado
- `receiptPath`: `/api/runs/${runId}/receipt` — idem
- Não há tabela `ImobRunReceipt` — não é necessário para a mutation do ImobCase
- Para HIGH-tier com `txIdRequired: true`: `txId` está em `Run.sclTxId` — já armazenado

---

## Seção 7 — ImobCrmMutationService.updateCase

### 7.1 Status: PRONTO ✅

`updateCase` (imobCrmMutationService.ts linha 725) é production-ready:

```typescript
await imobCrmMutationService.updateCase(
  { tenantId, workspaceId },           // scope — fail-closed: caseId validado no scope
  caseId,
  {
    status: "<derivado do outcome>",
    stage: "<derivado do outcome>",
    nextStep: "<derivado do outcome>",
    blockers: [...],
    pendingItems: [...],
    eventRunId: runId,                 // ← conecta ImobCaseEvent ao Run
    eventType: "case.action.completed",
    eventActorType: "system",
    eventSummary: `Ação ${actionId} completada via run ${runId}`,
  }
);
```

### 7.2 Proteção cross-workspace (CONFIRMADA ✅)

```typescript
// linha 726-730 em imobCrmMutationService.ts:
const existing = await this.prisma.imobCase.findFirst({
  where: { id: caseId, tenantId: scope.tenantId, workspaceId: scope.workspaceId },
  select: { id: true, ... }
});
if (!existing) return { status: "not_found" as const };
// → worker deve tratar "not_found" como bloqueador (fail-closed)
```

### 7.3 Terminal state guard (VERIFICADO ⚠️)

Se a mutation move o caso para estado terminal (`done`/`blocked`), `updateCase` exige
`ownerResponsible` preenchido. Sem isso, retorna `{ status: "responsible_required" }`.

**Worker deve:**
1. Verificar se o outcome configura estado terminal
2. Se sim: garantir que `ownerResponsible` esteja presente no case antes de muta
3. Se não estiver: registrar bloqueador e não mutar

### 7.4 eventRunId → ImobCaseEvent link (CONFIRMADO ✅)

```typescript
// linha 814 em imobCrmMutationService.ts:
...(input.eventRunId ? { run: { connect: { id: input.eventRunId } } } : {})
```

O `ImobCaseEvent` é criado com `runId` conectado ao `Run` — trilha de auditoria completa.

---

## Seção 8 — buildImobCanonicalCase: disponibilidade e inputs

### 8.1 Localização atual

**BLOQUEADOR:** `buildImobCanonicalCase` está definida em `apps/api/src/routes/imob.ts` linha 424
como função **module-private** (não exportada). O worker não pode importá-la dessa localização.

### 8.2 Assinatura (confirmada via leitura do arquivo)

```typescript
function buildImobCanonicalCase(params: {
  flow: string | null | undefined;
  stage: string | null | undefined;
  status: string | null | undefined;
  ownerResponsible?: string | null;
  nextStep?: string | null;
  blockers?: unknown;        // string[] via asStringList()
  pendingItems?: unknown;    // string[] via asStringList()
  lead?: { id?: string | null; name?: string | null } | null;
  owner?: { id?: string | null; name?: string | null } | null;
  property?: { id?: string | null } | null;
}): ImobCanonicalCase
```

### 8.3 O que a função produz

```typescript
return {
  journeyType,        // mapImobFlowToJourneyType(flow)
  partyRole,          // mapImobResponsibleToPartyRole(ownerResponsible, journeyType)
  commercialGoal,     // mapImobFlowToCommercialGoal(flow)
  recommendedActions, // buildImobRecommendedActions({ flow, nextStep, pendingItems, ... })
  blockedActions,     // blockers (string[])
  missingContext,     // pendingItems (string[])
  reasonCodes,        // derivados de blockers, pendingItems, stage, status
};
```

### 8.4 Resolução necessária

Para a Fase 4.1, `buildImobCanonicalCase` deve ser **movida para serviço compartilhado** ou
**reexportada** de `apps/api/src/services/imob/imobCanonical.ts` (criar se não existir).

O worker precisaria das relações de `owner`, `property`, `lead` do case para produzir
o canonical completo — estas devem ser incluídas no lookup do case pós-mutation.

---

## Seção 9 — Infraestrutura de fila durável

### 9.1 BullMQ: padrão já estabelecido

Filas existentes no projeto:
- `runQueue.ts` — fila principal de runs (consumida pelo run-worker service)
- `runAtivoUniversalQueue.ts` — runs de ativo universal (reference implementation)
- `maintenanceQueue.ts` — manutenção (DLQ pattern, concurrency configurável)

### 9.2 Recomendação: nova fila `imobRunCompletedQueue.ts`

Baseado no padrão de `runAtivoUniversalQueue.ts`:

```typescript
// packages/core/src/queue/imobRunCompletedQueue.ts
export type ImobRunCompletedJobPayload = {
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId?: string | null;
};
export const IMOB_RUN_COMPLETED_QUEUE_NAME = "imob-run-completed";
export const imobRunCompletedQueue = new Queue<ImobRunCompletedJobPayload>(
  IMOB_RUN_COMPLETED_QUEUE_NAME,
  { connection: getRedisConnection() }
);
export async function enqueueImobRunCompleted(job: ImobRunCompletedJobPayload) {
  return imobRunCompletedQueue.add("process", job, {
    attempts: 3,
    backoff: { type: "exponential", delay: 1500 },
    removeOnComplete: true,
    removeOnFail: false,
    jobId: `imob-run-${job.runId}`, // idempotency key by runId
  });
}
```

### 9.3 Ponto de enqueue

O `emitRunEvent` em `runWorker.ts` deve enfileirar o job IMOB **após** o `run.completed` event:

```typescript
// Somente para runs com domain === "imob"
if (runtimeMetadataResolved?.domain === "imob") {
  await enqueueImobRunCompleted({ runId, tenantId, workspaceId, userId });
}
```

---

## Seção 10 — Resumo de blockers e pré-requisitos

### Bloqueadores (impedem implementação segura)

| # | Bloqueador | Arquivo | Resolução |
|---|-----------|---------|----------|
| **P1** | Decisão de produto: outcome por actionId ausente | — | Produto define status/stage/nextStep/pendingItems por ação |
| **P2** | `buildImobCanonicalCase` não exportada | `routes/imob.ts:424` | Mover para `services/imob/imobCanonical.ts` e exportar |
| **P3** | Execução simulada emite run.completed com status=success | `runWorker.ts:1465` | Worker verifica `run.response.outputs[].simulated === true` |
| **P4** | Nenhuma fila durável para run.completed IMOB | — | Criar `imobRunCompletedQueue.ts` + enqueue no emitRunEvent |

### Pré-requisitos (não bloqueadores, mas necessários antes de staging)

| # | Pré-req | Tipo |
|---|---------|------|
| PR1 | ToolContract DB records para 9 realestate.* actions | Seed/migration |
| PR2 | `ImobCaseEvent.evidenceRef` não é unique — idempotência manual no worker | Worker logic |
| PR3 | Terminal state guard: ownerResponsible obrigatório para done/blocked | Worker logic |
| PR4 | Segunda emissão duplicada de run.completed (linhas 2314-2330) | Investigar se intencional |

### Itens confirmados (prontos para uso)

| Item | Status |
|------|--------|
| `Run.caseId` propagado via `executionInput.caseId` | ✅ |
| `Run.request.metadata.executionInput.actionId` preservado | ✅ |
| `ImobCrmMutationService.updateCase` production-ready | ✅ |
| Cross-workspace fail-closed em `updateCase` | ✅ |
| `eventRunId → ImobCaseEvent.runId` link auditável | ✅ |
| BullMQ pattern estabelecido (runAtivoUniversalQueue como referência) | ✅ |
| Run lookup por `(id, tenantId, workspaceId)` suficiente para extrair caseId+actionId | ✅ |

---

## Seção 11 — Testes obrigatórios para Fase 4.1

```
T1: run.completed com domain=imob e caseId válido → updateCase chamado com campos corretos
T2: run.completed com simulated=true → updateCase NÃO chamado
T3: run.completed com status=error → updateCase NÃO chamado
T4: run.completed com caseId de outro workspace → worker fail-closed (not_found retornado)
T5: run.completed processado 2x (duplicata) → segundo processamento ignorado (idempotência)
T6: run.completed sem caseId no Run → worker registra log e encerra sem mutation
T7: updateCase retorna responsible_required → worker registra bloqueador, não muta
T8: eventRunId presente no ImobCaseEvent criado
T9: buildImobCanonicalCase invocado após updateCase com campos corretos
T10: ImobCase.canonical atualizado após mutation (não verificado em React)
```

---

## Seção 12 — Arquitetura proposta para ImobPostRunMutationWorker

```
run.completed emitido em runWorker.ts
  ↓ (se domain="imob")
enqueueImobRunCompleted({ runId, tenantId, workspaceId })
  ↓
imobRunCompletedQueue (BullMQ — durável)
  ↓
ImobPostRunMutationWorker.consume(job)
  │
  ├─ lookup: prisma.run.findFirst({ id: runId, tenantId, workspaceId })
  │   ├─ caseId = run.caseId
  │   ├─ actionId = run.request.metadata.executionInput.actionId
  │   ├─ status = run.status ("success" | "error")
  │   └─ simulated = run.response.outputs.some(o => o.simulated)
  │
  ├─ guards:
  │   ├─ if (!caseId) → skip (log warning)
  │   ├─ if (status !== "success") → skip
  │   └─ if (simulated) → skip (ToolContract ausente)
  │
  ├─ idempotência:
  │   └─ if (ImobCaseEvent exists for runId+caseId) → skip
  │
  ├─ outcome = resolveImobActionOutcome(actionId)  ← Fase 4.3 — PENDENTE DE PRODUTO
  │   └─ { status, stage, nextStep, pendingItems, blockers }
  │
  ├─ ImobCrmMutationService.updateCase(scope, caseId, { ...outcome, eventRunId: runId })
  │   └─ fail-closed: not_found | responsible_required → log + não muta
  │
  ├─ canonical = buildImobCanonicalCase({ flow, stage, status, ... })
  │   └─ lookup case com owner, property, lead pós-mutation
  │
  └─ prisma.imobCase.update({ where: { id: caseId }, data: { canonical } })
     └─ CC auto-refresh lê novo canonical via GET /imob/cases/:caseId
```

---

## Seção 13 — Fila recomendada

**BullMQ com `imobRunCompletedQueue`** — único caminho que satisfaz:
1. At-least-once delivery (durabilidade Redis + retry automático)
2. Idempotência via `jobId: imob-run-${runId}`
3. DLQ para dead letters
4. Padrão já estabelecido no projeto

Redis pub/sub (`RedisRunEventStore`) **NÃO é adequado** — sem durabilidade, sem retry.

---

## Agentes envolvidos

- **EIAH** (orquestração): routing de intenção, criação do run via `apiAgentsExecute`
- **ImobPostRunMutationWorker** (a criar): consumer da fila durável, responsável pela mutation governada
- **ImobCrmMutationService**: infraestrutura de escrita fail-closed (existente, pronto)
- **CommandCenter**: somente leitura; auto-refresh pós-mutation; sem regra de status

---

## Resumo das alterações deste pré-flight

Nenhuma alteração de código foi realizada. Este relatório é investigação pura.

Arquivos investigados:
- `apps/api/src/workers/runWorker.ts` — path run.completed, simulated flag, emitRunEvent
- `apps/workers/run-worker/src/index.ts` — run-worker service, RedisRunEventStore, PrismaRunEventStore
- `apps/api/src/services/runs.ts` — createRunRecord, extractRunContextFromRequest
- `apps/api/src/services/imob/crm/imobCrmMutationService.ts` — updateCase, cross-workspace guard
- `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` — executionRequest.input.caseId/actionId
- `apps/api/src/routes/imob.ts` — buildImobCanonicalCase (não exportada)
- `apps/api/src/routes/agents.ts` — metadataBase.executionInput, createRunRecord call
- `apps/web/src/features/imob/imobChatDirectedAction.ts` — buildAgentsExecuteMetadata
- `apps/web/src/pages/app/imob/chat.tsx` — apiAgentsExecute call com executionPending.plan.input
- `packages/db/prisma/schema.prisma` — Run.caseId, RunEvent, ToolContract, ImobCaseEvent
- `packages/core/src/queue/runAtivoUniversalQueue.ts` — referência para nova fila BullMQ
- `packages/core/src/queue/maintenanceQueue.ts` — padrão DLQ
