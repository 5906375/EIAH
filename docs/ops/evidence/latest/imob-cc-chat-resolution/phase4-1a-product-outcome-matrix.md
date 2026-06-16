# Phase 4.1a — Product Outcome Matrix
# CC → Chat IMOB: ImobPostRunMutationWorker

Data: 2026-06-16
Tipo: Decisão de produto documental (sem alteração de código de runtime)
Resolve: Bloqueador P1 do pré-flight Phase 4.1
Referência: `phase4-1-worker-preflight.md`

---

## INVARIANTES OBRIGATÓRIOS

1. `ImobCase.status` novo é decidido exclusivamente no backend.
2. O status deriva do action handler + canonical recalculation.
3. React não contém regra de status; o Command Center apenas faz auto-refresh e lê o novo estado da API.
4. Execução simulada (`simulated: true`) → **nunca mutar** o ImobCase.
5. Run com `status = "error"` → **nunca mutar** o ImobCase.

---

## Valores canônicos do domínio (fonte: código)

### ImobCase.status (string — não enum no DB)
| valor | semântica |
|-------|----------|
| `pending_data` | Dados incompletos — ação de coleta ainda pendente |
| `ready_for_review` | Dados completos — caso pronto para avançar ou revisar |
| `blocked` | Bloqueio externo impede progresso |
| `done` | Estado terminal — requer `ownerResponsible` preenchido |

### ImobCase.stage (fonte: `imobCaseContextContract.ts`)
| valor | semântica |
|-------|----------|
| `intake` | Abertura inicial do caso |
| `owner_collecting` | Capturando dados do proprietário |
| `property_collecting` | Capturando dados do imóvel |
| `owner_property_linking` | Vinculando proprietário ao imóvel |
| `documents_collecting` | Coletando documentação das partes |
| `seasonal_rules` | Configurando regras de temporada |
| `lead_matching` | Buscando ou qualificando leads |
| `visit_scheduling` | Agendando visita |
| `proposal_preparing` | Elaborando proposta |
| `contract_preparing` | Preparando contrato |
| `commission_review` | Revisando e liberando comissão |
| `campaign_preparing` | Preparando campanha de anúncio |
| `blocked` | Caso bloqueado por impedimento externo |
| `done` | Estado terminal |

### ImobCase.flow (fonte: KPI service + mutation service)
| flow | journeyType | commercialGoal |
|------|------------|---------------|
| `owner.create` | property_capture | captacao |
| `property.create` | property_capture | captacao |
| `listing.activate` | property_capture | captacao |
| `lead.qualify` | lead_qualification | qualificacao |
| `visit.schedule` | visit_follow_up | visita |
| `documents.collect` | documentation | documentacao |
| `proposal.create` | proposal | proposta |
| `deal.review` | negotiation | negociacao |
| `contract.prepare` | contract | contrato |
| `commission.settle` | commission | comissao |

### ACTION_CONTRACT tiers (fonte: `agents.ts`)
| action | tier | txIdRequired | receipt obrigatório |
|--------|------|-------------|-------------------|
| realestate.register_property | HIGH | true | SIM |
| realestate.create_contract | HIGH | true | SIM |
| realestate.release_commission | HIGH | true | SIM |
| realestate.review_deal | HIGH | true | SIM |
| realestate.activate_listing | MEDIUM | false | OPCIONAL |
| realestate.qualify_lead | MEDIUM | false | OPCIONAL |
| realestate.collect_documents | MEDIUM | false | OPCIONAL |
| realestate.schedule_visit | LOW | false | OPCIONAL |

---

## Matriz de Outcome por actionId (11/11)

> **Convenção de leitura:**
> - `flow` = fluxo canônico do caso após a ação — geralmente não muda neste ciclo (o fluxo é pré-existente)
> - `stage` = nova fase do caso após o run bem-sucedido
> - `status` = novo status do caso após o run bem-sucedido
> - `nextStep` = texto humanizado gravado em `ImobCase.nextStep`
> - `pendingItems_remove` = itens a remover da lista (se presentes)
> - `pendingItems_add` = novos itens pendentes gerados pela ação
> - `blockers_remove` = bloqueadores a remover (se presentes)
> - `blockers_add` = novos bloqueadores gerados (excepcionais — ver nota)
> - `reasonCodes` = codes derivados dos novos pending/blockers
> - `failure_behavior` = comportamento quando run retorna error
> - `simulated_behavior` = comportamento quando run.response tem simulated=true
> - `economy_impact` = se produz impacto financeiro/auditável
> - `receipt_bundle` = se receipt/bundle é obrigatório ou opcional

---

### 1. `owner.register`
**Action:** `realestate.register_property` | **Operation:** `owner.create`
**Tier:** HIGH | **txId:** required

**Contexto:**
O proprietário não estava cadastrado ou precisava de atualização. Após o run, o registro do proprietário está completo. O próximo passo natural é cadastrar o imóvel.

| campo | valor |
|-------|-------|
| flow | `owner.create` (não muda) |
| stage | `property_collecting` |
| status | `ready_for_review` |
| nextStep | `"Cadastrar o imóvel do proprietário para avançar a captação"` |
| pendingItems_remove | `["Proprietário pendente de cadastro", "Dados do proprietário ausentes"]` |
| pendingItems_add | `[]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `[]` (sem pending, sem blockers) |
| economy_impact | SIM — HIGH tier, txId obrigatório; produz audit trail de registro |
| receipt_bundle | OBRIGATÓRIO (HIGH/txId) |

**failure_behavior:**
Run `status = "error"` → caso não é alterado. Worker registra `ImobCaseEvent` tipo `case.action.failed` com `reasonCode: RUN_FAILED_NO_MUTATION`. Nenhum campo de `ImobCase` é escrito.

**simulated_behavior:**
`run.response.outputs[].simulated = true` → worker encerra sem chamar `updateCase`. Loga `imob-worker.skipped_simulated_run`.

**Justificativa:**
Após o cadastro do proprietário, o caso ainda precisa do imóvel. `ready_for_review` indica dados suficientes para prosseguir, e `property_collecting` é a fase técnica correspondente no `imobCrmCasePlanner`.

---

### 2. `property.create`
**Action:** `realestate.register_property` | **Operation:** `property.create`
**Tier:** HIGH | **txId:** required

**Contexto:**
O imóvel estava pendente de cadastro na fase de captação. Após o run, o imóvel está registrado. O próximo passo é ativar o anúncio para expor o imóvel ao mercado.

| campo | valor |
|-------|-------|
| flow | `property.create` (não muda) |
| stage | `campaign_preparing` |
| status | `ready_for_review` |
| nextStep | `"Ativar anúncio do imóvel cadastrado para exposição ao mercado"` |
| pendingItems_remove | `["Imóvel pendente de cadastro", "Dados do imóvel ausentes"]` |
| pendingItems_add | `["Ativação do anúncio pendente"]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `["PENDING_ITEMS_PRESENT"]` (ativação pendente) |
| economy_impact | SIM — HIGH tier, txId obrigatório |
| receipt_bundle | OBRIGATÓRIO (HIGH/txId) |

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado com `reasonCode: RUN_FAILED_NO_MUTATION`.

**simulated_behavior:**
Worker encerra sem mutation.

**Justificativa:**
`property.create` não é terminal — um imóvel cadastrado ainda precisa de anúncio ativo para gerar leads. `campaign_preparing` reflete a fase real no funil (preparação de anúncio). O pendingItem "ativação pendente" garante que o Command Center mostre a próxima ação correta.

---

### 3. `listing.activate`
**Action:** `realestate.activate_listing` | **Operation:** `listing.activate`
**Tier:** MEDIUM | **txId:** não requerido

**Contexto:**
O anúncio do imóvel estava inativo. Após o run, o anúncio está publicado no canal configurado. O caso passa a aguardar retorno de leads.

| campo | valor |
|-------|-------|
| flow | `listing.activate` (não muda) |
| stage | `lead_matching` |
| status | `ready_for_review` |
| nextStep | `"Aguardar retorno de leads do anúncio ativo e qualificar primeiro contato"` |
| pendingItems_remove | `["Ativação do anúncio pendente", "Anúncio não publicado"]` |
| pendingItems_add | `[]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `[]` |
| economy_impact | NÃO — MEDIUM tier, sem txId |
| receipt_bundle | OPCIONAL |

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado.

**simulated_behavior:**
Worker encerra sem mutation.

**Justificativa:**
Após ativação do anúncio, o caso entra em fase de captação de leads (`lead_matching`). Não há pendências do lado do corretor — a ação é operacional e imediata. `ready_for_review` indica que o caso está aguardando movimento externo (leads) sem bloqueios internos.

---

### 4. `lead.qualify`
**Action:** `realestate.qualify_lead` | **Operation:** `lead.qualify`
**Tier:** MEDIUM | **txId:** não requerido

**Contexto:**
O lead havia sido identificado mas ainda não tinha dados completos de perfil (orçamento, objetivo, prazo). Após o run, o lead está qualificado e o caso pode avançar para agendamento de visita.

| campo | valor |
|-------|-------|
| flow | `lead.qualify` (não muda) |
| stage | `visit_scheduling` |
| status | `ready_for_review` |
| nextStep | `"Agendar visita do lead qualificado ao imóvel"` |
| pendingItems_remove | `["Qualificação de lead pendente", "Lead sem perfil completo"]` |
| pendingItems_add | `[]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `[]` |
| economy_impact | NÃO — MEDIUM tier, sem txId |
| receipt_bundle | OPCIONAL |

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado.

**simulated_behavior:**
Worker encerra sem mutation.

**Justificativa:**
Qualificação de lead é o gatilho para agendamento de visita no funil IMOB. O stage `visit_scheduling` é o valor técnico correto (ver `imobCaseContextContract.ts`). `ready_for_review` porque não há mais pendências do lado do corretor — apenas aguardar a visita.

---

### 5. `visit.schedule`
**Action:** `realestate.schedule_visit` | **Operation:** `visit.schedule`
**Tier:** LOW | **txId:** não requerido

**Contexto:**
Visita ao imóvel com o lead estava pendente de agendamento. Após o run, a visita está agendada. O caso aguarda o resultado da visita para avançar para proposta.

| campo | valor |
|-------|-------|
| flow | `visit.schedule` (não muda) |
| stage | `proposal_preparing` |
| status | `pending_data` |
| nextStep | `"Realizar a visita agendada e registrar o resultado para avançar à proposta"` |
| pendingItems_remove | `["Visita pendente de agendamento"]` |
| pendingItems_add | `["Resultado da visita pendente de registro"]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `["PENDING_ITEMS_PRESENT"]` |
| economy_impact | NÃO — LOW tier, sem txId |
| receipt_bundle | OPCIONAL |

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado.

**simulated_behavior:**
Worker encerra sem mutation.

**Justificativa:**
Agendar a visita não é o fim — é o início da fase de visita. O resultado da visita ainda está pendente (o corretor precisará registrar se o lead gostou ou não, e se avança para proposta). `pending_data` porque há um item concreto aguardando ação humana real (realização e registro da visita). `proposal_preparing` como stage porque é para onde o caso progredirá após resultado positivo.

---

### 6. `documents.review`
**Action:** `realestate.collect_documents` | **Operation:** `documents.collect`
**Tier:** MEDIUM | **txId:** não requerido

**Contexto:**
Os documentos já haviam sido solicitados e o corretor está revisando o que foi entregue. Após o run, a revisão documental foi registrada. Documentos podem ainda estar incompletos.

| campo | valor |
|-------|-------|
| flow | `documents.collect` (não muda) |
| stage | `documents_collecting` |
| status | `pending_data` |
| nextStep | `"Cobrar documentos faltantes com as partes e reagendar entrega"` |
| pendingItems_remove | `["Revisão documental pendente"]` |
| pendingItems_add | `["Documentos aguardando entrega ou correção das partes"]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `["PENDING_ITEMS_PRESENT"]` |
| economy_impact | NÃO |
| receipt_bundle | OPCIONAL |

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado.

**simulated_behavior:**
Worker encerra sem mutation.

**Justificativa:**
A revisão de documentos raramente resulta em "tudo completo" no primeiro run. O outcome conservador `pending_data` reflete que, mesmo após revisão, partes geralmente precisam corrigir ou entregar itens faltantes. Se todos os documentos estiverem completos, o corretor deverá registrar manualmente via `case.completed` no CRM — a ação de revisão apenas confirma o estado atual, não encerra a fase documental.

**Diferença entre `documents.review` e `documents.collect`:**
- `documents.review` = o corretor revisou o que foi entregue → pendingItem indica o que falta
- `documents.collect` = o corretor iniciou a coleta → pendingItem indica que aguarda entrega

---

### 7. `documents.collect`
**Action:** `realestate.collect_documents` | **Operation:** `documents.collect`
**Tier:** MEDIUM | **txId:** não requerido

**Contexto:**
Solicitação de documentação foi iniciada com as partes. O run registra que o processo de coleta foi disparado. O caso aguarda entrega da documentação.

| campo | valor |
|-------|-------|
| flow | `documents.collect` (não muda) |
| stage | `documents_collecting` |
| status | `pending_data` |
| nextStep | `"Aguardar entrega da documentação solicitada pelas partes"` |
| pendingItems_remove | `["Coleta de documentos não iniciada"]` |
| pendingItems_add | `["Documentação solicitada aguardando entrega das partes"]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `["PENDING_ITEMS_PRESENT"]` |
| economy_impact | NÃO |
| receipt_bundle | OPCIONAL |

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado.

**simulated_behavior:**
Worker encerra sem mutation.

**Justificativa:**
Iniciar a coleta cria obrigatoriamente um estado de espera — as partes ainda não entregaram os documentos. `pending_data` é o status correto. Diferente de `documents.review` (que revisa o que chegou), `documents.collect` começa o processo. O pendingItem reflete o que o Command Center deve exibir ao corretor.

---

### 8. `proposal.create`
**Action:** `realestate.create_contract` | **Operation:** `proposal.create`
**Tier:** HIGH | **txId:** required

**Contexto:**
A proposta comercial está sendo elaborada com as condições do negócio. Após o run, a proposta foi gerada formalmente. Aguarda apresentação às partes e aceite para prosseguir à negociação.

| campo | valor |
|-------|-------|
| flow | `proposal.create` (não muda) |
| stage | `proposal_preparing` |
| status | `ready_for_review` |
| nextStep | `"Apresentar proposta às partes e aguardar aceite para abrir negociação"` |
| pendingItems_remove | `["Proposta comercial não elaborada"]` |
| pendingItems_add | `["Aceite da proposta pelas partes pendente"]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `["PENDING_ITEMS_PRESENT"]` |
| economy_impact | SIM — HIGH tier, txId obrigatório; proposta formalizada com audit trail |
| receipt_bundle | OBRIGATÓRIO (HIGH/txId) |

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado.

**simulated_behavior:**
Worker encerra sem mutation.

**Justificativa:**
A proposta criada ainda precisa de aceite das partes para avançar. `ready_for_review` porque o trabalho do corretor nesta fase está completo — o próximo passo depende da resposta das partes. O pendingItem "aceite pendente" garante que o Command Center mostre a ação de acompanhamento correta. `proposal_preparing` mantém o stage até confirmação do aceite.

---

### 9. `deal.review`
**Action:** `realestate.review_deal` | **Operation:** `deal.review`
**Tier:** HIGH | **txId:** required

**Contexto:**
O deal (negociação) está sendo formalmente revisado e aprovado para seguir para contrato. Após o run, a revisão foi registrada. O caso avança para preparação do contrato.

| campo | valor |
|-------|-------|
| flow | `deal.review` (não muda) |
| stage | `contract_preparing` |
| status | `ready_for_review` |
| nextStep | `"Preparar o contrato com as condições acordadas na negociação"` |
| pendingItems_remove | `["Revisão de negociação pendente", "Deal não revisado formalmente"]` |
| pendingItems_add | `[]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `[]` |
| economy_impact | SIM — HIGH tier, txId obrigatório; aprovação formal de deal |
| receipt_bundle | OBRIGATÓRIO (HIGH/txId) |

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado.

**simulated_behavior:**
Worker encerra sem mutation.

**Justificativa:**
Após revisão aprovada do deal, o caso avança diretamente para `contract_preparing`. Não há pendências do lado do corretor nesta transição — a aprovação do deal é a última validação antes do contrato. `ready_for_review` + `contract_preparing` são os valores corretos.

---

### 10. `contract.prepare`
**Action:** `realestate.create_contract` | **Operation:** `contract.prepare`
**Tier:** HIGH | **txId:** required

**Contexto:**
O contrato imobiliário está sendo preparado formalmente. Após o run, o contrato foi elaborado. Aguarda assinatura das partes.

| campo | valor |
|-------|-------|
| flow | `contract.prepare` (não muda) |
| stage | `commission_review` |
| status | `ready_for_review` |
| nextStep | `"Aguardar assinatura do contrato pelas partes para liberar comissão"` |
| pendingItems_remove | `["Contrato não elaborado"]` |
| pendingItems_add | `["Assinatura do contrato pelas partes pendente"]` |
| blockers_remove | `[]` |
| blockers_add | `[]` |
| reasonCodes | `["PENDING_ITEMS_PRESENT"]` |
| economy_impact | SIM — HIGH tier, txId obrigatório; criação formal de contrato |
| receipt_bundle | OBRIGATÓRIO (HIGH/txId) |

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado.

**simulated_behavior:**
Worker encerra sem mutation.

**Justificativa:**
Após preparação do contrato, o caso move para `commission_review` porque a próxima etapa será a liberação de comissão (pós-assinatura). A assinatura em si é ação das partes (não do corretor via run), por isso fica como pendingItem. `ready_for_review` porque o trabalho do corretor está feito.

---

### 11. `commission.settle`
**Action:** `realestate.release_commission` | **Operation:** `commission.settle`
**Tier:** HIGH | **txId:** required — **⚠️ AÇÃO TERMINAL**

**Contexto:**
Liberação formal da comissão do corretor para um deal encerrado. Esta é a ação terminal do fluxo IMOB — após executada, o caso é encerrado (`done`). Requer `ownerResponsible` preenchido.

| campo | valor |
|-------|-------|
| flow | `commission.settle` (não muda) |
| stage | `done` |
| status | `done` |
| nextStep | `null` (estado terminal — sem próximo passo) |
| pendingItems_remove | `["Liberação de comissão pendente"]` + todos os pendingItems existentes |
| pendingItems_add | `[]` |
| blockers_remove | todos os blockers existentes |
| blockers_add | `[]` |
| reasonCodes | `[]` |
| economy_impact | SIM, DIRETO — liberação financeira com `amountCents`; txId obrigatório; impacto em billing |
| receipt_bundle | OBRIGATÓRIO (HIGH/txId/financial) |

**GUARD OBRIGATÓRIO:** Worker deve verificar que `ImobCase.ownerResponsible` está preenchido
antes de chamar `updateCase` com `status: "done"`. Se ausente:
- **não mutar o caso**
- registrar `ImobCaseEvent` tipo `case.action.blocked` com `reasonCode: CASE_RESPONSIBLE_REQUIRED`
- Worker retorna sem erro (não reprocessar — é decisão de produto, não falha técnica)

**failure_behavior:**
Caso não alterado. Evento `case.action.failed` registrado.

**simulated_behavior:**
Worker encerra sem mutation. Nunca liberar comissão simulada.

**Justificativa:**
`commission.settle` é o único actionId que produz estado terminal. `status: "done"` e `stage: "done"` encerram o caso no IMOB. A liberação de comissão é financeiramente comprometida — receipt é mandatório, txId é mandatório, e o `ownerResponsible` é exigido pelo `updateCase` para transições terminais (proteção nativa do `imobCrmMutationService`).

---

## Resumo executivo da matriz (11/11)

| actionId | flow resultante | stage resultante | status | terminal? | economy | receipt |
|---------|----------------|-----------------|--------|----------|---------|---------|
| owner.register | owner.create | property_collecting | ready_for_review | NÃO | SIM | OBRIG |
| property.create | property.create | campaign_preparing | ready_for_review | NÃO | SIM | OBRIG |
| listing.activate | listing.activate | lead_matching | ready_for_review | NÃO | NÃO | OPCL |
| lead.qualify | lead.qualify | visit_scheduling | ready_for_review | NÃO | NÃO | OPCL |
| visit.schedule | visit.schedule | proposal_preparing | pending_data | NÃO | NÃO | OPCL |
| documents.review | documents.collect | documents_collecting | pending_data | NÃO | NÃO | OPCL |
| documents.collect | documents.collect | documents_collecting | pending_data | NÃO | NÃO | OPCL |
| proposal.create | proposal.create | proposal_preparing | ready_for_review | NÃO | SIM | OBRIG |
| deal.review | deal.review | contract_preparing | ready_for_review | NÃO | SIM | OBRIG |
| contract.prepare | contract.prepare | commission_review | ready_for_review | NÃO | SIM | OBRIG |
| commission.settle | commission.settle | done | **done** | **SIM** | SIM (DIRETO) | **OBRIG** |

**Distribuição de status após sucesso:**
- `ready_for_review`: 7 actionIds (owner.register, property.create, listing.activate, lead.qualify, proposal.create, deal.review, contract.prepare)
- `pending_data`: 3 actionIds (visit.schedule, documents.review, documents.collect)
- `done`: 1 actionId (commission.settle — terminal)

---

## Comportamentos transversais (todos os 11 actionIds)

### Regra: failure → nunca mutar
Quando `run.status !== "success"`:
```typescript
if (run.status !== "success") {
  await prisma.imobCaseEvent.create({ ...failedEventPayload });
  return; // sem updateCase
}
```

### Regra: simulated → nunca mutar
```typescript
const outputs = (run.response as any)?.outputs ?? [];
if (outputs.some((o: any) => o?.simulated === true)) {
  logger.warn({ runId }, "imob-worker.skipped_simulated_run");
  return; // sem updateCase
}
```

### Regra: idempotência por runId
```typescript
const existing = await prisma.imobCaseEvent.findFirst({
  where: { caseId, runId, tenantId, workspaceId, type: "case.action.completed" },
});
if (existing) return; // já processado
```

### Regra: commission.settle requer ownerResponsible
```typescript
if (actionId === "commission.settle") {
  const kase = await prisma.imobCase.findFirst({ where: { id: caseId }, select: { ownerResponsible: true } });
  if (!kase?.ownerResponsible) {
    await recordBlockedEvent(caseId, runId, "CASE_RESPONSIBLE_REQUIRED");
    return; // não é erro — é validação de produto
  }
}
```

### Regra: pendingItems_remove são tentativas — não erro se ausentes
O worker remove da lista apenas os items que efetivamente existam no array atual do caso.
```typescript
const currentItems = (caseRecord.pendingItems as string[]) ?? [];
const nextItems = currentItems
  .filter(item => !pendingItemsToRemove.some(r => item.toLowerCase().includes(r.toLowerCase())));
```

---

## Decisões de produto (registradas)

1. **Comissão é a única ação terminal.** Nenhuma outra ação produz `status: "done"`.

2. **Visita agendada não avança o caso para `ready_for_review`.** O resultado da visita é humano — o corretor precisa registrar manualmente. O status `pending_data` + pendingItem é a representação correta.

3. **Documentação nunca fecha em sucesso automático.** `documents.review` e `documents.collect` produzem `pending_data` — a finalização da fase documental é sempre manual/operacional.

4. **Propostas criam pendingItem de aceite.** O aceite das partes não é automatizado — o corretor acompanha e registra.

5. **Contratos criam pendingItem de assinatura.** Análogo às propostas.

6. **Ativação de anúncio e qualificação de lead não criam pendingItems.** Estas são ações pontuais que avançam o caso sem deixar pendências do lado do corretor.

7. **`flow` nunca é alterado pelo worker.** O worker atualiza `stage`, `status`, `nextStep`, `pendingItems`, `blockers` — mas não o `flow`. O flow pertence à jornada do caso, estabelecida na criação/progresso natural.

8. **Economy impact = txIdRequired em ACTION_CONTRACTS.** Ações HIGH com txId obrigatório são declaradas como economy impact. `receipt_bundle = OBRIGATÓRIO` para essas.

9. **Execução simulada nunca produz mutation, mesmo em ações LOW.** Sem ToolContract ativo, nenhuma ação realmente aconteceu no mundo real — mutar o caso seria evidência falsa.

---

## DoD da Phase 4.1b (próxima frente técnica)

Esta fase implementa os bloqueadores técnicos restantes do pré-flight 4.1:

### P2 — Exportar `buildImobCanonicalCase`
- Mover `buildImobCanonicalCase` de `routes/imob.ts` para `services/imob/imobCanonical.ts`
- Exportar a função e os helpers `mapImobFlowToJourneyType`, `mapImobFlowToCommercialGoal`
- Atualizar `routes/imob.ts` para importar do novo local
- Zero novos erros TypeScript

### P3 — Guard de execução simulada no worker
- Worker verifica `run.response.outputs[].simulated === true` antes de chamar `updateCase`
- Teste: run com simulated=true → caso não alterado
- Teste: run com simulated=false (ToolContract presente) → caso alterado

### P4 — Fila durável `imobRunCompletedQueue`
- Criar `packages/core/src/queue/imobRunCompletedQueue.ts` (padrão: `runAtivoUniversalQueue.ts`)
- `jobId: imob-run-${runId}` para garantia de idempotência BullMQ
- `attempts: 3, backoff: exponential, delay: 1500ms`
- DLQ: `imob-run-completed-dlq`
- Enqueue no `emitRunEvent` de `runWorker.ts` quando `runtimeMetadataResolved?.domain === "imob"`
- Consumidor: `ImobPostRunMutationWorker` (implementado na Phase 4.1c)

### Testes obrigatórios da 4.1b (antes de implementar mutation real)
```
P2.T1: buildImobCanonicalCase importável de services/imob/imobCanonical.ts
P2.T2: imob.ts e worker importam do mesmo local
P3.T1: run.response.outputs[0].simulated=true → updateCase não chamado
P3.T2: run.response.outputs sem simulated → fluxo normal
P4.T1: enqueueImobRunCompleted enfileira job com jobId correto
P4.T2: job duplicado para mesmo runId é ignorado (idempotência BullMQ via jobId)
P4.T3: worker consome job e chama handler
```

---

## GO/NO-GO para Phase 4.1b (implementação de P2/P3/P4)

**GO** — com escopo limitado a P2/P3/P4 e sem implementar mutation real ainda.

| item | status |
|------|--------|
| P1 (outcome matrix) | ✅ RESOLVIDO neste ciclo |
| P2 (buildImobCanonicalCase) | pendente — escopo 4.1b |
| P3 (simulated guard) | pendente — escopo 4.1b |
| P4 (fila durável) | pendente — escopo 4.1b |
| ToolContract DB records | pendente — necessário antes de staging real |
| Phase 4.1c (mutation real) | pendente — após 4.1b + novo pré-flight |

A mutation real do ImobCase (Phase 4.1c) só deve ser implementada **após**:
1. Phase 4.1b concluída e testada
2. Novo pré-flight GO/NO-GO confirmando que P2/P3/P4 estão fechados
3. ToolContract DB records criados em staging

---

## Agentes envolvidos

- **EIAH**: front door do chat, routing de intenção, criação do run via `apiAgentsExecute`
- **ImobPostRunMutationWorker** (a criar em 4.1c): consumer da fila durável; aplica esta matriz
- **ImobCrmMutationService**: infraestrutura de escrita (existente, pronto)
- **CommandCenter**: somente leitura pós-mutation; auto-refresh; sem regra de status

---

## Resumo do ciclo Phase 4.1a

**Alterações de código:** nenhuma.
**Artefato produzido:** este documento.
**Bloqueador resolvido:** P1 — decisão de produto sobre outcome por actionId.
**Próximos passos:** Phase 4.1b (P2/P3/P4) → pré-flight → Phase 4.1c (mutation real).
