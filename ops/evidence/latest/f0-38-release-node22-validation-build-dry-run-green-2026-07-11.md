# F0.38 — ReleaseNode22ValidationBuildDryRun green

## Data
2026-07-11

## Objetivo
Registrar o primeiro run verde do workflow manual `ReleaseNode22ValidationBuildDryRun`.

## Resultado observado
- Workflow: `ReleaseNode22ValidationBuildDryRun #1`
- Arquivo: `release-node22-validation-build-dry-run.yml`
- Evento: `workflow_dispatch`
- Branch: `main`
- Commit: `8d6b2cc`
- Status: `Success`
- Duração: `1m 16s`
- Jobs verdes:
  - `prepare_dry_run`
  - `detect_dry_run`
  - `validate_release_validation_build_dry_run`

## Contexto
F0.37 criou uma ponte manual de validação-build para a Camada A definida em F0.36.

## Decisão
O dry-run de validação-build está verde em `main`.

Isso comprova a Camada A, mas não autoriza publish, GHCR/Docker push, tags/releases, secrets produtivos ou migração direta do `release.yml`.

## Warnings observadas
Warnings de Node.js 20 em actions externas permanecem registradas como dívida técnica residual não bloqueante.

## Prova de isolamento
Esta PR é documental e não altera:
- workflows;
- `release.yml`;
- package/lockfile;
- apps;
- packages;
- scripts;
- schema Prisma;
- ChatAgentLauncher.

## Lacunas remanescentes

### P0
Camada A validada; release produtivo ainda não fechado.

### P1
Release produtivo permanece protegido.

### P2
Dry-run validation-build verde evidenciado.

### P3
Publish/GHCR/secrets/tags permanecem fora do escopo.

### P4
Fora do escopo.

## Status
Status: parcial/evidenciado
