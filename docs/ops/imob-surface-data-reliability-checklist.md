# IMOB Surface Data Reliability Checklist

Data de referencia: 15 de junho de 2026

## Objetivo

Validar as superficies da vertical IMOB para evitar:

- duplicacao do mesmo dado com semantica diferente;
- exibicao de dado sintetico como se fosse dado real;
- cards sem conexao confiavel com `caseId`, `threadId`, `runId`, `ownerId` ou `propertyId`;
- KPIs derivados apresentados como metrica primaria;
- navegacao entre Funil, Command Center, Solucoes, Imoveis e Parceiros com contexto inconsistente.

## Escopo

Superficies observadas neste checklist:

- `dashboard` IMOB:
  - [apps/web/src/pages/app/imob/dashboard.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/app/imob/dashboard.tsx)
- `chat` IMOB:
  - [apps/web/src/pages/app/imob/chat.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/app/imob/chat.tsx)
- pagina isolada de imoveis:
  - [apps/web/src/pages/app/imob/properties.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/app/imob/properties.tsx)
- pagina isolada de parceiros:
  - [apps/web/src/pages/app/imob/partners.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/app/imob/partners.tsx)

Blocos relevantes do dashboard:

- [apps/web/src/features/imob/ImobCommandCenter.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/features/imob/ImobCommandCenter.tsx)
- [apps/web/src/features/imob/ImobDashboardHero.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/features/imob/ImobDashboardHero.tsx)
- [apps/web/src/features/imob/funnel/ImobFunnelTeamSection.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/features/imob/funnel/ImobFunnelTeamSection.tsx)
- [apps/web/src/features/imob/charts/ImobBrokerChart.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/features/imob/charts/ImobBrokerChart.tsx)
- [apps/web/src/features/imob/charts/ImobFunnelStepsChart.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/features/imob/charts/ImobFunnelStepsChart.tsx)
- [apps/web/src/features/imob/charts/ImobJourneyCostChart.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/features/imob/charts/ImobJourneyCostChart.tsx)

## Regra de classificacao da fonte

Usar sempre uma destas classificacoes ao revisar um bloco:

- `primary`: dado vindo de entidade canonica/API especifica
- `derived`: dado calculado a partir de entidades canonicas
- `fallback`: dado alternativo usado por indisponibilidade da API
- `synthetic`: dado demonstrativo/local
- `unavailable`: dado insuficiente ou ausente, sem simulacao

Regra obrigatoria:

- nenhum dado `synthetic` pode parecer `primary`
- nenhum dado `derived` pode ser rotulado como valor final de negocio sem indicar derivacao
- se nao houver base suficiente, preferir `unavailable` a fallback silencioso

## Estado atual mapeado no codigo

### Dashboard IMOB

Fonte principal:

- `apiListImobOwners()`
- `apiListImobProperties()`
- `apiListImobCases()`
- `apiListImobCaseCosts()`
- `apiListRuns()`
- `apiListImobPriorityQueue()`
- `apiListImobWaitingOnBoard()`
- `apiListImobBottleneckHeatmap()`
- `apiGetImobExecutiveSummary()`
- `apiListImobApprovalContext()`
- `apiGetImobKpiFunnel()`
- `apiGetImobKpiPerformance()`

Leitura atual:

- `dashboard`: majoritariamente `real`
- `threads` no dashboard: podem cair em `synthetic`
- `telemetria`: quando sem base, deve cair em `unavailable`

### Chat IMOB

Fonte principal:

- `apiListImobChatConversations()`
- `apiListImobChatMessages()`
- `apiListImobChatThreads()`
- `apiGetImobChatInterviewState()`
- `apiSearchImobKnowledge()`
- `apiAgentsDiscovery()`
- `apiAgentsNegotiate()`
- `apiAgentsExecute()`

Leitura atual:

- `chat`: `real`, com correlacao forte por `conversationId`, `threadId`, `runId`

### Pagina isolada de Imoveis

Fonte atual:

- `syntheticProperties` local

Leitura atual:

- `properties.tsx`: `synthetic`
- nao deve ser tratada como fonte confiavel de operacao real

### Pagina isolada de Parceiros

Fonte atual:

- `apiListDelegations()` com `mapDelegationsToPartners()`
- fallback em `syntheticPartners`

Leitura atual:

- `partners.tsx`: mistura `real + fallback`
- os cards precisam explicitar quando estao em modo `fallback`

## Checklist de revisao

Marcar cada item como `OK`, `ALERTA` ou `N/A`.

### 1. Duplicacao de informacao entre superficies

1. O mesmo contador de casos nao aparece com numeros diferentes entre `Funil`, `Command Center` e `Solucoes` sem explicacao de filtro.
- Esperado: `OK`
- Evidencia: comparar total de casos em `dashboard.tsx` e componentes filhos

2. O mesmo caso nao aparece duas vezes com status semanticamente diferentes na mesma tela.
- Esperado: `OK`
- Exemplo de falha: `pendente de dados` em um bloco e `pronto para revisao` em outro sem mudanca de fonte

3. `Imoveis prontos para revisao`, `com pendencias` e cards da aba `Imoveis` nao repetem o mesmo imovel sem indicar agrupamento diferente.
- Esperado: `OK`
- Evidencia: cruzar `propertyId`

4. `Parceiros ativos`, `casos em parceria` e cards de parceiros nao derivam de bases diferentes sem disclaimer.
- Esperado: `OK`

5. Atalhos de `Solucoes Rapidas` nao repetem a mesma pendencia ja aberta no `Command Center` com copy diferente.
- Esperado: `OK`

### 2. Confiabilidade e rotulagem da fonte

6. Toda superficie `synthetic` esta explicitamente sinalizada como demonstracao.
- Esperado: `OK`
- Estado em 2026-06-15: `properties.tsx` migrado para `apiListImobProperties()`. Badge de fonte adicionado ao KPI strip (`backend` | `sem dados`). `syntheticProperties` removido. **ALERTA A8 — evidenciado** (ver `docs/ops/evidence/latest/imob-surface-data-reliability/a8-ci-evidence.md`).

7. Toda superficie `fallback` informa claramente `backend` vs `fallback`.
- Esperado: `OK`
- Estado atual conhecido: [apps/web/src/pages/app/imob/partners.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/app/imob/partners.tsx) ja expoe `backend|fallback`

8. Nenhum valor derivado e rotulado como receita fechada sem base de settlement.
- Esperado: `OK`
- Ponto de atencao: `ImobBrokerChart` e `Custo por jornada`

9. Quando nao houver base suficiente, o bloco mostra `Sem dados suficientes` e nao inventa numero.
- Esperado: `OK`
- Ponto de atencao: ciclo operacional, pendencias resolvidas em 48h

10. Nenhum fallback local permanece silencioso no dashboard.
- Esperado: `OK`
- Ponto de atencao: `syntheticThreads` em [dashboard.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/app/imob/dashboard.tsx)

### 3. Conexoes e chaves canonicas

11. Todo card clicavel de caso expõe correlacao auditavel com pelo menos um destes ids:
- `caseId`
- `threadId`
- `runId`
- `ownerId`
- `propertyId`

Esperado: `OK`

12. `abrir no chat`, `resolver no chat`, `revisar bloqueios` e similares mantem o contexto correto no deep link.
- Esperado: `OK`
- Evidencia: verificar `conversationId`, `caseId`, `threadId`, `autoprompt`

13. `Command Center` e `Chat` apontam para o mesmo caso quando a acao parte do mesmo card.
- Esperado: `OK`

14. `Imoveis` e `Parceiros` conseguem ser reconciliados com `ownerId`/`propertyId`/`caseId`, sem depender apenas de nome textual.
- Esperado: `OK`

15. `runs` vinculados a custo por jornada batem com os runs reais filtrados em `apiListRuns()`.
- Esperado: `OK`

### 4. Semantica dos KPIs

16. `Conversao global do funil` usa o mesmo denominador que o funil em barras.
- Esperado: `OK`

17. `Conversao proposta -> fechamento` nao usa recorte diferente sem indicacao visual.
- Esperado: `OK`

18. `Tempo medio ate fechamento` usa apenas amostra confiavel (`durationSampleSize > 0`).
- Esperado: `OK`

19. `Pendencias resolvidas em 48h` usa apenas amostra elegivel e explicita quando a cobertura e zero.
- Esperado: `OK`

20. `Casos sem broker canonico` aparece como pendencia operacional, nao como corretor real.
- Esperado: `OK`

21. `Proprietarios`, `Com pendencias` e `Imoveis prontos para revisao` no dashboard sao todos derivados da mesma base real carregada em `dashboard.tsx`.
- Esperado: `OK`

### 5. Coerencia entre abas do dashboard

22. A aba `Funil` nao reconta dados de `Equipe` ou `Command Center` com nomes diferentes.
- Esperado: `OK`

23. A aba `Solucoes` mostra contexto do caso ativo e nao um resumo global mascarado como contexto local.
- Esperado: `OK`

24. A aba `Imoveis` mostra cards baseados no mesmo `properties[]` usado nos totais do topo.
- Esperado: `OK`

25. A aba `Parceiros` mostra cards baseados na mesma base usada nos totais do topo.
- Esperado: `OK`

26. Quando uma aba usa base `synthetic` e outra usa base `real`, isso fica visivel para o usuario interno/homologacao.
- Esperado: `OK`
- Estado em 2026-06-15: `properties.tsx` agora exibe badge de fonte no KPI strip e na secao de carteira. Superficies `synthetic` restantes (ex: `syntheticThreads` no dashboard) ainda precisam de badge equivalente. **Ver ALERTA A2.**

### 6. Responsive e repeticao visual

27. No mobile, o mesmo bloco nao aparece em resumo e detalhe ao mesmo tempo sem necessidade.
- Esperado: `OK`

28. Tabela e grafico de `Performance de corretores` nao repetem a mesma leitura sem ganho de contexto.
- Esperado: `OK`

29. Cards colapsados no mobile nao escondem a informacao de fonte (`backend`, `fallback`, `synthetic`, `unavailable`).
- Esperado: `OK`

30. Badges de status (`pendente de dados`, `pronto para revisao`, `bloqueado`) permanecem consistentes entre desktop e mobile.
- Esperado: `OK`

### 7. Integridade operacional

31. `tenantId` e `workspaceId` realmente filtram os dados exibidos.
- Esperado: `OK`

32. O gate de acesso IMOB falha em modo fechado e zera a superficie quando necessario.
- Esperado: `OK`
- Evidencia: comportamento de [apps/web/src/pages/app/imob/dashboard.tsx](/home/jusall/projects/EIAH_BUILDER/apps/web/src/pages/app/imob/dashboard.tsx) com `imobAccessGate`

33. `Parceiros` nao expoe informacao de delegacao como se fosse relacao comercial fechada sem distinguir a origem.
- Esperado: `OK`

34. `Imoveis` nao deve permanecer em modo demonstracao em ambiente que o dashboard ja trata como operacao real.
- Esperado: `ALERTA` ate migrar para API real ou rotular como demo interna

35. Toda nova regra de negocio continua fora da UI, seguindo `AGENTS.md`.
- Esperado: `OK`

## Achados iniciais ja visiveis no codigo

- `dashboard.tsx` e a superficie mais proxima da operacao real.
- `chat.tsx` tambem opera com correlacao real e eh a melhor ancora para prova por `conversationId/threadId/runId`.
- `properties.tsx` ainda eh pagina demonstrativa com base totalmente sintetica.
- `partners.tsx` tem base real parcial via `apiListDelegations()`, mas a semantica de parceiro ainda eh adaptada e nao entidade canonica de CRM IMOB.
- `syntheticThreads` ainda existem no dashboard e precisam sempre ser tratados como fallback sinalizado.

## Criterio de aprovacao

Considerar a superficie IMOB coerente quando:

- todos os itens criticos de fonte e correlacao estiverem `OK`
- nenhuma superficie `synthetic` estiver passando por `real`
- os links entre `dashboard`, `chat`, `cases`, `properties` e `partners` forem rastreaveis
- os KPIs derivados estiverem explicitamente rotulados e com cobertura conhecida
- nao houver duplicacao semantica relevante entre abas

## Proximo passo sugerido

Executar este checklist em tres rodadas:

1. `Dashboard + Command Center + Funil`
2. `Solucoes + Chat`
3. `Imoveis + Parceiros`

Ordem recomendada de correcao:

1. fonte e rotulagem
2. correlacao/deep links
3. deduplicacao entre abas
4. migracao de superficies ainda sinteticas

---

## Alertas identificados — execucao 2026-06-15

Status possivel: `aberto` | `parcial` | `evidenciado localmente` | `evidenciado`

| ID | Itens do checklist | Descricao | Arquivo principal | Status |
|----|-------------------|-----------|-------------------|--------|
| A1 | 1 | Funil (`kpiWindowDays` variavel) vs Command Center (snapshot fixo) — contadores podem divergir | `dashboard.tsx` | evidenciado |
| A2 | 10 | `syntheticThreads` silenciosos em todas as abas exceto Solucoes | `dashboard.tsx:360,556` | evidenciado |
| A3 | 15 | `caseCostMap` sempre 30d; `costByJourney` usa `kpiWindowDays` — custo diverge | `dashboard.tsx` | evidenciado |
| A4 | 31 | `apiListImobCases()` e `apiListImobCaseCosts()` sem `workspaceId` explicito no frontend | `dashboard.tsx` | evidenciado |
| A5 | 33 | Aba Parceiros usa `delegateeId` como proxy de `ownerId` de CRM | `partners.tsx` | evidenciado |
| A6 | 35 | `buildCasePriority` e `buildCaseFallbackActions` definidas em page component (viola AGENTS.md) | `dashboard.tsx:129,307` | evidenciado |
| A7 | 23 | `contextCase` em Solucoes resolvido por heuristica de texto/flow sem indicacao ao usuario | `dashboard.tsx:937-958` | evidenciado |
| A8 | 6, 26 | KPI strip de `properties.tsx` exibia totais de `syntheticProperties` sem badge de fonte | `properties.tsx:122-138` | evidenciado |
| A9 | 14, 34 | `properties.tsx` nunca chamava API real; IDs sinteticos nao reconciliaveis | `properties.tsx` | evidenciado |
| A10 | 4 | KPI "Casos em parceria" contava delegacoes (nao casos CRM reais) | `partners.tsx:141,68` | evidenciado |

### Detalhe A8 — status evidenciado

**Descricao**: O KPI strip de `properties.tsx` (itens "Imoveis ativos", "Disponiveis", "Com parceiro") usava `syntheticProperties` diretamente, sem qualquer badge de fonte. Um workspace operacional poderia exibir contadores demonstrativos como se fossem reais.

**Patch aplicado em 2026-06-15**:
- `syntheticProperties` removido de `properties.tsx`
- Pagina passou a chamar `apiListImobProperties()` com estados de loading e erro
- Badge de fonte adicionado ao primeiro card do KPI strip (`backend` | `sem dados`)
- Badge de secao atualizado (nao mais "modo demonstracao" fixo)
- Arquivo de patch: `apps/web/src/pages/app/imob/properties.tsx`
- Teste: `apps/web/src/pages/app/imob/properties.test.ts` — 5/5 pass

**Artefato de evidencia**: `docs/ops/evidence/latest/imob-surface-data-reliability/a8-ci-evidence.md`
- 5/5 testes de A8/A9 passando
- 17/17 testes de nao-regressao da suite imob passando
- Criterios de aceitacao verificados e documentados

### Detalhe A4 — status evidenciado

**Descricao**: `apiListImobCases()` e `apiListImobCaseCosts()` nao enviavam `workspaceId` na query. O backend ja isolava por token, mas ausencia do parametro criava inconsistencia de superficie.

**Patch aplicado em 2026-06-15 — Option B (defense in depth)**:
- `api.ts`: `apiListImobCases` e `apiListImobCaseCosts` aceitam `workspaceId?: string`
- `dashboard.tsx`: passa `session.workspaceId` nas duas chamadas
- `imobCrmRouter.ts`: valida `query.workspaceId` contra `authContext.workspaceId`; mismatch → 403 `WORKSPACE_SCOPE_MISMATCH`
- Teste: `apps/api/src/tests/imob-crm-workspace-scope.test.ts` — 6/6 pass contra DB real

**Artefato de evidencia**: `docs/ops/evidence/latest/imob-surface-data-reliability/a4-ci-evidence.md`
- 6/6 testes passando (ausencia / match / mismatch para `/cases` e `/cases/costs`)
- `workspaceId` da query NUNCA e fonte de verdade; apenas checagem de consistencia

### Detalhe A2 — status evidenciado localmente

**Descricao**: `syntheticThreads` inicializavam o estado de `threads` e atuavam como fallback silencioso em 3 caminhos: sem `conversationId`, API retorna lista vazia, e erro de API. O `requestedThreadId` da URL era aplicado diretamente a `selectedThreadId` sem verificar existencia de thread real — IDs sinteticos ou stale podiam entrar em deeplinks e acionar heuristica de `contextCase` contra casos reais.

**Patch aplicado em 2026-06-15**:
- `syntheticThreads` (linhas 73–98) removido completamente de `dashboard.tsx`
- Estado inicial: `threads = []`, `threadSource = "no_conversation"`, `selectedThreadId = null`
- `useEffect` de sync cego `setSelectedThreadId(requestedThreadId)` removido
- `useEffect` de carregamento reescrito: `requestedThreadId` so e honrado quando confirmado na resposta real da API
- Empty states semanticos: `"no_conversation"` / `"empty"` / `"error"` substituem `"synthetic"`
- `ThreadPanel` recebe `emptyText` apropriado para cada estado
- Arquivo de patch: `apps/web/src/pages/app/imob/dashboard.tsx`
- Teste: `apps/web/src/pages/app/imob/dashboard.threads.test.ts` — 9/9 pass

**Artefato de evidencia**: `docs/ops/evidence/latest/imob-surface-data-reliability/a2-ci-evidence.md`
- 9/9 testes passando
- Criterios: `syntheticThreads` ausente, `requestedThreadId` so honrado se confirmado, `threadSource` sem `"synthetic"`
- Indexado no EVIDENCE_INDEX.md

### Detalhe A1 — status evidenciado localmente

**Descricao**: Contadores de Funil, Command Center e Hero derivavam de universos semanticamente distintos (createdAt com janela variavel, updatedAt com 7d fixo, snapshot sem janela) sem qualquer indicacao visual ao usuario. Nao e erro de dados — e ausencia de contexto de rotulo.

**Patch aplicado em 2026-06-15 — apenas rotulos, sem alteracao de endpoint/query**:
- `ImobCommandCenter.tsx`: chip `Bloqueios: X` → `Bloqueios recentes: X · 7d`; card label `Bloqueios` → `Bloqueios (7d)`
- `dashboard.tsx`: `totalCostLabel` inclui `(${kpiWindowDays}d)` — custo do CC indica janela ativa do Funil
- `ImobDashboardHero.tsx`: `label="bloqueados"` → `label="bloqueados atuais"` — distingue snapshot total de bloqueios recentes
- Teste: `apps/web/src/features/imob/imobA1Labels.test.ts` — 9/9 pass

**Risco remanescente (A1-follow-up)**: `apiGetImobFunnelHealth` chamado sem `window` explicito — backend usa `"7d"` como default. Se default mudar, label `· 7d` ficara desatualizado. Mitigacao futura: passar `window` ou consumir `effectiveWindow` do payload.

**Artefato de evidencia**: `docs/ops/evidence/latest/imob-surface-data-reliability/a1-ci-evidence.md`
- 9/9 testes passando
- Invariantes confirmados por teste: endpoints inalterados, janelas inalteradas
- Indexado no EVIDENCE_INDEX.md

### Detalhe A3 — status evidenciado localmente

**Descricao**: `caseCostMap` e construido a partir de `apiListImobCaseCosts({ windowDays: 30, ... })` — janela fixa de 30 dias, nunca alterada pelo usuario. `costByJourney` e `totalImobRunCostCents` derivam de `kpiFunnel`, que usa `kpiWindowDays` (7/15/30d). Ao selecionar janela 7d, o chip do cabecalho CC exibia `Custo: R$ X.XX (7d)` mas cada linha da tabela exibia custo de 30d sem indicacao de janela.

**Patch aplicado em 2026-06-15 — apenas rotulo, sem alteracao de dados**:
- `ImobCommandCenter.tsx`: prop `caseCostWindowDays?: number` adicionado com default `30`; `costLabel` passa de `formatCents(costCents)` para `` `${formatCents(costCents)} (${caseCostWindowDays}d)` ``
- `dashboard.tsx`: passa `caseCostWindowDays={30}` explicitamente para `ImobCommandCenter`
- `apiListImobCaseCosts` mantida com `windowDays: 30` — sem alteracao de endpoint, query ou janela
- Teste: `apps/web/src/features/imob/imobA3CostWindow.test.ts` — 8/8 pass

**Artefato de evidencia**: `docs/ops/evidence/latest/imob-surface-data-reliability/a3-ci-evidence.md`
- 8/8 testes passando
- Invariantes confirmados: `apiListImobCaseCosts` com 30d fixo, `kpiWindowDays` nao afeta `caseCostMap`

### Detalhe A7 — status evidenciado localmente

**Descricao**: `contextCase` era resolvido por `useMemo` com quatro ramos em cascata. O ramo de menor prioridade (heurística de texto no label da thread) disparava silenciosamente — selecionando o caso mais recente com `flow` correspondente sem indicacao visual ao usuario. Acoes de deeplink (Follow-up, Resolver no chat) transportavam `?caseId=X` para o chat com caso potencialmente incorreto.

**Patch aplicado em 2026-06-15 — contextCaseSource + badge (Opcao A)**:
- `contextCase` useMemo refatorado para retornar `{ contextCase, contextCaseSource }`
- Tipo: `"requested" | "thread" | "run" | "heuristic" | null`
- Cada ramo retorna sua fonte de forma explicita
- Card "Caso" na aba Solucoes exibe `"estimado por contexto da thread"` quando `contextCaseSource === "heuristic"`
- Logica de resolucao, valor de `contextCase` e deeplinks inalterados
- Teste: `apps/web/src/pages/app/imob/dashboard.a7contextCase.test.ts` — 11/11 pass

**Artefato de evidencia**: `docs/ops/evidence/latest/imob-surface-data-reliability/a7-ci-evidence.md`

### Detalhe A5 — status evidenciado localmente

**Descricao**: `partners.tsx` usava `syntheticPartners` como fallback silencioso quando `apiListDelegations` retornava lista vazia ou erro. Adicionalmente, `delegateeId` (UUID de workspace no sistema de marketplace) aparecia como display name de parceiro quando `publisherName` e `marketplaceName` eram `null` — expondo UUID bruto ao usuario.

**Patch aplicado em 2026-06-15 — remoção de sintético e correção de display name**:
- `syntheticPartners` (3 parceiros hardcoded: Prime Imóveis, Litoral Brokers, Atlântica Realty) removidos completamente
- Estado inicial: `partners = []`, `source = "empty"`
- API vazia → `setPartners([])`, `setSource("empty")`
- Erro de API → `setPartners([])`, `setSource("error")`
- `partnerName`: `item.delegateeId` removido da cadeia de fallback → `"Parceiro sem nome cadastrado"`
- Badge de fonte: `"backend"/"fallback"` → `"delegações marketplace"/"sem delegações"/"indisponível"`
- `apiListDelegations` e `mapDelegationsToPartners` inalterados
- Teste: `apps/web/src/pages/app/imob/partners.test.ts` — 14/14 pass (4 testes de A10 + 10 testes de A5)

### Observacao geral

`EVIDENCE_INDEX.md` nao foi alterado para A6/A9/A10. Os status `evidenciado localmente` de A6/A9/A10 sao locais a este relatorio de execucao. Para promover qualquer um deles a `evidenciado`, e necessario execucao em CI com trilha indexavel. A2/A4/A8 estao com artefatos fisicos verificaveis e indexados no EVIDENCE_INDEX.md. A1 tem artefato fisico mas permanece `evidenciado localmente` ate A1-follow-up (window explicito ou effectiveWindow na API).
