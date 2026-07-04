# ADR: Vertical CHAT IMOB como Jornada Operacional Governada por Casos

## Status

Aceita

## Contexto

O Vertical CHAT IMOB ja possui uma base funcional real orientada por caso e por superficies operacionais compartilhadas. O repositorio ja contem:
- semantica de `humanJourney` e `humanWorkflow` no dominio IMOB;
- `waitingOn`, `urgency`, `followUpRisk` e `reasonCode` como leitura operacional do caso;
- control surfaces e agregacoes para queue, board e dashboard;
- approvals contextuais e approval actions no dominio IMOB;
- fronteira arquitetural em que o launcher apenas renderiza o estado resolvido.

Ao mesmo tempo, a plataforma ja possui mecanismos de governanca mais fortes para transicoes sensiveis, incluindo approval policy, fail-closed e trilha auditavel. A decisao necessaria e consolidar o vertical sem reintroduzir drift entre contrato, engine e UI.

## Decisao

Adotar o Vertical CHAT IMOB como uma **Jornada Operacional Governada por Casos**.

Isso implica:
- `imob_CRM` e o responsavel principal pela leitura e evolucao do caso;
- `case` e a unidade central do vertical;
- chat, queue, board e approvals devem consumir a mesma semantica operacional;
- specialists entram apenas como apoio contextual;
- governanca deve ser seletiva e policy-bound, aplicada nas transicoes sensiveis;
- o launcher apenas renderiza o resultado resolvido pelo agente e pelo engine.

## Justificativa

Essa decisao e a mais aderente ao estado atual do codigo porque o dominio IMOB ja foi implementado sobre os seguintes eixos:
- `case` e `thread` como referencia operacional;
- `humanJourney` e `humanWorkflow` como explicacao do progresso do negocio;
- `waitingOn` e `nextActionOwner` como clareza de ownership;
- `reasonCode` como contrato canonico de blocker e handoff;
- approvals e evidence apenas onde o risco e a policy exigirem.

A decisao tambem preserva a arquitetura `agent-driven` formalizada no projeto:
- o agente define comportamento;
- o engine executa;
- o launcher apenas renderiza.

## Consequencias

### Positivas

- semantica unica entre chat, queue, board e approvals;
- menor drift de contexto entre areas e superficies;
- fronteira mais clara entre runtime principal e specialists;
- apoio mais forte a operacao humana;
- governanca reforcada nas transicoes de maior risco.

### Trade-offs

- exige disciplina para nao recolocar logica no launcher;
- exige manutencao canonica de `reasonCode` e da leitura de `humanWorkflow`;
- exige que novas superficies consumam o mesmo modelo, em vez de recriarem score e estado localmente.

## Principios derivados

1. Caso e a unidade central.
2. Specialists nao assumem ownership do caso.
3. `reasonCode` e contrato canonico de blocker, handoff e analytics.
4. `waitingOn` e `nextActionOwner` devem ser explicitos.
5. `approval` e `evidence` entram por risco e policy, nao por padrao.
6. A UI nao define comportamento.
7. Operacoes sensiveis exigem `tenantId`, `workspaceId` e escopo explicitos.
8. O vertical deve preservar funcionalidades existentes, layout visual e responsividade.

## Implicacoes arquiteturais

- Novas regras do IMOB devem nascer no contrato do agente e ser executadas no engine.
- O launcher nao deve concentrar logica de handoff, fallback, blocker ou quick reply.
- Control surfaces do IMOB devem continuar sendo a fonte comum para chat, queue, board e approvals.
- Specialists como `I_BC`, `Diarias`, `J_360`, `fin-nexus` e `guardian` devem ser acionados por fase, blocker, risco ou `reasonCode`.
- Operacoes sensiveis devem continuar fail-closed quando faltarem contexto, entitlement, policy ou evidence exigida.

## Nao decisao

Esta ADR nao redefine layout, componentes visuais nem responsividade das superficies atuais. Ela formaliza a direcao de produto e arquitetura do vertical.

## Referencias

Documentacao:
- [agent-chat-runtime.md](./agent-chat-runtime.md)

Backlog documental futuro:
- `vertical-context-imob.md`
- `imob-dedicated-chat-runtime.md`

Implementacao atual:
- `apps/api/src/services/imob/crm/imobCrmCaseContext.ts`
- `apps/api/src/services/imob/control/imobControlSurface.ts`
- `apps/api/src/services/imob/control/imobControlSurfaceAggregates.ts`
- `apps/api/src/services/imob/control/imobReasonCodeCatalog.ts`
- `apps/api/src/services/imob/imobSpecialistBridge.ts`
- `apps/api/src/routes/imobCrmRouter.ts`
- `apps/web/src/features/imob/ImobApprovalContextCard.tsx`
- `apps/web/src/pages/app/imob/dashboard.tsx`
