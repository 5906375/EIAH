# Decisão Arquitetural — Phase 4 Worker: Opção C
# CC → Chat IMOB: Post-run ImobCase Mutation

Data: 2026-06-16
Tipo: ADR operacional (Architectural Decision Record)
Status: `DECIDIDO`

---

## INVARIANTES OBRIGATÓRIOS DA FASE 4

1. `ImobCase.status` novo é decidido exclusivamente no backend.
2. O status deriva do action handler + canonical recalculation.
3. React não contém regra de status; o Command Center apenas faz auto-refresh e lê o novo estado da API.

---

## Contexto

Após a Fase 3 (confirmação explícita do usuário + criação de runId via `apiAgentsExecute`),
o fluxo CC→Chat IMOB precisa de um mecanismo para:
1. Detectar que o run completou com sucesso
2. Chamar `ImobCrmMutationService.updateCase(caseId, { eventRunId, status, ... })`
3. Recalcular `buildImobCanonicalCase` e persistir o canonical atualizado
4. Retornar o caso atualizado para o Command Center via auto-refresh

---

## Opções avaliadas

### Opção A — Webhook no action-runner
Após `executeWithMCP` retornar sucesso, o action-runner extrai `caseId` de `metadata.executionInput`
e chama `ImobCrmMutationService.updateCase(...)`.

**Prós:** Atômico com o run. Nenhuma dependência do frontend.
**Contras:** Acopla o action-runner a lógica de domínio IMOB específica. O action-runner é um componente genérico de MCP enforcement — não deveria conhecer `ImobCrmMutationService`.

### Opção B — Endpoint de adoção frontend
Após `apiAgentsExecute` retornar runId e polling indicar `run.success`, o frontend chama
`POST /api/imob/runs/:runId/adopt-to-case` que aciona `updateCase`.

**Prós:** Desacoplado do worker.
**Contras:** ❌ DESCARTADA. Viola o invariante "React não contém regra de status".
O frontend participaria da decisão de mutation (poderia ser skipado, duplicado ou bypassado).
Cria caminho onde status poderia ser decidido por uma chamada do cliente.

### Opção C — Worker dedicado (ImobPostRunMutationWorker) ← **ESCOLHIDA**
Um worker específico de IMOB escuta events `run.completed` (via Redis ou fila BullMQ),
verifica se `metadata.domain === "imob"`, extrai `caseId` de `metadata.executionInput.caseId`,
valida cross-workspace e chama `ImobCrmMutationService.updateCase(...)`.

**Prós:**
- Separação de responsabilidade: cada camada tem uma função única
- Fail-safe: run.completed event é emitido independentemente do worker estar ativo
- Retry automático: worker pode ser reiniciado sem perda de eventos (com fila durável)
- Auditável: o evento `run.completed` fica no `RunEventStore` (Redis + Prisma) como prova
- Não polui o action-runner nem o frontend com lógica de domínio IMOB

**Contras:**
- Novo serviço/worker a manter
- Lag entre run.completed e case.updated (assíncrono por natureza)
- Requer fila durável para garantir at-least-once delivery

---

## Decisão: OPÇÃO C

**Razão:** Separação de responsabilidade e invariante "React não decide status" exigem que a
mutation do ImobCase ocorra no backend, desacoplada do frontend e do action-runner genérico.
O worker dedicado é o único caminho que satisfaz todos os três invariantes obrigatórios da Fase 4.

---

## Pré-requisitos antes da implementação real do ImobPostRunMutationWorker

### Pré-req 1 — Decisão de produto: outcome por ação
Para cada realestate.* action, o produto deve definir:
- Qual `status` resultante? (`pending_data` | `ready_for_review` | `blocked` | `done`)
- Qual `stage` resultante?
- Qual `nextStep` (texto humanizado)?
- Quais `pendingItems` ou `blockers` são produzidos no sucesso?
- Critérios de falha: o que impede a mutation?

**Sem esta decisão, não há como implementar o worker corretamente.**

### Pré-req 2 — ToolContract DB records
O action-runner (`executeWithMCP`) exige registros `ToolContract` ativos no banco para cada ação.
Antes de testar o fluxo real, esses registros devem existir em staging para:
- `realestate.register_property`
- `realestate.activate_listing`
- `realestate.qualify_lead`
- `realestate.schedule_visit`
- `realestate.collect_documents`
- `realestate.review_deal`
- `realestate.create_contract`
- `realestate.release_commission`

### Pré-req 3 — Fila durável para eventos run.completed
Opção A: Estender `RedisRunEventStore` para publicar em canal BullMQ além de canal Redis pub/sub.
Opção B: O worker escuta o canal Redis pub/sub existente (mais simples, menos durável).
Recomendação: BullMQ para garantia de at-least-once e retry automático.

### Pré-req 4 — Canonical persistence pós-mutation
`buildImobCanonicalCase` é uma função pura pronta. O worker deve, após `updateCase`:
1. Chamar `buildImobCanonicalCase` com os campos atualizados
2. Persistir o resultado em `imobCase.canonical` via update separado

### Pré-req 5 — CC auto-refresh (UX)
O Command Center precisa detectar que um run associado ao case foi completado.
Opção mínima: polling manual após o usuário retornar ao CC.
Opção ideal: SSE endpoint por caseId ou runId para notificação push.
Esta pré-condição pode ser postergada (Fase 4b).

---

## Riscos

| Risco | Probabilidade | Mitigação |
|-------|--------------|-----------|
| run.completed event perdido (Redis pub/sub sem durabilidade) | MÉDIA | Migrar para BullMQ (Pré-req 3) |
| caseId ausente em metadata.executionInput | BAIXA | dispatcher Fase 2 sempre inclui caseId; worker fail-closed quando ausente |
| Cross-workspace injection (caseId de outro tenant) | BAIXA | updateCase já valida tenantId+workspaceId (fail-closed nativo) |
| Mutation duplicada (run.completed entregue 2x) | BAIXA | Usar eventRunId como idempotency key em ImobCaseEvent |
| Run failure tratado como sucesso | BAIXA | Worker verifica status = "success" antes de chamar updateCase |

---

## DoD da implementação futura (ImobPostRunMutationWorker)

```
1. Worker escuta run.completed events (BullMQ ou Redis pub/sub)
2. Filtra: metadata.domain === "imob" AND metadata.executionInput.caseId presente
3. Valida cross-workspace: caseId.tenantId === event.tenantId (fail-closed)
4. Verifica run.status === "success" (não muta caso em run.failed)
5. Chama ImobCrmMutationService.updateCase(scope, caseId, {
     status: <derivado do action outcome>,
     stage: <derivado do action outcome>,
     nextStep: <derivado>,
     blockers: <derivado>,
     pendingItems: <derivado>,
     eventRunId: runId,
     eventType: "case.action.completed",
     eventSummary: "Ação ${actionId} completada via run ${runId}",
   })
6. Chama buildImobCanonicalCase com campos atualizados
7. Persiste canonical em imobCase.canonical
8. Emite evento case.canonical.updated (para SSE ou polling CC)
9. Gera GovernedMutation receipt com txId se txIdRequired=true
10. Artefato: docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-case-mutation.md
11. Atualizar EVIDENCE_INDEX somente após artefato físico existir
```

---

## Próximos passos

1. Obter decisão de produto (outcome por ação) — bloqueador crítico
2. Criar ToolContract DB records para todas as realestate.* actions — pré-req técnico
3. Escolher e implementar fila durável para run.completed — pré-req infra
4. Implementar ImobPostRunMutationWorker — Fase 4.1
5. Implementar canonical persistence — Fase 4.2
6. Implementar CC auto-refresh (SSE ou polling) — Fase 4.3
7. Testes de integração (run success → case update, run failure → sem update, cross-workspace block)
8. Produzir phase4-case-mutation.md como evidência
9. Atualizar EVIDENCE_INDEX

---

## Agentes envolvidos nesta decisão

- **EIAH** (orquestração): front door do chat e routing de intenção
- **ImobPostRunMutationWorker** (a criar): responsável pela mutation governada
- **ImobCrmMutationService**: infraestrutura de escrita já existente e fail-closed
- **CommandCenter**: somente leitura; auto-refresh; sem regra de status
