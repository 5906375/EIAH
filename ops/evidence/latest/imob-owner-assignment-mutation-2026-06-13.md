# IMOB Owner Assignment Mutation — 2026-06-13

## Escopo

Evidenciar a entrega da `Etapa 8 Trilha A` no corte minimo implementavel, com foco em:

- bloqueio de transicao terminal sem `ownerResponsible`
- mutation manual de atribuicao `assignOwnerToCase()` / `assignResponsibleActor()`
- criacao atomica do evento `owner_assigned`
- idempotencia por `evidenceRef`
- bloqueio de sobrescrita manual indevida do responsavel existente

## Arquivos principais

- `apps/api/src/services/imob/crm/imobCrmMutationService.ts`
- `apps/api/src/routes/imobCrmRouter.ts`
- `apps/api/src/routes/imobCrmSchemas.ts`
- `apps/api/src/tests/imob-crm-mutation-service.test.ts`

## Ajustes aplicados

- `updateCase()` passou a falhar fechado com `CASE_RESPONSIBLE_REQUIRED` quando o caso entra em estado terminal sem `ownerResponsible`
- `assignOwnerToCase()` e `assignResponsibleActor()` foram adicionados no service IMOB
- a atribuicao manual agora grava `owner_assigned` na mesma transacao do update do caso
- o retry da atribuicao nao duplica o evento quando o mesmo `evidenceRef` ja existe
- a mutation dedicada bloqueia overwrite manual de `ownerResponsible` quando o caso ja possui responsavel diferente
- o fluxo de `resolved turn` propaga `presentation.owner` para `ownerResponsible` quando o caso ainda nao possui valor salvo
- falha na criacao do evento `owner_assigned` faz rollback do update do caso no mock transacional do teste
- a rota dedicada `POST /cases/:caseId/assign-owner` expõe o fluxo sem alterar o contrato do patch generico de caso

## Execucao real

Comando:

```bash
node --import tsx --test src/tests/imob-crm-mutation-service.test.ts
```

Resultado:

```text
TAP version 13
# Subtest: src/tests/imob-crm-mutation-service.test.ts
ok 1 - src/tests/imob-crm-mutation-service.test.ts
  ---
  duration_ms: 269.150017
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 277.573112
```

## O que esta evidencia prova

- a mutation do responsavel do caso foi implementada e exercitada com execucao real
- o caminho de atribuicao manual esta ativo no service e coberto pelo teste focado
- a regra de fail-closed para terminal sem responsavel continua preservada
- a atribuicao gera evento `owner_assigned` sem duplicacao logica no retry
- o pass-through de owner no fluxo do shadow/resolved turn foi validado
- o comportamento de rollback transacional do update foi validado quando o evento falha

## Limites desta evidencia

- a evidencia e local, derivada de teste focado, nao de execucao remota em CI
- nao fecha a `Trilha B` multi-vertical
- nao fecha o refinamento opcional do KPI de broker quando houver fallback historico
