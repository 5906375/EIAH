# F0.12 — build_validate Node 20 vs Node 22 comparison

## Data
2026-07-09

## Objetivo
Comparar os comandos reais do job `build_validate` usando Node 20 e Node 22, registrando outputs, diferenças, riscos e recomendação para eventual migração posterior, sem alterar workflows, package, scripts ou runtime.

## Escopo
Esta etapa é audit-only/evidencial. Não altera workflows, `package.json`, `pnpm-lock.yaml`, scripts, runtime, IMOB/front door ou `ChatAgentLauncher`.

## Comandos reais extraídos de `build_validate`

Sequência auditada do job `build_validate` em `.github/workflows/ci.yml`:
1. `test ! -f package-lock.json && test ! -f yarn.lock && test ! -f bun.lockb && test ! -f bun.lock && EXTRA_PNPM_LOCKFILES=$(find . -path './node_modules' -prune -o -name 'pnpm-lock.yaml' -print | grep -v '^./pnpm-lock.yaml$' || true) && test -z "$EXTRA_PNPM_LOCKFILES"`
2. `pnpm install --frozen-lockfile --ignore-scripts`
3. `pnpm lint`
4. `pnpm --filter @eiah/contracts build`
5. `pnpm --filter @repo/db build`
6. `TEST_FILES="$(find packages/core/src -name '*.test.ts' -type f)"; if [ -n "$TEST_FILES" ]; then echo "$TEST_FILES" | tr '\n' '\0' | xargs -0 node --test --import tsx; else echo "No @eiah/core tests found. Skipping root test step."; fi`
7. `pnpm check:src-dist-route-parity`
8. `pnpm check:ledger-bundle-smoke`
9. `pnpm check:rbac-fail-closed`
10. `pnpm check:redis-fail-closed`
11. `pnpm check:guardrail-ledger-noop`
12. `pnpm check:worker-topology`
13. `TMPDIR=/tmp TMP=/tmp TEMP=/tmp ESBUILD_TMPDIR=/tmp NODE_ENV=production pnpm --filter apps/web build`

## Ambiente comparado

| Runtime | Origem | Versão Node | PNPM | Observação |
| --- | --- | --- | --- | --- |
| Node 20 | container `eiah-api` | `v20.19.6` | `10.12.4` | Mesmo ambiente Docker já usado pelo projeto; repo montado em `/app` |
| Node 22 | host local | `v22.17.1` | `10.12.4` | Runtime local alinhado à baseline declarada em F0.11 |

## Resultado por etapa

| Etapa | Node 20 | Node 22 | Diferença observada |
| --- | --- | --- | --- |
| `lockfile_policy` | PASS | PASS | Sem diferença |
| `install` | PASS com warning `Unsupported engine` | FAIL `243` | Node 20 instala; Node 22 falha por `ERR_PNPM_META_FETCH_FAIL` + `EACCES` em `apps/workers/action-runner/node_modules/.bin/tsx` |
| `lint` | PASS com warning `Unsupported engine` | PASS | Sem diferença funcional |
| `build_contracts` | PASS com warning `Unsupported engine` | PASS | Sem diferença funcional |
| `build_repo_db` | PASS com warning `Unsupported engine` | FAIL `1` | Node 22 falha porque `prisma` não foi encontrado após `install` falho |
| `core_tests` | FAIL `123` | FAIL `123` | Falha comum em ambos; não indica regressão específica de versão |
| `check:src-dist-route-parity` | PASS com warning `Unsupported engine` | FAIL `254` | Node 22 falha porque `pnpm exec tsx` não resolve após `install` falho |
| `check:ledger-bundle-smoke` | PASS com warning `Unsupported engine` | FAIL `254` | Mesma cadeia de falha do item anterior |
| `check:rbac-fail-closed` | PASS com warning `Unsupported engine` | FAIL `1` | Node 22 falha com `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'` após `install` falho |
| `check:redis-fail-closed` | PASS com warning `Unsupported engine` | FAIL `1` | Mesma cadeia de falha do item anterior |
| `check:guardrail-ledger-noop` | PASS com warning `Unsupported engine` | PASS | Sem diferença funcional |
| `check:worker-topology` | PASS com warning `Unsupported engine` | PASS | Sem diferença funcional |
| `build_web` | PASS (`No projects matched the filters`) | PASS (`No projects matched the filters`) | Mesmo comportamento; ponto estranho do comando, mas não diferencia runtime |

Resumo agregado:
- Node 20: 12 PASS / 1 FAIL
- Node 22: 6 PASS / 7 FAIL

## Outputs relevantes

### Node 20
- Warning recorrente:
  - `Unsupported engine: wanted: {"node":">=22 <23"} (current: {"node":"v20.19.6","pnpm":"10.12.4"})`
- `pnpm install --frozen-lockfile --ignore-scripts`: concluiu com sucesso.
- `@repo/db build`: concluiu com sucesso, incluindo `prisma generate`.
- `core_tests`: falha comum:
  - `Could not find 'packages/core/src/...test.ts ...'`

### Node 22
- `pnpm install --frozen-lockfile --ignore-scripts`:
  - `ERR_PNPM_META_FETCH_FAIL ... getaddrinfo EAI_AGAIN registry.npmjs.org`
  - `EACCES: permission denied, open '/home/jusall/projects/EIAH_BUILDER/apps/workers/action-runner/node_modules/.bin/tsx'`
- Falhas subsequentes dominadas por efeito cascata do `install` falho:
  - `prisma: not found`
  - `pnpm exec tsx ... Command "tsx" not found`
  - `ERR_MODULE_NOT_FOUND: Cannot find package 'tsx'`
- `core_tests`: mesma falha estrutural vista em Node 20.

## Diferenças encontradas
- A diferença mais forte da rodada veio do ambiente operacional do Node 22 local, não de um erro funcional isolado de código:
  - falha de rede/resolução do registry;
  - falha de permissão em `node_modules/.bin/tsx`;
  - cascata de ausência de dependências para `prisma`/`tsx`.
- Node 20 no container executou quase toda a sequência, mas já sinalizou que está fora da baseline declarada via warnings de `engines.node`.
- Há uma falha comum e independente de versão em `core_tests`.
- `build_web` terminou com o mesmo comportamento nos dois lados: `No projects matched the filters`.

## Classificação
Classificação: `inconclusivo`

Justificativa:
- A comparação não isolou apenas a variável “versão do Node”.
- O lado Node 22 foi executado no host local e sofreu falhas claras de ambiente (`EAI_AGAIN`, `EACCES`, ausência subsequente de `tsx`/`prisma`), o que impede afirmar regressão canônica de runtime.
- O lado Node 20 foi executado no container do projeto e, apesar dos warnings de baseline, não apresentou a mesma degradação operacional.
- Como a assimetria de ambiente contaminou a comparação, esta rodada não prova nem “sem regressão” nem “regressão real de Node 22”.

## Riscos
- Persistir com `build_validate` em Node 20 enquanto a baseline declarada é Node 22 mantém ambiguidade operacional.
- Migrar `build_validate` sem repetir a comparação em ambiente simétrico pode gerar falso diagnóstico.
- Warnings de `Unsupported engine` em Node 20 mostram desalinhamento explícito com a baseline do repositório.
- Falhas de permissão/rede no host podem mascarar ou exagerar diferenças entre runtimes.
- A falha comum de `core_tests` indica dívida estrutural do comando em si, separada da discussão de versão.

## Recomendação F0.13
Próximo PR sugerido: `F0.13 — build_validate runtime convergence in symmetric environment`

Sequência segura:
1. Reexecutar a mesma sequência em ambiente simétrico para Node 20 e Node 22.
2. Preferir dois containers equivalentes ou dois ambientes limpos com permissão/rede equivalentes.
3. Isolar e corrigir, em frente separada, a falha estrutural de `core_tests`.
4. Só então decidir migração de `build_validate` para Node 22 no workflow.

Objetivo de F0.13:
- classificar definitivamente como `sem regressão` ou `regressão detectada`;
- separar falhas de ambiente das falhas de runtime;
- validar os gates P0/P1 mais sensíveis após convergência.

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=411` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração F0.12 |
| `git diff -- package.json` | diff preexistente | mudança já aberta de F0.11; nenhuma edição nesta etapa |
| `git diff -- pnpm-lock.yaml` | vazio | sem alteração |
| `git diff -- .nvmrc` | diff preexistente | arquivo novo já aberto de F0.11; nenhuma edição nesta etapa |
| `git diff -- .node-version` | diff preexistente | arquivo novo já aberto de F0.11; nenhuma edição nesta etapa |
| `git diff -- scripts/checkOrphanTests.ts` | vazio | sem alteração |
| `git diff -- scripts/orphan-tests-allowlist.txt` | vazio | sem alteração |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | sem alteração |
| `git diff --check` | pass | sem saída |

## Prova de isolamento
- Nenhuma alteração em `.github/workflows/ci.yml`
- Nenhuma alteração nova em `package.json` nesta etapa; diff observado é preexistente de F0.11
- Nenhuma alteração em `pnpm-lock.yaml`
- Nenhuma alteração nova em `.nvmrc` nesta etapa; diff observado é preexistente de F0.11
- Nenhuma alteração nova em `.node-version` nesta etapa; diff observado é preexistente de F0.11
- Nenhuma alteração em scripts
- Nenhuma alteração em IMOB/front door
- Nenhuma alteração em `ChatAgentLauncher`

## Lacunas remanescentes

### P0
- `build_validate` continua em Node 20 apesar da baseline declarada como Node 22.
- A comparação desta rodada não basta para autorizar migração direta do workflow.

### P1
- Gates críticos em `build_validate` continuam presos ao runtime residual até haver decisão baseada em ambiente simétrico.

### P2
- A falha estrutural de `core_tests` pode afetar leitura de estabilidade entre runtimes e precisa de triagem própria.

### P3
- Fora do escopo desta frente; sem impacto economy comprovado além dos checks já existentes.

### P4
- Fora do escopo IMOB/front door; nenhum gate IMOB foi alterado nesta etapa.

## Status
Status: parcial/evidenciado
