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

## Follow-up — falha real de CI descoberta após abertura do PR (2026-07-04)

### Falha observada

A CI do PR `pr-redis-01-fail-closed-core` (base `fb11599`) falhou nos dois testes de barrel:

```text
not ok: importing the core barrel without Redis env does not instantiate Redis
not ok: importing the core barrel without Redis env does not throw after lazy queue connection
connection:resolveRedisUrl: REDIS_URL_REQUIRED
```

Stack apontava para `packages/core/src/queue/runAtivoUniversalQueue.ts:17`.

### Causa raiz

A correção original deste arquivo (reordenar `export * from "./queue/connection"` no barrel) **não era suficiente**: `runAtivoUniversalQueue.ts` e `runAtivoUniversalDLQ.ts` instanciavam `new Queue(...)` diretamente no top-level do módulo, passando `connection: getRedisConnection()`. Como módulos reexportados por um barrel ES module executam seu código de top-level no momento do import — independentemente da ordem textual do export no arquivo barrel — importar `@eiah/core` sem `REDIS_URL`/variáveis equivalentes continuava chamando `getRedisConnection()` e lançando `REDIS_URL_REQUIRED` antes mesmo de qualquer uso real da fila.

### Correção aplicada

- `packages/core/src/queue/runAtivoUniversalQueue.ts`: adicionado `createLazyQueue<T>(factory)`, um `Proxy` que só invoca a `factory()` (e portanto `getRedisConnection()`) no primeiro acesso real a uma propriedade/método do objeto retornado (ex.: `.add(...)`). `runAtivoUniversalQueue` passou a ser `createLazyQueue(() => new Queue(...))` em vez de `new Queue(...)` direto.
- `packages/core/src/queue/runAtivoUniversalDLQ.ts`: reutiliza o mesmo `createLazyQueue` importado de `runAtivoUniversalQueue.ts`; `runAtivoUniversalDLQ` segue o mesmo padrão lazy.
- Nenhum consumidor externo precisou mudar: `apps/workers/maintenance-worker/src/jobs/runAtivoUniversalJob.ts` continua chamando `runAtivoUniversalDLQ.add(...)` normalmente, pois o Proxy delega métodos com `this` corretamente vinculado ao objeto real.
- Nenhum fallback localhost/`REDIS_HOST`/`REDIS_PORT` foi reintroduzido; nenhum no-op silencioso foi introduzido — o uso real da fila (`.add(...)`) continua lançando `REDIS_URL_REQUIRED` quando a env Redis está ausente.

### Saída real — teste focado do publisher (reexecução pós-fix)

Comando:

```bash
node --import tsx --test --test-reporter=spec --test-force-exit packages/core/src/events/redisPublisher.test.ts
```

Saída:

```text
✔ importing the publisher module without Redis env does not instantiate Redis
✔ importing the core barrel without Redis env does not instantiate Redis
✔ publishEvent without Redis env fails closed
✔ publishEvent uses explicit RUN_EVENTS_REDIS_URL before REDIS_URL
✔ closeRedisPublisher resets the singleton
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

### Saída real — teste focado da connection (reexecução pós-fix)

Comando:

```bash
node --import tsx --test --test-reporter=spec --test-force-exit packages/core/src/queue/connection.test.ts
```

Saída:

```text
✔ importing the queue connection module without Redis env does not throw
✔ importing the core barrel without Redis env does not throw after lazy queue connection
✔ using getRedisConnection without Redis env fails closed
✔ using the lazy connection facade without Redis env fails closed on property access
✔ getRedisConnection uses explicit Redis env when configured
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

### Saída real — agregado packages/core (reexecução pós-fix)

Comando:

```bash
TEST_FILES="$(find packages/core/src -name '*.test.ts' -type f)" && node --import tsx --test --test-force-exit $TEST_FILES
```

Resultado: `66 tests, 61 pass, 4 fail, 1 skipped`. Os dois `not ok` de barrel Redis **desapareceram**. As 4 falhas remanescentes (`highGlobalCoverage.e2e.test.ts`, `memory.jobs.test.ts`, `postgresVectorStore.test.ts`, `rbac.fail-closed.test.ts`) são pré-existentes e **não relacionadas a Redis** — todas falham por `Error: DATABASE_URL não definido`, dependência de Postgres ausente neste sandbox. Essa limitação já é conhecida de evidências anteriores (mesma classe de bloqueio ambiental documentada nos PRs de IMOB artifact capabilities e billing webhook signature).

### Saída real — gate Redis fail-closed (reexecução pós-fix)

Comando:

```bash
pnpm check:redis-fail-closed
```

Saída:

```text
{
  "ok": true,
  "check": "check:redis-fail-closed",
  "scannedRoots": ["packages", "apps"],
  "scannedFiles": 718,
  "summary": { "localhostFallbacksDetected": 0, "topLevelRedisConstructorsDetected": 0 }
}
```

### Saída real — typecheck do core (reexecução pós-fix)

Comando:

```bash
pnpm --filter @eiah/core typecheck
```

Saída: exit code 0, sem erros.

### Conclusão do follow-up

- A falha real de CI expôs que a evidência original (`redis-fail-closed-core-barrel-2026-07-02.md`, seção anterior) estava **incompleta**: o import do barrel `@eiah/core` sem env Redis só ficou de fato seguro depois desta correção adicional em `runAtivoUniversalQueue.ts`/`runAtivoUniversalDLQ.ts`.
- Com o `createLazyQueue`/`Proxy`, o barrel raiz agora importa sem instanciar Redis e sem lançar `REDIS_URL_REQUIRED`, preservando fail-closed no uso real.
- Este follow-up não fecha nem declara `DONE` para F4/F5/economy, nem para qualquer frente fora de Redis fail-closed core. As falhas de `DATABASE_URL` no agregado de `packages/core` permanecem como limitação de sandbox documentada, não como pendência deste PR.

## Follow-up 2 — incompatibilidade de runtime Node no CI (2026-07-04)

### Falha observada

A CI do PR falhou no passo `pnpm check:redis-fail-closed` com:

```text
node --experimental-strip-types scripts/checkRedisFailClosed.ts
node: bad option: --experimental-strip-types
ELIFECYCLE Command failed with exit code 9
```

### Causa

Incompatibilidade de runtime: a versão do Node usada pelo GitHub Actions não aceita a flag `--experimental-strip-types`, usada no script `check:redis-fail-closed` do `package.json`. Não é um problema de lógica do gate.

### Correção

- `package.json`: `check:redis-fail-closed` passou de `node --experimental-strip-types scripts/checkRedisFailClosed.ts` para `node --import tsx scripts/checkRedisFailClosed.ts`, seguindo o mesmo padrão já usado por outros gates do repositório (`check:tracked-ignored-files`, `check:rbac-fail-closed`, `check:guardrail-ledger-noop`, entre outros).
- Nenhuma linha de lógica do gate (`scripts/checkRedisFailClosed.ts`) foi alterada.

### Saída real após o ajuste

```bash
pnpm check:redis-fail-closed
```

```text
{
  "ok": true,
  "check": "check:redis-fail-closed",
  "scannedRoots": ["packages", "apps"],
  "scannedFiles": 718,
  "summary": { "localhostFallbacksDetected": 0, "topLevelRedisConstructorsDetected": 0 }
}
```

```bash
pnpm --filter @eiah/core typecheck
```

Saída: exit code 0, sem erros.

### Conclusão

- Falha era exclusivamente de compatibilidade de runtime Node no CI, não de lógica Redis.
- Nenhuma lógica Redis foi alterada neste follow-up.
- DONE global não é declarado.
