# Orphan Test Detection Gate — N-12 (P1)

## Contexto

Esta sessão encontrou a mesma classe de problema 3 vezes de forma independente: um arquivo de teste real, cobrindo um caminho de código sensível, existe no repositório mas não está referenciado em nenhum script de `package.json` nem em nenhum step de workflow de CI — `billing.webhook-signature.test.ts` (F-06), `imob.command-center.smoke.test.ts` (N-10, antes da correção desta sessão) e `imob.chat.resolve-turn.contract.test.ts` (N-11, antes da correção desta sessão). N-12 formaliza a detecção estrutural desse padrão como gate.

## Implementação

`scripts/checkOrphanTests.ts`, no mesmo estilo/formato de saída (`ok:true|false`, JSON) dos checks existentes (`checkRedisFailClosed.ts` como referência):

1. **Inventário**: percorre todo o repositório coletando `*.test.ts`/`*.test.tsx`, excluindo `node_modules`, `dist`, `generated`, `.git`, `coverage`, `.turbo`.
2. **Alcançabilidade por glob de shell**: extrai, via regex, qualquer padrão `find <dir> -name '*.test.ts'` presente em `.github/workflows/*.yml` — qualquer teste sob esse `<dir>` conta como coberto. Hoje detecta 2 roots reais: `packages/core/src` (`ci.yml:71`) e `packages/db/src` (`lint.yml:47`).
3. **Alcançabilidade por referência direta**: extrai qualquer substring terminada em `.test.ts`/`.test.tsx` de (a) todos os valores de `scripts` em `package.json` e (b) o texto bruto de todos os arquivos de workflow. Cobre tanto scripts com lista de arquivos espaço-separada quanto uma referência solta.
4. **Allowlist obrigatória com justificativa**: `scripts/orphan-tests-allowlist.txt`, formato `<caminho> # <justificativa>`. O check falha fechado (`orphan_tests_allowlist_stale`) se alguma entrada da allowlist não corresponder a um órfão real atual — evita allowlist "podre" (apontando para arquivo que já foi corrigido ou nunca existiu).
5. **Saída**: JSON com `totalTestFiles`, `globCoveredRoots`, `orphanCount`, `blockingOrphanCount`, `blockingOrphans` (lista completa), `allowlistedOrphans`, `staleAllowlistEntries`.

### Validação do scanner (evitar falso positivo/negativo antes de confiar no resultado)

- **Falsos negativos verificados corretos** (arquivos que DEVEM aparecer como cobertos): `apps/api/src/tests/MissionStepsContract.test.ts` (referência direta em `test:imob-orchestrator-patch0`), `apps/api/src/tests/imob-turn-resolver.test.ts` (referência direta em `test:imob-lead-continuity`), `packages/core/src/queue/workerTopology.test.ts` (referência direta em `test:worker-topology`, e também coberto pelo glob de `packages/core/src`) — todos os 3 confirmados **cobertos**, não órfãos.
- **Busca negativa**: confirmei, via grep independente do padrão `node --test <diretório>` (sem terminar em `.test.ts`), que **não existe** nenhum outro mecanismo de descoberta de testes por diretório neste repositório além dos 2 `find` já capturados — logo o scanner não subestima cobertura por esse motivo.
- **Confirmação manual independente** (fora do scanner): `grep` direto por `imob-crm-mutation-service.test.ts`, `governance.e2e.test.ts` e `actions.e2e.test.ts` em `package.json`/workflows confirma "nenhuma referência" — os órfãos reportados pelo scanner são reais, não bug de parsing.

## Inventário inicial (2026-07-06, antes de qualquer PR-CI-01 de triagem)

```
totalTestFiles: 288
globCoveredRoots: ["packages/core/src", "packages/db/src"]
blockingOrphanCount: 210
```

**F-06 confirmado presente**: `apps/api/src/tests/billing.webhook-signature.test.ts` aparece na lista de órfãos, exatamente como esperado — **não foi adicionado à allowlist**, permanece listado como pendência do PR-CI-01 (triagem dedicada desse volume), conforme instruído.

Lista completa dos 210 órfãos (arquivo:caminho relativo ao repo):

```
apps/api/src/actions/tests/actions.e2e.test.ts
apps/api/src/tests/agent-chat-runtime-readiness.test.ts
apps/api/src/tests/agents.interop.contract.test.ts
apps/api/src/tests/billing.economy.contract.test.ts
apps/api/src/tests/billing.reconciliation.contract.test.ts
apps/api/src/tests/billing.reputation.disputes.contract.test.ts
apps/api/src/tests/billing.vertical-entitlement.contract.test.ts
apps/api/src/tests/billing.webhook-signature.test.ts
apps/api/src/tests/capability-execution.test.ts
apps/api/src/tests/conversation-persistence-policy.test.ts
apps/api/src/tests/eiah-help-imob-onboarding-docs.test.ts
apps/api/src/tests/governance.e2e.test.ts
apps/api/src/tests/guardian-plan-manager.test.ts
apps/api/src/tests/imob-agent-contract.test.ts
apps/api/src/tests/imob-approval-gate.test.ts
apps/api/src/tests/imob-artifact-capabilities.test.ts
apps/api/src/tests/imob-assisted-integrations.test.ts
apps/api/src/tests/imob-async-job-runtime.test.ts
apps/api/src/tests/imob-capability-gate.test.ts
apps/api/src/tests/imob-capability-registry.test.ts
apps/api/src/tests/imob-continuity-coherence-baseline-real.test.ts
apps/api/src/tests/imob-continuity-coherence-metrics.test.ts
apps/api/src/tests/imob-continuity-coherence-read-model.test.ts
apps/api/src/tests/imob-continuity-coherence.contract.test.ts
apps/api/src/tests/imob-conversation-state.test.ts
apps/api/src/tests/imob-copilot-conversation.test.ts
apps/api/src/tests/imob-crm-action-dispatcher.test.ts
apps/api/src/tests/imob-crm-case-context.test.ts
apps/api/src/tests/imob-crm-continuity-regression-phase1.test.ts
apps/api/src/tests/imob-crm-document-service.test.ts
apps/api/src/tests/imob-crm-golden-path.test.ts
apps/api/src/tests/imob-crm-kpi-service.test.ts
apps/api/src/tests/imob-crm-legacy-fallback-policy.test.ts
apps/api/src/tests/imob-crm-mutation-service.test.ts
apps/api/src/tests/imob-crm-operational-property-link-owner.test.ts
apps/api/src/tests/imob-crm-resolver.test.ts
apps/api/src/tests/imob-crm-router.contract.test.ts
apps/api/src/tests/imob-crm-turn-registration.test.ts
apps/api/src/tests/imob-crm-workflow-machine.test.ts
apps/api/src/tests/imob-crm-workspace-scope.test.ts
apps/api/src/tests/imob-cross-surface-regression.test.ts
apps/api/src/tests/imob-dedupe-context.e2e.test.ts
apps/api/src/tests/imob-document-checklist.e2e.test.ts
apps/api/src/tests/imob-document-handoff.e2e.test.ts
apps/api/src/tests/imob-enrichment-capture-runtime.test.ts
apps/api/src/tests/imob-first-pilot-runtime.test.ts
apps/api/src/tests/imob-geo-canonicalizer.test.ts
apps/api/src/tests/imob-governance-evidence.contract.test.ts
apps/api/src/tests/imob-governed-intent.test.ts
apps/api/src/tests/imob-human-questions.e2e.test.ts
apps/api/src/tests/imob-intake-observability.test.ts
apps/api/src/tests/imob-intent-catalog.test.ts
apps/api/src/tests/imob-internal-agents.test.ts
apps/api/src/tests/imob-inventory-provider.test.ts
apps/api/src/tests/imob-knowledge-base-loader.test.ts
apps/api/src/tests/imob-knowledge-engine-integration.test.ts
apps/api/src/tests/imob-lead-disqualification.e2e.test.ts
apps/api/src/tests/imob-lead-matching.e2e.test.ts
apps/api/src/tests/imob-lead-reengagement.e2e.test.ts
apps/api/src/tests/imob-lead-to-proposal.e2e.test.ts
apps/api/src/tests/imob-lead-to-visit.e2e.test.ts
apps/api/src/tests/imob-market-guardian-evidence.test.ts
apps/api/src/tests/imob-market-scan-confirmation-actions.test.ts
apps/api/src/tests/imob-market-scan-contracts.test.ts
apps/api/src/tests/imob-market-scan-handoff.e2e.test.ts
apps/api/src/tests/imob-market-scan-intelligence.test.ts
apps/api/src/tests/imob-market-scan-llm-judge.test.ts
apps/api/src/tests/imob-market-scan-no-internal-id-leak.test.ts
apps/api/src/tests/imob-market-scan-pipeline.test.ts
apps/api/src/tests/imob-market-scan-policy-judge-final-response.test.ts
apps/api/src/tests/imob-market-scan-provider.test.ts
apps/api/src/tests/imob-market-scan-query-builder.test.ts
apps/api/src/tests/imob-market-scan-response-writer.test.ts
apps/api/src/tests/imob-market-scan-router.test.ts
apps/api/src/tests/imob-market-scan-run.test.ts
apps/api/src/tests/imob-market-scan-snapshot.test.ts
apps/api/src/tests/imob-market-scan-source-quality-gate.test.ts
apps/api/src/tests/imob-market-source-access-policy.test.ts
apps/api/src/tests/imob-mission-inheritance.test.ts
apps/api/src/tests/imob-mission-runtime.test.ts
apps/api/src/tests/imob-onboarding-resolver.test.ts
apps/api/src/tests/imob-owner-blocker-consult.test.ts
apps/api/src/tests/imob-owner-pending-suggestion.test.ts
apps/api/src/tests/imob-owner-property-linking.e2e.test.ts
apps/api/src/tests/imob-pilot-approval-runtime.test.ts
apps/api/src/tests/imob-pilot-control-runtime.test.ts
apps/api/src/tests/imob-pilot-control-surface.test.ts
apps/api/src/tests/imob-pilot-flow-case-memory.test.ts
apps/api/src/tests/imob-pilot-flow-history.test.ts
apps/api/src/tests/imob-pilot-flow-observability.test.ts
apps/api/src/tests/imob-pilot-flow-promotion.test.ts
apps/api/src/tests/imob-pilot-flow-registry.test.ts
apps/api/src/tests/imob-pilot-flow-runtime.test.ts
apps/api/src/tests/imob-pilot-operational-surface.test.ts
apps/api/src/tests/imob-pilot-promotion-runtime.test.ts
apps/api/src/tests/imob-pilot-rollout-state.test.ts
apps/api/src/tests/imob-post-run-mutation-worker.test.ts
apps/api/src/tests/imob-post-visit.e2e.test.ts
apps/api/src/tests/imob-promotion-review-surface.test.ts
apps/api/src/tests/imob-proposal-handoff.e2e.test.ts
apps/api/src/tests/imob-public-web-scan-policy.test.ts
apps/api/src/tests/imob-realestate-action-contracts-11.test.ts
apps/api/src/tests/imob-recipe-planner-integration.test.ts
apps/api/src/tests/imob-responsible-actor-compat.contract.test.ts
apps/api/src/tests/imob-scale-runtime.test.ts
apps/api/src/tests/imob-shadow-runtime.test.ts
apps/api/src/tests/imob-specialist-bridge.test.ts
apps/api/src/tests/imob-specialist-runtime.test.ts
apps/api/src/tests/imob-tenant-recipe-context.test.ts
apps/api/src/tests/imob-validation-engine.test.ts
apps/api/src/tests/imob-vertical-manifest.contract.test.ts
apps/api/src/tests/imob-visit-context.e2e.test.ts
apps/api/src/tests/imob-visit-slot-collection.test.ts
apps/api/src/tests/imob-worker-foundation-phase4-1b.test.ts
apps/api/src/tests/imob.attachment.validation.contract.test.ts
apps/api/src/tests/imob.chat.export.contract.test.ts
apps/api/src/tests/imob.chat.persistence.contract.test.ts
apps/api/src/tests/imob.chat.resolve-turn.contract.test.ts
apps/api/src/tests/imob.command-center.smoke.test.ts
apps/api/src/tests/imob.crm-turn-batch.test.ts
apps/api/src/tests/imob.drive.sync.service.test.ts
apps/api/src/tests/imob.knowledge.search.contract.test.ts
apps/api/src/tests/imob.knowledge.search.service.test.ts
apps/api/src/tests/imob.semantic-intent-resolver.test.ts
apps/api/src/tests/imob.web.sync.service.test.ts
apps/api/src/tests/imobControlSurface.test.ts
apps/api/src/tests/imobControlSurfaceAggregates.test.ts
apps/api/src/tests/imobRunActionCatalog.test.ts
apps/api/src/tests/j360-legal-interpreter.test.ts
apps/api/src/tests/knowledge-policy.behavior.test.ts
apps/api/src/tests/ledger-bundle.contract.test.ts
apps/api/src/tests/legal-responsible-actor-stub.contract.test.ts
apps/api/src/tests/marketplace.installations.activate.test.ts
apps/api/src/tests/pdf-text-extractor.test.ts
apps/api/src/tests/provider-boundary-enforcement.test.ts
apps/api/src/tests/public-product-taxonomy.contract.test.ts
apps/api/src/tests/realestate.commission.settlement.e2e.test.ts
apps/api/src/tests/realestate.high-actions.e2e.test.ts
apps/api/src/tests/require-scope.fail-closed.test.ts
apps/api/src/tests/run-events-redis-transport.test.ts
apps/api/src/tests/run-worker-action-resolution.test.ts
apps/api/src/tests/run-worker-guardian-output.test.ts
apps/api/src/tests/run-worker-j360-output.test.ts
apps/api/src/tests/run-worker-mkt-output.test.ts
apps/api/src/tests/run-worker-output-validation.test.ts
apps/api/src/tests/run-worker-recipe-alignment.test.ts
apps/api/src/tests/run-worker-recipe-orchestration.test.ts
apps/api/src/tests/run-worker.observe.test.ts
apps/api/src/tests/runArchiveService.test.ts
apps/api/src/tests/runs.imob-action.contract.test.ts
apps/api/src/tests/shadow-executions.contract.test.ts
apps/api/src/tests/storage.provider.test.ts
apps/api/src/tests/tenant-recipe-contract.test.ts
apps/api/src/tests/tenant-recipe-workspace-selection.test.ts
apps/api/src/tests/test-infra-env.test.ts
apps/api/src/tests/trust-score-engine.test.ts
apps/api/src/tests/upload-retention-service.test.ts
apps/api/src/tests/uploads.storage-provider.test.ts
apps/api/src/tests/vertical-entitlement-gate.contract.test.ts
apps/api/src/tests/vertical-entity-type-registry.contract.test.ts
apps/api/src/tests/vertical-responsible-actor.contract.test.ts
apps/api/src/tests/workspace.memberships.contract.test.ts
apps/web/src/components/agents/helpDictionaryResolver.test.ts
apps/web/src/features/imob/ImobApprovalContextCard.test.tsx
apps/web/src/features/imob/ImobBottleneckHeatmap.test.tsx
apps/web/src/features/imob/ImobChatWidgets.test.tsx
apps/web/src/features/imob/ImobCommandCenter.test.tsx
apps/web/src/features/imob/ImobDashboardHero.test.tsx
apps/web/src/features/imob/ImobPriorityQueue.test.tsx
apps/web/src/features/imob/ImobRescueIndex.test.tsx
apps/web/src/features/imob/ImobSpecialistLoadBoard.test.tsx
apps/web/src/features/imob/ImobWaitingOnBoard.test.tsx
apps/web/src/features/imob/charts/ImobBrokerChart.test.tsx
apps/web/src/features/imob/charts/ImobCycleTimePanel.test.tsx
apps/web/src/features/imob/charts/ImobFunnelStepsChart.test.tsx
apps/web/src/features/imob/charts/ImobJourneyCostChart.test.tsx
apps/web/src/features/imob/funnel/ImobFunnelTeamSection.test.tsx
apps/web/src/features/imob/imobA1Labels.test.ts
apps/web/src/features/imob/imobA3CostWindow.test.ts
apps/web/src/features/imob/imobChatPhase3DirectedAction.test.ts
apps/web/src/features/imob/imobCommandCenterHelper.test.ts
apps/web/src/features/imob/imobCommandCenterPhase1.test.ts
apps/web/src/features/imob/imobDashboardTabs.test.ts
apps/web/src/features/imob/imobWorkbenchContext.test.ts
apps/web/src/features/imob/imobWorkbenchContextPanel.test.tsx
apps/web/src/features/imob/kpiRefreshState.test.ts
apps/web/src/features/workbench/vertical-chat/ImobSlotCollectionCard.test.tsx
apps/web/src/features/workbench/vertical-chat/LegalContextPanel.test.tsx
apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.test.tsx
apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.test.tsx
apps/web/src/lib/entitlements.test.ts
apps/web/src/lib/roles.test.ts
apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts
apps/web/src/pages/app/imob/chat.formSubmission.test.ts
apps/web/src/pages/app/imob/chat.runBundleCapability.test.ts
apps/web/src/pages/app/imob/chat.slotCollectionHistory.test.ts
apps/web/src/pages/app/imob/chat.userEcho.test.ts
apps/web/src/pages/app/imob/chatProof.test.ts
apps/web/src/pages/app/imob/dashboard.a7contextCase.test.ts
apps/web/src/pages/app/imob/dashboard.threads.test.ts
apps/web/src/pages/app/imob/partners.test.ts
apps/web/src/pages/app/imob/processes.test.tsx
apps/web/src/pages/app/imob/properties.test.ts
apps/web/src/pages/app/runs/index.test.ts
apps/web/src/pages/self-service/recipePrefill.test.ts
apps/web/src/pages/self-service/tenantRecipeComposer.test.ts
apps/workers/action-runner/src/index.test.ts
apps/workers/action-runner/src/services/mcpEnforcement.test.ts
scripts/sloBaselineCollect.test.ts
tests/multitenant/tenant-isolation.test.ts
```

## Achado adicional — os próprios testes novos de GATE-01/GATE-02 estão órfãos

Ao validar o gate contra o estado das branches `pr-imob-gate-01`/`pr-imob-gate-02` (sessões anteriores), confirmei que `apps/api/src/tests/imob-lead-intake-entitlement-gate.contract.test.ts` e `apps/api/src/tests/imob-crm-endpoints-entitlement-gate.contract.test.ts` — testes criados nesta mesma sequência de sessões para provar os gates de entitlement de N-03 — **também aparecem como órfãos**. Eles foram executados manualmente via `node --import tsx --test` diversas vezes ao longo da sessão, mas nunca foram amarrados a um script de `package.json` nem a um step de CI. Isso não é um erro do gate — é exatamente o tipo de lacuna que ele existe para capturar, incluindo contra o próprio trabalho recente. Registrado aqui para transparência; correção fica para o PR-CI-01 de triagem (mesmo tratamento dos demais 208 órfãos "normais").

## Validação do gate nas Fases A e B desta sessão (antes/depois)

Rodei o mesmo scanner (cópia idêntica do script, sem alterar seu conteúdo) contra o estado de cada branch, sem misturar commits:

| Teste | Antes (main) | Depois (branch da correção) |
|---|---|---|
| `imob.command-center.smoke.test.ts` (N-10) | órfão | **coberto** (`pr-imob-fix-n10`, 209 órfãos restantes, -1) |
| `imob.chat.resolve-turn.contract.test.ts` (N-11) | órfão | **coberto** (`pr-core-n11`, 211 órfãos totais nessa branch — número maior porque essa branch também herda os 2 testes novos do GATE-01/02, que somam ao inventário total e permanecem órfãos por si) |

## Decisão: bloqueante vs warn-only

**Warn-only** (`continue-on-error: true` no step `Check for orphan test files` em `ci.yml`), pelo motivo explícito já antecipado nas instruções: a lista inicial **não está vazia** após as Fases A/B (permanecem 210 órfãos nesta branch, incluindo F-06 e, adicionalmente, os 2 testes novos de GATE-01/02 recém-descobertos). Bloquear CI agora pararia todo PR do repositório até uma triagem de 210 arquivos, o que é desproporcional para esta frente.

**Plano de promoção registrado**: o gate permanece warn-only até um PR-CI-01 dedicado triar o volume — para cada órfão, decidir entre (a) amarrar a um script/CI real, (b) adicionar à allowlist com justificativa explícita (ex.: teste manual, requer infra não disponível em CI), ou (c) remover se obsoleto. Promoção para bloqueante deve ocorrer quando `blockingOrphanCount` chegar a um número acordado como aceitável (idealmente 0, ou um resíduo totalmente coberto pela allowlist).

## Status

- Implementação do gate: **evidenciado** (script real, testado, validado contra 3 casos conhecidos-cobertos + 3 confirmações manuais independentes + verificação negativa de padrões não capturados).
- Detecção de F-06 como órfão: **evidenciado** (presente na lista real gerada por execução).
- Validação antes/depois nas Fases A/B: **evidenciado** (rodado contra o estado real de cada branch, sem misturar commits).
- Triagem completa dos 210 órfãos (PR-CI-01): **proposta** — não iniciada nesta sessão, deliberadamente fora de escopo.
- Promoção a gate bloqueante: **proposta** — condicionada ao PR-CI-01.
