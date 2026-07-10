# F0.17 — lint.yml Node 22 migration

## Data
2026-07-10

## Objetivo
Migrar somente `.github/workflows/lint.yml` de Node 20 para Node 22, com base na auditoria F0.16 que classificou `lint.yml` como baixo risco.

## Escopo
Esta etapa altera apenas `.github/workflows/lint.yml` para trocar o runtime Node do workflow `Lint` para 22. Não altera `package.json`, lockfile, scripts, runtime amplo, IMOB/front door ou `ChatAgentLauncher`.

## Contexto
- F0.11 declarou baseline Node 22 em `package.json`, `.nvmrc` e `.node-version`.
- F0.14 migrou `build_validate` para Node 22.
- F0.15 corrigiu a falha acidental de `core_tests` no `build_validate`.
- F0.16 auditou `lint.yml` como workflow residual de baixo risco.

## Alteração aplicada

Arquivo alterado:
- `.github/workflows/lint.yml`

Mudança efetiva:
- `env.NODE_VERSION` foi alterado de `'20'` para `'22'`.
- O step `actions/setup-node@v4` continua consumindo `${{ env.NODE_VERSION }}`.
- `PNPM_VERSION` e `RUN_DB_SMOKE` permanecem inalterados.
- Jobs, triggers e comandos do workflow permanecem inalterados.

## Diff funcional resumido

Antes:
```yaml
env:
  NODE_VERSION: '20'
```

Depois:
```yaml
env:
  NODE_VERSION: '22'
```

## Resultado esperado da migração
- O workflow `Lint` passa a usar Node 22.
- `pnpm install --frozen-lockfile --ignore-scripts`, `pnpm lint` e `pnpm --filter @repo/db generate` passam a rodar na baseline do repositório.
- O smoke opcional de `@repo/db` continua desligado por padrão via `RUN_DB_SMOKE='0'`.
- Não há alteração de publish, registry, release path ou gates críticos fora do escopo do workflow.

## Classificação
Classificação: `migração autorizada e aplicada`

Justificativa:
- F0.16 classificou `lint.yml` como de baixo risco.
- O workflow não publica artefatos e não depende de secrets de release.
- A mudança é mínima e limitada ao runtime Node declarado no próprio arquivo.

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=418` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/lint.yml` | diff controlado | apenas `env.NODE_VERSION='22'` |
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
| `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('.github/workflows/lint.yml').read_text())"` | pass | YAML parseável após a mudança |
| `git diff --check` | pass | sem saída |

## Prova de isolamento
- `.github/workflows/ci.yml`: sem diff
- `.github/workflows/lint.yml`: alterado apenas em `env.NODE_VERSION`
- `.github/workflows/release.yml`: sem diff
- `.github/workflows/critical-dod.yml`: sem diff
- `package.json`: sem diff
- `pnpm-lock.yaml`: sem diff
- `.nvmrc`: sem diff
- `.node-version`: sem diff
- scripts: sem diff
- IMOB/front door: sem diff
- `ChatAgentLauncher`: sem diff
- backend funcional, frontend funcional, policy, Prisma, migrations, WhatsApp, mobile e economy: sem alteração

## Lacunas remanescentes

### P0
- `critical-dod.yml` e `release.yml` permanecem em Node 20 e seguem fora do escopo desta etapa.

### P1
- `critical-dod.yml` ainda concentra checks normativos sensíveis e exige PR dedicado antes da migração.

### P2
- `release.yml` continua sendo o workflow de maior risco por envolver publish NPM/GHCR e secrets de release.

### P3
- Fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
