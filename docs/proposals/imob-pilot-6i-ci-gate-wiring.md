# IMOB-PILOT-6I - CI Gate Wiring

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

IMOB-PILOT-6I liga o static harness contract check IMOB ao `CI Monorepo` por package scripts ja registrados em IMOB-PILOT-6H. Esta fase nao altera `package.json`, nao executa dry-run real, nao inicia shadow real, nao cria frontend preview, nao altera runtime, frontend, `ChatAgentLauncher`, engine ou API, nao chama provider, nao escreve DB, ledger ou audit, nao gera receipt, bundle ou proof, nao altera `docs/EVIDENCE_INDEX.md`, nao declara Receipt Canon fechado e nao declara IMOB operacionalmente fechado.

## Pre-condicao registrada

- IMOB-PILOT-6H mergeado em `343565b77cbf2cde9e3300908d56abb1f5420fd1`.
- `IMOB Worker Mutation E2E` run `29647674501`: `completed success`.
- `CI Monorepo` run `29647674484`: `completed success`.
- Branch remota 6H removida por `git fetch --prune`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `343565b Merge pull request #344 from 5906375/feat/imob-pilot-6h-package-script-registration`.

## Wiring

Workflow alterado:

- `.github/workflows/ci.yml`

Job alterado:

- `orphan_tests_regression` (`OrphanTestsRegression`)

Step adicionado:

- `Run IMOB static harness contract gate`

Comandos executados pelo step:

- `pnpm check:imob-static-harness-contract`
- `pnpm test:imob-static-harness-contract`

## Contrato atualizado

O check `scripts/checkImobStaticHarnessContract.ts` passa a exigir o gate CI esperado da fase 6I:

- step `Run IMOB static harness contract gate`;
- comando `pnpm check:imob-static-harness-contract`;
- comando `pnpm test:imob-static-harness-contract`;
- uso de package scripts, sem referencia direta ao arquivo de implementacao ou ao arquivo de teste;
- ausencia do gate no `IMOB Worker Mutation E2E`.

Os package scripts de IMOB-PILOT-6H continuam esperados e permanecem sem alteracao em `package.json`.

## Rollback

Rollback simples:

1. Remover o step `Run IMOB static harness contract gate` de `.github/workflows/ci.yml`.
2. Reverter a regra 6I em `scripts/checkImobStaticHarnessContract.ts` e os testes 6I correspondentes.

## Boundaries

IMOB-PILOT-6I preserva:

- Sem execucao no `IMOB Worker Mutation E2E`.
- Sem dry-run real.
- Sem shadow real.
- Sem frontend preview.
- Sem provider.
- Sem DB.
- Sem ledger/audit.
- Sem receipt, bundle ou proof.
- Sem runtime, frontend, `ChatAgentLauncher`, engine ou API.
- Sem `package.json`.
- Sem Evidence Index.
- Sem declaracao de Receipt Canon fechado.
- Sem declaracao de IMOB operacionalmente fechado.

## Proxima fase

Apos PR e CI remoto verde, a proxima fase deve apenas consumir a evidencia remota real. Nenhuma declaracao de fechamento operacional IMOB ou Receipt Canon fechado e autorizada por este wiring.
