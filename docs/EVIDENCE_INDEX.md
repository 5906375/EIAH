# EVIDENCE INDEX — EIAH

> Roadmap atual (fonte da verdade): `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-21.md` 

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
| Endpoint de origem | `apps/api/src/routes/governance.ts:414` | Endpoint público `/api/ledger/:txId` com `receiptCanon` aditivo. |
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
| APE Weekly Cycle #22 (janela recorrente automatizada) | `ops/evidence/latest/ape-weekly-cycle-run22-2026-04-27.md` | Ciclo semanal automatizado registrando o estado atual dos gates recorrentes para acompanhamento operacional. |

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
| Evidência de schema e rotas PaymentIntent | `ops/evidence/latest/payment-intent-schema-2026-03-19.json` | Prova da camada `PaymentIntent` com campos mínimos e índices operacionais. |
| Evidência e2e de PoU-gated payment release | `ops/evidence/latest/pou-gated-payment-e2e-2026-03-19.json` | Prova da bifurcação `blocked` sem PoU/SCL e `released` com PoU/SCL válido. |
| Evidência e2e de settlement providers | `ops/evidence/latest/settlement-provider-e2e-2026-03-19.json` | Prova de providers em modo suportado por ambiente (`stripe=full`, `crypto/bank=simulated`) + settlement com vínculo em ledger. |
| Evidência de replay/idempotência webhook billing | `ops/evidence/latest/billing-webhook-replay-2026-03-19.json` | Prova de replay rejeitado com `duplicateSideEffects=0`. |
| Contrato público de settlement provider | `ops/contracts/settlement-provider-contract.v1.json` | Contrato versionado de endpoints/providers/status e política de assinatura/idempotência. |
| Runbook operacional de settlement provider | `docs/ops/settlement-provider-runbook.md` | Procedimento operacional para PaymentIntent, release gate, settlement e incidente de webhook. |
| Gate CI de drift contrato/implementação | `scripts/checkSettlementContractDrift.ts` | Falha CI em drift entre contrato publicado e runtime (`providers/endpoints`). |
| Evidência de execução do gate de drift | `ops/evidence/latest/settlement-contract-check-2026-03-09.md` | Resultado do check `pnpm check:settlement-contract-drift` com `ok=true`. |
| Gate CI de hardening econômico P3 | `scripts/checkP3EconomyHardening.ts` | Bloqueia regressão de invoice/settlement/webhook/disputa/reputação e vínculo `receipt -> ledger -> provider`. |
| Gate CI de estabilidade recorrente P3 | `scripts/checkP3StabilityRecurring.ts` | Exige, por padrão, 3 ciclos APE recentes com `hardMetricsGo=true`, `auditGap=0`, `duplicateSideEffects=0` e `breakGlass=0`. |

## Sprint P1 (Imobiliaria Digital) — Reputação + Disputas (2026-03-09)

| Assunto | Arquivo | O que prova |
| --- | --- | --- |
| Smoke de reputação por agente | `ops/evidence/latest/agent-reputation-smoke-2026-03-09.json` | Snapshot de reputação por `tenant/workspace/agent` com campos operacionais esperados. |
| Fluxo de atualização por eventos | `ops/evidence/latest/reputation-update-flow-2026-03-19.json` | Atualização idempotente por `receipt.finalized` e `dispute.closed` com journal de eventos. |
| Evidência e2e do lifecycle de disputa | `ops/evidence/latest/dispute-lifecycle-e2e-2026-03-19.json` | Fluxo `open -> under_review -> resolved` com bloqueio de transição inválida e impacto na reputação. |
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
| Comissão integrada ao settlement | `ops/evidence/latest/realestate-commission-settlement-e2e-2026-03-19.json` | Fluxo comissão com PoU-gate, settlement e reconciliação com reprocessamento idempotente. |
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
| Track P — IMOB Knowledge Search (normativo) | `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-21.md` + `ops/verticals/vertical-onboarding-checklist.md` + `apps/api/src/routes/imob.ts` + `apps/api/src/services/imob/imobTurnResolver.ts` | Frente explícita de busca documental in-chat para a vertical IMOB, com roteamento agent-driven, gating por tenant/assinatura e evolução por `sourceType` sem regressão no core. |
| Hardening estrutural do chat agent-driven | `apps/web/src/components/agents/chatLauncherEngine.ts` + `apps/web/src/components/agents/proposalDomainResolver.ts` + `apps/web/src/components/agents/imobContextResolver.ts` + `apps/web/src/components/agents/legalContextResolver.ts` + `apps/web/src/components/agents/specialistExplainCatalog.ts` + `apps/web/src/components/agents/specialistGuidanceResolver.ts` + `apps/web/src/components/agents/specialistDecisionResolver.ts` + `apps/web/src/components/agents/platformHelpResolver.ts` + `apps/web/src/components/agents/agentPresentationResolver.ts` | Modularização do runtime do chat por domínio/papel, mantendo o `ChatAgentLauncher` em modo `render-first`. |
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
- **Track P — IMOB Knowledge Search (normativo)** (`ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-21.md`, `ops/verticals/vertical-onboarding-checklist.md`, `apps/api/src/routes/imob.ts`, `apps/api/src/services/imob/imobTurnResolver.ts`): busca documental in-chat planejada para a vertical IMOB, com gating por `tenant/workspace` + assinatura ativa e evolução por `sourceType`.
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
| Campos Run.approval_status/approvedBy | `rg -n "approval_status|approvedBy" packages/db` | NÃO ENCONTRADO |
| Endpoint público `/ledger/:txId` | `rg -n "/ledger/:txId|ledger/:txId" apps packages` | ENCONTRADO: `apps/api/src/routes/governance.ts:414` |
| TrustScoreToken / tokenização de reputação | `rg -n "TrustScoreToken|reputação|tokenização" apps packages` | ENCONTRADO apenas em `apps/api/backup-20251031-103132.sql` (texto de backup, não implementação) |

## Status do Roadmap (consolidado por evidência)

| Item | Evidências | Status (no repo) | Divergência com Roadmap |
| --- | --- | --- | --- |
| Fase 4 — Gate pré‑execução (SCL obrigatório) | `apps/workers/action-runner/src/index.ts:841-919` | Implementado | Compatível (Roadmap v8: ✅ concluída) |
| Fase 4 — Resiliência do Signer | `packages/core/src/security/signerManager.ts:225-269` | Implementado | Compatível (Roadmap v8: ✅ concluída) |
| Fase 4 — Reconciliação Guardrail ↔ SCL | `apps/workers/maintenance-worker/src/index.ts:286-383` + `packages/core/src/services/reconcileLedgerService.ts:15-233` | Implementado | Compatível (Roadmap v8: ✅ concluída) |
| Fase 5.0 — Marketplace (catálogo + delegações) | `packages/db/prisma/schema.prisma:564-604` + `apps/api/src/routes/marketplace.ts:7-212` + `apps/web/src/pages/self-service/index.tsx:51-227` | Implementado (core) | Compatível (Roadmap v8: ⚙️ parcial) |
| Fase 5.0 — “UX de delegação avançada” | **NÃO ENCONTRADO** (`rg -n "delegation advanced|delegacao avancada|delegação avançada|advanced delegation"`) | Não evidenciado | Compatível (Roadmap v8: falta) |
| Fase 5.1 — PoU (modelo + serviço + pipeline + eventos) | `packages/db/prisma/schema.prisma:520-547` + `apps/api/src/services/pouService.ts:1-220` + `apps/workers/action-runner/src/index.ts:841-1314` + `packages/contracts/src/runEvent.schema.json:16-46` | Implementado | Compatível (Roadmap v8: ⚙️ parcial/hardening) |
| Fase 5.1 — Trust Gate (score + gate) | `apps/api/src/services/trustScore.ts:21-129` + `apps/workers/action-runner/src/index.ts:189-233` | Implementado | Compatível (Roadmap v8: ⚙️ parcial/hardening) |

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
