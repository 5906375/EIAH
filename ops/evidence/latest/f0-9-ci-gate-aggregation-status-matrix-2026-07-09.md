# F0.9 — CI gate aggregation report / status matrix

## Data
2026-07-09

## Objetivo
Consolidar o estado dos gates CI e checks de integridade após F0.1–F0.8, mapeando cobertura bloqueante, checks locais/manual-only, lacunas e próximos critérios de maturidade.

## Escopo
Este PR é documental/evidencial. Não altera CI, `package.json`, runtime, IMOB/front door, `ChatAgentLauncher`, scripts de check, allowlist, backend, policy, Prisma, WhatsApp, mobile ou economy.

## Estado consolidado

| Gate/check | Comando | Local | Bloqueante? | Fase/P-level | Evidência | Observação |
| --- | --- | --- | --- | --- | --- | --- |
| `ImobFrontdoorRegression` | `pnpm check:imob-frontdoor-regression` | `.github/workflows/ci.yml` | sim | F0 / P4 | `f0-5-imob-frontdoor-ci-gate-2026-07-09.md` | Job dedicado de regressão do front door IMOB em PR. |
| `check:imob-frontdoor-regression` | `pnpm check:imob-frontdoor-regression` | `package.json` + CI | sim | F0 / P4 | `f0-5-imob-frontdoor-ci-gate-2026-07-09.md` | Agrega teste focado IMOB, `check:chat-launcher-render-only`, `check:evidence-index` e `check:docs-link-integrity`. |
| `OrphanTestsRegression` | `pnpm check:orphan-tests` | `.github/workflows/ci.yml` | sim | F0 / P0 | `f0-8-orphan-tests-ci-gate-2026-07-09.md` | Gate recorrente após F0.7; bloqueia novos órfãos e allowlist stale. |
| `check:orphan-tests` | `pnpm check:orphan-tests` | `package.json` + CI | sim | F0 / P0 | `f0-7-orphan-tests-debt-classification-2026-07-09.md`, `f0-8-orphan-tests-ci-gate-2026-07-09.md` | Estado atual confirmado: `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]`. |
| `check:evidence-index` | `pnpm check:evidence-index` | `package.json` + CI | sim | P0 | `f0-5`, `f0-7`, `f0-8` | Bloqueante no job `EvidenceIndex` e também embutido em `check:imob-frontdoor-regression`. |
| `check:docs-link-integrity` | `pnpm check:docs-link-integrity` | `package.json` + CI | sim | P0 | `f0-5`, `f0-7`, `f0-8` | Bloqueante no job `EvidenceIndex` e também embutido em `check:imob-frontdoor-regression`. |
| `check:chat-launcher-render-only` | `pnpm check:chat-launcher-render-only` | `package.json` + CI indireto | sim | P0 / P4 | `f0-5-imob-frontdoor-ci-gate-2026-07-09.md` | Não tem job próprio, mas roda em `ChatEngineRegression` e dentro do gate composto IMOB. |
| `check:presentation-snapshot-contract` | `pnpm check:presentation-snapshot-contract` | `package.json` + CI | sim | P0 / chat runtime | `docs/architecture/presentation-snapshot-v1.md` | Parte do job `ChatEngineRegression`. |
| `check:chat-runtime-entrypoint-debt` | `pnpm check:chat-runtime-entrypoint-debt` | `package.json` + CI | sim | P0 / chat runtime | `docs/architecture/chat-runtime-entrypoint-debt.md` | Parte do job `ChatEngineRegression`. |
| `check:rbac-fail-closed` | `pnpm check:rbac-fail-closed` | `package.json` + CI | sim | P1 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Roda em `build_validate` e também em `RbacGuardrailRegression`. |
| `check:redis-fail-closed` | `pnpm check:redis-fail-closed` | `package.json` + CI | sim | P1 | `redis-fail-closed-full-coverage-2026-07-02.md` | Gate bloqueante em `build_validate`. |
| `check:guardrail-ledger-noop` | `pnpm check:guardrail-ledger-noop` | `package.json` + CI | sim | P1 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Roda em `build_validate` e em `RbacGuardrailRegression`. |
| `check:provider-boundary` | `pnpm check:provider-boundary` | `package.json` + CI | sim | P1 / governança | `docs/EVIDENCE_INDEX.md` | Job dedicado `ProviderBoundary`. |
| `check:p1-critical-chain` | `pnpm check:p1-critical-chain` | `package.json` + CI | sim | P1 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Job dedicado `P1CriticalChain`. |
| `check:p1-reconciliation-recurring` | `pnpm check:p1-reconciliation-recurring` | `package.json` + CI | sim | P1 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Job dedicado `P1ReconciliationRecurring`. |
| `check:p2-audit-interop` | `pnpm check:p2-audit-interop` | `package.json` + CI | sim | P2 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Job dedicado `P2AuditInterop`, precedido por geração de evidência P2. |
| `check:p2-high-global-coverage` | `pnpm check:p2-high-global-coverage` | `package.json` + CI | sim | P2 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Job dedicado `P2HighGlobalCoverage`. |
| `check:p2-evidence-recency` | `pnpm check:p2-evidence-recency` | `package.json` + CI | sim | P2 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Parte de `P2HighGlobalCoverage`, com `P2_EVIDENCE_MAX_AGE_DAYS=30`. |
| `check:receipt-canon-compat` | `pnpm check:receipt-canon-compat` | `package.json` + CI | sim | P1 / F5.1 | `docs/EVIDENCE_INDEX.md` | Job dedicado `ReceiptCanonCompat`. |
| `check:agent-protocol-compat` | `pnpm check:agent-protocol-compat` | `package.json` + CI | sim | P2 / F5.4 | `docs/EVIDENCE_INDEX.md` | Parte de `AgentProtocolCompat`. |
| `check:agent-protocol-compat-matrix` | `pnpm check:agent-protocol-compat-matrix` | `package.json` + CI | sim | P2 / F5.4 | `docs/EVIDENCE_INDEX.md` | Parte de `AgentProtocolCompat`. |
| `check:p3-economy-hardening` | `pnpm check:p3-economy-hardening` | `package.json` + CI | sim | P3 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Job dedicado `P3EconomyHardening`, precedido por geração/recência de evidência. |
| `check:p3-settlement-support-by-env` | `pnpm check:p3-settlement-support-by-env` | `package.json` + CI | sim | P3 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Job dedicado `P3SettlementSupportByEnv` com `SETTLEMENT_ENV=staging`. |
| `check:settlement-contract-drift` | `pnpm check:settlement-contract-drift` | `package.json` + CI | sim | P3 | `docs/EVIDENCE_INDEX.md` | Job dedicado `SettlementContractDrift`. |
| `check:w4-non-regression` | `pnpm check:w4-non-regression` | `package.json` + CI | sim | P0 / documental | `docs/EVIDENCE_INDEX.md` | Job dedicado `W4NonRegression`. |
| `audit:criticality` | `pnpm audit:criticality` | `package.json` + CI | sim | P0 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` | Job dedicado `P0CriticalityAudit`. |
| `check:public-product-taxonomy` | `pnpm check:public-product-taxonomy` | `package.json` + CI | sim | P0 / taxonomia | `public-product-taxonomy-follow-up-2026-06-25.md` | Parte do job `EvidenceIndex`. |
| `check:tracked-ignored-files` | `pnpm check:tracked-ignored-files` | `package.json` + CI | sim | P0 / hygiene | `docs/EVIDENCE_INDEX.md` | Parte do job `EvidenceIndex`. |
| `check:imob-knowledge-base` | `pnpm check:imob-knowledge-base` | `package.json` + CI | sim | P4 / IMOB | `docs/EVIDENCE_INDEX.md` | Parte do job `EvidenceIndex`. |
| `test:ci-unit-suite` | `pnpm test:ci-unit-suite` | `package.json` + CI | sim | P0 / suite unitária | `docs/EVIDENCE_INDEX.md` | Job dedicado `CiUnitSuite`; fonte da verdade em `scripts/unit-tests-manifest.txt`. |

## Jobs CI identificados

| Job key | Name | Comando principal | Bloqueante? | Origem/evidência |
| --- | --- | --- | --- | --- |
| `build_validate` | n/a | `pnpm lint`, core tests, `pnpm check:src-dist-route-parity`, `pnpm check:ledger-bundle-smoke`, `pnpm check:rbac-fail-closed`, `pnpm check:redis-fail-closed`, `pnpm check:guardrail-ledger-noop`, `pnpm check:worker-topology`, build web | sim | `.github/workflows/ci.yml` |
| `self_service_dedup_guards` | `SelfServiceDedupGuards` | `pnpm check:self-service-runtime-graph`, `pnpm check:frontend-duplication` | sim | `.github/workflows/ci.yml` |
| `evidence_index` | `EvidenceIndex` | `pnpm check:public-product-taxonomy`, `pnpm check:docs-link-integrity`, `pnpm check:tracked-ignored-files`, `pnpm check:imob-knowledge-base`, `pnpm check:evidence-index` | sim | `.github/workflows/ci.yml` |
| `help_playbook_drift` | `HelpPlaybookDrift` | `pnpm check:help-playbook-drift` | sim | `.github/workflows/ci.yml` |
| `chat_agent_onboarding` | `ChatAgentOnboarding` | `pnpm check:chat-agent-onboarding` | sim | `.github/workflows/ci.yml` |
| `provider_boundary` | `ProviderBoundary` | `pnpm check:provider-boundary` | sim | `.github/workflows/ci.yml` |
| `chat_engine_regression` | `ChatEngineRegression` | `pnpm check:chat-launcher-render-only`, `pnpm check:chat-runtime-entrypoint-debt`, `pnpm check:presentation-snapshot-contract`, `pnpm test:chat-engine` | sim | `.github/workflows/ci.yml` |
| `imob_frontdoor_regression` | `ImobFrontdoorRegression` | `pnpm check:imob-frontdoor-regression` | sim | `f0-5-imob-frontdoor-ci-gate-2026-07-09.md` |
| `orphan_tests_regression` | `OrphanTestsRegression` | `pnpm check:orphan-tests` | sim | `f0-8-orphan-tests-ci-gate-2026-07-09.md` |
| `public_health_contract` | `PublicHealthContract` | `pnpm test:api-health-contract` | sim | `.github/workflows/ci.yml` |
| `agents_policy_fail_closed` | `AgentsPolicyFailClosed` | `pnpm test:agents-policy-fail-closed` | sim | `.github/workflows/ci.yml` |
| `rbac_guardrail_regression` | `RbacGuardrailRegression` | `pnpm check:rbac-fail-closed`, `pnpm check:guardrail-ledger-noop` | sim | `.github/workflows/ci.yml` |
| `imob_lead_continuity_scoped` | `ImobLeadContinuityScoped` | `pnpm test:imob-lead-continuity`, `pnpm test:web-chat-launcher`, `pnpm check:evidence-index` | sim | `.github/workflows/ci.yml` |
| `ci_unit_suite` | `CiUnitSuite` | `pnpm test:ci-unit-suite` | sim | `.github/workflows/ci.yml` |
| `receipt_canon_compat` | `ReceiptCanonCompat` | `pnpm check:receipt-canon-compat` | sim | `.github/workflows/ci.yml` |
| `agent_protocol_compat` | `AgentProtocolCompat` | `pnpm check:agent-protocol-compat`, `pnpm check:agent-protocol-compat-matrix` | sim | `.github/workflows/ci.yml` |
| `p2_audit_interop` | `P2AuditInterop` | `pnpm generate:p2-interop-evidence`, `pnpm check:p2-audit-interop` | sim | `.github/workflows/ci.yml` |
| `p2_high_global_coverage` | `P2HighGlobalCoverage` | `pnpm check:p2-high-global-coverage`, `pnpm check:p2-evidence-recency` | sim | `.github/workflows/ci.yml` |
| `p1_critical_chain` | `P1CriticalChain` | `pnpm check:p1-critical-chain` | sim | `.github/workflows/ci.yml` |
| `p1_reconciliation_recurring` | `P1ReconciliationRecurring` | `pnpm check:p1-reconciliation-recurring` | sim | `.github/workflows/ci.yml` |
| `p0_criticality_audit` | `P0CriticalityAudit` | `pnpm audit:criticality` | sim | `.github/workflows/ci.yml` |
| `p3_economy_hardening` | `P3EconomyHardening` | `pnpm generate:p3-economy-evidence`, `pnpm check:p3-evidence-recency`, `pnpm check:p3-economy-hardening` | sim | `.github/workflows/ci.yml` |
| `p3_settlement_support_by_env` | `P3SettlementSupportByEnv` | `pnpm generate:p3-economy-evidence`, `pnpm check:p3-evidence-recency`, `pnpm check:p3-settlement-support-by-env` | sim | `.github/workflows/ci.yml` |
| `settlement_contract_drift` | `SettlementContractDrift` | `pnpm check:settlement-contract-drift` | sim | `.github/workflows/ci.yml` |
| `w4_non_regression` | `W4NonRegression` | `pnpm check:w4-non-regression` | sim | `.github/workflows/ci.yml` |

Separação por status atual:
- Jobs bloqueantes: todos os jobs listados acima.
- Jobs warn-only: nenhum `continue-on-error` encontrado no estado atual de `.github/workflows/ci.yml`.
- Jobs não relacionados a P0: existem vários jobs de P1/P2/P3/P4 no mesmo workflow, mas seguem bloqueantes dentro do `CI Monorepo`.

## Checks fora do CI

| Check | Comando | Motivo de estar fora do CI | Risco | Próximo passo |
| --- | --- | --- | --- | --- |
| `check:e2e-recency` | `pnpm check:e2e-recency` | Hoje associado ao ciclo APE/renovação de evidência, não ao workflow de PR | Evidência HIGH pode vencer sem falhar PR comum | Renovar evidência real e decidir se deve entrar no CI principal ou permanecer em ciclo operacional dedicado |
| `check:backup-restore` | `pnpm check:backup-restore` | Depende de drill operacional real e evidência periódica | Backup/restore pode ficar fora da rotina de PR | Manter via runbook operacional e ciclos APE; promover só com infra/evidência real estável |
| `check:ape-hard-metrics` | `pnpm check:ape-hard-metrics` | Associado ao APE Weekly Cycle, não ao CI de PR | NO_GO operacional não aparece no CI de PR | Continuar execução no ciclo APE e usar como referência de maturidade, não como gate de PR por enquanto |
| `check:p3-stability-recurring` | `pnpm check:p3-stability-recurring` | Janela de recorrência depende de múltiplos ciclos/evidências | Regressão de estabilidade pode aparecer tardiamente | Manter em rotina APE até haver série verde suficiente |
| `check:p4-trackp-rollout` | `pnpm check:p4-trackp-rollout` | Depende de ciclos APE verdes e rollout real | Status de rollout pode divergir do CI de PR | Reavaliar após normalizar evidências base do APE |
| `check:governance` | `pnpm check:governance` | Não há job dedicado no `ci.yml`; uso operacional a confirmar | Drift de governança pode ficar fora do fluxo de PR | Confirmar se deve virar job dedicado ou permanecer como ferramenta local |
| `check:imob-chat-telemetry` | `pnpm check:imob-chat-telemetry` | Evidência/telemetria ainda não aparece no workflow de PR | Regressão de telemetria IMOB pode passar sem bloqueio | Avaliar job dedicado quando a trilha de telemetria estiver operacionalmente estabilizada |
| `check:imob-chat-persistence` | `pnpm check:imob-chat-persistence` | Check existe no `package.json`, mas não aparece no CI atual | Drift de evidência de persistência pode passar | Confirmar se deve entrar no Track P depois de evidência operacional recorrente |
| `check:imob-chat-export` | `pnpm check:imob-chat-export` | Check existe no `package.json`, mas não aparece no CI atual | Drift de export pode passar | Confirmar uso operacional e promover em PR separado, se aplicável |
| `check:manifest-integrity` | `pnpm check:manifest-integrity` | Hoje usado junto de renovação E2E HIGH, não no CI principal | Manifest antigo pode permanecer íntegro, mas vencido | Manter acoplado à renovação real do manifest e reavaliar promoção |

## Matriz P0–P4

### P0 — Integridade documental/CI
- Gates recorrentes já ativos no CI: `check:evidence-index`, `check:docs-link-integrity`, `check:orphan-tests`, `audit:criticality`, `check:w4-non-regression`, `check:public-product-taxonomy`, `check:tracked-ignored-files`, `test:ci-unit-suite`.
- Drift detectado entre `package.json`, `.github/workflows/ci.yml` e evidências F0.5/F0.7/F0.8: nenhum para os gates mapeados nesta frente.
- Warn-only no estado atual do `CI Monorepo`: nenhum.
- Dívida residual confirmada: os 50 orphan tests continuam como baseline conhecida, agora bloqueando apenas regressão nova ou allowlist stale.
- Observação operacional: há mistura de Node `20` em `build_validate` e Node `22` na maioria dos jobs dedicados; não há evidência nesta frente de que isso seja bug, mas é um ponto de consistência a confirmar em PR separado se passar a gerar drift de ambiente.

### P1 — Governança/execução crítica
- Checks que já ajudam a governança em CI: `check:rbac-fail-closed`, `check:guardrail-ledger-noop`, `check:redis-fail-closed`, `check:provider-boundary`, `check:p1-critical-chain`, `check:p1-reconciliation-recurring`, `check:receipt-canon-compat`.
- Lacunas remanescentes: parte da governança ainda depende de evidência operacional recorrente e de checks fora do CI principal, especialmente em cadeias que exigem infra ou recorrência multi-ciclo.

### P2 — Auditoria/interop
- Há gates P2 bloqueantes no CI: `check:p2-audit-interop`, `check:p2-high-global-coverage`, `check:p2-evidence-recency`, `check:agent-protocol-compat`, `check:agent-protocol-compat-matrix`.
- Lacuna residual: ainda existem contract/e2e fora de rota operacional clara, como parte dos 50 orphan tests classificados em F0.7.

### P3 — Economy hardening
- Há gates P3 no CI: `check:p3-economy-hardening`, `check:p3-evidence-recency`, `check:p3-settlement-support-by-env`, `check:settlement-contract-drift`.
- Fora do escopo desta frente consolidar maturidade operacional P3; o report apenas registra que os gates existem e seguem bloqueantes.

### P4 — Track P / IMOB
- Estado do front door IMOB consolidado por F0.5/F0.6: há gate dedicado `ImobFrontdoorRegression`, com `check:imob-frontdoor-regression` recorrente e bloqueante em PR.
- `ChatEngineRegression` e `ImobLeadContinuityScoped` também protegem superfícies relacionadas ao chat/IMOB.
- Lacunas residuais: mobile e WhatsApp continuam fora do escopo/gates desta frente; F0.9 não altera isso.

## Critérios para avançar maturidade
- Gates P0 críticos executando de forma bloqueante e estável no CI.
- `check:orphan-tests` verde em execuções consecutivas do CI, mantendo `blockingOrphanCount=0` e `staleAllowlistEntries=[]`.
- `ImobFrontdoorRegression` verde em execuções consecutivas do CI.
- Ausência de drift entre `package.json`, `.github/workflows/ci.yml` e `docs/EVIDENCE_INDEX.md`.
- Redução progressiva da baseline de 50 orphan tests.
- `auditGap=0` quando aplicável às frentes com auditoria operacional real.
- `duplicateSideEffects=0` quando houver ações reais com side effects na cadeia avaliada.
- `hardMetricsGo=true` quando aplicável ao roadmap e aos ciclos APE.
- Renovação real das evidências base do APE antes de usar P3/P4 recorrentes como sinal de maturidade operacional.

## Lacunas remanescentes
- F0 global não está fechado.
- P0 não está fechado globalmente.
- Os 50 orphan tests continuam como dívida conhecida.
- F0.9 não altera CI; apenas consolida status.
- Mobile/WhatsApp seguem fora do escopo.
- Economy segue fora do escopo desta frente, salvo o mapeamento dos gates já existentes.

## Checks executados

| Comando | Resultado | Observação |
| --- | --- | --- |
| `pnpm check:orphan-tests` | pass | `ok=true`, `orphanCount=50`, `allowlistedOrphanCount=50`, `blockingOrphanCount=0`, `staleAllowlistEntries=[]` |
| `pnpm check:evidence-index` | pass | `ok=true`, `refsChecked=408` |
| `pnpm check:docs-link-integrity` | pass | `ok=true`, `filesChecked=15` |
| `git diff -- .github/workflows/ci.yml` | vazio | sem alteração F0.9 |
| `git diff -- package.json` | vazio | sem alteração |
| `git diff -- scripts/checkOrphanTests.ts` | vazio | sem alteração |
| `git diff -- scripts/orphan-tests-allowlist.txt` | vazio | sem alteração |
| `git diff -- apps/web/src/components/agents/ChatAgentLauncher.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.tsx` | vazio | sem alteração |
| `git diff -- apps/web/src/pages/app/imob/chat.assistantDedupe.test.ts` | vazio | sem alteração |
| `git diff --check` | pass | sem saída |

## Status
Status: parcial/evidenciado
