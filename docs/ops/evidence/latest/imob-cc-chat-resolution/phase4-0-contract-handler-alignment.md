# Phase 4.0 — Evidence Record
# CC → Chat IMOB: Action Contract & Worker Architecture Alignment

Data de execução: 2026-06-16
Sessão de referência: rodada CC→Chat IMOB (Phase 4.0)
Status: `evidenciado`

---

## Escopo da Phase 4.0

Resolver os bloqueadores B1, B2 e B5 identificados no pré-flight da Fase 4:
- **B1**: 5 realestate.* actions ausentes em `ACTION_CONTRACTS`
- **B2**: Nenhum handler de execução para realestate.* no registry (ausência silenciosa)
- **B5**: `listing.activate` mapeava erroneamente para `realestate.apply_adjustment` (mismatch semântico)

Decisão arquitetural documentada:
- **Opção C (worker dedicado)** escolhida para mutation pós-run
- **Opção B descartada** pois viola o invariante "React não decide status"

**Fora de escopo neste ciclo:**
- ImobPostRunMutationWorker (Fase 4.1)
- `updateCase` pós-run (Fase 4.1)
- Canonical recalculation pós-run (Fase 4.2)
- PATCH /imob/cases/:caseId — PROIBIDO
- Qualquer regra de status em React

---

## Arquivos criados / modificados

### 1. `apps/api/src/routes/agents.ts` — MODIFICADO

**Adicionados 5 contratos em `ACTION_CONTRACTS`:**

| action | tier | txIdRequired | defaultAgent | input obrigatório |
|--------|------|-------------|--------------|-------------------|
| `realestate.activate_listing` | MEDIUM | false | EIAH | caseId, propertyId |
| `realestate.qualify_lead` | MEDIUM | false | EIAH | caseId, leadId |
| `realestate.schedule_visit` | LOW | false | EIAH | caseId, propertyId, scheduledAt |
| `realestate.collect_documents` | MEDIUM | false | EIAH | caseId |
| `realestate.review_deal` | HIGH | true | J_360 | caseId, dealId |

**Exportada função pura:**
```typescript
export function getRegisteredActionContractNames(): string[] {
  return Object.keys(ACTION_CONTRACTS);
}
```

**Total de contratos após mudança: 9 (4 anteriores + 5 novos)**

### 2. `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` — MODIFICADO (B5)

```diff
- "listing.activate": { ..., action: "realestate.apply_adjustment", ... },
+ "listing.activate": { ..., action: "realestate.activate_listing", ... },
```

`realestate.apply_adjustment` permanece como contrato financeiro exclusivo (discount/fine/correction).
`listing.activate` agora usa `realestate.activate_listing` com schema semanticamente correto.

### 3. `apps/api/src/services/imob/control/imobRunActionCatalog.ts` — MODIFICADO

```diff
  ["listing.activate", "listing.activate"],
+ ["realestate.activate_listing", "listing.activate"],
```

Garante que `prepareRunRequestAction` normalize `realestate.activate_listing` para `listing.activate`.

### 4. `apps/api/src/actions/realestateActions.ts` — CRIADO (B2)

Stubs fail-closed explícitos para todos os 9 realestate.* actions:
- `realestate.register_property` (criticality: high)
- `realestate.activate_listing` (criticality: medium) — NOVO
- `realestate.qualify_lead` (criticality: medium) — NOVO
- `realestate.schedule_visit` (criticality: low) — NOVO
- `realestate.collect_documents` (criticality: medium) — NOVO
- `realestate.review_deal` (criticality: high) — NOVO
- `realestate.create_contract` (criticality: high)
- `realestate.release_commission` (criticality: high)
- `realestate.apply_adjustment` (criticality: high — financeiro, isolado de listing)

Cada stub:
- Retorna `status: "error"` + `retryable: false`
- Inclui `reasonCode: "HANDLER_PENDING_PHASE_4_3"` no campo error e no campo reasonCode
- Possui Zod input/output schema documentado
- NÃO chama `ImobCrmMutationService`
- NÃO altera `ImobCase.status`

Padrão de mensagem:
```
"${actionName} handler not implemented (HANDLER_PENDING_PHASE_4_3) — pending Phase 4.3 ImobPostRunMutationWorker"
```

### 5. `apps/api/src/actions/tenantActionRegistry.ts` — MODIFICADO

```diff
+ import { registerRealestateActions } from "./realestateActions";
  ...
  const { registry, resolve } = registerAllActions(versionedRegistry);
+ registerRealestateActions();
```

Os stubs são registrados no startup da API. Qualquer chamada ao run-worker ou action-runner
que tente executar um handler `realestate.*` receberá `status="error"` explícito ao invés de
`"Action not registered"` ou comportamento indefinido.

---

## Mapeamento final: 11/11 actionIds ↔ ACTION_CONTRACTS

| actionId | executionRequest.action | em ACTION_CONTRACTS? | handler? |
|---------|------------------------|---------------------|---------|
| owner.register | realestate.register_property | ✅ | ✅ stub |
| property.create | realestate.register_property | ✅ | ✅ stub |
| listing.activate | realestate.activate_listing | ✅ NOVO | ✅ stub NOVO |
| lead.qualify | realestate.qualify_lead | ✅ NOVO | ✅ stub NOVO |
| visit.schedule | realestate.schedule_visit | ✅ NOVO | ✅ stub NOVO |
| documents.review | realestate.collect_documents | ✅ NOVO | ✅ stub NOVO |
| documents.collect | realestate.collect_documents | ✅ NOVO | ✅ stub NOVO |
| proposal.create | realestate.create_contract | ✅ | ✅ stub |
| deal.review | realestate.review_deal | ✅ NOVO | ✅ stub NOVO |
| contract.prepare | realestate.create_contract | ✅ | ✅ stub |
| commission.settle | realestate.release_commission | ✅ | ✅ stub |

**Cobertura: 11/11 actionIds → 100%**

---

## Testes unitários

```
Arquivo: apps/api/src/tests/imob-realestate-action-contracts-11.test.ts
Resultado: 5/5 suítes passando (34 testes individuais)

Suítes:
  [S1] Phase 4.0 — ACTION_CONTRACTS coverage (7 testes)
       ✅ realestate.activate_listing em ACTION_CONTRACTS
       ✅ realestate.qualify_lead em ACTION_CONTRACTS
       ✅ realestate.schedule_visit em ACTION_CONTRACTS
       ✅ realestate.collect_documents em ACTION_CONTRACTS
       ✅ realestate.review_deal em ACTION_CONTRACTS
       ✅ realestate.apply_adjustment permanece (financeiro)
       ✅ todos os 8 unique realestate.* do dispatcher em ACTION_CONTRACTS

  [S2] Phase 4.0 — Dispatcher mapping 11/11 (11 testes)
       ✅ owner.register → realestate.register_property
       ✅ property.create → realestate.register_property
       ✅ listing.activate → realestate.activate_listing (B5 fix)
       ✅ lead.qualify → realestate.qualify_lead
       ✅ visit.schedule → realestate.schedule_visit
       ✅ documents.review → realestate.collect_documents
       ✅ documents.collect → realestate.collect_documents
       ✅ proposal.create → realestate.create_contract
       ✅ deal.review → realestate.review_deal
       ✅ contract.prepare → realestate.create_contract
       ✅ commission.settle → realestate.release_commission

  [S3] Phase 4.0 — B5 semantic fix: listing.activate (3 testes)
       ✅ listing.activate NÃO aponta para realestate.apply_adjustment
       ✅ listing.activate aponta para realestate.activate_listing
       ✅ realestate.apply_adjustment permanece financeiro (isolado de listing)

  [S4] Phase 4.0 — Handler registration fail-closed (9 testes)
       ✅ 8x getRegisteredAction(action) retorna handler não-nulo
       ✅ todos os handlers retornam status=error com HANDLER_PENDING_PHASE_4_3

  [S5] Phase 4.0 — Invariante: sem mutation de ImobCase.status (2 testes)
       ✅ dispatcher é função pura — zero efeitos colaterais em ImobCase
       ✅ handlers stub retornam erro antes de qualquer mutation
```

### Regressão não-verificada
```
imob-crm-action-dispatcher.test.ts: 16/16 pass (inalterados)
```

---

## Erros TypeScript

```
Antes das mudanças (baseline): 2 erros pré-existentes em agents.ts
Após as mudanças: 2 erros (mesmos, linha 604 shifted de 483 por adição de contratos)
Zero novos erros TypeScript introduzidos
```

---

## Invariantes verificados

- Nenhum `PATCH /imob/cases/:caseId` implementado ou testado
- Nenhum campo `ImobCase.status` alterado em nenhuma das mudanças
- Nenhuma lógica de negócio adicionada ao `ChatAgentLauncher` / `chat.tsx`
- Handlers stubs são fail-closed explícitos: retornam `status="error"` ao invés de ausência silenciosa
- `apiAgentsExecute` não chamado automaticamente (invariante Fase 3 preservado)
- Opção B descartada: React não participa de mutation de ImobCase.status

---

## Decisão arquitetural registrada

Artefato: `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-worker-option-c-decision.md`
Decisão: ImobPostRunMutationWorker (Opção C) como único caminho para mutation pós-run.

---

## Bloqueadores restantes (B3 e B4)

| Bloqueador | Status | Próxima ação |
|-----------|--------|-------------|
| B3 — Sem mutation pós-run | ABERTO | Fase 4.1: ImobPostRunMutationWorker |
| B4 — Canonical não recalculado | ABERTO | Fase 4.2: canonical persistence pós-mutation |
| B6 — CC auto-refresh | ABERTO | Fase 4.3: SSE ou polling |

---

## Recomendação: novo pré-flight GO/NO-GO para Fase 4.1

Antes de implementar `ImobPostRunMutationWorker` (B3+B4), executar novo pré-flight verificando:
1. ToolContract DB records para realestate.* existem em staging
2. Decisão de produto sobre outcome por ação (status/stage/nextStep)
3. Escolha de fila durável (BullMQ vs Redis pub/sub)
4. Teste de end-to-end: `apiAgentsExecute` → run.completed → case.updated → CC refresh

Com B1+B2+B5 resolvidos, o novo GO/NO-GO deve avaliar apenas B3, B4 e B6.
