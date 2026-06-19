# IMOB Chat Document Intake — Phase 8.1 Redis Draft Store

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: substituir/complementar o draft in-memory por draft store selecionável (`redis|memory`), preservando compatibilidade local

## Objetivo

Reduzir perda de draft em restart do processo API sem alterar a regra de negócio do intake. O foco desta fase foi mover o armazenamento transitório do `draftId` para uma abstração de store com modo Redis real e fallback em memória.

## Implementação

Arquivos principais:

- `apps/api/src/services/imob/intake/imobContractDraftService.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/tests/imob-contract-draft-service.test.ts`
- `apps/api/src/tests/imob-intake-pipeline.test.ts`
- `apps/api/src/tests/imob-intake-confirm.test.ts`
- `apps/api/src/tests/imob-intake-lifecycle.test.ts`

Contrato operacional do draft store:

- `createDraft`
- `getDraft`
- `consumeDraft`
- `deleteDraft`
- `expireDraft`
- `restoreDraft`

Modos suportados:

- `memory`
  - fallback local e de testes;
  - mantém compatibilidade do comportamento anterior.
- `redis`
  - default do runtime normal quando `DRAFT_STORE` não é informado;
  - persiste o draft fora do processo API;
  - preserva `draftId` opaco e sem PII.

Regras preservadas:

- `tenantId/workspaceId` seguem no payload do draft;
- `consumeDraft` falha fechado em cross-workspace;
- `confirm` continua usando os mesmos `reasonCode`:
  - `DRAFT_EXPIRED`
  - `DRAFT_SCOPE_MISMATCH`
- se o `confirm` bloquear por registry/assignment/erro de criação de run, o draft é reinserido com o mesmo `draftId` e TTL remanescente.

## Variáveis de ambiente

Incluídas/assumidas nesta fase:

```dotenv
DRAFT_STORE=redis
DRAFT_STORE_REDIS_URL=
DRAFT_TTL_MS=1800000
```

Leitura operacional:

- `DRAFT_STORE=redis`: modo preferencial do piloto;
- `DRAFT_STORE=memory`: fallback explícito para dev/test;
- `DRAFT_STORE_REDIS_URL`: override opcional; se ausente, usa `REDIS_URL`;
- `DRAFT_TTL_MS`: mantém TTL de 30 minutos por padrão.

## Impacto funcional

### Upload

`POST /api/imob/chat/intake/upload` continua retornando o mesmo payload de draft, mas agora persiste esse draft no store configurado em vez de depender exclusivamente do `Map` local.

### Confirm

`POST /api/imob/chat/intake/confirm/:draftId` passou a usar `consumeDraft` com escopo `tenantId/workspaceId`.

Efeitos confirmados:

- re-confirm continua falhando com `409 DRAFT_EXPIRED`;
- cross-workspace continua falhando com `403 DRAFT_SCOPE_MISMATCH`;
- quando o draft é consumido e a criação da run não segue, o draft é restaurado.

### Export

Nenhuma regra de export foi alterada nesta fase.

## Testes executados

### 1. Unitário do draft store no host

Comando:

```bash
NODE_ENV=test TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test \
  apps/api/src/tests/imob-contract-draft-service.test.ts \
  apps/api/src/tests/imob-intake-pipeline.test.ts
```

Resultado:

- `2/2` arquivos de teste passaram com exit limpo.

### 2. Draft store com Redis real no container

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && NODE_ENV=test DRAFT_STORE=redis ... node --import tsx --test src/tests/imob-contract-draft-service.test.ts'
```

Resultado:

- `20/20` testes passaram com exit limpo;
- inclui persistência do draft após reinicialização do recurso (`T-DRF-20`);
- inclui `consumeDraft` idempotente, cross-workspace fail-closed, expiração e fallback memory.

### 3. Lifecycle HTTP do intake com Redis draft store

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && NODE_ENV=test DRAFT_STORE=redis ... node --import tsx --test src/tests/imob-intake-lifecycle.test.ts'
```

Resultado observado:

- `LC-01` a `LC-06` apareceram como `ok`;
- `LC-01`: re-confirm -> `409 DRAFT_EXPIRED`;
- `LC-02`: cross-workspace -> `403 DRAFT_SCOPE_MISMATCH`;
- `LC-03/04`: upload + `UploadedDocument` preservados;
- `LC-05/06`: guards do worker preservados;
- a suíte permaneceu com hang residual de teardown após as asserções e exigiu interrupção manual.

Leitura:

- o comportamento funcional passou;
- o problema residual continua no runner/teardown da suíte integrada, não no draft store.

### 4. Confirm HTTP com Redis draft store

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && NODE_ENV=test DRAFT_STORE=redis ... node --import tsx --test src/tests/imob-intake-confirm.test.ts'
```

Resultado observado:

- `CONF-01` a `CONF-06` apareceram como `ok` após ajuste de isolamento do cenário `CONF-06`;
- `confirm` continuou criando `runStatus=success`;
- o worker continuou criando `ImobCase` a partir do run confirmado;
- a suíte também permaneceu com hang residual de teardown após as asserções.

## Evidência de durabilidade

O caso `T-DRF-20` validou o comportamento central desta fase:

1. draft criado com `DRAFT_STORE=redis`;
2. recursos do draft store fechados;
3. store reaberto;
4. o mesmo `draftId` continuou recuperável.

Isso demonstra persistência fora do processo API e reduz a perda de draft em restart quando Redis está ativo.

## Invariantes preservadas

- `ChatAgentLauncher` não foi alterado;
- Workbench visual não foi alterado;
- backend export não foi alterado;
- worker não foi alterado funcionalmente;
- nenhum `stage/status/journeyType` novo foi criado;
- nenhum `draftId` contém PII;
- multi-instância continua `NO-GO`.

## Limitações remanescentes

- multi-instância ainda depende de object storage real operacional;
- auto-delete e retenção continuam pendentes;
- as suítes integradas `imob-intake-lifecycle` e `imob-intake-confirm` ainda apresentam hang residual de teardown depois das asserções;
- o piloto ainda exige Redis operacional para se beneficiar da durabilidade de draft.

## Conclusão

Resultado da fase:

- Redis draft store implementado;
- fallback memory preservado;
- `confirm` continuou funcional;
- restart do processo deixa de ser perda obrigatória de draft quando Redis está ativo;
- status permanece `PILOTO CONTROLADO`;
- multi-instância continua `NÃO GO`.
