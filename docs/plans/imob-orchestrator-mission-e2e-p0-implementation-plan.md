# imob-orchestrator-mission-e2e-p0-implementation-plan

Status: rebaseline operacional  
Prioridade: P0/P1 para Track P IMOB  
Data de referência: 2026-05-25  
Versão do plano: v4.8 — pragmática para execução com continuidade derivada do canônico, `MarketScanAgent E2E` concluído e `DocumentAgent E2E` aberto como frente corrente  
Escopo: fechamento E2E do `IMOB_Orchestrator` como dono real das missões imobiliárias, preservando arquitetura agent-driven, estado canônico, recuperação confiável, próxima ação única, controle de concorrência seguro para side effects, compatibilidade com casos legados e proof mínimo determinístico por missão.

---

## 1. Resumo executivo

Depois do `imob-lead-continuity-p0-implementation-plan`, o próximo passo correto é consolidar o `IMOB_Orchestrator` como dono E2E das missões do IMOB.

O objetivo desta versão do plano é sair do desenho conceitual e organizar a execução em PRs curtos, com:

- escopo objetivo por PR;
- arquivos prováveis a tocar;
- testes mínimos por PR;
- riscos de rollout;
- ordem de merge segura;
- baseline real já refletido no documento.

Esta versão substitui a `v4.3` como plano de execução corrente. O backbone P0 do `IMOB_Orchestrator` já foi entregue até `PR6`. A expansão `PR7` foi concluída com os slices `prepare_contract`, `settle_commission` e `commercial_activation`, mantendo `fail-closed`, proof mínima e launcher `render-only`.

---

## 1.1 Baseline atual de implementação

Status real nesta revisão (`2026-05-23`):

- `Patch 0` mergeado.
- `PR1` mínimo mergeado.
- `PR2` operation router mergeado.
- `PR3` recovery resolver mergeado.
- `PR2.5` IMOB-CRM Agentic Operating Model mergeado.
- `PR4` next action + completion mergeado.
- `PR5` proof mínimo por missão mergeado.
- `PR6` suíte E2E do orquestrador mergeada.
- `PR7` iniciado com `prepare_contract` mergeado.
- `PR7` ampliado com `settle_commission` mergeado.
- `PR7` concluído com `commercial_activation` implementado e validado por suíte scoped.
- Backbone canônico já materializado em:
  - `imobMissionTypes.ts`
  - `imobMissionGraph.ts`
  - `imobCaseStateRuntime.ts`
  - `imobProofGate.ts`
  - `imobSideEffectDispatchGuard.ts`
  - `imobLegacyCompatibilityResolver.ts`
  - `imobOperationRouter.ts`
  - `imobRecoveryResolver.ts`
  - `imobCrmCaseProjection.ts`
  - `imobNextActionResolver.ts`
  - `imobCompletionEvaluator.ts`
  - `imobMissionPolicy.ts`
- `CaseContextBuilder` já materializa:
  - `canonicalCaseState`
  - `legacyCompatibility`
  - `recoverySnapshot`
  - `crmProjection`

Decisão:

- `Patch 0`, `PR1`, `PR2`, `PR3`, `PR2.5`, `PR4`, `PR5` e `PR6` compõem o baseline operacional entregue.
- `PR7` compõe o baseline entregue com `prepare_contract`, `settle_commission` e `commercial_activation`.
- o próximo passo deixa de ser completar a expansão P1/P2 mínima do orquestrador e passa a ser decidir se novas trilhas P2 entram como frentes separadas ou se esta fase deve ser encerrada documentalmente.

## 1.2 Continuidade operacional derivada

A continuidade corrente do canônico não está abrindo uma nova frente estrutural do `IMOB_Orchestrator`.

Ela está sendo executada por um plano derivado de hardening E2E do loop:

- `MarketScanAgent`
- `PropertyAgent`
- `OwnerAgent`
- `property.link_owner`
- `ContinuityAgent`

Plano derivado em execução:

- `docs/plans/imob-property-owner-continuity-e2e-hardening-plan.md`

Objetivo desta continuidade:

- fechar o handoff `market scan -> property.create -> owner.create/update -> property.link_owner -> recovery`;
- remover drift entre `nextAction`, `consultar caso`, `o que falta?` e `qual o próximo passo?`;
- endurecer dedupe e idempotência de imóvel antes de abrir novas frentes de agente.

## 1.3 Regra de continuidade do plano canônico

Este documento continua sendo o plano canônico macro do IMOB.

Regra operacional a partir desta versão:

- toda nova frente derivada do canônico deve ser registrada aqui;
- o plano derivado pode detalhar execução tática, mas não substitui este documento;
- quando uma frente nova surgir, este plano deve indicar:
  - motivo da abertura;
  - ordem relativa no roadmap;
  - artefato derivado que executa a frente;
  - critério de saída para voltar ao canônico.

Frentes já assumidas como próximas continuações oficiais do canônico:

1. `imobValidationEngine`
   - camada transversal pura de validação/normalização de entrada;
   - sem side effect;
   - sem escrita direta no CRM;
   - acionada pelo `IMOB_Orchestrator` e pelos entrypoints de:
     - `property.create`
     - `owner.create`
     - `lead.qualify`
     - `documents.review`
   - plano derivado:
     - `docs/plans/imob-validation-engine-implementation-plan.md`

2. `LeadAgent E2E`
   - expansão da jornada comercial de lead como etapa dona de funil;
   - inclui qualificação, score, matching, próxima melhor ação, visita, proposta e reengajamento.
   - plano derivado:
     - `docs/plans/imob-lead-agent-e2e-implementation-plan.md`

Próximas frentes oficiais a partir deste ponto:

3. `MarketScanAgent E2E`
   - Status: `concluído`
   - `PR-M1` concluído: actionable recommendation base
   - `PR-M2` concluído: comparables + confidence band
   - `PR-M3` concluído: operational handoff hardening
   - evolução do scan para recomendação acionável real;
   - faixa de preço/diária;
   - liquidez e risco;
   - recomendação: captar, ajustar preço, pedir documento ou não seguir;
   - transformar scan em captação operacional ou ativação comercial quando aplicável.
   - plano derivado:
     - `docs/plans/imob-market-scan-agent-e2e-implementation-plan.md`

4. `DocumentAgent E2E`
   - Status: `execução iniciada`
   - `PR-DOC1` concluído: checklist by operation
   - slice corrente: `PR-DOC2 — sufficiency + proof + legal handoff`
   - checklist por operação;
   - suficiência documental;
   - bloqueios claros;
   - preparação de pacote e handoff jurídico com proof.
   - plano derivado:
     - `docs/plans/imob-document-agent-e2e-implementation-plan.md`
Ordem recomendada:

- `imobValidationEngine` e `LeadAgent E2E` já entregues;
- `MarketScanAgent E2E` já entregue;
- próximo bloco oficial: `DocumentAgent E2E`.

Justificativa:
- `imobValidationEngine` endureceu a base comum de `Property`, `Owner`, `Lead` e `Documents`;
- `LeadAgent E2E` fechou a jornada comercial canônica no runtime;
- `MarketScanAgent E2E` fechou a recomendação acionável, comparables e continuidade de captação;
- o próximo multiplicador de valor é `DocumentAgent E2E`, fechando checklist, suficiência e handoff jurídico/documental com blockers claros.

Execução corrente:

- a frente corrente deste plano canônico passa a ser guiada por:
  - `docs/plans/imob-document-agent-e2e-implementation-plan.md`
  - slice em andamento:
    - `PR-DOC2 — sufficiency + proof + legal handoff`

---

## 2. Escopo operacional P0

### 2.1 Missões P0

```text
capture_seasonal_property
capture_rental_property
capture_sale_property
qualify_and_match_lead
schedule_and_follow_visit
collect_documents
case_review
```

### 2.2 Missões fora do P0

```text
prepare_contract
settle_commission
commercial_activation
```

Estas entram apenas depois do backbone estar estável.

---

## 3. Arquitetura-alvo resumida

```text
IMOB_Orchestrator
  ├─ Mission Planner
  ├─ Mission Step Graph
  ├─ Operation Router
  ├─ Case State Resolver
  ├─ Legacy Compatibility Resolver
  ├─ Optimistic Concurrency Guard
  ├─ Side Effect Dispatch Guard
  ├─ Recovery Resolver
  ├─ Next Action Resolver
  ├─ Completion Evaluator
  ├─ Deterministic Proof Gate
  └─ Specialist Dispatch Layer

IMOB-CRM
  └─ projeção operacional do canonicalCaseState
      ├─ Case Cards
      ├─ Mission Pipeline
      ├─ Readiness
      ├─ Blockers
      ├─ NextAction
      ├─ Proof Status
      ├─ Dedupe Queue
      └─ Command Center
```

Importante:

- o `IMOB-CRM` não vira nova fonte de verdade;
- ele apenas projeta o estado resolvido pelo `IMOB_Orchestrator` e pelos agentes especialistas;
- nenhuma nova regra cognitiva nasce no `ChatAgentLauncher`.

---

## 4. Ordem de merge

```text
Baseline entregue: Patch 0 + PR1 + PR2
PR3 (em validação / merge pendente)
PR2.5
PR4
PR5
PR6
PR7 (expansão P1/P2)
```

Regra:

- não reabrir `Patch 0`, `PR1` ou `PR2` como backlog futuro;
- `PR2.5` pode rodar em paralelo leve;
- `PR4` é o próximo passo obrigatório;
- `PR5` e `PR6` só entram depois de `PR4`;
- não abrir missões P1/P2 antes do P0 estar evidenciado;
- `ChatAgentLauncher` permanece render-only em todos os PRs.

---

## 5. Baseline entregue — Patch 0 + PR1 + PR2

### Status

Entregue e mergeado em `main`.

### O que já entrou

- `MissionSteps[M]` tipado
- `IMOB_MISSION_TRANSITIONS`
- `audit.version`
- `expectedVersion`
- `SideEffectDispatchGuard`
- `evaluateProofGate`
- `case_review` com snapshot autoritativo versionado
- `ImobMissionId`
- `ImobCaseState`
- `ImobMissionPolicy`
- `schemaVersion`
- `LegacyCompatibilityResolver`
- `operationToAgentMap`
- tabela explícita operação -> agente
- bloqueio `NO_AGENT_FOR_OPERATION`
- activity por roteamento
- ownership sempre mantido pelo `IMOB_Orchestrator`

### Testes já validados

```text
pnpm test:imob-orchestrator-patch0
pnpm test:imob-orchestrator-pr1
pnpm test:imob-orchestrator-pr2
MissionStepsContract.test.ts
MissionTransitionGraph.test.ts
ImobCaseConcurrency.test.ts
ImobSideEffectDispatchGuard.test.ts
ProofGate.test.ts
CaseReviewProof.test.ts
LegacyCaseCompatibility.test.ts
OperationRouter.test.ts
OperationRoutingOwnership.test.ts
NoAgentForOperation.test.ts
```

### Observação

`PR1` deixa de aparecer como futuro e passa a compor baseline parcialmente evidenciado.

---

## 6. PR3 — Recuperação confiável

### Objetivo

Fechar `consultar caso`, `retomar`, `o que falta?`, `status da missão` e `próximo passo` como paths de primeira classe.

### Entregas

- `RecoveryResolver`
- `case.review` consolidado
- recuperação sem “ação inválida” genérica
- blockers reais
- recomposição segura de snapshot por estado persistido
- `recoverySnapshot` no `CaseContextBuilder`
- fallback do planner via snapshot de recuperação

### Arquivos prováveis a tocar

- `apps/api/src/services/imob/crm/imobCaseContextBuilder.ts`
- `apps/api/src/services/imob/crm/imobCaseContextContract.ts`
- `apps/api/src/services/imob/crm/imobCrmCasePlanner.ts`
- novo:
  - `apps/api/src/services/imob/orchestrator/imobRecoveryResolver.ts`

### Status

Implementado em branch de trabalho e validado por suíte scoped; merge pendente.

### Testes por PR

```text
pnpm test:imob-orchestrator-pr3
ImobRecoveryResolver.test.ts
imob-case-context-builder.test.ts
imob-crm-case-planner.test.ts
```

### Riscos de rollout

- snapshot incoerente com estado real
- reabertura de pendência já resolvida
- regressão em lead continuity

### Mitigação

- leitura a partir da persistência autoritativa
- reaproveitar invariantes do lead continuity P0
- teste de regressão com `consultar caso`

---

## 7. PR2.5 — IMOB-CRM Agentic Operating Model

### Objetivo

Definir o `IMOB-CRM` como projeção operacional do `canonicalCaseState`, sem criar nova fonte de verdade.

### Entregas

- `ImobCrmAgentRegistry`
- `ImobCrmCaseProjection`
- `ImobCrmCaseCard`
- `CommandCenterMetrics`
- mapeamento `agente -> missão -> operação -> entidade`
- filas operacionais:
  - `dedupe_queue`
  - `proof_queue`
  - `next_action_queue`
  - `blocker_queue`

### Não entra

- nova lógica no `ChatAgentLauncher`
- novo CRM monolítico
- side effects externos
- mutação fora do `IMOB_Orchestrator`

### Contrato mínimo sugerido

```ts
type ImobCrmCaseCard = {
  tenantId: string;
  workspaceId: string;
  caseId: string;

  mission: ImobMissionId;
  missionStatus: MissionStatus;
  currentOperation: ImobOperation;

  ownerAgent: "IMOB_Orchestrator";
  targetAgent?: ImobInternalAgentId;

  readiness: {
    owner?: ReadinessStatus;
    property?: ReadinessStatus;
    lead?: ReadinessStatus;
    visit?: ReadinessStatus;
    documents?: ReadinessStatus;
    proof?: ReadinessStatus;
  };

  blockers: ImobBlocker[];
  nextAction: ImobNextAction;
  proofStatus: "not_required" | "missing" | "satisfied";
  lastActivityAt: string;
};
```

---

## 8. PR4 — NextAction única + completion status

### Objetivo

Impedir múltiplos próximos passos conflitantes e tornar missão mensurável.

### Entregas

- `NextActionResolver`
- `CompletionEvaluator`
- status:
  - `draft`
  - `in_progress`
  - `blocked`
  - `ready_for_transition`
  - `done`

### Arquivos prováveis a tocar

- `apps/api/src/services/imob/imobConversationContract.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`
- `apps/api/src/services/imob/crm/imobCrmBusinessRead.ts`
- novo:
  - `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts`
  - `apps/api/src/services/imob/orchestrator/imobCompletionEvaluator.ts`

### Testes por PR

```text
NextActionResolver.test.ts
MissionCompletionEvaluator.test.ts
SingleNextActionInvariant.test.ts
```

### Riscos de rollout

- mudança de copy operacional
- conflito com `nextStep` legado
- UI renderizando payload parcialmente incompatível

### Mitigação

- manter launcher render-only
- manter compat layer no payload
- snapshots de resposta por missão

---

## 9. PR5 — Proof mínimo por missão

### Objetivo

Fazer `done` depender de proof real, não de interpretação textual.

### Entregas

- `requiredProof` por missão
- integração com `Guardian_EvidenceAgent`
- bloqueio `MISSING_REQUIRED_PROOF`
- referência a `evidenceBundleId`
- `case_review` validado por snapshot autoritativo
- `requiresOutbox` explícito para operações com side effect externo

### Arquivos prováveis a tocar

- `apps/api/src/services/imob/orchestrator/imobMissionPolicy.ts`
- `apps/api/src/services/imob/orchestrator/imobProofGate.ts`
- `apps/api/src/services/imob/agents/imobAgentActivityRuntime.ts`
- `apps/api/src/services/imob/imobTurnResolver.ts`

### Testes por PR

```text
ProofGate.test.ts
RequiredProofByMission.test.ts
MissionDoneRequiresProof.test.ts
CaseReviewProof.test.ts
```

### Riscos de rollout

- missão passar a bloquear onde antes “parecia concluída”
- superfícies antigas não exibirem motivo do bloqueio

### Mitigação

- `reasonCode` obrigatório
- blockers explícitos
- `nextAction` para suprir proof faltante
- nenhuma operação com side effect externo executada diretamente pelo `OperationRouter`

---

## 10. PR6 — Testes E2E do orquestrador

### Objetivo

Fechar a espinha dorsal com cobertura de regressão e evidência de estabilidade.

### Entregas

- E2E por missão prioritária
- teste de recuperação
- teste de fail-closed
- teste de concorrência
- teste de idempotência de side effect
- teste de boundary do launcher

### Arquivos prováveis a tocar

- `apps/api/src/tests/`
- `apps/web/src/components/agents/chatLauncherEngine.test.ts`
- novo conjunto sugerido:
  - `imob-orchestrator-mission-e2e.test.ts`
  - `imob-orchestrator-recovery-e2e.test.ts`
  - `imob-orchestrator-concurrency-e2e.test.ts`
  - `imob-orchestrator-proof-e2e.test.ts`

### Testes por PR

```text
imob-orchestrator-mission-e2e.test.ts
imob-orchestrator-recovery-e2e.test.ts
imob-orchestrator-concurrency-e2e.test.ts
imob-orchestrator-proof-e2e.test.ts
chatLauncherEngine.test.ts
```

### Riscos de rollout

- suites ficarem lentas e frágeis
- false negative por fixtures incompletas
- drift entre engine e tests

### Mitigação

- fixtures pequenas e determinísticas
- separar E2E core de smoke web
- gate scoped próprio do orquestrador

---

## 11. PR7 — Expansão P1/P2

### Objetivo

Só depois do P0 estabilizado, expandir para trilhas mais pesadas.

### Status nesta revisão

- `prepare_contract`: entregue
- `settle_commission`: entregue
- `commercial_activation`: entregue

### Escopo

- `prepare_contract`
- `commercial_activation`
- `settle_commission`

### Arquivos prováveis a tocar

- `apps/api/src/services/imob/orchestrator/*`
- `apps/api/src/services/imob/*document*`
- `apps/api/src/services/imob/*campaign*`
- `apps/api/src/services/imob/*commission*`
- integrações com proof/economy/policy

### Testes por PR

```text
prepare-contract-e2e.test.ts
commission-settlement-e2e.test.ts
commercial-activation-e2e.test.ts
```

### Riscos de rollout

- escopo explodir para jurídico/economy/outbound
- proofs ficarem incompletas
- dependência de approvals e providers externos

### Mitigação

- não abrir antes de P0 evidenciado
- ativação por feature flag ou mission tier
- fail-closed por policy

---

## 12. Testes mínimos por fase

### Baseline entregue

```text
pnpm test:imob-orchestrator-patch0
pnpm test:imob-orchestrator-pr1
pnpm test:imob-orchestrator-pr2
MissionStepsContract.test.ts
MissionTransitionGraph.test.ts
ImobCaseConcurrency.test.ts
ImobSideEffectDispatchGuard.test.ts
ProofGate.test.ts
CaseReviewProof.test.ts
```

### PR3

```text
pnpm test:imob-orchestrator-pr3
ImobRecoveryResolver.test.ts
imob-case-context-builder.test.ts
imob-crm-case-planner.test.ts
```

### PR2.5

```text
ImobCrmAgentRegistry.test.ts
ImobCrmCaseProjection.test.ts
ImobCrmCommandCenterMetrics.test.ts
```

### PR4

```text
NextActionResolver.test.ts
MissionCompletionEvaluator.test.ts
SingleNextActionInvariant.test.ts
```

### PR5

```text
RequiredProofByMission.test.ts
MissionDoneRequiresProof.test.ts
```

### PR6

```text
imob-orchestrator-mission-e2e.test.ts
imob-orchestrator-recovery-e2e.test.ts
imob-orchestrator-concurrency-e2e.test.ts
imob-orchestrator-proof-e2e.test.ts
```

---

## 13. Gates de CI recomendados

Criar gates scoped, sem depender de `tsc` global contaminado:

```text
check:imob-mission-graph
check:imob-case-state-contract
check:imob-proof-gate
check:imob-crm-projection
check:imob-orchestrator-e2e
```

E manter:

```text
check:evidence-index
check:help-playbook-drift
```

---

## 14. Riscos de rollout consolidados

| Risco | Nível | Momento mais crítico | Mitigação |
| --- | --- | --- | --- |
| Regressão em `lead.qualify` / continuidade | P0 | PR3 / PR4 | regressão scoped + leitura autoritativa |
| Side effect duplicado | P0 | PR5 / PR6 | dispatch guard + idempotency key + outbox |
| Snapshot incoerente em `case_review` | P0 | PR3 / PR5 | snapshot versionado |
| Quebra de casos legados | P0 | PR1 | compat layer |
| Drift documental vs runtime | P0 | rebaseline do plano | atualizar baseline e Evidence Index por merge relevante |
| `nextAction` ambígua | P1 | PR4 | resolver único |
| operação sem agente responsável | P1 | PR2 | mapa explícito + fail-closed |
| IMOB-CRM virar fonte da verdade | P1 | PR2.5 | CRM como projeção derivada apenas |
| bloqueio excessivo por proof | P1 | PR5 | reasonCode + nextAction corretiva |
| expansão prematura para jurídico/economy | P1 | PR7 | adiar para P1/P2 |

---

## 15. Critério de fechamento do P0

O P0 só pode ser considerado fechado quando:

- missões P0 estiverem reconhecidas e governadas;
- estado canônico estiver persistido e recuperável;
- recuperação por `consultar caso`, `retomar` e `o que falta?` estiver estável;
- existir uma única `nextAction` principal;
- `done` depender de proof mínima;
- side effect duplicado estiver bloqueado;
- conflitos de versão falharem fechado;
- `ChatAgentLauncher` continuar sem regra cognitiva nova;
- testes E2E scoped estiverem verdes;
- cada PR tiver evidência indexável quando mergeado;
- evidência estiver indexada.

---

## 16. Próximo passo operacional imediato

Executar nesta ordem:

1. manter o `EVIDENCE_INDEX` alinhado aos merges de `prepare_contract`, `settle_commission` e `commercial_activation`;
2. consolidar a expansão `PR7` como concluída no baseline documental;
3. manter qualquer expansão futura de ativação comercial em escopo `fail-closed`:
   - sem outbound real
   - sem publish real
   - com approval humana explícita
4. decidir se novas trilhas P2 entram como frente separada ou se esta fase deve ser encerrada com hardening e evidência recorrente.
