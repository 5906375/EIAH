# IMOB Chat Document Intake — Phase 8 Storage Provider

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: abstração de storage para `UploadedDocument`/DOCX, preservando modo local e preparando object storage configurável por ambiente

## Objetivo

Substituir o acoplamento direto ao filesystem por um contrato de storage reutilizável no backend IMOB, sem alterar regras de negócio do intake e sem quebrar `upload/confirm/export` no modo local atual.

## Implementação

Arquivos principais:

- `apps/api/src/services/storageProvider.ts`
- `apps/api/src/services/storage.ts`
- `apps/api/src/routes/uploads.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/services/imob/imobAttachmentValidation.ts`
- `apps/api/src/workers/runWorkerJ360Output.ts`

Contrato introduzido:

- `putObject`
- `getObject`
- `exists`
- `deleteObject`
- `getAbsolutePath` opcional para compatibilidade local

Providers cobertos:

- `LocalStorageProvider`
  - mantém persistência em `UPLOADS_DIR`;
  - preserva compatibilidade com chaves legadas sem escopo;
  - gera `storageKey` scoped por `tenantId/workspaceId` nos fluxos autenticados alterados nesta fase.
- `ObjectStorageProvider`
  - habilitado apenas por `env`;
  - exige `OBJECT_STORAGE_BUCKET`;
  - aceita `OBJECT_STORAGE_PREFIX`;
  - depende de adapter real/fake via `ObjectStorageClient`, sem credenciais no repositório.

Garantias adicionadas:

- `storageKey` lógico preservado no `UploadedDocument`;
- escopo por `tenantId/workspaceId` no caminho lógico;
- bloqueio de path traversal e caminhos absolutos;
- leitura por provider em rotas/serviços que antes dependiam de path absoluto local.

## Impacto funcional

### Uploads genéricos

`POST /api/uploads` agora persiste via provider e grava `storageKey` no formato:

```text
{tenantId}/{workspaceId}/{uuid}.{ext}
```

`GET /api/uploads/:id` deixou de usar `sendFile` e passou a responder o buffer obtido pelo provider configurado.

### Intake IMOB

`POST /api/imob/chat/intake/upload` agora persiste o DOCX com escopo:

- `tenantId`
- `workspaceId`
- `agentSlug=imob-intake`

O `confirm` não mudou de regra de negócio; ele continua consumindo o draft e o `storageRef` permanece compatível.

### Leitura posterior de anexos

Leituras que antes exigiam path local passaram a ler buffer via provider:

- validação de anexos IMOB;
- coleta de evidência PDF no worker `runWorkerJ360Output`.

## Variáveis de ambiente

Incluídas no `.env.template`:

```dotenv
STORAGE_PROVIDER=local
OBJECT_STORAGE_BUCKET=
OBJECT_STORAGE_PREFIX=uploads
```

Observação:

- `local` continua padrão em `dev/test`;
- `object` fica preparado em código, mas não deve ser ativado sem adapter/credenciais reais fora do repositório.

## Testes executados

### 1. Unitário do provider

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && ... node --import tsx --test src/tests/storage.provider.test.ts'
```

Resultado observado:

- `5/5` testes passando com exit limpo;
- round-trip local validado;
- compatibilidade com chave legada validada;
- path traversal bloqueado;
- fallback local quando `STORAGE_PROVIDER` não está definido;
- adapter fake de object storage validado.

### 2. Lifecycle de intake

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && ... node --import tsx --test src/tests/imob-intake-lifecycle.test.ts'
```

Resultado observado:

- `LC-01` a `LC-06` apareceram como `ok`;
- `LC-03` confirma `uploadedDocument` persistido;
- nova asserção confirma `storageKey` com prefixo `tenantId/workspaceId`;
- ao final, o runner permaneceu aberto por handle residual de teardown e exigiu interrupção manual.

Leitura:

- a regressão funcional não se manifestou;
- o bloqueio restante é do runner de teste integrado, não do provider de storage.

### 3. Upload/download via rota

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && ... node --import tsx --test src/tests/uploads.storage-provider.test.ts'
```

Resultado observado:

- `POST /api/uploads` retornou `200`;
- `GET /api/uploads/:id` retornou `200`;
- a asserção de round-trip do buffer apareceu como `ok`;
- a suíte apresentou o mesmo hang residual de teardown após as asserções.

### 4. Export de intake

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && ... node --import tsx --test src/tests/imob-intake-export.test.ts'
```

Resultado observado durante a rodada integrada:

- cenários `EXP-01` a `EXP-12` permaneceram passando;
- não houve evidência de quebra no export ao manter o storage local.

### 5. Host local fora do container

Comando tentado:

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test ...
```

Limitação observada:

- resolução local falhou por dependência de runtime do workspace (`pg`) fora do container;
- a validação canônica desta fase foi mantida em `local-docker`.

## Evidência de segurança e compatibilidade

Confirmações desta fase:

- nenhum `storageKey` expõe PII;
- nenhum path absoluto do host é persistido no banco;
- `tenantId/workspaceId` entram no caminho lógico do arquivo;
- uploads locais continuam acessíveis;
- `ChatAgentLauncher` não foi alterado;
- shell visual do Workbench não foi alterado;
- regras de negócio do intake não foram alteradas;
- backend export não foi alterado além da leitura compatível com provider;
- status permanece `PILOTO CONTROLADO`.

## Limitações remanescentes

- o modo `object` está preparado contratualmente, mas ainda sem adapter real conectado a S3/GCS/R2;
- drafts continuam in-memory;
- auto-delete/retenção continuam pendentes;
- há um hang residual de teardown em parte das suítes integradas do API container.

## Conclusão

Resultado da fase:

- abstração de storage implementada;
- modo local preservado;
- object storage preparado por configuração;
- evidência funcional suficiente coletada em `local-docker`;
- multi-instância continua `NO-GO` até ativação real de object storage e demais pendências operacionais.
