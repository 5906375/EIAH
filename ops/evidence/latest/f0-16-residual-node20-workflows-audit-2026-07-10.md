# F0.16 — residual Node 20 workflows audit

## Data
2026-07-10

## Objetivo
Auditar workflows residuais ainda em Node 20 e recomendar migração controlada posterior.

## Escopo
Este PR é audit-only/evidencial. Não altera workflows, `package.json`, lockfile, scripts, runtime funcional, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Contexto
- F0.11 declarou baseline Node 22.
- F0.14 migrou `build_validate` para Node 22.
- F0.15 corrigiu `core_tests` no `build_validate`.
- Workflows residuais ainda precisam de auditoria antes de migração.

## Workflows auditados

| Workflow | Node atual | Fonte da versão | Triggers | Jobs | Comandos principais | Dependências sensíveis | Criticidade | Risco migração | Recomendação |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `.github/workflows/lint.yml` | `20` | `env.NODE_VERSION='20'` consumido por `actions/setup-node@v4` | `pull_request` em `main, dev` | `lint` | `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm lint`, `pnpm --filter @repo/db generate`, smoke opcional `packages/db` | `pnpm` cache, geração Prisma, `RUN_DB_SMOKE` desligado por padrão | auxiliar de PR | baixo | migrar primeiro; validar só compatibilidade de `pnpm install`, `pnpm lint` e `@repo/db generate` em Node 22 |
| `.github/workflows/release.yml` | `20` | `env.NODE_VERSION='20'` consumido por `actions/setup-node@v4` | `workflow_dispatch`, `push` em tags `v*` e `release/v*` | `prepare`, `detect`, `validate_release`, `publish_cli`, `publish_api_image`, `publish_worker_image` | `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm build`, Prisma validate/format/migrate diff, `pnpm publish`, builds/push Docker | `NPM_TOKEN`, `REGISTRY_PAT`, `GHCR`, `registry-url`, `id-token`, publicação NPM, publicação de imagens | release-path | alto | tratar por PR dedicado e com validação controlada de release; não migrar sem dry-run/ensaio |
| `.github/workflows/critical-dod.yml` | `20` | literal `node-version: 20` em `actions/setup-node@v4` | `workflow_dispatch` | `critical_dod` | `pnpm install --frozen-lockfile`, `pnpm check:e2e-recency`, `check:manifest-integrity`, `check:billing-webhook-evidence`, `check:agent-protocol-compat`, `check:interop-contract-matrix`, `check:interop-spec-governance`, `check:p2-audit-interop`, `check:rbac-fail-closed`, `check:guardrail-ledger-noop`, `check:p3-settlement-support-by-env`, `check:economy-invariants` | gate crítico documental/governança/economy; sem secrets explícitos, mas alta sensibilidade de CI/DoD | gate crítico | médio | migrar depois do `lint.yml`; validar todos os checks normativos em Node 22 antes de trocar |

## Matriz de risco

| Workflow | Risco | Justificativa | Próximo passo |
| --- | --- | --- | --- |
| `.github/workflows/lint.yml` | baixo | Faz lint, install e geração Prisma local, sem publish, sem registry, sem tokens de release e com smoke DB desligado por padrão | PR F0.17 para migrar `lint.yml` a Node 22 |
| `.github/workflows/critical-dod.yml` | médio | Não publica artefatos, mas agrega checks críticos de DoD, interop, economy e governança; uma regressão aqui impacta gates normativos | PR posterior com validação focada dos checks em Node 22 |
| `.github/workflows/release.yml` | alto | Mistura validação, `pnpm publish`, credenciais NPM/GHCR e push de imagens; qualquer regressão afeta release path e publicação | PR dedicado com ensaio controlado, idealmente separado entre validate/publish se necessário |

## Ordem recomendada de migração
1. `F0.17 — migrate lint.yml to Node 22`
2. `F0.18 — migrate critical-dod.yml to Node 22`
3. `F0.19 — audit and migrate release.yml to Node 22`

Racional:
- `lint.yml` é o menor risco e reaproveita o padrão já estabilizado no CI principal.
- `critical-dod.yml` é mais sensível que lint, mas ainda não publica artefatos.
- `release.yml` é o workflow mais delicado porque envolve publicação, registry, tags e secrets.

## Prova de isolamento
- `.github/workflows/ci.yml` sem alteração
- `.github/workflows/lint.yml` sem alteração
- `.github/workflows/release.yml` sem alteração
- `.github/workflows/critical-dod.yml` sem alteração
- `package.json` sem alteração
- `pnpm-lock.yaml` sem alteração
- `.nvmrc` sem alteração
- `.node-version` sem alteração
- scripts sem alteração
- IMOB/front door sem alteração
- `ChatAgentLauncher` sem alteração

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=417` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração nesta etapa |
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
- Os workflows residuais em Node 20 permanecem sem migração neste PR.

### P1
- `critical-dod.yml` e `release.yml` continuam expostos ao drift entre baseline Node 22 e runtime residual 20 até PRs dedicados.

### P2
- `release.yml` concentra o maior risco operacional por envolver publish NPM/GHCR e validações Prisma no caminho de release.

### P3
- Fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
