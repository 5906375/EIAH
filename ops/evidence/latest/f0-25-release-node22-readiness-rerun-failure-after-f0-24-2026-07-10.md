# F0.25 — record ReleaseNode22Readiness web masking failure evidence

## Data
2026-07-10

## Objetivo
Registrar a falha real do rerun do workflow `ReleaseNode22Readiness` após F0.24, sem corrigir o workflow nem a lacuna de `packages/utils` nesta etapa.

## Escopo
Este PR é audit-only/evidencial. Não altera `.github/workflows/release-node22-readiness.yml`, `release.yml`, `ci.yml`, `lint.yml`, `critical-dod.yml`, `package.json`, lockfile, scripts, `packages/utils`, runtime funcional, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Contexto
- F0.23 registrou falha real durante `pnpm install --frozen-lockfile` porque o `postinstall` tentou construir `@eiah/core` antes de `@repo/db`.
- F0.24 corrigiu o readiness para instalar com `--ignore-scripts` e construir `@repo/db` antes de `@eiah/core`.
- F0.25 observa o rerun real após essa correção.
- O novo run avançou com sucesso por:
  - `packages/db build: Done`
  - `packages/core build: Done`
  - `packages/providers build: Done`
  - `packages/mcp-runner build: Done`

## Execução observada

Fonte da observação:
- rerun real do GitHub Actions reportado nesta etapa pelo usuário

| Item | Valor |
| --- | --- |
| Workflow | `ReleaseNode22Readiness` |
| Arquivo | `.github/workflows/release-node22-readiness.yml` |
| Trigger | `workflow_dispatch` |
| Status geral | `failure` |
| Publish real | não |
| Docker/GHCR push | não |
| Secrets de release | não |

## Resultado observado

Achados objetivos:
- a falha de install/build order entre `@repo/db` e `@eiah/core`, documentada em F0.23 e tratada em F0.24, foi superada;
- o workflow avançou além do bootstrap de `@repo/db` e `@eiah/core`;
- o workflow também superou o build de `packages/providers` e `packages/mcp-runner`;
- o novo bloqueio real apareceu no build de `apps/web`;
- a falha observada foi que `packages/utils/src/index.ts` não conseguiu resolver `./masking`.

Resumo da falha:
```text
apps/web build: x Build failed
apps/web build: error during build:
apps/web build: Could not resolve "./masking" from "../../packages/utils/src/index.ts"
apps/web build: file: /home/runner/work/EIAH/EIAH/packages/utils/src/index.ts
ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL @eiah/web@0.1.0 build
ELIFECYCLE Command failed with exit code 1.
```

## Diagnóstico objetivo
- F0.24 cumpriu seu objetivo específico: o readiness não falhou mais na ordem de build entre `@repo/db` e `@eiah/core`;
- o rerun comprovou avanço adicional até o build web;
- o novo bloqueio é posterior e distinto do anterior;
- o readiness continua sem run verde observado;
- portanto, ainda não existe base para autorizar migração do `release.yml` produtivo.

## Decisão
`F0.26 deve corrigir a lacuna de masking em packages/utils antes de qualquer migração do release.yml`

Justificativa:
- o bloqueio atual está no build de `apps/web`;
- a falha está centrada em `packages/utils/src/index.ts` ao resolver `./masking`;
- o release readiness ainda não completou com sucesso;
- corrigir a lacuna de resolução em `packages/utils` é pré-condição para nova observação real do readiness.

## Segurança observada
- sem alteração em `.github/workflows/release-node22-readiness.yml`
- sem alteração em `.github/workflows/release.yml`
- sem `NPM_TOKEN`
- sem `REGISTRY_PAT`
- sem `NODE_AUTH_TOKEN`
- sem `pnpm publish`
- sem Docker push
- sem GHCR push
- sem `docker/login-action`
- sem alteração em `package.json`
- sem alteração em `pnpm-lock.yaml`
- sem alteração em scripts
- sem alteração em `packages/utils`
- sem alteração em IMOB/front door
- sem alteração em `ChatAgentLauncher`

## Prova de isolamento
- `.github/workflows/release-node22-readiness.yml` sem alteração nesta etapa
- `.github/workflows/release.yml` sem alteração
- `.github/workflows/ci.yml` sem alteração
- `.github/workflows/lint.yml` sem alteração
- `.github/workflows/critical-dod.yml` sem alteração
- `package.json` sem alteração
- `pnpm-lock.yaml` sem alteração
- `.nvmrc` sem alteração
- `.node-version` sem alteração
- scripts sem alteração
- `packages/utils` sem alteração
- IMOB/front door sem alteração
- `ChatAgentLauncher` sem alteração

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | índice consistente após registro F0.25 |
| `pnpm check:docs-link-integrity` | pass | links documentais consistentes |
| `git diff -- .github/workflows/release-node22-readiness.yml` | vazio | sem alteração nesta etapa |
| `git diff -- .github/workflows/release.yml` | vazio | sem alteração |
| `git diff --check` | pass | sem saída |

## Lacunas remanescentes

### P0
- `release.yml` produtivo ainda não foi migrado para Node 22.

### P1
- o release path real continua dependente de readiness verde observado.

### P2
- o bloqueio atual está em `packages/utils/src/index.ts` ao resolver `./masking` durante o build de `apps/web`.

### P3
- publish NPM/GHCR/Docker continua fora desta etapa.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
