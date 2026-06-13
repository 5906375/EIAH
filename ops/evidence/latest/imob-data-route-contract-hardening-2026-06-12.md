# IMOB Data Route Contract Hardening — 2026-06-12

## Escopo

Evidenciar o hardening que destravou os open handles nos contract tests HTTP usados pela frente `PR-IMOB-DATA-01 Frente B`, com foco em:

- `POST /api/shadow-executions/preview`
- `POST /api/runs`
- `POST /api/agents/discovery|negotiate|execute`

## Causa raiz confirmada

1. Clientes Redis e BullMQ eram inicializados em escopo de modulo no `@eiah/core`, abrindo conexoes ja no `import`.
2. Os tests HTTP fechavam apenas `prismaGlobal`, mas o app abria clients tenantizados e recursos auxiliares adicionais.
3. O fluxo `agents/execute` deixava socket Redis residual no processo de teste, exigindo teardown dedicado do processo.

## Ajustes aplicados

- `packages/core/src/events/redisPublisher.ts`
- `packages/core/src/events/redisPublisher.js`
- `packages/core/src/events/runEventPublisher.js`
- `packages/core/src/queue/runAtivoUniversalQueue.ts`
- `packages/core/src/queue/runAtivoUniversalQueue.js`
- `packages/core/src/queue/runAtivoUniversalDLQ.ts`
- `packages/core/src/queue/runAtivoUniversalDLQ.js`
- `packages/db/src/client.ts`
- `packages/db/src/client.js`
- `apps/api/src/tests/support/httpContractCleanup.ts`
- `apps/api/src/tests/shadow-executions.contract.test.ts`
- `apps/api/src/tests/runs.imob-action.contract.test.ts`
- `apps/api/src/tests/agents.interop.contract.test.ts`

Resumo do hardening:

- lazy init de Redis e BullMQ para remover side effects no import
- `allowExitOnIdle: true` no `pg.Pool`
- cleanup explicito de transports/event publishers/policy store/redis auxiliar
- destruicao de sockets residuais `5433/6379` nos contract tests HTTP
- encerramento explicito do processo no `agents.interop.contract.test.ts` apos teardown completo

## Execucao real

### 1. Shadow Executions Preview

Comando:

```bash
node --test --import tsx apps/api/src/tests/shadow-executions.contract.test.ts
```

Resultado:

```text
ok 1 - POST /api/shadow-executions/preview rejects invalid IMOB action before persisting preview
1..1
# pass 1
EXIT:0
```

### 2. Runs IMOB Action Contract

Comando:

```bash
node --test --import tsx apps/api/src/tests/runs.imob-action.contract.test.ts
```

Resultado:

```text
ok 1 - POST /api/runs rejects invalid IMOB metadata.action when domain is imob
1..1
# pass 1
EXIT:0
```

### 3. Agents Interop Contract

Comando:

```bash
node --test --import tsx apps/api/src/tests/agents.interop.contract.test.ts
```

Resultado:

```text
ok 1 - POST /api/agents/discovery retorna ações disponíveis por tenant
ok 2 - POST /api/agents/discovery falha fechado sem policy explícita
ok 3 - POST /api/agents/negotiate negocia versão e contrato
ok 4 - POST /api/agents/execute enfileira run e permite verificação via ledger após reconciliação
1..4
# pass 4
EXIT:0
```

## O que esta evidencia prova

- os contract tests HTTP da frente estrutural IMOB deixaram de expirar por open handles
- os contratos de rota principais voltaram a encerrar com `EXIT:0`
- o bootstrap `@eiah/core`/`@repo/db` foi endurecido para uso seguro em processos curtos de teste

## Limites desta evidencia

- nao substitui a Query 1 tenant-scoped do `PR-IMOB-DATA-01`
- nao fecha a Frente A de mapeamento legado em KPI
- nao materializa artefato de CI remoto; a evidencia desta fase e local, com execucao real
