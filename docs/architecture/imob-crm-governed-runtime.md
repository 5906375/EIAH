# IMOB_CRM Governed Runtime

## Objetivo

Documentar, de forma curta e canônica, o que foi materializado no `IMOB_CRM` para que o `EIAH` consiga responder perguntas internas sobre a operação imobiliária governada.

## Resumo

O `IMOB_CRM` está em transição fechando o caminho canônico de runtime governado de caso.

Estado atual:
- `IMOB` continua como agente visível e dono do caso;
- a lógica operacional relevante fica no backend;
- specialists entram como apoio contextual e não assumem ownership;
- `ChatAgentLauncher` não decide regra de domínio IMOB;
- quick replies governadas podem ser marcadas no snapshot como `backend_payload`;
- a página dedicada do IMOB já prioriza `presentation.blocks` vindos do backend e reduz síntese local.
- turns sensíveis do chat já expõem `proof` canônica em `presentation.proof` e `message.proof`, inclusive em tempo real e na persistência/export.
- o harness local de teste já normaliza `DB/Redis` para `127.0.0.1` quando o ambiente vier com hostnames internos do compose;
- a trilha de prova da plataforma já foi validada localmente para `discovery -> negotiate -> execute`, `HIGH + txIdRequired`, `ledger/bundle`, `settlement` idempotente e `reputation/disputes`.

O objetivo final não é reescrever a vertical. É fazer o fluxo canônico virar o único caminho normal.

## Fluxo Canônico

O alvo arquitetural do `IMOB_CRM` é:

1. `IMOB Agent Contract`
2. `IMOB Turn Engine`
3. `IMOB Workflow / State Machine`
4. `Operational Resolvers` encapsulados
5. `Mutation / Business Read`
6. `Canonical Case Context`
7. `Recommended Actions`
8. `Agent Activities`
9. `Presentation Payload`
10. `Launcher render-only`

## Arquitetura em 3 camadas

### 1. Agente visível

O `IMOB` permanece como agente visível da vertical imobiliária.

Responsabilidades:
- consolidar a leitura do caso;
- acionar capabilities e specialists;
- expor próximos passos;
- manter ownership do caso.

### 2. Capability Registry

O `IMOB_CRM` possui um registry governado de capabilities em:
- [imobCapabilityRegistry.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/imob/imobCapabilityRegistry.ts)

Cada capability pode declarar:
- `capabilityId`
- `ownerAgent`
- `status`
- `executionMode`
- `riskTier`
- `rolloutStage`
- `requiresConsent`
- `requiresHumanApproval`
- `requiresEvidence`
- `policyRequired`
- `initialImplementation`

## 3. Specialists e runtime operacional

O backend passou a materializar capabilities e flows governados, incluindo:
- specialists internos
- mission runtime
- shadow runtime
- gates de consentimento, approval e policy
- async runtime base
- assisted integrations em sandbox
- enrichment e capture governado
- scale runtime
- pilot flows e promotion runtime
- surfaces operacionais de piloto

## Snapshots consultivos relevantes

O runtime do caso pode expor snapshots como:
- `leadDiscovery`
- `leadScore`
- `commercialMemory`
- `decisionRationale`
- `reengagementSuggestion`
- `inventoryWatch`
- `leadProfileReport`
- `viabilityMarketAnalysis`
- `closingDocuments`
- `missionOrchestration`
- `pilotFlow`
- `pilotOperationalState`
- `pilotControlState`

## Como isso funciona na prática

Fluxo resumido:

1. o usuário fala com o `IMOB`;
2. o backend resolve intenção governada, workflow e estado do caso;
3. o runtime consulta capabilities, specialists, missão, governança e estado operacional;
4. o `IMOB` devolve um payload resolvido com `recommendedActions`, `agentActivities`, `quickReplies` e `blocks`;
5. a UI apenas renderiza.

## Requisitos de Governança

Para considerar o runtime realmente governado, estes requisitos devem permanecer verdadeiros:

- fallback legado é exceção, não caminho normal;
- `crm_legacy_fallback_invoked` tende a zero;
- quick replies IMOB vêm do payload resolvido;
- parser operacional fica encapsulado no engine/contrato IMOB;
- `recommendedActions` são sempre case-aware;
- `agentActivities` vêm do backend;
- `ChatAgentLauncher` não decide regra de domínio.

Invariantes que não podem regredir:

- `caseContext` completo;
- `threadId` como caminho oficial;
- canonicalização geográfica com lock;
- `market_scan` read-only;
- `presentation freshness`;
- `proof surface` canônica para turns sensíveis;
- golden paths E2E.

## Invariante de proof surface

Para turns IMOB sensíveis, a prova auditável já faz parte do contrato canônico do chat.

Regra:
- o backend resolve `presentation.proof`;
- a mensagem do chat persiste `message.proof` como fonte primária;
- a UI do IMOB apenas renderiza esse bloco e não sintetiza prova local;
- `done` não é estado válido quando a policy exigir prova e `proof.ready = false`.

Forma canônica:
- `required`
- `ready`
- `state`
- `runId`
- `txId`
- `receiptPath`
- `bundlePath`
- `verifyUrl`

Isso vale para:
- turns resolvidos em tempo real;
- mensagens persistidas;
- snapshot/export do histórico;
- leituras consultivas que já possuam sinais reais de prova no `caseContext`.

## Trilha de piloto operacional

O `IMOB_CRM` já possui uma trilha governada de piloto para `assisted_calendar_flow`.

Essa trilha inclui:
- approval auditável;
- rollout state;
- piloto controlado em sandbox;
- tracking e evidence;
- surfaces de leitura operacional;
- runtime central de controle do piloto.

## Leituras operacionais do caso

Quando aplicável, o caso pode expor:

### `pilotOperationalState`

Leitura operacional read-only do piloto, refletindo apenas estado já existente de:
- approval
- rollout
- tracking
- evidence

### `pilotControlState`

Surface mais explícita para o `IMOB_CRM`, descrevendo:
- status governado do flow;
- resumo operacional;
- próxima ação humana;
- ações disponíveis sem mover regra para UI.

## Regras de arquitetura preservadas

- nenhuma nova regra nasce em `chat.tsx`;
- `imobTurnResolver` não recebe heurística operacional nova para essa trilha;
- o backend decide;
- a UI renderiza;
- approval operacional precisa ser auditável;
- `ready_for_review` não equivale a approval humano operacional;
- ações sensíveis não começam como `automated`.
- `ChatAgentLauncher` não inventa quick replies, CTA ou handoff IMOB quando o snapshot/payload já resolveu o turno.

## Estado Atual por Camada

### Já materializado

- intent governada centralizada em [imobGovernedIntent.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/imob/imobGovernedIntent.ts)
- contexto operacional governado em [imobCrmGovernedOperationalContext.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/imob/crm/imobCrmGovernedOperationalContext.ts)
- workflow classifier reutilizado pelo turn engine em [imobCrmWorkflowMachine.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/imob/crm/imobCrmWorkflowMachine.ts)
- business read emitindo blocos estruturados e CTAs case-aware em [imobCrmBusinessRead.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/imob/crm/imobCrmBusinessRead.ts)
- snapshot frontend marcando runtime render-only governado em [chatPresentationSnapshot.ts](/home/jusall/projects/EIAH_BUILDER/apps/web/src/components/agents/chatPresentationSnapshot.ts)

### Ainda em sunset / não remover agora

- [imobCrmResolver.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/imob/crm/imobCrmResolver.ts) continua como facade de compatibilidade.

Critério de remoção:
- fallback legado zerado ou restrito a cenários arquivados;
- métricas estáveis por sprint;
- nenhum golden path passando pelo compat layer.

Enquanto isso não estiver provado, remover a facade seria prematuro.

## Estado comprovado vs. não comprovado

### Comprovado agora

- runtime do chat IMOB agent-driven com launcher `render-only`
- fallback legado em allowlist auditável
- governança por capability com `minimumRolloutStage`
- bootstrap local de teste para `DB/Redis`
- `Agent Protocol` funcional para `imob`
- ações `HIGH` com `txIdRequired`
- `ledger/bundle` verificáveis
- `settlement` de comissão mantendo vínculo `run + receipt + ledger` e idempotência em replay
- `reputation/disputes` com trilha auditável por `tenant/workspace`
- `proof surface` canônica propagada por `presentation.proof`, `message.proof` e export do chat IMOB
- página IMOB usando `presentation.proof` também em turns resolvidos em tempo real

### Ainda não fechado nesta etapa

- `Receipt Canon / ledger / txId` como semântica final de conclusão em toda a superfície do chat IMOB
- fechamento da superfície do chat IMOB para expor prova econômica de forma consistente em todos os turns sensíveis

## Gates Operacionais

Os gates mínimos de rollout governado são:

- `no legacy fallback` nos golden paths;
- `quick replies from payload` para IMOB governado;
- `backend agentActivities` presentes quando houver atividade agentic;
- `recommendedActions case-aware`;
- `render-only snapshot` marcado em mensagens governadas do IMOB.
- `snapshot fail-closed` quando `governedRuntime` vier inconsistente.
- `Agent Protocol interop` funcional para domínio `imob`.
- ações `HIGH` do domínio imobiliário publicando `txIdRequired = true`.
- `ledger/bundle verification` disponível por `txId` e `runId`.
- `proof surface` obrigatória em turns sensíveis, sem `done` quando `proof.required = true` e `proof.ready = false`.

## Track P operacional

Para o `IMOB_CRM` sair de rollout ad hoc e virar vertical operacional reutilizável, o Track P precisa permanecer explícito em quatro frentes:

- checklist padrão por vertical;
- critérios de avanço `shadow -> pilot -> small`;
- evidência semanal da vertical;
- command center com export de prova por `run`.

No recorte atual do IMOB, isso significa:
- `ops/verticals/vertical-onboarding-checklist.md` como fonte canônica do onboarding/rollout;
- `realestate-pilot-rollout-YYYY-MM-DD.md` como evidência operacional do estágio atual;
- `w4-non-regression-kpis.json` como gate mínimo de KPI por vertical;
- command center IMOB expondo superfícies de funnel, blocked runs e links de prova (`bundle`, `ledger/receipt`) por run quando aplicável.

### Gates de prova já validados

Os seguintes gates já possuem cobertura executada no ambiente local com bootstrap de infra corrigido:

- `apps/api/src/tests/agents.interop.contract.test.ts`
  - valida `POST /api/agents/discovery`
  - valida `POST /api/agents/negotiate`
  - valida `POST /api/agents/execute`
  - valida leitura de `ledger` após reconciliação
- `apps/api/src/tests/realestate.high-actions.e2e.test.ts`
  - valida ações `HIGH`
  - valida `txIdRequired = true`
  - valida `receiptSchema.specVersion = receipt.canon.v1`
- `apps/api/src/tests/ledger-bundle.contract.test.ts`
  - valida `GET /api/ledger/:txId`
  - valida invariantes `txId -> runId -> bundleHash`
  - valida export de bundle por run
- `apps/api/src/tests/realestate.commission.settlement.e2e.test.ts`
  - valida `run + receipt + ledger` em `realestate.commission`
  - valida replay idempotente sem novo side effect no ledger
- `apps/api/src/tests/billing.reputation.disputes.contract.test.ts`
  - valida `receipt.finalized` atualizando snapshot de reputação
  - valida `dispute.closed` atualizando taxa de disputa e bloqueando replay inválido

Esses gates provam a conexão real do Chat IMOB com a proof chain da plataforma.
Eles já fecham `settlement / disputes / reputation` na plataforma. O que ainda fica em aberto é a semântica final da superfície do chat IMOB para expor essa prova de forma uniforme em todos os turns sensíveis.

### Gate de Snapshot Governado

Para um turno IMOB ser considerado `render-only` governado no launcher, o snapshot precisa cumprir o contrato completo:

- `compatibilityMode = snapshot`
- `routeIntent = imob`
- `governedRuntime.domain = IMOB`
- `governedRuntime.contractVersion = imob.crm.governed.v1`
- `governedRuntime.launcherPolicy = render_only`
- `governedRuntime.quickRepliesSource = backend_payload`
- `governedRuntime.recommendedActionsSource = backend_payload`
- `governedRuntime.agentActivitiesSource = backend_payload`
- `quickReplySource = backend_payload`

Se qualquer um desses pontos vier inconsistente:

- o launcher não deve tratar o turno como `backend-governed IMOB`;
- quick replies do snapshot devem ser suprimidas;
- a UI não deve preencher esse gap com inferência de domínio IMOB;
- o turno deve falhar fechado em termos de affordances governadas.

Objetivo:
- impedir que um snapshot parcialmente preenchido simule governança;
- evitar recaída para launcher-driven behavior;
- tornar o contrato auditável por teste e rollout.

## Leitura executiva

Em uma frase:

O `IMOB_CRM` está fechando o ciclo para operar como runtime governado de caso que lê, decide, evidencia, controla rollout e expõe o estado operacional pronto para a UI renderizar.
