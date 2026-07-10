# F0.20 — release.yml dry-run/readiness workflow

## Data
2026-07-10

## Objetivo
Criar validação segura de readiness em Node 22 para futura migração do `release.yml`, sem alterar o workflow produtivo e sem acionar publish real.

## Escopo
Este PR cria um ensaio seguro para Node 22. Não altera `release.yml`, `ci.yml`, `lint.yml`, `critical-dod.yml`, `package.json`, lockfile, scripts, runtime funcional, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Contexto
- F0.19 classificou `release.yml` como alto risco.
- F0.19 recomendou ensaio/dry-run antes da migração real.
- F0.20 implementa readiness sem publish.

## Workflow de readiness

| Item | Resultado |
| --- | --- |
| Arquivo | `.github/workflows/release-node22-readiness.yml` |
| Node | `22` |
| Triggers | `workflow_dispatch` |
| Jobs | `prepare_readiness`, `detect_readiness`, `validate_release_readiness` |
| Secrets usados | nenhum |
| Publish real | não |
| Docker/GHCR push | não |
| NPM publish | não |
| Release tags | não |
| Rollback | remover o workflow readiness ou reverter o PR |

## Comandos validados

| Bloco | Comando | Equivalente no release real? | Usa secret? | Publica? | Resultado |
| --- | --- | --- | --- | --- | --- |
| `prepare_readiness` | `echo "release_version=0.0.0-readiness" >> "$GITHUB_OUTPUT"` | equivale ao output de `prepare`, mas com valor não sensível e determinístico | não | não | pronto para ensaio |
| `detect_readiness` | `test -f apps/cli/package.json`, `test -f apps/api/Dockerfile.prod`, `test -f apps/workers/action-runner/Dockerfile.prod` | sim, espelha `detect` | não | não | pronto para ensaio |
| `validate_release_readiness` | `pnpm install --frozen-lockfile` | sim, espelha `validate_release` | não | não | pronto para ensaio |
| `validate_release_readiness` | `pnpm lint` | sim, espelha `validate_release` | não | não | pronto para ensaio |
| `validate_release_readiness` | `pnpm build` | sim, espelha `validate_release` | não | não | pronto para ensaio |
| `validate_release_readiness` | `pnpm --filter @repo/db prisma validate --schema packages/db/prisma/schema.prisma` | sim, espelha `validate_release` | não | não | pronto para ensaio |
| `validate_release_readiness` | `pnpm --filter @repo/db prisma format --schema packages/db/prisma/schema.prisma --check` | sim, espelha `validate_release` | não | não | pronto para ensaio |
| `validate_release_readiness` | `pnpm --filter @repo/db prisma migrate diff --from-schema-datamodel ./packages/db/prisma/schema.prisma --to-schema-datamodel ./packages/db/prisma/schema.prisma` | sim, espelha `validate_release` | não | não | pronto para ensaio |

## Blocos deliberadamente excluídos

| Bloco excluído | Motivo |
| --- | --- |
| `publish_cli` | publish real/NPM/secrets |
| `publish_api_image` | Docker/GHCR push/secrets |
| `publish_worker_image` | Docker/GHCR push/secrets |

## Segurança
- sem `NPM_TOKEN`
- sem `REGISTRY_PAT`
- sem `NODE_AUTH_TOKEN`
- sem `pnpm publish`
- sem Docker push
- sem GHCR push
- sem alteração em `release.yml`
- sem alteração em package/lockfile/scripts
- sem alteração em IMOB/front door
- sem alteração em `ChatAgentLauncher`

## Resultado
`readiness criado e apto para observar Node 22 antes da migração real`

## Estratégia para F0.21
- F0.21 pode migrar `release.yml` para Node 22 somente após observar o readiness.
- Publish real continua restrito a tag/release controlado.
- Rollback da migração futura: voltar `NODE_VERSION` de `22` para `20` no `release.yml`.

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
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=425` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('.github/workflows/release-node22-readiness.yml').read_text()); print('yaml_ok=true')"` | pass | `yaml_ok=true` |
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
- `release.yml` produtivo ainda não foi migrado para Node 22.

### P1
- O release path real continua dependente de secrets e publish controlado.

### P2
- `publish_cli`, `publish_api_image` e `publish_worker_image` continuam fora do readiness por envolverem NPM/GHCR/Docker e credenciais.

### P3
- Fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
