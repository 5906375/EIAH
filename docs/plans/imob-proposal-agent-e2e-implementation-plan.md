# imob-proposal-agent-e2e-implementation-plan

Status: execução iniciada  
Prioridade: P1 após `FollowUpAgent / Commercial follow-up E2E`  
Data de referência: 2026-05-26  
Escopo: fechar o `ProposalAgent / Negotiation E2E` como jornada governada de proposta no IMOB, preservando arquitetura agent-driven, launcher `render-only` e sem side effects externos automáticos fora do runtime.

---

## 1. Resumo executivo

O runtime IMOB já fecha lead, visita, documents, dedupe, evidence e follow-up. O bloco funcional que ainda falta como frente própria é transformar proposta e negociação em uma jornada canônica, explícita e recuperável.

O objetivo desta frente é fechar:

- proposta ativa com estado e pendências explícitas;
- contraproposta e aceite/recusa governados;
- transição coerente para contrato ou retorno para follow-up;
- `nextAction`, recovery e business read sem drift entre proposta, negociação e handoff.

---

## 2. Ordem de execução

### PR-PROP1 — canonical proposal negotiation snapshot

Status:

- `concluído no runtime`

Objetivo:

- adicionar snapshot canônico de proposta/negociação ao contexto do caso;
- refletir:
  - proposta ativa
  - status
  - valor/oferta
  - pendências de proposta
  - próximo movimento comercial único

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCaseContextContract.ts`
- `apps/api/src/services/imob/crm/imobCaseContextBuilder.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-case-context-builder.test.ts`
- `apps/api/src/tests/ImobNextActionResolver.test.ts`
- `apps/api/src/tests/ImobRecoveryResolver.test.ts`

Critério:

- o caso passa a expor proposta/negociação ativa sem depender de leitura implícita do draft;
- recovery e next action refletem claramente quando a próxima etapa é revisar, ajustar ou responder proposta.

### PR-PROP2 — counteroffer and approval flow

Status:

- `concluído no runtime`

Objetivo:

- governar estados de:
  - contraproposta
  - aceite
  - recusa
  - approval quando exigido
- impedir avanço direto para contrato quando a negociação ainda não está fechada.

Arquivos prováveis:

- `apps/api/src/services/imob/imobConversationContract.ts`
- `apps/api/src/services/imob/imobConversationState.ts`
- `apps/api/src/services/imob/crm/imobCrmTurnContinuity.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-turn-resolver.test.ts`
- `apps/api/src/tests/imob-crm-turn-continuity.test.ts`

Critério:

- contraproposta, aceite e recusa viram estados explícitos do caso;
- approval aparece como gate real quando a proposta exigir validação humana.

### PR-PROP3 — proposal to contract / re-follow-up handoff

Status:

- `planejado`

Objetivo:

- alinhar handoff da proposta para:
  - contrato
  - follow-up
  - retomada comercial
- endurecer business read para não parecer “verde” quando ainda há negociação ativa.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/api/src/services/imob/crm/imobCrmLegacyResolverCompat.ts`
- `apps/api/src/tests/imob-crm-resolver.test.ts`
- `apps/api/src/tests/*proposal*.test.ts`

Critério:

- o consultivo CRM mostra proposta/negociação com contexto, status e próximo movimento preparado;
- nenhuma nova regra nasce no launcher.

---

## 3. Critério de saída

O `ProposalAgent / Negotiation E2E` só pode ser considerado fechado quando:

- existe snapshot canônico de proposta/negociação;
- `nextAction` do caso fica único para a etapa de proposta;
- recovery e business read refletem o estado real da negociação;
- contraproposta, aceite e recusa são governados pelo runtime;
- o launcher continua apenas renderizando o contrato resolvido.

---

## 4. Validação manual mínima

No IMOB:

1. abrir um caso com `proposal.create` ativa;
2. abrir um caso com contraproposta pendente;
3. abrir um caso com proposta aceita, mas ainda sem contrato;
4. pedir:
   - `consultar caso`
   - `o que falta?`
   - `qual o próximo passo?`
5. confirmar que o sistema:
   - distingue proposta ativa de contraproposta;
   - não promove contrato prematuramente;
   - volta para follow-up quando a negociação não fecha;
   - mantém próxima ação única e governada.
