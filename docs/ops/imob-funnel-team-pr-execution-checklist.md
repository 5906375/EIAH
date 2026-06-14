# IMOB Funnel Team PR Execution Checklist

Objetivo: acompanhar a execucao dos PRs da consolidacao da aba `equipe` dentro da aba `funil` no dashboard IMOB, preservando funcionalidades existentes, layout visual e responsivo.

Regra geral: **nenhuma nova regra de negocio nasce na UI. Corrigir semantica e proveniencia no backend antes da migracao visual.**

---

## Ordem Geral

```text
PR-IMOB-FUNNEL-TEAM-01 -> PR-IMOB-FUNNEL-TEAM-02 -> PR-IMOB-FUNNEL-TEAM-03
```

Rationale da ordem:

- `PR-01` vem primeiro porque a aba `equipe` atual ainda mistura dado primario, derivado e sintetico
- `PR-02` so deve abrir depois que a base de dados da equipe estiver semanticamente corrigida
- `PR-03` so deve abrir quando todo conteudo util de `equipe` ja estiver acessivel dentro de `funil`

Sequencia segura agora:

1. corrigir confiabilidade dos dados da aba `equipe`
2. migrar os blocos uteis para a secao `Equipe no Funil`
3. remover a aba `Equipe` da navegacao principal
4. normalizar o legado `tab=equipe`
5. atualizar evidencia apenas depois de implementacao real

---

## Escopo Real no Codigo

Validacoes importantes antes de executar os PRs:

- [x] nao existe rota propria de pagina `Equipe`
- [x] existe uma unica rota de dashboard IMOB em `apps/web/src/App.tsx`
- [x] `Equipe` hoje e uma aba do dashboard, controlada por `tab=equipe`
- [x] `Funil` e `Equipe` compartilham a mesma pagina `apps/web/src/pages/app/imob/dashboard.tsx`
- [x] a navegacao primaria da tela vive em `apps/web/src/features/imob/ImobDashboardHero.tsx`

Implicacao pratica:

- este checklist trata de remover a aba `Equipe`, nao uma pagina isolada
- o legado a compatibilizar e `tab=equipe`, nao uma rota `/app/imob/equipe`

---

## Classificacao Atual dos Blocos

- [x] `Approvals contextuais` = `primary`
- [x] `Carga por specialist` = `derived`
- [x] `Indice de resgate` = `derived`
- [x] `Performance de corretores` atual = `derived`
- [x] fallback de threads = `synthetic`
- [x] fallback de telemetria = `synthetic`
- [x] ausencia de base suficiente deve ser `unavailable`

Regra de exibicao:

- [ ] nenhum dado `synthetic` pode parecer dado `primary`
- [ ] nenhum bloco `derived` pode ser rotulado como se fosse fonte final
- [x] `askingPriceCents` nao pode aparecer como receita real

---

## PR-IMOB-FUNNEL-TEAM-01 — Corrigir confiabilidade dos dados de Equipe

Objetivo: corrigir semantica, proveniencia e labels dos blocos da aba `equipe` antes da migracao visual.

Status da rodada atual:

- [x] resolver canonico inicial de broker criado
- [x] ranking removido do bucket `Corretor nao atribuido`
- [x] `windowDays` dinamico propagado para `ImobBrokerChart`
- [x] `metricSource` inicial propagado no KPI de performance
- [x] `receita` renomeada na superficie para `valor anunciado estimado`
- [x] fallback silencioso de telemetria removido
- [x] timeline sintetica sinalizada na superficie

### Backend / contrato

#### `apps/api/src/services/imob/crm/imobCrmKpiService.ts`

Remocoes:

- [x] remover agrupamento final baseado diretamente em `ownerResponsible` como corretor canonico

Adicoes:

- [x] introduzir resolucao canonica de corretor/broker
- [x] separar casos sem atribuicao em bucket proprio
- [x] renomear metrica financeira derivada para semantica correta
- [x] propagar `windowDays` real no contrato de performance
- [x] incluir `metricSource` e/ou `assignmentSource`

Ordem de edicao:

- [x] criar criterio de broker canonico
- [x] separar `unassigned`
- [x] ajustar ranking
- [x] ajustar label financeiro derivado
- [x] propagar metadados de proveniencia

#### `apps/api/src/services/imob/crm/imobBrokerAssignmentResolver.ts`

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] criar resolver canonico de corretor
- [x] distinguir corretor real de `founder`, `captacao`, `comercial` e vazio
- [x] expor source da atribuicao

Ordem de edicao:

- [x] definir normalizacao
- [x] definir allowlist/heuristica canonica
- [x] expor retorno com source

#### `apps/api/src/routes/imobCrmRouter.ts`

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [ ] expor no payload os novos metadados de proveniencia quando aplicavel
- [ ] manter compatibilidade do contrato atual onde possivel

Ordem de edicao:

- [ ] alinhar payload de performance
- [ ] alinhar payload de executive/team read
- [ ] validar `workspaceId`/`tenantId` fail-closed

### Frontend / superficie atual

#### `apps/web/src/features/imob/charts/ImobBrokerChart.tsx`

Remocoes:

- [x] remover label hardcoded `30 dias`
- [x] remover uso de `receita` como nome para valor derivado de anuncio

Adicoes:

- [x] receber `windowDays` dinamico
- [x] exibir label coerente para valor derivado
- [x] exibir estado de proveniencia quando necessario
- [x] tratar `nao atribuido` fora do ranking principal

Ordem de edicao:

- [x] receber prop `windowDays`
- [x] ajustar titulo/subtitulo
- [x] ajustar colunas da tabela
- [x] tratar bucket de pendencia

#### `apps/web/src/pages/app/imob/dashboard.tsx`

Remocoes:

- [x] remover fallback demo silencioso de telemetria
- [x] reduzir dependencia de threads sinteticas sem sinalizacao

Adicoes:

- [x] sinalizar `synthetic` quando fallback for inevitavel
- [x] tratar `unavailable` quando nao houver base suficiente
- [x] propagar `windowDays` real para os cards de equipe

Ordem de edicao:

- [x] revisar `metricSource`
- [x] revisar `syntheticThreads`
- [x] revisar fallback de telemetria
- [x] propagar `windowDays`

### Testes minimos

- [ ] teste de broker canonico sem uso cru de `ownerResponsible`
- [x] teste de `Corretor nao atribuido` fora do ranking
- [x] teste de `windowDays` dinamico no `ImobBrokerChart`
- [x] teste de label financeiro derivado
- [ ] teste de fallback `synthetic` removido ou sinalizado

### Criterios de aceite

- [x] `ownerResponsible` deixa de ser a semantica final de corretor na superficie
- [x] `Corretor nao atribuido` vira pendencia operacional
- [x] `30 dias` deixa de ser fixo
- [x] `askingPriceCents` nao e mostrado como receita real
- [x] nenhum fallback demo permanece silencioso

---

## PR-IMOB-FUNNEL-TEAM-02 — Criar secao Equipe dentro do Funil

Objetivo: migrar os blocos uteis da aba `equipe` para dentro da aba `funil`, em uma secao operacional dedicada.

Status da rodada atual:

- [x] secao composicional `Equipe no Funil` criada
- [x] composicao reutilizada entre `funil` e `equipe`
- [x] `ImobBrokerChart`, `ImobSpecialistLoadBoard`, `ImobRescueIndex` e `ImobApprovalContextCard` migrados para a nova secao
- [x] telemetria operacional compacta incluida na secao sem valores sintéticos
- [x] ancora `#equipe` preparada para compatibilidade futura

### Novo componente sugerido

#### `apps/web/src/features/imob/funnel/ImobFunnelTeamSection.tsx`

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] criar secao `Equipe no Funil`
- [x] compor performance de corretores
- [x] compor pendencias sem corretor atribuido
- [x] compor carga por specialist
- [x] compor approvals contextuais
- [x] compor indice de resgate
- [x] compor telemetria operacional quando houver base valida

Ordem de edicao:

- [x] criar estrutura da secao
- [x] receber props do funil
- [x] montar composicao dos cards
- [ ] validar comportamento responsivo

### Integracao na pagina

#### `apps/web/src/pages/app/imob/dashboard.tsx`

Remocoes:

- [ ] nenhuma obrigatoria nesta fase

Adicoes:

- [x] renderizar a secao dentro de `activeTab === "funil"`
- [x] manter a aba `equipe` ainda funcional durante a transicao
- [x] evitar duplicacao de regra heuristica no frontend

Ordem de edicao:

- [x] inserir secao no fluxo do `funil`
- [x] passar dados reaproveitados
- [ ] evitar regressao de ordenacao/scroll

### Componentes reaproveitados

- [x] `apps/web/src/features/imob/ImobSpecialistLoadBoard.tsx`
- [x] `apps/web/src/features/imob/ImobRescueIndex.tsx`
- [x] `apps/web/src/features/imob/ImobApprovalContextCard.tsx`
- [x] `apps/web/src/features/imob/charts/ImobBrokerChart.tsx`

### Testes minimos

- [x] render da secao `Equipe no Funil`
- [x] todos os blocos uteis da aba `equipe` aparecem em `funil`
- [ ] responsividade da secao preservada
- [ ] regressao de navegacao da aba `funil`

### Criterios de aceite

- [x] usuario consegue ler funil + equipe sem sair de `funil`
- [x] cards migrados preservam funcionalidade
- [ ] layout visual e responsividade permanecem coerentes
- [x] nao ha duplicacao de regra de negocio na UI

---

## PR-IMOB-FUNNEL-TEAM-03 — Remover aba Equipe e normalizar legado

Objetivo: encerrar a aba `equipe` como entrada principal do dashboard, mantendo compatibilidade com o legado.

### Navegacao / dashboard

#### `apps/web/src/features/imob/ImobDashboardHero.tsx`

Remocoes:

- [x] remover item `Equipe` da navegacao principal

Adicoes:

- [x] manter `Funil`, `Command Center` e demais abas sem regressao

Ordem de edicao:

- [x] ajustar `ANALYTICS_TABS`
- [x] validar estilo ativo/inativo

#### `apps/web/src/pages/app/imob/dashboard.tsx`

Remocoes:

- [x] remover render principal de `activeTab === "equipe"`

Adicoes:

- [x] normalizar `tab=equipe` para `tab=funil`
- [x] opcionalmente apontar para ancora `#equipe`
- [x] garantir que nenhum bloco util fique orfao

Ordem de edicao:

- [x] revisar parser de `searchParams`
- [x] revisar `activeTab`
- [x] revisar CTA/links legados
- [x] validar anchors e scroll

### Testes minimos

- [x] `tab=equipe` cai em `funil`
- [x] navegacao nao mostra mais `Equipe`
- [x] secao `#equipe` continua acessivel
- [x] nenhum bloco da antiga aba some sem substituto
- [x] telemetria operacional deixa de aparecer duplicada entre `funil` e `solucoes`

### Criterios de aceite

- [x] aba `Equipe` some da navegacao principal
- [x] conteudo util continua acessivel dentro de `Funil`
- [x] compatibilidade com legado `tab=equipe` esta preservada
- [x] nao ha regressao visual ou responsiva relevante
- [x] nao resta duplicacao residual do bloco de equipe entre abas

---

## Checklist de Governanca

- [ ] sem nova regra no launcher
- [ ] sem inferencia final de broker na UI
- [ ] `tenantId` preservado
- [ ] `workspaceId` preservado
- [ ] `fail-closed` em escopo invalido
- [ ] nenhum dado `synthetic` parece `primary`
- [ ] nenhum valor anunciado e chamado de receita real

---

## Evidencias Requeridas

Preencher apenas quando houver implementacao real:

- [ ] diff/arquivo real de `imobCrmKpiService.ts`
- [ ] diff/arquivo real de resolver canonico de broker
- [ ] diff/arquivo real de `ImobBrokerChart.tsx`
- [ ] diff/arquivo real da nova secao `Equipe no Funil`
- [ ] print/validacao da aba `funil` com secao nova
- [ ] validacao do legado `tab=equipe`
- [ ] testes atualizados cobrindo broker, secao e compatibilidade

---

## Status Atual da Frente

- [x] plano arquitetural revisado contra o codigo atual
- [x] nomenclatura corrigida: trata-se de remover a aba `equipe`, nao uma pagina isolada
- [x] `PR-IMOB-FUNNEL-TEAM-01` implementado no escopo minimo
- [x] `PR-IMOB-FUNNEL-TEAM-02` implementado no escopo minimo
- [x] `PR-IMOB-FUNNEL-TEAM-03` implementado no escopo minimo

Proximo passo explicito:

1. validar a navegacao do dashboard com `tab=funil` e legado `tab=equipe`
2. revisar se ainda existe link antigo externo apontando para `tab=equipe`
3. abrir a proxima frente do checklist de funil/equipe apenas se surgir novo delta funcional
