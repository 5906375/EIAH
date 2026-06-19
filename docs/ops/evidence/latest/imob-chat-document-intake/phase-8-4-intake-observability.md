# IMOB Chat Document Intake — Phase 8.4 Intake Observability

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: observabilidade operacional mínima para storage, draft store, retention e gate de object storage do piloto IMOB

## Objetivo

Adicionar observabilidade mínima e testável ao piloto do Document Intake sem alterar regras de negócio, sem expor PII e sem mascarar o estado `NO-GO` da multi-instância.

## Implementação

Arquivos principais:

- `apps/api/src/services/imob/intake/imobIntakeObservability.ts`
- `apps/api/src/services/imob/intake/imobContractDraftService.ts`
- `apps/api/src/services/storageProvider.ts`
- `apps/api/src/services/uploadRetentionService.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/routes/metrics-prom.ts`
- `apps/api/src/tests/imob-intake-observability.test.ts`
- `docs/ops/imob-chat-intake-pilot-runbook.md`

## Eventos/logs adicionados

Eventos estruturados adicionados:

- `storage_provider_mode`
- `draft_store_mode`
- `upload_received`
- `draft_created`
- `draft_consumed`
- `draft_expired`
- `draft_scope_mismatch`
- `upload_retention_skipped`
- `upload_retention_candidates`
- `upload_retention_deleted`
- `upload_retention_failed`
- `object_storage_gate_failed`

Regras aplicadas:

- payloads sem `fileName`, `documentHash`, `pendingItems`, `riskFlags`, `extractedLease`, emails ou conteúdo mascarado;
- `reasonCode` explícito para gate de object storage:
  - `OBJECT_STORAGE_BUCKET_REQUIRED`
  - `OBJECT_STORAGE_ADAPTER_REQUIRED`
  - `OBJECT_STORAGE_ADAPTER_UNSUPPORTED`
  - `OBJECT_STORAGE_ENV_INCOMPLETE`
  - `OBJECT_STORAGE_REAL_ADAPTER_UNAVAILABLE`
- imports diretos de logging, sem reabrir o barrel amplo `@eiah/core`.

## Counters adicionados

Counters em memória, renderizados também em `/metrics/prom`:

- `imob_intake_storage_provider_mode_total`
- `imob_intake_draft_store_mode_total`
- `imob_intake_uploads_received_total`
- `imob_intake_drafts_created_total`
- `imob_intake_drafts_consumed_total`
- `imob_intake_drafts_expired_total`
- `imob_intake_drafts_scope_mismatch_total`
- `imob_intake_cleanup_skipped_total`
- `imob_intake_cleanup_candidates_total`
- `imob_intake_cleanup_deleted_total`
- `imob_intake_cleanup_failures_total`
- `imob_intake_object_storage_gate_failures_total`

## Testes executados

### 1. Host local — observabilidade focada

Comando:

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/imob-intake-observability.test.ts
```

Resultado:

- `pass`
- exit `0`

Cobertura:

- eventos de draft e retention emitidos;
- logs sem PII;
- gate de object storage com `reasonCode` seguro;
- imports sem barrel amplo `@eiah/core`.

### 2. Host local — provider, retention e draft store

Comandos:

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/storage.provider.test.ts apps/api/src/tests/upload-retention-service.test.ts apps/api/src/tests/imob-intake-observability.test.ts
NODE_ENV=test TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/imob-contract-draft-service.test.ts
```

Resultado:

- `pass`
- exits limpos

Leitura:

- storage provider continuou fail-closed;
- retention continuou com `dry-run` default e delete seguro;
- draft store preservou comportamento `memory|redis`.

### 3. Runtime canônico local-docker — observabilidade

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && NODE_ENV=test TSX_TSCONFIG_PATH=tsconfig.json node --import tsx --test src/tests/imob-intake-observability.test.ts'
```

Resultado:

- `3/3` testes passando
- exit `0`

### 4. Runtime canônico local-docker — draft store com Redis

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && NODE_ENV=test DRAFT_STORE=redis DRAFT_STORE_REDIS_URL=redis://eiah-redis:6379/0 TSX_TSCONFIG_PATH=tsconfig.json node --import tsx --test src/tests/imob-contract-draft-service.test.ts'
```

Resultado:

- `20/20` testes passando
- exit `0`

Leitura:

- a nova observabilidade não regrediu o draft store Redis do piloto.

### 5. Gate do índice de evidências

Comando:

```bash
pnpm check:evidence-index
```

Resultado:

- `ok: true`

## Runbook

O runbook do piloto passou a explicitar como acompanhar:

- uploads/dia (`imob_intake_uploads_received_total`);
- drafts criados/consumidos/expirados;
- cleanup candidates/failures;
- modo do storage provider;
- status do gate de object storage.

## Invariantes preservadas

- `ChatAgentLauncher` não foi alterado;
- Workbench visual não foi alterado;
- política de retention não mudou;
- `UPLOAD_CLEANUP_ENABLED=false` continua default;
- `UPLOAD_CLEANUP_DRY_RUN=true` continua default;
- object storage continua fail-closed;
- multi-instância continua `NO-GO`.

## Conclusão

Resultado da fase:

- observabilidade mínima do piloto implementada;
- logs e counters sem PII;
- `/metrics/prom` passou a expor também os counters do intake;
- object storage continua explicitamente `NO-GO` quando configurado sem adapter real;
- status permanece `PILOTO CONTROLADO`.
