# IMOB-PILOT-6G - Package Script / CI Gate Evaluation

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

IMOB-PILOT-6G cria somente uma avaliacao documental governada para decidir se o check local IMOB deve ser promovido para package script e/ou CI gate em fases futuras. Esta entrega nao registra package script, nao altera CI, nao executa dry-run real, nao inicia shadow real, nao ativa pilot ou small rollout, nao cria frontend preview, nao altera frontend, nao altera `ChatAgentLauncher`, nao altera runtime, engine ou API, nao chama provider, nao escreve DB, ledger ou audit, nao gera receipt, bundle ou proof, nao altera `docs/EVIDENCE_INDEX.md`, nao declara Receipt Canon fechado e nao declara IMOB operacionalmente fechado.

O objetivo e preservar a decisao governada entre o check local ja existente e qualquer promocao futura para fluxo oficial de package script ou CI.

## Pre-condicao registrada

Pre-condicao fornecida para esta fase:

- IMOB-PILOT-6F mergeado em `5880961ed553cb21906ee2eafdd20ec0c7ba2c45`.
- `IMOB Worker Mutation E2E` run `29644259965`: `completed success`.
- `CI Monorepo` run `29644259939`: `completed success`.
- Branch remota 6F removida por `git fetch --prune`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `5880961 Merge pull request #342 from 5906375/feat/imob-pilot-6f-local-static-check-tests`.

## Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `scripts/checkImobStaticHarnessContract.ts`
- `scripts/tests/checkImobStaticHarnessContract.test.ts`
- `scripts/orphan-tests-allowlist.txt`
- `package.json`
- `.github/workflows/ci.yml`
- `docs/proposals/imob-pilot-6d-static-check-implementation-plan.md`
- `docs/proposals/imob-pilot-6a-static-harness-contract-check.md`
- `docs/proposals/imob-pilot-6b-static-check-implementation-design.md`
- `docs/proposals/imob-pilot-6c-static-check-non-executable-pseudocode.md`

## Objetivo

Esta avaliacao deve:

1. Avaliar se o check local IMOB deve ser promovido para package script.
2. Avaliar se o check local IMOB deve ser promovido para CI gate.
3. Nao ativar package script ou CI nesta fase.
4. Preservar decisao governada, com fases separadas para qualquer promocao futura.
5. Manter `GO_FOR_NEXT_REVIEW_ONLY` como revisao futura, nunca como autorizacao operacional ou produtiva.

## Estado atual

Estado observado nesta fase:

- O script local existe em `scripts/checkImobStaticHarnessContract.ts`.
- Os testes locais existem em `scripts/tests/checkImobStaticHarnessContract.test.ts`.
- O teste esta em `scripts/orphan-tests-allowlist.txt` como manual-only.
- Nao ha package script registrado em `package.json` para `check:imob-static-harness-contract`.
- Nao ha CI gate registrado em `.github/workflows/ci.yml` para `checkImobStaticHarnessContract` ou `check:imob-static-harness-contract`.
- O script e local, offline, deterministico, stdout-only e declara `packageScriptRegistered=false`, `ciGateRegistered=false`, `networkCalls=false`, `readsEnvOrSecrets=false`, `writesFiles=false`, `dryRunExecuted=false`, `shadowStarted=false`, `frontendPreviewCreated=false`, `providerExternalCall=0`, `dbWrite=0`, `ledgerWrite=0`, `auditWrite=0`, `receiptGenerated=0`, `bundleGenerated=0` e `proofGenerated=0`.

## Opcoes avaliadas

| Opcao | Descricao | Beneficio | Risco | Leitura 6G |
| --- | --- | --- | --- | --- |
| Manter manual-only | Preservar execucao manual por comando direto, com teste na orphan allowlist. | Menor risco operacional e zero acoplamento ao workflow atual. | Drift pode passar se o check nao for lembrado em revisoes. | Aceitavel como estado atual, mas fraco para prevencao recorrente de drift. |
| Adicionar package script sem CI | Registrar um script oficial no `package.json`, sem ligar a workflow remoto. | Cria caminho padrao para devs e futuras automacoes sem impactar CI. | Pode gerar falsa percepcao de gate obrigatorio se a documentacao for ambigua. | Recomendado para IMOB-PILOT-6H, desde que mantenha o teste fora da allowlist somente quando houver caminho oficial. |
| Adicionar package script + CI gate | Registrar script e executar no CI. | Bloqueia drift em PRs e reduz esquecimento manual. | Aumenta blast radius do CI antes de observar estabilidade do script oficial. | Nao recomendado nesta fase; avaliar em IMOB-PILOT-6I apos 6H verde. |
| Adicionar CI gate apenas em job especifico | Executar comando direto em job IMOB/chat/documental sem package script. | Limita impacto a um job e evita mexer em scripts globais. | Cria caminho CI sem entrada local canonica; maior risco de divergencia local/remoto. | Opcao secundaria para 6I, somente se houver razao forte para nao registrar package script primeiro. |

## Criterios Go/No-Go

Qualquer promocao futura deve passar por estes criterios:

| Criterio | Go minimo | No-Go |
| --- | --- | --- |
| Determinismo | Mesmo input local produz mesmo resultado e mesma decisao. | Resultado depende de ordem instavel, tempo, ambiente externo ou estado nao versionado. |
| Tempo de execucao | Execucao curta e compativel com workflow local/CI. | Tempo imprevisivel ou impacto relevante no CI atual sem justificativa. |
| Ausencia de rede | Nenhuma chamada de rede. | Qualquer dependencia de rede, API externa, provider ou fetch remoto. |
| Ausencia de secrets | Nao le `process.env` para credenciais ou secrets. | Leitura de token, secret produtivo ou variavel sensivel. |
| Ausencia de side effects | Nao escreve arquivos, DB, ledger, audit, receipt, bundle ou proof. | Qualquer write ou geracao operacional. |
| Estabilidade dos testes | Teste local passa de forma repetivel e cobre happy path e fail-closed. | Teste flaky, dependente de infra ou com fixture nao sintetica. |
| Compatibilidade com CI atual | Usa Node/tsx compativel e nao exige services adicionais. | Exige DB, Redis, provider, browser, preview frontend ou services nao necessarios. |
| Clareza de failure messages | Falhas trazem reasonCode, caminho e mensagem acionavel. | Falha generica, silenciosa ou dificil de diagnosticar. |
| Rollback simples | Remocao de package script ou step CI e reversao pequena. | Promocao mistura package, CI, runtime, evidence ou workflow produtivo no mesmo PR. |

## Impactos esperados

| Impacto | Manual-only | Package script sem CI | Package script + CI gate | CI gate em job especifico |
| --- | --- | --- | --- | --- |
| Developer workflow | Exige lembrar comando direto. | Melhora ergonomia com comando canonico. | Melhora disciplina, mas exige resolver falhas antes do merge. | Similar ao CI gate, porem com menor clareza local se nao houver script. |
| CI duration | Sem impacto. | Sem impacto remoto. | Aumenta pouco se o check permanecer local/offline. | Aumenta apenas no job escolhido. |
| False positives | Baixo impacto porque manual. | Baixo impacto, mais visivel localmente. | Maior impacto por bloquear PR. | Medio; bloqueia ou informa conforme job escolhido. |
| False negatives | Maior, pois depende de execucao manual. | Medio, pois ainda depende de disciplina local. | Menor, porque executa em PR. | Menor dentro do job coberto, mas pode haver drift de entrada local. |
| Manutencao futura | Allowlist precisa continuar justificada. | Package script vira ponto unico de manutencao. | Exige manutencao de script, package e workflow. | Exige manutencao de workflow e possivel comando duplicado. |
| Docs drift prevention | Fraca. | Media. | Forte. | Forte no CI, media no workflow local. |

## Recomendacao tecnica

Recomendacao conservadora:

1. Promover primeiro para package script em `IMOB-PILOT-6H - Package Script Registration`.
2. Nao alterar CI em 6H.
3. Rodar o script oficial localmente em 6H e validar que a mensagem de falha continua acionavel.
4. Remover `scripts/tests/checkImobStaticHarnessContract.test.ts` da orphan allowlist somente quando o teste tiver caminho oficial via package script e/ou CI.
5. Avaliar CI gate em `IMOB-PILOT-6I - CI Gate Wiring`, somente apos 6H verde.
6. Preferir que o CI chame o package script oficial, para evitar divergencia entre comando local e comando remoto.

Esta recomendacao nao autoriza a alteracao de `package.json`, `.github/workflows/ci.yml` ou `scripts/orphan-tests-allowlist.txt` nesta fase.

## Boundaries

IMOB-PILOT-6G preserva:

- Sem dry-run real.
- Sem shadow real.
- Sem pilot.
- Sem small rollout.
- Sem frontend preview.
- Sem provider.
- Sem provider payload real.
- Sem secret produtivo.
- Sem webhook produtivo.
- Sem DB.
- Sem DB write.
- Sem ledger/audit.
- Sem ledger/audit write.
- Sem receipt.
- Sem receipt generation.
- Sem bundle.
- Sem bundle generation/export.
- Sem proof.
- Sem proof generation ou fabrication.
- Sem Evidence Index automatico.
- Sem frontend change.
- Sem `ChatAgentLauncher` change.
- Sem runtime change.
- Sem engine change.
- Sem API.
- Sem mutation.
- Sem schema Prisma.
- Sem seeds/migrations.
- Sem package script.
- Sem CI gate.
- Sem operacao fechada.
- Sem declarar Receipt Canon fechado.
- Sem declarar IMOB operacionalmente fechado.

## Proximas fases propostas

| Fase | Objetivo | Condicao |
| --- | --- | --- |
| `IMOB-PILOT-6H - Package Script Registration` | Registrar o package script oficial para o check local IMOB, sem CI. | So alterar `package.json` em PR/tarefa separada; validar comando local; ajustar orphan allowlist somente se o teste tiver caminho oficial. |
| `IMOB-PILOT-6I - CI Gate Wiring` | Ligar o check ao CI somente apos 6H verde. | Preferir chamada ao package script oficial; manter sem rede, secrets, DB, ledger, audit, provider, frontend preview, receipt, bundle ou proof. |

## Decisao desta fase

Nesta fase:

- Nao alterar `package.json`.
- Nao alterar `.github/workflows/ci.yml`.
- Nao criar package script.
- Nao criar CI gate.
- Nao alterar scripts existentes.
- Nao alterar testes existentes.
- Nao alterar `scripts/orphan-tests-allowlist.txt`.
- Nao alterar `docs/EVIDENCE_INDEX.md`.
- Nao executar dry-run real.
- Nao iniciar shadow real.
- Nao criar frontend preview.
- Nao chamar provider.
- Nao escrever DB, ledger ou audit.
- Nao gerar receipt, bundle ou proof.
- Nao declarar Receipt Canon fechado.
- Nao declarar IMOB operacionalmente fechado.

## Checks requeridos para esta entrega

- `npx tsx scripts/checkImobStaticHarnessContract.ts`
- `node --import tsx --test scripts/tests/checkImobStaticHarnessContract.test.ts`
- `pnpm test:chat-gate-proof-adapters`
- `pnpm test:chat-vertical-handoff-surface`
- `pnpm test:chat-vertical-handoff-snapshot`
- `pnpm check:arch-chat-contracts`
- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `pnpm check:orphan-tests`
- `git diff --check`
- `git diff -- .github/workflows release.yml apps packages scripts`
- `git diff --cached --check`
- `git diff --cached -- .github/workflows release.yml apps packages scripts`

## Status final

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

IMOB-PILOT-6G permanece avaliacao documental governada. Qualquer package script futuro pertence a IMOB-PILOT-6H. Qualquer CI gate futuro pertence a IMOB-PILOT-6I apos 6H verde.
