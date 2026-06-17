# Phase 2 — Evidence Record
# CC → Chat IMOB: Dispatch de ação validado pelo backend

Data de execução: 2026-06-16
Sessão de referência: rodada CC→Chat IMOB (Fase 2)
Status: `evidenciado`

---

## Escopo da Fase 2

Implementar o backend `/imob/chat/resolve-turn` para consumir `actionId` enviado pelo frontend
e retornar `mode="execute"` + `executionRequest` apenas quando a ação for canônica e permitida
para o `ImobCase`. Ações consultivas retornam `null` do dispatcher (fall-through para o engine).
Ações inválidas ou caso de outro workspace retornam `mode="blocked"`.

---

## Arquivos criados / modificados

### 1. `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` — CRIADO

Função pura `resolveImobCrmActionDispatch(params)`:
- Valida `actionId` contra `canonical.recommendedActions` do `ImobCase`
- Retorna `null` para `actionType === "consultive"` (fall-through ao engine)
- Retorna `null` quando `actionId` não está no `ACTION_EXECUTION_MAP` (fall-through ao engine)
- Retorna `mode="blocked"` com `ACTION_NOT_ALLOWED_FOR_CASE` quando `actionId` não encontrado em `canonical.recommendedActions`
- Retorna `mode="execute"` + `executionRequest` preenchido para ações operacionais válidas

Mapeamento canônico implementado (11 actionIds → executionRequest):

| actionId | intent | operation | action |
|----------|--------|-----------|--------|
| owner.register | capture | owner.create | realestate.register_property |
| property.create | capture | property.create | realestate.register_property |
| listing.activate | listing | listing.activate | realestate.apply_adjustment |
| lead.qualify | lead | lead.qualify | realestate.qualify_lead |
| visit.schedule | visit | visit.schedule | realestate.schedule_visit |
| documents.review | documents | documents.collect | realestate.collect_documents |
| documents.collect | documents | documents.collect | realestate.collect_documents |
| proposal.create | proposal | proposal.create | realestate.create_contract |
| deal.review | deal | deal.review | realestate.review_deal |
| contract.prepare | contract | contract.prepare | realestate.create_contract |
| commission.settle | commission | commission.settle | realestate.release_commission |

`executionRequest.input` carrega: `caseId`, `actionId`, `reasonCode`, `requestedAt`.

### 2. `apps/api/src/routes/imob.ts` — MODIFICADO

No handler `POST /imob/chat/resolve-turn`:
- Extrai `actionId` do body (`asString(body.actionId)`)
- Quando `actionId` presente: carrega `ImobCase` com `{ id, tenantId, workspaceId }` (proteção cross-workspace)
- Chama `resolveImobCrmActionDispatch` com case + canonical
- Se resultado ≠ null → short-circuit, retorna resposta sem chamar o engine
- Se null → fall-through ao engine (comportamento anterior preservado)

### 3. `apps/api/src/lib/api.ts` — MODIFICADO (fronte)

`apiResolveImobTurn` body: adicionado `actionId?: string | null`.

### 4. `apps/web/src/features/imob/imobApiClient.ts` — MODIFICADO

`resolveImobTurn` body: adicionado `actionId?: string | null`.

### 5. `apps/web/src/pages/app/imob/chat.tsx` — MODIFICADO

- `resolveImobTurn` call: passa `actionId: requestedActionId` para o backend

---

## Testes unitários

### `apps/api/src/tests/imob-crm-action-dispatcher.test.ts` — CRIADO

```
Resultado: 16/16 testes passando

Cenários cobertos:
  [1]  actionId operacional válido → mode=execute + executionRequest
  [2]  actionId consultivo → null (fall-through)
  [3]  actionId não existente em canonical → mode=blocked (ACTION_NOT_ALLOWED_FOR_CASE)
  [4]  canonical null → mode=blocked
  [5]  canonical sem recommendedActions → mode=blocked
  [6]  actionId operacional sem reasonCode → ainda retorna execute (reasonCode opcional)
  [7..17] todos os 11 actionIds do ACTION_EXECUTION_MAP → mode=execute
```

### `apps/web/src/features/imob/imobCommandCenterPhase1.test.ts` — (Fase 1, mantido)

```
Resultado: 5/5 testes passando (inalterados)
```

---

## Invariantes verificados

- Nenhum `PATCH /imob/cases/:caseId` implementado
- Nenhum campo `ImobCase.status` alterado
- Nenhuma lógica de negócio adicionada ao `ChatAgentLauncher` (`chat.tsx`)
- Dispatcher é função pura sem acesso a DB
- Proteção cross-workspace: query `where: { id, tenantId, workspaceId }` — resultado null → blocked
- Erros TypeScript pré-existentes: 4 (confirmados via `git stash` antes das alterações; não introduzidos)

---

## Critério de aceitação — verificado

- [x] `resolveImobCrmActionDispatch` valida `actionId` vs `canonical.recommendedActions`
- [x] `actionType: "consultive"` retorna null (sem execute)
- [x] `actionId` inválido retorna `mode="blocked"` com `ACTION_NOT_ALLOWED_FOR_CASE`
- [x] 11 actionIds operacionais mapeados corretamente para `executionRequest`
- [x] `executionRequest.input` carrega `caseId`, `actionId`, `reasonCode`, `requestedAt`
- [x] Route curto-circuita antes de chamar o engine quando dispatcher retorna não-null
- [x] Proteção cross-workspace por query multi-campo
- [x] 16/16 testes unitários do dispatcher passando
- [x] 5/5 testes da Fase 1 inalterados e passando

---

## Pendências (Fase 3)

- Chat IMOB deve renderizar badge "ação direcionada — aguardando confirmação" quando `mode=execute` + `requestedActionId`
- `apiAgentsExecute` somente após confirmação explícita do usuário (não automaticamente)
- Propagar `source: "command-center"` no metadata de `apiAgentsExecute`
- Proteção contra execução duplicada (double-click)
