# F0.34 — ReleaseNode22Readiness green after F0.33

## Data
2026-07-11

## Objetivo
Registrar o primeiro run verde do `ReleaseNode22Readiness` em `main` após as correções F0.29–F0.33.

## Resultado observado
- Workflow: `release-node22-readiness.yml`
- Evento: `workflow_dispatch`
- Branch: `main`
- Commit: `164df7e`
- Status: `Success`
- Duração: `1m 7s`
- Jobs verdes:
  - `prepare_readiness`
  - `detect_readiness`
  - `validate_release_readiness`

## Contexto
O run verde ocorreu após:
- F0.29 corrigir CLI/contracts;
- F0.30 corrigir API IMOB build drift;
- F0.31 corrigir path do schema Prisma no readiness;
- F0.32 corrigir formatação Prisma e check P1 whitespace;
- F0.33 corrigir flags removidas do `prisma migrate diff`.

## Warnings observadas
O run apresentou warnings de depreciação de Node.js 20 em actions externas. Essas warnings não bloquearam o workflow, mas devem permanecer rastreadas como risco técnico residual.

## Decisão
O workflow de readiness está verde em `main`.

Isso não altera automaticamente o `release.yml` produtivo, não executa publish e não autoriza declarar o release path fechado sem uma etapa dedicada de decisão/migração.

## Prova de isolamento
Confirmado neste PR documental:
- sem alteração em workflows;
- sem alteração em `release.yml`;
- sem alteração em package/lockfile;
- sem alteração em apps;
- sem alteração em packages;
- sem alteração em scripts;
- sem alteração em schema Prisma;
- sem alteração em `ChatAgentLauncher`.

## Lacunas remanescentes

### P0
Readiness green evidenciado; pendente decisão separada sobre migração do release path produtivo.

### P1
Release produtivo permanece protegido.

### P2
Compatibilidade do readiness foi validada em run real.

### P3
Fora do escopo.

### P4
Fora do escopo.

## Status
Status: parcial/evidenciado
