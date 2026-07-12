# F0.41 — ReleasePublishPreflight green

## Data
2026-07-11

## Objetivo
Registrar o primeiro run verde do workflow manual `ReleasePublishPreflight`.

## Resultado observado
- Workflow: `ReleasePublishPreflight #1`
- Arquivo: `release-publish-preflight.yml`
- Evento: `workflow_dispatch`
- Branch: `main`
- Commit: `6174fc9`
- Status: `Success`
- Duração: `28s`
- Jobs verdes:
  - `prepare_preflight`
  - `detect_preflight`
  - `preflight_release_publish_layer`

## Contexto
F0.40 criou um preflight manual da Camada B sem side effects.

## Decisão
O preflight da Camada B está verde em `main`.

Isso comprova apenas o preflight. Não autoriza publish, registry login, GHCR/Docker push, tags/releases, secrets produtivos ou migração direta do `release.yml`.

## Warnings observadas
Warnings de depreciação de Node.js 20 em actions externas permanecem como dívida técnica residual não bloqueante.

## Prova de isolamento
Esta PR é documental e não altera:
- workflows;
- `release.yml`;
- package/lockfile;
- apps;
- packages;
- scripts;
- schema Prisma;
- `ChatAgentLauncher`.

## Lacunas remanescentes

### P0
Preflight da Camada B validado; release produtivo ainda não fechado.

### P1
Release produtivo permanece protegido.

### P2
Preflight verde evidenciado.

### P3
Publish/GHCR/secrets/tags permanecem fora do escopo de execução real.

### P4
Fora do escopo.

## Status
Status: parcial/evidenciado
