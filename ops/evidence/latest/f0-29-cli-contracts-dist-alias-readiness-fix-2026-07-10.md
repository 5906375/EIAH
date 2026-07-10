# F0.29 — CLI contracts dist alias readiness fix

## Data
2026-07-10

## Objetivo
Aplicar a correção mínima residual revelada pelo run real do `ReleaseNode22Readiness` após F0.28, trocando apenas o alias de `@eiah/contracts` no `apps/cli/tsconfig.json` de `src` para `dist`.

## Escopo
Esta etapa altera somente `apps/cli/tsconfig.json`, gera a evidência correspondente e atualiza o índice. Não altera workflows, `release.yml`, `apps/cli/src/index.ts`, `packages/contracts/src`, `packages/contracts/package.json`, `packages/contracts/tsconfig.json`, `package.json`, lockfile, scripts globais, IMOB/front door ou `ChatAgentLauncher`.

## Contexto
- F0.28 corrigiu o consumo de `@repo/db` e `@eiah/core` pelo CLI, além do drift de `GuardrailLedger`/Prisma.
- O run real posterior mostrou um bloqueio residual: `@eiah/contracts` ainda resolvia para `packages/contracts/src`.
- O erro observado foi:

```text
apps/cli build: ../../packages/contracts/src/index.ts(1,15): error TS6059:
File '/home/runner/work/EIAH/EIAH/packages/contracts/src/queues.ts' is not under 'rootDir' '/home/runner/work/EIAH/EIAH/apps/cli/src'.

apps/cli build: ../../packages/contracts/src/index.ts(2,15): error TS6059:
File '/home/runner/work/EIAH/EIAH/packages/contracts/src/payloads.ts' is not under 'rootDir' '/home/runner/work/EIAH/EIAH/apps/cli/src'.

apps/cli build: ../../packages/contracts/src/index.ts(3,15): error TS6059:
File '/home/runner/work/EIAH/EIAH/packages/contracts/src/types.ts' is not under 'rootDir' '/home/runner/work/EIAH/EIAH/apps/cli/src'.
```

## Investigação executada

Comandos inspecionados:
- `git status --short`
- `cat apps/cli/tsconfig.json`
- `ls` no diretório de artefatos compilados de contracts
- `find packages/contracts -maxdepth 3 -type f | sort | sed -n '1,120p'`
- `cat packages/contracts/tsconfig.json`

Achados objetivos:
- `apps/cli/tsconfig.json` ainda continha:
  - `@eiah/contracts: ../../packages/contracts/src/index.d.ts`
  - `@eiah/contracts/*: ../../packages/contracts/src/*`
- o diretório de artefatos compilados de contracts já existia com:
  - `index.d.ts`
  - `queues.d.ts`
  - `payloads.d.ts`
  - `types.d.ts`
- `packages/contracts/tsconfig.json` já gera `dist` a partir de `src`.

Conclusão:
- o bloqueio residual era realmente o alias do CLI ainda apontando para `src`;
- não foi necessário alterar `packages/contracts` nem `apps/cli/src/index.ts`.

## Correção aplicada

Arquivo alterado:
- `apps/cli/tsconfig.json`

Mudança efetiva:
- de:
  - `@eiah/contracts: ../../packages/contracts/src/index.d.ts`
  - `@eiah/contracts/*: ../../packages/contracts/src/*`
- para:
  - `@eiah/contracts` apontando para as declarações compiladas do pacote contracts
  - `@eiah/contracts/*` apontando para os artefatos compilados correspondentes

Os aliases de `@repo/db` e `@eiah/core` foram mantidos como já estavam corrigidos em F0.28.

## Validação real executada

Comando:
```bash
pnpm --filter @eiah/cli build
```

Resultado:
- `@eiah/cli build`: pass
- a falha residual de `TS6059` em `packages/contracts/src` deixou de ocorrer localmente

## Prova de isolamento
- `.github/workflows/release.yml` sem alteração
- `.github/workflows/release-node22-readiness.yml` sem alteração
- `.github/workflows/ci.yml` sem alteração
- `.github/workflows/lint.yml` sem alteração
- `.github/workflows/critical-dod.yml` sem alteração
- `package.json` sem alteração
- `pnpm-lock.yaml` sem alteração
- `.nvmrc` sem alteração
- `.node-version` sem alteração
- scripts globais sem alteração
- `apps/cli/src/index.ts` sem alteração
- `packages/contracts/src` sem alteração
- `packages/contracts/package.json` sem alteração
- `packages/contracts/tsconfig.json` sem alteração
- IMOB/front door sem alteração
- `ChatAgentLauncher` sem alteração

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm --filter @eiah/cli build` | pass | falha residual de `@eiah/contracts -> src` removida localmente |
| `pnpm check:orphan-tests` | pass | `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | índice consistente após F0.29 |
| `pnpm check:docs-link-integrity` | pass | links documentais consistentes |
| `git diff -- .github/workflows/release.yml .github/workflows/release-node22-readiness.yml .github/workflows/ci.yml .github/workflows/lint.yml .github/workflows/critical-dod.yml package.json pnpm-lock.yaml .nvmrc .node-version scripts/checkOrphanTests.ts scripts/orphan-tests-allowlist.txt apps/cli/src/index.ts packages/contracts/src packages/contracts/package.json packages/contracts/tsconfig.json apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | sem alteração fora do escopo |
| `git diff --check` | pass | sem saída |

## Limites desta etapa
- esta etapa não reexecuta o workflow `ReleaseNode22Readiness` no GitHub Actions;
- portanto, ainda não existe evidência de run real verde do readiness após F0.29;
- esta etapa não autoriza migração do `release.yml`.

## Próximo passo
- reexecutar `ReleaseNode22Readiness` após esta correção;
- se surgir novo bloqueio real, registrar em evidência separada antes de qualquer migração do `release.yml`.

## Status
Status: parcial/evidenciado
