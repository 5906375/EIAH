# IMOB Data Trilha B Runtime Minimo Execution Checklist

Objetivo: conectar o primeiro ponto real de runtime ao contrato canonico multi-vertical de responsible actor, mantendo o IMOB funcionando com compat layer, sem migration e sem regressao visual.

## Ordem Geral

- [ ] Executar `PR-IMOB-DATA-TRILHA-B-RUNTIME-01`

Saida esperada:

- [ ] `assignResponsibleActor()` deixa de ser passthrough cego
- [ ] o runtime valida contrato canonico antes de atribuir responsavel
- [ ] `tenantId/workspaceId` usados na validacao vem do `scope` backend
- [ ] IMOB continua persistindo `ownerResponsible` como alias operacional
- [ ] payload invalido falha com `RESPONSIBLE_ACTOR_CONTRACT_INVALID`
- [ ] nenhuma migration e aberta
- [ ] nenhum fluxo web precisa mudar

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

- [ ] fazer `assignResponsibleActor()` montar payload canonico minimo
- [ ] derivar `tenantId/workspaceId` do `scope`
- [ ] fixar `verticalKey = IMOB`
- [ ] fixar `entityType = imob.case`
- [ ] validar payload com `buildResponsibleActorAssignmentContract(...)`
- [ ] mapear falha para `RESPONSIBLE_ACTOR_CONTRACT_INVALID`
- [ ] seguir para `assignOwnerToCase()` apenas se a validacao passar
- [ ] preservar `ownerResponsible` como persistencia final da compat layer

Ordem de edicao:

- [ ] revisar assinatura atual de `assignResponsibleActor()`
- [ ] montar payload canonico usando `scope`
- [ ] validar contrato
- [ ] mapear erro estruturado
- [ ] manter atribuicao IMOB atual apos validacao

### [apps/api/src/types/verticalResponsibleActorContract.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/types/verticalResponsibleActorContract.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [ ] ajustar helper/tipos apenas se faltar shape minimo para runtime
- [ ] manter enum e contrato alinhados com IMOB + LEGAL ja documentados

Ordem de edicao:

- [ ] revisar se o contrato atual ja cobre o payload real
- [ ] ajustar somente se houver gap concreto

### [apps/api/src/routes/imobCrmSchemas.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/imobCrmSchemas.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [ ] alinhar schema de entrada se o endpoint precisar aceitar ids canonicos explicitos
- [ ] evitar aceitar campos de escopo como fonte de verdade

Ordem de edicao:

- [ ] revisar shape atual do endpoint
- [ ] decidir se `responsibleUserId` e/ou `responsibleMemberId` entram agora
- [ ] manter compatibilidade com payload atual do IMOB

### [apps/api/src/routes/imobCrmRouter.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/routes/imobCrmRouter.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [ ] manter o caminho atual de atribuicao manual compatível
- [ ] expor erro claro quando o contrato canonico falhar

Ordem de edicao:

- [ ] revisar chamada atual de `assignResponsibleActor()`
- [ ] mapear erro para resposta HTTP coerente
- [ ] garantir que o scope siga vindo do backend autenticado

### [apps/api/src/tests/imob-responsible-actor-compat.contract.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/imob-responsible-actor-compat.contract.test.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [ ] validar que o runtime IMOB passa pelo contrato canonico antes da atribuicao
- [ ] validar que `ownerResponsible` continua como alias operacional
- [ ] validar falha com `RESPONSIBLE_ACTOR_CONTRACT_INVALID` em payload invalido

Ordem de edicao:

- [ ] fixture de contrato valido
- [ ] fixture de contrato invalido
- [ ] assert do caminho compativel IMOB

### [apps/api/src/tests/imob-crm-mutation-service.test.ts](/home/jusall/projects/EIAH_BUILDER/apps/api/src/tests/imob-crm-mutation-service.test.ts)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [ ] teste de atribuicao manual valida via `assignResponsibleActor()`
- [ ] teste de payload canonico invalido bloqueando antes de persistir
- [ ] teste garantindo que `scope` e a origem do escopo efetivo

Ordem de edicao:

- [ ] cobrir caminho valido
- [ ] cobrir caminho invalido
- [ ] verificar ausencia de persistencia em falha

### [docs/ops/imob-data-pr-execution-checklist.md](/home/jusall/projects/EIAH_BUILDER/docs/ops/imob-data-pr-execution-checklist.md)

Remocoes:

- [ ] nenhuma obrigatoria

Adicoes:

- [ ] registrar esta fase como runtime minimo da Trilha B
- [ ] registrar o `reasonCode` adotado
- [ ] registrar evidencia operacional minima

Ordem de edicao:

- [ ] anotar escopo do patch
- [ ] anotar resultado observado
- [ ] anotar ausencia de migration

## Testes minimos obrigatorios

- [ ] `assignResponsibleActor()` com contrato valido continua atribuindo responsavel
- [ ] contrato invalido falha com `RESPONSIBLE_ACTOR_CONTRACT_INVALID`
- [ ] nenhuma persistencia ocorre no caminho invalido
- [ ] `tenantId/workspaceId` usados no contrato derivam do `scope`
- [ ] compat layer IMOB com `ownerResponsible` continua funcionando

## Evidencia operacional minima

- [ ] comando de teste executado e registrado
- [ ] caso valido documentado
- [ ] caso invalido documentado
- [ ] confirmacao explicita de `sem migration`
- [ ] confirmacao explicita de `sem alteracao de schema`

## Critério de aceite

- [ ] `assignResponsibleActor()` deixa de ser apenas alias cego
- [ ] o runtime usa o contrato canonico multi-vertical de forma real
- [ ] o escopo tenant/workspace e fail-closed via `scope`
- [ ] `ownerResponsible` permanece como compat layer do IMOB
- [ ] payload invalido falha com `RESPONSIBLE_ACTOR_CONTRACT_INVALID`
- [ ] nenhum contrato relevante existente do IMOB regrede
- [ ] nenhuma migration e aberta

## Ordem Geral de Execucao

- [ ] `imobCrmMutationService.ts`
- [ ] `verticalResponsibleActorContract.ts`, se necessario
- [ ] `imobCrmSchemas.ts`, se necessario
- [ ] `imobCrmRouter.ts`, se necessario
- [ ] testes de compatibilidade
- [ ] atualizacao do checklist principal `imob-data`
- [ ] QA estatico final
