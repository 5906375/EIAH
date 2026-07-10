# F0.26 — fix packages/utils masking export for web build

## Data
2026-07-10

## Objetivo
Corrigir a falha real registrada em F0.25 no build de `apps/web`, sem alterar workflows nem migrar o `release.yml`.

## Escopo
Esta etapa altera somente `packages/utils/src/index.ts`, adiciona um caminho versionável em `packages/utils/src/masking/index.ts` e registra a evidência correspondente. Não altera workflows, `release.yml`, `packages/utils/.gitignore`, `package.json`, lockfile, scripts globais, IMOB/front door, `ChatAgentLauncher`, backend funcional amplo, Prisma, mobile, billing/economy ou policy.

## Contexto
- F0.24 corrigiu a ordem de `install/build` do readiness.
- F0.25 registrou que o rerun real superou `@repo/db` e `@eiah/core`, mas falhou no build de `apps/web`.
- O erro observado em F0.25 foi:

```text
apps/web build: error during build:
Could not resolve "./masking" from "../../packages/utils/src/index.ts"
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @eiah/web@0.1.0 build
```

## Investigação executada

Comandos inspecionados:
- `sed -n '1,220p' packages/utils/src/index.ts`
- `find packages/utils/src -maxdepth 2 -type f | sort`
- `rg -n "masking" packages/utils apps packages`
- `sed -n '1,240p' packages/utils/src/masking.ts`
- `sed -n '1,240p' apps/web/package.json`
- `pnpm --filter @eiah/web build`
- `git ls-files packages/utils/src`
- `sed -n '1,200p' packages/utils/.gitignore`

Achados objetivos:
- `packages/utils/src/index.ts` exportava `./masking`;
- o arquivo funcional existia localmente em `packages/utils/src/masking.ts`;
- `packages/utils/.gitignore` ignora explicitamente `src/masking.ts`;
- `git ls-files packages/utils/src` mostrou apenas `packages/utils/src/index.ts` como versionado;
- portanto, o GitHub Actions não recebia `src/masking.ts` no checkout limpo;
- o erro de F0.25 foi compatível com drift local: o barrel apontava para um arquivo existente apenas no ambiente local.

## Correção aplicada

Arquivos alterados:
- `packages/utils/src/index.ts`
- `packages/utils/src/masking/index.ts`

Mudança efetiva:
- o barrel passou de `export * from './masking';` para `export * from './masking/index';`
- o conteúdo de masking foi colocado em um caminho versionável: `packages/utils/src/masking/index.ts`

Justificativa:
- evita depender do arquivo ignorado `packages/utils/src/masking.ts`;
- não exige alterar `packages/utils/.gitignore`;
- preserva o contrato de import já usado por `apps/web` via `@repo/utils`.

## Validação real executada

Comando:
```bash
pnpm --filter @eiah/web build
```

Resultado:
- `@eiah/web build`: pass
- a falha `Could not resolve "./masking"` deixou de ocorrer

Observações não bloqueantes vistas no build:
- warning de target `ES2024` em `../../tsconfig.json`
- warning de `Browserslist` desatualizado
- aviso de chunks acima de `500 kB`

Esses warnings nao bloquearam o build do web e nao sao o foco desta etapa.

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
- `scripts/checkOrphanTests.ts` sem alteração
- `scripts/orphan-tests-allowlist.txt` sem alteração
- `packages/utils/.gitignore` sem alteração
- IMOB/front door sem alteração
- `ChatAgentLauncher` sem alteração

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm --filter @eiah/web build` | pass | falha de `./masking` removida |
| `pnpm check:orphan-tests` | pass | `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | índice consistente após F0.26 |
| `pnpm check:docs-link-integrity` | pass | links documentais consistentes |
| `git diff -- .github/workflows/release.yml .github/workflows/release-node22-readiness.yml .github/workflows/ci.yml .github/workflows/lint.yml .github/workflows/critical-dod.yml package.json pnpm-lock.yaml .nvmrc .node-version scripts/checkOrphanTests.ts scripts/orphan-tests-allowlist.txt apps/web/src/components/agents/ChatAgentLauncher.tsx apps/web/src/pages/app/imob/chat.tsx apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | sem alteração fora do escopo |
| `git diff --check` | pass | sem saída |

## Limites desta etapa
- esta etapa não reexecuta o workflow `ReleaseNode22Readiness` no GitHub Actions;
- portanto, não existe ainda evidência de run real verde do readiness;
- esta etapa não autoriza migração do `release.yml`.

## Próximo passo
- reexecutar `ReleaseNode22Readiness` após esta correção;
- se surgir novo bloqueio real, registrar em evidência separada antes de qualquer migração do `release.yml`.

## Status
Status: parcial/evidenciado
