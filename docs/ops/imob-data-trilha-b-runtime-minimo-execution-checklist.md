# IMOB Data Trilha B Runtime Minimo Execution Checklist

Objetivo: conectar o primeiro ponto real de runtime ao contrato canonico multi-vertical de responsible actor, mantendo o IMOB funcionando com compat layer, sem migration e sem regressao visual.

## Ordem Geral

- [x] Executar `PR-IMOB-DATA-TRILHA-B-RUNTIME-01`

Saida esperada:

- [x] `assignResponsibleActor()` deixa de ser passthrough cego
- [x] o runtime valida contrato canonico antes de atribuir responsavel
- [x] `tenantId/workspaceId` usados na validacao vem do `scope` backend
- [x] IMOB continua persistindo `ownerResponsible` como alias operacional
- [x] payload invalido falha com `RESPONSIBLE_ACTOR_CONTRACT_INVALID`
- [x] nenhuma migration e aberta
- [x] nenhum fluxo web precisa mudar

## PR-IMOB-DATA-TRILHA-B-RUNTIME-01

Objetivo: ligar contrato multi-vertical e runtime IMOB no menor corte util, sem abrir schema novo, sem entitlement persistido e sem tocar na UI.

Definicoes fechadas:

- `scope.tenantId` e `scope.workspaceId` sao a fonte de verdade
- `verticalKey = IMOB`
- `entityType = imob.case`
- `ownerResponsible` continua como alias operacional persistido
- falha de contrato deve retornar `RESPONSIBLE_ACTOR_CONTRACT_INVALID`
- nenhuma inferencia fragil de escopo a partir do body externo e aceita

## Fora do escopo deste PR

- [x] migration Prisma
- [x] novo model de `WorkspaceMember`
- [x] novo model de `VerticalEntitlement`
- [x] novo model de `VerticalRolePolicy`
- [x] novo model de `ResponsibleActorPolicy`
- [x] gate real de billing/entitlement no runtime
- [x] fallback visual/KPI por `specialistId`
- [x] alteracoes de dashboard/web
- [x] expansao de runtime real para `LEGAL`

### [apps/api/src/services/imob/crm/imobCrmMutationService.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/services/imob/crm/imobCrmMutationService.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] fazer `assignResponsibleActor()` montar payload canonico minimo
- [x] derivar `tenantId/workspaceId` do `scope`
- [x] fixar `verticalKey = IMOB`
- [x] fixar `entityType = imob.case`
- [x] validar payload com `buildResponsibleActorAssignmentContract(...)`
- [x] mapear falha para `RESPONSIBLE_ACTOR_CONTRACT_INVALID`
- [x] seguir para `assignOwnerToCase()` apenas se a validacao passar
- [x] preservar `ownerResponsible` como persistencia final da compat layer

Ordem de edicao:

- [x] revisar assinatura atual de `assignResponsibleActor()`
- [x] montar payload canonico usando `scope`
- [x] validar contrato
- [x] mapear erro estruturado
- [x] manter atribuicao IMOB atual apos validacao

### [apps/api/src/types/verticalResponsibleActorContract.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/types/verticalResponsibleActorContract.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] helper/tipos atuais cobrem o shape minimo do runtime sem ajuste adicional
- [x] manter enum e contrato alinhados com IMOB + LEGAL ja documentados

Ordem de edicao:

- [x] revisar se o contrato atual ja cobre o payload real
- [x] nao ajustar o contrato porque nao houve gap concreto

### [apps/api/src/routes/imobCrmSchemas.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/imobCrmSchemas.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] manter schema atual sem ids canonicos explicitos neste corte minimo
- [x] evitar aceitar campos de escopo como fonte de verdade

Ordem de edicao:

- [x] revisar shape atual do endpoint
- [x] adiar `responsibleUserId` e `responsibleMemberId` na borda HTTP desta rodada
- [x] manter compatibilidade com payload atual do IMOB

### [apps/api/src/routes/imobCrmRouter.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/imobCrmRouter.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] manter o caminho atual de atribuicao manual compatível
- [x] expor erro claro quando o contrato canonico falhar

Ordem de edicao:

- [x] revisar chamada atual de `assignResponsibleActor()`
- [x] mapear erro para resposta HTTP coerente
- [x] garantir que o scope siga vindo do backend autenticado

### [apps/api/src/tests/imob-responsible-actor-compat.contract.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/imob-responsible-actor-compat.contract.test.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] validar que o runtime IMOB passa pelo contrato canonico antes da atribuicao
- [x] validar que `ownerResponsible` continua como alias operacional
- [x] validar falha com `RESPONSIBLE_ACTOR_CONTRACT_INVALID` em payload invalido

Ordem de edicao:

- [x] fixture de contrato valido
- [x] fixture de contrato invalido
- [x] assert do caminho compativel IMOB

### [apps/api/src/tests/imob-crm-mutation-service.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/imob-crm-mutation-service.test.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] teste de atribuicao manual valida via `assignResponsibleActor()`
- [x] teste de payload canonico invalido bloqueando antes de persistir
- [x] teste garantindo que `scope` e a origem do escopo efetivo

Ordem de edicao:

- [x] cobrir caminho valido
- [x] cobrir caminho invalido
- [x] verificar ausencia de persistencia em falha

### [docs/ops/imob-data-pr-execution-checklist.md](/home/jusall/projects/EIAH_BUILDER/docs/ops/imob-data-pr-execution-checklist.md)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [x] registrar esta fase como runtime minimo da Trilha B
- [x] registrar o `reasonCode` adotado
- [x] registrar evidencia operacional minima

Ordem de edicao:

- [x] anotar escopo do patch
- [x] anotar resultado observado
- [x] anotar ausencia de migration

## Testes minimos obrigatorios

- [x] `assignResponsibleActor()` com contrato valido continua atribuindo responsavel
- [x] contrato invalido falha com `RESPONSIBLE_ACTOR_CONTRACT_INVALID`
- [x] nenhuma persistencia ocorre no caminho invalido
- [x] `tenantId/workspaceId` usados no contrato derivam do `scope`
- [x] compat layer IMOB com `ownerResponsible` continua funcionando

## Evidencia operacional minima

- [x] comando de teste executado e registrado
- [x] caso valido documentado
- [x] caso invalido documentado
- [x] confirmacao explicita de `sem migration`
- [x] confirmacao explicita de `sem alteracao de schema`

Execucao validada nesta rodada:

- `node --import tsx --test apps/api/src/tests/imob-responsible-actor-compat.contract.test.ts apps/api/src/tests/imob-crm-mutation-service.test.ts`
- caso valido: atribuicao manual continua funcionando com compat layer IMOB
- caso invalido: runtime retorna `RESPONSIBLE_ACTOR_CONTRACT_INVALID` antes de persistir
- schema/banco: sem migration e sem alteracao estrutural

## Critério de aceite

- [x] `assignResponsibleActor()` deixa de ser apenas alias cego
- [x] o runtime usa o contrato canonico multi-vertical de forma real
- [x] o escopo tenant/workspace e fail-closed via `scope`
- [x] `ownerResponsible` permanece como compat layer do IMOB
- [x] payload invalido falha com `RESPONSIBLE_ACTOR_CONTRACT_INVALID`
- [x] nenhum contrato relevante existente do IMOB regrede
- [x] nenhuma migration e aberta

## Ordem Geral de Execucao

- [x] `imobCrmMutationService.ts`
- [x] `verticalResponsibleActorContract.ts`, se necessario
- [x] `imobCrmSchemas.ts`, se necessario
- [x] `imobCrmRouter.ts`, se necessario
- [x] testes de compatibilidade
- [x] atualizacao do checklist principal `imob-data`
- [x] QA estatico final

## Status Atual da Frente

- [x] runtime minimo da Trilha B implementado e mergeado em `main`
- [x] contrato canonico multi-vertical passou a ser usado no caminho real de atribuicao IMOB
- [x] `RESPONSIBLE_ACTOR_CONTRACT_INVALID` catalogado e coberto por teste
- [x] `tenantId/workspaceId` validados a partir do `scope` backend
- [x] sem migration e sem alteracao de schema

Proximos passos:

1. manter este checklist como artefato de evidencia da rodada ja concluida
2. nao reabrir esta frente sem decisao explicita de evoluir entitlement/policy no runtime
3. se a Trilha B voltar ao escopo, o proximo corte natural e discutir gate real de entitlement/billing ou expansao do runtime canonico para outra vertical
