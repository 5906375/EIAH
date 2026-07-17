# IMOB Chat Agentic Ops / LIBRARY_v1 Integration Proposal

> Status: proposta/parcial evidenciada documentalmente.
>
> Escopo desta rodada: investigacao read-only do codebase e criacao deste documento. Nenhum codigo, schema Prisma, seed, migracao, config, workflow, conector, coleta externa, scraping, API externa, provider real, secret produtivo, webhook produtivo, mutacao critica, `ChatAgentLauncher`, runtime ou engine foi alterado.
>
> Fonte da `LIBRARY_v1`: o anexo do solicitante `EIAH_CONVERSATION_LIBRARY_v1` foi lido como fonte externa fornecida nesta tarefa, citado como `LIBRARY_v1.md anexado`. Ele define os invariantes "Core governa, Chat orquestra, Vertical executa" e "o agente pensa, o humano decide", blueprint canônico, gates HITL, jornadas IMOB J1-J10, matriz outbound e bibliotecas-semente Legal/MKT/Fin/Log. O arquivo canônico `docs/architecture/EIAH_CONVERSATION_LIBRARY_v1.md` ainda nao existe no workspace.

## 1. Sumario executivo

A proposta e evoluir o Chat IMOB de uma superficie conversacional para um operador agentic comercial-operacional, preservando a regra do projeto: Core governa, Chat orquestra, Vertical executa. O IMOB ja possui contrato de agente, intents, action catalog, orquestrador, next action, market scan, command center, validacao documental inicial, proposta/contrato assistido, HITL parcial, runs, evidence bundle, receipts/bundles e gates de entitlement/RBAC. Isso permite planejar uma integracao da `LIBRARY_v1` em workstreams pequenos, sem implementar nada nesta fase.

O desenho proposto conecta a biblioteca de jornadas a capacidades de maior valor comercial-operacional: proxima melhor acao por carteira, validacao documental, market scan com fontes governadas, proposta assistida, checklist contratual, alerta de risco, run auditavel, receipt/bundle por execucao, command center de carteira e reconciliacao de pendencias.

Fontes imobiliarias externas citadas pelo solicitante sao tratadas como **informado pelo solicitante, a validar**. Este documento nao declara BCB, FipeZAP, Registro de Imoveis, CBIC, ITBI municipal, IBGE, Secovi/Sinduscon, Google Trends, QuintoAndar Imovelweb, ZAP, VivaReal, OLX, Imovelweb ou Chaves na Mao como juridicamente aprovados, conectados ou implementados.

## 2. Fontes e classificacao de evidencia

- **Fato do codebase:** afirmacao verificavel com `arquivo:linha`, por exemplo o contrato do agente IMOB declara `visibleAgentId: "IMOB"`, papel de dashboard e widgets em `apps/api/src/services/imob/imobAgentContract.ts:20-38`.
- **Conteudo da LIBRARY_v1 anexada:** o anexo `EIAH_CONVERSATION_LIBRARY_v1` foi lido integralmente. Ele declara status `proposta v1`, escopo canônico para Chat EIAH e verticais, profundidade total em IMOB, invariantes de governanca, schema de blueprint, papéis, gramática HITL, tom/copy, jornadas J1-J10, matriz outbound e bibliotecas-semente Legal/MKT/Fin/Log. Como o anexo ainda nao esta versionado no repositorio, suas afirmacoes sao tratadas como fonte externa fornecida pelo solicitante, nao como evidencia indexavel do codebase. O plano HTML do repositorio menciona uma `EIAH_CONVERSATION_LIBRARY_v1.md (v1.14)`, mas declara a camada Conversacao como `especificada/parcial`, sem alterar runtime ou launcher, em `plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html:474-482`.
- **Fato externo informado pelo solicitante, a validar:** grupos de fontes imobiliarias externas, incluindo dados publicos oficiais, demanda agregada anonima e portais de anuncios, foram informados na solicitacao. Nao houve chamada externa, scraping, validacao juridica ou verificacao de termos nesta tarefa.
- **Sugestao tecnica:** workstreams, entidades conceituais, reasonCodes, metricas e roadmap abaixo sao propostas futuras, nao implementacao.
- **Decisao de negocio/juridica pendente:** qualquer uso de fonte externa, portal, parceria, dado de demanda, dado comercial, scraping, coleta automatica, PII, outbound, proposta ou contrato exige decisao humana, juridica/comercial quando aplicavel e HITL/run/receipt/bundle quando sensivel.

## 3. Estado atual do codebase com evidencias

### Agentes, Chat IMOB e front door

- O agente IMOB possui contrato proprio `imob.case_concierge.v1`, `visibleName: IMOB`, papel `vertical_case_concierge`, superficies `chat`, `dashboard` e `marketplace`, em `apps/api/src/services/imob/imobAgentContract.ts:46-77`.
- O contrato de experiencia IMOB declara `sourceOfTruth: "imob_orchestrator_contract"`, `visibleAgentId: "IMOB"`, `dashboardRole: "managerial_console"`, widgets como `lead_summary`, `proposal_summary`, `document_checklist`, `print_bundle`, `contract_intake_draft` e `contract_intake_result`, em `apps/api/src/services/imob/imobAgentContract.ts:20-38`.
- Intents iniciais incluem leads do dia, retomar caso, preparar mensagem, sugerir imoveis, follow-up de visita, avancar proposta e desbloquear documentos em `apps/api/src/services/imob/imobAgentContract.ts:10-18`.
- O catalogo conversacional define entidades IMOB como lead, proposta, contrato, visita, documento, anuncio, pagamento e dashboard em `apps/api/src/services/imob/imobActionCatalog.ts:48-64`.
- O catalogo de intents ja possui formato `next_best_action` e policy `recommend_next_best_action` em `apps/api/src/services/imob/imobIntentCatalog.ts:44-80`.
- A rota `POST /api/imob/chat/resolve-turn` existe no roteador IMOB em `apps/api/src/routes/imob.ts:1693`.

### Command Center IMOB

- O backend expoe `GET /command-center/funnel-health`, calcula bloqueios, aprovacoes pendentes, pendencias legais, settlements parciais, status por aging e reasonCodes em `apps/api/src/routes/imob.ts:2357-2464`.
- O backend expoe `GET /command-center/blocked-runs`, lista runs IMOB bloqueados, reasonCodes, idade, `txId`, bundle hash, receipt path, bundle path e capability de visualizar bundle em `apps/api/src/routes/imob.ts:2466-2557`.
- O web Command Center renderiza Central Operacional, filtros por estado/reason, fila priorizada, waiting-on board e heatmap em `apps/web/src/features/imob/ImobCommandCenter.tsx:68-149`.
- A tabela do Command Center mostra processo, estado, jornada, risco/inatividade, responsavel, evidencias, sincronizacao e comprovantes em `apps/web/src/features/imob/ImobCommandCenter.tsx:151-164`.
- O Command Center oferece acoes para abrir no chat e baixar dossie/receipt em PDF/HTML conforme capabilities em `apps/web/src/features/imob/ImobCommandCenter.tsx:236-319`.

### Servicos de lead, carteira, funil e next action

- O schema Prisma possui `ImobLead` tenant/workspace-scoped com nome, documento, email, telefone, objetivo, cidade alvo, budget, stage, temperature e pendingItems em `packages/db/prisma/schema.prisma:927-953`.
- `ImobCase` conecta tenant/workspace, thread, flow, stage, status, owner, property, lead, pendingItems, blockers e marketScanRuns em `packages/db/prisma/schema.prisma:955-990`.
- `resolveImobNextAction` cobre dedupe, campos faltantes, lead pronto para vincular, journeys de captação, documentos, follow-up comercial, reengajamento, market scan e proposta por reasonCode em `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:59-260`.
- O teste E2E promove lead qualificado para agendamento de visita quando contexto e telefone existem em `apps/api/src/tests/imob-lead-to-visit.e2e.test.ts:6-48`.
- O teste E2E de proposta mantem visita aguardando outcome explicito e promove outcome positivo para `PROPOSAL_REQUIRED` em `apps/api/src/tests/imob-lead-to-proposal.e2e.test.ts:6-85`.

### Market scan

- O contrato de conversa define `property.market_scan` como operational flow em `apps/api/src/services/imob/imobConversationContract.ts:111-125`.
- O resultado de market scan e read-only, possui itens com `price`, `areaM2`, `priceAreaM2`, grupos, qualidade de fonte, intelligence, confidence e pricingRisk em `apps/api/src/services/imob/imobConversationContract.ts:243-328`.
- O source registry atual possui quatro entradas: `internal_crm`, `tenant_inventory_import`, `manual_input` e `public_web_assisted`, com `accessMode`, status, terms, PII policy, rate limit profile e confidence cap em `apps/api/src/services/imob/marketScan/marketSourceRegistry.ts:23-79`.
- O tipo de acesso ja preve `official_api`, `partner_feed` e `licensed_provider`, alem de modos internos/manuais/public web, em `apps/api/src/services/imob/imobConversationContract.ts:330-337`.
- O gate `decideSourceAccess` e fail-closed para ausencia de tenant/workspace, fonte desconhecida, termos nao aceitos, login, captcha, paywall, PII e bulk collection em `apps/api/src/services/imob/marketScan/sourceAccessPolicyGate.ts:51-89`.
- O pipeline cria `ImobMarketScanRun`, executa authorization/fetch/normalization/matching/scoring/recommendation, calcula qualidade, intelligence, opportunity e evidence bundle em `apps/api/src/services/imob/marketScan/marketScanPipeline.ts:51-285`.
- O policy judge bloqueia recomendacao sem `evidenceBundleId`, PII, vazamento de ID interno, listing fora do run e opportunity sem aprovacao humana em `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts:28-83`.
- O modelo `ImobMarketScanRun` persiste tenant/workspace, case, query, sourceIds, accessMode, termsMode, queryHash, evidenceBundleId, resultSnapshot, recommendationId, opportunityId e failureReason em `packages/db/prisma/schema.prisma:992-1026`.
- A proposta `docs/proposals/imob-data-sources.md` ja classifica sua propria rodada como proposta, sem implementacao, sem decisao juridica e sem coleta externa em `docs/proposals/imob-data-sources.md:1-11`.

### Contrato, proposta, checklist e validacao documental

- O action catalog possui acoes de proposta: criar, editar, excluir, listar, consultar, status, aprovar, reprovar, enviar e historico em `apps/api/src/services/imob/imobActionCatalog.ts:222-235`.
- O action catalog possui acoes de contrato: criar, editar, excluir, listar, consultar, status, aprovar, enviar para assinatura e historico em `apps/api/src/services/imob/imobActionCatalog.ts:237-249`.
- O case context possui snapshots de proposta/negociacao, checklist documental, suficiencia documental e evidencia em `apps/api/src/services/imob/crm/imobCaseContextContract.ts:133-217`.
- O gerador de contrato suporta tipos `locacao`, `compra_venda`, `administracao` e `temporada`, com base legal e clausulas em `apps/api/src/services/contracts/contractGenerator.ts:32-66`.
- O gerador de contrato produz review com warnings, riskLevel, hash SHA-256 e texto de contrato em `apps/api/src/services/contracts/contractGenerator.ts:68-140`.
- A rota `POST /contracts/generate` valida payload, gera preview, grava evento de memoria com hash/review e retorna widget `contract_intake_result` quando ha run escopado em `apps/api/src/routes/imob.ts:2580-2675`.
- O intake de contrato aceita `.docx`, valida tipo/tamanho, persiste documento, extrai texto, aplica PII masking, extrai campos de locacao, classifica contrato, cria draft e retorna riskFlags/pendingItems em `apps/api/src/routes/imob.ts:3845-3953`.
- A confirmacao de intake valida escopo do draft, action registry, cria run e enfileira worker de mutacao do caso; se falhar, restaura draft ou remove run criado em `apps/api/src/routes/imob.ts:3955-4093`.
- O export de intake valida tenant/workspace, tipo de run, evidencia, `piiMasked=true`, case ownership, faz anti-PII scan e exporta HTML/DOCX; PDF e delegado ao frontend em `apps/api/src/routes/imob.ts:4095-4256`.
- O extractor de locacao e deterministico, sem LLM, exige PII masking antes de uso, extrai aluguel, caução, datas, reajuste, multa, juros, pendingItems e riskFlags em `apps/api/src/services/imob/intake/imobLeaseExtractor.ts:1-29` e `apps/api/src/services/imob/intake/imobLeaseExtractor.ts:188-247`.
- O masker cobre email, RG, CNH, CNPJ, CPF e telefones e oferece `hasPiiResidue` em `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:1-82`.

### Risk alerts, HITL, side effects e governanca

- O approval gate exige aprovacao para criticidade HIGH/CRITICAL e bloqueia por `APPROVAL_SCOPE_MISMATCH`, `APPROVAL_REQUIRED`, `APPROVAL_INVALID` e `APPROVAL_EXPIRED` em `apps/api/src/services/imob/imobApprovalGate.ts:35-107`.
- O side-effect guard bloqueia ausencia de agente dono, idempotency key ausente e duplicidade de side effect em `apps/api/src/services/imob/orchestrator/imobSideEffectDispatchGuard.ts:6-24`.
- O market scan policy judge exige aprovacao humana para opportunity operacional em `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts:71-76`.

### Run, receipt, bundle, ledger e reconciliacao

- O export de conversa IMOB coleta mensagens, runId, txId, receiptPath, bundlePath, proof, telemetry, business export, hash SHA-256 e links para `/app/runs` e `/api/ledger/:txId` em `apps/api/src/routes/imob.ts:3580-3828`.
- O business export resume jornada, status, nextStep, blocker, recommendedActions, missingContext, blockedActions, reasonCodes, uploadedDocuments, validatedAttachments, linkedRuns, linkedReceipts e linkedBundles em `apps/api/src/services/imob/imobCaseExportService.ts:3-70`.
- As capabilities de artefato controlam abrir chat, ver dossie, ver receipt e ver run bundle, com `reports.view` para bundle em `apps/api/src/services/imob/imobArtifactCapabilities.ts:16-63`.
- O Command Center blocked-runs inclui `receiptPath`, `bundlePath`, `verifyUrl`, `bundleEndpointTemplate` e `ledgerEndpointTemplate` em `apps/api/src/routes/imob.ts:2516-2555`.

### Source access policy, entitlement/RBAC e conhecimento

- O IMOB access gate resolve status de instalacao `missing|inactive|active`, reasonCodes `IMOB_ENTITLEMENT_MISSING`, `IMOB_INSTALLATION_INACTIVE`, `IMOB_PERMISSION_DENIED`, CTA e audit event em `apps/api/src/services/imob/imobAccessGate.ts:7-45` e `apps/api/src/services/imob/imobAccessGate.ts:97-186`.
- A capability de bundle usa `checkScopePermission` com `scope: "reports.view"` em `apps/api/src/services/imob/imobArtifactCapabilities.ts:50-63`.
- A knowledge search possui fontes `drive`, `upload`, `web`, `internal_doc`, escopo tenant/workspace, filtros e provenance de snapshots em `apps/api/src/services/imob/imobKnowledgeSearch.ts:5-82`.
- A base seed de conhecimento inclui modelo de proposta de locacao, checklist contratual, playbook de captacao, guia de proposta/negociacao e template de busca por cidade/regiao em `apps/api/src/services/imob/imobKnowledgeSearch.ts:112-198`.

### Uso atual de LIBRARY_v1 ou blueprints conversacionais

- Nao existe `docs/architecture/EIAH_CONVERSATION_LIBRARY_v1.md` no workspace desta rodada.
- O plano HTML referencia `EIAH_CONVERSATION_LIBRARY_v1.md (v1.14)` como contrato de "como se conversa", mas tambem declara a camada Conversacao como `especificada/parcial`, sem alterar runtime ou `ChatAgentLauncher`, em `plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html:474-482`.
- O `rg` encontrou `property_intake` apenas em evidencia/teste de slot collection e web tests, nao como uma biblioteca J1-J10 integrada ao runtime.
- O anexo `LIBRARY_v1.md anexado` traz a fonte funcional para este planejamento, mas ainda precisa ser versionado como `docs/architecture/EIAH_CONVERSATION_LIBRARY_v1.md` antes de qualquer implementacao runtime.

## 4. LIBRARY_v1 — mapa de jornadas IMOB

Invariantes extraidos do `LIBRARY_v1.md anexado`:

- Core governa, Chat orquestra, Vertical executa.
- Front door nasce no Chat EIAH, com handoff anunciado para IMOB.
- Agente pensa e prepara; humano aprova/rejeita acoes criticas ou externas.
- Toda mensagem outbound a contraparte, proposta, contrato, financeiro, publish e acao destrutiva passa por gate HITL.
- Toda acao critica gera run, receipt, ledger e Verify_URL.
- PII deve ser mascarada em chat, logs e outbound.
- Canal define forma, nao conteudo: web usa cards/widgets; WhatsApp usa texto estruturado/botoes; artefatos viram link server-side.

| Jornada LIBRARY_v1 | Status | Evidencia/gap |
| --- | --- | --- |
| J1 `lead_capture` | parcial | A library exige dedupe por telefone/nome, classificacao compra/locacao/investimento, score inicial, rascunho de primeira mensagem, gate `outbound_msg` e gate `destructive`. Ha `ImobLead`, action `lead.create`, fluxo `lead.qualify`, intake de lead e extracao de nome/email/telefone em rotas, mas falta jornada de captura library-driven ponta a ponta com consentimento/outbound governado e ledger de decisao de descarte. Evidencias: `packages/db/prisma/schema.prisma:927-953`, `apps/api/src/services/imob/imobActionCatalog.ts:205-220`, `apps/api/src/routes/imob.ts:323-362`. |
| J2 `lead_qualify` | evidenciado/parcial | A library exige questionario em linguagem natural, score incremental, matching de carteira, shortlist justificada e gate `outbound_msg` para envio. Ha mission `qualify_lead`, lead matching, readiness, E2E lead-to-visit e next action. Falta policy completa de scoring comercial configuravel pela LIBRARY_v1 e envio de shortlist HITL. Evidencias: `apps/api/src/services/imob/crm/imobCaseContextContract.ts:13-24`, `apps/api/src/tests/imob-lead-to-visit.e2e.test.ts:6-48`. |
| J3 `property_intake` | parcial | A library exige dedupe de proprietario/imovel, `property.market_scan`, checklist documental inicial, rascunho de autorizacao, sugestao de valor, gates `outbound_msg`, `contract` e `publish`. Ha `ImobProperty`, owner-property link, `property.create`, market scan e campos de propriedade. Falta blueprint J3 formal, checklist operacional por tipo de imovel e publish gate. Evidencias: `packages/db/prisma/schema.prisma:900-925`, `apps/api/src/services/imob/imobConversationContract.ts:223-241`. |
| J4 `visit_flow` | evidenciado/parcial | A library exige janelas sugeridas, convites a lead/proprietario, lembretes 24h/2h, feedback pos-visita e gate `outbound_msg`. Ha `visit.schedule`, visit outcome e E2E que exige outcome explicito antes da proposta. Falta agenda real/outbound, lembretes herdados e SLA configuravel. Evidencias: `apps/api/src/services/imob/crm/imobCaseContextContract.ts:115-131`, `apps/api/src/tests/imob-lead-to-proposal.e2e.test.ts:6-85`. |
| J5 `negotiation_arc` | parcial | A library define arco `proposta_rascunho -> proposta_enviada -> contraproposta -> acordo_verbal -> condicionantes -> aceite`, com gate `proposal` e alçada dupla quando aplicavel. Ha `proposalNegotiation`, proposal draft e follow-up de proposta, mas falta arco completo, assert de transicao, alçadas e bundle de proposta. Evidencias: `apps/api/src/services/imob/crm/imobCaseContextContract.ts:133-148`, `apps/api/src/services/imob/imobConversationContract.ts:210-221`. |
| J6 `due_diligence` | proposta/parcial | A library coloca J_360 como protagonista, Guardian como evidence pack, checklist por tipo de operacao, classificacao/validacao de anexos, parecer de risco e gate humano antes de destravar J7. Ha document checklist, document sufficiency, contract intake e risk flags. Falta due diligence ampla para compra/venda, fontes, registro, financeiro, juridico e ownership review. Evidencias: `apps/api/src/services/imob/crm/imobCaseContextContract.ts:173-190`, `apps/api/src/routes/imob.ts:3845-4256`. |
| J7 `contract_flow` | parcial | A library exige minuta pelo `contractGenerator`, clausulas sensiveis, condicionantes de J6, gate `contract` para minuta e envio, ajuste via J_360 e link server-side. Ha contract generator, contract intake, risk warnings, export e envio para assinatura como action catalog. Falta fluxo contratual completo com revisao humana formal, diff de versoes e assinatura integrada. Evidencias: `apps/api/src/services/contracts/contractGenerator.ts:32-140`, `apps/api/src/services/imob/imobActionCatalog.ts:237-249`. |
| J8 `closing_settlement` | parcial | A library exige fin-nexus/Core Billing, consolidacao de preco/comissao/splits, invoice, webhook conciliado, `commission.settle` idempotente, artefato de fechamento e gate `financial`. Ha mission `settle_commission`, partial settlements no command center e links de ledger/receipt/bundle. Falta closing settlement imobiliario completo com financeiro, ITBI/cartorio, webhooks reais e reconciliacao ponta a ponta. Evidencias: `apps/api/src/services/imob/crm/imobCaseContextContract.ts:20-23`, `apps/api/src/routes/imob.ts:2390-2454`, `apps/api/src/routes/imob.ts:2516-2555`. |
| J9 `property_mgmt` | proposta/parcial | A library exige regua de cobranca mensal, conciliacao/repasse, reajuste por indice, alertas 90/60/30, manutencao e gates `financial`, `contract` e `outbound_msg`. Ha property CRUD, rules.configure e property goals, mas nao ha modulo completo de gestao recorrente de carteira/locacao/temporada. Evidencias: `apps/api/src/services/imob/imobActionCatalog.ts:107-125`, `apps/api/src/services/imob/imobConversationContract.ts:111-125`. |
| J10 `manager_cockpit` | evidenciado/parcial | A library define leitura agregada para "como estao minhas vendas?", negocios travados, ranking, leads sem contato e saidas com resumo executivo, deep link, relatorio semanal e alertas opt-in. Ha Command Center, metrics, priority queue, waiting-on board, heatmap, blocked-runs e artifact links. Falta intent conversacional manager_cockpit library-driven com KPIs de negocio, aging e reconciliacao configuravel. Evidencias: `apps/api/src/services/imob/orchestrator/imobCrmCommandCenterMetrics.ts:3-62`, `apps/web/src/features/imob/ImobCommandCenter.tsx:68-149`. |

Bibliotecas-semente do anexo:

- `legal.seed.v1`: J_360 apoia IMOB em clausulas, risco documental, parecer e LGPD; fora de caso IMOB deve responder orientacao geral + CTA, sem vertical Legal operacional autonoma.
- `mkt.seed.v1`: marketing pode apoiar copy/plano de campanha, mas qualquer publish exige gate humano.
- `fin.seed.v1`: leitura financeira e alertas livres; mutacao financeira sempre gate `financial`.
- `log.seed.v1`: sem runtime; apenas triagem honesta e CTA de interesse.

## 5. Gaps de produto e arquitetura

- **Next best action:** existe resolver e reasonCodes, mas falta policy de priorizacao por carteira, SLA, valor comercial, aging e capacidade do time. Base atual: `apps/api/src/services/imob/orchestrator/imobNextActionResolver.ts:222-260`.
- **Market scan operacional:** existe pipeline, source gate, evidence bundle e intelligence, mas faltam conectores oficiais/comerciais e governanca juridica por fonte. Base atual: `apps/api/src/services/imob/marketScan/marketScanPipeline.ts:51-285`.
- **Validacao documental:** existe intake de contrato locacao e PII masking, mas falta checklist amplo por venda, locacao, temporada, due diligence, cartorio/ITBI e risk taxonomy. Base atual: `apps/api/src/routes/imob.ts:3845-4256`.
- **Proposta assistida:** existe proposal draft e contract/proposal widgets, mas falta geracao assistida governada de proposta comercial com HITL e alçada. Base atual: `apps/api/src/services/imob/imobConversationContract.ts:210-221`.
- **Checklist contratual:** existe contract generator e intake; falta matriz completa por tipo de operacao e revisao humana obrigatoria. Base atual: `apps/api/src/services/contracts/contractGenerator.ts:32-140`.
- **Alerta de risco:** existe riskFlags no extractor e risk labels no Command Center, mas falta catalogo unico de risk alerts IMOB. Base atual: `apps/api/src/services/imob/intake/imobLeaseExtractor.ts:188-247`.
- **Command center de carteira:** existe Command Center, mas falta reconciliacao de pendencias cross-journey com SLA/owner/aging. Base atual: `apps/api/src/routes/imob.ts:2357-2557`.
- **Run/receipt/bundle por execucao:** existe linkage e export, mas falta contrato especifico `ImobRunBundle` para cada workstream operacional. Base atual: `apps/api/src/routes/imob.ts:3580-3828`.
- **Outbound HITL:** approval gate existe, mas falta politica explicita para toda mensagem outbound a contraparte. Base atual: `apps/api/src/services/imob/imobApprovalGate.ts:35-107`.
- **PII masking:** existe para contrato; falta cobertura uniforme para todos os outputs, bundles e workstreams. Base atual: `apps/api/src/services/imob/intake/imobContractPiiMasker.ts:1-82`.
- **Dados publicos de mercado:** `official_api` existe no tipo, mas nao ha fonte registrada/implementada. Base atual: `apps/api/src/services/imob/imobConversationContract.ts:330-337` e `apps/api/src/services/imob/marketScan/marketSourceRegistry.ts:23-79`.
- **Dados de demanda agregada:** inexistente no codebase como entidade/servico especifico.
- **Dados de portais/parcerias:** `partner_feed` existe no tipo, mas nao ha conector parceiro; `public_web_assisted` e limitado e nao deve virar scraping sem juridico. Base atual: `apps/api/src/services/imob/marketScan/sourceAccessPolicyGate.ts:75-89`.

## 6. Workstream A — Next Best Action / Agentic Portfolio Ops

- **Entradas:** `ImobCase`, lead/property/proposal/document snapshots, marketScanRecommendation, pendingItems, blockers, age, ownerResponsible, run proof e Command Center.
- **Contexto necessario:** tenant/workspace, permissions, active IMOB installation, case context, evidence, last activity, SLA, business value, risk flags e capacidade do time.
- **Sinais de priorizacao:** lead temperature, readiness, `reasonCode`, aging 24/48/72h, risk severity, proof missing, document blockers, proposal readiness, market scan confidence, expected value.
- **Output esperado:** lista priorizada de `ImobNextBestAction` com label, target operation, reasonCode, confidence, required approval, suggested prompt e deep link para chat/case.
- **ReasonCodes propostos:** `NBA_LEAD_HOT_24H`, `NBA_DOCUMENT_BLOCKER`, `NBA_MARKET_SCAN_OPPORTUNITY`, `NBA_PROPOSAL_WAITING_RESPONSE`, `NBA_VISIT_OUTCOME_REQUIRED`, `NBA_PROOF_MISSING`, `NBA_MANAGER_APPROVAL_REQUIRED`.
- **HITL:** obrigatorio para outbound a lead/proprietario/contraparte, proposta, contrato, decisao financeira e qualquer acao HIGH/CRITICAL.
- **Integracao com Command Center:** usar filtros `__priority_queue__`, `__waiting_on__`, `__heatmap__` ja existentes no web Command Center como superficie inicial, sem regra nova no launcher.
- **Run/receipt/bundle:** cada selecao sensivel de next action deve gerar run e bundle; leitura de fila pode ser read-only.
- **MVP sugerido:** ranking read-only de casos com 5 acoes recomendadas e deep link para chat.
- **Dependencias:** policy de scoring, reasonCode catalog, teste de nao vazamento PII, export de evidencia.
- **T-shirt size:** M.

## 7. Workstream B — Market Scan + Dados Abertos Imobiliarios

Basear em `docs/proposals/imob-data-sources.md`, que declara status de proposta e ausencia de implementacao/coleta externa em `docs/proposals/imob-data-sources.md:1-11`.

### Fontes oficiais estruturadas

- BCB, IBGE, FipeZAP em formato estruturado e Registro de Imoveis quando houver API/CSV devem entrar como `official_api` somente depois de validacao de endpoint, termos, licenca e aprovacao juridica/comercial quando necessaria.
- Cache global compartilhado e aceitavel apenas para series publicas agregadas sem PII; leitura tenant/workspace deve continuar governada por entitlement.

### Dados PDF/manual

- CBIC, Raio-X FipeZAP+, pesquisas setoriais e relatorios de Secovi/Sinduscon devem ser tratados como PDF/manual ate haver fonte estruturada licenciada.
- Parsing de PDF deve ser low-trust, versionado e sempre citar fonte/metodologia.

### Dados comerciais/parceria

- Portais como ZAP, VivaReal, OLX, Imovelweb e Chaves na Mao devem preferir `partner_feed`/contrato comercial, nunca coleta em massa por padrao.

### Dados nao autorizados para coleta automatica

- Login, captcha, paywall, PII harvesting, bulk scraping e termos nao aceitos devem permanecer bloqueados pelo gate, alinhado a `apps/api/src/services/imob/marketScan/sourceAccessPolicyGate.ts:75-89`.

### Como alimenta IMOB

- Alimenta market scan com comparaveis e series agregadas.
- Alimenta next best action com sinais de liquidez, risco de preco, demanda regional e cobertura de fonte.
- Nunca substitui revisao humana para proposta, contrato ou decisao financeira.

## 8. Workstream C — Document Validation / Contract Checklist / Risk Alert

- **Checklist documental por operacao:** mapear venda, locacao, temporada e administracao a documentos obrigatorios, documentos coletados, pendentes, bloqueios e handoff target, seguindo o shape em `apps/api/src/services/imob/crm/imobCaseContextContract.ts:173-190`.
- **Validacao de anexos:** expandir intake `.docx` atual para outros documentos e formatos com PII masking antes de storage/output.
- **Alertas de risco:** catalogar risk flags atuais em reasonCodes governados: multa acima de threshold, tolerancia excessiva, reajuste IGP-M, caução sem comprovante, testemunha ausente, documento pessoal ausente.
- **J_360/Guardian:** usar Legal/J_360 como revisao humana/parecer quando houver risco juridico; Guardian/evidence bundle para prova e hash quando sensivel.
- **Revisao humana obrigatoria:** contrato e due diligence nao destravam fluxo sozinhos.
- **Receipt/bundle:** todo intake confirmado deve manter run, event, hash, export e PII scan.
- **Command center:** pendencias documentais devem virar waiting-on e aging no cockpit.
- **T-shirt size:** M-L.

## 9. Workstream D — Assisted Proposal Generation / Negotiation Arc

- **Geracao assistida:** criar rascunho de proposta com lead, property, offer, counteroffer, contractType, market scan e justificativa de preco.
- **Market scan como suporte de preco:** citar comparable count, confidence band, price range e pricingRisk; nao afirmar preco ideal sem evidencia.
- **Arco de negociacao:** estados collecting, ready_for_review, counteroffer_required, awaiting_response, accepted, rejected, approval_pending ja existem no contrato em `apps/api/src/services/imob/crm/imobCaseContextContract.ts:133-148`.
- **HITL proposal:** toda proposta e mensagem outbound exige aprovacao humana.
- **Alcada de gestor:** acima de thresholds de desconto/comissao/risco, exigir manager approval.
- **Bundle da proposta:** hash do rascunho, fontes, market scan, approval, versao e outcome.
- **Nao envio automatico:** nenhum envio a contraparte sem HITL e sem canal autorizado.
- **T-shirt size:** M.

## 10. Workstream E — Command Center de Carteira / Reconciliacao de Pendencias

- **Visao de carteira:** consolidar casos, leads, imoveis, propostas, documentos, contratos, comissoes e runs em uma lista priorizada.
- **Pendencias abertas:** agrupar por reasonCode, area responsavel, owner, stage e blocker.
- **Aging:** usar buckets 24/48/72h ja presentes no funnel-health em `apps/api/src/routes/imob.ts:2396-2409`.
- **Duplicidade:** integrar dedupe queue ja prevista em command center metrics.
- **Status reconciliado:** comparar case status, run status, evidence status, receipt/bundle availability e pendingItems.
- **Alertas:** risco documental, proposta sem resposta, visita sem outcome, proof missing, SLA vencido.
- **KPIs:** tempo ate primeiro contato, leads parados, documentos pendentes, propostas assistidas, conversao por etapa, custo por run.
- **Deep links:** reutilizar `abrir no chat` do Command Center em `apps/web/src/features/imob/ImobCommandCenter.tsx:236-259`.
- **Resumo executivo conversacional:** responder no chat com top 5 pendencias e proximas acoes, sem regra no `ChatAgentLauncher`.
- **T-shirt size:** M-L.

## 11. Modelo de dados conceitual

Entidades conceituais propostas, sem alterar schema:

- `MarketDataSeries`: serie publica agregada, cache global, sem PII; leitura governada por entitlement/plano.
- `ImobNextBestAction`: recomendacao por tenant/workspace/case com reasonCode, score, evidenceRef e HITL requirement.
- `ImobRiskAlert`: alerta por caso/documento/proposta com severity, reasonCode, source e humanReviewRequired.
- `ImobDocumentChecklist`: checklist por operacao com required/collected/pending/blocking.
- `ImobProposalDraft`: rascunho com valores, marketEvidenceRefs, approvalStatus e noAutoSend.
- `ImobPendingItem`: pendencia reconciliavel com owner, dueAt, status, reasonCode e aging.
- `ImobRunBundle`: contrato de bundle por execucao IMOB com runId, receiptPath, bundlePath, sourceRefs, PII scan e hash.

Isolamento:

- Dados publicos agregados podem ser cache global compartilhado quando nao contiverem tenant, workspace, lead, documento, proposta ou PII.
- Dados de tenant/carteira/leads/documentos/propostas permanecem tenant/workspace-scoped, como `ImobLead`, `ImobCase` e `ImobMarketScanRun` ja fazem em `packages/db/prisma/schema.prisma:927-1026`.

## 12. Governanca, HITL e boundaries

- **Read-only:** consulta de carteira, command center, market data agregada, knowledge search, preview de next best action sem execucao.
- **Assistido com aprovacao:** proposta, mensagem outbound, pedido de documento, follow-up, checklist, contrato draft, market scan com oportunidade operacional.
- **Critico:** contrato final, assinatura, financeiro, comissao/settlement, mutacao de caso, alteracao de status que gere efeito externo.

Regras:

- Toda mensagem outbound a contraparte exige HITL.
- Toda proposta exige HITL.
- Contrato exige revisao humana.
- Financeiro exige gate financial.
- Risco juridico nao destrava fluxo sozinho.
- Run/receipt/bundle para execucao sensivel.
- PII masking obrigatorio antes de storage, log, evidence, export ou resposta.
- Chat orquestra; vertical executa; core governa.
- Agente define; engine executa; launcher renderiza.

## 13. Roadmap proposto

| Item | Objetivo | Escopo | Fora de escopo | DoD | Dependencias |
| --- | --- | --- | --- | --- | --- |
| IMOB-0 Commercial-Operational Capability Charter | Abrir charter comercial-operacional | boundaries, HITL, owners, reasonCodes | codigo/runtime | doc + checks | este documento |
| IMOB-1 Next Best Action Policy / Portfolio Prioritization | Definir scoring e policy NBA | sinais, ranking, reasonCodes | mutacao/outbound | teste policy read-only | Command Center |
| IMOB-2 Market Scan Data Source Plan | Formalizar fontes oficiais/comerciais | registry plan, legal gates | conector/coleta | doc + matriz fonte | `imob-data-sources.md` |
| IMOB-3 Document Validation Checklist / Risk ReasonCodes | Ampliar checklist/risk | venda/locacao/temporada | assinatura real | catalogo reasonCodes | intake atual |
| IMOB-4 Assisted Proposal Generation / HITL Policy | Definir proposal draft e approvals | rascunho, alçada, bundle | envio automatico | HITL spec | proposal context |
| IMOB-5 Portfolio Command Center / Pending Reconciliation Spec | Especificar reconciliacao | aging, waiting-on, KPIs | dashboard novo obrigatorio | spec + fixtures | command center atual |
| IMOB-6 Run Receipt Bundle Contract for IMOB Ops | Contrato de prova por execucao | run/bundle/receipt fields | ledger produtivo novo | contract + tests | run export atual |
| IMOB-7 Pilot Readiness Matrix | Preparar piloto governado | gates, owners, metrics | declaracao de IMOB fechado | readiness doc | IMOB-0..6 |

## 14. Metricas comerciais e operacionais

- Tempo ate primeiro contato.
- Leads sem contato ha 24h/48h.
- Pendencias documentais abertas.
- Pendencias vencidas.
- Propostas assistidas.
- Taxa de aprovacao sem ajustar.
- Taxa de conversao por etapa.
- Tempo de validacao documental.
- Risco detectado por tipo/reasonCode.
- Custo por run.
- Run/receipt/bundle coverage.
- Market scan coverage por fonte.
- PII masking violation count, esperado zero.
- Outbound sem HITL, esperado zero.

## 15. Riscos e mitigacao

- **LGPD:** nao usar PII sem base legal/consentimento; masking antes de log/export; tenant/workspace scope.
- **Termos de uso de portais:** preferir parceria/feed; bloquear scraping sem parecer juridico.
- **Fonte comercial sem licenca:** `termsAccepted=false` ate aprovacao juridica/comercial.
- **Dado de mercado desatualizado:** registrar retrievedAt, period, confidence e stale policy.
- **Recomendacao sem evidencia:** bloquear sem evidenceBundleId, como o policy judge ja faz em `apps/api/src/services/imob/marketScan/marketScanPolicyJudge.ts:36-42`.
- **Falso negativo documental:** revisao humana obrigatoria para contrato/due diligence.
- **Proposta enviada sem HITL:** bloquear por approval gate e no-auto-send.
- **Drift entre biblioteca, docs e runtime:** versionar biblioteca, contrato de agente e testes de replay.
- **Excesso de governanca sem ROI:** priorizar MVPs read-only e medir tempo economizado/conversao.

## 16. Questoes em aberto

### Decisao de produto

- Quais jornadas J1-J10 entram no MVP?
- O cockpit gerencial deve priorizar gerente, corretor ou backoffice documental?
- Quais KPIs definem valor comercial inicial?

### Decisao juridica

- Quais fontes externas podem ser usadas e sob quais termos?
- `pytrends` ou outras bibliotecas nao oficiais sao aceitaveis?
- Quais portais exigem parceria/licenca antes de qualquer coleta?

### Decisao comercial

- Quais regioes e segmentos priorizar?
- Quais portais/parceiros negociar primeiro?
- Market data sera feature de plano premium?

### Decisao tecnica

- Onde versionar a `LIBRARY_v1` no repositorio?
- Como mapear jornadas J1-J10 para mission graph sem regra no launcher?
- Qual contrato canonico de `ImobRunBundle`?

### Decisao de dados

- Politica de cache global para `MarketDataSeries`.
- Retencao de market scans por tenant/workspace.
- Cadencia de atualizacao e stale thresholds por fonte.

## 17. DoD e proximos passos

DoD documental desta proposta:

- Estado atual mapeado com `arquivo:linha`.
- Jornadas J1-J10 classificadas.
- Gaps separados de suporte existente.
- Workstreams A-E definidos sem implementacao.
- Fontes externas marcadas como informado pelo solicitante, a validar.
- LGPD, termos de uso, HITL, run/receipt/bundle e PII masking preservados.
- Nenhuma alteracao em codigo, schema, seed, migracao, config, workflow, runtime, engine ou `ChatAgentLauncher`.

Proximos passos recomendados:

1. Criar PR documental IMOB-0 para charter comercial-operacional.
2. Versionar `LIBRARY_v1.md` dentro do repositorio antes de qualquer implementacao.
3. Criar matriz oficial de jornadas J1-J10 versus mission graph atual.
4. Abrir PR read-only para policy de Next Best Action, sem mutacao.
5. Solicitar revisao juridica/comercial das fontes externas antes de qualquer conector.
6. Definir contrato `ImobRunBundle` antes de ampliar execucoes sensiveis.
7. Manter `ChatAgentLauncher` render-only e mover regras para agente/engine quando houver fase de implementacao.

Status final: proposta/parcial evidenciada documentalmente.
