# IMOB Chat Document Intake — Phase 8.5 Object Storage Real Adapter NO-GO

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: verificação de pré-condição para adapter real s3-compatible e smoke real de bucket

## Objetivo

Validar se havia decisão explícita de provider e configuração segura disponível via `env/secrets` para implementar um adapter real s3-compatible no `ObjectStorageProvider` e executar smoke real de bucket.

## Pré-condição verificada

Variáveis checadas no ambiente atual, sem expor valores:

- `STORAGE_PROVIDER`
- `OBJECT_STORAGE_ADAPTER`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_FORCE_PATH_STYLE`

Resultado:

- todas as variáveis acima estavam `unset` no host desta execução;
- não existe bucket, endpoint, credencial ou seleção explícita de provider disponível de forma segura;
- a build continua sem dependência/adapter real instalado para `s3-compatible`.
- o adapter técnico desta frente permanece `s3-compatible`;
- `Cloudflare R2` fica declarado como provider-alvo preferencial para o primeiro smoke real;
- `AWS S3` fica declarado como provider alternativo compatível para o mesmo contrato.

## Decisão da fase

Como a pré-condição falhou, a Fase 8.5 foi encerrada em `NO-GO` operacional sem alterar código de integração real.

Aplicação direta da regra desta fase:

- não implementar integração falsa;
- não adicionar SDK sem decisão/configuração operacional válida;
- não executar smoke de bucket inexistente;
- não alterar o comportamento fail-closed já vigente para `STORAGE_PROVIDER=object`.

Escopo decisório desta fase:

- não declarar `AWS S3` como provisionado;
- não declarar `Cloudflare R2` como provisionado;
- manter a decisão técnica no nível de `adapter s3-compatible`, não no nível de provider já ativado.

## Validações executadas

### 1. Checagem segura de env

Comando:

```bash
for v in STORAGE_PROVIDER OBJECT_STORAGE_ADAPTER OBJECT_STORAGE_ENDPOINT OBJECT_STORAGE_REGION OBJECT_STORAGE_BUCKET OBJECT_STORAGE_ACCESS_KEY_ID OBJECT_STORAGE_SECRET_ACCESS_KEY OBJECT_STORAGE_FORCE_PATH_STYLE; do if [ -n "${!v+x}" ] && [ -n "${!v}" ]; then echo "$v=set"; else echo "$v=unset"; fi; done
```

Resultado:

- todas as entradas retornaram `unset`.

### 2. Estado atual do gate e referências do adapter

Comando:

```bash
rg -n 'aws-sdk|@aws-sdk|minio|s3-compatible|OBJECT_STORAGE_ADAPTER' package.json pnpm-lock.yaml apps/api -g '!**/dist/**'
```

Resultado:

- contrato `s3-compatible` segue declarado em `apps/api/src/services/storageProvider.ts`;
- `Cloudflare R2` é compatível com esse contrato e passa a ser o alvo preferencial do primeiro smoke operacional;
- `AWS S3` permanece alternativa compatível com o mesmo contrato;
- não há SDK real de object storage instalado nesta build;
- o gate fail-closed da Fase 8.2 continua sendo o único comportamento seguro disponível.

### 3. Teste focado do provider

Comando:

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/storage.provider.test.ts
```

Resultado:

- `pass`
- exit `0`

Leitura:

- `local` continua funcional;
- `object` continua falhando fechado com `reasonCode` seguro;
- nenhuma regressão foi introduzida nesta checagem.

### 4. Gate do índice de evidências

Comando:

```bash
pnpm check:evidence-index
```

Resultado:

- `ok: true`

## Invariantes preservadas

- `ChatAgentLauncher` não foi alterado;
- Workbench visual não foi alterado;
- regras de intake não foram alteradas;
- draft store, retention e observability não foram alterados;
- nenhum secret foi impresso;
- nenhum fallback silencioso para local foi introduzido em modo `object`.

## Decisão operacional

- Object storage real: `NO-GO`
- Multi-instância: `NO-GO`

Motivo:

- ausência de `bucket`, `endpoint`, credenciais e seleção explícita de provider no ambiente;
- ausência de smoke real `put/get/exists/delete` contra bucket;
- ausência de adapter real instalado nesta build.

## Próximo passo mínimo para destravar

Disponibilizar, fora do repositório:

- `OBJECT_STORAGE_ADAPTER=s3-compatible`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`

Após isso:

1. decidir o provider do primeiro smoke dentro do contrato `s3-compatible`, com `Cloudflare R2` como alvo preferencial e `AWS S3` como alternativa compatível;
2. instalar o SDK mínimo aprovado;
3. implementar o adapter real separado do core do provider;
4. executar smoke real `put/get/exists/delete`;
5. só então reavaliar `GO/NO-GO` de multi-instância.
