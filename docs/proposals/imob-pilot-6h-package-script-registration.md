# IMOB-PILOT-6H - Package Script Registration

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

IMOB-PILOT-6H registra comandos manuais oficiais no `package.json` para o static harness contract check IMOB e seu teste local. Esta fase nao altera CI, nao cria CI gate, nao executa dry-run real, nao inicia shadow real, nao ativa pilot ou small rollout, nao cria frontend preview, nao altera frontend, nao altera `ChatAgentLauncher`, nao altera runtime, engine ou API, nao chama provider, nao escreve DB, ledger ou audit, nao gera receipt, bundle ou proof, nao altera `docs/EVIDENCE_INDEX.md`, nao declara Receipt Canon fechado e nao declara IMOB operacionalmente fechado.

## Pre-condicao registrada

- IMOB-PILOT-6G mergeado em `c2aaaf746bbc971fb7d3982a3771c9f9ad8ab07f`.
- `IMOB Worker Mutation E2E` run `29645882248`: `completed success`.
- `CI Monorepo` run `29645882249`: `completed success`.
- Branch remota 6G removida por `git fetch --prune`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `c2aaaf7 Merge pull request #343 from 5906375/docs/imob-pilot-6g-package-ci-gate-evaluation`.

## Package scripts registrados

Foram registrados somente comandos manuais locais:

- `check:imob-static-harness-contract`: `tsx scripts/checkImobStaticHarnessContract.ts`
- `test:imob-static-harness-contract`: `node --import tsx --test scripts/tests/checkImobStaticHarnessContract.test.ts`

## Ajuste do check estatico

O check `scripts/checkImobStaticHarnessContract.ts` evolui a regra antiga de ausencia total de registro para a regra compativel com IMOB-PILOT-6H:

- package script manual esperado e permitido;
- teste manual esperado e permitido;
- referencia em `.github/workflows/ci.yml` continua proibida ate IMOB-PILOT-6I;
- CI gate continua proibido nesta fase.

## Orphan tests

A entrada `scripts/tests/checkImobStaticHarnessContract.test.ts` foi removida de `scripts/orphan-tests-allowlist.txt`, pois o teste passou a ter caminho manual oficial via `test:imob-static-harness-contract`.

## Boundaries

IMOB-PILOT-6H preserva:

- Sem alteracao de CI.
- Sem CI gate.
- Sem dry-run real.
- Sem shadow real.
- Sem pilot ou small rollout.
- Sem frontend preview.
- Sem provider.
- Sem DB, ledger ou audit.
- Sem receipt, bundle ou proof.
- Sem frontend, `ChatAgentLauncher`, runtime, engine ou API.
- Sem schema Prisma, seeds ou migrations.
- Sem Evidence Index.
- Sem declaracao de Receipt Canon fechado.
- Sem declaracao de IMOB operacionalmente fechado.

## Proxima fase proposta

`IMOB-PILOT-6I - CI Gate Wiring`, somente apos 6H verde e com decisao explicita para alterar `.github/workflows/ci.yml`.

## Status final

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.
