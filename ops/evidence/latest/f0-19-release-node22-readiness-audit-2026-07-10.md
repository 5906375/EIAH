# F0.19 — release.yml Node 22 migration readiness audit

## Data
2026-07-10

## Objetivo
Auditar `.github/workflows/release.yml` para preparar futura migração de Node 20 para Node 22 sem alterar o workflow nem acionar publish real.

## Escopo
Este PR é audit-only/evidencial. Não altera `release.yml`, `ci.yml`, `lint.yml`, `critical-dod.yml`, `package.json`, lockfile, scripts, runtime funcional, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Contexto
- F0.16 classificou `release.yml` como alto risco.
- F0.17 migrou `lint.yml` para Node 22.
- F0.18 migrou `critical-dod.yml` para Node 22.
- `release.yml` permanece como último workflow residual em Node 20.

## Release workflow audit

| Item | Resultado |
| --- | --- |
| Workflow | `Release Monorepo` |
| Triggers | `workflow_dispatch` com input opcional `version`; `push` em tags `v*` e `release/v*` |
| Jobs | `prepare`, `detect`, `validate_release`, `publish_cli`, `publish_api_image`, `publish_worker_image` |
| Dependencies/needs | `detect` depende de `prepare`; `validate_release` depende de `prepare`; os três jobs de publish dependem de `prepare`, `detect` e `validate_release` |
| Permissions | `publish_cli`: `contents: read`, `id-token: write`; `publish_api_image` e `publish_worker_image`: `contents: read`, `packages: write` |
| Node atual | `20` |
| Fonte da versão Node | `env.NODE_VERSION='20'` consumido por `actions/setup-node@v4` |
| Package manager | `pnpm` com `PNPM_VERSION='9'` |
| Registry/NPM | `registry-url: https://registry.npmjs.org`; publish CLI via `pnpm publish` |
| Docker/GHCR | `REGISTRY=ghcr.io`; login via `docker/login-action@v3`; push de imagens API e Workers via `docker/build-push-action@v5` |
| Tags/releases | release version derivada de `github.event.inputs.version` ou de tag `v*`/`release/v*` |
| Secrets por nome | `NPM_TOKEN`, `REGISTRY_PAT` |
| Publish real? | Sim; CLI publica em NPM e imagens fazem push para GHCR |
| Dry-run disponível? | Não há dry-run seguro embutido para publish; apenas `prepare`, `detect` e `validate_release` são candidatos a ensaio sem publish |
| Rollback | Reversão simples de `NODE_VERSION` de `22` para `20` em PR posterior, se a migração falhar |

## Job matrix

| Job | Needs | Node usage | Comandos principais | Secrets/env | Publish/Docker? | Pode dry-run? | Risco | Tags |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `prepare` | nenhum | não usa `setup-node` | resolve `release_version` a partir de input/tag e escreve em `GITHUB_OUTPUT` | `github.event.inputs.version`, `GITHUB_REF` | não | sim | baixo | `safe-to-dry-run`, `manual-only`, `low-risk` |
| `detect` | `prepare` | não usa `setup-node` | `test -f` para `apps/cli/package.json`, `apps/api/Dockerfile.prod`, `apps/workers/action-runner/Dockerfile.prod` | sem secrets; outputs `has_cli`, `has_api`, `has_workers` | não | sim | baixo | `safe-to-dry-run`, `manual-only`, `low-risk` |
| `validate_release` | `prepare` | `actions/setup-node@v4` com `${{ env.NODE_VERSION }}` | `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, `pnpm --filter @repo/db prisma validate/format/migrate diff` | `NODE_VERSION`, `PNPM_VERSION`, `registry-url` NPM pública | não | sim, desde que isolado dos jobs de publish | médio | `safe-to-dry-run`, `manual-only`, `medium-risk` |
| `publish_cli` | `prepare`, `detect`, `validate_release` | `actions/setup-node@v4` com `${{ env.NODE_VERSION }}` | install filtrado, build CLI, `pkg set version`, `pnpm publish --access public --no-git-checks` | `NODE_AUTH_TOKEN`, `NPM_TOKEN`, `RELEASE_VERSION` | publish NPM | não | alto | `requires-secrets`, `publish-path`, `manual-only`, `migration-blocker`, `high-risk` |
| `publish_api_image` | `prepare`, `detect`, `validate_release` | não usa Node diretamente; usa Docker | `docker/setup-buildx-action`, `docker/login-action`, `docker/build-push-action` com `push: true` | `REGISTRY`, `REGISTRY_PAT`, `github.actor`, `release_version` | Docker/GHCR | não | alto | `requires-secrets`, `publish-path`, `docker-path`, `manual-only`, `migration-blocker`, `high-risk` |
| `publish_worker_image` | `prepare`, `detect`, `validate_release` | não usa Node diretamente; usa Docker | `docker/setup-buildx-action`, `docker/login-action`, `docker/build-push-action` com `push: true` | `REGISTRY`, `REGISTRY_PAT`, `github.actor`, `release_version` | Docker/GHCR | não | alto | `requires-secrets`, `publish-path`, `docker-path`, `manual-only`, `migration-blocker`, `high-risk` |

## Publish/secrets map

| Área | Comando/step | Secret/env por nome | Risco | Observação |
| --- | --- | --- | --- | --- |
| CLI / NPM | `Publish CLI` | `NODE_AUTH_TOKEN`, `NPM_TOKEN`, `RELEASE_VERSION` | alto | publica pacote real com `pnpm publish`; não pode rodar em PR audit-only |
| API / GHCR | `Login to GHCR` + `Build and push API image` | `REGISTRY_PAT`, `REGISTRY`, `github.actor`, `release_version` | alto | autentica e faz push real para `ghcr.io` |
| Workers / GHCR | `Login to GHCR` + `Build and push Worker image` | `REGISTRY_PAT`, `REGISTRY`, `github.actor`, `release_version` | alto | autentica e faz push real para `ghcr.io` |
| Validação pré-release | `Setup Node.js`, `Install dependencies`, `Run lint and smoke`, `Validate Prisma schema` | `NODE_VERSION`, `PNPM_VERSION` | médio | caminho útil para ensaio de compatibilidade Node sem publicar |

## Estratégia segura para F0.20
- Pré-condições:
  - manter `release.yml` sem publish automático em PR comum;
  - ensaiar compatibilidade Node 22 apenas sobre a superfície de `prepare`, `detect` e `validate_release`;
  - preservar mapeamento de secrets e environments de release sem expor valores.
- Não é seguro declarar migração imediata apenas com leitura estática, porque os jobs de publish permanecem acoplados ao mesmo workflow e não têm dry-run nativo.
- O caminho seguro é criar primeiro um ensaio controlado que exercite os passos não-publicadores com Node 22, mantendo `publish_cli`, `publish_api_image` e `publish_worker_image` fora da execução de PR.
- Jobs que devem ser observados no ensaio: `prepare`, `detect`, `validate_release`.
- Jobs que não devem ser acionados em PR: `publish_cli`, `publish_api_image`, `publish_worker_image`.
- Validação sem publish real:
  - usar inspeção estática do workflow;
  - executar checks documentais locais;
  - em PR posterior, introduzir readiness/dry-run explícito ou separar validate de publish antes de trocar o runtime no workflow real.
- Plano de rollback para a futura migração:
  - reverter `NODE_VERSION` de `22` para `20` em `.github/workflows/release.yml`;
  - manter publish real restrito a tag/release controlado.

## Decisão
`F0.20 deve criar ensaio/dry-run antes da migração`

Justificativa:
- `release.yml` é o último workflow residual em Node 20 e o de maior risco.
- O mesmo workflow combina validação, publish NPM e push Docker/GHCR.
- Não existe modo dry-run seguro embutido para os caminhos de publish.
- Sem ensaio controlado, a troca direta de Node no release path misturaria mudança de runtime com risco operacional de publicação.

## Prova de isolamento
- `.github/workflows/release.yml` sem alteração.
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
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=423` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/release.yml` | vazio | sem alteração |
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
- `release.yml` permanece em Node 20 até PR posterior específica de readiness/migração.

### P1
- O release path segue dependente de secrets e publish real; qualquer mudança de runtime precisa preservar esse caminho sem disparo acidental.

### P2
- Persistem riscos em `pnpm publish`, login GHCR, build/push Docker e fluxo por tags até existir ensaio seguro em Node 22.

### P3
- Fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
