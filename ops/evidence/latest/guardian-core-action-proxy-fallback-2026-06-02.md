# Guardian core action proxy fallback — 2026-06-02

## Objetivo

Corrigir falha de runtime `ToolContract missing: guardian.checkRuntimeHealth@1.0.0` no fluxo do `guardian` quando `MCP_PROXY_ALL_ACTIONS` está habilitado.

## Causa

- o planner do `guardian` passou a emitir steps reais como `guardian.checkRuntimeHealth`
- o worker já permitia essas actions no catálogo do tenant/agente
- porém o caminho `mcpExecutorTool.run(...)` ainda tentava resolver `ToolContract` antes de considerar que a action já existia no catálogo core
- como actions internas do `guardian` não nascem como `ToolContract`, o proxy abortava com `ToolContract missing`

## Ajuste aplicado

- `apps/api/src/workers/runWorker.ts`
  - adiciona fallback local via `executeRegisteredAction(...)` antes de consultar `ToolRegistry`
  - mantém o proxy MCP para tools externas e preserva o gate de actions permitidas
  - registra auditoria com `executionMode: "core_local"` para essas actions internas
- `apps/api/src/workers/runWorkerActionResolution.ts`
  - expõe `resolveLocallyExecutableAction(...)` para decisão pura do catálogo local
- `apps/api/src/tests/run-worker-action-resolution.test.ts`
  - cobre a resolução de actions core disponíveis para fallback local

## Resultado esperado

- actions internas do `guardian` executam localmente mesmo com `MCP_PROXY_ALL_ACTIONS=true`
- tools externas continuam exigindo `ToolContract`
- o erro `ToolContract missing: guardian.checkRuntimeHealth@1.0.0` deixa de ocorrer

## Validação

- `TSX_TSCONFIG_PATH=apps/api/tsconfig.json node --import tsx --test apps/api/src/tests/run-worker-action-resolution.test.ts apps/api/src/tests/guardian-plan-manager.test.ts apps/api/src/tests/run-events-redis-transport.test.ts apps/api/src/tests/trust-score-engine.test.ts`
- `pnpm check:self-service-runtime-graph`
- `pnpm check:frontend-duplication`
