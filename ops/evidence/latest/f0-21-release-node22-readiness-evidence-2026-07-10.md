# F0.21 — release Node 22 readiness evidence

## Data
2026-07-10

## Objetivo
Registrar evidência operacional real da execução do workflow `ReleaseNode22Readiness` antes de qualquer migração do `release.yml` produtivo para Node 22.

## Escopo
Este PR é audit-only/evidencial. Não altera `release.yml`, `release-node22-readiness.yml`, `ci.yml`, `lint.yml`, `critical-dod.yml`, `package.json`, lockfile, scripts, runtime funcional, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Contexto
- F0.19 recomendou readiness antes da migração real.
- F0.20 criou o workflow `ReleaseNode22Readiness`.
- F0.21 observa uma execução real do readiness.

## Execução observada

Fonte da observação:
- run real do GitHub Actions reportado nesta etapa pelo usuário

| Item | Valor |
| --- | --- |
| Workflow | `ReleaseNode22Readiness` |
| Run URL | não informado na evidência recebida |
| Run ID | não informado na evidência recebida |
| Branch | `main` |
| Commit SHA | `fedd5da` |
| Data/hora | não informada na evidência recebida |
| Duração | `14s` |
| Status geral | `failure` |
| Node version | `22` |
| Trigger | `workflow_dispatch` |
| Publish real | não |
| Docker/GHCR push | não |
| Secrets de release | não |

## Job matrix

| Job | Status | Comandos observados | Observação |
| --- | --- | --- | --- |
| `prepare_readiness` | pass | output determinístico de `release_version` | sem falha reportada |
| `detect_readiness` | pass | detecção de `apps/cli`, `apps/api/Dockerfile.prod` e `apps/workers/action-runner/Dockerfile.prod` | sem falha reportada |
| `validate_release_readiness` | fail | `Setup PNPM` / validação de ambiente antes de `install/lint/build/prisma` | falha fatal por mismatch de versão do pnpm |

## Falha observada

Erro fatal reportado no GitHub Actions:

```text
Error: Multiple versions of pnpm specified:
  - version 9 in the GitHub Action config with the key "version"
  - version pnpm@10.12.4 in the package.json with the key "packageManager"
Remove one of these versions to avoid version mismatch errors like ERR_PNPM_BAD_PM_VERSION
```

Diagnóstico objetivo:
- o workflow de readiness fixa `PNPM_VERSION: '9'`;
- o repositório declara `packageManager: pnpm@10.12.4` em `package.json`;
- a execução falha antes de qualquer publish path;
- a falha é de configuração do readiness, não de `release.yml` produtivo.

## Segurança observada
- sem `NPM_TOKEN`
- sem `REGISTRY_PAT`
- sem `NODE_AUTH_TOKEN`
- sem `pnpm publish`
- sem Docker push
- sem GHCR push
- sem `docker/login-action`
- sem alteração em `release.yml`
- sem alteração em package/lockfile/scripts
- sem alteração em IMOB/front door
- sem alteração em `ChatAgentLauncher`

## Resultado
`readiness falhou; F0.22 deve corrigir readiness antes da migração`

Justificativa:
- a execução real do readiness terminou em `failure`;
- a falha ocorreu no job `validate_release_readiness`;
- não existe evidência suficiente para autorizar migração do `release.yml` produtivo;
- a correção deve ser feita primeiro no workflow de readiness, em PR separado.

## Estratégia para F0.22
- F0.22 deve corrigir o mismatch de versão do pnpm no readiness.
- Somente após novo run real verde do `ReleaseNode22Readiness` será seguro propor migração controlada do `release.yml`.
- Publish real continua restrito a tag/release controlado.
- Rollback de futura migração permanece: voltar `NODE_VERSION` de `22` para `20` no `release.yml`.

## Prova de isolamento
- `.github/workflows/release.yml` sem alteração.
- `.github/workflows/release-node22-readiness.yml` sem alteração.
- `.github/workflows/ci.yml` sem alteração.
- `.github/workflows/lint.yml` sem alteração.
- `.github/workflows/critical-dod.yml` sem alteração.
- `package.json` sem alteração.
- `pnpm-lock.yaml` sem alteração.
- `.nvmrc` sem alteração.
- `.node-version` sem alteração.
- scripts sem alteração.
- IMOB/front door sem alteração.
- `ChatAgentLauncher` sem alteração.

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=426` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/release.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/release-node22-readiness.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/lint.yml` | vazio | sem alteração |
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
- `release.yml` produtivo ainda não foi migrado para Node 22.

### P1
- O release path real continua dependente de secrets e de validação prévia do readiness.

### P2
- Publish NPM/GHCR/Docker continua fora desta etapa e não deve ser acionado antes da correção do readiness.

### P3
- Fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
