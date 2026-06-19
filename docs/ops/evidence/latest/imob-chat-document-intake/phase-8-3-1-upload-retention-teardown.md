# IMOB Chat Document Intake — Phase 8.3.1 Upload Retention Teardown

Data: 2026-06-18  
Status da frente: PILOTO CONTROLADO  
Escopo: eliminar o hang residual de teardown da suíte `upload-retention-service.test.ts` sem alterar a política de cleanup

## Objetivo

Isolar a causa precisa do hang observado na Fase 8.3 e garantir que a suíte focada do serviço de retenção finalize com exit limpo no host e no runtime canônico `local-docker`.

## Causa raiz identificada

O problema não estava na política de retenção nem em timers do `uploadRetentionWorker`.

A causa era o import de `createLogger` via barrel:

```ts
import { createLogger } from "@eiah/core";
```

Esse barrel (`packages/core/src/index.ts`) reexporta módulos amplos do core, incluindo:

- filas (`runQueue`, `actionQueue`, `maintenanceQueue`);
- eventos Redis (`events/redisPublisher`);
- módulos que puxam `@repo/db`.

Impacto observado:

- no host, a suíte unitária tentava resolver `@repo/db` e falhava por ausência de `pg` no ambiente local;
- no container, a suíte executava `8/8` asserts com sucesso, mas o processo permanecia aberto por handles laterais carregados pelo barrel.

## Correção aplicada

Os imports de logging foram trocados para o caminho direto:

```ts
import { createLogger } from "@eiah/core/logging/logger";
```

Arquivos ajustados:

- `apps/api/src/services/uploadRetentionService.ts`
- `apps/api/src/workers/uploadRetentionWorker.ts`

Resultado:

- a suíte deixou de carregar o barrel completo do core;
- nenhum handle residual de Redis/queue ficou aberto durante o teste focado;
- a regra de negócio do cleanup permaneceu intacta.

## Testes executados

### 1. Host local

Comando:

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/upload-retention-service.test.ts
```

Resultado:

- `pass`
- exit limpo

Leitura:

- a limitação anterior de `pg` no host deixou de se manifestar para esta suíte;
- a correção removeu o acoplamento lateral que puxava `@repo/db`.

### 2. Runtime canônico local-docker

Comando:

```bash
docker exec eiah-api sh -c 'cd /app/apps/api && NODE_ENV=test TSX_TSCONFIG_PATH=tsconfig.json node --import tsx --test src/tests/upload-retention-service.test.ts'
```

Resultado:

- `8/8` testes passando
- exit code `0`

Leitura:

- o hang residual de teardown foi eliminado;
- a suíte finalizou sem interrupção manual.

### 3. Gate do índice de evidências

Comando:

```bash
pnpm check:evidence-index
```

Resultado:

- `ok: true`

## Invariantes preservadas

- política de retenção permaneceu a mesma:
  - `UPLOAD_RETENTION_DAYS=30`
  - `UPLOAD_CLEANUP_ENABLED=false`
  - `UPLOAD_CLEANUP_DRY_RUN=true`
  - `UPLOAD_CLEANUP_INTERVAL_MS=21600000`
- cleanup continua fail-closed;
- `dry-run` continua default;
- `ChatAgentLauncher` não foi alterado;
- Workbench visual não foi alterado;
- regras de intake não foram alteradas;
- multi-instância continua `NO-GO`.

## Conclusão

Resultado da fase:

- causa do hang identificada com precisão;
- suíte `upload-retention-service.test.ts` passou a finalizar com exit limpo no host e no container;
- nenhuma mudança foi feita na política de cleanup;
- status permanece `PILOTO CONTROLADO`.
