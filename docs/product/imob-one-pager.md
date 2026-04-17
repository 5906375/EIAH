# Vertical CHAT IMOB: One-Pager de Produto

## Visao

O Vertical CHAT IMOB organiza o negocio imobiliario como uma **Jornada Operacional Governada por Casos**. O sistema consolida o contexto do ativo e do cliente, pensa a fila, explica blockers, orienta o proximo passo humano e aplica governanca auditavel apenas nas transicoes sensiveis exigidas por policy e risco.

## Problema

A operacao imobiliaria perde eficiencia quando o contexto do caso fica fragmentado entre comercial, operacao, juridico e financeiro. Isso gera:
- follow-up dependente de memoria humana;
- blockers pouco explicitos;
- handoffs sem semantica comum;
- reconstrucao manual de contexto;
- approvals e evidencias aparecendo tarde no fluxo.

## O que o Vertical resolve

O Vertical CHAT IMOB deve:
- manter uma leitura unica do caso;
- reduzir trabalho manual e carga cognitiva;
- mostrar quem precisa agir agora;
- organizar blockers e handoffs por contexto real;
- aplicar approval e evidence apenas nas transicoes sensiveis.

## Unidade central

A unidade principal do vertical e o `case`.

A leitura operacional compartilhada deve projetar, no minimo:
- `case`
- `thread`
- `humanJourney`
- `humanWorkflow`
- `waitingOn`
- `reasonCode`
- `nextActionOwner`
- `urgency`
- `followUpRisk`

Essa mesma semantica deve alimentar:
- chat IMOB;
- command center IMOB;
- queue e boards;
- approvals contextuais.

## Usuarios principais

- corretor / captador
- operacao / backoffice
- gestor comercial
- juridico / documental
- financeiro / governanca

## Valor entregue

- menos retrabalho e perda de contexto;
- fila mais priorizada por risco e urgencia reais;
- visao clara de blockers e `waitingOn`;
- handoff explicito entre areas;
- menor esquecimento de follow-up;
- governanca seletiva onde o processo exigir.

## Modelo operacional

O Vertical CHAT IMOB opera como runtime centrado em caso:
- `imob_CRM` mantem ownership da leitura do caso;
- specialists entram como apoio contextual, nunca como donos do caso;
- chat, queue, board e approvals leem o mesmo estado resolvido;
- o launcher apenas renderiza o resultado do agente.

## Specialists contextuais

Specialists como `I_BC`, `Diarias`, `J_360`, `fin-nexus` e `guardian` entram apenas quando houver contexto claro de fase, blocker, risco ou `reasonCode`.

Eles podem apoiar:
- priorizacao comercial;
- disciplina de follow-up;
- validacao documental;
- suporte financeiro;
- trilha de evidencia e governanca.

Nao devem assumir ownership do caso.

## Governanca

A governanca do vertical deve ser seletiva e policy-bound:
- transicoes normais privilegiam fluidez operacional;
- transicoes sensiveis podem exigir `approval`;
- transicoes sensiveis podem exigir `evidence`;
- operacoes sensiveis devem ser fail-closed sem `tenantId`, `workspaceId`, policy ou evidencias exigidas.

## Escopo funcional atual

O vertical deve continuar evoluindo em torno de:
- leitura consolidada do caso;
- fila priorizada;
- waiting on board;
- heatmap de gargalos;
- specialist load e rescue index;
- approval context e approval actions.

## Fora de escopo

- mover logica de comportamento para o launcher;
- tratar toda etapa como acao HIGH;
- usar specialists como donos do caso;
- duplicar semantica do caso em telas diferentes.

## Metricas de sucesso

- reducao de casos sem owner claro;
- reducao de aging em fases criticas;
- reducao de follow-up perdido;
- aumento de avancos apos intervencao sugerida;
- menor tempo para entender o proximo passo;
- approvals sensiveis com trilha completa.

## Restricoes

- preservar funcionalidades existentes;
- preservar layout visual e responsividade;
- manter arquitetura `agent-driven`;
- respeitar `tenantId` e `workspaceId`;
- manter fail-closed em operacoes sensiveis.

## Referencias de implementacao

Arquitetura e contexto do vertical:
- [agent-chat-runtime.md](../architecture/agent-chat-runtime.md)
- [vertical-context-imob.md](../architecture/vertical-context-imob.md)
- [imob-dedicated-chat-runtime.md](../architecture/imob-dedicated-chat-runtime.md)

Superficies e contratos atuais do IMOB:
- `apps/api/src/services/imob/crm/imobCrmCaseContext.ts`
- `apps/api/src/services/imob/control/imobControlSurface.ts`
- `apps/api/src/services/imob/control/imobControlSurfaceAggregates.ts`
- `apps/api/src/services/imob/control/imobReasonCodeCatalog.ts`
- `apps/api/src/services/imob/imobSpecialistBridge.ts`
- `apps/api/src/routes/imobCrmRouter.ts`
- `apps/web/src/pages/app/imob/dashboard.tsx`
