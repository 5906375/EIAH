# Run Events Redis Outbox Readiness — 2026-06-02

## Objetivo

Eliminar o erro recorrente:

- `runEvents.redis_outbox_error Error: Stream isn't writeable and enableOfflineQueue options is false`

durante a gravação/publicação de eventos de run logo após boot/restart do serviço `api`.

## Causa raiz

O transporte de `runEvents` criava um client `ioredis` com:

- `enableOfflineQueue: false`

e emitia `xadd`/`publish` sem garantir que o socket já estivesse `ready`. Em janelas de boot, reconnect ou `lazy` init, o Redis ainda podia estar em `wait`/`connecting`, gerando erro de stream não gravável.

## Mudança aplicada

- novo helper compartilhado em `apps/api/src/services/runEventsRedisTransport.ts`
- `runEvents.ts` passou a:
  - abrir publisher com `lazyConnect: true`
  - aguardar readiness antes de `xadd`/`publish`
  - degradar Redis para best-effort sem quebrar `recordRunEvent`
- `runEventOutbox.ts` passou a reutilizar a mesma lógica de readiness/retry

## Cobertura

Arquivo:

- `apps/api/src/tests/run-events-redis-transport.test.ts`

Casos cobertos:

1. client em `wait` conecta antes de tentar `ping`
2. client em `connecting` faz retry até ficar `ready`

## Validação

Comandos executados:

```bash
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/run-events-redis-transport.test.ts
TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/trust-score-engine.test.ts
```

## Impacto

- sem alteração visual ou responsiva
- correção restrita ao backend de eventos/outbox
- reduz ruído operacional após restart e diminui perda best-effort de fanout Redis
