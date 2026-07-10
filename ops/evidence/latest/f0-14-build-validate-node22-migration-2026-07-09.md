# F0.14 — build_validate Node 22 migration

## Data
2026-07-09

## Objetivo
Migrar somente o job `build_validate` do workflow principal de CI para Node 22, com base na evidência F0.13, que demonstrou comparação simétrica Node 20 vs Node 22 sem regressão detectada.

## Escopo
Esta etapa altera apenas `.github/workflows/ci.yml` para trocar o runtime do job `build_validate` para Node 22. Não altera `package.json`, lockfile, scripts, runtime amplo, IMOB/front door ou `ChatAgentLauncher`.

## Contexto F0.13
- F0.13 executou os 13 comandos reais de `build_validate` em ambiente simétrico.
- Node 20: `12 PASS / 1 FAIL`.
- Node 22: `12 PASS / 1 FAIL`.
- Classificação: `sem regressão detectada`.
- A única falha comum foi `core_tests` por `DATABASE_URL` ausente, classificada como dívida estrutural separada da migração de runtime.

## Alteração aplicada

Arquivo alterado:
- `.github/workflows/ci.yml`

Mudança efetiva:
- o workflow mantém `env.NODE_VERSION: '20'` no nível global;
- o job `build_validate` agora define `env.NODE_VERSION: '22'` localmente;
- o step `Setup Node.js` do `build_validate` continua consumindo `${{ env.NODE_VERSION }}`, mas passa a resolver `22` dentro do próprio job;
- os demais jobs do workflow permanecem inalterados.

## Diff funcional resumido

Antes:
```yaml
jobs:
  build_validate:
    runs-on: ubuntu-latest
```

Depois:
```yaml
jobs:
  build_validate:
    runs-on: ubuntu-latest
    env:
      NODE_VERSION: '22'
```

## Resultado esperado da migração
- `build_validate` deixa de rodar em Node 20.
- `build_validate` passa a usar Node 22 sem alterar a sequência de comandos do job.
- a falha estrutural conhecida de `core_tests` por `DATABASE_URL` ausente continua fora do escopo e não é mascarada.
- a mudança permanece limitada ao job `build_validate`.

## Classificação
Classificação: `migração autorizada e aplicada`

Justificativa:
- F0.13 já provou ausência de regressão de runtime para os comandos reais de `build_validate`;
- a alteração aqui é mínima e local ao job;
- não há rebaseline amplo do workflow;
- a dívida estrutural de `core_tests` continua explicitamente separada.

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=414` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/ci.yml` | diff controlado | apenas override local `build_validate.env.NODE_VERSION='22'` |
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
| `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('.github/workflows/ci.yml').read_text())"` | pass | YAML parseável após a mudança |
| `git diff --check` | pass | sem saída |

## Prova de isolamento
- `.github/workflows/ci.yml`: alterado apenas no job `build_validate`
- `.github/workflows/lint.yml`: sem diff
- `.github/workflows/release.yml`: sem diff
- `.github/workflows/critical-dod.yml`: sem diff
- `package.json`: sem diff
- `pnpm-lock.yaml`: sem diff
- `.nvmrc`: sem diff
- `.node-version`: sem diff
- scripts: sem diff
- allowlist: sem diff
- `ChatAgentLauncher`: sem diff
- IMOB/front door: sem diff
- backend funcional, frontend funcional, policy, Prisma, migrations, WhatsApp, mobile e economy: sem alteração

## Lacunas remanescentes

### P0
- A migração foi aplicada apenas em `build_validate`; o restante dos workflows residuais em Node 20 continua fora do escopo desta etapa.

### P1
- A falha estrutural de `core_tests` por `DATABASE_URL` ausente segue aberta e não foi corrigida neste PR.

### P2
- A triagem do teste `packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts` permanece como frente separada.

### P3
- Fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
