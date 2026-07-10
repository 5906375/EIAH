# F0.24 — fix release readiness install/build order

## Data
2026-07-10

## Objetivo
Corrigir o fluxo de install/build do workflow `ReleaseNode22Readiness` para evitar que o `postinstall` construa `@eiah/core` antes de `@repo/db`.

## Escopo
Este PR corrige somente `.github/workflows/release-node22-readiness.yml`. Não altera `release.yml` produtivo, `ci.yml`, `lint.yml`, `critical-dod.yml`, `package.json`, lockfile, scripts, runtime funcional, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Contexto
- F0.21 registrou falha real por mismatch de pnpm.
- F0.22 corrigiu `PNPM_VERSION` para `10.12.4`.
- F0.23 registrou rerun real em que `pnpm install --frozen-lockfile` avançou, mas o `postinstall` acionou `pnpm --filter @eiah/core build` cedo demais.
- `@eiah/core` depende de `@repo/db` por workspace e o pacote `@repo/db` só publica seus artefatos após `generate/build`.

## Diagnóstico técnico

Arquivos inspecionados:
- `package.json`
- `packages/db/package.json`
- `packages/core/package.json`
- `.github/workflows/release-node22-readiness.yml`

Achados objetivos:
- o `package.json` raiz declara `postinstall: pnpm --filter @eiah/core build`;
- `packages/core/package.json` depende de `@repo/db: workspace:*`;
- `packages/db/package.json` expõe `dist/index.js` e `dist/index.d.ts`, gerados somente em `build`;
- portanto, `pnpm install --frozen-lockfile` com scripts habilitados pode disparar `@eiah/core build` antes de `@repo/db build`, reproduzindo o erro documentado em F0.23.

## Alteração aplicada

Arquivo alterado:
- `.github/workflows/release-node22-readiness.yml`

Mudanças efetivas:
- `Install dependencies` passou de `pnpm install --frozen-lockfile` para `pnpm install --frozen-lockfile --ignore-scripts`;
- foi adicionado um step explícito de build ordenado:
  - `pnpm --filter @repo/db build`
  - `pnpm --filter @eiah/core build`

Antes:
```yaml
      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run lint and build
        run: |
          pnpm lint
          pnpm build
```

Depois:
```yaml
      - name: Install dependencies without postinstall
        run: pnpm install --frozen-lockfile --ignore-scripts

      - name: Build workspace dependencies in release order
        run: |
          pnpm --filter @repo/db build
          pnpm --filter @eiah/core build

      - name: Run lint and build
        run: |
          pnpm lint
          pnpm build
```

## Justificativa técnica
- o problema real não estava em `release.yml` produtivo, mas no bootstrap do workflow de readiness;
- `--ignore-scripts` evita o `postinstall` prematuro do root;
- construir `@repo/db` antes de `@eiah/core` respeita a dependência real observada em F0.23;
- `pnpm lint` e `pnpm build` permanecem no readiness para validar a surface equivalente do release path, mas agora após a ordem mínima correta.

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
`readiness corrigido na ordem de install/build; nova observação real ainda é necessária`

Justificativa:
- a lacuna específica documentada em F0.23 foi tratada no workflow;
- esta etapa não inclui novo run real verde do GitHub Actions;
- portanto, ainda não existe base para autorizar migração do `release.yml` produtivo.

## Estratégia para próxima etapa
- reexecutar `ReleaseNode22Readiness` no GitHub Actions com o workflow corrigido;
- confirmar que o readiness supera o bootstrap de `@repo/db` / `@eiah/core`;
- somente após run real verde discutir migração controlada do `release.yml`.

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
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=429` |
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
- o release path real continua dependente de nova observação verde do readiness.

### P2
- publish NPM/GHCR/Docker continua fora desta etapa.

### P3
- fora do escopo.

### P4
- IMOB/front door fora do escopo e sem alteração.

## Status
Status: parcial/evidenciado
