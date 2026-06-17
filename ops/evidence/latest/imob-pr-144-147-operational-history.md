# IMOB — Histórico Operacional Consolidado: PRs #144–#147

**Data de consolidação:** 2026-06-17
**Commit de referência:** `4593647` (merge do PR #147 em `main`)
**Escopo:** PRs #144, #145, #146 e #147 — cobertura total da frente IMOB de Command Center a Observability Gates

---

## Resumo Executivo

Entre os PRs #144 e #147, o vertical IMOB passou de um dashboard com dados sintéticos e sem mutação de estado a uma cadeia completa e governada:

- Command Center com superfícies reais (parceiros, propriedades, casos)
- Funil/equipe consolidados com KPIs de broker sem duplicação
- Gate de runtime para `ownerResponsible` antes de `commission.settle`
- Cadeia CC → Chat → confirmação → run → worker → mutação → canonical → CC refresh, provada em banco real
- Hardening operacional com métricas, alertas, runbook e CI gate de regressão

A invariante central permanece intacta em todo o histórico: **`ImobCase.status` é decidido exclusivamente no backend. React não contém regra de status.**

---

## Linha do Tempo dos PRs

| PR | Título | Merge | Foco |
|----|--------|-------|------|
| #144 | IMOB Web — Command Center, dashboard e superfícies operacionais | 2026-06-15 | Frontend com dados reais |
| #145 | IMOB Funnel/Team: consolidação e hardening de KPIs de broker | 2026-06-15 | Funil consolidado, semântica de broker |
| #146 | IMOB: validar contrato de responsible actor no runtime de assignment | 2026-06-16 | Gate de runtime `ownerResponsible` |
| #147 | CC→Chat worker chain + observability hardening (Fases 1–4.2, H1–H5) | 2026-06-17 | Cadeia completa + observabilidade |

---

## PR #144 — Command Center e Superfícies Operacionais

**Entregue:**
- Dashboard IMOB conectado a APIs reais: `apiGetImobFunnelHealth`, `apiListImobCaseCosts`, `apiListImobChatThreads`
- Superfícies de parceiros (`partners.tsx`), propriedades (`properties.tsx`) e contexto de caso migraram de dados sintéticos para chamadas reais
- `ImobCommandCenter.tsx` e `ImobDashboardHero.tsx` com rótulos de janela temporal explícitos
- Lógica de negócio extraída de page components para `imobCommandCenterHelper.ts`
- `contextCaseSource` com tipo discriminado (`"requested" | "thread" | "run" | "heuristic" | null`)
- Aba Equipe removida do funil (deduplicação Team vs Funnel antecipada)

**Rodada Surface Data Reliability — 10 alertas fechados:**

| Alerta | Patch | Testes |
|--------|-------|--------|
| A1 | Labels de janela temporal explícitas (`window: "7d"`), `Bloqueios (7d)`, `${valor} (${kpiWindowDays}d)` | 9/9 |
| A2 | `syntheticThreads` removido; `selectedThreadId` inicia `null`; API vazia → `threads = []` | 9/9 |
| A3 | Prop `caseCostWindowDays` explícita no CC; `costLabel` exibe `R$ X.XX (30d)` | 8/8 |
| A4 | `workspaceId` defense-in-depth em `GET /imob/cases` e `GET /imob/cases/costs`; mismatch → 403 `WORKSPACE_SCOPE_MISMATCH` | 6/6 |
| A5 | `syntheticPartners` removido; `delegateeId` fora de fallback de nome; badge de fonte (`delegações marketplace / sem delegações / indisponível`) | 14/14 |
| A6 | `buildCasePriority` e `buildCaseFallbackActions` movidas de `dashboard.tsx` para `imobCommandCenterHelper.ts` | 10/10 |
| A7 | `contextCaseSource` discriminado; badge `"estimado por contexto da thread"` quando `heuristic` | 11/11 |
| A8 | `syntheticProperties` removido; badge de fonte no KPI strip | 5/5 |
| A9 | `properties.tsx` chama `apiListImobProperties()` real na montagem | 5/5 |
| A10 | `"Casos em parceria"` → `"Políticas delegadas"`; `activeCases` → `delegationPoliciesCount` | 4/4 |

**Total A1–A10:** 81/81 testes

---

## PR #145 — Funil/Team: Consolidação e KPIs de Broker

**Entregue:**
- Consolidação definitiva de Team dentro do Funil — eliminação da aba duplicada
- `ImobFunnelTeamSection.tsx` como componente canônico de equipe no funil
- KPIs de broker: semântica de comissão explícita, métricas de captação sem ambiguidade Team/Funnel
- `dashboard.tsx` atualizado para consumir funil unificado sem duplicação de estado

**Artefato de evidência:** `docs/ops/imob-funnel-team-pr-execution-checklist.md`

---

## PR #146 — Responsible Actor Contract no Runtime de Assignment

**Entregue:**
- Gate de validação `ownerResponsible` no `ImobPostRunMutationWorker`: `commission.settle` bloqueia mutação se `ownerResponsible === null`
- `reasonCode: RESPONSIBLE_ACTOR_MISSING` registrado como invariante de runtime
- `CASE_RESPONSIBLE_REQUIRED` propagado como `reasonCode` de falha contratual
- `assignOwnerToCase()` / `assignResponsibleActor()` com evento `owner_assigned` atômico e idempotência por `evidenceRef`

**Artefato de evidência:** `docs/ops/imob-data-trilha-b-runtime-minimo-execution-checklist.md`

---

## PR #147 — Cadeia CC→Chat + Observability Gates (Fases 1–4.2, H1–H5)

### Frente CC→Chat: Fases 1–4.2

#### Fase 1+2 — Action Dispatch e Contratos de Chat

- CC CTA → Chat com `actionId` na URL
- Badge de confirmação antes de `apiAgentsExecute`
- `resolveImobCrmActionDispatch`: valida `actionId` vs `canonical.recommendedActions`, mapeia 11 actionIds para `executionRequest`, fall-through para consultivos, `mode=blocked` para inválidos
- Proteção cross-workspace no dispatcher
- **5/5 testes (Fase 1) + 16/16 testes (Fase 2)**

#### Fase 3 — Confirmação Explícita

- `shouldUseDirectedActionFlow` gate no chat
- `prepareDirectedActionExecution` aguarda confirmação sem chamar `apiAgentsExecute`
- Guard `directedConfirmingRef` contra double-click
- `source: "command-center"` no metadata via `buildAgentsExecuteMetadata`
- **12/12 testes**

#### Phase 4.0 — Contract/Handler Alignment

- Alinhamento dos handlers de run com contratos de ação IMOB
- `Run.caseId` propagado via `executionInput.caseId`
- `Run.request.metadata.executionInput.actionId` preservado
- **5 suítes confirmadas**

#### Phase 4.1 — Worker Foundation e Mutation

**4.1a — Product Outcome Matrix:**
11/11 actionIds com outcome completo: status resultante, stage, nextStep, pendingItems, blockers, reasonCodes, failure_behavior, simulated_behavior, economy impact, receipt/bundle. `commission.settle` único terminal definido.

**4.1b — Worker Foundation (resolve P2/P3/P4):**
- `buildImobCanonicalCase` + tipos canonicais extraídos para `services/imob/imobCanonical.ts`
- `shouldSkipImobPostRunMutationForSimulatedOutput(run)` — guard puro
- `imobRunCompletedQueue.ts` — BullMQ, jobId idempotente por runId
- **17/17 testes**

**4.1c — ImobPostRunMutationWorker real:**
- `IMOB_RUN_OUTCOME_MAP` (11 actionIds, Phase 4.1a matrix)
- 10 guards ordenados: campos, canonicidade, outcome, run.status, simulated, txId, idempotência DB, case exists, ownerResponsible, commission.settle
- `ImobCrmMutationService.updateCase`
- Canonical recalculado via `buildImobCanonicalCase`
- Receipt/bundle derivados de `run.txId`/`run.id`
- **10/10 suítes (21 assertions)**

#### Phase 4.2 — E2E com Banco Real

8 cenários contra PostgreSQL real, **9/9 testes**:

| Cenário | Invariante provada | Resultado |
|---------|--------------------|-----------|
| E2E-01 | happy path `owner.register` → `stage=property_collecting`, `status=ready_for_review`, dossier API 200 OK | ✓ |
| E2E-02 | idempotência por runId → `already_processed_skip`, 1 evento no DB | ✓ |
| E2E-03 | `simulated=true` → `skipped_simulated_run`, case inalterado | ✓ |
| E2E-04 | `run.status=error` → `run_not_success_skip`, case inalterado | ✓ |
| E2E-05 | cross-workspace → `run_not_found`, case inalterado | ✓ |
| E2E-06 | `commission.settle` → `stage=done`, `status=done`, `pendingItems=[]`, `case.completed` terminal | ✓ |
| E2E-07 | `lead.qualify` sem txId → mutado (`requiresTxId=false`) | ✓ |
| E2E-08 | `owner.register` sem txId → `receipt_required_no_tx_id`, case inalterado | ✓ |

**Arquivo de teste:** `apps/api/src/tests/imob-post-run-mutation-e2e.test.ts`

### Observability & Regression Gates: H1–H5

#### H1 — ImobWorkerMetrics (Counters In-Memory)

- Módulo `imobWorkerMetrics.ts`: `incrementCounter`, `getCounterSnapshot`, `renderCountersAsPrometheusText`, `resetCountersForTesting`
- 4 counters: `imob_run_completed_jobs_total{actionId}`, `imob_post_run_mutations_applied_total{actionId,terminal,requiresTxId}`, `imob_post_run_skips_total{actionId,reason}` (12 reason codes), `imob_post_run_failures_total{reason}`
- Zero PII em labels
- Exposto em `/metrics-prom`
- **13/13 testes (7 suítes T-M1..T-M7)**

#### H2 — ImobWorkerAlerts (Regras de Alerta Puras)

- 7 regras: IMOB-W-001..IMOB-W-007 (ERROR/WARNING por severidade)
- `evaluateImobWorkerAlerts` snapshot-based + `evaluateImobWorkerStall` delta-based
- Thresholds configuráveis via `AlertConfig`
- Zero PII em `AlertEvent`; sem false positives em snapshot vazio
- **21/21 testes (8 suítes T-A1..T-A8)**

#### H3 — CI Regression Gate

- Workflow `.github/workflows/imob-worker-e2e.yml`: Postgres (pgvector:pg16) + Redis 7, `migrate:deploy`, timeout 5 min
- Script `test:imob-worker:e2e` com `--test-force-exit`
- PR bloqueado se qualquer E2E-01..E2E-08 falhar
- **9/9 E2E confirmados em CI**

#### H4 — Runbook e Skip Reason Monitor

- Runbook `docs/ops/runbooks/imob-worker-observability.md`: cadeia CC→Chat→run→worker→case; 7 ruleIds com severidade, causa, investigação, mitigação, escalonamento; queries sem PII; política de PII
- Monitor `h4-skip-reason-monitor.md`: todos os reasonCodes cobertos (alertáveis + silenciosos); thresholds de `DEFAULT_ALERT_CONFIG`; owner operacional por regra
- Teste `imob-worker-h4-runbook.test.ts`: 25 assertions em 5 suítes (T-R1..T-R5): ruleIds em ambos documentos, sem TODO/FIXME, sem tokens PII, severidades conferem
- **25/25 testes**

#### H5 — Demo Final e Validação Recorrente

- Roteiro reproduzível em 4 passos documentado
- Script agregador `pnpm test:imob-worker:observability` (H1+H2+H4)
- **Total: 69/69 testes (H1+H2+H3+H4)**
- Frente ENCERRADA/EVIDENCIADA

---

## Invariante Central

> **`ImobCase.status` é decidido exclusivamente no backend.**
> React não contém regra de status — o Command Center lê o estado via `GET /api/imob/cases/:id/dossier`.

Provas por nível:
- **Código:** `ImobCrmMutationService.updateCase` é o único ponto de escrita de status
- **Runtime:** 10 guards no worker protegem contra mutação indevida
- **Teste:** E2E-01..E2E-08 provam o caminho feliz e todos os guards contra banco real
- **CI:** gate obrigatório no workflow bloqueia regressão

---

## O Que Mudou para o Usuário IMOB

| Antes | Depois |
|-------|--------|
| Dashboard exibia dados sintéticos (`syntheticPartners`, `syntheticProperties`, `syntheticThreads`) | Todas as superfícies consomem APIs reais com badge de fonte |
| Custo e janela temporal sem rótulo explícito | `R$ X.XX (30d)`, `Bloqueios (7d)` — janela sempre visível |
| Aba Equipe duplicada no funil | Funil consolidado com `ImobFunnelTeamSection` |
| Clicar no CTA do CC abria o chat sem confirmação | Badge de confirmação explícita antes de executar ação |
| Ação executada mas `ImobCase` não atualizava | Worker pós-run atualiza stage/status/nextStep/pendingItems imediatamente |
| `commission.settle` podia ser executado sem responsável definido | Gate bloqueia mutação se `ownerResponsible === null` |
| Sem observabilidade do worker | Counters Prometheus + alertas IMOB-W-001..W-007 + runbook operacional |
| Sem proteção de CI para a cadeia | Workflow `imob-worker-e2e.yml` bloqueia merge em falha de qualquer E2E |

---

## Evidências e Testes Citados

| Artefato | O que prova |
|----------|-------------|
| `docs/ops/evidence/latest/imob-surface-data-reliability/a1..a10-ci-evidence.md` | 10/10 alertas de superfície fechados (81/81 testes) |
| `docs/ops/imob-funnel-team-pr-execution-checklist.md` | Funil/Team consolidado — PR #145 |
| `docs/ops/imob-data-trilha-b-runtime-minimo-execution-checklist.md` | Responsible actor contract — PR #146 |
| `docs/ops/evidence/latest/imob-cc-chat-resolution/phase2-action-dispatch.md` | Fases 1+2 — 5+16 testes |
| `docs/ops/evidence/latest/imob-cc-chat-resolution/phase3-chat-confirmation.md` | Fase 3 — 12 testes |
| `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-1b-worker-foundation.md` | Phase 4.1b — 17 testes |
| `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-1c-worker-mutation.md` | Phase 4.1c — 10 suítes / 21 assertions |
| `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-2-e2e-worker-resolution.md` | Phase 4.2 — 9/9 E2E banco real |
| `docs/ops/evidence/latest/imob-worker-observability/h1-worker-metrics.md` | H1 — 13/13 testes |
| `docs/ops/evidence/latest/imob-worker-observability/h2-worker-alerts.md` | H2 — 21/21 testes |
| `docs/ops/evidence/latest/imob-worker-observability/h3-ci-regression-gate.md` | H3 — CI gate ativo |
| `docs/ops/evidence/latest/imob-worker-observability/h4-skip-reason-monitor.md` | H4 — 25/25 testes |
| `docs/ops/evidence/latest/imob-worker-observability/h5-final-demo-validation.md` | H5 — 69/69 total |
| `apps/api/src/tests/imob-post-run-mutation-e2e.test.ts` | E2E-01..E2E-08 contra banco real |
| `.github/workflows/imob-worker-e2e.yml` | CI gate de regressão ativo |

---

## Limites / Não Escopo

- Não cobre PRs anteriores ao #144 (histórico de Market Scan, Orchestrator, etc.)
- Não cobre futuras features IMOB (lead marketplace, integração MLS, multi-proposal)
- Não altera contratos públicos, schemas Prisma, workflows existentes ou runtime agent-driven
- `ChatAgentLauncher` permanece em modo `render-only` sem heurística local — não foi alterado em nenhum dos PRs cobertos

---

## Status

**CONSOLIDADO / INDEXÁVEL**

Todas as entregas dos PRs #144–#147 estão evidenciadas por testes reais, artefatos linkados e CI gate ativo. Nenhum item pendente. Próxima frente a definir conforme roadmap v8.1.
