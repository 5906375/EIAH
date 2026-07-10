# F0.22 — fix release Node 22 readiness pnpm setup

## Data
2026-07-10

## Objetivo
Corrigir o setup de pnpm no workflow `ReleaseNode22Readiness` para eliminar o mismatch entre `PNPM_VERSION='9'` e `packageManager: pnpm@10.12.4`.

## Escopo
Este PR corrige somente o workflow de readiness. Não altera `release.yml` produtivo, `ci.yml`, `lint.yml`, `critical-dod.yml`, `package.json`, lockfile, scripts, runtime funcional, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Contexto
- F0.20 criou `.github/workflows/release-node22-readiness.yml` como ensaio seguro em Node 22.
- F0.21 observou falha real em `validate_release_readiness`.
- A causa raiz documentada em F0.21 foi mismatch entre `PNPM_VERSION='9'` no workflow e `packageManager: pnpm@10.12.4` no `package.json`.

## Alteração aplicada

Arquivo alterado:
- `.github/workflows/release-node22-readiness.yml`

Mudança efetiva:
- `PNPM_VERSION` foi alterado de `'9'` para `'10.12.4'`.

Antes:
```yaml
env:
  NODE_VERSION: '22'
  PNPM_VERSION: '9'
  READINESS_RELEASE_VERSION: '0.0.0-readiness'
```

Depois:
```yaml
env:
  NODE_VERSION: '22'
  PNPM_VERSION: '10.12.4'
  READINESS_RELEASE_VERSION: '0.0.0-readiness'
```

## Justificativa técnica
- o repositório declara `packageManager: "pnpm@10.12.4"` em `package.json`;
- `ci.yml`, `lint.yml` e `critical-dod.yml` já usam `10.12.4`;
- o readiness era a única superfície nova ainda fixada em `9`;
- alinhar o readiness ao baseline versionado remove o erro `ERR_PNPM_BAD_PM_VERSION` sem tocar no release path produtivo.

## Segurança preservada
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
- sem alteração em IMOB/front door
- sem alteração em `ChatAgentLauncher`

## Resultado desta etapa
`readiness corrigido no setup de pnpm; nova observação real ainda é necessária antes de migrar o release.yml`

Justificativa:
- o defeito específico de setup foi removido do workflow de readiness;
- esta etapa não inclui novo run real verde do GitHub Actions;
- portanto, ainda não existe base para autorizar migração do `release.yml` produtivo.

## Estratégia para próxima etapa
- reexecutar `ReleaseNode22Readiness` no GitHub Actions com o workflow corrigido;
- se o readiness ficar verde, uma etapa posterior pode propor migração controlada do `release.yml`;
- se surgir nova falha, corrigir o readiness antes de qualquer mudança no release path produtivo.

## Prova de isolamento
- `.github/workflows/release.yml` sem alteração
- `.github/workflows/ci.yml` sem alteração
- `.github/workflows/lint.yml` sem alteração
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
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=427` |
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
- o release path real continua dependente de readiness verde observado.

### P2
- publish NPM/GHCR/Docker continua fora desta etapa.

### P3
- fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
