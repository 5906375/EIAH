# Universal Chat Front Door / Vertical Operating Model

> Status: proposta/parcial evidenciada documentalmente.
>
> Escopo desta rodada: investigacao read-only do codebase e criacao deste documento. Nenhum codigo, schema Prisma, seed, migracao, config, workflow, package, lockfile, componente, rota, runtime, conector, provider externo, WhatsApp produtivo, secret produtivo, coleta externa, mutacao critica, `ChatAgentLauncher` ou engine foi alterado.

## 1. Sumario executivo

A arquitetura alvo e consolidar o Chat como front door conversacional universal, mantendo as verticais como cockpits/command centers operacionais. O usuario entra por um unico Chat logico; o runtime detecta intencao, valida tenant/workspace/scope, entitlement e RBAC, anuncia handoff, preserva contexto e direciona a vertical correta. A vertical executa suas capacidades e seu cockpit organiza carteira, filas, KPIs, pendencias, alertas, runs, receipts e bundles.

O IMOB ja e a primeira vertical profunda: existe navegacao separada para `Chat` e `IMOB`, route de IMOB chat, dashboard, command center, cards/widgets, gates de entitlement, proof surface, run/bundle/ledger, intents, action catalog e runtime IMOB. O gap principal nao e falta de pecas isoladas; e falta de um contrato transversal versionado `Chat -> Vertical` que torne o padrao universal para IMOB, Legal, MKT, Fin e Log sem criar chats paralelos por vertical.

Principio do modelo: Core governa, Chat orquestra, Vertical executa, Frontend renderiza. WhatsApp, desktop e mobile responsivo devem ser canais do mesmo Chat logico, nao motores separados. `ChatAgentLauncher` permanece render-only; regra de negocio fica em contratos, runtime/engine e servicos verticais.

## 2. Fontes e classificacao de evidencia

- **Fato do codebase:** afirmacao verificavel por `arquivo:linha`, por exemplo a navegacao declara `/app/chat` e `/app/imob/chat` em `apps/web/src/App.tsx:56-63`.
- **Fato documental:** afirmacao normativa ou operacional em docs, por exemplo `AGENTS.md:1-31` define que agente define, engine executa e launcher renderiza; `docs/architecture/agent-chat-runtime.md:1-45` define o chat como agent-driven.
- **Proposta tecnica:** contrato `Chat -> Vertical`, workstreams ARCH-CHAT-0..7, testes futuros e metricas abaixo. Nada disso foi implementado nesta rodada.
- **Decisao de produto pendente:** quais verticais aparecem no primeiro rollout, quais abas viram cockpit, nomenclatura publica, prioridade de UX mobile e criterio de sucesso por vertical.
- **Decisao juridica/comercial pendente:** qualquer provider externo, WhatsApp produtivo, coleta externa, conector comercial, dado de portal, segredo produtivo ou outbound a contraparte depende de decisao explicita fora deste documento.

## 3. Estado atual do frontend com evidencias

| Item | Status | Evidencia |
| --- | --- | --- |
| Navegacao principal | evidenciado/parcial | O shell declara `Runs`, `Chat`, `Billing`, `Marketplace`, `IMOB`, `Self-service` e `Perfil`, filtrando IMOB por entitlement instalado em `apps/web/src/App.tsx:56-92`. |
| Aba Chat | evidenciado/parcial | `/app/chat` renderiza `AgentsPage` dentro de `Layout` e `RequireAuth` em `apps/web/src/App.tsx:299-307`; `/app/agents` redireciona para `/app/chat` em `apps/web/src/App.tsx:262-265` e `apps/web/src/App.tsx:309`. |
| Aba IMOB | evidenciado/parcial | `/app/imob/dashboard` e `/app/imob/chat` existem com `RequireImobInstall` em `apps/web/src/App.tsx:344-366`; rotas legadas de properties/processes/partners redirecionam para dashboard + command center em `apps/web/src/App.tsx:368-384`. |
| IMOB como cockpit | evidenciado/parcial | O layout altera subtitulo para `Imobiliaria Digital Command Center` quando a rota e IMOB em `apps/web/src/App.tsx:82-86`; o dashboard importa APIs de funil, performance, follow-ups, approvals, priority queue, waiting-on e heatmap em `apps/web/src/pages/app/imob/dashboard.tsx:4-39`. |
| ChatAgentLauncher | evidenciado/parcial | O launcher importa helpers do engine como `detectLauncherRouteIntent`, `resolveLauncherTurnDecision`, snapshots e preparacao de run em `apps/web/src/components/agents/ChatAgentLauncher.tsx:26-45`; ainda carrega estado visual, sessao, streaming, upload e persistencia local em `apps/web/src/components/agents/ChatAgentLauncher.tsx:520-690`. |
| Engine frontend | evidenciado/parcial | O engine tipa `LauncherRouteIntent` como `proposal | imob | playbook | help | orchestrator`, modela decisoes e render variants em `apps/web/src/components/agents/chatLauncherEngine.ts:140-218`, e avalia acesso IMOB para surface decisions em `apps/web/src/components/agents/chatLauncherEngine.ts:757-784`. |
| Cards e widgets do Chat IMOB | evidenciado | `ImobChatWidgets` renderiza `commercial_home`, `inventory_showcase`, `case_summary`, `contract_intake_draft`, `contract_intake_result` e `print_bundle` em `apps/web/src/features/imob/ImobChatWidgets.tsx:84-225`. |
| CTAs e gates IMOB | evidenciado/parcial | `ImobAccessGateCard` renderiza GateCard 403, CTA, workspace e trace em `apps/web/src/components/imob/ImobAccessGateCard.tsx:6-45`; erros estruturados IMOB preservam reasonCode/CTA em `apps/web/src/pages/app/imob/chat.tsx:839-889`. |
| Empty/loading/error states | evidenciado/parcial | O front door IMOB tem estados `loading`, `empty`, `error`, `entitlement` e fallback fail-closed em `apps/web/src/pages/app/imob/chat.tsx:891-975`. |
| Receipts/bundles/links | evidenciado | `chatProof.ts` resolve `runId`, `txId`, `receiptPath`, `bundlePath` e `verifyUrl` em `apps/web/src/pages/app/imob/chatProof.ts:16-71`; Command Center renderiza download de dossie e comprovante PDF/HTML em `apps/web/src/features/imob/ImobCommandCenter.tsx:265-321`. |
| Command Center IMOB | evidenciado | Renderiza KPIs, filtros, priority queue, waiting-on board, heatmap, tabela operacional, deep link para chat e comprovantes em `apps/web/src/features/imob/ImobCommandCenter.tsx:67-331`. |
| Suporte mobile/responsivo | parcial | Shell usa nav horizontal com `max-w-[80vw] overflow-x-auto` e breakpoints `sm` em `apps/web/src/App.tsx:124-139`; Command Center usa grids `sm`/`xl` e overflow horizontal em `apps/web/src/features/imob/ImobCommandCenter.tsx:81-152`. Falta smoke mobile dedicado ao padrao universal. |
| Testes frontend relevantes | evidenciado/parcial | Existem testes de `ChatAgentLauncher`, IMOB chat, dashboard, command center, widgets, proof e cards em arquivos listados por `apps/web/src/components/agents/chatLauncherEngine.test.ts`, `apps/web/src/pages/app/imob/chat.*.test.ts`, `apps/web/src/features/imob/ImobCommandCenter.test.tsx` e `apps/web/src/features/imob/ImobChatWidgets.test.tsx`. |

Leitura: o frontend ja tem Chat e IMOB, mas ainda mistura historicamente uma aba IMOB chat com cockpit. O modelo alvo deve preservar `/app/chat` como front door universal e consolidar abas verticais como cockpits operacionais, com deep links contextuais bidirecionais.

## 4. Estado atual do backend/runtime com evidencias

| Item | Status | Evidencia |
| --- | --- | --- |
| Rotas de agentes/protocolo | evidenciado/parcial | `agentsRouter` usa `enforceTenant` e declara `agent-protocol.v1`, contratos realestate HIGH/MEDIUM/LOW e receipt schema em `apps/api/src/routes/agents.ts:20-248`. |
| Rotas IMOB chat | evidenciado | `POST /chat/resolve-turn` valida auth context, mensagem, permissao `imob.chat.use`, escopo de case/thread e tenant recipe em `apps/api/src/routes/imob.ts:1693-1765`. |
| Rotas IMOB cockpit | evidenciado | `GET /command-center/funnel-health` calcula casos bloqueados, aprovacoes, legais, settlements, buckets de aging e reasonCodes em `apps/api/src/routes/imob.ts:2357-2464`; `GET /command-center/blocked-runs` lista runs, reasonCodes, txId, bundleHash, receiptPath e bundlePath em `apps/api/src/routes/imob.ts:2466-2557`. |
| Intent resolver/router | evidenciado/parcial | Catalogo IMOB define entidades, formatos de resposta e policies como `recommend_next_best_action` em `apps/api/src/services/imob/imobIntentCatalog.ts:44-80` e aliases de entidades em `apps/api/src/services/imob/imobIntentCatalog.ts:92-109`. Falta contrato universal de roteamento Chat -> Vertical. |
| Agent runtime gate | evidenciado/parcial | `buildChatRuntimeSnapshot` classifica readiness, resolver, missing fields, onboarding fail-closed, chatEnabled e catalogVisibility em `apps/api/src/services/agentChatRuntime.ts:31-109`. |
| Vertical services IMOB | evidenciado | O contrato IMOB declara `visibleAgentId: "IMOB"`, `dashboardRole`, widgets, backing specialists, surfaces `chat/dashboard/marketplace` e ownership model em `apps/api/src/services/imob/imobAgentContract.ts:20-77`. |
| Entitlement/RBAC | evidenciado | `enforceTenant` exige bearer token, resolve tenant/workspace/user e Prisma tenant-scoped em `apps/api/src/middlewares/enforceTenant.ts:58-155`; `requireScope` chama `checkScopePermission` e retorna 403 com `reasonCode` quando negado em `apps/api/src/middlewares/requireScope.ts:20-64`. |
| IMOB access gate | evidenciado | `imobAccessGate` define reasonCodes `IMOB_ENTITLEMENT_MISSING`, `IMOB_INSTALLATION_INACTIVE`, `IMOB_PERMISSION_DENIED`, CTA, traceId e scope tenant/workspace em `apps/api/src/services/imob/imobAccessGate.ts:7-45` e retorna 403 em `apps/api/src/services/imob/imobAccessGate.ts:179-186`. |
| HITL/approvals | evidenciado/parcial | `resolveImobApprovalGate` exige aprovacao para HIGH/CRITICAL e bloqueia scope mismatch, missing, invalid e expired approvals em `apps/api/src/services/imob/imobApprovalGate.ts:35-107`. Falta padrao visual/transversal unico de gate para todas as verticais. |
| Runs | evidenciado | `runsRouter` lista runs por tenant/workspace, retorna detalhes e eventos, e stream SSE por run em `apps/api/src/routes/runs.ts:61-238`. |
| Bundle | evidenciado | `/runs/:id/bundle` exige `reports.view`, reconstrui evidence bundle, grava ledger `bundle.exported.v1` e retorna `bundleHash`, `hashes` e `files` em `apps/api/src/routes/runs.ts:1473-1504`. |
| Ledger/receipt canon | evidenciado | `/ledger/:txId` exige `ledger.view`, valida txId, resolve run/SCL/bundle, valida invariantes e retorna `receiptCanon` em `apps/api/src/routes/governance.ts:432-735`. |
| ReasonCodes | evidenciado/parcial | RBAC, IMOB access, approvals, command center e receipt canon retornam reasonCodes; ainda falta catalogo unificado do contrato Chat -> Vertical com `verticalId`, `intentId`, `blueprintId` e `reasonCode`. |
| Testes backend relevantes | evidenciado/parcial | Existem testes para `agent-chat-runtime-readiness`, IMOB intent, resolve-turn, vertical entitlement gate, require-scope fail-closed, ledger-bundle, approval gate e varias suites IMOB em `apps/api/src/tests/*`; nao foi executada suite de implementacao porque esta tarefa e documental. |

## 5. Modelo-alvo de produto

- **Chat:** front door universal. Recebe o usuario, resolve intencao, preserva contexto, anuncia handoff e oferece proximo passo. Nao e cockpit.
- **IMOB:** cockpit de carteira, funil, leads, imoveis, propostas, contratos, riscos, documentos, pendencias, command center, next best action, market scan e reconciliacao.
- **Legal:** cockpit de pareceres, risco juridico, clausulas, evidencias e revisoes. Hoje deve permanecer `context_only` quando nao houver baseline operacional.
- **MKT:** cockpit de campanhas, copy, publicacao e gates `publish`. Sem publicacao automatica sem aprovacao.
- **Fin:** cockpit financeiro, cobrancas, invoices, settlements, conciliacao, disputas e reputacao.
- **Log:** cockpit futuro; sem runtime quando inexistente.
- **Runs:** auditoria transversal, timeline, eventos, proof e stream.
- **Marketplace:** ativacao de capacidades, verticais e conectores; nao substitui entitlement/runtime.
- **Billing:** plano, consumo, quota, custo por run, settlement e reconciliacao economica.
- **Perfil:** identidade, roles, permissoes, preferencias, workspace e governanca de acesso.

## 6. Contrato Chat -> Vertical

Contrato conceitual proposto, sem implementacao:

```ts
type ChatVerticalHandoffContractV1 = {
  contractVersion: "chat.vertical-handoff.v1";
  verticalId: "imob" | "legal" | "mkt" | "fin" | "log";
  tenantId: string;
  workspaceId: string;
  scope: string;
  userId: string | null;
  intentId: string;
  blueprintId: string | null;
  handoffMessage: string;
  requiredEntitlement: string | null;
  requiredRoles: string[];
  riskLevel: "read_only" | "assisted" | "critical";
  hitlRequired: boolean;
  nextAction: {
    label: string;
    inputHint?: string;
    targetSurface: "chat" | "vertical_cockpit" | "run_viewer";
  } | null;
  renderHints: {
    badgeLabel: string;
    cockpitHref?: string;
    chatHref?: string;
    widgetKind?: string;
  };
  runId: string | null;
  receiptId: string | null;
  bundleId: string | null;
  reasonCode: string | null;
};
```

Esse contrato deve ser versionado antes da implementacao. Ele deve ser produzido por agente/engine/runtime e apenas renderizado pelo frontend. `ChatAgentLauncher` nao deve inferir `verticalId`, `riskLevel`, entitlement ou `hitlRequired` por conta propria.

## 7. Handoff anunciado e contexto vertical ativo

Padrao UX:

1. Chat detecta intencao pelo agente/engine.
2. Runtime valida tenant, workspace, scope, entitlement e RBAC.
3. Chat anuncia handoff: "Isso e dominio IMOB - vou abrir la."
4. UI exibe badge da vertical ativa, por exemplo `IMOB`.
5. UI mostra especialistas acionados quando o contrato retornar rationale.
6. UI oferece deep link para cockpit da vertical.
7. Cockpit permite voltar ao Chat com `conversationId`, `caseId`, `threadId`, `actionId`, `reasonCode` e autoprompt.

Evidencia parcial existente: IMOB ja constroi deep links do dashboard para chat em `apps/web/src/pages/app/imob/dashboard.tsx:196-220`; Command Center monta `abrir no chat` com case/thread/action/reason/autoprompt em `apps/web/src/features/imob/ImobCommandCenter.tsx:236-259`. O gap e tornar isso padrao universal de contrato, nao regra especifica de IMOB.

## 8. Vertical Cockpit Pattern

Padrao de cockpit para qualquer vertical:

- visao operacional da vertical;
- KPIs e tendencias;
- pendencias e aging;
- alertas e reasonCodes;
- acoes recomendadas;
- approvals/HITL pendentes;
- runs recentes e status;
- receipts, bundles e verify links;
- deep links para Chat;
- filtros por tenant/workspace/scope;
- PII masking e exibicao por referencia parcial quando aplicavel;
- empty/loading/error/entitlement fail-closed.

IMOB ja materializa parte desse padrao: dashboard carrega owners, properties, cases, runs, costs, priority queue, waiting-on, heatmap, specialist load, rescue index, approval context, follow-ups e KPIs em `apps/web/src/pages/app/imob/dashboard.tsx:310-336`. O padrao deve virar template para Legal/MKT/Fin/Log em fases futuras.

## 9. Aplicacao ao IMOB

Aplicacao inicial:

- **Carteira/funil:** IMOB dashboard e Command Center consolidam casos, estados, funil, priorities e reasonCodes.
- **Leads/imoveis:** schema e rotas IMOB ja sustentam leads/cases/properties; frontend tem tabs e deep links para chat.
- **Propostas/contratos:** IMOB tem widgets, action catalog, contract intake/generator e proof surface; falta padrao transversal de HITL/gate rendering.
- **Riscos/documentos:** Command Center ja apresenta bloqueios e pendencias; falta taxonomia unica de risk alert no contrato universal.
- **Next best action:** existe intent policy e recommendedActions; falta contrato universal para renderizar `nextAction` de qualquer vertical.
- **Market scan:** permanece capacidade IMOB, acionada por Chat e refletida no cockpit.
- **Reconciliacao:** runs, ledger, bundle e costs aparecem no cockpit, mas o modelo universal deve garantir coverage por vertical.
- **Run/receipt/bundle:** proof ja aparece em chat e command center, com endpoint `/runs/:id/bundle` e `/ledger/:txId`.

Relacao com a proposta IMOB Chat Agentic Ops / LIBRARY_v1: `docs/proposals/imob-chat-agentic-ops-library-integration.md` define a evolucao IMOB como operador agentic comercial-operacional e classifica `LIBRARY_v1.md anexado` como fonte externa; este ARCH-CHAT-0 posiciona essa evolucao dentro de um modelo universal de Chat front door + vertical cockpit.

## 10. Workstreams de implementacao

### ARCH-CHAT-0 - Discovery & Contract Proposal

- **Objetivo:** documentar estado atual, gaps e contrato conceitual.
- **Arquivos provaveis:** `docs/proposals/universal-chat-front-door-vertical-operating-model.md`.
- **Escopo:** documental/read-only.
- **Fora de escopo:** codigo, runtime, schema, UI, workflows.
- **Dependencias:** normativos de chat e roadmap v8.1.
- **Riscos:** tratar proposta como implementacao.
- **DoD:** doc criado, evidencias `arquivo:linha`, checks documentais verdes.
- **Checks:** `pnpm check:evidence-index`, `pnpm check:docs-link-integrity`, `git diff --check`, diff de isolamento.

### ARCH-CHAT-1 - Chat/Vertical Navigation Semantics

- **Objetivo:** definir papel publico de Chat como front door e abas verticais como cockpits.
- **Arquivos provaveis:** `apps/web/src/App.tsx`, docs de UX, testes de rotas.
- **Dependencias:** decisao de produto sobre nomenclatura.
- **Riscos:** IMOB continuar parecendo chat paralelo.
- **DoD:** rotas e labels documentados/testados, sem regra de negocio nova no frontend.
- **Checks:** testes de App/nav, docs, launcher render-only.

### ARCH-CHAT-2 - Handoff Contract v1

- **Objetivo:** versionar contrato `Chat -> Vertical`.
- **Arquivos provaveis:** `contracts/`, `apps/api/src/services/agentChatRuntime.ts`, servicos de vertical.
- **Dependencias:** schema de verticalId/intentId/blueprintId/reasonCode.
- **Riscos:** breaking change sem baseline.
- **DoD:** contrato versionado, baseline, exemplo, contract tests.
- **Checks:** compatibilidade de contrato e testes de fail-closed.

### ARCH-CHAT-3 - Frontend Render Hints / Vertical Context Badge

- **Objetivo:** renderizar badge de vertical ativa, handoff anunciado e especialistas acionados.
- **Arquivos provaveis:** `ChatAgentLauncher`, `chatPresentationSnapshot`, componentes compartilhados.
- **Dependencias:** ARCH-CHAT-2.
- **Riscos:** launcher inferir regra cognitiva.
- **DoD:** launcher apenas renderiza `renderHints`; testes provam ausencia de regra de negocio.
- **Checks:** `pnpm check:chat-launcher-render-only`, testes de snapshot.

### ARCH-CHAT-4 - IMOB Cockpit Deep Link Contract

- **Objetivo:** padronizar ida Chat -> cockpit e cockpit -> Chat com contexto.
- **Arquivos provaveis:** IMOB dashboard, Command Center helper, API presentation metadata.
- **Dependencias:** ARCH-CHAT-2/3.
- **Riscos:** deep links especificos demais para IMOB.
- **DoD:** contrato de links com `conversationId/caseId/threadId/actionId/reasonCode/autoprompt`, testes de preservacao.
- **Checks:** testes IMOB dashboard/chat e regressao de command center.

### ARCH-CHAT-5 - HITL/Gate Rendering Standard

- **Objetivo:** padronizar componente de approve/reject/adjust/timeout.
- **Arquivos provaveis:** componentes compartilhados de gate, services de approval.
- **Dependencias:** approval policy e reasonCodes.
- **Riscos:** frontend decidir allowed/blocked.
- **DoD:** UI render-only; decisoes continuam no backend/runtime.
- **Checks:** testes de approve/reject/adjust/timeout e approval fail-closed.

### ARCH-CHAT-6 - Receipt/Bundle Rendering Standard

- **Objetivo:** padronizar exibicao de proof, receipt, bundle e verifyUrl em Chat e cockpits.
- **Arquivos provaveis:** proof components, RunViewer, IMOB proof helpers, API types.
- **Dependencias:** receipt canon e bundle endpoints.
- **Riscos:** link quebrado ou proof incompleto parecer sucesso.
- **DoD:** render states `not_required/pending/ready/failed`, links auditaveis e testes.
- **Checks:** ledger/bundle contract, UI proof tests.

### ARCH-CHAT-7 - IMOB Pilot Integration Plan

- **Objetivo:** aplicar o modelo universal ao IMOB em rollout controlado.
- **Arquivos provaveis:** docs/ops, IMOB dashboard/chat tests, runtime contract tests.
- **Dependencias:** ARCH-CHAT-1..6.
- **Riscos:** declarar IMOB fechado sem ciclo de evidencia.
- **DoD:** shadow -> pilot -> small com gates, metricas e rollback.
- **Checks:** smoke IMOB, contract tests, docs link integrity, evidence index quando houver evidencia real.

## 11. Governanca, seguranca e boundaries

- Core governa.
- Chat orquestra.
- Vertical executa.
- Frontend renderiza.
- `ChatAgentLauncher` permanece render-only.
- WhatsApp e canal, nao motor paralelo.
- Nenhuma acao critica sem HITL.
- Nenhuma mutacao sensivel sem run/receipt/bundle quando aplicavel.
- `tenantId`, `workspaceId` e `scope` sao obrigatorios para execucao sensivel.
- PII masking obrigatorio antes de log, output, bundle ou outbound.
- Fail-closed para entitlement, RBAC, policy, scope e binding.
- Verticais `context_only` nao viram operacionais sem baseline, contrato, gates, decisao explicita e evidencia.

## 12. Testes necessarios

- Contract tests `Chat -> Vertical` com `verticalId`, `intentId`, `blueprintId`, `reasonCode`, `renderHints`.
- Entitlement denied: IMOB/Legal/MKT/Fin sem entitlement deve retornar fail-closed com CTA apropriado.
- Missing role: RBAC negado por scope deve manter reasonCode.
- Missing scope: request sem tenant/workspace/scope deve bloquear.
- Handoff announced: toda transicao Chat -> vertical deve ter mensagem explicita.
- Vertical badge rendered: UI renderiza badge apenas quando contrato fornece vertical ativa.
- HITL approve/reject/adjust/timeout: UI renderiza estados; backend decide.
- Receipt/bundle link: links prontos, pendentes e falhos renderizados corretamente.
- IMOB deep link: cockpit -> chat preserva contexto e autoprompt.
- Mobile/responsive smoke: Chat, badge, gate e cockpit sem overflow incoerente.
- No business logic in `ChatAgentLauncher`: gate dedicado continua bloqueando regressao.

## 13. Metricas de sucesso

- `% intents roteadas com verticalId`.
- `% handoffs anunciados corretamente`.
- `% acoes sensiveis com HITL`.
- `% runs com receipt/bundle`.
- Tempo ate proxima melhor acao.
- Uso de cockpit por vertical.
- Conversao Chat -> cockpit.
- Erros fail-closed por reasonCode.
- Cobertura de testes por contrato.
- `% renderHints consumidos sem fallback local`.
- `ChatAgentLauncher business-logic diff count`, esperado zero.

## 14. Riscos e mitigacao

- **Duplicacao de chat por vertical:** reposicionar abas verticais como cockpits; Chat universal permanece entrada principal.
- **Regra de negocio no frontend:** contrato versionado + check render-only + testes de snapshot.
- **Drift docs/contracts/runtime:** baseline, examples e CI de compatibilidade.
- **UX confusa entre Chat e cockpit:** handoff anunciado, badge de vertical ativa e deep links claros.
- **WhatsApp virar pipeline paralelo:** adapter deve consumir o mesmo contrato `Chat -> Vertical`.
- **Acoes criticas sem prova:** bloquear sem HITL/run/receipt/bundle.
- **Falta de versionamento:** ARCH-CHAT-2 antes de UI nova.
- **Implementacao grande demais:** PRs pequenos ARCH-CHAT-1..7.
- **Promover vertical context_only indevidamente:** manter fail-closed ate haver baseline e evidencia.

## 15. Questoes em aberto

### Produto

- A aba `IMOB` deve apontar sempre para dashboard/cockpit, removendo a percepcao de chat dedicado?
- Quais verticais entram no primeiro padrao de cockpit apos IMOB?
- Qual linguagem publica para Legal/MKT/Fin/Log antes do runtime operacional?

### UX

- Como representar vertical ativa sem parecer troca brusca de bot?
- Qual padrao mobile para badge, proof e gate?
- Quando exibir deep link para cockpit e quando manter usuario no Chat?

### Arquitetura

- O contrato `Chat -> Vertical` vive em `contracts/` ou em pacote compartilhado?
- O `blueprintId` deve apontar para `EIAH_CONVERSATION_LIBRARY_v1` versionada?
- Como evitar duplicidade entre `chatPresentationSnapshot` e presentation metadata IMOB?

### Seguranca

- Qual scope minimo para cada cockpit vertical?
- Quais gates exigem approval duplo?
- Como auditar handoff negado por entitlement/RBAC?

### Dados

- Quais campos do contrato podem ser persistidos sem PII?
- Qual retencao para handoff snapshots?
- Como mascarar contexto em WhatsApp sem perder utilidade?

### Rollout

- Qual tenant piloto para ARCH-CHAT-7?
- Quais checks entram no CI antes de liberar pilot?
- Quais metricas determinam passagem de shadow para pilot?

## 16. DoD e proximos passos

DoD documental desta proposta:

- CODEX e normativos lidos.
- Estado atual frontend/backend mapeado com `arquivo:linha`.
- Gaps separados de evidencias atuais.
- Contrato conceitual definido sem implementacao.
- Roadmap ARCH-CHAT-0..7 em PRs pequenos.
- Boundaries de governanca preservados.
- Nenhuma alteracao em codigo, schema, config, runtime, engine, workflows, packages ou lockfile.
- Checks obrigatorios executados.

Condicao para iniciar implementacao:

1. Aprovar o contrato `Chat -> Vertical` como baseline versionado.
2. Definir decisao de produto para Chat universal versus abas/cockpits.
3. Criar testes de contrato antes de alterar UI.
4. Preservar `ChatAgentLauncher` render-only.
5. Iniciar por IMOB em shadow, sem declarar runtime finalizado.

Proximos PRs recomendados:

1. ARCH-CHAT-1: semantica de navegacao Chat/vertical cockpit.
2. ARCH-CHAT-2: contrato versionado `chat.vertical-handoff.v1`.
3. ARCH-CHAT-3: render hints e badge de vertical ativa.
4. ARCH-CHAT-4: contrato de deep link IMOB.
5. ARCH-CHAT-5: gate rendering standard.
6. ARCH-CHAT-6: receipt/bundle rendering standard.
7. ARCH-CHAT-7: plano piloto IMOB shadow -> pilot -> small.

Checks obrigatorios desta rodada:

- `pnpm check:evidence-index`
- `pnpm check:docs-link-integrity`
- `git diff --check`
- `git diff -- .github/workflows release.yml apps packages scripts`

Status final: proposta/parcial evidenciada documentalmente.
