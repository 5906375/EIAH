# F0.10 — Node runtime consistency audit

## Data
2026-07-09

## Objetivo
Auditar a consistência de runtime Node no CI após F0.9, classificando Node 20 vs Node 22 como drift, compatibilidade intencional ou migração parcial, sem alterar CI/runtime neste PR.

## Escopo
Este PR é audit-only/documental/evidencial. Não altera CI, `package.json`, lockfile, scripts, runtime, IMOB/front door, `ChatAgentLauncher`, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Inventário Node no CI

| Job key | Name | Node version | Comando principal | Bloqueante? | Classificação |
| --- | --- | --- | --- | --- | --- |
| `build_validate` | n/a | `20` via `env.NODE_VERSION` | lint, testes core, checks P0/P1 base, build web | sim | residual Node 20 |
| `self_service_dedup_guards` | `SelfServiceDedupGuards` | `22` | `check:self-service-runtime-graph`, `check:frontend-duplication` | sim | dominante Node 22 |
| `evidence_index` | `EvidenceIndex` | `22` | `check:public-product-taxonomy`, `check:docs-link-integrity`, `check:evidence-index` | sim | dominante Node 22 |
| `help_playbook_drift` | `HelpPlaybookDrift` | `22` | `check:help-playbook-drift` | sim | dominante Node 22 |
| `chat_agent_onboarding` | `ChatAgentOnboarding` | `22` | `check:chat-agent-onboarding` | sim | dominante Node 22 |
| `provider_boundary` | `ProviderBoundary` | `22` | `check:provider-boundary` | sim | dominante Node 22 |
| `chat_engine_regression` | `ChatEngineRegression` | `22` | `check:chat-launcher-render-only`, `check:chat-runtime-entrypoint-debt`, `check:presentation-snapshot-contract`, `test:chat-engine` | sim | dominante Node 22 |
| `imob_frontdoor_regression` | `ImobFrontdoorRegression` | `22` | `check:imob-frontdoor-regression` | sim | dominante Node 22 |
| `orphan_tests_regression` | `OrphanTestsRegression` | `22` | `check:orphan-tests` | sim | dominante Node 22 |
| `public_health_contract` | `PublicHealthContract` | `22` | `test:api-health-contract` | sim | dominante Node 22 |
| `agents_policy_fail_closed` | `AgentsPolicyFailClosed` | `22` | `test:agents-policy-fail-closed` | sim | dominante Node 22 |
| `rbac_guardrail_regression` | `RbacGuardrailRegression` | `22` | `check:rbac-fail-closed`, `check:guardrail-ledger-noop` | sim | dominante Node 22 |
| `imob_lead_continuity_scoped` | `ImobLeadContinuityScoped` | `22` | `test:imob-lead-continuity`, `test:web-chat-launcher`, `check:evidence-index` | sim | dominante Node 22 |
| `ci_unit_suite` | `CiUnitSuite` | `22` | `test:ci-unit-suite` | sim | dominante Node 22 |
| `receipt_canon_compat` | `ReceiptCanonCompat` | `22` | `check:receipt-canon-compat` | sim | dominante Node 22 |
| `agent_protocol_compat` | `AgentProtocolCompat` | `22` | `check:agent-protocol-compat`, `check:agent-protocol-compat-matrix` | sim | dominante Node 22 |
| `p2_audit_interop` | `P2AuditInterop` | `22` | `generate:p2-interop-evidence`, `check:p2-audit-interop` | sim | dominante Node 22 |
| `p2_high_global_coverage` | `P2HighGlobalCoverage` | `22` | `check:p2-high-global-coverage`, `check:p2-evidence-recency` | sim | dominante Node 22 |
| `p1_critical_chain` | `P1CriticalChain` | `22` | `check:p1-critical-chain` | sim | dominante Node 22 |
| `p1_reconciliation_recurring` | `P1ReconciliationRecurring` | `22` | `check:p1-reconciliation-recurring` | sim | dominante Node 22 |
| `p0_criticality_audit` | `P0CriticalityAudit` | `22` | `audit:criticality` | sim | dominante Node 22 |
| `p3_economy_hardening` | `P3EconomyHardening` | `22` | `generate:p3-economy-evidence`, `check:p3-evidence-recency`, `check:p3-economy-hardening` | sim | dominante Node 22 |
| `p3_settlement_support_by_env` | `P3SettlementSupportByEnv` | `22` | `generate:p3-economy-evidence`, `check:p3-evidence-recency`, `check:p3-settlement-support-by-env` | sim | dominante Node 22 |
| `settlement_contract_drift` | `SettlementContractDrift` | `22` | `check:settlement-contract-drift` | sim | dominante Node 22 |
| `w4_non_regression` | `W4NonRegression` | `22` | `check:w4-non-regression` | sim | dominante Node 22 |

Resumo do `CI Monorepo`:
- Jobs com Node 20: 1
- Jobs com Node 22: 24
- Jobs sem `node-version` explícito: 0

Contexto adicional fora do `CI Monorepo`, útil para classificação:
- `.github/workflows/lint.yml`: `NODE_VERSION='20'`
- `.github/workflows/release.yml`: `NODE_VERSION='20'`
- `.github/workflows/critical-dod.yml`: `node-version: 20`
- `.github/workflows/e2e-high-staging.yml`: `node-version: 22`
- `.github/workflows/ape-weekly.yml`: `node-version: 22`

## Baseline declarativo

| Fonte | Valor encontrado | Observação |
| --- | --- | --- |
| `package.json` engines | ausente | Não há campo `engines.node` declarando baseline canônica |
| `.nvmrc` | ausente | Arquivo não existe |
| `.node-version` | ausente | Arquivo não existe |
| `README`/docs relevantes | evidência indireta de backlog Node 20 | `docs/ops/APE_EVIDENCE_RENEWAL_PREREQUISITES.md` classifica warning de Node.js 20 como backlog não bloqueante até migração da action/runtime correspondente |
| `pnpm-workspace.yaml` | sem baseline Node | Só define workspaces e `onlyBuiltDependencies` |
| `.github/workflows/ci.yml` padrão dominante | Node 22 | 24 de 25 jobs do `CI Monorepo` usam Node 22; `build_validate` permanece em Node 20 via env |

## Classificação da divergência

Classificação: `migração parcial`

Justificativa:
- O `CI Monorepo` já converge fortemente para Node 22, com apenas `build_validate` ainda em Node 20.
- Outros workflows do repositório também permanecem em Node 20 (`lint`, `release`, `critical-dod`), o que mostra que a diferença não é ruído isolado de um único job.
- Não há baseline declarativa explícita em `engines`, `.nvmrc` ou `.node-version` que justifique formalmente a coexistência.
- Existe evidência documental de que Node 20 é tratado como backlog de migração, não como escolha estável formalizada.

Conclusão conservadora:
- Não há prova suficiente de `compatibilidade intencional` como política declarada.
- Também não é apenas `baseline ausente`, porque há um padrão observável de adoção de Node 22 em progresso.
- O melhor enquadramento é `migração parcial` com lacuna documental de baseline.

## Impacto nos gates

| Gate/check | Job | Node usado | Impacto potencial | Recomendação |
| --- | --- | --- | --- | --- |
| `build_validate` | `build_validate` | 20 | Pode divergir de APIs/flags/comportamento usados nos jobs em Node 22; cobre lint, testes core, checks base e build web sob runtime diferente do padrão dominante | Tratar como principal candidato de alinhamento em PR dedicado |
| `check:imob-frontdoor-regression` | `ImobFrontdoorRegression` | 22 | Hoje roda no runtime dominante do `CI Monorepo`; risco principal é diferir do job-base que ainda compila/builda em Node 20 | Validar se build/base também devem convergir para 22 antes de declarar baseline única |
| `check:orphan-tests` | `OrphanTestsRegression` | 22 | Gate documental/estrutural simples; baixo risco funcional, mas participa da matriz P0 em runtime diferente de `build_validate` | Manter no inventário da migração e revalidar após eventual padronização |
| `check:evidence-index` | `EvidenceIndex` e `ImobLeadContinuityScoped` / gate IMOB composto | 22 | Mesmo check P0 roda sob Node 22, enquanto parte do CI central ainda opera em Node 20 | Preservar como referência do runtime dominante e registrar baseline explícita |
| `check:docs-link-integrity` | `EvidenceIndex` e gate IMOB composto | 22 | Baixo risco técnico, mas reforça inconsistência entre jobs P0 | Sem correção neste PR; revalidar no PR de padronização |
| `check:chat-launcher-render-only` | `ChatEngineRegression` e gate IMOB composto | 22 | Protege surface crítica do chat em runtime diferente do job-base | Manter em Node 22 e testar convergência do job-base separadamente |
| `check:rbac-fail-closed` | `build_validate`, `RbacGuardrailRegression` | 20 e 22 | O mesmo gate P1 já roda em dois runtimes diferentes dentro do mesmo workflow, ampliando risco de diferença de comportamento | Priorizar comparação/convergência em PR dedicado |
| `check:guardrail-ledger-noop` | `build_validate`, `RbacGuardrailRegression` | 20 e 22 | Mesma classe de risco do item acima | Tratar junto da padronização de runtime |
| `check:p1-critical-chain` | `P1CriticalChain` | 22 | Roda só em 22; sem divergência interna própria, mas fora do runtime usado no job-base | Manter e usar como parte da base de comparação |
| `test:ci-unit-suite` | `CiUnitSuite` | 22 | Suite unitária principal já está em 22; diferença para `build_validate` pode mascarar incompatibilidades de ambiente | Alinhar baseline antes de ampliar claims de consistência global |

## Riscos
- Resultado diferente entre Node 20 e Node 22 em jobs bloqueantes distintos.
- Diferença de APIs/runtime e flags suportadas, inclusive recursos mais recentes de Node 22 já assumidos por parte do repo.
- Warnings experimentais e comportamento de `--experimental-strip-types`/`tsx` podem variar por versão.
- Drift entre runtime local de times que usam Node 22 e jobs legados que ainda usam Node 20.
- Inconsistência entre jobs bloqueantes P0/P1 dentro do mesmo workflow.
- Falta de baseline declarativa dificulta saber se divergência é tolerada ou apenas residual.

## Recomendação técnica

Próximo PR sugerido: `F0.11 — baseline declarativo + padronização progressiva de Node no CI`

Sequência segura recomendada:
1. Declarar baseline explícita de Node em artefato versionado apropriado (`package.json` engines e/ou `.nvmrc`/`.node-version`), sem alterar múltiplos workflows no mesmo passo se isso aumentar risco.
2. Comparar `build_validate` em Node 20 vs Node 22 em branch dedicada.
3. Se não houver regressão, padronizar `build_validate` para Node 22.
4. Em seguida, revisar workflows residuais fora do `CI Monorepo` (`lint`, `release`, `critical-dod`) para convergência ou justificativa explícita.

Impacto:
- Reduz ambiguidade operacional no CI.
- Diminui risco de falso verde/falso vermelho por versão de runtime.
- Fecha a lacuna documental de baseline.

Checks que precisam passar no PR dedicado:
- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `pnpm check:orphan-tests`
- validação do workflow alterado
- gates P0/P1 já existentes afetados pelo runtime (`build_validate`, `RbacGuardrailRegression`, `EvidenceIndex`, `ImobFrontdoorRegression`, `CiUnitSuite`)

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=409` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração F0.10 |
| `git diff -- package.json` | vazio | sem alteração |
| `git diff -- pnpm-lock.yaml` | vazio | sem alteração |
| `git diff -- scripts/checkOrphanTests.ts` | vazio | sem alteração |
| `git diff -- scripts/orphan-tests-allowlist.txt` | vazio | sem alteração |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | sem alteração |
| `git diff --check` | pass | sem saída |

## Lacunas remanescentes

### P0
- Baseline declarativa de Node ausente em `engines`, `.nvmrc` e `.node-version`.
- `build_validate` segue fora do padrão dominante do `CI Monorepo`.

### P1
- Gates P1 relevantes (`check:rbac-fail-closed`, `check:guardrail-ledger-noop`) já rodam em dois runtimes distintos no mesmo workflow, o que amplia risco de inconsistência operacional.

### P2
- Contract/e2e/interoperabilidade podem ser afetados indiretamente por divergência de runtime enquanto parte do CI permanece em Node 20 e outra em Node 22.

### P3
- Fora do escopo desta frente, salvo o registro de que P3 já roda em Node 22 no `CI Monorepo`.

### P4
- Fora do escopo IMOB/front door, salvo o fato de que `ImobFrontdoorRegression` já está em Node 22 e depende de alinhamento do baseline global para evitar drift de ambiente.

## Status
Status: parcial/evidenciado
