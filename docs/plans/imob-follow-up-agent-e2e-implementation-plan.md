# imob-follow-up-agent-e2e-implementation-plan

Status: concluído no runtime  
Prioridade: P1 após `Guardian_EvidenceAgent`  
Data de referência: 2026-05-26  
Escopo: fechar o `FollowUpAgent / Commercial follow-up` como jornada governada de continuidade comercial no IMOB, preservando arquitetura agent-driven, launcher `render-only` e sem outbound automático fora do runtime.

---

## 1. Resumo executivo

O runtime IMOB já fecha lead, visita, proposta, documentos, dedupe e evidence. O que ainda falta como frente própria é transformar follow-up e reengajamento em uma jornada governada e explícita do caso.

O objetivo desta frente é fechar:

- cadência comercial pós-visita e pós-proposta;
- follow-up consultivo preparado com base em contexto real;
- reengajamento coerente com objeção, silêncio ou perda de timing;
- `nextAction`, recovery e business read sem drift entre outcome e retomada comercial.

---

## 2. Ordem de execução

### PR-FOLLOW1 — canonical commercial follow-up snapshot

Status:

- `concluído no runtime`

Objetivo:

- adicionar snapshot canônico de follow-up/reengagement ao contexto do caso;
- refletir:
  - tipo de follow-up ativo
  - gatilho atual
  - canal sugerido
  - status da retomada
  - próximo movimento comercial único

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCaseContextContract.ts`
- `apps/api/src/services/imob/crm/imobCaseContextBuilder.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-case-context-builder.test.ts`
- `apps/api/src/tests/ImobNextActionResolver.test.ts`

Critério:

- o caso passa a expor follow-up comercial ativo sem depender de leitura implícita do visit outcome;
- recovery e next action refletem claramente quando a próxima etapa é follow-up ou reengajamento.

### PR-FOLLOW2 — cadence and reengagement flow

Status:

- `concluído no runtime`

Objetivo:

- governar estados de:
  - follow-up pendente
  - aguardando resposta
  - retomada por gatilho
  - reengajamento recomendado
- impedir salto direto para proposta/visita quando a continuidade comercial ainda pede ação intermediária.

Arquivos prováveis:

- `apps/api/src/services/imob/imobConversationContract.ts`
- `apps/api/src/services/imob/imobConversationState.ts`
- `apps/api/src/services/imob/crm/imobCrmTurnContinuity.ts`
- `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
- `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`
- `apps/api/src/tests/imob-turn-resolver.test.ts`
- `apps/api/src/tests/imob-crm-turn-continuity.test.ts`

Critério:

- follow-up e reengajamento viram estados explícitos do caso;
- a continuidade comercial deixa de depender de interpretação implícita do operador.

### PR-FOLLOW3 — prepared outreach and business read hardening

Status:

- `concluído no runtime`

Objetivo:

- alinhar prepared follow-up, memória comercial e leitura consultiva do CRM;
- expor mensagem base, canal sugerido e gatilho sem disparo externo automático;
- endurecer business read para não parecer “verde” quando a retomada comercial ainda está aberta.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/api/src/services/imob/crm/imobCrmLegacyResolverCompat.ts`
- `apps/api/src/tests/imob-crm-resolver.test.ts`
- `apps/api/src/tests/*follow-up*.test.ts`

Critério:

- o consultivo CRM mostra follow-up/reengagement com contexto, gatilho e próxima mensagem preparada;
- nenhuma nova regra nasce no launcher.

---

## 3. Critério de saída

O `FollowUpAgent / Commercial follow-up E2E` só pode ser considerado fechado quando:

- existe snapshot canônico de follow-up/reengagement;
- `nextAction` do caso fica único para retomada comercial;
- recovery e business read refletem o estado real da continuidade comercial;
- prepared follow-up usa contexto do caso sem outbound automático;
- o launcher continua apenas renderizando o contrato resolvido.

---

## 4. Validação manual mínima

No IMOB:

1. abrir um caso pós-visita com `follow_up_required`;
2. abrir um caso com `reengagement_required`;
3. pedir:
   - `consultar caso`
   - `o que falta?`
   - `qual o próximo passo?`
4. confirmar que o sistema:
   - distingue follow-up ativo de reengajamento;
   - não promove proposta ou nova visita prematuramente;
   - expõe próxima mensagem/canal de forma consultiva e governada.
