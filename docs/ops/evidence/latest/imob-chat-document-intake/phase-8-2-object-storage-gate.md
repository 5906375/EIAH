# IMOB Chat Document Intake — Phase 8.2 Object Storage Gate

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: fechar adapter real de object storage ou registrar gate operacional explícito mantendo multi-instância em `NO-GO`

## Objetivo

Revisar o `ObjectStorageProvider` da Fase 8.0 e decidir, com evidência, se o backend IMOB já pode operar com object storage real ou se ainda deve falhar fechado quando `STORAGE_PROVIDER=object` for habilitado.

## Resultado da fase

Resultado obtido nesta revisão:

- o provider `object` continua disponível como contrato/fake para testes;
- o runtime por `env` agora valida configuração obrigatória de forma explícita;
- a build atual **não possui adapter real instalado** para `s3-compatible`;
- multi-instância permanece `NO-GO`.

## Revisão técnica

Arquivo revisado:

- `apps/api/src/services/storageProvider.ts`

Constatações:

1. não há SDK/cliente real de S3/GCS/R2 já presente nas dependências do backend;
2. `createObjectStorageProvider()` continua útil para testes com `ObjectStorageClient` fake;
3. `createStorageProviderFromEnv()` passou a operar em fail-closed para `STORAGE_PROVIDER=object`.

Gate implementado:

- `OBJECT_STORAGE_BUCKET` obrigatório;
- `OBJECT_STORAGE_ADAPTER` obrigatório;
- apenas `OBJECT_STORAGE_ADAPTER=s3-compatible` é aceito contratualmente nesta build;
- `OBJECT_STORAGE_ENDPOINT`, `OBJECT_STORAGE_REGION`, `OBJECT_STORAGE_ACCESS_KEY_ID`, `OBJECT_STORAGE_SECRET_ACCESS_KEY` são obrigatórios para o gate;
- mesmo com essas envs completas, a build atual lança erro explícito informando que **não há adapter real instalado** e que a multi-instância permanece `NO-GO` até smoke real de bucket.

Mensagem operacional final do gate:

```text
STORAGE_PROVIDER=object configurado, mas esta build ainda nao possui adapter real instalado para OBJECT_STORAGE_ADAPTER=s3-compatible. Multi-instancia permanece NO-GO ate smoke real de bucket.
```

## Variáveis de ambiente

`.env.template` atualizado com:

```dotenv
OBJECT_STORAGE_ADAPTER=
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_PREFIX=uploads
OBJECT_STORAGE_ENDPOINT=
OBJECT_STORAGE_REGION=
OBJECT_STORAGE_ACCESS_KEY_ID=
OBJECT_STORAGE_SECRET_ACCESS_KEY=
OBJECT_STORAGE_FORCE_PATH_STYLE=true
```

Observação:

- não há credenciais reais no repositório;
- os placeholders existem apenas para tornar o gate e a operação futura explícitos.

## Testes executados

### Unitário do provider

Comando:

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/storage.provider.test.ts
```

Resultado:

- `pass`
- exit limpo

Cobertura observada na suíte:

- bucket obrigatório em object mode;
- prefix aplicado;
- `storageKey` scoped por `tenantId/workspaceId`;
- path traversal bloqueado;
- `ObjectStorageClient` fake com `put/get/exists/delete`;
- `STORAGE_PROVIDER=object` sem bucket falha explicitamente;
- `STORAGE_PROVIDER=object` sem adapter falha explicitamente;
- `STORAGE_PROVIDER=object` com config completa, mas sem adapter real instalado, falha com mensagem explícita de `NO-GO`.

## Smoke real de object storage

Checagem do ambiente atual:

- não há `OBJECT_STORAGE_*`, `AWS_*`, `S3_*` ou `R2_*` configurados no shell desta execução;
- não há bucket real disponível para smoke;
- não há SDK/cliente real instalado no backend para conectar a bucket mesmo que a configuração existisse.

Conclusão:

- **não houve smoke real de object storage nesta fase**.

## Decisão operacional

Decisão desta fase:

- multi-instância: **NO-GO**

Motivos:

1. falta adapter real instalado na build;
2. falta smoke real contra bucket;
3. sem esses dois pontos, não há base para declarar produção horizontal segura.

## Invariantes preservadas

- `ChatAgentLauncher` não foi alterado;
- Workbench visual não foi alterado;
- draft store da Fase 8.1 não precisou ser alterado;
- regras de intake não foram alteradas;
- `stage/status/journeyType` não foram alterados.

## Limitações remanescentes

- object storage real ainda não está integrado;
- smoke real de bucket continua pendente;
- auto-delete e retenção continuam pendentes;
- multi-instância segue bloqueada até object storage real + smoke + operação de piloto confirmada.

## Conclusão

Resultado da fase:

- gate operacional do object storage ficou explícito e testável;
- falhas de configuração deixaram de ser ambíguas;
- local provider continua o padrão em `dev/test`;
- multi-instância permanece `NO-GO`;
- status segue `PILOTO CONTROLADO`.
