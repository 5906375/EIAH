# Redis Fail-Closed Full Coverage — 2026-07-02

Data: `2026-07-02`  
Escopo: `PR-1 — Redis fail-closed no core publisher`

## Arquivos alterados

- `packages/core/src/events/redisPublisher.ts`
- `packages/core/src/events/redisPublisher.test.ts`
- `scripts/checkRedisFailClosed.ts`
- `package.json`
- `.github/workflows/ci.yml`

## Resumo do P0 corrigido

- removido `new Redis(...)` em top-level do publisher do core;
- removido fallback permissivo para `127.0.0.1` / `REDIS_HOST` / `REDIS_PORT`;
- preservada a precedência `RUN_EVENTS_REDIS_URL ?? REDIS_URL`;
- `publishEvent(...)` agora faz lazy-init e falha fechado sem env explícita;
- `closeRedisPublisher()` reseta o singleton para manter compatibilidade com testes.

## Confirmação do publisher

- não há fallback localhost/`127.0.0.1` em `packages/core/src/events/redisPublisher.ts`;
- `publishEvent(...)` sem env falha com `redisPublisher: REDIS_URL_REQUIRED`;
- `publishEvent(...)` com env explícita usa a URL de `RUN_EVENTS_REDIS_URL`.

## Saída real — teste focado do publisher

Comando:

```bash
node --import tsx --test --test-reporter=spec --test-force-exit packages/core/src/events/redisPublisher.test.ts
```

Saída:

```text
✔ packages/core/src/events/redisPublisher.test.ts (590.302305ms)
ℹ tests 1
ℹ suites 0
ℹ pass 1
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 596.675182
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

## Saída real — import do subpath do publisher sem env Redis

Comando:

```bash
env -u RUN_EVENTS_REDIS_URL -u REDIS_URL node --input-type=module --import tsx - <<'EOF'
const mod = await import('@eiah/core/events/redisPublisher');
console.log('publisher-import-ok', typeof mod.publishEvent, typeof mod.closeRedisPublisher);
EOF
```

Saída:

```text
publisher-import-ok function function
```

## Saída real — publish sem env falha fechado

Comando:

```bash
env -u RUN_EVENTS_REDIS_URL -u REDIS_URL node --input-type=module --import tsx - <<'EOF'
const mod = await import('@eiah/core/events/redisPublisher');
try {
  await mod.publishEvent('events:test', { ok: true });
} catch (error) {
  console.log('publish-no-env-error', error instanceof Error ? error.message : String(error));
}
EOF
```

Saída:

```text
publish-no-env-error redisPublisher: REDIS_URL_REQUIRED — Redis URL must be configured explicitly. Set REDIS_URL (or the service-specific variable) in your environment. Localhost fallback is forbidden in runtime.
```

## Saída real — precedência explícita de RUN_EVENTS_REDIS_URL

Comando:

```bash
node --input-type=module --import tsx - <<'EOF'
const mod = await import(new URL('./packages/core/src/events/redisPublisher.ts', `file://${process.cwd()}/`).href);
process.env.RUN_EVENTS_REDIS_URL = 'redis://run-events.example:6380/4';
process.env.REDIS_URL = 'redis://fallback.example:6379/0';
const usedUrls = [];
mod.setRedisPublisherFactoryForTests((url) => ({
  publish: async () => {
    usedUrls.push(url);
    return 1;
  },
  quit: async () => 'OK',
  disconnect: () => undefined,
}));
await mod.publishEvent('events:test', { ok: true });
console.log('used-url', usedUrls[0]);
await mod.closeRedisPublisher();
mod.setRedisPublisherFactoryForTests(null);
EOF
```

Saída:

```text
used-url redis://run-events.example:6380/4
```

## Observação relevante fora do escopo deste PR

Validação adicional do barrel raiz `@eiah/core` sem env Redis:

```bash
env -u RUN_EVENTS_REDIS_URL -u REDIS_URL node --input-type=module --import tsx - <<'EOF'
try {
  await import('@eiah/core');
  console.log('barrel-import-ok');
} catch (error) {
  console.log('barrel-import-error', error instanceof Error ? error.message : String(error));
}
EOF
```

Saída:

```text
barrel-import-error connection:parseRedisUrl: invalid Redis URL "${REDIS_URL}"
```

Interpretação:

- o subpath `@eiah/core/events/redisPublisher` ficou saneado;
- o barrel raiz `@eiah/core` ainda herda um side effect pré-existente em `packages/core/src/queue/connection.ts`, fora do escopo autorizado deste PR.

## Observação sobre execução

- `pnpm check:evidence-index` foi executado após a atualização do índice e passou localmente.
