# EVIDENCE INDEX — EIAH

> Roadmap atual (fonte da verdade): `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
> Roadmap anterior (historico): `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-05-23.md`
> ADR de stack oficial para domain/go-live: `docs/adr/ADR-001-domain-runtime-stack.md`

## Domain & DNS / Go-Live Controlado

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Decisão canônica de stack | `docs/adr/ADR-001-domain-runtime-stack.md` | Declara a stack oficial desta revisão como `Cloudflare + Vercel + Render`, elimina ambiguidade com alternativas e define gatilhos de revisão. |
| Plano de produção IMOB | `docs/Domínio e DNS/PLANO_PRODUCAO_IMOB_EIAH.md` | Define a topologia operacional inicial, papéis por camada, rollout controlado e exigências de fail-closed. |
| Guia prático de domínio e DNS | `docs/Domínio e DNS/Domínio e DNS.md` | Mostra a configuração prática de domínio, DNS, web e API, além das alternativas documentadas para a borda pública. |
| Snapshot DNS/Cloudflare | `ops/evidence/latest/domain-go-live/dns-cloudflare-snapshot.md` | Consolida a decisão de borda/DNS e o hardening já evidenciado para a camada pública. |
| Check TLS Full Strict | `ops/evidence/latest/domain-go-live/tls-full-strict-check.md` | Promove a evidência atual de TLS edge para o pacote canônico de domain/go-live. |
| Resposta pública de health | `ops/evidence/latest/domain-go-live/api-health-response.json` | Materializa o contrato público de `/health` já validado pela suíte automatizada. |
| Smoke DNS/TLS de staging | `ops/evidence/latest/domain-go-live/staging-dns-tls-smoke.md` | Registra o escopo faltante de staging e separa explicitamente o que ainda depende de captura live. |
| Smoke DNS/TLS de produção | `ops/evidence/latest/domain-go-live/production-dns-tls-smoke.md` | Consolida a prontidão de produção com base nas evidências existentes de TLS, origem protegida e WAF. |
| Fail-closed de policy ausente | `ops/evidence/latest/domain-go-live/tenant-policy-fail-closed-403.md` | Prova o bloqueio `403 POLICY_NOT_FOUND` por teste automatizado local. |
| Plano de rollback | `ops/evidence/latest/domain-go-live/rollback-plan.md` | Define os gatilhos e passos mínimos de reversão para borda pública, app e API. |

## Sprint 1 (F5.3) — Evidencias operacionais

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Guia de execucao S1-01 | `docs/ops/s1-f53-e2e-high-staging.md` | Procedimento oficial para validar cadeia HIGH em staging. |
| Relatorio S1-01 (template) | `docs/ops/s1-01-e2e-high-staging-report.md` | Estrutura de evidencias por acao HIGH (Run/SCL/PoU/txId/bundle). |
| Contrato publico txId | `docs/ops/ledger-txid-api-contract.md` | Invariante `txId -> runId -> bundleHash -> bundle` do endpoint publico. |
| Contrato de export bundle | `docs/ops/run-bundle-api-contract.md` | Contrato canônico do endpoint `/api/runs/:id/bundle` para evidência externa. |
| Exposicao de metricas S1-05 | `apps/api/src/routes/metrics-prom.ts` | Publica gauges de missing/mismatch SCL/PoU/txId/bundle e flags de alerta. |

## Sprint 2 (F5.1) — Receipt Canon v1 completo (evidência real)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Endpoint de origem | `apps/api/src/routes/governance.ts:222` | Endpoint público `/api/ledger/:txId` com `receiptCanon` aditivo. |
| Catálogo oficial de reason codes | `docs/ops/reason-codes-catalog.md` | Fonte única para reason codes de receipts/erros/eventos. |
| Política de versionamento de contrato | `docs/ops/receipt-canon-versioning-policy.md` | Regra explícita de major para breaking e minor/patch apenas aditivo. |
| Gate de CI de compatibilidade | `scripts/checkReceiptCanonVersioning.ts` | Falha CI para breaking changes sem bump major e drift de spec/changelog/example. |
| Baseline de compatibilidade | `contracts/receipt-canon.v1.baseline.json` | Snapshot base para avaliação de backward compatibility do schema ativo. |
| Guia externo de consumo + verifier | `docs/ops/receipt-canon-external-verifier.md` | Passos 200/erro/limites e fluxo de validação externa do receipt canon. |
| Verifier CLI de vínculo run/bundle/tx | `scripts/verifyReceiptCanon.ts` | Verificação automatizada de consistência canônica a partir da resposta `/api/ledger/:txId`. |
| Gate CI da cadeia crítica P1 | `scripts/checkP1CriticalChain.ts` | Bloqueia regressão de approval/schema/receipt em fluxos críticos e exige evidência de fail-closed. |
| Gate CI de recorrência da reconciliação P1 | `scripts/checkP1ReconciliationRecurring.ts` | Exige, por padrão, **3 ciclos semanais recentes** com `auditGap=0` e `duplicateSideEffects=0` de forma contínua. |

## Sprint 4 (F5.5) — Outcome/experimentos (S4-03 a S4-06)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Fluxo de experimento (start/decision/rollback/status) | `apps/api/src/routes/governance.ts` | Endpoints de experimento com transições auditáveis, reason codes e timeline por experimento. |
| Auto-rollback em falha de promoção | `apps/api/src/routes/governance.ts` | Bloqueio `PROMOTION_GATE_FAILED` e rollback automático auditável quando habilitado. |
| Endpoint de telemetria FP/FN | `apps/api/src/routes/governance.ts` | `GET /api/governance/telemetry/fpfn` com `windowDays`, `methodVersion` e cálculo versionado. |
| Runbook operacional de experimentos | `docs/ops/governance-experiments-runbook.md` | Procedimento de operação, incidentes e critérios de decisão para experimentos em shadow/promoção. |

## Sprint 5 (F5.6 + Track P) — DocOps depreciação/sunset (S5-05)

Sem novos artefatos adicionais nesta revisão; manter rastreabilidade pelos runbooks e checks ativos.

## Sprint 5 (F5.3/F5.4/F5.5/F5.6 + Track P) — Fechamentos v7 (2026-02-25)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Runbook operacional de Interop | `docs/ops/interop-runbook.md` | Procedimento operacional para gerar evidência recorrente e tratar incidentes de interop. |
| Policy canônica de risco por ação | `docs/ops/risk-tiering-by-action.md` | Fonte oficial `action -> tier -> txIdRequired` usada pelo gate HIGH no CI. |
| Runbook operacional de Economy/disputas | `docs/ops/economy-dispute-runbook.md` | Procedimento, incidentes e critérios operacionais para F5.6. |
| Runbook operacional de webhook billing | `docs/ops/billing-webhook-runbook.md` | Operação de assinatura/replay/idempotência e playbook de incidente. |
| Política operacional de billing da EIAH | `docs/operations/eiah-billing-operational-policy.md` | Política executiva e runbook de operação para custos, reconciliação, quotas, gates e resposta por perfil. |
| Matriz de acesso da plataforma EIAH | `docs/operations/eiah-access-matrix.md` | Separação formal entre Founder Global, Tenant Admin, Workspace Admin e Usuário final, com escopo e telas esperadas. |
| Runbook operacional de DocOps | `docs/ops/docops-runbook.md` | Rotina por ciclo, critérios de estabilidade e tratamento de drift documental. |

## Operação contínua (marco 2026-03-04)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Smoke de ruleset/branch protection em `main` | `ops/evidence/latest/branch-protection-smoke-2026-03-04.md` | Confirmação operacional de que o fluxo de PR em `main` exige checks obrigatórios antes de merge. |
| APE Weekly Cycle #1 (shadow/pilot) com GO hard metrics | `ops/evidence/latest/ape-weekly-cycle-run7-2026-03-04.md` | Run #7 em `main` com `decision=GO`, `hardMetricsGo=true`, `auditGap=0`, `duplicateSideEffects=0`, `breakGlass=0` e artefatos semanais completos. |
| APE Weekly Cycle #2 (shadow/pilot) com GO hard metrics | `ops/evidence/latest/ape-weekly-cycle-run8-2026-03-04.md` | Segundo ciclo consecutivo com `decision=GO`, `hardMetricsGo=true`, `hardReasons=[]`, `auditGap=0`, `duplicateSideEffects=0`, `breakGlass=0` (estabilidade consecutiva atingida). |
| APE Weekly Cycle #3 (governança recorrente) | `ops/evidence/latest/ape-weekly-cycle-run9-2026-03-09.md` | Terceiro ciclo dentro da janela de recorrência com `auditGap=0` e `duplicateSideEffects=0`, sustentando fechamento operacional de P1. |
| APE Weekly Cycle #10 (janela renovada) | `ops/evidence/latest/ape-weekly-cycle-run10-2026-03-18.md` | Renovação da janela recorrente com `decision=GO`, `hardMetricsGo=true`, `nonRegressionGo=true`, `auditGap=0`, `duplicateSideEffects=0` e `breakGlass=0`. |
| APE Weekly Cycle #11 (continuidade operacional) | `ops/evidence/latest/ape-weekly-cycle-run11-2026-03-18.md` | Confirma que o conjunto mais recente de ciclos APE permanece dentro da janela exigida pelos gates P1, P3 e P4. |
| APE Weekly Cycle #19 (janela recorrente reaberta) | `ops/evidence/latest/ape-weekly-cycle-run19-2026-04-10.md` | Reabre a janela de recorrência com `hardMetricsGo=true`, `auditGap=0`, `duplicateSideEffects=0` e `breakGlass=0`. |
| APE Weekly Cycle #20 (estabilidade recorrente) | `ops/evidence/latest/ape-weekly-cycle-run20-2026-04-10.md` | Mantém o segundo ciclo consecutivo recente em `GO`, sem gap de auditoria e sem side effects duplicados. |
| APE Weekly Cycle #21 (gates P1/P3/P4 renovados) | `ops/evidence/latest/ape-weekly-cycle-run21-2026-04-10.md` | Sustenta o terceiro ciclo recente exigido pelos checks recorrentes de reconciliação, estabilidade e rollout. |
| APE Weekly Cycle #22 (janela recorrente renovada) | `ops/evidence/latest/ape-weekly-cycle-run22-2026-04-27.md` | Reabre a janela válida dos gates recorrentes com `hardMetricsGo=true`, `auditGap=0`, `duplicateSideEffects=0` e `breakGlass=0`. |
| APE Weekly Cycle #23 (continuidade recorrente) | `ops/evidence/latest/ape-weekly-cycle-run23-2026-04-27.md` | Mantém o segundo ciclo recente em `GO`, sem gap de auditoria e sem side effects duplicados. |
| APE Weekly Cycle #24 (janela P1/P3/P4 regularizada) | `ops/evidence/latest/ape-weekly-cycle-run24-2026-04-27.md` | Completa o trio recente exigido pelos checks recorrentes de reconciliação, estabilidade e rollout. |
| APE Weekly Cycle #25 (janela recorrente automatizada) | `ops/evidence/latest/ape-weekly-cycle-run25-2026-05-11.md` | Ciclo semanal automatizado registrando o estado atual dos gates recorrentes para acompanhamento operacional. |
| APE Weekly Cycle #26 (janela recorrente automatizada) | `ops/evidence/latest/ape-weekly-cycle-run26-2026-05-11.md` | Ciclo semanal automatizado com hard metrics em GO, reconciliacao estavel e renovacao da janela recorrente. |
| APE Weekly Cycle #27 (janela recorrente automatizada) | `ops/evidence/latest/ape-weekly-cycle-run27-2026-05-11.md` | Ciclo semanal automatizado com hard metrics em GO, reconciliacao estavel e renovacao da janela recorrente. |
| APE Weekly Cycle #28 (janela recorrente automatizada) | `ops/evidence/latest/ape-weekly-cycle-run28-2026-05-11.md` | Ciclo semanal automatizado com hard metrics em GO, reconciliacao estavel e renovacao da janela recorrente. |

## Sprint P1 (Imobiliaria Digital) — Interop Protocol Layer (2026-03-09)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Contrato API do Agent Protocol (`discovery/negotiate/execute`) | `docs/ops/agent-protocol-api-contract.md` | Contrato canônico inicial da camada protocolar para interop entre agentes/sistemas. |
| Schema versionado Agent Protocol v1 | `contracts/agent-protocol.v1.schema.json` | Forma oficial do contrato (`action/version/tier/txIdRequired/inputSchema/receiptSchema/trustRequirements`). |
| Baseline de compatibilidade Agent Protocol | `contracts/agent-protocol.v1.baseline.json` | Snapshot mínimo para detectar breaking changes sem major bump. |
| Exemplo oficial do contrato v1 | `contracts/examples/agent-protocol.v1.example.json` | Exemplo validável para `realestate.apply_adjustment` v1.2.0. |
| Política de versionamento Agent Protocol | `ops/contracts/agent-protocol-versioning-policy.md` | Regras explícitas de versionamento/compatibilidade para o protocolo. |
| Gate de CI Agent Protocol compat | `scripts/checkAgentProtocolVersioning.ts` | Check automatizado de compatibilidade/baseline no pipeline. |
| Smoke de rotas interop | `ops/evidence/latest/interop-routes-smoke-2026-03-09.json` | Prova de implementação das rotas `POST /api/agents/discovery|negotiate|execute`. |
| Evidência e2e da cadeia interop | `ops/evidence/latest/interop-e2e-agent-call-2026-03-09.json` | Prova da trilha `discovery -> negotiate -> execute -> verify receipt`. |
| Gate complementar global de cobertura HIGH | `scripts/checkP2HighGlobalCoverage.ts` | Inventário completo das ações HIGH do core (`billing/finance/notifications`) e status explícito de cobertura E2E. |
| Evidência do inventário HIGH global | `ops/evidence/latest/p2-high-global-coverage.json` | Matriz inicial de cobertura HIGH global (base para fechar P2 além do recorte IMOB). |

### Trilha C (P2) — Foco A2A explícito

- **Contrato canônico público**: Agent Protocol (`discovery/negotiate/execute`) é a base oficial de interop entre agentes.
- **Operação padrão**: fluxo `discovery -> negotiate -> execute` com evidência de smoke e e2e.
- **Evolução contratual**: versionamento, baseline e gate de compatibilidade bloqueiam breaking sem major.

## Sprint P1 (Imobiliaria Digital) — Economy Base (2026-03-09)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Evidência de schema e rotas PaymentIntent | `ops/evidence/latest/payment-intent-schema-YYYY-MM-DD.json` | Prova da camada `PaymentIntent` com campos mínimos e índices operacionais; o gate usa sempre o artefato mais recente. |
| Evidência e2e de PoU-gated payment release | `ops/evidence/latest/pou-gated-payment-e2e-YYYY-MM-DD.json` | Prova da bifurcação `blocked` sem PoU/SCL e `released` com PoU/SCL válido; o gate usa sempre o artefato mais recente. |
| Evidência e2e de settlement providers | `ops/evidence/latest/settlement-provider-e2e-YYYY-MM-DD.json` | Prova de providers em modo suportado por ambiente (`stripe=full`, `crypto/bank=simulated`) + settlement com vínculo em ledger; o gate usa sempre o artefato mais recente. |
| Evidência de replay/idempotência webhook billing | `ops/evidence/latest/billing-webhook-replay-YYYY-MM-DD.json` | Prova de replay rejeitado com `duplicateSideEffects=0`; o gate usa sempre o artefato mais recente. |
| Contrato público de settlement provider | `ops/contracts/settlement-provider-contract.v1.json` | Contrato versionado de endpoints/providers/status e política de assinatura/idempotência. |
| Runbook operacional de settlement provider | `docs/ops/settlement-provider-runbook.md` | Procedimento operacional para PaymentIntent, release gate, settlement e incidente de webhook. |
| Gate CI de drift contrato/implementação | `scripts/checkSettlementContractDrift.ts` | Falha CI em drift entre contrato publicado e runtime (`providers/endpoints`). |
| Evidência de execução do gate de drift | `ops/evidence/latest/settlement-contract-check-YYYY-MM-DD.md` | Resultado do check `pnpm check:settlement-contract-drift` com `ok=true`. |
| Gate CI de hardening econômico P3 | `scripts/checkP3EconomyHardening.ts` | Bloqueia regressão de invoice/settlement/webhook/disputa/reputação e vínculo `receipt -> ledger -> provider`. |
| Gate CI de estabilidade recorrente P3 | `scripts/checkP3StabilityRecurring.ts` | Exige, por padrão, 3 ciclos APE recentes com `hardMetricsGo=true`, `auditGap=0`, `duplicateSideEffects=0` e `breakGlass=0`. |
| Gate CI de recência de evidência P3 | `scripts/checkP3EvidenceRecency.ts` | Exige evidência econômica recente por pattern (`YYYY-MM-DD`) e falha fechado quando a trilha fica stale. |
| Gate CI de suporte por provider/ambiente | `scripts/checkP3SettlementSupportByEnv.ts` | Exige que a evidência mais recente de settlement respeite a matriz de suporte por ambiente. |

## Sprint P1 (Imobiliaria Digital) — Reputação + Disputas (2026-03-09)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Smoke de reputação por agente | `ops/evidence/latest/agent-reputation-smoke-2026-03-09.json` | Snapshot de reputação por `tenant/workspace/agent` com campos operacionais esperados. |
| Fluxo de atualização por eventos | `ops/evidence/latest/reputation-update-flow-YYYY-MM-DD.json` | Atualização idempotente por `receipt.finalized` e `dispute.closed` com journal de eventos; o gate usa sempre o artefato mais recente. |
| Evidência e2e do lifecycle de disputa | `ops/evidence/latest/dispute-lifecycle-e2e-YYYY-MM-DD.json` | Fluxo `open -> under_review -> resolved` com bloqueio de transição inválida e impacto na reputação; o gate usa sempre o artefato mais recente. |
| API de reputação/disputas | `apps/api/src/routes/billing.ts` | Endpoints de reputação e ciclo de disputa em escopo tenant/workspace. |
| Serviço core de reputação/disputas | `apps/api/src/services/reputationDisputes.ts` | Modelo operacional, regras de transição e idempotência de replay por `event_key`. |

### Trilha D (P3) — Foco Economy explícito (A2A/B2B)

- **Invoice**: cálculo e fechamento mensal por tenant/workspace como base financeira verificável.
- **Settlement**: execução por provider com contrato público e reconciliação operacional.
- **Webhook billing**: assinatura + proteção de replay + idempotência como requisito de produção.
- **Disputa + reputação**: ciclo de resolução com impacto verificável de confiança.
- **Vínculo canônico de prova econômica**: `run -> receipt -> ledger -> provider settlement`.
- **Objetivo A2A/B2B**: provar que cooperação entre agentes gera transação empresarial auditável, não apenas resposta de chat.

## Sprint P1 (Imobiliaria Digital) — Produto/Piloto (2026-03-09)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Ações críticas imobiliárias HIGH | `ops/evidence/latest/realestate-high-actions-e2e-2026-03-09.json` | Contrato/negociação com `tier=HIGH`, `txIdRequired=true` e receipt canon para ações imobiliárias críticas. |
| Command Center IMOB (funnel + blocked runs) | `ops/evidence/latest/realestate-command-center-smoke-2026-03-09.md` | Visualização operacional no Runs por workspace, filtros por risco/estado e export bundle/receipt por run. |
| Chat IMOB agentic E2E por planner/recipes | `ops/evidence/latest/imob-e2e-case-planner-smoke-2026-05-16.md` | Prova focada de recipeId, missão de temporada, supressão de CTAs resolvidas, `property.link_owner` e `case.review` como recuperação válida. |
| IMOB Lead Continuity P0 — fechamento operacional | `ops/evidence/latest/imob-lead-continuity-p0-2026-05-23.md` | Prova focada de `leadStatus`/`nextAction`, idempotência por `case.leadId`, continuidade sem reabrir pendência resolvida, compat layer sem copy contraditória e launcher IMOB `render-only` sem heurística local. |
| IMOB Orchestrator Mission Backbone P0 — fechamento operacional | `apps/api/src/services/imob/orchestrator/` + `apps/api/src/tests/imob-orchestrator-mission-e2e.test.ts` + `apps/api/src/tests/imob-orchestrator-recovery-e2e.test.ts` + `apps/api/src/tests/imob-orchestrator-concurrency-e2e.test.ts` + `apps/api/src/tests/imob-orchestrator-proof-e2e.test.ts` + `apps/web/src/components/agents/chatLauncherEngine.test.ts` | Backbone entregue com mission graph, case state, operation router, recovery resolver, CRM projection, `nextAction` única, `missionStatus`, proof por missão e suíte E2E scoped cobrindo concorrência, idempotência, recovery, proof e boundary do launcher. |
| IMOB Orchestrator PR7 — contract/commission/commercial slices | `apps/api/src/tests/prepare-contract-e2e.test.ts` + `apps/api/src/tests/commission-settlement-e2e.test.ts` + `apps/api/src/tests/commercial-activation-e2e.test.ts` + `apps/api/src/services/imob/orchestrator/imobMissionPolicy.ts` | Expansão P1/P2 cobre `prepare_contract`, `settle_commission` e `commercial_activation` no backbone canônico com `nextAction`, proof mínima, `missionStatus` governado e gates scoped sem depender de provider externo, outbound real ou publish real. |
| IMOB Market Scan P0 — no ID leak + policy judge | `ops/evidence/latest/imob-market-scan-p0-no-id-leak-policy-judge.md` | Evidência de que a saída visível do Market Scan não expõe IDs internos e que recomendação forte passa por `marketScanPolicyJudge` com `evidenceBundleId`. |
| IMOB Market Scan P1 — Source Data Quality Gate | `ops/evidence/latest/imob-market-scan-p1-source-data-quality-gate.md` | Evidência de fill-rate `price`/`areaM2`/`priceAreaM2`, status `pass/degraded/blocked`, bloqueio antes de scoring, penalidade de confiança e Guardian hash com qualidade de fonte. |
| Comissão integrada ao settlement | `ops/evidence/latest/realestate-commission-settlement-e2e-YYYY-MM-DD.json` | Fluxo comissão com PoU-gate, settlement e reconciliação com reprocessamento idempotente; o gate usa sempre o artefato mais recente. |
| Piloto comercial controlado | `ops/evidence/latest/realestate-pilot-rollout-2026-03-09.md` | Plano `shadow -> pilot -> small` com 3 tenants de referência para rollout da vertical. |
| Rotas IMOB Command Center | `apps/api/src/routes/imob.ts` | Endpoints determinísticos de funil/bloqueios para operação imobiliária. |

## Sprint P1 (Imobiliaria Digital) — W4 D5/D6 (2026-03-09)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Template multi-vertical reutilizável | `ops/verticals/template/vertical-template.md` | Padrão oficial para novos verticais (`IMOB/LEGAL/HEALTH`) sem regressão no core. |
| Checklist de onboarding por vertical | `ops/verticals/vertical-onboarding-checklist.md` | Sequência operacional para ativação, gating, evidência e economia por vertical. |
| KPI/gates de não-regressão | `ops/evidence/latest/w4-non-regression-kpis.json` | Métricas mínimas de W4 (`activation`, `first-run`, `receiptCoverage`, `crossTenantAuthFailures=0`). |
| Evidência D5 (template + checklist) | `ops/evidence/latest/w4-vertical-template-onboarding-2026-03-09.md` | Conclusão operacional de D5 com status `GO`. |
| Evidência APE final W4 | `ops/evidence/latest/ape-weekly-cycle-run9-2026-03-09.md` | Fechamento semanal com `hardMetricsGo=true` e `nonRegressionGo=true`. |
| Gate CI W4 | `scripts/checkW4NonRegression.ts` + `.github/workflows/ci.yml` | Validação automatizada obrigatória de D6 no pipeline. |

## Governança de agentes e DocOps (2026-03-16)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Gerador DocOps do registry de agentes | `scripts/generateAgentRegistryDocs.ts` | Deriva catálogo e exemplos diretamente do registry canônico para reduzir drift entre perfis, docs e evidências. |
| Catálogo de agentes derivado do registry | `docs/ops/agent-registry-catalog.md` | Snapshot documental dos agentes com modelo, `llmUsageMode`, resolução de conflito, fallback e fontes determinísticas declaradas. |
| Exemplos de resposta derivados do registry | `docs/ops/agent-response-examples.md` | Exemplos canônicos de resposta/grounding por agente sem depender de LLM externa. |
| Evidência gerada do DocOps de agentes | `ops/evidence/latest/agent-registry-docs-2026-03-16.json` | Evidência materializada da geração com contagem de agentes e fontes declaradas por perfil. |
| Cobertura comportamental de knowledge policy | `apps/api/src/tests/knowledge-policy.behavior.test.ts` | Testes por agente para `source missing`, `source conflict`, `grounded response` e `blocked response` no `KnowledgeGate`. |

## Assistentes de coding / Governança operacional

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Instruções comuns para assistentes de coding | `IA_EIAH.md` | Define a fonte operacional comum para Claude Code, Codex e assistentes equivalentes, incluindo leitura obrigatória do roadmap v8.1, regra agent-driven, fail-closed, formato final com agentes envolvidos, resumo de alterações e atualização do Evidence Index para evidências reais. |
| Ponte Claude Code | `CLAUDE.md` | Redireciona Claude Code para `IA_EIAH.md`, evita duplicação de regras e preserva a precedência das fontes normativas do projeto. |
| Ponte Codex IDE | `CODEX.md` | Redireciona Codex no VS Code/IDE para `IA_EIAH.md`, evita duplicação de regras e preserva a precedência das fontes normativas do projeto. |

## IMOB Data Hardening (2026-06-12)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Hardening de open handles nos contract tests HTTP IMOB/Interop | `ops/evidence/latest/imob-data-route-contract-hardening-2026-06-12.md` | Execução real com `EXIT:0` dos contract tests `shadow-executions`, `runs.imob-action` e `agents.interop`, além do hardening aplicado em Redis/BullMQ/Prisma e teardown de testes HTTP. |
| Mutation manual de ownerResponsible no CRM IMOB | `ops/evidence/latest/imob-owner-assignment-mutation-2026-06-13.md` | Execução real do teste focado da Trilha A, cobrindo `CASE_RESPONSIBLE_REQUIRED`, `assignOwnerToCase()` / `assignResponsibleActor()`, evento `owner_assigned` atômico e idempotência por `evidenceRef`. |

## IMOB Surface Data Reliability — 10/10 evidenciados (2026-06-15)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Evidencia de fechamento do alerta A1 | `docs/ops/evidence/latest/imob-surface-data-reliability/a1-ci-evidence.md` | Rótulos de contexto de janela adicionados ao CC (chip `Bloqueios recentes: X · 7d`, card `Bloqueios (7d)`), custo total (`${valor} (${kpiWindowDays}d)`) e Hero (`bloqueados atuais`); A1-follow-up concluido: `apiGetImobFunnelHealth` agora recebe `window: "7d"` explicitamente no frontend, eliminando risco de drift com default do backend; 9/9 testes pass. |
| Evidencia de fechamento do alerta A8 | `docs/ops/evidence/latest/imob-surface-data-reliability/a8-ci-evidence.md` | KPI strip de `properties.tsx` migrado de `syntheticProperties` para `apiListImobProperties()` com badge de fonte; 5/5 testes A8/A9 pass e 17/17 testes de nao-regressao da suite imob pass. Criterios: sem `syntheticProperties`, sem ID sintetico hardcoded, badge presente no KPI strip. |
| Evidencia de fechamento do alerta A4 | `docs/ops/evidence/latest/imob-surface-data-reliability/a4-ci-evidence.md` | Defense in depth para isolamento de workspace em `GET /imob/cases` e `GET /imob/cases/costs`; 6/6 testes pass contra banco de dados real (ausencia / match / mismatch para ambas as rotas). `workspaceId` da query e apenas checagem de consistencia; `authContext.workspaceId` e a unica fonte de verdade. Mismatch retorna 403 `WORKSPACE_SCOPE_MISMATCH` fail-closed. |
| Evidencia de fechamento do alerta A2 | `docs/ops/evidence/latest/imob-surface-data-reliability/a2-ci-evidence.md` | `syntheticThreads` removido de `dashboard.tsx`; `selectedThreadId` inicia `null` (nao URL param); `requestedThreadId` honrado somente quando confirmado na resposta real de `apiListImobChatThreads`; API vazia ou erro resulta em `threads = []` sem fallback sintetico; 9/9 testes pass. Criterios: sem `syntheticThreads`, sem `"synthetic"` no `threadSource`, `requestedThreadId` nao ativa selecao sem confirmacao real. |
| Evidencia de fechamento do alerta A3 | `docs/ops/evidence/latest/imob-surface-data-reliability/a3-ci-evidence.md` | Janela de custo por caso agora explícita na tabela do CC: prop `caseCostWindowDays?: number` (default 30) adicionado a `ImobCommandCenter`; `costLabel` passa a exibir `R$ X.XX (30d)` em cada linha; `dashboard.tsx` passa `caseCostWindowDays={30}` explicitamente. `apiListImobCaseCosts` mantido com `windowDays: 30` fixo — nenhum endpoint, query ou janela alterados; 8/8 testes pass. |
| Evidencia de fechamento do alerta A5 | `docs/ops/evidence/latest/imob-surface-data-reliability/a5-ci-evidence.md` | `syntheticPartners` removido de `partners.tsx`; estado inicial `partners = []`; API vazia → `source = "empty"`, erro → `source = "error"` (sem fallback sintetico em ambos); `delegateeId` removido da cadeia de fallback de `partnerName` — fallback passa a ser `"Parceiro sem nome cadastrado"`; badge de fonte distingue `"delegações marketplace"` / `"sem delegações"` / `"indisponível"`; `apiListDelegations` e `mapDelegationsToPartners` inalterados; 14/14 testes pass. |
| Evidencia de fechamento do alerta A6 | `docs/ops/evidence/latest/imob-surface-data-reliability/a6-ci-evidence.md` | `buildCasePriority` e `buildCaseFallbackActions` removidas de `dashboard.tsx` (page component); `buildImobCasePriority` exportada de `imobCommandCenterHelper.ts`; `buildImobCaseFallbackActions` adicionada e exportada do mesmo helper; `dashboard.tsx` importa ambas — sem lógica de negócio em page component; 10/10 testes pass. |
| Evidencia de fechamento do alerta A7 | `docs/ops/evidence/latest/imob-surface-data-reliability/a7-ci-evidence.md` | `contextCase` useMemo em `dashboard.tsx` refatorado para retornar `{ contextCase, contextCaseSource }` com tipo `"requested" \| "thread" \| "run" \| "heuristic" \| null`; card "Caso" na aba Soluções exibe `"estimado por contexto da thread"` quando `contextCaseSource === "heuristic"`; lógica de resolução e deeplinks inalterados; 11/11 testes pass. |
| Evidencia de fechamento do alerta A9 | `docs/ops/evidence/latest/imob-surface-data-reliability/a9-ci-evidence.md` | `syntheticProperties` removido de `properties.tsx`; página chama `apiListImobProperties()` real na montagem; badge de fonte no KPI strip (`"backend"` / `"sem dados"`); empty state semântico; IDs sintéticos `prop-001..prop-005` ausentes; 5/5 testes pass. |
| Evidencia de fechamento do alerta A10 | `docs/ops/evidence/latest/imob-surface-data-reliability/a10-ci-evidence.md` | KPI `"Casos em parceria"` → `"Políticas delegadas"` em `partners.tsx`; campo `activeCases` → `delegationPoliciesCount`; card `"processos ativos"` → `"políticas ativas"`; semântica alinhada a delegações marketplace, não a casos CRM; 14/14 testes pass (4 de A10 + 10 de A5). |

## Roadmap v8 — Verificacao contra codigo atual (2026-06-15)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Fonte canonica do roadmap v8 | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-05-23.md` | Define o escopo normativo de comparacao entre backlog v8, entregas previstas e frentes extras ja incorporadas no repositorio. |
| Checklist de execucao IMOB Data | `docs/ops/imob-data-pr-execution-checklist.md` | Consolida a trilha real de fechamento de `request.action`, duracao operacional, `ownerResponsible` e diagnosticos tenant-scoped apos o marco v8. |
| Trilha B runtime minimo multi-vertical | `docs/ops/imob-data-trilha-b-runtime-minimo-execution-checklist.md` | Registra o delta minimo executado para validacao de `responsible actor contract`, `reasonCode` de falha contratual e evidencias operacionais sem abrir migracao nova. |
| Arquivamento de runs IMOB | `docs/ops/imob-run-archive-pr-execution-checklist.md` + `apps/api/src/services/runArchiveService.ts` + `apps/api/src/workers/runArchiveWorker.ts` + `packages/db/prisma/schema.prisma` | Prova que a plataforma avancou alem do backlog normativo do v8 com persistencia/worker de `RunArchive` e modelo Prisma dedicado. |
| Funil/Team consolidado no dashboard IMOB | `docs/ops/imob-funnel-team-pr-execution-checklist.md` + `apps/web/src/features/imob/funnel/ImobFunnelTeamSection.tsx` + `apps/web/src/pages/app/imob/dashboard.tsx` | Prova consolidacao operacional da experiencia IMOB no frontend, removendo duplicacao de aba Equipe e aproximando a superficie real do comando/funil. |

## Fechamento arquitetural — Deduplicação Frontend (2026-04-15)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Módulos canônicos de helper/front | `apps/web/src/lib/formatters.ts` + `apps/web/src/lib/imobContext.ts` + `apps/web/src/lib/economyDerived.ts` + `apps/web/src/lib/reconciliation.ts` | Fonte canônica única para formatação, contexto IMOB, derivados econômicos e reconciliação nas páginas-alvo. |
| Guard rails de duplicação e runtime | `scripts/checkFrontendDuplication.ts` + `scripts/checkSelfServiceRuntimeGraph.ts` + `package.json` (`check:frontend-duplication`, `check:self-service-runtime-graph`) | Proteção ativa contra reintrodução de helpers locais e contra consumo runtime de `.js` no self-service. |
| Baseline final de convergência self-service | `artifacts/self-service-runtime-baseline.json` | Estado final convergido com `runtimeSelfServiceJsFiles=[]` e `duplicatePairCount=0`. |
| Resultado final da frente | `apps/web/src/pages/self-service/` | Self-service estruturalmente convergido: `runtime .js = 0` e `duplicate pairs = 0`. |
| Lotes de remoção A/B/C concluídos | `ops/evidence/latest/self-service-dedup-final-validation-2026-04-15.md` | Rastro consolidado de execução por lote (`components`, `leaf pages`, `config/index/router`) com validação final e atualização de baseline. |
| Ciclo final de validação executado (2026-04-15) | `ops/evidence/latest/self-service-dedup-final-validation-2026-04-15.md` | Execução final registrada dos comandos: `pnpm check:self-service-runtime-graph`, `pnpm check:frontend-duplication`, `pnpm --filter @eiah/web build`, `pnpm baseline:self-service-runtime-graph` (todos concluídos com sucesso; warning ES2024 permanece como passivo separado). |
| Institucionalização no fluxo de PR | `.github/workflows/ci.yml` + `.github/pull_request_template.md` + `apps/web/src/pages/self-service/index.tsx` | Checks `check:self-service-runtime-graph` e `check:frontend-duplication` exigidos no CI e checklist de merge para mudanças no self-service. |
| Nova frente separada para passivos remanescentes | `ops/evidence/latest/es2024-tsc-passivos-front-2026-04-15.md` | Escopo e DoD dedicados para warnings de target ES2024 e erros históricos de `tsc --noEmit`, fora da frente já encerrada. |

## Implementado extra (além do escopo normativo v8)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Compact UI global (85%) | `apps/web/src/App.tsx` + `apps/web/src/styles.css` | Ativação global da classe `compact-ui` e redução de escala visual sem alterar fluxo funcional. |
| Access unificado (Entrar/Cadastrar/Wallet) | `apps/web/src/pages/access.tsx` + `apps/api/src/routes/auth.ts` | Experiência unificada de acesso com login legado, provisionamento e autenticação por wallet. |
| Chat Launcher com histórico + nova conversa | `apps/web/src/components/agents/ChatAgentLauncher.tsx` | Histórico preservado por agente com ação explícita de nova conversa e estados de sessão. |
| Estado de processamento no chat | `apps/web/src/components/agents/ChatAgentLauncher.tsx` | Exibição de estado de processamento (`Pensando...`) durante geração de resposta. |
| Fallback contextual determinístico (unknown) | `apps/web/src/components/agents/ChatAgentLauncher.tsx` + `apps/web/src/hooks/useConversation.ts` | Resposta determinística para solicitações fora de escopo EIAH com proteção contra roteamento indevido. |
| Proposal assistant com cálculo guiado | `apps/web/src/components/agents/ChatAgentLauncher.tsx` + `apps/api/src/routes/billing.ts` | Coleta de contexto comercial e cálculo de proposta com regra de billing compatível ao backend. |
| Central de Ajuda (query/reindex/sessões) | `apps/api/src/routes/help.ts` + `apps/api/src/services/eiahHelpKnowledge.ts` + `packages/db/prisma/schema.prisma` | Base interna consultável, reindexação e persistência analítica de atendimentos (`helpdesk_sessions`). |
| IMOB chat ampliado (entrevista + telemetria + export) | `apps/api/src/routes/imob.ts` + `apps/web/src/pages/app/imob/chat.tsx` | Jornada assistida por thread com estado de entrevista, telemetria operacional e export auditável. |
| IMOB rules.configure + jornada de temporada | `apps/api/src/routes/imob.ts` + `apps/api/src/services/imob/imobConversationContract.ts` + `apps/api/src/services/imob/imobConversationState.ts` + `apps/api/src/services/imob/imobTurnResolver.ts` + `apps/api/src/tests/imob-turn-resolver.test.ts` | Fluxo stateful governado de regras de hospedagem com gate por `aluguel_por_temporada`, ação `realestate.configure_property_rules`, jornada canonical `temporada_rules` e retomada de draft. |
| IMOB leitura comercial de pipeline, bloqueios e próxima ação | `apps/api/src/routes/imob.ts` + `apps/api/src/services/imob/imobIntentCatalog.ts` + `apps/api/src/tests/imob-intent-catalog.test.ts` | Intents e builders `pipeline_status`, `blocked_run_resolution` e `next_best_action` para leitura de jornada, pendências, bloqueios e próximo passo usando canonical case sem criar regra no launcher. |
| Track P — IMOB Knowledge Search (implementado parcial / fase 1) | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-05-23.md` + `ops/verticals/vertical-onboarding-checklist.md` + `apps/api/src/routes/imob.ts` + `apps/api/src/services/imob/imobTurnResolver.ts` + `apps/api/src/services/imob/imobConversationContract.ts` | Busca documental IMOB já tem handshake agent-driven e modo `search_knowledge` no contrato/runtime, com gating por tenant/assinatura e evolução futura por `sourceType` sem regressão no core. |
| Hardening estrutural do chat agent-driven | `apps/web/src/components/agents/chatLauncherEngine.ts` + `apps/web/src/components/agents/proposalDomainResolver.ts` + `apps/web/src/components/agents/imobContextResolver.ts` + `apps/web/src/components/agents/legalContextResolver.ts` + `apps/web/src/components/agents/specialistExplainCatalog.ts` + `apps/web/src/components/agents/specialistGuidanceResolver.ts` + `apps/web/src/components/agents/specialistDecisionResolver.ts` + `apps/web/src/components/agents/platformHelpResolver.ts` + `apps/web/src/components/agents/agentPresentationResolver.ts` | Modularização do runtime do chat por domínio/papel, mantendo o `ChatAgentLauncher` em modo `render-first`. |
| Hardening do help EIAH no Chat Launcher (2026-06-01) | `ops/evidence/latest/chat-launcher-help-priority-2026-06-01.md` | Evidência da frente de fechamento de quick replies, precedência explícita de intents, fallback tipado, filtro de chips inválidos e uso mínimo de `conversationState` no runtime do EIAH. |
| Registry unificado de help do EIAH (2026-06-02) | `apps/web/src/components/agents/helpDictionary.ts` + `apps/web/src/components/agents/helpDictionary.global.ts` + `apps/web/src/components/agents/helpDictionary.pages.ts` + `apps/web/src/components/agents/helpDictionary.verticals.ts` + `apps/web/src/components/agents/helpDictionaryResolver.ts` + `apps/web/src/components/agents/helpDictionaryResolver.test.ts` + `ops/evidence/latest/help-dictionary-unified-registry-2026-06-02.md` | Fundação tipada do registry declarativo, resolvedor único com precedência `page > vertical > global`, integração conservadora no `engine` e cobertura inicial sem mudança de layout/UI. |
| Self-service workspace recipe visibility (2026-06-02) | `apps/api/src/routes/tenant-recipes.ts` + `apps/api/src/routes/tenantRecipeWorkspaceSelection.ts` + `apps/api/src/tests/tenant-recipe-workspace-selection.test.ts` + `ops/evidence/latest/self-service-workspace-recipe-visibility-2026-06-02.md` | Correção localizada da listagem `view=workspace` para usar o workspace explicitamente pedido pela sessão do frontend, com validação por tenant e fallback seguro para o workspace do token. |
| Self-service recipe instructions collapse (2026-06-02) | `apps/web/src/pages/self-service/index.tsx` + `ops/evidence/latest/self-service-recipe-instructions-collapse-2026-06-02.md` | Colapso visual de instruções longas nos cards de recipes do workspace, com toggle explícito de expansão/retração e sem regressão de runtime/duplicação. |
| Self-service recipe prefill (2026-06-02) | `apps/web/src/pages/self-service/router.tsx` + `apps/web/src/pages/self-service/generic.tsx` + `apps/web/src/pages/self-service/recipePrefill.ts` + `apps/web/src/pages/self-service/recipePrefill.test.ts` + `ops/evidence/latest/self-service-recipe-prefill-2026-06-02.md` | Recipes homologadas passam a abrir o formulário do agente com `recipeId`, bloco de recipe vinculada e prefill heurístico dos campos para continuidade operacional real. |
| Self-service guardian knowledge gate (2026-06-02) | `apps/web/src/pages/self-service/components/AgentFormShell.tsx` + `apps/web/src/pages/self-service/components/RunStatusCard.tsx` + `apps/web/src/pages/self-service/components/runErrorSummary.ts` + `ops/evidence/latest/self-service-guardian-knowledge-gate-2026-06-02.md` | O self-service passa a enviar `executionInput` canônico para a knowledge gate do backend e exibe mensagem operacional explícita quando o Guardian bloqueia a execução por falta de fontes obrigatórias. |
| Trust score engine Prisma key fix (2026-06-02) | `apps/api/src/services/trustScoreEngine.ts` + `apps/api/src/tests/trust-score-engine.test.ts` + `ops/evidence/latest/trust-score-engine-prisma-key-fix-2026-06-02.md` | Alinha o `trustScoreEngine` à chave única composta `unique_trustscore_agent` do schema Prisma, removendo o erro de `Unknown argument tenantId_workspaceId_agentId` observado após runs do Guardian. |
| Run events Redis outbox readiness (2026-06-02) | `apps/api/src/services/runEvents.ts` + `apps/api/src/services/runEventOutbox.ts` + `apps/api/src/services/runEventsRedisTransport.ts` + `apps/api/src/tests/run-events-redis-transport.test.ts` + `ops/evidence/latest/run-events-redis-outbox-readiness-2026-06-02.md` | Garante readiness do client Redis antes de `xadd/publish` no transporte de eventos de run, reduzindo o erro `Stream isn't writeable` após boot/reconnect sem quebrar o fluxo local de eventos. |
| Guardian tools + checklist por etapa (2026-06-02) | `packages/core/src/actions/guardian.ts` + `packages/core/src/actions/guardianChecklistTools.ts` + `apps/api/src/workers/guardianPlanManager.ts` + `apps/api/src/workers/runWorker.ts` + `apps/web/src/components/runs/RunViewer.tsx` + `apps/web/src/pages/self-service/config.ts` + `ops/evidence/latest/guardian-tools-and-checklist-steps-2026-06-02.md` | O Guardian passa a executar checks reais de runtime/artefatos/policy para a rota de go-live controlado, usa plano específico por etapa, expõe os resultados no viewer e aproxima a execução das instruções da recipe. |
| Cobertura e gate de regressão do chat | `apps/web/src/components/agents/chatLauncherEngine.test.ts` + `.github/workflows/ci.yml` | Cobertura determinística de proposal/help/IMOB/atalhos com gate obrigatório `ChatEngineRegression` no `CI Monorepo`. |

### Implemented Extra (pronto para PR/changelog)

- **UX compacta global** (`apps/web/src/App.tsx`, `apps/web/src/styles.css`): redução de escala visual sem quebrar responsividade.
- **EIAH Access unificado** (`apps/web/src/pages/access.tsx`, `apps/api/src/routes/auth.ts`): modos `Entrar/Cadastrar/Wallet` no mesmo fluxo.
- **Chat Launcher operacional** (`apps/web/src/components/agents/ChatAgentLauncher.tsx`): histórico por agente, `Nova conversa`, texto dinâmico e estado `Pensando...`.
- **Privacidade no UI** (`apps/web/src/pages/app/agents/index.tsx`, `apps/web/src/components/agents/ChatAgentLauncher.tsx`): remoção de metadados internos visíveis na interface.
- **Fallback determinístico para unknown** (`apps/web/src/hooks/useConversation.ts`, `apps/web/src/components/agents/ChatAgentLauncher.tsx`): proteção contra roteamento indevido fora de escopo.
- **Proposal assistant** (`apps/web/src/components/agents/ChatAgentLauncher.tsx`, `apps/api/src/routes/billing.ts`): coleta guiada comercial e cálculo coerente com billing real.
- **Playbook expandido por página** (`apps/web/src/pages/app/agents/index.tsx`, `apps/web/src/assets/playbook/`): guia operacional em linguagem humana.
- **Central de Ajuda EIAH** (`apps/api/src/routes/help.ts`, `apps/api/src/services/eiahHelpKnowledge.ts`, `packages/db/prisma/schema.prisma`): query/reindex + sessões analíticas.
- **IMOB ampliado** (`apps/api/src/routes/imob.ts`, `apps/web/src/pages/app/imob/chat.tsx`, `apps/web/src/features/imob/`): entrevista de contrato, telemetria e export auditável.
- **Track P — IMOB Knowledge Search (implementado parcial / fase 1)** (`ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-05-23.md`, `ops/verticals/vertical-onboarding-checklist.md`, `apps/api/src/routes/imob.ts`, `apps/api/src/services/imob/imobTurnResolver.ts`, `apps/api/src/services/imob/imobConversationContract.ts`): busca documental in-chat já possui handshake agent-driven e modo `search_knowledge`, com gating por `tenant/workspace` + assinatura ativa e evolução futura por `sourceType`.
- **P2 global HIGH coverage** (`scripts/checkP2HighGlobalCoverage.ts`, `ops/evidence/latest/p2-high-global-coverage.json`, `packages/core/src/actions/__tests__/highGlobalCoverage.e2e.test.ts`): transição de “inventariado” para “covered” com gate bloqueante.
- **Chat agent-driven hardening** (`apps/web/src/components/agents/chatLauncherEngine.ts`, `apps/web/src/components/agents/proposalDomainResolver.ts`, `apps/web/src/components/agents/imobContextResolver.ts`, `apps/web/src/components/agents/legalContextResolver.ts`, `apps/web/src/components/agents/specialistGuidanceResolver.ts`, `apps/web/src/components/agents/specialistDecisionResolver.ts`, `apps/web/src/components/agents/platformHelpResolver.ts`, `apps/web/src/components/agents/agentPresentationResolver.ts`, `apps/web/src/components/agents/chatLauncherEngine.test.ts`, `.github/workflows/ci.yml`): engine modularizado por domínio/papel com cobertura de regressão e gate de CI.

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
| Endpoint de aprovação humana (`/runs/:id/approve`) | `rg -n "runs/:id/approve|approve" apps packages` | ENCONTRADO: `apps/api/src/routes/runs.ts:722-775` |
| Campos Run.approval_status/approvedBy | `rg -n "approval_status|approvedBy" packages/db` | ENCONTRADO: `packages/db/prisma/schema.prisma:197-198` |
| Endpoint público `/ledger/:txId` | `rg -n "/ledger/:txId|ledger/:txId" apps packages` | ENCONTRADO: `apps/api/src/routes/governance.ts:222` |
| TrustScoreToken / tokenização de reputação | `rg -n "TrustScoreToken|reputação|tokenização" apps packages` | ENCONTRADO apenas em `apps/api/backup-20251031-103132.sql` (texto de backup, não implementação) |

## Status do Roadmap (consolidado por evidência)

| Item | Evidências | Status (no repo) | Divergência com Roadmap |
| --- | --- | --- | --- |
| Fase 4 — Gate pré‑execução (SCL obrigatório) | `apps/workers/action-runner/src/index.ts:841-919` | Implementado | Compatível (Roadmap v8: ✅ concluída) |
| Fase 4 — Resiliência do Signer | `packages/core/src/security/signerManager.ts:225-269` | Implementado | Compatível (Roadmap v8: ✅ concluída) |
| Fase 4 — Reconciliação Guardrail ↔ SCL | `apps/workers/maintenance-worker/src/index.ts:286-383` + `packages/core/src/services/reconcileLedgerService.ts:15-233` | Implementado | Compatível (Roadmap v8: ✅ concluída) |
| Fase 5.0 — Marketplace (catálogo + delegações) | `packages/db/prisma/schema.prisma:564-604` + `apps/api/src/routes/marketplace.ts:7-212` + `apps/web/src/pages/self-service/index.tsx:51-227` | Implementado (core) | Compatível (Roadmap v8: ✅ core concluído; UX avançada ainda pendente) |
| Fase 5.0 — “UX de delegação avançada” | **NÃO ENCONTRADO** (`rg -n "delegation advanced|delegacao avancada|delegação avançada|advanced delegation"`) | Não evidenciado | Compatível (Roadmap v8: fechamento de UX/auditoria avançada ainda pendente) |
| Fase 5.1 — PoU (modelo + serviço + pipeline + eventos) | `packages/db/prisma/schema.prisma:520-547` + `apps/api/src/services/pouService.ts:1-220` + `apps/workers/action-runner/src/index.ts:841-1314` + `packages/contracts/src/runEvent.schema.json:16-46` | Implementado | Compatível (Roadmap v8: ✅ operacional; manter hardening recorrente) |
| Fase 5.1 — Trust Gate (score + gate) | `apps/api/src/services/trustScore.ts:21-129` + `apps/workers/action-runner/src/index.ts:189-233` | Implementado | Compatível (Roadmap v8: ✅ operacional; manter hardening recorrente) |

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

## Atualizações 2026-06-09

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Self-service UX — 3 ondas (catálogo filtrável, spinner incremental, persistência NeedMoreInfo) | `ops/evidence/latest/self-service-ux-improvements-2026-06-09.md` | Onda 1: `domain`/`exampleOutput` nos 14 agentes + filtro por domínio/texto no catálogo. Onda 2: spinner com label de evento real, sentinel de conclusão 3 s, botão Reexecutar com valores do run anterior. Onda 3: sessionStorage TTL-30 min no `NeedMoreInfoDialog`, banner de restauração, aviso de contexto stale no reexecutar, diff visual shadow vs real. |

## Atualizações 2026-06-02

- `ops/evidence/latest/guardian-run-hardening-and-export-alignment-2026-06-02.md`
  - hardening do worker para bloquear `success` em saída truncada (`finish_reason === "length"`)
  - deduplicação do prefill de recipes do `guardian` no self-service
  - alinhamento do export/preview para ignorar artefatos genéricos de `runAtivoUniversal` incompatíveis com runs do `guardian`
- `ops/evidence/latest/guardian-run-viewer-and-payload-cleanup-2026-06-02.md`
  - remoção do resumo genérico de campanha no viewer do `guardian`
  - cleanup de redundância entre `metadata.form`, `executionInput` e `rawPayload`
  - correção da exibição de `exploracao_pct`
  - apresentação do contexto/evidências do `guardian` como checklist probatório
- `ops/evidence/latest/guardian-export-and-score-alignment-2026-06-02.md`
  - export HTML/PDF do `guardian` alinhado a contexto probatório, sem fallback de pitch/campaign
  - unificação da origem de `diagnóstico`
  - remoção de badge redundante de delta/score nulo
- `ops/evidence/latest/guardian-prompt-compaction-2026-06-02.md`
  - compactação de `notes` no prefill do `guardian`
  - prompt do `guardian` reduzido e com pedido de output mais curto
  - orientação operacional sobre bytes estimados versus tokens reais
- `ops/evidence/latest/guardian-core-action-proxy-fallback-2026-06-02.md`
  - fallback local para actions core do `guardian` quando `MCP_PROXY_ALL_ACTIONS` está ativo
  - preservação do proxy MCP para tools externas com `ToolContract`
  - correção do erro `ToolContract missing: guardian.checkRuntimeHealth@1.0.0`

## CC → Chat IMOB — Despacho por actionId (2026-06-16)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Fase 1 — Transporte de contexto CC→Chat | `apps/web/src/features/imob/imobCommandCenterHelper.ts` + `apps/web/src/features/imob/ImobCommandCenter.tsx` + `apps/web/src/features/imob/imobApiClient.ts` + `apps/web/src/lib/api.ts` + `apps/web/src/pages/app/imob/chat.tsx` + `apps/web/src/features/imob/imobCommandCenterPhase1.test.ts` | CTA "consultar no chat" com `actionId`/`reasonCode`/`status` na URL; `ImobCommandCenterCaseRow` expandido com `recommendedActions[]`; badge "consulta — não altera estado" no `mode=consult`; 5/5 testes passando. |
| Fase 2 — Dispatcher backend valida actionId | `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` + `apps/api/src/routes/imob.ts` + `apps/api/src/tests/imob-crm-action-dispatcher.test.ts` | Artefato: `docs/ops/evidence/latest/imob-cc-chat-resolution/phase2-action-dispatch.md`. Função pura `resolveImobCrmActionDispatch`: valida `actionId` vs `canonical.recommendedActions`, mapeia 11 actionIds operacionais para `executionRequest`, retorna null para consultivos (fall-through ao engine), retorna `mode=blocked` para inválidos; proteção cross-workspace; 16/16 testes unitários passando. |
| Fase 3 — Confirmação explícita antes de apiAgentsExecute | `apps/web/src/features/imob/imobChatDirectedAction.ts` + `apps/web/src/pages/app/imob/chat.tsx` + `apps/web/src/features/imob/imobChatPhase3DirectedAction.test.ts` | Artefato: `docs/ops/evidence/latest/imob-cc-chat-resolution/phase3-chat-confirmation.md`. `shouldUseDirectedActionFlow` gate; `prepareDirectedActionExecution` aguarda confirmação sem chamar `apiAgentsExecute`; badge "ação direcionada — aguardando confirmação"; guard `directedConfirmingRef` contra double-click; `source: "command-center"` no metadata via `buildAgentsExecuteMetadata`; 12/12 testes passando; nenhum erro TS novo. DoD Fase 4 documentado (não implementado). |
| Phase 4.0 — Action Contract & Handler Alignment | `apps/api/src/routes/agents.ts` + `apps/api/src/services/imob/crm/imobCrmActionDispatcher.ts` + `apps/api/src/services/imob/control/imobRunActionCatalog.ts` + `apps/api/src/actions/realestateActions.ts` + `apps/api/src/actions/tenantActionRegistry.ts` + `apps/api/src/tests/imob-realestate-action-contracts-11.test.ts` | Artefatos: `phase4-0-contract-handler-alignment.md` + `phase4-worker-option-c-decision.md`. B1 resolvido: 5 contratos novos (activate_listing/qualify_lead/schedule_visit/collect_documents/review_deal) → 9/9 ACTION_CONTRACTS, 11/11 actionIds cobertos. B2 resolvido: stubs fail-closed explícitos `registerRealestateActions()` com reasonCode HANDLER_PENDING_PHASE_4_3. B5 resolvido: `listing.activate → realestate.activate_listing` (não apply_adjustment); apply_adjustment permanece financeiro. Decisão: Opção C (ImobPostRunMutationWorker) escolhida; Opção B descartada. 5/5 suítes de testes passando; zero erros TS novos; sem mutation de ImobCase.status; sem PATCH. Bloqueadores restantes: B3 (mutation pós-run) e B4 (canonical recalculation) — pendentes Fase 4.1/4.2. |
| Phase 4.1 Pré-flight (worker) | `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-1-worker-preflight.md` | Investigação técnica pura (sem alteração de código). Confirma: `Run.caseId` propagado via `executionInput.caseId`; `Run.request.metadata.executionInput.actionId` preservado; `ImobCrmMutationService.updateCase` pronto; BullMQ pattern estabelecido. Identifica 4 bloqueadores: P1 (decisão de produto ausente), P2 (buildImobCanonicalCase não exportada), P3 (execução simulada emite success), P4 (fila durável ausente). Veredicto: NO-GO. |
| Phase 4.1a — Product Outcome Matrix | `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-1a-product-outcome-matrix.md` | Resolve P1 (decisão de produto). 11/11 actionIds com outcome completo: status resultante, stage, nextStep, pendingItems removidos/adicionados, blockers, reasonCodes, failure_behavior, simulated_behavior, economy impact, receipt/bundle. Decisões registradas: commission.settle é único terminal; visit.schedule e documents.* produzem pending_data; flow não é alterado pelo worker; simulated nunca muta. DoD Phase 4.1b documentado (P2/P3/P4). GO para implementar 4.1b. |
| Phase 4.1b — Worker Foundation | `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-1b-worker-foundation.md` | Resolve P2/P3/P4. P2: `buildImobCanonicalCase` + tipos canonicais extraídos de `routes/imob.ts` para `services/imob/imobCanonical.ts`; `routes/imob.ts` atualizado com import. P3: `shouldSkipImobPostRunMutationForSimulatedOutput(run)` — guard puro; retorna `true` se qualquer `outputs[].data.simulated === true`. P4: `apps/api/src/queues/imobRunCompletedQueue.ts` — BullMQ, payload={runId,tenantId,workspaceId,caseId,actionId,eventRunId,receiptPath?,bundlePath?}, jobId idempotente por runId. Testes: 17/17 pass (5 suítes). Regressão Phase 4.0: 34/34 inalterado. Sem mutation real. GO para Fase 4.1c após novo pré-flight. |
| Phase 4.1c — ImobPostRunMutationWorker real | `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-1c-worker-mutation.md` | Resolve P5 + implementação completa do worker. P5: `IMOB_DISPATCHER_ACTION_IDS` exportado de `imobCrmActionDispatcher.ts`; `runWorker.ts` enfileira condicionalmente após `enqueueRunAtivoUniversal` usando `baseMetadata.executionInput.{caseId,actionId}`. Worker: `apps/api/src/workers/imobPostRunMutationWorker.ts` — `IMOB_RUN_OUTCOME_MAP` (11 actionIds, Phase 4.1a matrix), 10 guards ordenados (campos, canonicidade, outcome, run.status, simulated, txId, idempotência DB, case exists, ownerResponsible, commission.settle), `ImobCrmMutationService.updateCase`, canonical recalculation via `buildImobCanonicalCase`, receipt/bundle derivados de `run.txId`/`run.id`. Registrado em `index.ts` junto a `startRunArchiveWorker`. Invariantes: `ImobCase.status` decidido exclusivamente no backend; React sem regra de status. Testes: 10/10 suítes pass (T1-T10, 21 assertions). Sem erros TS novos. |
| Phase 4.2 — E2E integrado CC→Run→Worker→ImobCase | `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-2-e2e-worker-resolution.md` | Prova integrada da cadeia completa contra banco de dados real. 8 cenários E2E, 9/9 testes passando. Arquivo: `apps/api/src/tests/imob-post-run-mutation-e2e.test.ts`. Confirmados com IDs reais: E2E-01 happy path (owner.register → stage=property_collecting, status=ready_for_review, receiptPath=/api/ledger/tx-*, dossier API 200 OK com canonical=property_capture); E2E-02 idempotência (already_processed_skip, 1 evento no DB); E2E-03 simulated=true → skipped_simulated_run, case inalterado; E2E-04 run.status=error → run_not_success_skip, case inalterado; E2E-05 cross-workspace → run_not_found, case inalterado; E2E-06 commission.settle → stage=done, status=done, pendingItems=[], blockers=[], case.completed terminal event, dossier API 200 OK; E2E-07 lead.qualify sem txId → mutado (requiresTxId=false); E2E-08 owner.register sem txId → receipt_required_no_tx_id, case inalterado. Invariantes I1–I7 todos provados por banco real. Marco: Fase 4 completa — CC→Chat→confirmação→run→worker→mutation governada→canonical→CC refresh. |
| Phase 4 Final Summary — Marco consolidado Fases 1–4.2 | `docs/ops/evidence/latest/imob-cc-chat-resolution/phase4-final-summary.md` | Índice completo de todas as evidências Fases 1–4.2, cadeia validada, 10 invariantes operacionais com provas por cenário, 5 recomendações de hardening (regressão, métricas, alertas, docs de produto, demo), texto de marco para roadmap/changelog. Cadeia: CC→Chat→confirmação→run→worker→mutation governada→canonical→CC refresh — evidenciada em E2E contra banco real. |
| IMOB Worker Observability — Kickoff (proposta) | `docs/ops/evidence/latest/imob-worker-observability/frente-kickoff.md` | Nova frente aberta após encerramento da CC→Chat (Fases 1–4.2). Sem alteração de fluxo funcional. Escopo H1–H5: H1 métricas do worker (counters por reason code), H2 alertas de fila (3+ regras staging), H3 E2E IMOB em CI como gate de merge, H4 monitor de skip/blocked reasons para oncall, H5 demo final gravada. Sequência recomendada: H3→H1→H2→H4→H5. DoD por item definido. Classificação: PROPOSTA (sem implementação iniciada). |
| H3 — CI Regression Gate (IMOB Worker Mutation E2E) | `docs/ops/evidence/latest/imob-worker-observability/h3-ci-regression-gate.md` | Gate CI ativo para E2E-01..E2E-08. Arquivos: `imob-post-run-mutation-e2e.test.ts` (close BullMQ queue no after hook — resolve exit hang), `package.json` script `test:imob-worker:e2e`, `.github/workflows/imob-worker-e2e.yml` (postgres:16 + redis:7 services, migrate:deploy, timeout 5min). 9/9 testes passando localmente com exit limpo. PR bloqueado se qualquer E2E falhar. Nenhum código funcional alterado. |
| H1 — ImobWorkerMetrics (counters in-memory) | `docs/ops/evidence/latest/imob-worker-observability/h1-worker-metrics.md` | Counters in-memory puros para ImobPostRunMutationWorker. Novo módulo `imobWorkerMetrics.ts`: `incrementCounter`, `getCounterSnapshot`, `renderCountersAsPrometheusText`, `resetCountersForTesting`. 4 counters: `imob_run_completed_jobs_total{actionId}`, `imob_post_run_mutations_applied_total{actionId,terminal,requiresTxId}`, `imob_post_run_skips_total{actionId,reason}` (12 reason codes), `imob_post_run_failures_total{reason}`. 12 pontos de incremento no worker. Exposto em `/metrics-prom`. Zero PII em labels (T-M6 confirmado). 13/13 testes passando (7 suítes T-M1..T-M7). E2E H3 reconfirmado 9/9. |
| H2 — ImobWorkerAlerts (regras de alerta puras) | `docs/ops/evidence/latest/imob-worker-observability/h2-worker-alerts.md` | Módulo `imobWorkerAlerts.ts` com 7 regras: IMOB-W-001 (ERROR: job_permanently_failed > 0), IMOB-W-002 (ERROR: receipt_required_no_tx_id > 0 = audit gap HIGH), IMOB-W-003 (WARNING: simulated em produção), IMOB-W-004 (WARNING: duplicate rate > 30%), IMOB-W-005 (WARNING: run_not_success rate > 20%), IMOB-W-006 (ERROR: job_error rate > 5%), IMOB-W-007 (WARNING: queue stall por janela de 5 min). `evaluateImobWorkerAlerts` snapshot-based + `evaluateImobWorkerStall` delta-based. Thresholds configuráveis via `AlertConfig`. Zero PII em AlertEvent (T-A5 confirmado). Sem false positives em snapshot vazio (T-A6). 21/21 testes passando (8 suítes T-A1..T-A8). |
| H4 — Runbook e Skip Reason Monitor | `docs/ops/evidence/latest/imob-worker-observability/h4-skip-reason-monitor.md` | Runbook operacional `docs/ops/runbooks/imob-worker-observability.md`: cadeia CC→Chat→run→worker→case; tabela 7 ruleIds (IMOB-W-001..IMOB-W-007) com severidade, causa, investigação, mitigação, escalonamento, evidência pós-incidente; queries seguras sem PII; política de PII. Monitor `h4-skip-reason-monitor.md`: todos os reasonCodes cobertos (alertáveis + silenciosos), thresholds de DEFAULT_ALERT_CONFIG, owner operacional por regra, links para runbook. Teste `imob-worker-h4-runbook.test.ts`: T-R1..T-R5 (25 assertions em 5 suítes): todos os 7 ruleIds presentes em ambos documentos; sem TODO/FIXME; sem tokens PII; severidades conferem com DEFAULT_ALERT_CONFIG. 25/25 testes passando. Nenhum código funcional alterado. |
| H1 — Fix teardown do metrics test | `apps/api/src/tests/imob-worker-metrics.test.ts` | `pnpm test:imob-worker:metrics` pendurava indefinidamente. Causa raiz: `@repo/db` cria `pg.Pool` no module-level que mantém timers internos mesmo sem queries abertas. Fix 1: adicionado `after()` hook com `imobRunCompletedQueue.close()` + `closePrismaResources()`. Fix 2: script `test:imob-worker:metrics` em `package.json` adicionado `--test-force-exit` (Node.js 22). Agora 14/14 pass com exit limpo. Padrão documentado: qualquer teste que importe `imobPostRunMutationWorker.ts` precisa fechar `imobRunCompletedQueue` e `prismaResources` no teardown. |
| H5 — Demo Final & Validação Recorrente | `docs/ops/evidence/latest/imob-worker-observability/h5-final-demo-validation.md` | Encerramento da frente IMOB Worker Observability & Regression Gates. Roteiro reproduzível em 4 passos: E2E worker (9/9), observability suite H1+H2+H4 (14+21+25=60/60), verificação de /metrics-prom, avaliação manual de alertas. Script agregador `pnpm test:imob-worker:observability` (H1+H2+H4). Total: 69/69 testes passando. Checklist de encerramento: todos os 5 itens H1–H5 evidenciados. Zero alterações no fluxo funcional (outcome map, guards, React/Chat, MutationService inalterados). Frente ENCERRADA/EVIDENCIADA. |
