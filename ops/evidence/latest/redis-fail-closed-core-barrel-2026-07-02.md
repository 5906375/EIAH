# Redis Fail-Closed Core Barrel — 2026-07-02

Data: `2026-07-02`  
Escopo: `PR-1c — remover side effect Redis residual do barrel raiz @eiah/core`

## Problema residual encontrado

Após o PR-1, o subpath `@eiah/core/events/redisPublisher` já importava sem conectar nem lançar, mas o barrel raiz `@eiah/core` ainda falhava sem env Redis porque:

- `packages/core/src/index.ts` reexportava `./queue/runAtivoUniversalQueue` e `./queue/runAtivoUniversalDLQ`;
- esses módulos instanciavam `Queue` em top-level;
- a cadeia chamava `getRedisConnection()` e avaliava Redis no import do barrel.

## Arquivos alterados

- `packages/core/src/queue/connection.ts`
- `packages/core/src/queue/connection.test.ts`
- `packages/core/src/index.ts`
- `apps/workers/maintenance-worker/src/jobs/runAtivoUniversalJob.ts`

## Correção aplicada

- `packages/core/src/queue/connection.ts` trocado para façade lazy compatível com o export público `connection`;
- `getRedisConnection()` continua fail-closed no momento de uso real;
- o barrel raiz deixou de reexportar `runAtivoUniversalQueue` e `runAtivoUniversalDLQ`;
- o consumidor identificado foi migrado para os subpaths `@eiah/core/queue/runAtivoUniversalQueue` e `@eiah/core/queue/runAtivoUniversalDLQ`.

## Saída real — import do barrel raiz sem env Redis

Comando:

```bash
env -u RUN_ATIVO_UNIVERSAL_REDIS_URL -u ACTION_QUEUE_REDIS_URL -u RUN_QUEUE_REDIS_URL -u BULLMQ_REDIS_URL -u QUEUE_REDIS_URL -u REDIS_URL -u RUN_EVENTS_REDIS_URL node --input-type=module --import tsx - <<'EOF'
try {
  const core = await import('@eiah/core');
  console.log('barrel-import-ok', typeof core.getRedisConnection, typeof core.connection);
} catch (error) {
  console.log('barrel-import-error', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
EOF
```

Saída:

```text
barrel-import-ok function object
```

## Saída real — uso real da connection sem env Redis falha fechado

Comando:

```bash
env -u RUN_ATIVO_UNIVERSAL_REDIS_URL -u ACTION_QUEUE_REDIS_URL -u RUN_QUEUE_REDIS_URL -u BULLMQ_REDIS_URL -u QUEUE_REDIS_URL -u REDIS_URL node --input-type=module --import tsx - <<'EOF'
const mod = await import('@eiah/core/queue/connection');
try {
  console.log('lazy-host-access', mod.connection.host);
} catch (error) {
  console.log('connection-use-error', error instanceof Error ? error.message : String(error));
}
EOF
```

Saída:

```text
connection-use-error connection:resolveRedisUrl: REDIS_URL_REQUIRED — Redis URL must be configured explicitly. Set REDIS_URL (or the service-specific variable) in your environment. Localhost fallback is forbidden in runtime.
```

## Saída real — uso com env explícita

Comando:

```bash
env RUN_ATIVO_UNIVERSAL_REDIS_URL=redis://queue.example:6381/5 node --input-type=module --import tsx - <<'EOF'
const mod = await import('@eiah/core/queue/connection');
console.log('connection-values', mod.connection.host, mod.connection.port, mod.connection.db, mod.connection.connectionName);
EOF
```

Saída:

```text
connection-values queue.example 6381 5 run-ativo-universal
```

## Saída real — teste focado

Comando:

```bash
node --import tsx --test --test-reporter=spec --test-force-exit packages/core/src/queue/connection.test.ts
```

Saída:

```text
✔ packages/core/src/queue/connection.test.ts (598.148859ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 604.249567
```

## Saída real — gate Redis fail-closed

Comando:

```bash
pnpm check:redis-fail-closed
```

Saída:

```text
{
  "ok": true,
  "check": "check:redis-fail-closed",
  "scannedRoots": [
    "packages",
    "apps"
  ],
  "scannedFiles": 714,
  "summary": {
    "localhostFallbacksDetected": 0,
    "topLevelRedisConstructorsDetected": 0
  }
}
```

## Saída real — typecheck do core

Comando:

```bash
pnpm --filter @eiah/core typecheck
```

Saída:

```text
Process exited with code 0
```

## Observação

- esta evidência complementa `ops/evidence/latest/redis-fail-closed-full-coverage-2026-07-02.md`;
- o foco aqui é especificamente a remoção do side effect residual do barrel raiz `@eiah/core`.
