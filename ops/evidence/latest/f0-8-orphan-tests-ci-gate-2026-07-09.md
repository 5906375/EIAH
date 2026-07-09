# F0.8 — Orphan tests CI gate

## Data
2026-07-09

## Objetivo
Promover `pnpm check:orphan-tests` a gate recorrente do CI principal, reutilizando o mecanismo já estabilizado em F0.7 sem alterar `package.json`, `scripts/checkOrphanTests.ts` ou `scripts/orphan-tests-allowlist.txt`.

## Escopo
Esta etapa altera apenas a integração do workflow principal de CI e a documentação/evidência correspondente. Não altera front door IMOB, `ChatAgentLauncher`, runtime, backend funcional, policy, Prisma, migrations, WhatsApp, mobile, billing/economy ou o mecanismo de orphan tests em si.

## Estado de entrada
- F0.7 deixou `pnpm check:orphan-tests` verde por baseline versionada.
- Estado confirmado em F0.7: `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]`.
- O workflow ainda estava em modo transitório, com step warn-only dentro de `build_validate`:
  - `run: pnpm check:orphan-tests`
  - `continue-on-error: true`

## Integração aplicada no CI
- Removido o step warn-only de `build_validate`.
- Adicionado job dedicado `orphan_tests_regression`.
- Nome visível no CI: `OrphanTestsRegression`.
- Estrutura alinhada ao padrão já usado por jobs dedicados como `ImobFrontdoorRegression`:
  - checkout
  - setup pnpm
  - setup node 22
  - install dependencies
  - `pnpm check:orphan-tests`

## Comportamento esperado do gate
- Falha se surgir novo teste órfão fora de `scripts/orphan-tests-allowlist.txt`.
- Falha se aparecer `staleAllowlistEntries`.
- Passa quando a dívida conhecida permanecer exatamente dentro da baseline versionada vigente.
- Não altera a política de baseline definida em F0.7.

## Checks executados
| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true` após indexar esta evidência |
| `pnpm check:docs-link-integrity` | pass | `ok=true` |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | Sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | Sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | Sem alteração |
| `git diff --check` | pass | Sem conflito/whitespace issue |

## Prova de isolamento
- Nenhuma alteração em `package.json`.
- Nenhuma alteração em `scripts/checkOrphanTests.ts`.
- Nenhuma alteração em `scripts/orphan-tests-allowlist.txt`.
- Nenhuma alteração em `apps/web/src/components/agents/ChatAgentLauncher.tsx`.
- Nenhuma alteração em `apps/web/src/pages/app/imob/chat.tsx`.
- Nenhuma alteração em `apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts`.
- Nenhuma alteração em backend funcional, policy, Prisma, runtime amplo ou UX.

## Lacunas remanescentes

### P0
- O gate agora é bloqueante no CI, mas a dívida real de 50 órfãos segue aberta e precisa ser reduzida progressivamente por owner/área.

### P1
- Enquanto a baseline não diminuir, o repositório continua carregando cobertura relevante fora das suites explicitamente amarradas por área.

### P2
- A integração do gate não resolve a decisão individual de cada teste órfão sobre entrar em suite real, depender de infra dedicada ou ser removido.

### P3
- Fora do escopo desta frente.

### P4
- Fora do escopo IMOB/front door.

## Status
Status: parcial/evidenciado
