# EVIDENCE INDEX — EIAH

> Roadmap atual (fonte da verdade): `ROADMAP_UNIFICADO_v7_ATUALIZADO_2026-02-25.md` 

## Sprint 1 (F5.3) — Evidencias operacionais

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Guia de execucao S1-01 | `docs/ops/s1-f53-e2e-high-staging.md` | Procedimento oficial para validar cadeia HIGH em staging. |
| Relatorio S1-01 (template) | `docs/ops/s1-01-e2e-high-staging-report.md` | Estrutura de evidencias por acao HIGH (Run/SCL/PoU/txId/bundle). |
| Contrato publico txId | `ops/contracts/ledger-txid-api-contract.md` | Invariante `txId -> runId -> bundleHash -> bundle` do endpoint publico. |
| Contrato de export bundle | `ops/contracts/run-bundle-api-contract.md` | Contrato canônico do endpoint `/api/runs/:id/bundle` para evidência externa. |
| Contrato de interop discovery/negotiate | `ops/contracts/interop-discovery-api-contract.md` | Contrato canônico dos endpoints `/api/actions/discovery` e `/api/actions/negotiate`. |
| Regra de alerta S1-05 | `ops/alerts/ledger-integrity-alerts.v1.yml` | Alertas de integridade ledger com severidade e playbook operacional. |
| Exposicao de metricas S1-05 | `apps/api/src/routes/metrics-prom.ts` | Publica gauges de missing/mismatch SCL/PoU/txId/bundle e flags de alerta. |

## Sprint 2 (F5.1) — Receipt Canon v1 completo (evidência real)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Evidência real `/api/ledger/:txId` com Receipt Canon v1 completo | `ops/evidence/s2-ledger-txid-receipt-canon-2026-02-24.json` | Chamada real autenticada retornando `200` com receipts: `PoUReceipt`, `TrustSnapshotReceipt`, `ApprovalReceipt`, `DelegationReceipt`, `TxLinkReceipt`. |
| Hash de integridade da evidência | `ops/evidence/s2-ledger-txid-receipt-canon-2026-02-24.json` | SHA256: `4a326909936a2e1b729451cdd01003751edfc71ad0cd08a3763aafd27abec7f9`. |
| Endpoint de origem | `apps/api/src/routes/governance.ts:414` | Endpoint público `/api/ledger/:txId` com `receiptCanon` aditivo. |
| Catálogo oficial de reason codes | `docs/ops/reason-codes-catalog.md` | Fonte única para reason codes de receipts/erros/eventos. |
| Teste anti ad-hoc de reason codes | `apps/api/src/tests/reasonCodes.catalog.test.ts` | Bloqueia reason strings literais fora do catálogo em fluxos críticos. |
| Guard fail-closed de Receipt Canon | `apps/api/src/services/receiptCanonGuards.ts` | Rejeita cadeia inconsistente de receipt com reason codes oficiais. |
| Teste de fail-closed (S2-02/S2-04) | `apps/api/src/tests/receiptCanonGuards.test.ts` | Valida bloqueio para `pou_txid_mismatch` e `missing_trust_snapshot_for_pou`. |
| Política de versionamento de contrato | `docs/ops/receipt-canon-versioning-policy.md` | Regra explícita de major para breaking e minor/patch apenas aditivo. |
| Gate de CI de compatibilidade | `scripts/checkReceiptCanonVersioning.ts` | Falha CI para breaking changes sem bump major e drift de spec/changelog/example. |
| Baseline de compatibilidade | `contracts/receipt-canon.v1.baseline.json` | Snapshot base para avaliação de backward compatibility do schema ativo. |
| Guia externo de consumo + verifier | `docs/ops/receipt-canon-external-verifier.md` | Passos 200/erro/limites e fluxo de validação externa do receipt canon. |
| Verifier CLI de vínculo run/bundle/tx | `scripts/verifyReceiptCanon.ts` | Verificação automatizada de consistência canônica a partir da resposta `/api/ledger/:txId`. |
| Evidência de execução do verifier | `ops/evidence/s2-receipt-canon-verifier-2026-02-24.txt` | Resultado real do verificador sobre evidência de staging (`passed`). |

## Sprint 4 (F5.5) — Outcome/experimentos (S4-03 a S4-06)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Fluxo de experimento (start/decision/rollback/status) | `apps/api/src/routes/governance.ts` | Endpoints de experimento com transições auditáveis, reason codes e timeline por experimento. |
| Gate de promoção por KPI + FP/FN + segurança | `apps/api/src/services/experimentPromotionGate.ts` | Regra formal de promoção (pass/fail) com razões explícitas. |
| Auto-rollback em falha de promoção | `apps/api/src/routes/governance.ts` | Bloqueio `PROMOTION_GATE_FAILED` e rollback automático auditável quando habilitado. |
| Telemetria FP/FN versionada (janela temporal) | `apps/api/src/services/fpfnTelemetry.ts` | Método versionado `governance.fpfn.v1` para métricas judge/policy por janela e writeLabel. |
| Endpoint de telemetria FP/FN | `apps/api/src/routes/governance.ts` | `GET /api/governance/telemetry/fpfn` com `windowDays`, `methodVersion` e cálculo versionado. |
| Runbook operacional de experimentos | `docs/ops/governance-experiments-runbook.md` | Procedimento de operação, incidentes e critérios de decisão para experimentos em shadow/promoção. |
| Simulação mínima S4-06 (script) | `scripts/simulateGovernanceExperimentS406.ts` | Execução reproduzível da lógica de gate + telemetria sem dependência de DB/Redis. |
| Evidência gerada da simulação | `ops/evidence/s4-06-governance-experiments-simulation-2026-02-24.json` | Artefato com input, thresholds e saída calculada para auditoria do procedimento. |
| Evidência E2E de bloqueio de promoção por gate | `ops/evidence/axo-cycle-e2e-gatefail-2026-02-25.json` | Caso central do DoD: tentativa de `promote_enforce` bloqueada com `PROMOTION_GATE_FAILED` e normalização explícita para regressão de KPI/segurança. |

## Sprint 5 (F5.6 + Track P) — DocOps depreciação/sunset (S5-05)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Política oficial de depreciação/sunset | `ops/contracts/deprecation-sunset-policy.md` | Define estados (`active/deprecated/sunset`), janela mínima de sunset e checklist obrigatório por spec. |
| Registro rastreável de depreciação | `ops/contracts/deprecation-registry.v1.json` | Fonte versionada com itens ativos/deprecados, datas (`deprecatedSince/sunsetDate`), owner e replacement. |
| Checklist aplicado em spec real | `ops/contracts/deprecation-registry.v1.json` + `ops/contracts/ledger-txid-api-contract.md` | Marca `docs/ops/ledger-txid-api-contract.md` como `deprecated` com sunset e replacement canônico para `ops/contracts/ledger-txid-api-contract.md`. |
| Gate S5-06 no CI (sync + referências) | `.github/workflows/ci.yml` + `scripts/checkEvidenceIndex.ts` + `scripts/updateEvidenceIndexImportGraph.ts` | CI valida sincronização automática do índice e integridade de referências (links/rotas/specs). |

## Sprint 5 (F5.3/F5.4/F5.5/F5.6 + Track P) — Fechamentos v7 (2026-02-25)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Evidência E2E de Interop discovery/negotiate | `ops/evidence/interop-e2e-2026-02-25.json` | Transcritos de discovery+negotiate, invariantes de compatibilidade e vínculo com contrato único de interop. |
| Runbook operacional de Interop | `docs/ops/interop-runbook.md` | Procedimento operacional para gerar evidência recorrente e tratar incidentes de interop. |
| Evidência HIGH por ação (policy-driven) | `ops/evidence/s1-01-high-e2e-realestate.apply_adjustment-2026-02-25.json` | Cadeia HIGH com `txId -> runId -> bundleHash` para ação crítica da policy. |
| Evidência HIGH por ação alias (policy-driven) | `ops/evidence/s1-01-high-e2e-action.realestate.apply_adjustment-2026-02-25.json` | Cadeia HIGH para alias de ação crítica listado na policy. |
| Policy canônica de risco por ação | `docs/ops/risk-tiering-by-action.md` | Fonte oficial `action -> tier -> txIdRequired` usada pelo gate HIGH no CI. |
| Evidência E2E de ciclo AXO | `ops/evidence/axo-cycle-e2e-2026-02-25.json` | Ciclo real start/decision/rollback com trilha auditável e reason codes canônicos. |
| Evidência E2E AXO (gate fail explícito) | `ops/evidence/axo-cycle-e2e-gatefail-2026-02-25.json` | Prova operacional específica de bloqueio automático por gate de promoção (`promotionAttempted=true`, `promotionBlocked=true`). |
| Evidência de janela FPFN | `ops/evidence/fpfn-window-2026-02-25.json` | Telemetria `governance.fpfn.v1` por janela temporal. |
| Evidência E2E de Economy (PoU/disputa/reputação) | `ops/evidence/economy-e2e-2026-02-25.json` | Prova operacional do ciclo econômico mínimo com assertivas no-pou-no-pay, disputa terminal e trilha de reputação. |
| Evidência E2E Economy full-cycle | `ops/evidence/economy-e2e-fullcycle-2026-02-25.json` | Prova no mesmo artefato do ciclo completo `tarefa -> PoU FINALIZED -> pagamento -> disputa terminal -> reputação`. |
| Runbook operacional de Economy/disputas | `docs/ops/economy-dispute-runbook.md` | Procedimento, incidentes e critérios operacionais para F5.6. |
| Contrato webhook billing provedor | `ops/contracts/billing-webhook-provider-contract.md` | Headers, assinatura, idempotência/replay e semântica de aceite/duplicata. |
| Evidência webhook billing válido | `ops/evidence/billing-webhook-valid-2026-02-25.json` | Prova de assinatura válida, rota operacional e assertions mínimas de aceite. |
| Evidência webhook billing replay | `ops/evidence/billing-webhook-replay-attack-2026-02-25.json` | Prova de replay detectado sem efeito colateral e reason code auditável. |
| Runbook operacional de webhook billing | `docs/ops/billing-webhook-runbook.md` | Operação de assinatura/replay/idempotência e playbook de incidente. |
| Evidência DocOps ciclo 1 (auditável) | `ops/evidence/docops-ci-pass-2026-02-24.json` | Registro de execução CI com metadados (`schema`, `timestamp`, `commitSha`, `workflow`, `jobs`, `diffSummary.drift=0`). |
| Evidência DocOps ciclo 2 (auditável) | `ops/evidence/docops-ci-pass-2026-02-25.json` | Segundo ciclo em data distinta com `commitSha` e vínculo de estabilidade (`consecutivePassedCycles=2`, `criticalDriftDetected=false`). |
| Runbook operacional de DocOps | `docs/ops/docops-runbook.md` | Rotina por ciclo, critérios de estabilidade e tratamento de drift documental. |

## Entry points

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| API entrypoint | `apps/api/src/index.ts` | 1-125 | Bootstrap da API, rotas e start de worker/outbox. |
| Web entrypoint | `apps/web/src/main.tsx` | 1-10 | Entrada do frontend. |
| CLI entrypoint | `apps/cli/src/index.ts` | 1-58 | Entrada da CLI e comandos básicos. |
| Action-runner entrypoint | `apps/workers/action-runner/src/index.ts` | 1-121 | Boot do worker MCP + gates. |
| Maintenance entrypoint | `apps/workers/maintenance-worker/src/index.ts` | 1-30 | Boot do maintenance-worker. |
| Run-worker standalone | `apps/workers/run-worker/src/index.ts` | 1-212 | Worker de runs fora da API. |

## Rotas da API (runs/events/memory/actions/billing)

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| Runs list/detail | `apps/api/src/routes/runs.ts` | 39-149 | GET /runs e /runs/:id. |
| Run events + SSE | `apps/api/src/routes/runs.ts` | 151-259 | GET /runs/:id/events e /runs/:id/stream. |
| Run replay | `apps/api/src/routes/runs.ts` | 1253-1323 | POST /runs/:id/replay. |
| Memory ingest/search | `apps/api/src/routes/memory.ts` | 30-102 | POST /memory e /memory/search. |
| Ops (queues drain/redrive) | `apps/api/src/routes/ops.ts` | 155-260 | Drenagem e redrive da fila de runs. |
| DeFi placeholders | `apps/api/src/routes/defi.ts` | 37-79 | TODOs de simulação e envio de tx. |

## Orquestração (core)

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| AgentOrchestrator | `packages/core/src/orchestrator/agentOrchestrator.ts` | 143-210 | Criação de plano, registro de eventos e persistência de steps. |
| PlanStepRecord schema | `packages/db/prisma/schema.prisma` | 203-215 | Persistência de steps no banco. |
| Action Registry | `packages/core/src/actions/actionRegistry.ts` | 66-111 | Registro e listagem de actions. |
| VersionedActionRegistry | `packages/core/src/actions/registry/VersionedActionRegistry.ts` | 10-69 | Actions versionadas. |
| Agents (lista) | `packages/core/src/actions/agents/index.ts` | 1-78 | Definição de agentes e registro. |

## Filas/workers (BullMQ)

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| Run queue + DLQ + redrive | `packages/core/src/queue/runQueue.ts` | 145-397 | Attempts, backoff, DLQ e redrive. |
| Action queue + DLQ | `packages/core/src/queue/actionQueue.ts` | 125-255 | Attempts, backoff e DLQ. |
| Ops redrive | `apps/api/src/routes/ops.ts` | 240-259 | Redrive via API. |
| Run-worker (API) | `apps/api/src/workers/runWorker.ts` | 88-103 | Worker dentro da API. |
| Run-worker (standalone) | `apps/workers/run-worker/src/index.ts` | 1-212 | Worker standalone. |

## SSE/replay/cursor/outbox

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| SSE stream | `apps/api/src/routes/runs.ts` | 190-259 | SSE com heartbeat e cursor. |
| Cursor em listRunEvents | `apps/api/src/services/runEvents.ts` | 81-120 | Paginação por cursor/createdAt. |
| Outbox (XADD) | `apps/api/src/services/runEvents.ts` | 47-76 | Publicação em Redis Stream. |
| Outbox processor | `apps/api/src/services/runEventOutbox.ts` | 89-145 | XREADGROUP + publish no Redis. |
| UI fallback polling | `apps/web/src/components/runs/RunViewer.tsx` | 303-337 | Fallback para polling quando SSE falha. |

## Governança (intent/trust/judge/ledger)

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| Intent Validator | `apps/api/src/services/intentValidator.ts` | 69-135 | Score/verdict + registro em ledger. |
| Trust Score engine | `apps/api/src/services/trustScore.ts` | 21-128 | Cálculo de Trust Score e gate. |
| Trust Score audit | `apps/api/src/services/trustScoreEngine.ts` | 21-95 | Atualização de score com audit. |
| Judge heurístico | `apps/api/src/services/judge.ts` | 25-70 | Heurística de PII + flags. |
| Judge LLM | `apps/api/src/services/judgeGate.ts` | 62-123 | Judge com LLM e policy judge-v1. |
| Judge gate no runner | `apps/workers/action-runner/src/index.ts` | 274-507 | Enforce/shadow e bloqueio. |
| RBAC middleware | `apps/api/src/middlewares/requireScope.ts` | 12-55 | Check de scope para API. |
| RBAC core allow-all | `packages/core/src/policy/TenantPolicyStore.ts` | 1-14 | Policy default allow-all (parcial). |
| GuardrailLedger store | `packages/core/src/services/guardrailLedgerStore.ts` | 6-90 | Persistência no DB. |
| Guardrail core no-op | `packages/core/src/audit/guardrailLedger.ts` | 12-18 | Placeholder (risco). |

## SCL/critical actions

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| SCL off-chain signing | `packages/core/src/services/sclLedger.ts` | 72-240 | Hash/assinatura e persistência do SCL. |
| Signer Vault/HTTP/local | `packages/core/src/security/signerManager.ts` | 123-178 | Provedores de assinatura. |
| Vault signer | `packages/core/src/security/vaultSigner.ts` | 3-33 | Integração com Vault HTTP. |
| SCL schema | `packages/db/prisma/schema.prisma` | 455-477 | Tabela `scl_ledger`. |
| ToolContract executor web3 not implemented | `packages/mcp-runner/src/executor/MCPExecutor.ts` | 44-96 | Executor web3 não implementado. |

## Prisma schema (entidades)

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| Run + RunEvent | `packages/db/prisma/schema.prisma` | 146-201 | Entidades de execução e eventos. |
| GuardrailLedger/AuditLedger | `packages/db/prisma/schema.prisma` | 437-499 | Auditoria e ledger. |
| ToolContract | `packages/db/prisma/schema.prisma` | 394-413 | Contratos MCP. |
| MemorySnapshot/EmbeddingChunk | `packages/db/prisma/schema.prisma` | 304-356 | Memória e vetores. |

## UI RunViewer

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| RunViewer SSE + polling | `apps/web/src/components/runs/RunViewer.tsx` | 250-337 | SSE com cursor e fallback. |

## Config/.env (o que existir)

| Assunto | Arquivo | Trecho/linhas | O que prova |
| --- | --- | --- | --- |
| Variáveis de governança | `.env.template` | 48-126 | Intent Validator, Trust Score, signer, SCL off-chain. |
| MCP + outbox | `.env.governance.example` | 13-23 | MCP enforcement e outbox stream. |
| Infra dev (Docker) | `docker-compose.dev.yml` | 15-201 | Serviços API/Web/Workers/DB/Redis. |

## Divergências / impactos

- Dois run-workers coexistem (API e standalone) → risco de divergência operacional.  \
EVIDÊNCIA: `apps/api/src/index.ts:97-103` + `apps/workers/run-worker/src/index.ts:1-212`.

## Buscas registradas (encontrado vs não encontrado)

| Assunto | Comando | Resultado |
| --- | --- | --- |
| PolicyEngine (Fase 5.2) | `rg -n "PolicyEngine|policyEngine" apps packages` | ENCONTRADO: `packages/core/src/policy/policyEngine.ts` + `apps/api/src/services/policyEngineAdapter.ts` |
| Endpoint de aprovação humana (`/runs/:id/approve`) | `rg -n "runs/:id/approve|approve" apps packages` | ENCONTRADO: `apps/api/src/routes/runs.ts:722-775` |
| Campos Run.approval_status/approvedBy | `rg -n "approval_status|approvedBy" packages/db` | NÃO ENCONTRADO |
| Endpoint público `/ledger/:txId` | `rg -n "/ledger/:txId|ledger/:txId" apps packages` | ENCONTRADO: `apps/api/src/routes/governance.ts:414` |
| TrustScoreToken / tokenização de reputação | `rg -n "TrustScoreToken|reputação|tokenização" apps packages` | ENCONTRADO apenas em `apps/api/backup-20251031-103132.sql` (texto de backup, não implementação) |

## Status do Roadmap (consolidado por evidência)

| Item | Evidências | Status (no repo) | Divergência com Roadmap |
| --- | --- | --- | --- |
| Fase 4 — Gate pré‑execução (SCL obrigatório) | `apps/workers/action-runner/src/index.ts:841-919` | Implementado | Compatível (Roadmap v5: ✅ concluída) |
| Fase 4 — Resiliência do Signer | `packages/core/src/security/signerManager.ts:225-269` | Implementado | Compatível (Roadmap v5: ✅ concluída) |
| Fase 4 — Reconciliação Guardrail ↔ SCL | `apps/workers/maintenance-worker/src/index.ts:286-383` + `packages/core/src/services/reconcileLedgerService.ts:15-233` | Implementado | Compatível (Roadmap v5: ✅ concluída) |
| Fase 5.0 — Marketplace (catálogo + delegações) | `packages/db/prisma/schema.prisma:564-604` + `apps/api/src/routes/marketplace.ts:7-212` + `apps/web/src/pages/self-service/index.tsx:51-227` | Implementado (core) | Compatível (Roadmap v5: ⚙️ parcial) |
| Fase 5.0 — “UX de delegação avançada” | **NÃO ENCONTRADO** (`rg -n "delegation advanced|delegacao avancada|delegação avançada|advanced delegation"`) | Não evidenciado | Compatível (Roadmap v5: falta) |
| Fase 5.1 — PoU (modelo + serviço + pipeline + eventos) | `packages/db/prisma/schema.prisma:520-547` + `packages/core/src/services/pouService.ts:31-208` + `apps/workers/action-runner/src/index.ts:841-1314` + `packages/contracts/src/runEvent.schema.json:16-46` | Implementado | Compatível (Roadmap v5: ⚙️ parcial/hardening) |
| Fase 5.1 — Trust Gate (score + gate) | `apps/api/src/services/trustScore.ts:21-129` + `apps/workers/action-runner/src/index.ts:189-233` | Implementado | Compatível (Roadmap v5: ⚙️ parcial/hardening) |

## Import graph (usados vs órfãos)

<!-- AUTO-IMPORT-GRAPH:START -->
> Bloco gerado automaticamente por `scripts/updateEvidenceIndexImportGraph.ts`. Não editar manualmente.

Entrypoints considerados:
- `apps/api/src/index.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/main.js`
- `apps/cli/src/index.ts`
- `apps/workers/run-worker/src/index.ts`
- `apps/workers/action-runner/src/index.ts`
- `apps/workers/maintenance-worker/src/index.ts`

- Resultado: `REACHABLE_COUNT 146`, `TOTAL_FILES 1305`, `ORPHAN_COUNT 1159`.
- Snapshot: `ops/docops/import-graph-summary.json`.

### Amostra de usados (relativos)
- `apps/api/src/actions/tenantActionRegistry.ts`
- `apps/api/src/audit/auditLogger.ts`
- `apps/api/src/auth/apiTokenRepository.ts`
- `apps/api/src/auth/session.ts`
- `apps/api/src/index.ts`
- `apps/api/src/integrations/whatsapp/index.ts`
- `apps/api/src/integrations/whatsapp/meta.ts`
- `apps/api/src/integrations/whatsapp/store.ts`
- `apps/api/src/integrations/whatsapp/webhook.ts`
- `apps/api/src/middlewares/auth.ts`
- `apps/api/src/middlewares/checkDelegationPolicy.ts`
- `apps/api/src/middlewares/enforceTenant.ts`
- `apps/api/src/middlewares/prismaRequest.ts`
- `apps/api/src/middlewares/requestLogger.ts`
- `apps/api/src/middlewares/requirePermission.ts`
- `apps/api/src/middlewares/requireScope.ts`
- `apps/api/src/middlewares/requireTenantRole.ts`
- `apps/api/src/orchestrator/llmExecutor.ts`
- `apps/api/src/routes/actions.ts`
- `apps/api/src/routes/agentInstalls.ts`
- `apps/api/src/routes/agents.ts`
- `apps/api/src/routes/auth.ts`
- `apps/api/src/routes/billing.ts`
- `apps/api/src/routes/cockpit.ts`
- `apps/api/src/routes/connectors.ts`
- `apps/api/src/routes/defi.ts`
- `apps/api/src/routes/delegations.ts`
- `apps/api/src/routes/governance.ts`
- `apps/api/src/routes/marketplace.ts`
- `apps/api/src/routes/memory.ts`
- `apps/api/src/routes/metrics-prom.ts`
- `apps/api/src/routes/metrics.ts`
- `apps/api/src/routes/onboarding.ts`
- `apps/api/src/routes/ops.ts`
- `apps/api/src/routes/profiles.ts`
- `apps/api/src/routes/realestate.ts`
- `apps/api/src/routes/roles.ts`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/routes/session.ts`
- `apps/api/src/routes/tenants.ts`

### Amostra de não usados (relativos)
- `apps/api/dist/actions/actionCatalogStore.js`
- `apps/api/dist/actions/tenantActionPolicyLoader.js`
- `apps/api/dist/actions/tenantActionRegistry.js`
- `apps/api/dist/actions/tests/actions.e2e.test.js`
- `apps/api/dist/agents/aadv.js`
- `apps/api/dist/agents/defiOne.js`
- `apps/api/dist/agents/diarias.js`
- `apps/api/dist/agents/eiah.js`
- `apps/api/dist/agents/finNexus.js`
- `apps/api/dist/agents/flowOrchestrator.js`
- `apps/api/dist/agents/guardian.js`
- `apps/api/dist/agents/iBC.js`
- `apps/api/dist/agents/imageNftDiarias.js`
- `apps/api/dist/agents/j360.js`
- `apps/api/dist/agents/mkt.js`
- `apps/api/dist/agents/nftPy.js`
- `apps/api/dist/agents/onchainMonitor.js`
- `apps/api/dist/agents/pitch.js`
- `apps/api/dist/agents/registry.js`
- `apps/api/dist/agents/riskAnalyzer.js`
- `apps/api/dist/agents/types.js`
- `apps/api/dist/apps/api/src/actions/actionCatalogStore.js`
- `apps/api/dist/apps/api/src/actions/tenantActionPolicyLoader.js`
- `apps/api/dist/apps/api/src/actions/tenantActionRegistry.js`
- `apps/api/dist/apps/api/src/actions/tests/actions.e2e.test.js`
- `apps/api/dist/apps/api/src/agents/aadv.js`
- `apps/api/dist/apps/api/src/agents/defiOne.js`
- `apps/api/dist/apps/api/src/agents/diarias.js`
- `apps/api/dist/apps/api/src/agents/eiah.js`
- `apps/api/dist/apps/api/src/agents/finNexus.js`
- `apps/api/dist/apps/api/src/agents/flowOrchestrator.js`
- `apps/api/dist/apps/api/src/agents/guardian.js`
- `apps/api/dist/apps/api/src/agents/iBC.js`
- `apps/api/dist/apps/api/src/agents/imageNftDiarias.js`
- `apps/api/dist/apps/api/src/agents/j360.js`
- `apps/api/dist/apps/api/src/agents/mkt.js`
- `apps/api/dist/apps/api/src/agents/nftPy.js`
- `apps/api/dist/apps/api/src/agents/onchainMonitor.js`
- `apps/api/dist/apps/api/src/agents/pitch.js`
- `apps/api/dist/apps/api/src/agents/registry.js`
<!-- AUTO-IMPORT-GRAPH:END -->
## Checklist de completude

- Resumo executivo: OK
- Estado atual (implementado/parcial/planejado/não encontrado): OK
- Arquitetura por camadas: OK
- Fluxos principais: OK
- Governança cognitiva e execução crítica: OK
- IAs/modelos e responsabilidades: OK
- Benefícios B2B ligados a componentes: OK
- Riscos + mitigação: OK
- Próximos passos priorizados: OK
- Lista completa usados/não usados: OK
