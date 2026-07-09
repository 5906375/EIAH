# F0.7 — Orphan tests debt classification

## Data
2026-07-09

## Objetivo
Investigar e classificar a dívida preexistente de `check:orphan-tests`, separando dívida real, falso positivo e itens tolerados por baseline.

## Escopo
Este PR trata apenas integridade de testes/CI. Não altera front door IMOB, ChatAgentLauncher, runtime, backend funcional, policy, Prisma, WhatsApp, mobile ou economy runtime.

## Estado inicial
- Comando executado: `pnpm check:orphan-tests`
- Resultado inicial: `ok=false`, `orphanCount=50`, `allowlistedOrphanCount=0`, `blockingOrphanCount=50`
- Resumo: o detector já suportava allowlist versionada em `scripts/orphan-tests-allowlist.txt`, mas a allowlist estava vazia; portanto toda a dívida histórica seguia aparecendo como bloqueante.
- Preexistência confirmada: F0.1, F0.2, F0.3, F0.4, F0.5 e F0.6 já registravam `check:orphan-tests` como falha residual fora do gate dedicado do front door IMOB.

## Inventário dos órfãos
| Path | Categoria | Owner/área provável | Classificação | Critério de saída |
| --- | --- | --- | --- | --- |
| `apps/api/src/actions/tests/actions.e2e.test.ts` | teste sem referência no CI/package | api/actions | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/agents.interop.contract.test.ts` | teste sem referência no CI/package | governance | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/api-global-error-handling.test.ts` | teste sem referência no CI/package | api/core | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/billing.economy.contract.test.ts` | teste sem referência no CI/package | economy | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/billing.reconciliation.contract.test.ts` | teste sem referência no CI/package | economy | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/billing.reputation.disputes.contract.test.ts` | teste sem referência no CI/package | economy | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/billing.webhook-signature.test.ts` | teste sem referência no CI/package | economy | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/capability-execution.test.ts` | teste sem referência no CI/package | api/core | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/governance.e2e.test.ts` | teste sem referência no CI/package | governance | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-artifact-capabilities.test.ts` | teste sem referência no CI/package | imob/api | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-assisted-integrations.test.ts` | teste sem referência no CI/package | imob/api | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-continuity-coherence.contract.test.ts` | teste sem referência no CI/package | imob/api | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-copilot-conversation.test.ts` | teste sem referência no CI/package | imob/api | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-crm-document-service.test.ts` | teste sem referência no CI/package | imob/crm | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-crm-kpi-service.test.ts` | teste sem referência no CI/package | imob/crm | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-crm-resolver.test.ts` | teste sem referência no CI/package | imob/crm | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-crm-router.contract.test.ts` | teste sem referência no CI/package | imob/crm | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-crm-workflow-machine.test.ts` | teste sem referência no CI/package | imob/crm | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-crm-workspace-scope.test.ts` | teste sem referência no CI/package | imob/crm | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-cross-surface-regression.test.ts` | teste sem referência no CI/package | imob/api | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-governance-evidence.contract.test.ts` | teste sem referência no CI/package | imob/governance | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-intake-observability.test.ts` | teste sem referência no CI/package | imob/api | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-knowledge-base-loader.test.ts` | teste sem referência no CI/package | imob/knowledge | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-knowledge-engine-integration.test.ts` | teste sem referência no CI/package | imob/knowledge | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-lead-matching.e2e.test.ts` | teste sem referência no CI/package | imob/e2e | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-owner-blocker-consult.test.ts` | teste sem referência no CI/package | imob/api | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-post-run-mutation-worker.test.ts` | teste sem referência no CI/package | imob/worker | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-realestate-action-contracts-11.test.ts` | teste sem referência no CI/package | imob/contracts | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob-worker-foundation-phase4-1b.test.ts` | teste sem referência no CI/package | imob/worker | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob.attachment.validation.contract.test.ts` | teste sem referência no CI/package | imob/contracts | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob.chat.export.contract.test.ts` | teste sem referência no CI/package | imob/chat | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob.chat.persistence.contract.test.ts` | teste sem referência no CI/package | imob/chat | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts` | teste sem referência no CI/package | imob/chat | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob.command-center.smoke.test.ts` | teste sem referência no CI/package | imob/command-center | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/imob.knowledge.search.contract.test.ts` | teste sem referência no CI/package | imob/knowledge | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/ledger-bundle.contract.test.ts` | teste sem referência no CI/package | ledger | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/marketplace.installations.activate.test.ts` | teste sem referência no CI/package | marketplace | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/provider-boundary-enforcement.test.ts` | teste sem referência no CI/package | governance | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/realestate.commission.settlement.e2e.test.ts` | teste sem referência no CI/package | imob/economy | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/realestate.high-actions.e2e.test.ts` | teste sem referência no CI/package | imob/e2e | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/runArchiveService.test.ts` | teste sem referência no CI/package | api/core | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/runs.imob-action.contract.test.ts` | teste sem referência no CI/package | imob/runs | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/shadow-executions.contract.test.ts` | teste sem referência no CI/package | governance | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/test-infra-env.test.ts` | teste sem referência no CI/package | test-infra | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/uploads.storage-provider.test.ts` | teste sem referência no CI/package | api/storage | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/api/src/tests/workspace.memberships.contract.test.ts` | teste sem referência no CI/package | api/core | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/web/src/features/imob/ImobBottleneckHeatmap.test.tsx` | teste sem referência no CI/package | web/imob | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/web/src/features/imob/ImobWaitingOnBoard.test.tsx` | teste sem referência no CI/package | web/imob | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `apps/workers/action-runner/src/index.test.ts` | teste sem referência no CI/package | worker/action-runner | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |
| `tests/multitenant/tenant-isolation.test.ts` | teste sem referência no CI/package | multitenant | `known-debt` | Amarrar a script/workflow real ou remover se obsoleto |

Resumo por categoria/owner:
- 50 itens classificados como `teste sem referência no CI/package` com saída esperada de amarração futura a script/workflow real ou remoção se obsoletos.
- Owners predominantes: IMOB/api-crm-chat-runs-knowledge-e2e, api/core-governance-storage-actions-marketplace-ledger-test-infra, economy, web/imob, worker/action-runner e multitenant.
- Falso positivo confirmado nesta rodada: nenhum. O mecanismo já existente de allowlist/baseline era suficiente; o problema era ausência de baseline versionada para a dívida remanescente.

## Estratégia adotada
- Abordagem aplicada: baseline versionado criado no mecanismo já existente.
- Arquivo usado: `scripts/orphan-tests-allowlist.txt`
- Motivo: o script `scripts/checkOrphanTests.ts` já suportava allowlist, contava `allowlistedOrphanCount` e falhava fechado para entradas obsoletas (`staleAllowlistEntries`). Portanto não houve necessidade de alterar o script nem criar novo formato.
- Efeito esperado: `pnpm check:orphan-tests` passa quando não surgem novos órfãos além da baseline atual e continua falhando se aparecer:
  - novo órfão fora da baseline;
  - entrada de baseline que já não corresponde a órfão real.

## Política de evolução
- Novos órfãos devem falhar.
- A baseline deve diminuir ao longo do tempo.
- Nenhuma entrada pode ser adicionada sem justificativa inline na allowlist e sem rastreabilidade em evidência/index.
- Falsos positivos, se comprovados, devem virar regra explícita do detector ou correção pontual do scanner; não devem ser escondidos com texto genérico.

## Checks executados
| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | Antes: `blockingOrphanCount=50`; depois: `blockingOrphanCount=0`, `allowlistedOrphanCount=50`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=407` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | Sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | Sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | Sem alteração |
| `git diff --check` | pass | Sem whitespace/conflict issues |

## Lacunas remanescentes

### P0
- A dívida continua existindo: os 50 testes seguem fora de script/workflow real; esta etapa apenas isolou a dívida conhecida para impedir regressões silenciosas.
- Ainda é necessário triar owner por owner quais testes devem entrar em suites reais, quais dependem de infraestrutura dedicada e quais já podem ser removidos.

### P1
- Há cobertura crítica fora do CI efetivo em áreas como governance, economy, IMOB chat/CRM e workers.
- Enquanto a baseline não reduzir, o repositório depende de disciplina operacional para não perpetuar suite paralela esquecida.

### P2
- O inventário pode impactar auditoria/interop porque alguns contract tests relevantes ainda não participam das rotas de execução normais.

### P3
- Fora do escopo desta frente.

### P4
- Fora do escopo IMOB/front door; esta evidência só confirma isolamento da dívida estrutural de testes.

## Status
Status: parcial/evidenciado
