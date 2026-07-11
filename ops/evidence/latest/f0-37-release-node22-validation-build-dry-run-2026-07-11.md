# F0.37 — release Node 22 validation/build dry-run bridge

## Data
2026-07-11

## Objetivo
Implementar a Camada A definida em F0.36: uma ponte/dry-run manual de validação-build para aproximar o `release.yml` produtivo do readiness verde, sem publish acidental.

## Contexto

Base considerada:

- F0.34 evidenciou `ReleaseNode22Readiness` verde em `main`;
- F0.35 auditou `release.yml` e apontou divergências remanescentes;
- F0.36 definiu que a aproximação futura deve ser fatiada em:
  - Camada A: validação/build;
  - Camada B: publish/secrets/GHCR/Docker/tags.

F0.37 implementa somente a Camada A.

## Arquivo criado

| Arquivo | Papel |
| --- | --- |
| `.github/workflows/release-node22-validation-build-dry-run.yml` | workflow manual isolado para validar a trilha Node 22 de install/build/Prisma sem tocar em publish produtivo |

## Desenho do workflow

O novo workflow:

- usa `workflow_dispatch`;
- aceita `version` apenas como input opcional de rastreabilidade;
- fixa `NODE_VERSION: '22'`;
- fixa `PNPM_VERSION: '10.12.4'`;
- usa `pnpm install --frozen-lockfile --ignore-scripts`;
- executa build ordenado de `@repo/db` e `@eiah/core`;
- executa `pnpm lint` e `pnpm build`;
- valida Prisma com:
  - `--schema ./prisma/schema.prisma`
  - `prisma format --check`
  - `prisma migrate diff --from-schema ./prisma/schema.prisma --to-schema ./prisma/schema.prisma`

## Restrições confirmadas

O workflow novo não contém:

- `NODE_AUTH_TOKEN`
- `NPM_TOKEN`
- `REGISTRY_PAT`
- `docker/login-action`
- `docker/build-push-action`
- `pnpm publish`
- `npm publish`
- push para GHCR
- gatilho por tag

## Relação com o release produtivo

O workflow novo aproxima apenas a camada de validação/build do release produtivo:

- baseline Node/pnpm;
- install strategy;
- ordem explícita de build;
- comandos Prisma.

Ele não migra `.github/workflows/release.yml` e não cobre:

- publish CLI;
- imagens API/workers;
- GHCR;
- secrets;
- tags/releases.

## Validações executadas

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:evidence-index` | pass | `ok: true`, `refsChecked: 460` |
| `pnpm check:docs-link-integrity` | pass | `ok: true`, `filesChecked: 15` |
| `git diff -- .github/workflows/release.yml .github/workflows/release-node22-readiness.yml package.json pnpm-lock.yaml .nvmrc .node-version apps packages scripts` | pass | sem saída, confirmando isolamento dos arquivos fora do escopo |
| `python3 -c "import yaml, pathlib; yaml.safe_load(pathlib.Path('.github/workflows/release-node22-validation-build-dry-run.yml').read_text()); print('YAML_OK')"` | pass | confirmou parsing básico do novo workflow com `PyYAML` disponível no ambiente |

## Limitação explícita

Esta etapa implementa o workflow de bridge, mas não executa o dry-run no GitHub Actions.

Portanto:

- há evidência real da implementação do bridge;
- ainda não há evidência de run verde desse novo workflow;
- qualquer uso desse bridge como base para migrar `release.yml` continua dependendo de etapa separada.

## Prova de isolamento

Sem alteração em:

- `.github/workflows/release.yml`
- `.github/workflows/release-node22-readiness.yml`
- demais workflows existentes
- `package.json`
- `pnpm-lock.yaml`
- `.nvmrc`
- `.node-version`
- apps
- packages
- scripts
- schema Prisma
- migrations
- `ChatAgentLauncher`
- IMOB UI

## Resultado

F0.37 materializa a Camada A como workflow manual separado, mantendo o release produtivo intocado e reduzindo o risco de publish acidental.

## Status
Status: parcial/evidenciado
