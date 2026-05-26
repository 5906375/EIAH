# imob-crm-continuity-hardening-phase-1-plan

Status: prioridade imediata  
Prioridade: P0 de superfície / coerência operacional  
Data de referência: 2026-05-26  
Escopo: elevar o IMOB de `E2E funcional com drift residual` para `E2E funcional com hardening residual de superfície`, reduzindo incoerência entre `nextAction`, `recommendedActions`, `CTAs`, `quickReplies`, `business read` e `workflow guard`.

---

## 1. Objetivo

Antes de avançar no `PR-PROP3`, esta fase curta existe para atacar o gargalo real percebido no uso:

- ações stale depois da mudança de estado;
- `pendingItems` reabertos de forma incorreta;
- `waitingOn` incoerente com o blocker dominante;
- apoio contextual jurídico/documental aberto cedo demais;
- diferenças entre texto, card, `consultiveRead` e CTA.

Meta operacional:

- colocar a coerência percebida do IMOB acima de `70/100`;
- reduzir ao mínimo os casos em que a UI oferece uma ação que o workflow recusa;
- garantir que `mostrar bloqueios do caso`, `consultar caso`, `o que falta?` e `qual o próximo passo?` contem a mesma história do caso.

---

## 2. Critério de sucesso

Considerar esta fase pronta quando:

- nenhuma ação sugerida nos fluxos prioritários cair em `Essa acao nao e valida para o estado operacional atual do caso.`
- `pendingItems` pós-mutation refletirem o estado atual de owner/property/lead/documento;
- `waitingOn` e `nextStep` estiverem coerentes com o blocker dominante;
- owner blocker básico não abrir `J_360` nem checklist jurídico como destrave principal;
- as jornadas críticas tiverem testes de regressão cobrindo superfície e continuidade.

---

## 3. PR-FIX-IMOB-CONTINUITY-2

Título:

- `stale action invalidation after state transition`

Objetivo:

- invalidar ações herdadas depois que o caso muda de estado.

Escopo:

- limpar `CTAs` e `quickReplies` antigas;
- recalcular `opções` só a partir do estado operacional atual;
- impedir que ações válidas em um estágio sobrevivam no seguinte.

Cenários-alvo:

- `market scan -> confirmação do scan`
- `owner update -> documents`
- `visit -> post-visit`
- `follow-up -> reengagement`

Critério de saída:

- nenhuma opção stale reaparece como próximo passo acionável.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmLegacyResolverCompat.ts`
- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/services/imob/crm/imobCrmWorkflowMachine.ts`

---

## 4. PR-FIX-IMOB-CONTINUITY-3

Título:

- `blocker/waitingOn/nextStep normalization`

Objetivo:

- garantir que blocker dominante, `waitingOn`, owner da ação e `nextStep` saiam da mesma leitura canônica.

Escopo:

- normalizar `pendingItems` pós-owner update e pós-document review;
- reclassificar `waitingOn` com prioridade pelo blocker dominante real;
- evitar mistura de cadastro básico de owner com fluxo jurídico/documental;
- alinhar `blocked_run_resolution` com o estado atual do caso.

Critério de saída:

- o mesmo caso não pode mostrar blocker A no texto, blocker B no card e `waitingOn` C no consultivo.

Arquivos prováveis:

- `apps/api/src/services/imob/crm/imobCrmCaseContext.ts`
- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- `apps/api/src/services/imob/imobSpecialistBridge.ts`
- `apps/api/src/services/imob/crm/imobCrmLegacyResolverCompat.ts`

---

## 5. PR-FIX-IMOB-CONTINUITY-4

Título:

- `real journey regression suite`

Objetivo:

- parar de depender de teste manual para descobrir regressão de continuidade.

Escopo:

- criar/registar golden paths curtos por jornada real:
  - `market scan -> seleção -> confirmação -> property`
  - `property -> owner -> owner document -> blocked review`
  - `lead -> visit -> post-visit -> follow-up`
  - `proposal -> counteroffer -> approval`
  - `documents -> legal handoff`
- incluir asserts de:
  - `CTA`
  - `quickReplies`
  - `waitingOn`
  - `pendingFieldLabels`
  - specialist support dominante

Critério de saída:

- cada jornada crítica tem pelo menos 1 teste cobrindo continuidade e supressão de drift de superfície.

Arquivos prováveis:

- `apps/api/src/tests/imob-crm-golden-path.test.ts`
- `apps/api/src/tests/imob-crm-turn-engine.test.ts`
- `apps/api/src/tests/imob-owner-blocker-consult.test.ts`
- novos testes focados por jornada, se necessário

---

## 6. PR-FIX-IMOB-CONTINUITY-5

Título:

- `coherence metrics and acceptance gates`

Objetivo:

- medir a coerência operacional do IMOB com base em regras observáveis.

Escopo:

- definir métricas mínimas:
  - `% de ações exibidas válidas no workflow`
  - `% de blocked reads com blocker dominante correto`
  - `% de consult reads sem pendência stale`
  - `% de casos com waitingOn coerente`
- expor baseline simples para acompanhar evolução.

Critério de saída:

- baseline documentado e utilizável para dizer se o IMOB já passou de `70/100`.

Arquivos prováveis:

- `docs/EVIDENCE_INDEX.md`
- `docs/plans/imob-orchestrator-mission-e2e-p0-implementation-plan.md`
- suite/testes de regressão e eventual snapshot de métricas

---

## 7. Ordem recomendada

1. `PR-FIX-IMOB-CONTINUITY-2`
2. `PR-FIX-IMOB-CONTINUITY-3`
3. `PR-FIX-IMOB-CONTINUITY-4`
4. `PR-FIX-IMOB-CONTINUITY-5`
5. retomar `PR-PROP3`

---

## 8. Regra de execução

Durante esta fase:

- nenhuma nova regra nasce no `ChatAgentLauncher`;
- toda correção vai para contrato, engine, workflow ou business read canônico;
- fixes de superfície devem reduzir acoplamento, não criar atalhos novos;
- qualquer novo drift descoberto em teste manual deve virar cenário formal de regressão.
