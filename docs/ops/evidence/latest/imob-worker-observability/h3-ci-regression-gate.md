# H3 — CI Regression Gate (IMOB Worker Mutation E2E)

**Data:** 2026-06-16
**Frente:** IMOB Worker Observability & Regression Gates
**Status:** EVIDENCIADO — gate funcional, testes passando localmente com exit limpo.

---

## Objetivo

Proteger em CI os testes E2E do `ImobPostRunMutationWorker` (E2E-01..E2E-08) de forma que qualquer regressão na cadeia CC→Chat→run→worker→ImobCase bloqueie o merge.

---

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `apps/api/src/tests/imob-post-run-mutation-e2e.test.ts` | Import de `imobRunCompletedQueue`; `close()` no `after` hook |
| `package.json` (raiz) | Script `test:imob-worker:e2e` adicionado |
| `.github/workflows/imob-worker-e2e.yml` | Novo workflow CI com services postgres:16 + redis:7 |

---

## Fix de exit limpo (problema raiz descoberto)

`imobRunCompletedQueue` em `apps/api/src/queues/imobRunCompletedQueue.ts` cria um `new Queue(...)` no nível de módulo (linha 22-27), abrindo uma conexão IORedis imediatamente ao ser importado. Como o teste importa `processImobRunCompletedJob` de `imobPostRunMutationWorker.ts`, que transitivamente importa `imobRunCompletedQueue.ts`, a conexão ficava aberta após todos os testes, impedindo o processo de encerrar.

**Solução:** no `after` hook do teste, fechar a queue explicitamente:
```typescript
import { imobRunCompletedQueue } from "../queues/imobRunCompletedQueue.js";

after(async () => {
  // ... cleanup existente ...
  await closePrismaResources();
  finalizeHttpContractCleanup();
  // Close BullMQ Queue connection opened at module import to prevent event loop hang
  await imobRunCompletedQueue.close();
});
```

---

## Script raiz

```json
"test:imob-worker:e2e": "node --import tsx --test apps/api/src/tests/imob-post-run-mutation-e2e.test.ts"
```

**Uso local:**
```bash
DATABASE_URL=postgresql://... REDIS_URL=redis://... pnpm test:imob-worker:e2e
```

---

## Workflow CI

**Arquivo:** `.github/workflows/imob-worker-e2e.yml`

**Trigger:** `push` em `main`/`release/**` + `pull_request` (bloqueia merge se falhar)

**Services:**
- `postgres:16` em `localhost:5432` com health check
- `redis:7` em `localhost:6379` com health check

**Sequência:**
1. Install deps (`--frozen-lockfile --ignore-scripts`)
2. Build `@eiah/contracts` + `@repo/db` (gera cliente Prisma + compilado)
3. `pnpm --filter @repo/db migrate:deploy` — aplica migrations contra `eiah_ci`
4. `pnpm test:imob-worker:e2e` — 8 cenários E2E, timeout 5min por step

**Variáveis de ambiente no job:**
```
DATABASE_URL: postgresql://ci:ci@localhost:5432/eiah_ci?schema=public
REDIS_URL: redis://localhost:6379
NODE_ENV: test
```

---

## Resultado local pós-implementação

```
TAP version 13
ok 1 - [E2E-01] Phase 4.2 — Happy path: owner.register atualiza ImobCase
ok 2 - [E2E-02] Phase 4.2 — Idempotência: segundo processamento é no-op
ok 3 - [E2E-03] Phase 4.2 — Simulated: run simulado não muta ImobCase (I4)
ok 4 - [E2E-04] Phase 4.2 — Run error: run com status=error não muta ImobCase (I5)
ok 5 - [E2E-05] Phase 4.2 — Cross-workspace: job com workspaceId errado não muta ImobCase (I7)
ok 6 - [E2E-06] Phase 4.2 — Terminal: commission.settle fecha caso com stage=done (I1/I2)
ok 7 - [E2E-07] Phase 4.2 — lead.qualify sem txId: deve mutar (requiresTxId=false)
ok 8 - [E2E-08] Phase 4.2 — owner.register sem txId: bloqueia (requiresTxId=true)
1..8
# tests 9 | # pass 9 | # fail 0
# duration_ms 4259.215915
```

**Processo encerrou limpo** (sem SIGKILL, sem hang) após `imobRunCompletedQueue.close()` no teardown.

IDs desta execução:
- tenantId: `tenant-imob-e2e-mqh1nbqj-az7deu`
- E2E-01 caseId: `cmqh1ncjf0001nedz8qe5evdx`, runId: `cmqh1ncju0002nedzcodgcuwv`
- E2E-06 terminal caseId: `cmqh1ncxs000mnedzwsuetc0z`, runId: `cmqh1ncxv000nnedzo392rcky`

---

## Como o gate bloqueia o merge

`pull_request` no trigger do workflow CI. Se qualquer cenário E2E-01..E2E-08 falhar, `node --test` retorna código de saída 1 → step falha → job falha → PR bloqueado até correção.

---

## Nenhum código funcional alterado

- `imobPostRunMutationWorker.ts`: inalterado
- `imobCrmActionDispatcher.ts`: inalterado
- `imobRunCompletedQueue.ts`: inalterado
- `ImobCrmMutationService`: inalterado
- `buildImobCanonicalCase`: inalterado
- `chat.tsx`, CC: inalterados

Apenas o arquivo de teste recebeu o import de `imobRunCompletedQueue` e o `close()` no teardown.
