# imob-visit-agent-e2e-implementation-plan

Status: execução iniciada  
Prioridade: P1 após `DedupeAgent E2E`  
Data de referência: 2026-05-26  
Escopo: fechar o `IMOB_VisitAgent` como camada E2E de agenda, remarcação, cancelamento, resultado de visita e pós-visita, preservando arquitetura agent-driven e launcher `render-only`.

---

## 1. Resumo executivo

O runtime IMOB já promove o lead para visita e proposta, mas a frente de visita ainda não está fechada como jornada própria.

O que falta para E2E:

- agenda governada de visita como estado canônico;
- remarcação e cancelamento sem drift de caso;
- resultado de visita com próximo passo explícito;
- pós-visita coerente para proposta, follow-up ou reengajamento;
- recovery que não reabre cadastro indevidamente.

---

## 2. Ordem de execução

### PR-VISIT1 — canonical visit scheduling snapshot

Status:

- `concluído`

Objetivo:

- adicionar snapshot canônico de visita agendada;
- refletir:
  - visita pendente de confirmação
  - visita confirmada
  - visita aguardando remarcação

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCaseContextContract.ts`
- `apps/api/src/services/imob/crm/imobCaseContextBuilder.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-visit-context.e2e.test.ts`

Critério:

- o caso passa a expor agenda de visita sem leitura implícita do CRM;
- `consultar caso`, `o que falta?` e `qual o próximo passo?` refletem a visita ativa.

### PR-VISIT2 — reschedule/cancel flow

Status:

- `concluído`

Objetivo:

- fechar remarcação e cancelamento como operações governadas;
- impedir drift entre visita, lead e proposta;
- manter audit trail de mudança de agenda.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmOperationalVisit*.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-visit-reschedule.e2e.test.ts`
- `apps/api/src/tests/imob-visit-cancel.e2e.test.ts`

Critério:

- remarcação e cancelamento ficam explícitos no caso;
- rerun não duplica side effect nem estado de agenda.

### PR-VISIT3 — post-visit outcome and proposal handoff

Status:

- `concluído`

Objetivo:

- fechar resultado de visita e próximo movimento comercial;
- promover para proposta quando a visita confirmar avanço;
- ou voltar para follow-up/reengajamento quando houver objeção.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCaseContextBuilder.ts`
- `apps/api/src/services/imob/orchestrator/imobCompletionEvaluator.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-post-visit.e2e.test.ts`

Critério:

- o pós-visita tem saída única e coerente;
- proposta, follow-up ou reengajamento surgem do resultado real da visita.

---

## 3. Critério de saída

O `VisitAgent E2E` só pode ser considerado fechado quando:

- existe snapshot canônico de visita;
- remarcação e cancelamento são governados e auditáveis;
- resultado de visita gera próximo passo único;
- recovery permanece coerente no pós-visita;
- o launcher continua apenas renderizando o contrato resolvido.

Status atual:

- `VisitAgent E2E` concluído no runtime.

---

## 4. Validação manual mínima

No chat IMOB:

1. agendar uma visita;
2. remarcar a visita;
3. cancelar a visita;
4. registrar resultado da visita;
5. pedir:
   - `consultar caso`
   - `o que falta?`
   - `qual o próximo passo?`
6. confirmar que o sistema:
   - mantém agenda coerente;
   - não reabre cadastro sem motivo;
   - promove para proposta ou follow-up conforme o resultado real.
