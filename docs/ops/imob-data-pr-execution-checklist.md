# IMOB Data PR Execution Checklist

Objetivo: acompanhar a execucao dos PRs `PR-IMOB-DATA-01`, `PR-IMOB-DATA-02` e `PR-IMOB-DATA-03`, incluindo a Etapa 8 (IMOB-first, multi-vertical compatible).

Regra geral: **alteracoes somente com permissao explicita. Manter funcionalidades existentes, layout visual e responsivo.**

---

## Ordem Geral

```
Diagnostico tenant-scoped (queries read-only)
  ↓
ReasonCodes — INVALID_ACTION_TYPE, CASE_TRANSITION_EVENT_REQUIRED, CASE_RESPONSIBLE_REQUIRED
  ↓
PR-IMOB-DATA-03 Camada 2  ← shadow runtime ja tem o dado
  ↓
PR-IMOB-DATA-01 Frente B  ← corrigir na fonte dos runs (estrutural)
  ↓
PR-IMOB-DATA-02 Opcao A   ← hotfix duracao com durationSource
  ↓
PR-IMOB-DATA-01 Frente A  ← mapa legado/historico apenas
  ↓
PR-IMOB-DATA-02 Opcao B   ← evento explicito de closing (definitivo)
  ↓
PR-IMOB-DATA-03 Camadas 1 e 3  ← mais invasivas
  ↓
Etapa 8 Trilha A — P0 IMOB-first  ← bloquear terminal sem owner
  ↓
Etapa 8 Trilha B — Plataforma multi-vertical  ← milestone posterior
```

Rationale da ordem:

- **Frente B antes de Frente A**: corrigir a fonte impede que novos runs entrem como "Outros"; expandir o mapa depois e trabalho de compatibilidade historica
- **DATA-02 Opcao A antes da Frente A**: hotfix de duracao nao depende do mapa normalizado
- **DATA-02 Opcao B depois**: requer mudanca no fluxo de transicao, e a correcao definitiva
- **DATA-03 Camadas 1 e 3 por ultimo**: mais invasivas, dependem das camadas anteriores estabilizadas

Sequencia segura agora:

1. manter este checklist consolidado como artefato de execucao
2. preservar fechadas as frentes `DATA-01`, `DATA-02`, `DATA-03` minimo e `Trilha A`
3. tratar `Camada 3` apenas se a prioridade for KPI historico/broker
4. manter `Trilha B` separada como milestone de plataforma
5. evitar reabrir itens ja evidenciados no `Evidence Index`

---

## Pendentes Reais

- [x] rodar queries de diagnostico e documentar resultado
- [x] preparar queries tenant-scoped com valores reais do ambiente
- [x] PR-IMOB-DATA-02: corrigir calculo de duracao 0.0h
- [x] PR-IMOB-DATA-01: expandir mapa de normalizacao (frente A)
- [x] PR-IMOB-DATA-01: corrigir request.action na fonte dos runs (frente B)
- [x] PR-IMOB-DATA-03: shadow runtime passa owner quando disponivel (camada 2)
- [x] PR-IMOB-DATA-03: bloquear transicao terminal sem ownerResponsible (camada 1)
- [ ] PR-IMOB-DATA-03: fallback por especialista do run recente (camada 3, adiado por decisao de escopo)
- [x] Etapa 8 Trilha A: mutation assignOwnerToCase / assignResponsibleActor
- [x] Etapa 8 Trilha A: reasonCodes catalogados (CASE_RESPONSIBLE_REQUIRED, CASE_OWNER_ASSIGNMENT_FORBIDDEN, MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE, INVALID_ACTION_TYPE, CASE_TRANSITION_EVENT_REQUIRED)
- [x] Etapa 8 Trilha A: evidencia (`ops/evidence/latest/imob-owner-assignment-mutation-2026-06-13.md`)
- [x] Etapa 8 Trilha B: auditoria Prisma schema
- [x] Etapa 8 Trilha B: documentar billing sync strategy
- [x] Etapa 8 Trilha B: documentar policyVersion lifecycle
- [x] Etapa 8 Trilha B: propor delta minimo de schema/contrato

Proximo passo explicito:

1. seguir na `Trilha B` como frente unica de governanca multi-vertical
2. manter `Camada 3` fora do escopo desta rodada
3. executar primeiro auditoria e documentacao, sem migration ou mudanca de runtime
4. so abrir implementacao depois de fechar o plano enxuto abaixo

## Estado Atual do Diagnostico

Validacoes tecnicas ja confirmadas no codigo/schema:

- [x] `Run` possui `tenantId`, `workspaceId`, `caseId` e `threadId`
- [x] `ImobCase` possui `tenantId`, `workspaceId`, `threadId` e `ownerResponsible`
- [x] `ImobCaseEvent` possui `caseId`, `tenantId`, `workspaceId` e `stage`
- [x] Query 1 pode rodar direto em `Run` sem join obrigatorio
- [x] Query 2 deve usar join escopado por tenant/workspace em `ImobCaseEvent`
- [x] Query 3 esta valida para medir `ownerResponsible` nulo em casos terminais

Escopo operacional acordado para a rodada read-only:

- `tenantId = eiah-admin`
- `workspaceId = cmll3mkvq0000simij3y60se9`

Status da rodada:

- [x] leitura tecnica esperada das Queries 1, 2 e 3 documentada
- [x] grade de decisao query -> acao de codigo -> arquivo a mexer definida
- [x] execucao read-only das queries concluida
- [x] documentacao inicial dos resultados no checklist registrada

Resultado observado na rodada read-only:

- [x] Query 1 executada com schema fisico real (`runs`) e mostrou `request.action` vazio em 178 runs vinculados; distribuicao observada: `EIAH` = 120, `fin-nexus` = 53, `J_360` = 5
- [x] Query 2 executada com schema fisico real (`imob_cases`, `imob_case_events`) e retornou `0 rows`
- [x] Query 3 executada com schema fisico real (`imob_cases`) e retornou `0 rows`
- [x] leitura complementar confirmou que, neste escopo, ainda nao existem casos terminais: apenas `pending_data` (119) e `ready_for_review` (68)
- [x] distribuicao por flow/stage/status confirma uso de flows canonicos em `imob_cases.flow`, embora `runs.request.action` permaneça vazio
- [x] snapshot comparativo do KPI apos o patch mostrou queda do bucket `Outros`: baseline antigo = `178` runs em `Outros`; classificacao intermediaria = `21` runs em `Outros`
- [x] classificacao intermediaria observada: `Captacao = 83`, `Ajustes = 50`, `Qualificacao = 18`, `Comissao = 3`, `Varredura de mercado = 3`, `Outros = 21`
- [x] analise dos 21 remanescentes mostrou `21 aliases validos` e `0 runs realmente nao classificaveis`
- [x] snapshot final apos ampliar aliases reais confirmou `Outros = 0`
- [x] distribuicao final observada no escopo: `Captacao = 120`, `Ajustes = 50`, `Contrato = 5`, `Comissao = 3`, `Outros = 0`
- [x] diagnostico controlado para DATA-02 encontrou `2` casos terminais reais fora do workspace principal: `status = success`, `stage = settled`, `flow = commission.settle`
- [x] nesses `2` casos, `updated_at == created_at` e `hours_updated_vs_created = 0.0h`
- [x] existe evento real posterior em `imob_case_events`: `type = commission.settlement.completed`, poucos milissegundos apos `created_at`
- [x] conclusao controlada: a Opcao A (`updated_at_proxy`) nao resolve esses casos; a evidência atual favorece fonte de evento terminal real
- [x] rerodada da Query 3 no escopo terminal ampliado (`status in done/closing/completed/success` ou `stage in closing/settled`) retornou `0` casos terminais sem `ownerResponsible`
- [x] agregacao terminal atual: `2` casos `success/settled`, `0` com owner ausente

---

## Diagnostico (read-only, sem risco)

Rodar antes de qualquer alteracao de codigo. Documentar resultado para informar as frentes A e B do DATA-01.

Todas as queries devem ser escopadas por `tenantId` e `workspaceId`. Query sem escopo tenant/workspace nao e aprovada.

Substituir `'<tenant-id>'` e `'<workspace-id>'` pelos valores reais do ambiente antes de executar.

Valores validados para esta rodada:

- `tenantId = 'eiah-admin'`
- `workspaceId = 'cmll3mkvq0000simij3y60se9'`

### Query 1 — Mapear actions e agents reais dos runs vinculados

```sql
SELECT DISTINCT
  r.agent,
  r.request->>'action' AS action,
  COUNT(*) OVER (PARTITION BY r.agent, r.request->>'action') AS occurrences
FROM "Run" r
WHERE r."tenantId" = '<tenant-id>'
  AND r."workspaceId" = '<workspace-id>'
  AND (r."caseId" IS NOT NULL OR r."threadId" IS NOT NULL)
ORDER BY r.agent, action;
```

Objetivo: saber exatamente quais valores de `agent` e `request.action` existem para decidir o mapa de normalizacao. Se `Run` nao tiver `tenantId`/`workspaceId` diretamente, documentar duas rotas:

- join por `ImobCase` quando houver `caseId`;
- join por `Thread` ou equivalente quando houver apenas `threadId`.

Rota 1 — via `ImobCase`:

```sql
SELECT DISTINCT
  r.agent,
  r.request->>'action' AS action,
  COUNT(*) OVER (PARTITION BY r.agent, r.request->>'action') AS occurrences
FROM "Run" r
JOIN "ImobCase" c ON c.id = r."caseId"
WHERE c."tenantId" = '<tenant-id>'
  AND c."workspaceId" = '<workspace-id>'
ORDER BY r.agent, action;
```

Rota 2 — via `Thread` ou equivalente:

```sql
-- usar apenas se existir tabela/thread store com tenant/workspace e chave ligavel a Run.threadId
SELECT DISTINCT
  r.agent,
  r.request->>'action' AS action,
  COUNT(*) OVER (PARTITION BY r.agent, r.request->>'action') AS occurrences
FROM "Run" r
JOIN "Thread" t ON t.id = r."threadId"
WHERE t."tenantId" = '<tenant-id>'
  AND t."workspaceId" = '<workspace-id>'
ORDER BY r.agent, action;
```

Se nao existir tabela de thread com escopo tenant/workspace, declarar explicitamente a limitacao da query e nao inferir cobertura total dos runs com apenas `threadId`.

### Query 2 — Diagnostico de duracao zero

```sql
SELECT
  c.id,
  c."createdAt",
  c."updatedAt",
  c.status,
  MIN(e."createdAt") AS first_closing_event,
  EXTRACT(EPOCH FROM (c."updatedAt" - c."createdAt")) / 3600.0 AS hours_updated_vs_created
FROM "ImobCase" c
LEFT JOIN "ImobCaseEvent" e ON e."caseId" = c.id AND e.stage = 'closing'
WHERE c."tenantId" = '<tenant-id>'
  AND c."workspaceId" = '<workspace-id>'
  AND c.status IN ('done', 'closing', 'completed')
GROUP BY c.id, c."createdAt", c."updatedAt", c.status
ORDER BY c."createdAt" DESC
LIMIT 20;
```

Se `ImobCaseEvent` tiver `tenantId`/`workspaceId`, usar o join escopado:

```sql
LEFT JOIN "ImobCaseEvent" e
  ON e."caseId" = c.id
 AND e."tenantId" = c."tenantId"
 AND e."workspaceId" = c."workspaceId"
 AND e.stage = 'closing'
```

Objetivo: confirmar se o problema e timestamp identico ou diferenca de milissegundos, e se `updatedAt` pode ser usado como proxy confiavel.

### Query 3 — Diagnostico de ownerResponsible nulo em casos terminais

```sql
SELECT
  c.id,
  c.status,
  c."ownerResponsible",
  c."specialistId",
  c."createdAt",
  c."updatedAt"
FROM "ImobCase" c
WHERE c."tenantId" = '<tenant-id>'
  AND c."workspaceId" = '<workspace-id>'
  AND c.status IN ('done', 'closing', 'completed')
  AND (c."ownerResponsible" IS NULL OR c."ownerResponsible" = '')
ORDER BY c."createdAt" DESC
LIMIT 30;
```

Objetivo: dimensionar o problema de `ownerResponsible` nulo antes de corrigir.

---

## PR-IMOB-DATA-01 — Mapear e corrigir request.action nos runs

Problema confirmado: `resolveRunJourneyLabel()` em `imobCrmKpiService.ts:145` tenta `request.action` primeiro, depois cai em `agent`. O campo `agent` contem nomes como `"imob-shadow-runtime"`, `"fin-nexus"`, `"J_360"` — nenhum bate com o mapa de jornadas. Resultado: 161/194 runs vao para `"Outros"`.

**Dependencia: requer resultado da Query 1 para fechar o mapa com seguranca. A estrutura de validacao pode comecar antes com allowlist inicial conservadora.**

Implementado localmente nesta fase:

- `apps/api/src/services/imob/control/imobRunActionCatalog.ts` criado com mapa canonico inicial + aliases conhecidos
- `apps/api/src/services/runs.ts` passa a normalizar `request.action` antes de persistir
- `apps/api/src/routes/agents.ts` aplica modo estrito para `domain=imob` no execute protocolado
- `apps/api/src/routes/agents.ts` preserva `request.action` canonico ao atualizar `request` com `intentSignature`
- `apps/api/src/routes/shadow-executions.ts` aplica modo estrito no preview/promote quando `domain=imob`
- `apps/api/src/routes/runs.ts` aplica modo estrito apenas no subfluxo `domain=imob + metadata.action presente`
- `apps/api/src/services/imob/crm/imobCrmKpiService.ts` passa a ler `metadata.action` e `case.flow` quando `request.action` vier ausente
- hardening de recursos de teste aplicado para destravar open handles:
  - `packages/core/src/events/redisPublisher.ts` e `packages/core/src/events/runEventPublisher.js` agora usam lazy init
  - `packages/core/src/queue/runAtivoUniversalQueue.ts` e `runAtivoUniversalDLQ.ts` deixaram de abrir BullMQ no import
  - `packages/db/src/client.ts` usa `allowExitOnIdle: true` no `pg.Pool`
  - `apps/api/src/tests/support/httpContractCleanup.ts` criado para destruir sockets residuais de Postgres/Redis em contract tests HTTP
- evidencia verde obtida para os testes de rota da Frente B e para o interop route contract usado no mesmo bootstrap

### Frente B — Corrigir na fonte dos runs (estrutural — executar primeiro)

**Frente B e a correcao estrutural. Frente A e compatibilidade historica/legada. Executar nesta ordem.**

Novos runs criados sem `request.action` valido devem ser bloqueados com `INVALID_ACTION_TYPE` na camada de criacao.

#### [apps/api/src/services/imob/control/imobRunActionCatalog.ts](../../apps/api/src/services/imob/control/imobRunActionCatalog.ts)

Remocoes:

- [x] nenhuma obrigatoria

Adicoes:

- [x] criar mapa canonico inicial de `request.action`
- [x] normalizar aliases conhecidos para flows IMOB canonicos
- [x] expor erro estruturado `INVALID_ACTION_TYPE`
- [x] permitir excecao explicita para `conversation_audit`

#### [apps/api/src/services/runs.ts](../../apps/api/src/services/runs.ts)

Remocoes:

- [x] nenhuma obrigatoria

Adicoes:

- [x] garantir que `request.action` seja validado contra o mapa canonico no momento da criacao do run
- [x] retornar `INVALID_ACTION_TYPE` se o valor for desconhecido e nao normalizavel
- [x] nao depender de `agent` como fallback semantico para novos runs
- [x] normalizar `request.action` para valor canonico antes de persistir

Ordem de edicao:

- [x] localizar ponto de criacao do run record
- [x] adicionar validacao de `request.action` contra o mapa canonico
- [x] adicionar retorno de `INVALID_ACTION_TYPE` para valores fora do mapa
- [x] revisar call site protocolado que apagava `request.action` apos a criacao do run (`agents.ts`)
- [x] revisar call sites residuais que continuam fail-open por compatibilidade (`POST /runs` generico) — mantido fora do fechamento minimo; sem acao obrigatoria adicional nesta frente

#### [apps/api/src/routes/agents.ts](../../apps/api/src/routes/agents.ts)

- [x] aplicar modo estrito para `domain=imob` no execute protocolado
- [x] retornar `400` com `INVALID_ACTION_TYPE` no contrato HTTP

#### [apps/api/src/routes/shadow-executions.ts](../../apps/api/src/routes/shadow-executions.ts)

- [x] validar preview IMOB antes de persistir snapshot
- [x] aplicar modo estrito na promocao para producao quando `domain=imob`
- [x] retornar `400` com `INVALID_ACTION_TYPE` no contrato HTTP

#### [apps/api/src/routes/runs.ts](../../apps/api/src/routes/runs.ts)

- [x] aplicar validacao cedo apenas para `domain=imob + metadata.action presente`
- [x] manter `POST /runs` fail-open para payload generico
- [x] avaliar endurecimento adicional para outros subfluxos IMOB apos Query 1 — adiado sem bloquear o fechamento minimo validado

#### Testes

- [x] `apps/api/src/tests/imobRunActionCatalog.test.ts` adicionado e verde local
- [x] `apps/api/src/tests/shadow-executions.contract.test.ts` adicionado
- [x] `apps/api/src/tests/runs.imob-action.contract.test.ts` adicionado
- [x] evidenciar verde confiavel dos contract tests de rota
- [x] `apps/api/src/tests/agents.interop.contract.test.ts` estabilizado com teardown dedicado do processo de teste

Evidencia local desta fase:

- `node --test --import tsx apps/api/src/tests/shadow-executions.contract.test.ts` → `EXIT:0`
- `node --test --import tsx apps/api/src/tests/agents.interop.contract.test.ts` → `EXIT:0`
- `node --test --import tsx apps/api/src/tests/imob-crm-kpi-service.test.ts` → `EXIT:0`
- `node --test --import tsx apps/api/src/tests/imobRunActionCatalog.test.ts` → `EXIT:0`

Observacao desta rodada:

- `node --test --import tsx apps/api/src/tests/runs.imob-action.contract.test.ts` ficou pendente em teardown nesta execucao e foi interrompido sem sinal de falha funcional do patch; a evidencia desse contrato precisa ser reemitida em rodada dedicada

### Frente A — Expandir o mapa em imobCrmKpiService.ts (legado/historico)

#### [apps/api/src/services/imob/crm/imobCrmKpiService.ts](../../apps/api/src/services/imob/crm/imobCrmKpiService.ts)

Remocoes:

- [x] nenhuma obrigatoria nesta frente

Adicoes:

- [x] adicionar patterns reais encontrados na Query 1 ao mapa de `resolveRunJourneyLabel()` (`metadata.action`)
- [x] adicionar logica de inferencia por `caseId + flow` quando `request.action` ausente (agentes como `"imob-shadow-runtime"` detectados pelo caso vinculado)
- [x] garantir que o bucket `"Outros"` nao captura runs classificaveis por `metadata.action` ou `case.flow`

Ordem de edicao:

- [x] aguardar resultado da Query 1
- [x] atualizar mapa com patterns confirmados
- [x] testar normalizacao para cada pattern novo
- [x] revisar tamanho do bucket "Outros" apos expansao com novo snapshot

Mapa minimo acordado (antes da Query 1):

```
realestate.owner.create, owner.create, property.create  → "Captacao"
lead.qualify, realestate.lead.qualify                   → "Qualificacao"
visit.schedule                                          → "Visita"
proposal.create                                         → "Proposta"
documents.collect                                       → "Documentacao"
contract.prepare                                        → "Contrato"
commission.settle                                       → "Comissao"
nao reconhecido                                         → "Outros"
```

### Saida esperada

- [x] `costByJourney` refletir a origem real do custo, nao apenas o bucket `"Outros"`
- [x] bucket `"Outros"` conter apenas runs genuinamente nao classificaveis no escopo validado (`0` remanescentes)
- [x] cobertura visivel no card de custo por jornada

---

## PR-IMOB-DATA-02 — Corrigir calculo de duracao 0.0h

Problema confirmado: `hoursBetween(closeAt, openAt)` em `imobCrmKpiService.ts:338`. O `closeAt` vem de `firstEventByCaseStage.get('${caseId}:closing')` — que usa `case.updatedAt` ou `event.createdAt`. Quando o caso e criado e fechado na mesma sessao/transacao, os timestamps sao iguais ou diferem por milissegundos.

**Dependencia: rodar Query 2 antes de escolher opcao de correcao.**

### Opcoes de correcao

| Opcao | Descricao | Status |
|---|---|---|
| A — updatedAt como proxy | Se `status = closing/done` e `updatedAt > createdAt`, usar diferenca com `durationSource: "updated_at_proxy"` | **Parcial / insuficiente** — nao resolve os casos `success/settled` observados |
| B — Evento explicito de closing | Criar `ImobCaseEvent` terminal com timestamp real, idempotente e transacional, na transicao de status | **Implementado no corte minimo via `case.completed`; refinamento de nomenclatura/estagio ainda possivel** |
| C — Threshold minimo | ~~Reportar duracao apenas quando closeAt - openAt >= 1 hora~~ | **Rejeitada** — threshold mascara dado ruim sem corrigir |

Opcao C rejeitada. Motivo: esconde o problema de timestamps identicos sem corrigir a causa. Usar `durationSource` para indicar confiabilidade e `coverage.durationSampleSize` para excluir casos invalidos do calculo de media.

### [apps/api/src/services/imob/crm/imobCrmKpiService.ts](../../apps/api/src/services/imob/crm/imobCrmKpiService.ts)

Remocoes:

- [x] nenhuma obrigatoria

Adicoes:

- [x] adicionar logica de `durationSource` para distinguir entre: timestamp de evento e updatedAt proxy
- [x] adicionar `coverage.durationSampleSize` ja existente para excluir casos com duracao invalida do calculo de media
- [x] usar `updatedAt - createdAt` apenas como fallback secundario quando evento terminal ausente e `updatedAt > createdAt`
- [x] Opcao C rejeitada: nao implementar threshold minimo

Ordem de edicao:

- [x] aguardar resultado da Query 2
- [x] decidir entre Opcao A temporaria e Opcao B definitiva; Opcao C permanece rejeitada
- [x] implementar logica de source typing
- [x] ajustar `coverage.durationSampleSize` para refletir apenas casos com duracao confiavel
- [x] revisar card "Ciclo operacional" no dashboard

### Saida esperada

- [x] card de ciclo operacional nao exibir `0.0h` quando base e insuficiente no payload do KPI (`averageDurationHours = null`)
- [x] media de duracao calculada apenas sobre casos com base confiavel
- [x] `coverage.durationSampleSize` indicando quantos casos entraram no calculo

---

## PR-IMOB-DATA-03 — Preencher ownerResponsible automaticamente

Problema confirmado: `ownerResponsible` so e preenchido via:

- `upsertCaseFromResolvedTurn()` linha ~1070 — apenas quando a conversa AI resolve um turno
- `createCase()` linha ~630 — apenas se passado explicitamente no input
- `updateCase()` linha ~713 — apenas se passado explicitamente

Fluxo atual sem atribuicao:

```
Run criado → Case atualizado para closing → ownerResponsible ainda null
→ broker KPI: "Corretor nao atribuido"
```

### Camada 1 — Bloquear transicao terminal sem owner

#### [apps/api/src/services/imob/crm/imobCrmMutationService.ts](../../apps/api/src/services/imob/crm/imobCrmMutationService.ts)

Remocoes:

- [x] nenhuma obrigatoria

Adicoes:

- [x] se `status` muda para estado terminal e `ownerResponsible` esta null, tentar fontes confiaveis em ordem
- [x] se nenhuma fonte disponivel, retornar `CASE_RESPONSIBLE_REQUIRED` com `nextAction = ASSIGN_RESPONSIBLE_MANUALLY`
- [x] nao usar `specialistId` por padrao como fallback automatico

Fontes confiaveis em ordem de prioridade:

```
1. case.ownerResponsible ja salvo
2. input.ownerResponsible explicitamente fornecido
3. shadowRuntime.ownerResponsible se disponivel na chamada
4. → CASE_RESPONSIBLE_REQUIRED se nenhuma fonte disponivel
```

Ordem de edicao:

- [x] localizar ponto de transicao de status em `updateCase()`
- [x] adicionar verificacao de owner antes de permitir terminal
- [x] retornar erro estruturado com `CASE_RESPONSIBLE_REQUIRED`
- [x] nao quebrar casos que ja tem owner

### Camada 2 — Shadow runtime passa owner

#### [apps/api/src/services/imob/imobShadowRuntime.ts](../../apps/api/src/services/imob/imobShadowRuntime.ts)

O runtime ja captura `ownerResponsible` na assinatura.

Remocoes:

- [x] nenhuma obrigatoria

Adicoes:

- [x] passar `ownerResponsible` para `updateCase()` se o caso ainda nao tem valor atribuido — fix aplicado em `imobCrmMutationService.ts`: `upsertCaseFromResolvedTurn` nao inclui `ownerResponsible: null` no input quando valor ausente; `updateCase` nao sobrescreve com null (`!= null`)
- [x] nao sobrescrever owner existente — garantido pela condicao `input.ownerResponsible != null` em vez de `!== undefined`

Ordem de edicao:

- [x] verificar se shadow runtime ja passa o campo ou ignora — verificado: runtime captura para assinatura mas nao chama updateCase; o caminho relevante e `upsertCaseFromResolvedTurn`
- [x] adicionar pass-through condicional — aplicado em `imobCrmMutationService.ts:713` e `imobCrmMutationService.ts:1071`
- [x] teste de nao sobrescrita — coberto pelos testes focados da mutation e pelo pass-through condicional sem overwrite por `null`

### Camada 3 — Fallback por especialista do run (somente se aprovado)

#### [apps/api/src/services/imob/crm/imobCrmKpiService.ts](../../apps/api/src/services/imob/crm/imobCrmKpiService.ts)

**Esta camada e mais invasiva e pode mascarar o problema real se persistir o fallback. Executar apenas com permissao explicita. O fallback nunca deve ser gravado no banco — apenas exibicao visual no KPI historico.**

Remocoes:

- [x] nenhuma obrigatoria

Adicoes (se aprovado):

- [ ] se `ownerResponsible` null no caso, tentar `specialistId` do run mais recente vinculado apenas para exibicao no KPI
- [ ] nunca persistir o fallback como `ownerResponsible` no banco
- [ ] exibir indicador visual de que e um fallback, nao dado confirmado

### Saida esperada

- [x] casos fechados sem owner bloqueados com `CASE_RESPONSIBLE_REQUIRED`
- [x] shadow runtime preenche owner quando tem o dado
- [ ] broker KPI com nomes reais, nao `"Corretor nao atribuido"`

---

## Etapa 8 — IMOB-first, multi-vertical compatible

### Decisao arquitetural acordada

A Etapa 8 nao deve bloquear o P0 do IMOB na arquitetura completa multi-vertical.

Duas trilhas:

- **Trilha A — P0 IMOB-first**: resolver `ownerResponsible` agora com nomes e contratos compatíveis com `responsibleActor` futuro
- **Trilha B — Plataforma multi-vertical**: `VerticalRolePolicy`, `ResponsibleActorPolicy`, `VerticalEntitlement`, billing, white label e microfranquias como milestone maior

`ownerResponsible` IMOB = alias de `responsibleActor` para `entityType = imob.case`.

---

### Etapa 8 Trilha A — P0 IMOB-first

Nota: a Etapa 8 Trilha A e o fechamento governado da DATA-03 Camada 1 / assignment manual, nao um PR concorrente.

#### Regras definitivas

- `ownerResponsible` e tratado como alias IMOB de `responsibleActor`
- Nao criar dependencia obrigatoria de `VerticalEntitlement`, `VerticalRolePolicy` ou `ResponsibleActorPolicy` antes de auditar Prisma
- Fontes confiaveis de owner: case existente → input explicito → shadow runtime → CASE_RESPONSIBLE_REQUIRED
- `specialistId` nao vira owner por padrao nunca
- Run mais recente generico nunca persiste owner
- Ausencia de owner em terminal retorna `CASE_RESPONSIBLE_REQUIRED` + `nextAction = ASSIGN_RESPONSIBLE_MANUALLY`

#### EntityType registry minimo

Nao usar strings livres. Criar ou localizar registry canonico:

```ts
export const ENTITY_TYPES = {
  IMOB_CASE: "imob.case",
  IMOB_LEAD: "imob.lead",
  IMOB_PROPERTY: "imob.property",
  LEGAL_DOCUMENT: "legal.document",
  LEGAL_OPINION: "legal.opinion",
  FINANCE_INVOICE: "finance.invoice",
  FINANCE_SETTLEMENT: "finance.settlement",
} as const;

export type EntityType = typeof ENTITY_TYPES[keyof typeof ENTITY_TYPES];
```

No P0, usar pelo menos `ENTITY_TYPES.IMOB_CASE`.

#### reasonCodes a adicionar ao catalogo

```
CASE_RESPONSIBLE_REQUIRED          — caso terminal sem ownerResponsible; nextAction = ASSIGN_RESPONSIBLE_MANUALLY
CASE_OWNER_ASSIGNMENT_FORBIDDEN    — tentativa de atribuir owner proibida pela policy
MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE — membro sem elegibilidade para ser responsavel
INVALID_ACTION_TYPE                — run criado com request.action fora do mapa canonico
CASE_TRANSITION_EVENT_REQUIRED     — transicao de status requer ImobCaseEvent explicito, ausente
```

Ver: [docs/ops/reason-codes-catalog.md](./reason-codes-catalog.md)

Nota: `OWNER_REQUIRED` ja existe em `imobNextActionResolver.ts:114` com semantica diferente ("proprietario do imovel nao cadastrado" na jornada de captacao). O novo code DATA-03 usa `CASE_RESPONSIBLE_REQUIRED` para evitar colisao.

`INVALID_ACTION_TYPE` e usado na Frente B do DATA-01 ao bloquear criacao de run com action desconhecido.
`CASE_TRANSITION_EVENT_REQUIRED` e usado no DATA-02 Opcao B ao exigir evento de closing para registrar timestamp real.

#### Mutation assignOwnerToCase / assignResponsibleActor

Assinatura compativel com plataforma futura:

```ts
type AssignResponsibleActorInput = {
  tenantId: string;
  workspaceId: string;
  userId: string;
  verticalId?: "IMOB";
  entityType?: "imob.case";
  entityId: string;
  responsibleUserId?: string;
  responsibleMemberId?: string;
  reason?: string;
  idempotencyKey?: string;
};
```

Execucao da mutation em transacao:

```
1. validar tenantId/workspaceId/userId
2. validar case dentro do escopo do tenant/workspace
3. validar permissao minima para atribuir owner
4. validar que nao sobrescreve owner existente sem policy explicita
5. atualizar ImobCase.ownerResponsible
6. criar ImobCaseEvent de owner_assigned
7. retornar payload canonico
```

Se qualquer etapa falhar → rollback total.

Idempotencia — chave logica do evento:

```
tenantId:workspaceId:entityType:entityId:responsibleId:eventType
```

Nao duplicar evento em retry.

#### [docs/ops/reason-codes-catalog.md](./reason-codes-catalog.md)

- [x] adicionar `CASE_RESPONSIBLE_REQUIRED` com descricao e `nextAction: ASSIGN_RESPONSIBLE_MANUALLY` (nome escolhido para evitar colisao semantica com `OWNER_REQUIRED` da jornada de captacao em `imobNextActionResolver.ts:114`)
- [x] adicionar `CASE_OWNER_ASSIGNMENT_FORBIDDEN`
- [x] adicionar `MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE`
- [x] adicionar `INVALID_ACTION_TYPE`
- [x] adicionar `CASE_TRANSITION_EVENT_REQUIRED`

#### [apps/api/src/services/imob/crm/imobCrmMutationService.ts](../../apps/api/src/services/imob/crm/imobCrmMutationService.ts)

- [x] implementar ou adaptar `assignOwnerToCase()` ou `assignResponsibleActor()`
- [x] garantir transacao atomica: update case + create event
- [x] garantir idempotencia por chave logica
- [x] nao sobrescrever owner existente

#### Testes P0 obrigatorios

- [x] case terminal sem owner bloqueia com `CASE_RESPONSIBLE_REQUIRED`
- [x] shadow runtime com owner preenche `ownerResponsible`
- [x] `assignOwnerToCase()` valido atualiza case e cria evento
- [x] falha no evento faz rollback do update
- [x] retry nao duplica evento (idempotencia)
- [x] owner existente nao e sobrescrito
- [x] `specialistId` nao e usado por padrao
- [x] run recente generico nao persiste owner

#### Saida esperada Trilha A

- [x] `CASE_RESPONSIBLE_REQUIRED` catalogado e retornado em transicoes terminais sem owner
- [x] mutation de atribuicao manual implementada e testada
- [x] `assignOwnerToCase` atomico e idempotente
- [x] shadow runtime passa owner quando disponivel
- [ ] KPI de broker com nomes reais
- [x] evidencia criada e Evidence Index atualizado somente se os arquivos de evidencia existirem fisicamente no repositorio

---

### Etapa 8 Trilha B — Plataforma multi-vertical (milestone posterior)

**Trilha ativa escolhida para a proxima rodada. Nao executar Camada 3 agora.**

#### Plano enxuto da Trilha B

Fase 1 — auditoria do estado atual:

- mapear entidades e relacoes ja existentes no Prisma
- confirmar o que ja existe versus o que ainda seria novo
- nao propor migration antes desse inventario

Fase 2 — documentacao canonica:

- definir policy de entitlement/billing por vertical
- definir policy de responsible actor e lifecycle de `policyVersion`
- separar regras de plataforma das regras especificas do IMOB

Fase 3 — proposta de modelagem:

- descrever apenas o delta minimo de schema necessario
- explicitar o que continua como alias/compat layer
- manter IMOB funcionando sem regressao durante a migracao futura

Fase 4 — testes de plataforma:

- stub multi-vertical IMOB + LEGAL
- gate de entitlement para assignment
- regra de grace period / `past_due`
- validacao de `canBeResponsibleFor` por enum

#### Fora do escopo desta rodada

- fallback visual de broker/KPI por `specialistId`
- persistencia de fallback historico
- ajustes visuais de dashboard
- migrations ou implementacao runtime antes da auditoria/documentacao

#### Fase 1 — auditoria preenchida (estado atual)

| Item auditado | O que existe hoje | O que nao existe hoje | Impacto no delta minimo de schema |
|---|---|---|---|
| `WorkspaceMember` | nao existe como model Prisma canonico; ha camada operacional em SQL cru via `workspaceResponsibility.ts` (`eiah_workspace_role_assignments`, convites e roles) | model Prisma tipado e relacoes formais no schema | criar model canonico ou manter compat layer explicitamente; nao migrar sem decidir fonte de verdade |
| `VerticalEntitlement` | nao existe model com esse nome; existe `TenantProductInstallation` para ativacao de produto por `tenant/workspace/product/status` | entitlement vertical dedicado com status operacional e regras de billing | possivel reaproveitar `TenantProductInstallation` como base ou criar model fino acima dele; evitar duplicar conceito |
| `WorkspaceRole` | nao existe model Prisma; ha tabela SQL crua `eiah_workspace_roles` gerida por `workspaceResponsibility.ts` | model Prisma tipado para roles por workspace | decidir se essa camada sobe para Prisma ou segue como store operacional separada |
| `VerticalRolePolicy` | nao existe | policy formal por vertical + entity type | novo delta de schema/documentacao; nao ha base pronta no Prisma atual |
| `ResponsibleActorPolicy` | nao existe | policy formal de atribuicao responsavel por entidade/vertical | novo delta de schema/documentacao; hoje IMOB usa `ownerResponsible` como alias operacional |
| `policyVersion` em responsible actor | nao existe | versionamento de policy vinculado a atribuicao | novo campo/modelo futuro; depende primeiro da policy canonicamente definida |
| `Tenant` ↔ `Workspace` ↔ `User` | existe parcialmente: `Workspace.tenantId`, `User.tenantId`, `Run.userId`, relacoes formais entre `Tenant`, `Workspace`, `User` | associacao direta de membership tipada entre `User` e `Workspace` no Prisma | delta minimo pede formalizar membership, nao `Tenant`/`Workspace`/`User` base |
| `ImobCase` | existe com `tenantId`, `workspaceId`, `threadId`, `ownerResponsible`, FKs para owner/property/lead | `userId` direto no caso nao existe | se Trilha B exigir ator responsavel rastreavel por usuario/membro, avaliar adicionar referencia formal depois da policy |
| `ImobCaseEvent` | existe com `tenantId`, `workspaceId`, `runId`, `actorType`, `actorRef`, `evidenceRef` | FK direta para membro/responsavel canonicamente tipado nao existe | possivel manter `actorRef` no curto prazo; evolucao futura pode tipar ator responsavel |
| `Run` | existe com `tenantId`, `workspaceId`, `userId`, `caseId`, `threadId`, `assignmentId` | nenhum gap estrutural critico para Trilha B | baixo impacto; `Run` ja suporta escopo multi-tenant/workspace |
| billing/subscription | existe base relevante: `TenantBillingAccount`, `TenantQuotaPolicy`, `TenantQuotaUsage`, `WorkspaceQuotaUsage`, `WorkspaceQuotaGrant`, `TenantInvoice`, `BillingLedger` | modelo verticalizado de entitlement acoplado a billing ainda nao existe | documentacao primeiro; schema novo so se a policy nao puder ser expressa sobre os modelos atuais |

Resumo da auditoria:

- a base multi-tenant/workspace ja existe no Prisma
- o principal gap nao e `Run`/`ImobCase`; e a falta de uma camada canonica tipada para membership, roles e policy por vertical
- ha store operacional fora do Prisma em `workspaceResponsibility.ts`; isso precisa virar decisao arquitetural antes de qualquer migration
- `TenantProductInstallation` e o candidato mais proximo para servir de base a `VerticalEntitlement`, reduzindo delta de schema

Decisao de Fase 1:

1. nao abrir migration agora
2. documentar primeiro a fonte de verdade entre `TenantProductInstallation` e um futuro `VerticalEntitlement`
3. documentar primeiro a fonte de verdade entre tabelas SQL cruas de workspace responsibility e um futuro `WorkspaceMember` / `WorkspaceRole`
4. so depois propor delta minimo de schema

#### Pre-requisito obrigatorio: auditoria do schema Prisma

Antes de qualquer migration, auditar:

- [x] `WorkspaceMember` existe? — nao como model Prisma canonico; existe store operacional fora do Prisma
- [x] `VerticalEntitlement` existe? — nao; candidato atual mais proximo e `TenantProductInstallation`
- [x] `WorkspaceRole` existe? — nao como model Prisma; existe store operacional fora do Prisma
- [x] `VerticalRolePolicy` existe? — nao
- [x] `Tenant` e `Workspace` tem relacao com `User`? — sim, parcialmente; membership tipada ainda nao existe no Prisma
- [x] `ImobCase` tem `tenantId`, `workspaceId`, `userId`? — tem `tenantId` e `workspaceId`; `userId` direto nao existe
- [x] `ImobCaseEvent` tem `tenantId`, `workspaceId`? — sim
- [x] `Run` tem `tenantId`, `workspaceId`? — sim
- [x] existem tabelas de billing/subscription? — sim, base relevante existe no Prisma

Se existirem → alinhar contratos com o que ja esta.
Se nao existirem → criar proposta/migration separada com escopo fechado.

#### Documentacao a criar (sem codigo)

- [x] `docs/ops/vertical-entitlement-billing-policy.md`
  - fonte de verdade em caso de divergencia entre billing provider e banco
  - comportamento em `past_due` e grace period
  - comportamento em `suspended` para casos em andamento
  - replay/idempotencia de webhook
  - relacao com usage events

- [x] `docs/ops/responsible-actor-policy.md`
  - atribuicoes existentes continuam validas com a `policyVersion` usada na atribuicao
  - mudanca de policy nao reescreve historico automaticamente
  - revalidacao ocorre apenas em nova acao sensivel ou migration governada
  - migration de revalidacao exige evidencia/receipt

#### Fase 3 — proposta objetiva de delta minimo de schema/contrato

Principio da Fase 3:

- nao abrir model novo quando ja existe base suficiente no Prisma atual
- separar `contrato canonico` de `persistencia canonica`
- manter IMOB operacional com alias/compat layer durante toda a trilha
- adiar migration estrutural de membership/roles ate decidir a fonte de verdade entre Prisma e SQL operacional

Decisao objetiva por item:

| Item | Decisao de Fase 3 | Tipo de mudanca | Justificativa |
|---|---|---|---|
| `VerticalEntitlement` | **nao criar model agora**; usar `TenantProductInstallation` como base canonica de contrato | contrato/documentacao | ja existe base por `tenant/workspace/product/status`; criar model novo agora duplicaria conceito |
| `WorkspaceMember` | **nao migrar agora**; manter store operacional atual como compat layer explicita | contrato/documentacao | existe comportamento real em `workspaceResponsibility.ts`, mas ainda sem decisao arquitetural para subir ao Prisma |
| `WorkspaceRole` | **nao migrar agora**; manter SQL operacional atual como fonte provisoria | contrato/documentacao | mesmo racional de `WorkspaceMember`; o gap e de formalizacao, nao de ausencia funcional |
| `VerticalRolePolicy` | **propor model futuro novo** | schema futuro | nao ha base pronta no Prisma atual; policy por vertical/entity type precisa de objeto proprio |
| `ResponsibleActorPolicy` | **propor model futuro novo** | schema futuro | policy de elegibilidade e atribuicao nao existe hoje de forma canonica |
| `policyVersion` | **propor campo futuro ligado a atribuicao/policy**, nao objeto isolado agora | schema futuro | deve nascer junto da policy, nao antes |
| `EntityType` | **criar registry/enum canonico antes de schema novo** | contrato | reduz drift entre IMOB, LEGAL e futuras verticais |

Contrato minimo a formalizar primeiro:

```ts
type VerticalKey = "IMOB" | "LEGAL";

type EntityType =
  | "imob.case"
  | "imob.lead"
  | "imob.property"
  | "legal.document"
  | "legal.opinion";

type EntitlementStatus = "active" | "suspended" | "past_due" | "inactive";

type ResponsibleActorAssignmentContract = {
  tenantId: string;
  workspaceId: string;
  verticalKey: VerticalKey;
  entityType: EntityType;
  entityId: string;
  responsibleUserId?: string;
  responsibleMemberId?: string;
  policyVersion?: string;
};
```

Delta minimo recomendado nesta ordem:

1. formalizar `VerticalKey`, `EntityType` e `EntitlementStatus` como contrato compartilhado
2. declarar `TenantProductInstallation` como base de entitlement da fase atual
3. declarar `workspaceResponsibility.ts` como compat layer oficial de membership/role ate migration futura
4. desenhar apenas dois objetos novos para milestone posterior:
   - `VerticalRolePolicy`
   - `ResponsibleActorPolicy`
5. adicionar `policyVersion` apenas quando a policy canonica existir

Compatibilidade obrigatoria:

- `ownerResponsible` continua alias IMOB de `responsibleActor`
- nenhum fluxo atual do IMOB depende de `VerticalEntitlement` novo para funcionar
- nenhum fluxo atual do IMOB depende de `WorkspaceMember` Prisma para funcionar
- LEGAL entra primeiro como consumidor do contrato (`VerticalKey` / `EntityType`), nao como motor de migration

Fora do delta minimo:

- criar tabela nova so para espelhar `TenantProductInstallation`
- migrar agora as tabelas SQL operacionais de workspace responsibility
- reescrever historico de atribuicoes antigas
- acoplar billing provider diretamente nas regras de assignment

#### Modelos de schema a criar (quando houver decisao de implementacao)

- [ ] `WorkspaceMember` — somente se a decisao arquitetural for subir membership para Prisma
- [ ] `VerticalEntitlement` — somente se `TenantProductInstallation` se mostrar insuficiente como base contratual
- [ ] `VerticalRolePolicy` — com `canBeResponsibleFor: EntityType[]` (enum, nao string livre)
- [ ] `ResponsibleActorPolicy` — vinculada a entitlement e role
- [ ] `policyVersion` em `ResponsibleActor` — lifecycle definido em `responsible-actor-policy.md`

#### Testes plataforma

Objetivo da Fase 4:

- provar que o contrato minimo da Fase 3 suporta IMOB e LEGAL sem migration
- validar gate de entitlement sem criar `VerticalEntitlement` novo agora
- preservar compatibilidade do IMOB com `ownerResponsible` como alias

Checklist executavel por arquivo:

- [x] `apps/api/src/tests/vertical-responsible-actor.contract.test.ts`
  - cenario: validar contrato minimo compartilhado com `verticalKey`, `entityType`, `entitlementStatus` e payload de assignment
  - aceite: aceita `IMOB + imob.case` e `LEGAL + legal.document`; rejeita combinacoes cruzadas invalidas

- [x] `apps/api/src/tests/imob-responsible-actor-compat.contract.test.ts`
  - cenario: provar compatibilidade do IMOB atual com o contrato novo sem migration
  - aceite: `ownerResponsible` continua funcionando como alias de `responsibleActor`; nenhuma regressao no fluxo terminal IMOB

- [x] `apps/api/src/tests/legal-responsible-actor-stub.contract.test.ts`
  - cenario: criar stub LEGAL consumindo o mesmo contrato minimo, sem runtime novo da vertical
  - aceite: `LEGAL` monta assignment contract valido com `legal.document` e `legal.opinion`

- [x] `apps/api/src/tests/vertical-entitlement-gate.contract.test.ts`
  - cenario: validar regra de entitlement sobre acao sensivel de assignment
  - aceite: `active` permite; `suspended` bloqueia; `past_due` respeita grace period conforme policy documental

- [x] `apps/api/src/tests/billing.vertical-entitlement.contract.test.ts`
  - cenario: reaproveitar a base de billing para provar que `TenantProductInstallation` sustenta o entitlement da fase atual
  - aceite: o teste demonstra que nao e necessario criar `VerticalEntitlement` novo para representar `active/past_due/suspended/inactive` neste corte

- [x] `apps/api/src/tests/vertical-entity-type-registry.contract.test.ts`
  - cenario: validar registry/enum canonico antes de qualquer schema novo
  - aceite: todos os `entityType` permitidos sao explicitos; string livre e rejeitada; IMOB e LEGAL ficam cobertos no mesmo catalogo

- [x] `apps/api/src/tests/workspace.memberships.contract.test.ts`
  - cenario: estender o teste ja existente para cobrir a compat layer de membership na Trilha B
  - aceite: membership atual continua fonte valida para resolucao de responsavel sem exigir model Prisma novo

Ordem recomendada de execucao:

1. `vertical-responsible-actor.contract.test.ts`
2. `imob-responsible-actor-compat.contract.test.ts`
3. `legal-responsible-actor-stub.contract.test.ts`
4. `vertical-entitlement-gate.contract.test.ts`
5. `billing.vertical-entitlement.contract.test.ts`
6. `vertical-entity-type-registry.contract.test.ts`
7. extensao de `workspace.memberships.contract.test.ts`

---

## Tabela de riscos

| Risco | Mitigacao |
|---|---|
| P0 IMOB atrasar por arquitetura grande | Trilha A separada de Trilha B |
| Criar schema que ja existe com outro nome | Auditoria Prisma antes de migration |
| `EntityType` divergente entre servicos | Registry/enum canonico obrigatorio |
| Evento sem update ou update sem evento | Transacao obrigatoria |
| Idempotencia ausente | `idempotencyKey` por `entityId:eventType:responsibleId` |
| Billing bloquear entrega P0 | Billing fora do P0, contrato futuro mantido |
| `policyVersion` virar dado morto | Lifecycle definido antes de implementar |
| `specialistId` virar owner indevido | Proibicao default mantida, sem fallback automatico |
| Fallback de KPI virar verdade persistida | Fallback apenas visual/historico, nunca persiste |
| Query 1 revelar patterns inesperados | Frente A depende da query, nao de suposicao |

---

## DoD por PR / Trilha

Regra de Evidence Index:

O `docs/EVIDENCE_INDEX.md` so pode ser atualizado depois que os arquivos de evidencia existirem fisicamente no repositorio e tiverem sido gerados por execucao real de teste, check, diagnostico ou relatorio. Caminhos futuros, placeholders ou evidencias planejadas nao podem ser indexados. Se o arquivo de evidencia nao existir, manter o status como `parcial` ou `implementado localmente — evidencia pendente`.

### PR-IMOB-DATA-01

- [x] Query 1 executada e resultado documentado (tenant-scoped)
- [x] **Frente B**: `request.action` validado contra mapa canonico na criacao do run; runs invalidos retornam `INVALID_ACTION_TYPE`
- [x] evidencia verde dos testes de rota da Frente B
- [x] Evidence Index atualizado com evidencia real da Frente B (`ops/evidence/latest/imob-data-route-contract-hardening-2026-06-12.md`)
- [x] **Frente A** (legado): mapa de `resolveRunJourneyLabel()` expandido com patterns reais da Query 1
- [x] bucket `"Outros"` representando apenas runs genuinamente nao classificaveis no escopo validado (`0` remanescentes)
- [x] cobertura visivel no card de custo por jornada

### PR-IMOB-DATA-02

- [x] Query 2 executada e resultado documentado (tenant-scoped)
- [x] **Opcao A**: `durationSource: "updated_at_proxy"` implementado como fallback secundario; duracao 0.0h nao exibida quando base insuficiente
- [x] **Opcao B** (corte minimo): `ImobCaseEvent` terminal explicito com timestamp real, idempotente e transacional na mutacao do caso
- [x] Opcao C rejeitada — threshold nao implementado por decisao de escopo
- [x] `coverage.durationSampleSize` refletindo apenas casos com `durationSource` confiavel
- [x] card "Ciclo operacional" validado fim a fim: payload retorna `averageDurationHours = null` quando cobertura e insuficiente; rota preserva o valor; UI renderiza `—` / `Sem dados suficientes`

### PR-IMOB-DATA-03

- [x] Query 3 executada e dimensionamento documentado
- [x] shadow runtime passando owner quando disponivel
- [x] transicoes terminais sem owner retornando `CASE_RESPONSIBLE_REQUIRED`
- [ ] broker KPI sem `"Corretor nao atribuido"` quando dado disponivel

### Etapa 8 Trilha A

- [x] reasonCodes adicionados ao catalogo: `CASE_RESPONSIBLE_REQUIRED`, `CASE_OWNER_ASSIGNMENT_FORBIDDEN`, `MEMBER_NOT_ELIGIBLE_AS_RESPONSIBLE`, `INVALID_ACTION_TYPE`, `CASE_TRANSITION_EVENT_REQUIRED`
- [x] `updateCase()` bloqueia terminal sem owner
- [x] shadow runtime passa owner quando disponivel
- [x] `assignOwnerToCase()` / `assignResponsibleActor()` implementado com assinatura compativel
- [x] update do case + evento `owner_assigned` em transacao atomica
- [x] idempotencia garantida por chave logica
- [x] `specialistId` nao vira owner por padrao
- [x] testes focados da mutation passando (`src/tests/imob-crm-mutation-service.test.ts`)
- [x] evidencia criada (`ops/evidence/latest/imob-owner-assignment-mutation-2026-06-13.md`)
- [x] Evidence Index atualizado com evidencia real

### Etapa 8 Trilha B

- [x] auditoria Prisma documentada
- [x] `vertical-entitlement-billing-policy.md` criado
- [x] `responsible-actor-policy.md` criado
- [x] schema audit concluido antes de qualquer migration
- [x] proposta objetiva de delta minimo de schema/contrato documentada
- [x] testes multi-vertical IMOB + LEGAL stub implementados no escopo minimo (`vertical-responsible-actor`, `imob-responsible-actor-compat`, `legal-responsible-actor-stub`, `vertical-entitlement-gate`, `billing.vertical-entitlement`, `vertical-entity-type-registry`, extensao de `workspace.memberships`)
- [x] Fase 4 concluida item por item no checklist executavel
- [x] ressalva registrada: extensao de `workspace.memberships.contract.test.ts` foi validada no recorte da compat layer com banco real; a suite integrada completa permaneceu com bootstrap opaco fora do recorte novo
- [x] Evidence Index atualizado apenas apos entrega real e somente se os arquivos de evidencia existirem fisicamente no repositorio

---

## Status

| Fase | Status |
|---|---|
| Queries de diagnostico (tenant-scoped) | concluido — queries executadas no escopo real e resultados documentados |
| ReasonCodes no catalogo | concluido no escopo minimo — catalogo alinhado ao fluxo IMOB atual e coberto pelas evidencias da frente |
| PR-IMOB-DATA-03 Camada 2 (shadow) | concluido no escopo minimo — pass-through preserva owner quando disponivel, preenche `ownerResponsible` e nao sobrescreve com null |
| PR-IMOB-DATA-01 Frente B (fonte, estrutural) | concluido no escopo minimo — validacao estrutural implementada; causa raiz em `agents.ts` corrigida para nao apagar `request.action` canonico |
| PR-IMOB-DATA-02 Opcao A (hotfix durationSource) | implementado no KPI — evento terminal real priorizado; `updated_at_proxy` apenas como fallback secundario |
| PR-IMOB-DATA-01 Frente A (mapa legado) | concluido no escopo validado — aliases reais incorporados; bucket `Outros` caiu de `178` para `0` no tenant/workspace analisado |
| PR-IMOB-DATA-02 Opcao B (evento explicito, definitivo) | implementado no corte minimo — `updateCase()` grava `case.completed` terminal com `evidenceRef` deterministico e sem duplicata logica |
| PR-IMOB-DATA-03 Camada 1 (bloqueio terminal sem owner) | implementado — `updateCase()` bloqueia terminal sem owner e rotas respondem `CASE_RESPONSIBLE_REQUIRED` |
| PR-IMOB-DATA-03 Camada 3 (fallback visual de KPI) | adiado por opcao — nao necessario no escopo minimo implementavel |
| PR-IMOB-DATA-03 Camadas 1 e 3 | encerrado no escopo minimo — integridade garantida sem fallback visual historico |
| Etapa 8 Trilha A | concluido no escopo minimo — atribuicao manual implementada, evento `owner_assigned` atomico/idempotente e evidencia real criada |
| Etapa 8 Trilha B | Fase 4 concluida no escopo minimo — auditoria, policies base, delta minimo e testes stub multi-vertical consolidados; resta apenas futura rodada de implementacao/migration se a plataforma decidir evoluir o schema |
| Hardening de open handles para contract tests HTTP | evidenciado — `shadow-executions`, `runs.imob-action` e `agents.interop` com `EXIT:0` |
