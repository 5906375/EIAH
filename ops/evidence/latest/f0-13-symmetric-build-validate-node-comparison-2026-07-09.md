# F0.13 — Symmetric build_validate Node comparison

## Data
2026-07-09

## Objetivo
Repetir a comparação Node 20 vs Node 22 dos comandos reais de `build_validate` em ambiente simétrico, separando falha estrutural de `core_tests` da análise de runtime.

## Escopo
Este PR é audit-only/evidencial. Não altera workflows, `package.json`, lockfile, scripts, runtime, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Contexto F0.12
- F0.12 foi inconclusivo.
- Node 20 teve `12 PASS / 1 FAIL`.
- Node 22 teve `6 PASS / 7 FAIL`.
- Node 22 foi contaminado por ambiente local no host (`ERR_PNPM_META_FETCH_FAIL`, `EACCES`, ausência subsequente de `prisma`/`tsx`).
- `core_tests` falhou nos dois lados.

## Ambiente de comparação

| Item | Node 20 | Node 22 |
| --- | --- | --- |
| Estratégia | container limpo `node:20-bookworm` + snapshot via `git archive HEAD` | container limpo `node:22-bookworm` + snapshot via `git archive HEAD` |
| Node version | `v20.19.6` | `v22.23.1` |
| pnpm version | `10.12.4` | `10.12.4` |
| Instalação limpa? | sim | sim |
| Mesmo commit? | sim, `78b87a5766205a5057edde025329294c3f475e11` | sim, `78b87a5766205a5057edde025329294c3f475e11` |
| Mesmo diretório? | sim, `/work` | sim, `/work` |
| Mesmas permissões? | sim, `uid=0(root) gid=0(root)` | sim, `uid=0(root) gid=0(root)` |
| Limitações | warning de `engines.node` por baseline `>=22 <23` | sem warning de engine; imagem precisou ser baixada antes da execução |

## Comandos auditados

| Ordem | Comando build_validate | Node 20 | Node 22 | Diferença relevante |
| --- | --- | --- | --- | --- |
| 1 | `test ! -f package-lock.json && test ! -f yarn.lock && test ! -f bun.lockb && test ! -f bun.lock && EXTRA_PNPM_LOCKFILES=$(find . -path './node_modules' -prune -o -name 'pnpm-lock.yaml' -print | grep -v '^./pnpm-lock.yaml$' || true) && test -z "$EXTRA_PNPM_LOCKFILES"` | PASS `0s` | PASS `0s` | nenhuma |
| 2 | `pnpm install --frozen-lockfile --ignore-scripts` | PASS `59s` | PASS `53s` | nenhuma regressão; Node 20 só emite warning de engine |
| 3 | `pnpm lint` | PASS `4s` | PASS `0s` | nenhuma |
| 4 | `pnpm --filter @eiah/contracts build` | PASS `2s` | PASS `2s` | nenhuma |
| 5 | `pnpm --filter @repo/db build` | PASS `14s` | PASS `10s` | nenhuma |
| 6 | `TEST_FILES="$(find packages/core/src -name '*.test.ts' -type f)"; if [ -n "$TEST_FILES" ]; then echo "$TEST_FILES" \| tr '\n' '\0' \| xargs -0 node --test --import tsx; else echo "No @eiah/core tests found. Skipping root test step."; fi` | FAIL `123`, `3s` | FAIL `123`, `4s` | falha estrutural comum; não usar como regressão Node 22 |
| 7 | `pnpm check:src-dist-route-parity` | PASS `2s` | PASS `1s` | nenhuma |
| 8 | `pnpm check:ledger-bundle-smoke` | PASS `1s` | PASS `1s` | nenhuma |
| 9 | `pnpm check:rbac-fail-closed` | PASS `1s` | PASS `0s` | nenhuma |
| 10 | `pnpm check:redis-fail-closed` | PASS `1s` | PASS `1s` | nenhuma |
| 11 | `pnpm check:guardrail-ledger-noop` | PASS `0s` | PASS `0s` | nenhuma |
| 12 | `pnpm check:worker-topology` | PASS `1s` | PASS `1s` | nenhuma |
| 13 | `TMPDIR=/tmp TMP=/tmp TEMP=/tmp ESBUILD_TMPDIR=/tmp NODE_ENV=production pnpm --filter apps/web build` | PASS `0s` | PASS `1s` | mesmo comportamento: `No projects matched the filters in "/work"` |

## Tratamento de core_tests
- Resultado Node 20: `FAIL 123`.
- Resultado Node 22: `FAIL 123`.
- Nos dois lados, o ponto de quebra relevante foi o mesmo: `DATABASE_URL não definido (necessário para inicializar PrismaPg/pg Pool)` ao executar `packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts`.
- Classificação: falha estrutural comum, não regressão específica de Node 22.
- Recomendação: triagem dedicada do comando de `Run Tests` do `build_validate`, já que ele hoje puxa um teste de `packages/core` com dependência real de banco sem provisionamento correspondente no job.

## Resultado consolidado

| Runtime | PASS | FAIL | Falhas ambientais | Falhas estruturais | Observação |
| --- | --- | --- | --- | --- | --- |
| Node 20 | 12 | 1 | warning de `engines.node` por baseline `>=22 <23` | `core_tests` por `DATABASE_URL` ausente | execução concluída de ponta a ponta |
| Node 22 | 12 | 1 | nenhuma falha ambiental relevante na rodada simétrica | `core_tests` por `DATABASE_URL` ausente | execução concluída de ponta a ponta |

## Classificação final
Classificação: `sem regressão detectada`

Justificativa:
- A execução foi repetida em ambiente simétrico, com:
  - mesmo commit;
  - mesmo snapshot limpo;
  - mesmo diretório (`/work`);
  - mesmas permissões (`root`);
  - mesma versão de `pnpm`;
  - mesma sequência de comandos.
- Node 20 e Node 22 convergiram exatamente para `12 PASS / 1 FAIL`.
- A única falha remanescente é comum aos dois runtimes e decorre de `DATABASE_URL` ausente em `core_tests`, não de regressão específica do Node 22.

## Recomendação F0.14
Próximo PR sugerido: `F0.14 — migrate build_validate to Node 22`

Escopo recomendado de F0.14:
1. migrar o `build_validate` para Node 22 no workflow;
2. preservar o restante do CI sem rebaseline amplo;
3. tratar a falha estrutural de `core_tests` em frente separada ou explicitar seu provisionamento real no job, sem usar essa dívida como bloqueio para a troca de runtime em si.

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=413` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/lint.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/release.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/critical-dod.yml` | vazio | sem alteração |
| `git diff -- package.json` | vazio | sem alteração |
| `git diff -- pnpm-lock.yaml` | vazio | sem alteração |
| `git diff -- .nvmrc` | vazio | sem alteração |
| `git diff -- .node-version` | vazio | sem alteração |
| `git diff -- scripts/checkOrphanTests.ts` | vazio | sem alteração |
| `git diff -- scripts/orphan-tests-allowlist.txt` | vazio | sem alteração |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | sem alteração |
| `git diff --check` | pass | sem saída |

## Lacunas remanescentes

### P0
- A migração de `build_validate` para Node 22 ainda não foi aplicada; esta evidência apenas autoriza a próxima frente.

### P1
- O job `build_validate` continua com falha estrutural em `core_tests` por dependência de `DATABASE_URL` ausente no contexto atual do passo.

### P2
- A triagem de `packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts` e do contrato esperado para esse passo permanece separada da análise de runtime.

### P3
- Fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
