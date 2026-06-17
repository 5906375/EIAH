# Phase 3 — Evidence Record
# CC → Chat IMOB: Confirmação explícita antes de apiAgentsExecute

Data de execução: 2026-06-16
Sessão de referência: rodada CC→Chat IMOB (Fase 3)
Status: `evidenciado`

---

## Escopo da Fase 3

Quando `/imob/chat/resolve-turn` retorna `mode="execute"` + `executionRequest` com `requestedActionId`
presente na URL (vindo do Command Center), o Chat IMOB deve:
1. Renderizar badge "ação direcionada — aguardando confirmação"
2. Mostrar CTAs explícitas "Confirmar execução" e "Cancelar"
3. Não chamar `apiAgentsExecute` automaticamente
4. Chamar `apiAgentsExecute` apenas após confirmação explícita do usuário
5. Propagar `source: "command-center"` no metadata de `apiAgentsExecute`
6. Proteger contra execução duplicada (double-click)

---

## Arquivos criados / modificados

### 1. `apps/web/src/features/imob/imobChatDirectedAction.ts` — CRIADO

Módulo de funções puras (sem React, sem efeitos colaterais):
- `DIRECTED_ACTION_BADGE`: constante `"ação direcionada — aguardando confirmação"`
- `shouldUseDirectedActionFlow(requestedActionId, turnMode)`: retorna `true` somente quando `actionId` presente E `mode=execute`
- `buildDirectedActionCard(thread)`: retorna card com `type="action"`, `status="waiting"`, e CTAs `confirm_execution` (kind=primary) + `reject_execution` (kind=neutral)
- `buildAgentsExecuteMetadata(params)`: constrói metadata para `apiAgentsExecute`; inclui `source` apenas quando fornecido, mantendo caminhos não-dirigidos limpos

### 2. `apps/web/src/pages/app/imob/chat.tsx` — MODIFICADO

#### Tipos expandidos

`ChatMessage`: adicionado `dispatchBadge?: string | null`
`PendingExecution`: adicionado `source?: string | null`

#### Refs

Adicionado `directedConfirmingRef = React.useRef(false)` — guarda contra double-click no "Confirmar execução" para execuções de fonte `"command-center"`.

#### `prepareDirectedActionExecution` — NOVA FUNÇÃO

Análoga a `startPlanExecution` mas:
- Reseta `directedConfirmingRef.current = false` (fresh start por ação dirigida)
- Chama `apiAgentsDiscovery` + `apiAgentsNegotiate` (sem `apiAgentsExecute`)
- Cria `PendingExecution` com `source: "command-center"`
- Define `setState("awaiting_user_action")` — não "executing"
- Cria `ChatMessage` com `dispatchBadge: DIRECTED_ACTION_BADGE` e card com CTAs de confirmação
- Não chama `runExecutionFlow` — aguarda ação do usuário

#### `runExecutionFlow` — MODIFICADO

`metadata` agora usa `buildAgentsExecuteMetadata(...)` que inclui `source` quando `executionPending.source` presente. Garante `source: "command-center"` no payload de `apiAgentsExecute` após confirmação.

#### `handleConfirmExecution` — MODIFICADO

Adicionado guard targetado:
```typescript
if (pendingExecution.source === "command-center" && directedConfirmingRef.current) return;
...
if (pendingExecution.source === "command-center") {
  directedConfirmingRef.current = true;
}
```
Protege apenas execuções dirigidas (não afeta CTAs de engine regulares). Após confirmação, `runExecutionFlow` atualiza o card (remove confirm/reject CTAs → adiciona view-run), prevenindo re-trigger via render.

#### `clearPendingExecution` — MODIFICADO

Adicionado `directedConfirmingRef.current = false` — reset do guard quando `pendingExecution` é limpo externamente.

#### Render

Badge `dispatchBadge` renderizado com estilo âmbar logo após `consultBadge`:
```tsx
{message.dispatchBadge ? (
  <span className="mt-1.5 inline-block rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300/80">
    {message.dispatchBadge}
  </span>
) : null}
```

#### Branching no `mode=execute`

```typescript
if (shouldUseDirectedActionFlow(requestedActionId, turn.mode)) {
  await prepareDirectedActionExecution(...);
  return;
}
// else: fluxo normal startPlanExecution (sem requestedActionId = auto-execute padrão)
```

### 3. `apps/web/src/features/imob/imobChatPhase3DirectedAction.test.ts` — CRIADO

---

## Testes unitários

```
Resultado: 12/12 testes passando

Cenários cobertos:
  [1]  shouldUseDirectedActionFlow → true quando requestedActionId + mode=execute
  [2]  shouldUseDirectedActionFlow → false quando requestedActionId é null
  [3]  shouldUseDirectedActionFlow → false quando requestedActionId é string vazia
  [4]  shouldUseDirectedActionFlow → false quando mode=consult (consult permanece consulta)
  [5]  shouldUseDirectedActionFlow → false quando mode=blocked (sem CTA de confirmação)
  [6]  buildDirectedActionCard inclui CTA confirm_execution
  [7]  buildDirectedActionCard inclui CTA reject_execution
  [8]  CTA de confirmação tem kind=primary
  [9]  buildAgentsExecuteMetadata inclui source="command-center" quando fornecido
  [10] buildAgentsExecuteMetadata não inclui source quando não fornecido
  [11] DIRECTED_ACTION_BADGE tem texto correto
  [12] buildDirectedActionCard define thread.status como "waiting" (não executando)
```

### Testes de não-regressão

```
Fase 1 (imobCommandCenterPhase1.test.ts): 5/5 pass
Fase 2 (imob-crm-action-dispatcher.test.ts): 16/16 pass
```

---

## Invariantes verificados

- Nenhum `PATCH /imob/cases/:caseId` implementado
- Nenhum campo `ImobCase.status` alterado
- Nenhuma lógica de negócio adicionada ao `ChatAgentLauncher`; lógica no service layer (helper puro)
- `apiAgentsExecute` não é chamado automaticamente: nem em `useEffect`, nem em render, nem em `onReceive`
- Double-click no confirmar não dispara segundo `apiAgentsExecute`: `directedConfirmingRef` guard
- Re-render não relança `apiAgentsExecute`: não há path de render para `runExecutionFlow`
- `source: "command-center"` presente no metadata de `apiAgentsExecute` quando executado via fluxo dirigido
- `caseId`, `actionId`, `reasonCode` já estão em `executionRequest.input` (herdados do dispatcher Fase 2)
- `mode=consult` sem `requestedActionId` → badge "consulta — não altera estado" (sem directed flow)
- `mode=blocked` → nenhum CTA de confirmação (shouldUseDirectedActionFlow retorna false)
- Erros TypeScript: mesma contagem com e sem stash (nenhum novo erro introduzido)

---

## Critério de aceitação — verificado

- [x] Badge "ação direcionada — aguardando confirmação" renderizado quando `mode=execute` + `requestedActionId`
- [x] `apiAgentsExecute` não chamado automaticamente em mount/receive quando `requestedActionId` presente
- [x] CTA "Confirmar execução" chama `runExecutionFlow` via `handleConfirmExecution`
- [x] Re-render não relança `apiAgentsExecute`
- [x] Double-click no confirmar não dispara segundo `apiAgentsExecute`
- [x] `caseContext.caseId` presente no payload de `apiAgentsExecute` após confirmação (via `plan.input`)
- [x] `actionId` e `reasonCode` no input de `apiAgentsExecute` após confirmação (via dispatcher Fase 2)
- [x] `source: "command-center"` no metadata de `apiAgentsExecute` após confirmação
- [x] `mode=consult` sem `requestedActionId` permanece fluxo de consulta
- [x] `mode=blocked` sem CTA de confirmação
- [x] 12/12 testes unitários da Fase 3 passando
- [x] 5/5 testes da Fase 1 inalterados e passando
- [x] 16/16 testes da Fase 2 inalterados e passando

---

## DoD da Fase 4 (não implementar — apenas registrar)

Fase 4 fecha o ciclo: após a execução governada confirmada na Fase 3, o resultado deve ser
refletido no `ImobCase` de forma auditável. Itens necessários:

1. **Run confirmado** — `apiAgentsExecute` retorna `runId`; polling/SSE obtém status final
2. **Mutation governada** — `PUT /imob/cases/:caseId/canonical` (não `PATCH status` direto) para atualizar `canonical.recommendedActions`, `canonical.reasonCodes`, `canonical.nextStep` com base no resultado do run
3. **Event receipt** — `receipt` e `bundle` gerados ao término do run com `txId` e hash
4. **Atualização auditável** — `ImobCase.canonical` atualizado via serviço de snapshot governado; o `ImobCase.status` só muda via regra de negócio no backend (não pelo chat)
5. **Evidence bundle** — artefato de prova do ciclo CC→Chat→Execute→Canonical registrado no Evidence Index

**Arquitetura alvo da Fase 4:**
```
CommandCenter → Chat (Fase 1)
  → Backend dispatch (Fase 2)
    → Confirmação usuário (Fase 3)
      → apiAgentsExecute → runId → polling/SSE → status final (Fase 4 início)
        → PUT /imob/cases/:caseId/canonical → ImobCase.canonical atualizado
          → receipt + bundle (GovernedMutation) → Evidence bundle no CC
```

**Observação arquitetural crítica:**
> "Abrir chat não é resolução; resolução exige run confirmado, mutation governada,
> event/receipt/bundle e atualização auditável do ImobCase."

A Fase 3 entrega o checkpoint de confirmação — o usuário deliberadamente autoriza a execução.
A Fase 4 entrega a prova de que o run foi executado, o resultado foi governado e o caso
foi atualizado de forma auditável. Somente com Fase 4 completa o ciclo CC→Chat pode ser
classificado como fluxo de resolução operacional (não apenas de consulta/iniciação).
