# Phase 4 — Pré-flight Técnico
# CC → Chat IMOB: Run confirmado → Mutation governada do ImobCase

Data de execução: 2026-06-16
Tipo: pré-flight (investigação, sem alteração de código)
Status: `NO-GO` — 5 bloqueadores críticos identificados

---

## INVARIANTES OBRIGATÓRIOS DA FASE 4

> Estes invariantes devem aparecer no topo de qualquer prompt de implementação da Fase 4 e não podem ser negociados:

1. `ImobCase.status` novo é decidido exclusivamente no backend.
2. O status deriva do action handler + canonical recalculation.
3. React não contém regra de status; o Command Center apenas faz auto-refresh e lê o novo estado da API.

---

## Escopo do Pré-flight

Mapear os 11 actionIds do `imobCrmActionDispatcher.ts` sem alterar código.
Para cada actionId: handler, executionRequest, caseContext.caseId, outcome esperado, mutation permitida,
auditabilidade, testes necessários. Identificar todos os gaps. Produzir recomendação GO/NO-GO.

**Restrições absolutas respeitadas:**
- Nenhuma alteração de código
- Nenhum `PATCH /imob/cases/:caseId`
- Nenhuma alteração de `ImobCase.status`
- Nenhuma chamada a `apiAgentsExecute`
- Nenhuma atualização do EVIDENCE_INDEX neste ciclo

---

## Arquivos investigados

| Arquivo | Propósito |
|---------|-----------|
| `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` | Mapeamento 11 actionIds → executionRequest |
| `apps/api/src/routes/agents.ts` | ACTION_CONTRACTS, discovery/negotiate/execute handlers |
| `apps/api/src/services/imob/control/imobRunActionCatalog.ts` | IMOB_RUN_ACTION_ALIASES, prepareRunRequestAction |
| `apps/api/src/services/imob/crm/imobCrmMutationService.ts` | updateCase (linhas 725-873) |
| `apps/api/src/services/imob/imobCaseSnapshotService.ts` | Snapshot de conversas (não é canonical recalc) |
| `apps/api/src/routes/imob.ts` | buildImobCanonicalCase, upsertImobCaseFromResolvedTurn |
| `apps/api/src/routes/imobCrmRouter.ts` | Uso de updateCase em aprovações |
| `apps/workers/action-runner/src/index.ts` | MCP enforcement, ToolContract lookup |
| `apps/workers/run-worker/src/index.ts` | executeRun, context.actions, eventos run.* |
| `packages/core/src/actions/index.ts` | registerAllActions — sem realestate.* |
| `apps/api/src/actions/tenantActionRegistry.ts` | tenantActionResolver — sem realestate.* |
| `apps/api/src/tests/realestate.high-actions.e2e.test.ts` | Cobertura existente (discovery/negotiate apenas) |

---

## Matriz completa: 11 actionIds

### Coluna "CONTRACT": presença em ACTION_CONTRACTS (`apps/api/src/routes/agents.ts`)
### Coluna "HANDLER": handler de execução registrado no core action registry
### Coluna "MUTATION": ImobCrmMutationService.updateCase chamado após run
### Coluna "STATUS": se a Fase 3 (`prepareDirectedActionExecution`) conseguiria completar

| # | actionId | intent | operation | executionRequest.action | CONTRACT | HANDLER | MUTATION | STATUS |
|---|---------|--------|-----------|-------------------------|----------|---------|----------|--------|
| 1 | owner.register | capture | owner.create | `realestate.register_property` | ✅ v1.0.0 | ❌ ausente | ❌ ausente | PARCIAL |
| 2 | property.create | capture | property.create | `realestate.register_property` | ✅ v1.0.0 | ❌ ausente | ❌ ausente | PARCIAL |
| 3 | listing.activate | listing | listing.activate | `realestate.apply_adjustment` | ✅ v1.2.0 | ❌ ausente | ❌ ausente | BLOQUEADO* |
| 4 | lead.qualify | lead | lead.qualify | `realestate.qualify_lead` | ❌ FALTANDO | ❌ ausente | ❌ ausente | BLOQUEADO |
| 5 | visit.schedule | visit | visit.schedule | `realestate.schedule_visit` | ❌ FALTANDO | ❌ ausente | ❌ ausente | BLOQUEADO |
| 6 | documents.review | documents | documents.collect | `realestate.collect_documents` | ❌ FALTANDO | ❌ ausente | ❌ ausente | BLOQUEADO |
| 7 | documents.collect | documents | documents.collect | `realestate.collect_documents` | ❌ FALTANDO | ❌ ausente | ❌ ausente | BLOQUEADO |
| 8 | proposal.create | proposal | proposal.create | `realestate.create_contract` | ✅ v1.0.0 | ❌ ausente | ❌ ausente | PARCIAL |
| 9 | deal.review | deal | deal.review | `realestate.review_deal` | ❌ FALTANDO | ❌ ausente | ❌ ausente | BLOQUEADO |
| 10 | contract.prepare | contract | contract.prepare | `realestate.create_contract` | ✅ v1.0.0 | ❌ ausente | ❌ ausente | PARCIAL |
| 11 | commission.settle | commission | commission.settle | `realestate.release_commission` | ✅ v1.0.0 | ❌ ausente | ❌ ausente | PARCIAL |

**\* listing.activate → realestate.apply_adjustment: mismatch semântico grave**
O contrato de `apply_adjustment` exige `propertyId`, `adjustmentType`, `amountCents`, `reason` (schema financeiro).
Ativar um listing não é um ajuste financeiro. O executionRequest.input de `listing.activate`
não satisfaz esse inputSchema. Execução falharia na validação do contrato MCP ou produziria dados incorretos.

---

## Bloqueadores Críticos (razão GO/NO-GO)

### Bloqueador 1 — ACTION_CONTRACTS incompleto (5/11 actionIds bloqueados)

**Arquivo:** `apps/api/src/routes/agents.ts` linhas 39–130

`ACTION_CONTRACTS` registra 4 ações realestate:
```
realestate.apply_adjustment   ✅
realestate.register_property  ✅
realestate.create_contract    ✅
realestate.release_commission ✅
```

**Ausentes (5 ações necessárias):**
```
realestate.qualify_lead       ❌  → afeta: lead.qualify
realestate.schedule_visit     ❌  → afeta: visit.schedule
realestate.collect_documents  ❌  → afeta: documents.review, documents.collect
realestate.review_deal        ❌  → afeta: deal.review
```

**Impacto Fase 3 (já implementada):**
`prepareDirectedActionExecution` chama `apiAgentsDiscovery({ actions: [plan.action] })`.
Para as 5 ações ausentes, a response retornará `actions: []` → a função lança erro → chat entra em `mode=blocked`.
Ou seja, 5/11 actionIds falham **antes** de chegar ao confirm do usuário.

**Impacto Fase 4:**
`apiAgentsExecute` faz `ACTION_CONTRACTS[actionName]` → retorna `undefined` → HTTP 404.
Sem contrato, run não é criado. Mutation nunca ocorre.

---

### Bloqueador 2 — Nenhum action handler registrado para realestate.*

**Arquivo:** `packages/core/src/actions/index.ts` linhas 39–62

`registerAllActions` registra: DeFi, Risk, Notification, Knowledge, Billing, Finance, Guardian, Reporting, AgentProfile.
**Não há `registerRealestateActions` ou qualquer função que registre `realestate.*`.**

**Arquivo:** `apps/workers/run-worker/src/index.ts` linha 186
```typescript
const result = await orchestrator.run({
  ...
  actions: {}   // ← vazio para realestate
});
```

**Arquivo:** `apps/workers/action-runner/src/index.ts` linhas 622–648
O action-runner usa MCP (Model Context Protocol): para executar, exige um registro `ToolContract`
no banco com `name = actionName`, `version`, `status = "active"`. Não existe evidência de que esses
registros existam para `realestate.*` no DB.

**Impacto Fase 4:**
Mesmo com ACTION_CONTRACTS corrigido, a execução real falharia:
- run-worker: `context.actions["realestate.xxx"]` seria `undefined` → erro `Action não registrada`
- action-runner: `ToolContract` ausente → erro `ToolContract missing: realestate.xxx@1.0.0`

---

### Bloqueador 3 — Nenhuma mutation do ImobCase após run completado

**Investigado:**
- `apps/workers/run-worker/src/index.ts` — `executeRun` emite `run.completed` mas **não chama** `ImobCrmMutationService`
- `apps/workers/action-runner/src/index.ts` — processa via MCP, não conhece `ImobCase`
- `apps/api/src/routes/imob.ts` — `upsertImobCaseFromResolvedTurn` é chamado apenas em `/imob/chat/resolve-turn` (chat turn), nunca post-run
- `apps/api/src/routes/imobCrmRouter.ts` — `updateCase` chamado em aprovações (linha 870) e outra rota (1034), mas não em callback de run

**O que falta:**
Não existe nenhum dos seguintes:
- Callback post-run que leia `metadata.executionInput.caseId` e chame `updateCase(caseId, { eventRunId: runId, status: ... })`
- Endpoint `PUT /imob/cases/:caseId/canonical` (referenciado no DoD da Fase 3, mas não existe)
- Consumer de fila/evento que detecte `run.completed` e atualize o `ImobCase`
- Qualquer ligação entre `runId` e `ImobCase` no pós-run

**O que existe e está pronto:**
`ImobCrmMutationService.updateCase` (linha 725):
- Aceita `eventRunId?: string | null` → já cria `ImobCaseEvent` linkado ao run
- Detecta terminal state transitions e cria `case.completed` event automaticamente
- Registra audit event com `before/after`
- Valida cross-workspace
- Cria shadow record

Ou seja: **a infraestrutura de mutation existe mas não é invocada após um run.**

---

### Bloqueador 4 — Canonical recalculation não ocorre post-run

**Arquivo:** `apps/api/src/routes/imob.ts` linhas 424–462

`buildImobCanonicalCase` é uma função pura que deriva canonical de:
`flow`, `stage`, `status`, `nextStep`, `blockers`, `pendingItems`, `lead`, `owner`, `property`.

Ela já está implementada e funciona. O problema: ela não é chamada automaticamente após um run atualizar o `ImobCase`.
O campo `imobCase.canonical` (JSON) no banco não é recalculado após `updateCase`.

O CC lê canonical do banco via GET. Se canonical não for recalculado e persistido pós-mutation,
o CC mostrará dados desatualizados mesmo após auto-refresh.

**Caminho necessário (não implementado):**
```
updateCase(caseId, { status, stage, ... })
  → chamar buildImobCanonicalCase com campos atualizados
  → persistir canonical no campo imobCase.canonical
  → CC GET retorna canonical atualizado
```

---

### Bloqueador 5 — Semantic mismatch: listing.activate → realestate.apply_adjustment

**Arquivo:** `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` linha 14

```typescript
"listing.activate": { ..., action: "realestate.apply_adjustment", ... }
```

O contrato de `realestate.apply_adjustment` (linha 40–62 de agents.ts) exige:
```json
{ "propertyId": "...", "adjustmentType": "discount|fine|correction", "amountCents": 1, "reason": "..." }
```

Ativar um listing é uma operação de publicação/ativação, não um ajuste financeiro.
O input gerado pelo dispatcher para `listing.activate` não terá `adjustmentType`, `amountCents` etc.
A execução MCP falharia na validação do schema ou produziria uma mutação financeira indevida.

**Ação necessária:** Criar `realestate.activate_listing` com inputSchema correto,
ou corrigir o mapeamento para um contrato semanticamente apropriado.

---

### Bloqueador 6 (secundário) — Nenhum mecanismo de auto-refresh do CC

**Investigado:**
- `apps/workers/run-worker/src/index.ts` — emite `run.completed` mas só em `RedisRunEventStore` e `PrismaRunEventStore`
- Não existe SSE endpoint para o CC escutar eventos de run
- Não existe polling endpoint específico para "meu case teve run completado?"
- O CC teria que fazer polling manual de GET `/api/imob/cases/:caseId` após detectar que o run terminou

**Impacto para Fase 4:**
Sem mecanismo de refresh, o CC não exibirá a mutation governada ao usuário após execução.
Funciona como requisito de UX (não bloqueia a mutation em si), mas bloqueia a evidência observável.

---

## Análise de cobertura de testes existente

| Arquivo de teste | O que cobre | O que NÃO cobre |
|---------|-------------|-----------------|
| `realestate.high-actions.e2e.test.ts` | Discovery (4 ações) + negotiate — tier=HIGH + txIdRequired | Execute, caso de mutation, canonical update, missing 5 actions |
| `realestate.commission.settlement.e2e.test.ts` | Settlement flow | Case mutation post-run |
| `imob-governance-evidence.contract.test.ts` | Governance evidence schema | Run → case mutation path |
| `runs.imob-action.contract.test.ts` | Run creation contract | Post-run ImobCase update |
| `imobRunActionCatalog.test.ts` | prepareRunRequestAction normalization | Executor, case mutation |

**Gaps de teste para Fase 4:**
1. `lead.qualify`, `visit.schedule`, `collect_documents`, `review_deal` não testados em discovery/negotiate (pois não existem em ACTION_CONTRACTS)
2. Nenhum teste de `updateCase` via runId pós-execução
3. Nenhum teste de canonical recalculation pós-mutation
4. Nenhum teste de cross-workspace block no post-run mutation path
5. Nenhum teste de run failure → case NÃO atualizado
6. Nenhum teste de receipt/bundle linkado ao ImobCase

---

## Pré-condições para abrir Fase 4 (ordenadas por prioridade)

### Pré-condição 1 — Registrar 5 contratos ausentes em ACTION_CONTRACTS
**Arquivo:** `apps/api/src/routes/agents.ts`
Adicionar:
- `realestate.qualify_lead` (tier: HIGH, txIdRequired: true, inputSchema com leadId + intent)
- `realestate.schedule_visit` (tier: HIGH, txIdRequired: true, inputSchema com propertyId + leadId + datetime)
- `realestate.collect_documents` (tier: HIGH, txIdRequired: true, inputSchema com caseId + documentTypes)
- `realestate.review_deal` (tier: MEDIUM ou HIGH, inputSchema com dealId + proposalId)
- Corrigir ou criar `realestate.activate_listing` para substituir o uso de `apply_adjustment` em `listing.activate`

### Pré-condição 2 — Definir outcome por ação (antes de implementar handlers)
Para cada actionId, o produto deve decidir:
- Qual o `status` resultante do ImobCase? (`pending_data` | `ready_for_review` | `blocked` | `done`)
- Qual o `stage` resultante?
- Qual o `nextStep` (texto)?
- Quais `pendingItems` ou `blockers` são produzidos no sucesso?
- Quais são os critérios de falha (run failure → case NÃO muda)?

**Esta decisão é de domínio, não de implementação.** Deve ser documentada antes do código.

### Pré-condição 3 — Escolher e desenhar o caminho post-run → ImobCase mutation
Três opções:

**Opção A (recomendada — webhook no action-runner):**
Após `executeWithMCP` sucesso, o action-runner extrai `caseId` de `metadata.executionInput`
e chama `ImobCrmMutationService.updateCase` com `eventRunId = runId`.
Vantagem: atômico com o run, não depende do frontend.
Desvantagem: acoplamento do action-runner a lógica de domínio IMOB.

**Opção B — endpoint de adoção frontend:**
Após `apiAgentsExecute` retornar runId e polling indicar `run.success`,
o frontend chama `POST /api/imob/runs/:runId/adopt-to-case` que aciona `updateCase`.
Vantagem: desacoplado do worker.
Desvantagem: frontend participa de mutation (risco de skip/bypass).

**Opção C — consumer de fila dedicado (IMOB worker):**
Worker IMOB escuta `run.completed` events, verifica se `metadata.domain === "imob"`,
extrai `caseId`, chama `updateCase`.
Vantagem: completamente desacoplado, auditável, retry automático.
Desvantagem: novo worker ou extensão do maintenance-worker.

**Recomendação arquitetural:** Opção C (worker dedicado) por separação de responsabilidade.
Opção A é aceitável se o action-runner tiver um adapter isolado para IMOB.
Opção B viola o princípio "React não contém regra de status" e deve ser descartada.

### Pré-condição 4 — Criar ou confirmar ToolContract DB records
O action-runner requer `ToolContract` no banco com `status = "active"` para cada ação.
Deve-se confirmar se esses registros existem em staging/prod ou se precisam ser criados via migration.

### Pré-condição 5 — Mecanismo de CC auto-refresh
Opção mínima: polling de GET `/api/imob/cases/:caseId` após run iniciar no chat.
Opção ideal: SSE endpoint por caseId ou runId para notificação push.
Esta pré-condição pode ser postergada para uma sub-fase (Fase 4b).

---

## Mapeamento completo: caseId, caseContext, auditabilidade

| actionId | caseId disponível? | fonte do caseId | auditabilidade atual |
|---------|-------------------|-----------------|----------------------|
| owner.register | ✅ (via executionRequest.input.caseId do dispatcher) | `caseContext.caseId` na URL do chat | ImobCaseEvent criado por updateCase |
| property.create | ✅ | idem | idem |
| listing.activate | ✅ | idem | idem (mas semantic mismatch) |
| lead.qualify | ✅ | idem | — (ACTION_CONTRACT ausente bloqueia run) |
| visit.schedule | ✅ | idem | — |
| documents.review | ✅ | idem | — |
| documents.collect | ✅ | idem | — |
| proposal.create | ✅ | idem | idem |
| deal.review | ✅ | idem | — |
| contract.prepare | ✅ | idem | idem |
| commission.settle | ✅ | idem | idem |

O `caseId` está disponível em todos os 11 casos via `executionRequest.input.caseId`
(populado pelo dispatcher Fase 2). O problema não é a disponibilidade do caseId,
mas a ausência do mecanismo que o usa pós-run.

**Validação cross-workspace:** `ImobCrmMutationService.updateCase` já valida que
`caseId` pertence ao `tenantId + workspaceId` do scope (linha 726-730). Está fail-closed.

---

## Receita de Fase 4 (quando as pré-condições forem atendidas)

```
Passo 1 — Backend: Registrar 5 contratos ausentes em ACTION_CONTRACTS
Passo 2 — Produto: Definir outcome por ação (status/stage/nextStep/blockers pós-run)
Passo 3 — Backend: Implementar post-run mutation path (Opção C recomendada)
           → Worker detecta run.completed + metadata.domain === "imob"
           → Extrai caseId de metadata.executionInput.caseId
           → Valida cross-workspace
           → Chama ImobCrmMutationService.updateCase({ eventRunId: runId, status, stage, ... })
           → Chama buildImobCanonicalCase com campos atualizados
           → Persiste canonical no imobCase.canonical
Passo 4 — Backend: Corrigir listing.activate → criar realestate.activate_listing
Passo 5 — Testes mínimos obrigatórios (10 cenários):
           [T1] run success → ImobCase atualizado com novo status/stage
           [T2] run failure → ImobCase NÃO alterado
           [T3] caseId de outro workspace → bloqueado (fail-closed)
           [T4] caseId ausente no metadata → run executado, case ignorado (sem erro)
           [T5] canonical recalculado corretamente após updateCase
           [T6] ImobCaseEvent criado com eventRunId = runId
           [T7] receipt/bundle associado ao case (txId no metadata)
           [T8] terminal transition cria case.completed event
           [T9] lead.qualify discovery/negotiate retorna contrato correto (novo contrato)
           [T10] listing.activate usa contrato correto (não apply_adjustment)
Passo 6 — Evidence: artefato phase4-case-mutation.md
           → atualizar EVIDENCE_INDEX somente após artefato existir
```

---

## Recomendação: GO / NO-GO

### Veredito: **NO-GO**

**Justificativa:** 5 bloqueadores críticos impedem implementação segura da Fase 4:

| Nº | Bloqueador | Gravidade | Desbloqueável sem decisão de produto? |
|---|-----------|-----------|---------------------------------------|
| B1 | 5 realestate.* actions ausentes em ACTION_CONTRACTS | CRÍTICO | Parcialmente (schema pode ser proposto) |
| B2 | Nenhum handler de execução para realestate.* | CRÍTICO | Não (depende de ToolContract DB + MCP setup) |
| B3 | Nenhuma mutation do ImobCase pós-run | CRÍTICO | Não (exige decisão de arquitetura Opção A/B/C) |
| B4 | Canonical não recalculado pós-run | ALTO | Sim (buildImobCanonicalCase existe, falta chamada) |
| B5 | listing.activate → realestate.apply_adjustment (mismatch) | ALTO | Não (exige decisão de produto sobre o contrato correto) |

**O que está pronto e não bloqueia:**
- `ImobCrmMutationService.updateCase` — produção-ready, aceita `eventRunId`, cria audit trail, fail-closed
- `buildImobCanonicalCase` — função pura, pronta para ser chamada pós-mutation
- `caseId` disponível em todos os 11 actionIds via dispatcher Fase 2
- Fases 1+2+3 evidenciadas e estáveis
- Cross-workspace protection já embutida no updateCase

**Próxima ação recomendada antes de abrir Fase 4:**
1. Decisão de produto: qual status/stage cada ação produz ao ser bem-sucedida?
2. Decisão de arquitetura: qual opção de post-run mutation (A, B ou C)?
3. Com essas decisões: registrar os 5 contratos ausentes + corrigir listing.activate
4. Somente então abrir implementação da Fase 4

---

## Evidências desta investigação

- Nenhum código alterado neste ciclo
- Nenhum EVIDENCE_INDEX atualizado (aguarda aprovação)
- Este arquivo é o único artefato produzido
- Fontes: leitura direta dos 13 arquivos listados na seção "Arquivos investigados"
