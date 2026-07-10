# F0.18 — critical-dod.yml Node 22 migration

## Data
2026-07-10

## Objetivo
Migrar somente `.github/workflows/critical-dod.yml` de Node 20 para Node 22, com base na auditoria F0.16 que classificou `critical-dod.yml` como risco médio.

## Escopo
Esta etapa altera apenas `.github/workflows/critical-dod.yml` para trocar o runtime Node do workflow `Critical DoD` para 22. Não altera `package.json`, lockfile, scripts, runtime amplo, IMOB/front door ou `ChatAgentLauncher`.

## Contexto
- F0.11 declarou baseline Node 22 em `package.json`, `.nvmrc` e `.node-version`.
- F0.14 migrou `build_validate` para Node 22.
- F0.15 corrigiu a falha acidental de `core_tests` no `build_validate`.
- F0.16 auditou `critical-dod.yml` como workflow residual de risco médio.
- F0.17 migrou `lint.yml` para Node 22.

## Alteração aplicada

Arquivo alterado:
- `.github/workflows/critical-dod.yml`

Mudança efetiva:
- o literal `node-version: 20` foi alterado para `node-version: 22`.
- `pnpm/action-setup@v4` continua usando `10.12.4`.
- Todos os comandos `pnpm check:*` do workflow permanecem inalterados.
- Triggers e estrutura do job permanecem inalterados.

## Diff funcional resumido

Antes:
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
```

Depois:
```yaml
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
```

## Resultado esperado da migração
- O workflow `Critical DoD` passa a usar Node 22.
- Os checks normativos de recency, interop, governança, RBAC e economy passam a rodar na baseline do repositório.
- Não há alteração de release path, publish, registry, Prisma migration flow ou runtime funcional.

## Classificação
Classificação: `migração autorizada e aplicada`

Justificativa:
- F0.16 classificou `critical-dod.yml` como risco médio, não alto.
- O workflow não publica artefatos nem depende de secrets de release.
- A alteração é mínima e limitada ao runtime Node literal do próprio workflow.

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=420` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/lint.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/release.yml` | vazio | sem alteração |
| `git diff -- .github/workflows/critical-dod.yml` | diff controlado | apenas `node-version: 22` |
| `git diff -- package.json` | vazio | sem alteração |
| `git diff -- pnpm-lock.yaml` | vazio | sem alteração |
| `git diff -- .nvmrc` | vazio | sem alteração |
| `git diff -- .node-version` | vazio | sem alteração |
| `git diff -- scripts/checkOrphanTests.ts` | vazio | sem alteração |
| `git diff -- scripts/orphan-tests-allowlist.txt` | vazio | sem alteração |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | sem alteração |
| `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('.github/workflows/critical-dod.yml').read_text())"` | pass | YAML parseável após a mudança |
| `git diff --check` | pass | sem saída |

## Prova de isolamento
- `.github/workflows/ci.yml`: sem diff
- `.github/workflows/lint.yml`: sem diff
- `.github/workflows/release.yml`: sem diff
- `.github/workflows/critical-dod.yml`: alterado apenas no `node-version`
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
- `release.yml` permanece em Node 20 e segue fora do escopo desta etapa.

### P1
- O workflow `Critical DoD` já migra para a baseline, mas os gates normativos continuam dependendo de evidência operacional real, não apenas do runtime Node.

### P2
- `release.yml` continua sendo o workflow residual de maior risco por envolver publish NPM/GHCR e secrets de release.

### P3
- Fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
