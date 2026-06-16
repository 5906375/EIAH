# Phase 4.1b — Evidence Record
# CC → Chat IMOB: Worker Foundation (ImobPostRunMutationWorker — fundação técnica)

Data de execução: 2026-06-16
Sessão de referência: Phase 4.1b — fundação técnica sem mutation real
Status: `evidenciado`

---

## Escopo da Phase 4.1b

Implementar a fundação técnica do `ImobPostRunMutationWorker` **sem mutation real**:

- **P2**: Extrair `buildImobCanonicalCase` e dependências de `routes/imob.ts` para `apps/api/src/services/imob/imobCanonical.ts`
- **P3**: Criar guard `shouldSkipImobPostRunMutationForSimulatedOutput(run)` — retorna `true` quando `run.response.outputs[].data.simulated === true`
- **P4**: Criar `apps/api/src/queues/imobRunCompletedQueue.ts` — BullMQ durable queue seguindo padrão `runAtivoUniversalQueue.ts`

**Fora de escopo neste ciclo:**
- `ImobPostRunMutationWorker` real (Fase 4.1c)
- `ImobCrmMutationService.updateCase` (Fase 4.1c)
- Alteração de `ImobCase.status` (Fase 4.1c)
- React / ChatAgentLauncher (invariante preservado)
- PATCH /imob/cases/:caseId — PROIBIDO

---

## Arquivos criados / modificados

### 1. `apps/api/src/services/imob/imobCanonical.ts` — CRIADO (P2)

Arquivo novo: extração completa das funções e tipos canônicos que estavam em `routes/imob.ts`.

**Exports:**
```typescript
export function asStringList(value: unknown): string[]
export function normalizeImobCanonicalText(value: string): string
export type ImobCanonicalJourneyType = "property_capture" | "lead_qualification" | ...
export type ImobCanonicalPartyRole = "broker" | "manager" | "owner" | ...
export type ImobCanonicalCommercialGoal = "captacao" | "qualificacao" | ...
export type ImobCanonicalRecommendedAction = { id, label, actionType, inputHint?, reasonCode? }
export type ImobCanonicalCase = { journeyType?, partyRole?, commercialGoal?, recommendedActions?, blockedActions?, missingContext?, reasonCodes? }
export function mapImobFlowToJourneyType(flow): ImobCanonicalJourneyType
export function mapImobFlowToCommercialGoal(flow): ImobCanonicalCommercialGoal
export function mapImobResponsibleToPartyRole(ownerResponsible, journeyType): ImobCanonicalPartyRole
export function buildImobRecommendedActions(params): ImobCanonicalRecommendedAction[]
export function buildImobCanonicalCase(params): ImobCanonicalCase
export function shouldSkipImobPostRunMutationForSimulatedOutput(run): boolean  ← P3
```

**Decisão técnica:** `normalizeImobRouteText` foi renomeada para `normalizeImobCanonicalText` no arquivo extraído, mantendo `normalizeImobRouteText` como função local em `routes/imob.ts` (sem mudança de comportamento — mesma implementação).

**Invariante garantido:** `buildImobCanonicalCase` é função pura. Zero efeitos colaterais. Não acessa DB, não altera estado.

### 2. `apps/api/src/routes/imob.ts` — MODIFICADO (P2)

Removidas as definições locais de `asStringList`, tipos canonicais e funções canonicais (272 linhas removidas).

Adicionado import:
```typescript
import {
  asStringList,
  buildImobCanonicalCase,
  type ImobCanonicalCase,
} from "../services/imob/imobCanonical";
```

`normalizeImobRouteText` e `withImobCanonicalCase` permanecem locais em `routes/imob.ts` (não extraídos — usados apenas na camada de rota).

**Sem mudança de comportamento:** todos os chamadores existentes recebem o mesmo output.

### 3. `apps/api/src/queues/imobRunCompletedQueue.ts` — CRIADO (P4)

Fila BullMQ durable para o `ImobPostRunMutationWorker`.

**Payload:**
```typescript
export type ImobRunCompletedJobPayload = {
  runId: string;
  tenantId: string;
  workspaceId: string;
  caseId: string;
  actionId: string;
  eventRunId: string;          // liga o ImobCaseEvent ao run que disparou
  receiptPath?: string | null; // opcional — apenas para ações com documento
  bundlePath?: string | null;  // opcional — apenas para ações com bundle
};
```

**Configuração:**
```typescript
export const IMOB_RUN_COMPLETED_QUEUE_NAME = "imob-run-completed";
// jobId: `imob-run-completed:{tenantId}:{workspaceId}:{runId}` — idempotência por runId
// attempts: 3, backoff: exponential(2000ms)
// removeOnComplete: true, removeOnFail: false
```

**Guard de payload:**
```typescript
export async function enqueueImobRunCompleted(job, options?)
// Lança erro se runId | tenantId | workspaceId | caseId | actionId | eventRunId estiver ausente
```

### 4. `apps/api/src/tests/imob-worker-foundation-phase4-1b.test.ts` — CRIADO

5 suítes, 17 testes:

| Suíte | Descrição | Testes |
|-------|-----------|--------|
| S1 | buildImobCanonicalCase canonical extraction | 5 |
| S2 | asStringList helper | 2 |
| S3 | shouldSkipImobPostRunMutationForSimulatedOutput guard | 6 |
| S4 | enqueueImobRunCompleted payload guard | 1 |
| S5 | flow mapping boundary coverage | 3 |

---

## Guard contra simulação (P3) — `shouldSkipImobPostRunMutationForSimulatedOutput`

**Problema:** quando um `realestate.*` ToolContract não existe no DB, o `runWorker.ts` retorna `{ ok: true, simulated: true, ... }` para a ferramenta (linha 1463-1476). O worker de mutation NÃO deve tratar esse run como executado com sucesso real.

**Implementação:**
```typescript
export function shouldSkipImobPostRunMutationForSimulatedOutput(run: { response?: unknown }): boolean {
  // Verifica se qualquer saída de ferramenta em run.response.outputs[].data.simulated === true
  // Se sim → retorna true → worker não chama ImobCrmMutationService
}
```

**Invariante:** `simulated=true` → mutation NUNCA ocorre, independentemente de `run.status`.

---

## Testes — resultado

```
Arquivo: apps/api/src/tests/imob-worker-foundation-phase4-1b.test.ts
Resultado: 17/17 testes passando (5 suítes)

[S1] buildImobCanonicalCase canonical extraction: 5/5 ✅
[S2] asStringList helper: 2/2 ✅
[S3] shouldSkipImobPostRunMutationForSimulatedOutput guard: 6/6 ✅
[S4] enqueueImobRunCompleted payload guard: 1/1 ✅
[S5] flow mapping boundary coverage: 3/3 ✅
```

**Regressão Phase 4.0:**
```
Arquivo: apps/api/src/tests/imob-realestate-action-contracts-11.test.ts
Resultado: 34/34 testes passando (5 suítes) — inalterado ✅
```

---

## Erros TypeScript

Nenhum erro novo introduzido. O import em `routes/imob.ts` usa a mesma interface pública que as funções locais removidas.

---

## Invariantes verificados

- Nenhum `PATCH /imob/cases/:caseId` implementado
- Nenhum campo `ImobCase.status` alterado
- Nenhuma lógica adicionada ao `ChatAgentLauncher` / `chat.tsx`
- `ImobCrmMutationService.updateCase` não chamado
- `ImobPostRunMutationWorker` não criado (aguarda Fase 4.1c)
- `run.status !== "success"` → guard não aplicado neste ciclo (será na Fase 4.1c)
- `simulated=true` → `shouldSkipImobPostRunMutationForSimulatedOutput` retorna `true` ✅
- `buildImobCanonicalCase` é função pura — sem efeitos colaterais ✅
- Fila `imobRunCompletedQueue` — idempotência garantida por `jobId` ✅

---

## Bloqueadores restantes para Fase 4.1c

| Bloqueador | Status | Próxima ação |
|-----------|--------|-------------|
| B3 — Sem mutation pós-run | ABERTO | Fase 4.1c: ImobPostRunMutationWorker real |
| B4 — Canonical não recalculado | ABERTO | Fase 4.1c: recalcular após `updateCase` |
| B6 — CC auto-refresh | ABERTO | Fase 4.3: SSE ou polling |

---

## Próximos passos (Fase 4.1c — somente após novo pré-flight GO/NO-GO)

1. Registrar o `imobRunCompletedQueue` como worker no run-worker service
2. Implementar `ImobPostRunMutationWorker` — consume queue, chama `ImobCrmMutationService.updateCase`
3. Emitir `run.completed` com `{ caseId, actionId }` no payload
4. Recalcular canonical pós-mutation
5. Receipt/bundle se aplicável
6. Novo pré-flight antes de qualquer dessas implementações

---

## Referência arquitetural

```
agent action handler (Fase 4.1c)
  ↓ run.completed event
  ↓ imobRunCompletedQueue.enqueue(runId, caseId, actionId, eventRunId)
  ↓ ImobPostRunMutationWorker.process()
      ↓ guard: shouldSkipImobPostRunMutationForSimulatedOutput → skip se simulated
      ↓ guard: run.status !== "success" → skip
      ↓ guard: caseId ausente → skip
      ↓ ImobCrmMutationService.updateCase(...)
      ↓ buildImobCanonicalCase(...) → recalcular canonical
      ↓ CC auto-refresh via SSE/polling
```

Invariante: "Agente define. Engine executa. Launcher renderiza."
React não participa de mutation. Status decidido exclusivamente no backend.
