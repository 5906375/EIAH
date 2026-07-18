# IMOB-PILOT-6D - Static Check Implementation Plan

Status: parcial/evidenciado localmente; aguardando PR/CI remoto.

## Resumo

IMOB-PILOT-6D cria somente um plano documental para implementacao futura do static harness contract check. Esta entrega nao cria script executavel, nao registra package script, nao altera CI, nao executa dry-run real, nao inicia shadow real, nao ativa pilot ou small rollout, nao cria preview frontend, nao altera frontend, nao altera `ChatAgentLauncher`, nao altera runtime, engine ou API, nao cria provider, nao escreve DB, ledger ou audit, nao gera receipt, bundle ou proof, nao altera `docs/EVIDENCE_INDEX.md`, nao declara Receipt Canon fechado e nao declara IMOB operacionalmente fechado.

O objetivo e decompor a implementacao futura em fases governadas, preservando que IMOB-PILOT-6D nao e uma autorizacao de execucao.

## Pre-condicao registrada

Pre-condicao fornecida para esta fase:

- IMOB-PILOT-6C mergeado em `bfae7ad8e821a9f1ea4375c427ed2577279a7844`.
- `IMOB Worker Mutation E2E` run `29641705773`: `completed success`.
- `CI Monorepo` run `29641705755`: `completed success`.
- Worktree limpa antes das alteracoes.

Pre-check local executado antes de alteracao:

- `git switch main`: ja em `main`.
- `git pull --ff-only origin main`: `Already up to date`.
- `git fetch --prune`: concluido.
- `git status --short`: limpo.
- `git log --oneline -5`: topo `bfae7ad Merge pull request #339 from 5906375/docs/imob-pilot-6c-static-check-pseudocode`.

## Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/proposals/imob-pilot-0-shadow-readiness-checklist.md`
- `docs/proposals/imob-pilot-1-shadow-dry-run-evidence-plan.md`
- `docs/proposals/imob-pilot-2-dry-run-fixture-pack-evidence-template.md`
- `docs/proposals/imob-pilot-3-shadow-dry-run-harness-plan.md`
- `docs/proposals/imob-pilot-4-non-operational-dry-run-harness-spec.md`
- `docs/proposals/imob-pilot-5-non-operational-harness-skeleton.md`
- `docs/proposals/imob-pilot-6a-static-harness-contract-check.md`
- `docs/proposals/imob-pilot-6b-static-check-implementation-design.md`
- `docs/proposals/imob-pilot-6c-static-check-non-executable-pseudocode.md`
- `ops/evidence/templates/imob-pilot-2-shadow-dry-run-evidence-template.md`
- `apps/api/src/tests/fixtures/imob-pilot-2/imob-pilot-2-shadow-dry-run.fixture.json`
- `contracts/chat/chat.vertical_handoff.v1.schema.json`
- `contracts/chat/hitl.gate_state.v1.schema.json`
- `contracts/chat/proof_receipt_bundle_state.v1.schema.json`
- `apps/api/src/services/chatVerticalHandoffSnapshot.ts`
- `apps/api/src/services/chatGateProofAdapters.ts`
- `apps/web/src/components/chat/ChatVerticalHandoffSurface.tsx`
- `package.json`
- `.github/workflows/ci.yml`

## Estado atual observado

- IMOB-PILOT-0 a IMOB-PILOT-6C permanecem documentais, nao operacionais e sem autorizacao de shadow, dry-run, pilot ou small rollout.
- IMOB-PILOT-6A definiu o contrato conceitual de static check para bloquear drift entre fixture, template, spec, skeleton, contratos fisicos, metricas, reasonCodes e boundaries.
- IMOB-PILOT-6B definiu componentes futuros: leitor de referencias, validadores de metricas, reasonCodes, No-Go, boundaries, detector de linguagem produtiva, detector de drift e emissor de relatorio local.
- IMOB-PILOT-6C registrou pseudocodigo nao executavel para esses componentes, explicitamente nao importavel e nao executavel.
- A fixture IMOB-PILOT-2 continua sintetica e sanitizada, com `providerExternalCall=0`, `mutationExternalSideEffect=0`, `dbWrite=0`, `ledgerWrite=0`, `auditWrite=0`, `receiptGenerated=0`, `bundleGenerated=0` e `proofGenerated=0`.
- Os contratos `chat.vertical_handoff.v1`, `hitl.gate_state.v1` e `proof_receipt_bundle_state.v1` seguem como baseline fisica.
- `ChatVerticalHandoffSurface` e uma superficie read-only; `ChatAgentLauncher` permanece fora de qualquer regra de negocio.

## Objetivo

O plano de implementacao futura deve:

1. Planejar a implementacao futura do static harness contract check.
2. Decompor a implementacao futura em PRs/fases com escopo limitado.
3. Preservar execucao proibida nesta fase.
4. Impedir que planejamento seja tratado como autorizacao produtiva.
5. Manter Evidence Index fora do fluxo ate existir evidencia real, fisica, verificavel e indexavel.

## Fases futuras propostas

| Fase futura | Objetivo | Status autorizado por IMOB-PILOT-6D |
| --- | --- | --- |
| `IMOB-PILOT-6E` | Implementar check estatico local sem CI e sem package script. | Planejada, nao iniciada. |
| `IMOB-PILOT-6F` | Adicionar testes unitarios do check estatico, sem CI obrigatorio. | Planejada, nao iniciada. |
| `IMOB-PILOT-6G` | Avaliar package script e/ou CI gate em PR separado. | Planejada, nao iniciada. |
| `IMOB-PILOT-7A` | Decidir frontend fixture preview somente apos gate estatico estabilizado. | Planejada, nao iniciada. |

## Arquivos futuros possiveis

Arquivos possiveis em fases futuras, nao criados por IMOB-PILOT-6D:

- `scripts/checkImobStaticHarnessContract.ts`
- `scripts/tests/checkImobStaticHarnessContract.test.ts`
- `package.json`, somente para script futuro em IMOB-PILOT-6G ou fase equivalente.
- `.github/workflows/ci.yml`, somente para gate futuro em IMOB-PILOT-6G ou fase equivalente.
- `ops/evidence/latest/imob-static-harness-contract-check-YYYY-MM-DD.md`, somente se houver execucao real de check autorizada e evidencia indexavel.

IMOB-PILOT-6D nao cria nenhum desses arquivos.

## Condicoes por fase

### IMOB-PILOT-6E - Local Static Check Implementation

Condicoes minimas:

- Implementar check estatico local somente em PR proprio.
- Sem package script.
- Sem CI.
- Sem leitura de rede.
- Sem provider.
- Sem DB, ledger ou audit.
- Sem dry-run, shadow, pilot ou small rollout.
- Sem Evidence Index automatico.
- Saida local deve ser `NO_GO` ou `GO_FOR_NEXT_REVIEW_ONLY`.
- Qualquer ambiguidade deve falhar fechado.

### IMOB-PILOT-6F - Unit Tests For Static Check

Condicoes minimas:

- Adicionar testes unitarios em PR proprio.
- Testes devem usar fixtures sinteticas e documentos locais.
- Testes nao podem executar harness operacional.
- Testes nao podem depender de rede, provider, DB, ledger, audit ou secrets.
- Testes devem cobrir referencias, metricas, reasonCodes, No-Go, boundaries, linguagem produtiva proibida e drift spec/skeleton.
- Ainda sem CI obrigatorio, salvo autorizacao explicita separada.

### IMOB-PILOT-6G - Package Script / CI Gate Evaluation

Condicoes minimas:

- So iniciar se 6E e 6F estiverem verdes localmente e revisadas.
- Avaliar se o check deve virar package script.
- Avaliar se o check deve entrar em CI.
- Qualquer alteracao de `package.json` ou `.github/workflows/ci.yml` exige PR separado e justificativa.
- CI gate futuro nao deve executar dry-run, shadow, provider, DB, ledger, audit, receipt, bundle ou proof.
- Evidence Index so pode mudar se houver evidencia real de execucao e arquivo fisico que prove o resultado.

### IMOB-PILOT-7A - Frontend Fixture Preview Decision Gate

Condicoes minimas:

- So iniciar apos static check estavel.
- Deve ser decisao documental antes de qualquer preview.
- Nao pode alterar frontend por implicacao.
- Nao pode alterar `ChatAgentLauncher`.
- Deve preservar frontend como render-only.
- Deve exigir prova de que preview, se futura, nao decide policy, risk, HITL, entitlement, proof ou reasonCode.

## Estrategia de validacao futura

A implementacao futura do static check deve validar somente referencias locais e declaracoes documentais/contratuais:

| Area | Validacao futura | Resultado esperado |
| --- | --- | --- |
| Referencias | Caminhos obrigatorios existem, sao locais e permanecem no escopo aprovado. | Falha fechado em referencia ausente/quebrada. |
| Metricas | Todas as metricas obrigatorias estao declaradas com expectativa correta. | Falha fechado em metrica ausente ou side-effect diferente de zero. |
| ReasonCodes | ReasonCodes herdados, especificos e de decisao existem. | Falha fechado em reasonCode ausente ou usado para autorizar execucao. |
| No-Go criteria | Criterios de bloqueio permanecem declarados e conservadores. | Falha fechado em No-Go ausente, ambiguidade ou contradicao. |
| Boundaries | Provider, DB, ledger, audit, receipt, bundle, proof, frontend preview e launcher logic permanecem fora de escopo. | Falha fechado em qualquer violacao. |
| Linguagem produtiva proibida | Documentos nao declaram producao, operacao fechada, Receipt Canon fechado, shadow/dry-run executado, pilot ou small iniciado. | Falha fechado em linguagem produtiva nao negada. |
| Drift spec/skeleton | IMOB-PILOT-4, 5, 6A, 6B e 6C continuam alinhadas em metricas, reasonCodes, saidas e boundaries. | Falha fechado em drift. |

## Boundaries

IMOB-PILOT-6D preserva e exige que fases futuras preservem:

- Sem provider.
- Sem provider payload real.
- Sem secret produtivo.
- Sem webhook produtivo.
- Sem DB e sem DB write.
- Sem ledger/audit e sem ledger/audit write.
- Sem receipt generation.
- Sem bundle generation/export.
- Sem proof generation ou fabrication.
- Sem dry-run real.
- Sem shadow real.
- Sem pilot.
- Sem small rollout.
- Sem frontend preview.
- Sem alteracao de frontend.
- Sem regra de negocio no `ChatAgentLauncher`.
- Sem decisao de policy, risco, HITL, entitlement ou proof no frontend.
- Sem runtime change nesta fase.
- Sem engine change nesta fase.
- Sem API nesta fase.
- Sem mutacao.
- Sem acao critica.
- Sem autorizacao produtiva.
- Sem Evidence Index sem evidencia real.

## Criterios fail-closed

Qualquer fase futura deve retornar `NO_GO` quando ocorrer:

- Referencia quebrada, ausente, ilegivel ou fora do escopo local.
- Metrica obrigatoria ausente.
- ReasonCode obrigatorio ausente.
- No-Go ausente, incompleto, contraditorio ou ambiguo.
- Boundary obrigatorio ausente.
- Linguagem que autorize producao, shadow, dry-run, pilot ou small rollout.
- Drift entre spec e skeleton, ou entre 6A/6B/6C e a implementacao futura.
- Frontend preview no escopo antes de gate explicito.
- Provider, DB, ledger ou audit no escopo.
- Provider call, DB write, ledger write ou audit write no escopo.
- Receipt, bundle ou proof generation no escopo.
- Regra de negocio, policy, risk, HITL, entitlement ou proof decision no `ChatAgentLauncher`.
- Package script ou CI introduzidos antes da fase 6G.
- Evidence Index atualizado sem evidencia real, fisica, verificavel e indexavel.

## Criterios de nao avanco

Nao avancar para fase futura quando houver:

- CI vermelho ou workflows pos-merge nao comprovados.
- Check nao deterministico.
- Dependencia de rede.
- Dependencia de provider.
- Leitura de secrets.
- Dependencia de DB, ledger ou audit para validar contrato estatico.
- Alteracao de runtime, engine, API ou frontend fora de escopo.
- Evidence Index planejado sem evidencia real.
- Preview frontend prematuro.
- Drift entre documentacao, fixture, template, contratos e futura implementacao.
- Falha em `pnpm check:evidence-index`, `pnpm check:docs-link-integrity` ou `pnpm check:orphan-tests`.

## Modelo de implementacao futura

Uma implementacao futura em IMOB-PILOT-6E deve ser pequena, local e deterministica:

```text
future 6E implementation shape, not executed by 6D:

script reads approved local references
script validates required metrics declarations
script validates required reasonCodes declarations
script validates No-Go criteria declarations
script validates boundary declarations
script scans for prohibited productive language
script compares spec/skeleton/design/pseudocode continuity
script emits local static result
script exits non-zero on NO_GO

script must not:
  call network
  call provider
  read secrets
  read DB
  write DB
  write ledger
  write audit
  generate receipt
  generate bundle
  generate proof
  create frontend preview
  update Evidence Index
```

Este bloco e plano textual. IMOB-PILOT-6D nao cria script.

## Proxima fase proposta

Proxima fase recomendada, ainda nao iniciada por IMOB-PILOT-6D:

- `IMOB-PILOT-6E - Local Static Check Implementation`, sem package script e sem CI; ou
- manter `IMOB-PILOT-6E` como `Implementation Readiness Review`, caso se prefira mais uma etapa documental antes de qualquer script.

Qualquer escolha exige tarefa futura explicita.

## Decisao de nao implementacao

Nesta fase:

- Nao cria `scripts/checkImobStaticHarnessContract.ts`.
- Nao cria `scripts/tests/checkImobStaticHarnessContract.test.ts`.
- Nao registra package script.
- Nao altera CI.
- Nao executa dry-run real.
- Nao inicia shadow real.
- Nao ativa pilot ou small rollout.
- Nao cria preview frontend.
- Nao cria API.
- Nao chama provider.
- Nao escreve DB.
- Nao escreve ledger/audit.
- Nao gera receipt/bundle/proof.
- Nao altera frontend.
- Nao altera `ChatAgentLauncher`.
- Nao altera runtime.
- Nao altera engine.
- Nao altera schema Prisma.
- Nao altera seeds/migrations.
- Nao usa secrets produtivos.
- Nao cria webhook produtivo.
- Nao altera `docs/EVIDENCE_INDEX.md`.

## Checks requeridos para esta entrega

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

IMOB-PILOT-6D permanece plano documental de implementacao futura. Nao ha autorizacao de execucao, producao, provider, mutacao, preview frontend, shadow, dry-run, pilot, small rollout, Receipt Canon fechado ou fechamento operacional IMOB.
