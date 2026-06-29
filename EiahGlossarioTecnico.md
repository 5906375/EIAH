# EIAH Glossário Técnico v1

> Conversão em Markdown do arquivo `EIAH_Glossario_Tecnico_SYNC_HEAD_62468a4.html`.

**Baseline:** Atualizado HEAD 62468a4 (#159) — RBAC fail-closed e GuardrailLedger persistente revalidados; P0-A/P0-B históricos, não reproduzidos.

## Resumo

- **Total de termos extraídos do `DATA[]`:** 113
- **Categorias:** 11
- **Evidenciado:** 85
- **Parcial / Hardening:** 8
- **Roadmap / Definido:** 19
- **Não encontrado:** 1

## Índice de categorias

- [Arquitetura & Runtime](#arquitetura-runtime) — 11 termos
- [Multi-tenancy & Auth](#multi-tenancy-auth) — 9 termos
- [Auditoria & Evidência](#auditoria-evid-ncia) — 14 termos
- [Governança & Policy](#governan-a-policy) — 14 termos
- [Agentes](#agentes) — 14 termos
- [Verticais de Negócio](#verticais-de-neg-cio) — 11 termos
- [Billing & Economy](#billing-economy) — 7 termos
- [CI/CD & Qualidade](#ci-cd-qualidade) — 9 termos
- [Segurança & Compliance](#seguran-a-compliance) — 8 termos
- [Stack Tecnológico](#stack-tecnol-gico) — 11 termos
- [Web3 / NFT (Roadmap)](#web3-nft-roadmap) — 5 termos

## Arquitetura & Runtime

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| EIAH Runtime | Núcleo de execução da plataforma. Recebe o output do Agent Engine, normaliza, gera proof, emite receipt, persiste no ledger e devolve o presentationSnapshot ao frontend. | `apps/api · packages/core` | Evidenciado |
| Intent Validator | Primeira camada de validação. Verifica se a intenção do usuário está dentro do escopo permitido para aquele tenantId/workspaceId antes de qualquer chamada a agente ou provider. | `apps/api/src/routes/` | Evidenciado |
| Agent Engine | Motor que seleciona e executa o agente correto para a tarefa. Recebe o intent validado e orquestra a chamada ao agente registrado no registry. | `apps/api/src/agents/` | Evidenciado |
| Provider Router | Roteador de modelos de IA. Decide qual provider usar por tipo de tarefa: OpenAI (code/schema), Claude/Anthropic (análise longa), Gemini (multimodal). Provider nunca responde direto ao usuário. | `packages/core/src/actions/` | Evidenciado |
| ChatAgentLauncher | Componente React do frontend responsável por capturar input, manter estado visual, controlar transporte de sessão e renderizar mensagens/snapshots do chat com agentes. Pós-PR #160, deixou de definir localmente fallbackHelpMarkdown, de recalcular quickReplyUsed e de montar decisionTelemetry. Pós-commit 61401d6, deixou também de definir wrapper local de presentationSnapshot; a criação do snapshot foi centralizada no helper puro createLauncherPresentationSnapshot no engine. Permanece Parcial avançado enquanto selectLauncherAgentContract seguir chamado diretamente pelo launcher e enquanto não existir gate explícito de render-only. | `apps/web/src/components/agents/ChatAgentLauncher.tsx` | Parcial avançado — residual selectLauncherAgentContract / gate render-only pendente |
| chatLauncherEngine | Engine de decisão do chat: resolve qual agente usar, qual modo ativar, handoff, fallback, clarificação e quick replies. Lógica fica aqui, não no ChatAgentLauncher. | `apps/web/src/components/agents/chatLauncherEngine.ts` | Evidenciado |
| presentationSnapshot | Contrato/estrutura de renderização entre engine/helper e launcher para congelar o resultado visual e o estado governado de um turno do chat. Pós-commit 61401d6, a criação do snapshot do launcher foi centralizada em createLauncherPresentationSnapshot no engine, reduzindo composição semântica local no ChatAgentLauncher. O shape real preserva campos de renderização e continuidade, como snapshotVersion, routeIntent, quickReplies, renderVariant, proposalDomain, conversationStage e governedRuntime. Não deve ser confundido com contratos probatórios/backend como tenantId, workspaceId, payload, proofHash, sourceRefs, receipt ou ledger. Permanece Parcial avançado até existir schema/baseline canônico, testes E2E e Evidence Index dedicado. | `apps/web/src/components/agents/chatPresentationSnapshot.ts · apps/web/src/components/agents/chatLauncherEngine.ts · docs/architecture/presentation-snapshot-v1.md` | Parcial avançado — contrato renderizável em hardening |
| modeContracts | Contratos que definem os modos de operação disponíveis para cada agente em cada contexto (ex: search_knowledge, contract_suggestion). Parte do journeyContract. | `packages/core/src/actions/agents/eiahAction.ts` | Evidenciado |
| journeyContract | Contrato principal de um agente: define os modos possíveis, handoffs permitidos, fallbacks e regras de transição. É a fonte normativa de como o agente deve se comportar. | `packages/core/src/actions/agents/eiahAction.ts` | Evidenciado |
| resolveLauncherTurnDecision | Função do chatLauncherEngine que decide, a cada turno do chat, qual ação tomar: responder, fazer handoff, pedir clarificação ou bloquear. | `chatLauncherEngine.ts` | Evidenciado |
| selectLauncherAgentContract | Função que seleciona o contrato do agente correto com base no contexto do turno atual (tenant, workspace, modo, entitlement). | `chatLauncherEngine.ts` | Evidenciado |

## Multi-tenancy & Auth

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| tenantId | Identificador único do tenant (empresa/cliente). Obrigatório em toda operação sensível. Garante isolamento total de dados entre clientes diferentes na mesma plataforma. | `Todas as rotas e tabelas do DB` | Evidenciado |
| workspaceId | Identificador do workspace dentro de um tenant. Permite que uma empresa tenha múltiplos workspaces (ex: por equipe ou produto) com dados e billing separados. | `Todas as rotas e tabelas do DB` | Evidenciado |
| userId | Identificador do usuário autenticado. Obrigatório em operações sensíveis para rastreabilidade e aprovação humana. Nunca PII inline — referenciado por ID. | `Rotas sensíveis · RunEvent · Receipt` | Evidenciado |
| enforceTenant | Middleware crítico da API. Extrai o Bearer token do header Authorization, valida no banco (ApiToken), checa se não está revogado ou expirado, e injeta {tenantId, workspaceId, userId} em req.authContext. | `apps/api/src/middlewares/enforceTenant.ts` | Evidenciado |
| ApiToken | Entidade no banco que representa um token de acesso de um tenant. Contém tenantId, workspaceId, scopes, status de revogação e data de expiração. | `packages/db/prisma/schema.prisma · enforceTenant.ts` | Evidenciado |
| Bearer token | Token de autenticação enviado no header 'Authorization: Bearer <token>'. É a principal forma de autenticação da API EIAH. Vinculado a um ApiToken no banco. | `Todas as chamadas de API` | Evidenciado |
| Tenant Resolver (por domínio) | Mecanismo que identifica o tenant pelo domínio/subdomínio da requisição (ex: imob.eiah.com.br → tenantId=imob). Ainda não implementado — auditoria marcou como CONTRADITO. Hoje só por token. | `Roadmap · experience-resolver-contract.md` | Hardening — não evidenciado |
| AuthContext | Objeto injetado pelo enforceTenant em cada requisição autenticada. Contém: tokenId, tenantId, workspaceId, userId. Disponível em req.authContext para todas as rotas downstream. | `enforceTenant.ts` | Evidenciado |
| requireScope | Middleware que valida se o token tem o scope necessário para acessar uma rota. Em bloqueio 403, propaga reasonCode explícito, preservando fail-closed e auditabilidade. A cobertura global de todas as rotas críticas deve seguir a matriz P1. | `apps/api/src/middlewares/requireScope.ts` | Parcial avançado — reasonCode evidenciado; cobertura crítica em validação contínua |

## Auditoria & Evidência

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| Receipt Canon v1 | Padrão canônico de comprovante de execução. Cada run que passa pelo EIAH Runtime gera um receipt com hash, timestamp, tenantId, runId e referências à ação executada. Verificável e exportável. | `apps/api/src/routes/governance.ts · Receipt Canon baseline` | Evidenciado |
| Receipt | Comprovante individual de uma execução. Contém: receiptId, runId, tenantId, proofHash, timestamp, status, sourceRefs. Base da trilha de auditoria. | `governance.ts · schema.prisma` | Evidenciado |
| Bundle | Agrupamento de receipts de uma mesma sessão ou operação. Permite exportar e auditar um conjunto de ações relacionadas de forma coesa. | `governance.ts · runs.ts` | Evidenciado |
| Ledger | Registro persistente e imutável da trilha completa: run → bundle → receipt → ledger. É a âncora final de auditoria. Pode incluir txId quando a policy exige. | `governance.ts · runs.ts` | Evidenciado |
| Trilha run → bundle → ledger | Cadeia de auditoria completa do EIAH. Cada execução (run) gera eventos (RunEvent), que se consolidam em bundle, são comprovados por receipt e registrados no ledger. Confirmada em código. | `runs.ts · governance.ts · runArchiveService.ts` | Evidenciado |
| runId | Identificador único de uma execução (run). Usado para rastrear toda a cadeia: run → bundle → receipt → ledger. Obrigatório em respostas de agentes e no proof surface. | `Todas as rotas de execução` | Evidenciado |
| proofHash | Hash SHA-256 gerado para cada execução ou documento. Garante integridade verificável do que foi executado ou armazenado. Componente do Receipt. | `EIAH Runtime · ImobRuntimeEvent` | Evidenciado |
| receiptId | Identificador único do receipt. Permite localizar e verificar um comprovante específico de execução no ledger. | `Receipt · governance.ts` | Evidenciado |
| txId | Transaction ID opcional. Exigido pela policy em ações HIGH quando a cadeia precisa ser verificável em ledger externo (ex: blockchain). Resolve para runId/bundleHash. | `Policy Engine · EIAH Runtime · Web3 (roadmap)` | Parcial — policy define quando obrigatório |
| Evidence Index | Índice central de evidências do projeto. Mapeia cada capacidade declarada para o arquivo de código que a comprova. CI valida que todas as referências existem (327 refs checadas). Sem entrada aqui, status máximo é 'parcial'. | `docs/EVIDENCE_INDEX.md · CI job EvidenceIndex` | Evidenciado |
| RunArchive | Serviço que arquiva runs paradas por mais de 60 dias, gerando snapshot completo antes de arquivar. Garante que dados históricos não se percam sem evidência. | `apps/api/src/services/runArchiveService.ts · runArchiveWorker.ts` | Evidenciado |
| Run | Entidade central de execução. Representa uma sessão de trabalho de um agente para um tenant/workspace. Contém status, eventos, receipts e referências de prova. | `schema.prisma · runs.ts` | Evidenciado |
| RunEvent | Evento dentro de uma Run. Cada ação significativa gera um RunEvent com tipo, timestamp, tenantId, dados e hash. Trilha granular de auditoria. | `schema.prisma · runs.ts` | Evidenciado |
| sourceRefs | Array de referências às fontes usadas numa resposta de agente ou busca RAG. Obrigatório em respostas de Knowledge Search. Sem sourceRefs → bloqueio SOURCE_REFERENCE_REQUIRED. | `ImobKnowledgeSearchResult · agentes RAG` | Evidenciado |

## Governança & Policy

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| Policy Engine | Motor de políticas. Avalia se uma ação é permitida para aquele tenant/workspace/user com base em regras configuradas. Bloqueia com reasonCode explícito antes de qualquer execução. | `packages/core/policy/TenantPolicyStore.ts · agentsPolicy.ts` | Evidenciado |
| TenantPolicyStore | Repositório de políticas por tenant. Contém as regras que o Policy Engine usa para decidir quais ações são permitidas. No HEAD 62468a4 (#159), o achado histórico de allow-all para scope não se reproduz: a revalidação reportou fail-closed e check:rbac-fail-closed com ok=true. | `packages/core/src/policy/TenantPolicyStore.ts · scripts/checkRbacFailClosed.ts` | Evidenciado localmente — fail-closed no HEAD 62468a4 |
| resolveAllowedActionNames | Função do Policy Engine que retorna a lista de ações permitidas para um tenant/workspace/user num dado contexto. Usada antes de qualquer execução sensível. | `TenantPolicyStore.ts · agentsPolicy.ts` | Evidenciado |
| reasonCode | Código de motivo obrigatório em qualquer bloqueio ou falha de governança. Ex: TENANT_REQUIRED, SCOPE_DENIED, RECEIPT_REQUIRED. Facilita debug, auditoria e contratos de erro. | `Toda a plataforma — regra P0 do CLAUDE.md` | Evidenciado |
| fail-closed | Princípio de segurança: quando há dúvida ou falha de validação, a operação é bloqueada (não permitida). Oposto de fail-open. Regra absoluta do EIAH em todas as rotas sensíveis. | `Todas as rotas sensíveis` | Evidenciado |
| Trust Score | Pontuação de confiança do usuário/tenant usada em ações sensíveis. Ações HIGH risco são avaliadas contra o Trust Score antes de serem permitidas. Aplicado em /api/agents/execute. | `apps/api/src/routes/agents.ts` | Evidenciado |
| Human approval | Mecanismo que exige aprovação humana explícita antes de executar ações de risco HIGH. O fluxo IMOB foi revalidado como fail-closed: o achado histórico de humanApprovalGranted: true hardcoded não se sustenta como estado atual confirmado. Permanece sujeito à validação contínua pela cadeia P1 e checks de approval. | `schema.prisma · runs.ts · apps/api/src/services/imob/imobApprovalGate.ts · docs/EVIDENCE_INDEX.md` | Evidenciado — fail-closed revalidado; validação contínua P1 |
| riskTier | Nível de risco de uma ação: LOW, MEDIUM ou HIGH. Define quais controles adicionais são aplicados (Trust Score, human approval, receipt obrigatório, txId). | `GovernedProviderRequest · ImobRuntimeEvent` | Evidenciado |
| entitlement | Direito de uso de uma feature ou agente. Verificado antes de executar qualquer ação IMOB ou sensível. Compõe o fluxo: RBAC + scope + entitlement. | `lib/entitlements.ts · agentsPolicy.ts` | Evidenciado |
| GuardrailLedger | Ledger de guardrails aplicados em cada execução. No HEAD 62468a4 (#159), o achado histórico de no-op não se reproduz: a revalidação reportou persistência via ledger/audit e check:guardrail-ledger-noop com ok=true. | `packages/core/src/audit/guardrailLedger.ts · scripts/checkGuardrailLedgerNoop.ts` | Evidenciado localmente — persistente no HEAD 62468a4 |
| Rollout shadow → pilot → small | Protocolo de lançamento de novas verticais. Shadow: 1 tenant interno sem tráfego real. Pilot: 3–5 tenants com KPIs. Small: rollout incremental com gate semanal. Nenhuma fase avança sem evidência. | `ops/verticals/ · vertical-onboarding-checklist.md` | Evidenciado |
| APE Cycle | Ciclo semanal de governança: Audit, Plan, Execute. Cada semana encerra com hardMetricsGo=true, auditGap=0 e evidência registrada. Gate obrigatório para avançar fase de rollout. | `CLAUDE.md · ROADMAP_v8` | Definido normativamente |
| auditGap | Contador de gaps de auditoria numa semana. Deve ser 0 para avançar fase de rollout. Se > 0, a semana não fecha e nenhuma entrega é declarada como DONE. | `APE Cycle · CI gates` | Definido normativamente |
| DoD (Definition of Done) | Critérios obrigatórios para fechar uma entrega: evidência indexada, checks CI passando, auditGap=0, duplicateSideEffects=0. Sem DoD completo, status máximo é 'parcial'. | `CLAUDE.md · EVIDENCE_INDEX.md` | Definido normativamente |

## Agentes

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| J_360 | Agente jurídico especializado. Cobre contratos civis, imobiliários, tokenização, CVM e tributação. Usa rag.searchLaw para busca em base jurídica. Confirmado em código (j360.ts). | `apps/api/src/agents/j360.ts · self-service/j360.tsx` | Evidenciado |
| MKT (Marketing GPS) | Agente de marketing. Planeja campanhas multicanal com canais, cronograma e métricas de sucesso. Modelo base: GPT-4.1-mini. | `apps/api/src/agents/mkt.ts` | Evidenciado |
| Guardian | Agente de compliance e provas processuais. Gera hash SHA-256, âncoras blockchain, VC-JWT, LGPD-first masking, relatórios de evidência verificável e recibos de execução. | `apps/api/src/agents/guardian.ts` | Evidenciado |
| VERA Pipeline | Pipeline de 9 agentes TypeScript para criação de conteúdo: AGT01 (persona) → AGT02 (avatares) → AGT03 (ângulos) → AGT04 (roteiros) → AGT05 (prompt vídeo) → AGT06 (UGC) → AGT07 (compliance) → AGT08 (variações) → AGT09 (performance). | `EIAH_2026/VERA/AGENTS_VERA_PIPELINE.md` | Especificado |
| Flow Orchestrator | Agente orquestrador de fluxos DeFi multi-chain. Coordena execuções com guardrails, validação de contratos e callbacks de risco. | `apps/api/src/agents/flowOrchestrator.ts` | Evidenciado |
| Risk Analyzer | Agente de análise de risco. Avalia operações e gera relatórios de risco com níveis LOW/MEDIUM/HIGH. | `apps/api/src/agents/riskAnalyzer.ts` | Evidenciado |
| AADV | Agente de assessoria jurídica avançada. Complementa o J_360 em casos mais complexos. | `apps/api/src/agents/aadv.ts · self-service/aadv.tsx` | Evidenciado |
| FinNexus | Agente financeiro. Cobre análises e operações do vertical financeiro. | `apps/api/src/agents/finNexus.ts · self-service/fin-nexus.tsx` | Evidenciado |
| Pitch | Agente gerador de pitch. Cria apresentações de pitch com narrativa estruturada. | `apps/api/src/agents/pitch.ts · self-service/pitch.tsx` | Evidenciado |
| IBC | Agente focado em operações do ecossistema BC (Balneário Camboriú) — contexto local e regional. | `apps/api/src/agents/iBC.ts` | Evidenciado |
| Registry | Agente de registro. Mantém o catálogo de agentes disponíveis na plataforma com seus contratos e capacidades. | `apps/api/src/agents/registry.ts` | Evidenciado |
| Onchain Monitor | Agente de monitoramento on-chain. Acompanha transações e eventos em blockchain para alertas e auditoria. | `apps/api/src/agents/onchainMonitor.ts` | Evidenciado |
| DefiOne | Agente para operações DeFi simplificadas. Trabalha com defiOne.ts. | `apps/api/src/agents/defiOne.ts` | Evidenciado |
| NFT Diarias | Agente para geração de NFTs de diárias imobiliárias. Integrado ao pipeline de tokenização de estadias. | `apps/api/src/agents/nftPy.ts · diarias.ts` | Evidenciado |

## Verticais de Negócio

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| EIAH IMOB | Vertical de CRM imobiliário governado. Onboarding de proprietários e imóveis, sugestão de contratos via RAG jurídico, Command Center por imobiliária, Turn Engine de estados do imóvel. | `apps/api/src/routes/imob.ts · EIAH_IMOB/` | Evidenciado — mais madura |
| Turn Engine (IMOB) | Máquina de estados do imóvel: DISPONIVEL → VISITA → EM_CONTRATO → ENTREGUE → RESCISAO → DISPONIVEL. Cada transição exige tenantId + userId + reasonCode + evidência persistida. | `Deploy/…/16_turn_engine.md (pendente) · imob.ts` | Especificado — parcial |
| Command Center | Painel operacional por vertical. No IMOB: visibilidade de runs, leads, contratos, bloqueios e riscos em tempo real. Fundação multi-vertical confirmada em código. | `apps/web/src/features/imob/ImobCommandCenter.tsx` | Evidenciado |
| Legal RAG | Corpus de documentos jurídicos para busca vetorial (RAG). 7 categorias: contratos, riscos, regulatório, governança, intermediação, operacional, web3. Base para sugestão contratual do IMOB. | `legal_rag/ · EIAH_2026/` | Evidenciado — corpus montado |
| IMOB Knowledge Search | Modo de busca semântica no corpus Legal RAG. O endpoint/serviço/testes existem e retornam metadados, snippet, origem e contexto de proveniência. Não deve ser descrito como se o payload de busca já expusesse sourceRefs/proofHash/receiptId; esses campos pertencem a outros fluxos IMOB/probatórios quando aplicável. | `apps/api/src/routes/imob.ts · apps/api/src/services/imob/imobKnowledgeSearch.ts · apps/api/src/tests/imob.knowledge.search.contract.test.ts` | Parcial avançado — endpoint/testes evidenciados; superfície probatória separada |
| EIAH LEGAL | Vertical jurídica. Usa J_360 + Guardian para análise de contratos, pareceres, provas processuais e compliance LGPD. Ainda em context_only — não vertical operacional completa evidenciada. | `self-service/j360.tsx · vertical-context-legal.md` | Parcial — context_only |
| EIAH FINANCEIRO | Vertical financeira. UI surfaces existem (fin-nexus), mas sem engine robusto confirmado. Em roadmap com integração Santander AI Lab (12 projetos open-source em 4 camadas). | `self-service/fin-nexus.tsx · EIAH Fin/` | Roadmap |
| vertical.manifest.v1.json | Manifesto por vertical. Define capacidades, agentes, modos, rollout phase e gates de não-regressão. Confirmado para IMOB. Template disponível em ops/verticals/. | `ops/verticals/imob/vertical.manifest.v1.json` | Evidenciado |
| PainelCadastro | Componente React do IMOB. Stepper de 3 etapas: Proprietário → Propriedade → Regras. FormProprietario e FormPropriedade são stubs pendentes. FormRegras está pronto. | `EIAH_IMOB/frontend/components/PainelCadastro.tsx` | Parcial — 2 forms pendentes |
| FormRegras | Componente React do IMOB para regras do imóvel. Interface RegrasImovel tipada. Campos: checkin, checkout, maxHospedes, regras (fumar, pets, festas). Pronto e tipado. | `EIAH_IMOB/frontend/components/FormRegras.tsx` | Evidenciado |
| Oráculo SC | MVP de logística portuária para SC (Itajaí/Navegantes). 5 agentes Claude SDK, VC-JWT, SISCOMEX, Hapag-Lloyd, WhatsApp. Deployado em oraculosc.vercel.app. NÃO encontrado no codebase EIAH_Builder. | `oraculosc.vercel.app (projeto separado)` | Não encontrado no EIAH_Builder |

## Billing & Economy

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| Billing / Economy | Sistema de cobrança e economia da plataforma. Separa billing por tenant e workspace. Planos: Free, Starter ($9.80/mês), Pro ($29.80), Scale ($59.80), Business ($119.80), Enterprise (proposta). | `apps/api/src/routes/billing.ts · config/pricing.ts` | Evidenciado |
| Runs/mês | Unidade principal de consumo da plataforma. Cada execução de agente consome runs do plano. Free: 20 · Starter: 150 · Pro: 500 · Scale: 1.000 · Business: 2.000 · Enterprise: 10k+. | `Planos de assinatura · Comparativo_v8` | Definido |
| Overage | Cobrança por uso acima do plano. Por 100 runs excedentes: Starter $5.80, Pro $5.00, Scale $4.60. Não disponível em Business/Enterprise (custom). | `config/pricing.ts · Comparativo_v8` | Definido |
| Settlement Provider | Provider de pagamento/settlement. Suporta múltiplos providers por ambiente (dev/prod). Confirmado em código com checks de drift. | `apps/api/src/services/settlementProviders.ts` | Evidenciado |
| Reputação / Disputa | Sistema de reputação e disputa de cobrança com trilha verificável. Confirmado em código com check:p3-economy-hardening passando. | `apps/api/src/services/reputationDisputes.ts · billing.ts` | Evidenciado |
| Webhooks assinados | Webhooks de eventos de billing assinados com HMAC, replay protection e idempotência. Confirmados em código. Planos Business e Enterprise. | `apps/api/src/routes/billing.ts` | Evidenciado |
| Economia de créditos (VERA) | Sistema de créditos do pipeline VERA: Starter 200 créditos/mês (R$0,15 excedente), Growth 600 (R$0,12), Scale 2000 (R$0,09). 1 ciclo completo ≈ 10 créditos. | `EIAH_2026/VERA/AGENTS_VERA_PIPELINE.md` | Definido |

## CI/CD & Qualidade

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| check:evidence-index | Check de CI que valida que todas as referências do Evidence Index apontam para arquivos reais. Resultado: refsChecked: 327. Passou na auditoria. | `ci.yml · scripts/` | Evidenciado |
| check:receipt-canon-compat | Check de CI que valida compatibilidade do Receipt Canon v1. Garante que nenhuma mudança quebra o contrato canônico de receipts. Passou. | `ci.yml` | Evidenciado |
| check:interop-contract-matrix | Valida a matriz de compatibilidade entre contratos de agentes. O check existe e está ligado a workflow dedicado de DoD crítico; manter observação apenas de que a cobertura deve continuar monitorada entre workflows. | `.github/workflows/critical-dod.yml · scripts/checkInteropContractsMatrix.ts` | Evidenciado em workflow dedicado — monitorar cobertura no CI |
| check:p1-critical-chain | Valida a cadeia crítica P1: human approval, schema, API e runtime consistentes. Passou na auditoria. | `ci.yml` | Evidenciado |
| check:p3-economy-hardening | Valida hardening do sistema de economy/billing: settlement, webhooks, reputação. Passou. | `ci.yml` | Evidenciado |
| check:p4-trackp-rollout | Valida que o protocolo de rollout shadow→pilot→small está implementado e os gates existem. Passou. | `ci.yml` | Evidenciado |
| KPIs de não-regressão | Métricas semanais que não podem regredir entre releases. Definidas em w4-non-regression-kpis.json. Script checkW4NonRegression.ts valida automaticamente. | `scripts/checkW4NonRegression.ts · ops/evidence/latest/w4-non-regression-kpis.json` | Evidenciado |
| CONTRACT_BASELINE_MISSING | ReasonCode de erro de CI quando os arquivos normativos primários (ROADMAP_v8, EVIDENCE_INDEX.md) não existem. O check deve falhar com esse código, nunca passar silenciosamente. | `CLAUDE.md · CI gate normativo` | Definido normativamente |
| drift documental/contratual | Divergência entre documentação, contrato, schema, teste, runtime ou evidência. Classificado como incidente P0. Deve ser resolvido antes de qualquer avanço de fase. | `CLAUDE.md · APE Cycle` | Definido normativamente |

## Segurança & Compliance

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| RBAC (Role-Based Access Control) | Controle de acesso baseado em papéis/scopes. No HEAD 62468a4 (#159), o fluxo de scope foi revalidado como fail-closed e protegido por check anti-regressão. A cobertura global de todas as rotas críticas ainda deve seguir a matriz P1. | `requireScope.ts · TenantPolicyStore.ts · scripts/checkRbacFailClosed.ts` | Parcial avançado — fail-closed evidenciado |
| Scope | Permissão específica de uma operação (ex: law:contract:read). Definido no ApiToken e checado pelo requireScope middleware antes de ações sensíveis. No HEAD 62468a4, o allow-all histórico em TenantPolicyStore não se reproduz e o check RBAC fail-closed passou. | `ApiToken · requireScope.ts · TenantPolicyStore.ts` | Evidenciado localmente — fail-closed no HEAD 62468a4 |
| PII (Personally Identifiable Information) | Dados pessoais identificáveis: CPF, RG, nome completo, e-mail, telefone, endereço. Nunca devem entrar em prompts permanentes, CLAUDE.md ou docs operacionais. Regra P0 de compliance. | `CLAUDE.md · imobContractPiiMasker.ts` | Evidenciado |
| PII Masking (IMOB) | Mascaramento automático de PII em documentos IMOB antes de qualquer processamento por agente. Confirmado em código. LEGAL ainda é context_only — sem masking formal. | `apps/api/src/services/imob/intake/imobContractPiiMasker.ts` | Evidenciado (IMOB) · Parcial (LEGAL) |
| piiRef | Referência ao storage seguro onde o PII real está armazenado. Usado em lugar de PII inline nas payloads da API. Ex: owner.piiRef em vez de owner.cpf. | `ImobPropertyOnboardingRequest · CLAUDE.md` | Definido |
| LGPD | Lei Geral de Proteção de Dados (Brasil). O Guardian tem LGPD-first como diretiva máxima: nunca incluir PII on-chain, em metadados de NFT ou campos livres. Bloqueio com PII_bloqueado. | `guardian.ts · CLAUDE.md` | Definido normativamente |
| documentHash | Hash único de um documento (SHA-256). Garante integridade — qualquer alteração no documento gera hash diferente. Usado em ImobKnowledgeDocument e receipts. | `ImobKnowledgeDocument · ImobRuntimeEvent` | Definido |
| VC-JWT (Verifiable Credential) | Credencial verificável no padrão W3C usando JWT. Usada no Oráculo SC para provar responsabilidade por ator na cadeia logística. 4 tipos: DriverLicense, VehicleInspection, CompanyLicense, EmptyReturnProof. | `Oráculo SC (projeto separado)` | Evidenciado (Oráculo SC) · Não no EIAH_Builder |

## Stack Tecnológico

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| Neon Postgres | Banco de dados principal da plataforma. Armazena: Tenant, Workspace, Run, RunEvent, GuardrailLedger, ApiToken, receipts, audit logs, eventos IMOB. | `docker-compose.dev.yml · schema.prisma` | Evidenciado |
| Prisma | ORM (Object-Relational Mapper) usado para acessar o Neon Postgres de forma tipada. Schema em packages/db/prisma/schema.prisma define todas as tabelas. | `packages/db/prisma/schema.prisma` | Evidenciado |
| Upstash Redis | Cache e filas leves. Usado para: rate limiting, locks de idempotência, replay protection, BullMQ (filas de jobs), streams quando aplicável. | `docker-compose.dev.yml · workers/` | Evidenciado |
| BullMQ | Sistema de filas de jobs baseado em Redis. Processa workers assíncronos: runArchiveWorker e outros jobs pesados fora do ciclo de request/response. | `apps/api/src/workers/ · Upstash Redis` | Evidenciado |
| pnpm workspaces | Gerenciador de pacotes com suporte a monorepo. Estrutura: apps/web, apps/api, apps/cli, packages/core, packages/db. Instalação unificada com cache compartilhado. | `EIAH_Builder/ (raiz) · docker-compose.dev.yml` | Evidenciado |
| Vite + React 18 | Stack do frontend (apps/web). Vite para dev server e build, React 18 com hooks, Tailwind CSS 3.4 para estilos, React Router 6 para navegação. | `apps/web/package.json` | Evidenciado |
| Node / Express (apps/api) | Backend da API. Node.js 20 com Express. Processa todas as rotas, middlewares (enforceTenant, requireScope), agents e workers. | `apps/api/ · docker-compose.dev.yml` | Evidenciado |
| Cloudflare Pro | CDN e edge da plataforma. Responsável por: DNS, SSL, WAF (Web Application Firewall), rate limiting global e roteamento de domínios por vertical. | `CLAUDE.md — Stack canônica` | Definido |
| GitHub Actions (CI/CD) | Pipeline de CI/CD. Dois workflows principais: ci.yml (checks de qualidade, contratos, evidências) e deploy.yml (deploy para staging/production com inputs: environment, version, component). | `github/workflows/ci.yml · deploy.yml` | Evidenciado |
| Resend | Provider de e-mail transacional. Usado para notificações IMOB, alertas de contrato e comunicações operacionais da plataforma. | `CLAUDE.md — Stack canônica` | Definido |
| DO Gradient / Knowledge Bases | Provider de RAG/Knowledge Search. Adapter configurável para indexação e busca semântica do corpus legal_rag. Não declarado como contrato canônico sem baseline. | `CLAUDE.md — Stack canônica` | Definido |

## Web3 / NFT (Roadmap)

| Termo | O que é / Função | Onde aparece | Status na auditoria |
|---|---|---|---|
| propertyNftStatus | Status do NFT de um imóvel: not_required \| not_emitted \| emitted \| revoked. Campo de ImobPropertyRules. Exige policy HIGH e smart contract auditado antes de uso em produção. | `ImobPropertyRules · CLAUDE.md` | Definido — roadmap P3/P4 |
| cryptoPaymentAllowed | Flag booleana de ImobPropertyRules. Se true e propertyNftStatus != emitted, bloqueia com reasonCode NFT_NOT_EMITTED. Não faz parte do MVP fechado. | `ImobPropertyRules · CLAUDE.md` | Definido — roadmap P3/P4 |
| NFT_NOT_EMITTED | ReasonCode de bloqueio quando cryptoPaymentAllowed=true mas propertyNftStatus != emitted. Garante que pagamento cripto não é ativado sem o NFT correspondente. | `CLAUDE.md — ReasonCodes` | Definido |
| Replay Protection | Mecanismo que impede que uma mesma requisição seja processada duas vezes. Implementado com Upstash Redis e idempotency keys nos webhooks de billing. | `billing.ts · Upstash Redis` | Evidenciado |
| Idempotência | Propriedade de uma operação que pode ser executada múltiplas vezes com o mesmo resultado. Implementada nos webhooks e critical chain. Chave de idempotência enviada no header. | `billing.ts · governance.ts` | Evidenciado |
