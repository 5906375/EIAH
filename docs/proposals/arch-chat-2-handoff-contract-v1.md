# ARCH-CHAT-2 — Handoff Contract v1

> Status: proposta/parcial evidenciada documentalmente.
>
> Escopo desta rodada: proposta documental/contracts-first do contrato `Chat -> Vertical`. Nenhum codigo, schema Prisma, seed, migracao, config, workflow, package, lockfile, runtime, engine, `ChatAgentLauncher`, componente, rota, provider, WhatsApp produtivo, secret produtivo ou mutacao critica foi alterado.
>
> Este documento nao declara contrato implementado, nao declara IMOB fechado e nao declara WhatsApp operacional.

## 1. Sumario executivo

ARCH-CHAT-2 propoe o contrato versionado `Chat -> Vertical` para sustentar o modelo em que o Chat funciona como front door universal, enquanto verticais como IMOB, Legal, MKT, Fin e Log operam como cockpits/command centers acionados por intencao, entitlement e contexto.

O objetivo e separar decisao e renderizacao:

- Core governa.
- Chat orquestra.
- Vertical executa.
- Frontend renderiza.
- `ChatAgentLauncher` permanece render-only.

O contrato deve permitir que desktop, mobile e WhatsApp sejam canais do mesmo Chat logico, sem criar motores paralelos ou chats independentes por vertical. IMOB e a primeira vertical profunda observada no codebase: ja possui agent contract, intents, resolve-turn, gates de entitlement/RBAC, dashboard, Command Center, widgets, proof, receipts, bundles e ledger. A lacuna e que esses blocos ainda nao estao reunidos em um contrato universal `chat.vertical_handoff.v1`.

Este documento versiona conceitualmente esse contrato antes de qualquer implementacao visual, runtime ou engine.

## 2. Fontes e classificacao de evidencia

### Fontes lidas

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/proposals/universal-chat-front-door-vertical-operating-model.md`
- `docs/proposals/arch-chat-1-navigation-semantics.md`
- `docs/proposals/imob-chat-agentic-ops-library-integration.md`
- `docs/proposals/imob-data-sources.md`
- `apps/web/src/App.tsx`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/web/src/components/agents/chatLauncherEngine.ts`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chatProof.ts`
- `apps/web/src/pages/app/imob/dashboard.tsx`
- `apps/web/src/features/imob/ImobChatWidgets.tsx`
- `apps/web/src/features/imob/ImobCommandCenter.tsx`
- `apps/web/src/components/imob/ImobAccessGateCard.tsx`
- `apps/api/src/routes/agents.ts`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/routes/runs.ts`
- `apps/api/src/routes/governance.ts`
- `apps/api/src/middlewares/enforceTenant.ts`
- `apps/api/src/middlewares/requireScope.ts`
- `apps/api/src/services/agentChatRuntime.ts`
- `apps/api/src/services/imob/imobAgentContract.ts`
- `apps/api/src/services/imob/imobIntentCatalog.ts`
- `apps/api/src/services/imob/imobAccessGate.ts`
- `apps/api/src/services/imob/imobApprovalGate.ts`
- `apps/api/src/services/imob/imobArtifactCapabilities.ts`
- `contracts/`

### Classificacao

- **Fato do codebase:** afirmacao verificavel por `arquivo:linha`.
- **Fato documental:** regra registrada em documento do repositorio.
- **Proposta tecnica:** shape e regras futuras do contrato `chat.vertical_handoff.v1`.
- **Decisao de produto pendente:** nomenclatura final, destino primario de abas verticais e ordem de rollout visual.
- **Decisao de implementacao futura:** onde materializar schema, baseline, exemplo, contract tests, runtime producer e render hints.

### Fatos documentais relevantes

- `AGENTS.md:1-31` exige arquitetura `agent-driven`: contrato do agente primeiro, engine executa e launcher renderiza.
- `docs/architecture/agent-chat-runtime.md:1-45` define que o comportamento do chat deve ser orientado pelo agente, nao pela interface.
- `docs/architecture/agent-chat-runtime.md:64-85` define o launcher como interface render-first e proibe que ele decida especialista, handoff ou quick replies por conta propria.
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` registra que o Chat Agent Launcher EIAH e front door, que o engine decide handoff para verticais e que sem entitlement ativo o fluxo deve falhar em modo fail-closed.
- `docs/proposals/arch-chat-1-navigation-semantics.md` define o alvo: `Chat` como front door universal e abas verticais como cockpits/command centers.

## 3. Estado atual relevante com evidencias

| Item | Status | Evidencia |
| --- | --- | --- |
| Chat geral | evidenciado/parcial | `/app/chat` renderiza `AgentsPage` com auth em `apps/web/src/App.tsx:299-307`; `/app/agents` redireciona para `/app/chat` em `apps/web/src/App.tsx:262-265` e `apps/web/src/App.tsx:309`. |
| Navegacao vertical IMOB | evidenciado/parcial | O shell declara `Chat` em `/app/chat` e `IMOB` em `/app/imob/chat`, exigindo IMOB instalado, em `apps/web/src/App.tsx:56-64`; ARCH-CHAT-1 classifica isso como gap semantico. |
| Superficies IMOB | evidenciado | `/app/imob/dashboard` e `/app/imob/chat` existem com auth e `RequireImobInstall` em `apps/web/src/App.tsx:344-366`; rotas legadas de IMOB redirecionam para dashboard + Command Center em `apps/web/src/App.tsx:368-384`. |
| Launcher render-first | evidenciado/parcial | `ChatAgentLauncher` importa helpers do engine como `detectLauncherRouteIntent`, `resolveLauncherTurnDecision` e snapshots em `apps/web/src/components/agents/ChatAgentLauncher.tsx:26-45`; o normativo proibe nova regra cognitiva direta no launcher. |
| Engine route intent | evidenciado/parcial | O engine tipa `LauncherRouteIntent` como `proposal | imob | playbook | help | orchestrator` e modela decisoes/render variants em `apps/web/src/components/agents/chatLauncherEngine.ts:140-218`. Falta contrato universal de handoff. |
| Agent runtime gate | evidenciado/parcial | `buildChatRuntimeSnapshot` classifica readiness, resolver, missing fields, `chatEnabled`, `catalogVisibility` e bloqueio `missing_minimum_contract` em `apps/api/src/services/agentChatRuntime.ts:31-109`. |
| Agent Protocol | evidenciado | `agentsRouter` usa `enforceTenant`, declara `agent-protocol.v1` e action contracts com `tier`, `txIdRequired`, schemas, receipt schema e trust requirements em `apps/api/src/routes/agents.ts:20-248`. |
| IMOB agent contract | evidenciado | `buildImobAgentContractV1` declara `imob.case_concierge.v1`, `visibleName`, role `vertical_case_concierge`, surfaces `chat`, `dashboard`, `marketplace` e ownership model em `apps/api/src/services/imob/imobAgentContract.ts:46-77`. |
| IMOB experience contract | evidenciado | O contrato IMOB declara `sourceOfTruth`, `visibleAgentId`, `dashboardRole`, widgets e backing specialists em `apps/api/src/services/imob/imobAgentContract.ts:20-38`. |
| IMOB intents | evidenciado/parcial | O catalogo define `intentId`, `coreIntent`, journeys, response format, `nextActionPolicy` e quick replies em `apps/api/src/services/imob/imobIntentCatalog.ts:60-80`; entidades incluem lead, proposta, contrato, visita, documento, anuncio, pagamento e dashboard em `apps/api/src/services/imob/imobIntentCatalog.ts:92-109`. |
| Resolve-turn IMOB | evidenciado | `POST /chat/resolve-turn` valida auth context, message, case/thread/action/recipe, permissao `imob.chat.use`, escopo tenant/workspace e tenant recipe em `apps/api/src/routes/imob.ts:1693-1768`. |
| Tenant/workspace/scope | evidenciado | `enforceTenant` exige token, resolve `tenantId`, `workspaceId`, `userId`, injeta Prisma tenant-scoped e valida delegacao em `apps/api/src/middlewares/enforceTenant.ts:58-155`. |
| RBAC | evidenciado | `requireScope` chama `checkScopePermission` com tenant/workspace/user/token/scope e retorna 403 com `reasonCode` quando negado em `apps/api/src/middlewares/requireScope.ts:20-64`. |
| Entitlement/access gate IMOB | evidenciado | `imobAccessGate` define reasonCodes `IMOB_ENTITLEMENT_MISSING`, `IMOB_INSTALLATION_INACTIVE`, `IMOB_PERMISSION_DENIED`, CTA, traceId e scope tenant/workspace em `apps/api/src/services/imob/imobAccessGate.ts:7-45`; responde 403 em `apps/api/src/services/imob/imobAccessGate.ts:179-186`. |
| HITL/approval | evidenciado/parcial | `resolveImobApprovalGate` exige aprovacao para HIGH/CRITICAL e bloqueia por `APPROVAL_SCOPE_MISMATCH`, `APPROVAL_REQUIRED`, `APPROVAL_INVALID` e `APPROVAL_EXPIRED` em `apps/api/src/services/imob/imobApprovalGate.ts:35-107`. Falta padrao universal de gate renderizado. |
| Runs | evidenciado | `runsRouter` lista runs por tenant/workspace, busca run, eventos, critical log e stream SSE em `apps/api/src/routes/runs.ts:61-238`. |
| Bundle | evidenciado | `/runs/:id/bundle` exige `reports.view`, reconstrui evidence bundle, registra ledger `bundle.exported.v1` e retorna `bundleHash`, `hashes` e `files` em `apps/api/src/routes/runs.ts:1473-1504`. |
| Ledger/receipt | evidenciado | `/ledger/:txId` exige `ledger.view`, valida txId, resolve run/SCL/bundle, valida invariantes e retorna `receiptCanon` em `apps/api/src/routes/governance.ts:432-735`. |
| Export de conversa IMOB | evidenciado | Export IMOB coleta mensagens, `runId`, `txId`, `receiptPath`, `bundlePath`, proof, telemetry, links, hash SHA-256 e business export em `apps/api/src/routes/imob.ts:3580-3828`. |
| Artifact capabilities | evidenciado | IMOB capabilities controlam abrir chat, ver dossie, receipt e run bundle, exigindo `reports.view` para bundle em `apps/api/src/services/imob/imobArtifactCapabilities.ts:16-63`. |
| Frontend cards/widgets | evidenciado | `ImobChatWidgets` renderiza quick actions, inventory, case summary, contract intake, print bundle, checklist, next step e especialistas em `apps/web/src/features/imob/ImobChatWidgets.tsx:84-225`. |
| Frontend proof links | evidenciado | `chatProof.ts` resolve `runId`, `txId`, `receiptPath`, `bundlePath`, `verifyUrl`, `required`, `ready` e `state` em `apps/web/src/pages/app/imob/chatProof.ts:16-71`. |
| Existing schemas/contracts | evidenciado/parcial | Ha contratos versionados em `contracts/`, incluindo `agent-protocol.v1`, `presentation-snapshot.v1`, `receipt-canon.v1`, economy receipt e varios schemas IMOB; nao ha `chat.vertical_handoff.v1` observado na lista de `contracts/`. |
| Contrato universal de handoff | inexistente | Nao foi encontrado schema/baseline/exemplo `chat.vertical_handoff.v1`; hoje existem pecas por IMOB, Agent Protocol e presentation snapshot, mas nao um contrato transversal `Chat -> Vertical`. |

## 4. Objetivos do contrato Chat -> Vertical

O contrato `chat.vertical_handoff.v1` deve:

- padronizar handoff entre Chat e vertical;
- impedir que cada vertical vire chat paralelo;
- carregar contexto minimo obrigatorio: tenant, workspace, scope, user, vertical, intent e reason;
- separar decisao de renderizacao;
- preservar governanca agent-driven;
- preservar fail-closed por entitlement, RBAC, tenant/workspace/scope e policy;
- permitir renderizacao transversal em web desktop, web mobile e WhatsApp;
- permitir deep link para cockpit, chat contextual e runs;
- carregar referencias de prova quando existirem: `runId`, `receiptId`, `bundleId`;
- preparar ARCH-CHAT-3, ARCH-CHAT-4, ARCH-CHAT-5 e ARCH-CHAT-6;
- manter `ChatAgentLauncher` como consumidor de resultado resolvido, sem inferencia propria.

O contrato nao deve:

- executar provider externo;
- criar mutacao;
- conceder autorizacao produtiva;
- substituir Agent Protocol;
- substituir Receipt Canon;
- substituir contrato especifico de cada vertical;
- expor PII sensivel;
- promover vertical `context_only` para operacional.

## 5. Contrato conceitual v1

Shape conceitual proposto:

```ts
type ChatVerticalHandoffV1 = {
  version: "chat.vertical_handoff.v1";
  handoffId: string;

  tenantId: string;
  workspaceId: string;
  scope: string;
  userId: string;

  verticalId: string;
  intentId: string;
  blueprintId?: string;

  requiredEntitlement?: string;
  requiredRoles?: string[];

  handoffMessage: string;
  reasonCode: string;

  riskLevel: "read_only" | "assisted" | "critical";
  hitlRequired: boolean;

  renderHints?: {
    verticalBadge?: string;
    suggestedSurface?: "chat" | "cockpit" | "runs";
    ctaLabel?: string;
    cockpitDeepLink?: string;
  };

  runId?: string;
  receiptId?: string;
  bundleId?: string;
};
```

### Semantica dos campos

| Campo | Obrigatorio | Semantica |
| --- | --- | --- |
| `version` | sim | Versao fixa do contrato. Breaking change exige nova major/version. |
| `handoffId` | sim | Identificador unico do handoff para rastreabilidade e idempotencia de apresentacao. |
| `tenantId` | sim | Escopo tenant. Ausencia deve falhar fechado. |
| `workspaceId` | sim | Escopo workspace. Ausencia deve falhar fechado. |
| `scope` | sim | Scope operacional/RBAC exigido para a intencao ou superficie. |
| `userId` | sim | Ator humano ou usuario autenticado associado ao handoff. |
| `verticalId` | sim | Vertical destino: `imob`, `legal`, `mkt`, `fin`, `log` ou futura vertical versionada. |
| `intentId` | sim | Intencao resolvida pelo agente/engine/runtime. |
| `blueprintId` | nao | Blueprint/jornada/capacidade quando houver baseline. |
| `requiredEntitlement` | condicional | Entitlement/produto/capacidade necessaria para permitir handoff. |
| `requiredRoles` | condicional | Roles/permissoes minimas para renderizar/operar a proxima etapa. |
| `handoffMessage` | sim | Mensagem de handoff ja decidida pelo agente/engine. |
| `reasonCode` | sim | Motivo do handoff, bloqueio, degradacao ou escolha da vertical. |
| `riskLevel` | sim | Classifica se a proxima etapa e leitura, assistida ou critica. |
| `hitlRequired` | sim | Indica se aprovacao humana e obrigatoria antes de acao sensivel. |
| `renderHints` | nao | Dicas de UI derivadas da decisao, nao regras de negocio. |
| `runId` | condicional | Referencia a run quando ja existir execucao/auditoria associada. |
| `receiptId` | condicional | Referencia a receipt quando aplicavel. |
| `bundleId` | condicional | Referencia a bundle/evidence pack quando aplicavel. |

### Invariantes

- `version` deve ser literal e validavel.
- `tenantId`, `workspaceId`, `scope`, `verticalId`, `intentId`, `handoffMessage`, `reasonCode`, `riskLevel` e `hitlRequired` nao podem ser inferidos pelo frontend.
- `riskLevel=critical` exige `hitlRequired=true`, salvo policy explicita futura documentada e testada.
- `renderHints.suggestedSurface` nao autoriza execucao; apenas orienta renderizacao.
- `cockpitDeepLink` deve ser deep link interno controlado, nunca URL externa arbitraria.
- `runId`, `receiptId` e `bundleId` sao referencias opcionais de prova; ausencia nao deve ser apresentada como sucesso operacional.
- Vertical sem contrato minimo completo deve permanecer fail-closed, alinhado a `buildChatRuntimeSnapshot` e `applyChatRuntimeGateToParticipation`.

## 6. Campos obrigatorios e validacoes

### Obrigatorios em qualquer handoff valido

- `version`
- `handoffId`
- `tenantId`
- `workspaceId`
- `scope`
- `userId`
- `verticalId`
- `intentId`
- `handoffMessage`
- `reasonCode`
- `riskLevel`
- `hitlRequired`

### Validacoes minimas propostas

- `tenantId`, `workspaceId`, `scope`, `userId`, `verticalId`, `intentId`, `handoffMessage` e `reasonCode` devem ser strings nao vazias.
- `verticalId` deve pertencer ao catalogo de verticais conhecidas ou a um registro versionado futuro.
- `riskLevel` deve ser exatamente `read_only`, `assisted` ou `critical`.
- `renderHints.suggestedSurface` deve ser exatamente `chat`, `cockpit` ou `runs`.
- `requiredRoles` deve ser lista de strings nao vazias quando presente.
- `requiredEntitlement` deve ser string nao vazia quando presente.
- `cockpitDeepLink` deve ser path interno relativo, por exemplo `/app/imob/dashboard?...`, e nao URL absoluta externa.
- `runId`, `receiptId` e `bundleId`, quando presentes, devem ser strings nao vazias.

### Fail-closed de contrato

Um handoff deve ser invalido/bloqueado se:

- faltar tenant/workspace/scope;
- faltar vertical;
- faltar intent;
- faltar reasonCode;
- vertical nao estiver instalada/autorizada quando `requiredEntitlement` for exigido;
- RBAC negar o `scope`;
- `riskLevel=critical` vier sem `hitlRequired=true`;
- `suggestedSurface=cockpit` vier sem cockpit autorizado;
- `suggestedSurface=runs` vier sem run/prova ou capability aplicavel;
- o contrato da vertical estiver incompleto.

## 7. ReasonCodes e estados

### ReasonCodes propostos para handoff valido

- `CHAT_VERTICAL_HANDOFF_READY`
- `CHAT_VERTICAL_HANDOFF_CONTEXTUAL`
- `CHAT_VERTICAL_HANDOFF_TO_COCKPIT`
- `CHAT_VERTICAL_HANDOFF_TO_RUNS`
- `CHAT_VERTICAL_HANDOFF_READ_ONLY`
- `CHAT_VERTICAL_HANDOFF_ASSISTED`
- `CHAT_VERTICAL_HANDOFF_CRITICAL_PENDING_HITL`

### ReasonCodes propostos para bloqueio/fail-closed

- `CHAT_VERTICAL_HANDOFF_INVALID_CONTRACT`
- `CHAT_VERTICAL_HANDOFF_TENANT_MISSING`
- `CHAT_VERTICAL_HANDOFF_WORKSPACE_MISSING`
- `CHAT_VERTICAL_HANDOFF_SCOPE_MISSING`
- `CHAT_VERTICAL_HANDOFF_USER_MISSING`
- `CHAT_VERTICAL_HANDOFF_VERTICAL_MISSING`
- `CHAT_VERTICAL_HANDOFF_INTENT_MISSING`
- `CHAT_VERTICAL_HANDOFF_REASON_MISSING`
- `CHAT_VERTICAL_HANDOFF_ENTITLEMENT_REQUIRED`
- `CHAT_VERTICAL_HANDOFF_RBAC_DENIED`
- `CHAT_VERTICAL_HANDOFF_VERTICAL_CONTRACT_INCOMPLETE`
- `CHAT_VERTICAL_HANDOFF_HITL_REQUIRED`
- `CHAT_VERTICAL_HANDOFF_SURFACE_UNAVAILABLE`
- `CHAT_VERTICAL_HANDOFF_PROOF_UNAVAILABLE`

### Estados de resultado propostos

```ts
type ChatVerticalHandoffStatus =
  | "ready"
  | "blocked"
  | "degraded"
  | "needs_human_approval"
  | "context_only";
```

O status pode ser derivado por producer/runtime, mas nao precisa estar no shape minimo v1 se `reasonCode`, `riskLevel`, `hitlRequired` e `renderHints` forem suficientes para a primeira baseline. A decisao de incluir `status` no schema fisico fica para a fase de implementacao.

## 8. RenderHints e superficies

`renderHints` serve para renderizacao, nao para autorizacao.

### Campos iniciais

- `verticalBadge`: badge exibivel, por exemplo `IMOB`.
- `suggestedSurface`: superficie preferencial de continuidade: `chat`, `cockpit` ou `runs`.
- `ctaLabel`: label curto para o CTA.
- `cockpitDeepLink`: path interno para cockpit, quando aplicavel.

### Regras

- O producer do contrato decide os hints; frontend apenas renderiza.
- `suggestedSurface=chat` indica continuidade conversacional contextual.
- `suggestedSurface=cockpit` indica que a vertical possui cockpit apropriado para acompanhar a operacao.
- `suggestedSurface=runs` indica continuidade em auditoria/prova.
- `ctaLabel` nao deve conter PII nem prometer execucao critica.
- Hints ausentes devem degradar para texto seguro, nao para inferencia local.

### Exemplos de mapeamento inicial

| Caso | `suggestedSurface` | Exemplo |
| --- | --- | --- |
| Usuario pede "ver fila IMOB" | `cockpit` | Abrir `/app/imob/dashboard?cc=open#command-center`. |
| Usuario continua um caso especifico | `chat` | Abrir `/app/imob/chat?caseId=...&threadId=...`. |
| Usuario pede prova de execucao | `runs` | Abrir `/app/runs?runId=...` ou endpoint de ledger/bundle autorizado. |

## 9. Deep links e superficies

### Principios

- Deep links devem preservar contexto, mas nao autorizar acao por si so.
- Tenant/workspace/scope continuam validados no destino.
- Links devem ser internos e governados.
- Rotas legadas devem redirecionar para destino canonico quando houver contrato.
- Falha de entitlement ou RBAC deve mostrar gate/reasonCode, nao continuar silenciosamente.

### IMOB atual

IMOB ja possui alguns blocos de deep link:

- Dashboard para chat com `conversationId`, `caseId`, `threadId` e `autoprompt` em `apps/web/src/pages/app/imob/dashboard.tsx:196-220`.
- Command Center para chat com `conversationId`, `caseId`, `threadId`, `actionId`, `reasonCode` e `autoprompt` em `apps/web/src/features/imob/ImobCommandCenter.tsx:236-259`.
- Rotas legadas de IMOB para dashboard/Command Center em `apps/web/src/App.tsx:368-384`.
- Runs legados com `domain=imob` redirecionados para dashboard/Command Center em `apps/web/src/App.tsx:267-283`.

### Lacuna

Esses links existem como comportamento IMOB especifico. O contrato `chat.vertical_handoff.v1` deve transformar o padrao em interoperavel, para que Legal/MKT/Fin/Log nao criem deep links e regras ad hoc divergentes.

## 10. HITL, riskLevel e governanca

### Risk levels

- `read_only`: leitura, explicacao, resumo, navegacao ou consulta sem side effect.
- `assisted`: preparacao de rascunho, sugestao, checklist, priorizacao ou acao pendente de confirmacao.
- `critical`: acao sensivel, externa, financeira, juridica, mutacional, publish, contrato, outbound ou execucao que exige trilha auditavel.

### HITL

`hitlRequired` deve ser verdadeiro quando:

- `riskLevel=critical`;
- houver outbound para contraparte;
- houver proposta, contrato, publish, assinatura, financeiro ou mutacao sensivel;
- policy da vertical exigir aprovacao;
- approval gate retornar pendencia.

IMOB ja possui gate parcial para HIGH/CRITICAL em `apps/api/src/services/imob/imobApprovalGate.ts:35-107`. O contrato universal deve padronizar como essa decisao chega ao Chat e ao cockpit, sem que frontend decida permitido/bloqueado.

### Governanca

O contrato deve carregar ou apontar para:

- reasonCode;
- required entitlement;
- required roles;
- run/receipt/bundle quando aplicavel;
- superficie sugerida;
- mensagem de handoff.

O contrato nao substitui approval records, ledger, receipt canon ou Agent Protocol; ele referencia esses elementos no momento de handoff.

## 11. Entitlement, RBAC e fail-closed

### Requisitos

Antes de produzir handoff `ready`, o producer/runtime deve validar:

- bearer/auth context;
- tenantId;
- workspaceId;
- userId;
- scope;
- entitlement/produto/capacidade;
- RBAC/roles;
- contrato minimo da vertical;
- status de instalacao da vertical;
- policy de risco/HITL.

### Evidencia atual

- `enforceTenant` resolve auth context e Prisma tenant-scoped em `apps/api/src/middlewares/enforceTenant.ts:58-155`.
- `requireScope` aplica `checkScopePermission` e retorna 403 com `reasonCode` em `apps/api/src/middlewares/requireScope.ts:20-64`.
- IMOB access gate retorna reasonCodes e CTA por instalacao/permissao em `apps/api/src/services/imob/imobAccessGate.ts:7-45` e `apps/api/src/services/imob/imobAccessGate.ts:179-186`.
- `buildChatRuntimeSnapshot` bloqueia agentes incompletos com `chatEnabled=false` e `catalogVisibility=blocked` em `apps/api/src/services/agentChatRuntime.ts:98-108`.

### Regra proposta

Sem qualquer uma dessas garantias, o handoff deve ser `blocked` ou equivalente, com reasonCode explicito, sem renderizar CTA de execucao e sem criar run/mutacao automaticamente.

## 12. Auditoria, receipts e bundles

### Referencias de prova

O contrato pode referenciar:

- `runId`: quando ja houver run relacionada;
- `receiptId`: quando houver receipt/canon aplicavel;
- `bundleId`: quando houver evidence bundle.

### Evidencia atual

- Runs e eventos sao tenant/workspace-scoped em `apps/api/src/routes/runs.ts:61-238`.
- Bundle de run exige `reports.view`, registra ledger e retorna hash/files em `apps/api/src/routes/runs.ts:1473-1504`.
- Ledger por `txId` exige `ledger.view`, valida invariantes e retorna `receiptCanon` em `apps/api/src/routes/governance.ts:432-735`.
- Export IMOB inclui `runId`, `txId`, `receiptPath`, `bundlePath`, proof e links em `apps/api/src/routes/imob.ts:3580-3828`.
- Frontend IMOB resolve proof surface com `runId`, `txId`, `receiptPath`, `bundlePath` e `verifyUrl` em `apps/web/src/pages/app/imob/chatProof.ts:16-71`.

### Regra proposta

- Se a proxima etapa for critica, o handoff deve indicar HITL e nao sugerir conclusao sem prova.
- Se `suggestedSurface=runs`, o contrato deve ter referencia de run/prova ou reasonCode `CHAT_VERTICAL_HANDOFF_PROOF_UNAVAILABLE`.
- Se receipt/bundle ainda nao existir, a UI deve renderizar estado pendente, nao sucesso.
- O contrato nao deve carregar payload de receipt/bundle; deve carregar apenas referencias seguras.

## 13. Exemplos

### Exemplo A — IMOB read-only para cockpit

```json
{
  "version": "chat.vertical_handoff.v1",
  "handoffId": "handoff_01",
  "tenantId": "tenant-A",
  "workspaceId": "workspace-A",
  "scope": "imob.chat.use",
  "userId": "user-123",
  "verticalId": "imob",
  "intentId": "dashboard.pipeline_status",
  "blueprintId": "imob.manager_cockpit.v1",
  "requiredEntitlement": "IMOB_ACTIVE_INSTALLATION",
  "requiredRoles": ["workspace_admin", "imob_operator"],
  "handoffMessage": "Isso e contexto IMOB. Vou abrir a Central Operacional para acompanhar fila, bloqueios e proximas acoes.",
  "reasonCode": "CHAT_VERTICAL_HANDOFF_TO_COCKPIT",
  "riskLevel": "read_only",
  "hitlRequired": false,
  "renderHints": {
    "verticalBadge": "IMOB",
    "suggestedSurface": "cockpit",
    "ctaLabel": "Abrir IMOB",
    "cockpitDeepLink": "/app/imob/dashboard?cc=open#command-center"
  }
}
```

### Exemplo B — IMOB assisted contextual chat

```json
{
  "version": "chat.vertical_handoff.v1",
  "handoffId": "handoff_02",
  "tenantId": "tenant-A",
  "workspaceId": "workspace-A",
  "scope": "imob.chat.use",
  "userId": "user-123",
  "verticalId": "imob",
  "intentId": "proposal.advance",
  "blueprintId": "imob.negotiation_arc.v1",
  "requiredEntitlement": "IMOB_ACTIVE_INSTALLATION",
  "requiredRoles": ["imob_operator"],
  "handoffMessage": "Isso e uma etapa assistida do IMOB. Vou continuar no caso com proposta em revisao.",
  "reasonCode": "CHAT_VERTICAL_HANDOFF_ASSISTED",
  "riskLevel": "assisted",
  "hitlRequired": true,
  "renderHints": {
    "verticalBadge": "IMOB",
    "suggestedSurface": "chat",
    "ctaLabel": "Continuar caso",
    "cockpitDeepLink": "/app/imob/chat?caseId=case_123&threadId=thread_456"
  },
  "runId": "run_abc"
}
```

### Exemplo C — Legal context-only bloqueado para cockpit

```json
{
  "version": "chat.vertical_handoff.v1",
  "handoffId": "handoff_03",
  "tenantId": "tenant-A",
  "workspaceId": "workspace-A",
  "scope": "legal.context.use",
  "userId": "user-123",
  "verticalId": "legal",
  "intentId": "contract.review_risk",
  "handoffMessage": "Posso coletar contexto juridico e explicar limites, mas a vertical Legal ainda nao esta operacional neste workspace.",
  "reasonCode": "CHAT_VERTICAL_HANDOFF_VERTICAL_CONTRACT_INCOMPLETE",
  "riskLevel": "read_only",
  "hitlRequired": false,
  "renderHints": {
    "verticalBadge": "LEGAL",
    "suggestedSurface": "chat",
    "ctaLabel": "Continuar no Chat"
  }
}
```

### Exemplo D — Prova de execucao em Runs

```json
{
  "version": "chat.vertical_handoff.v1",
  "handoffId": "handoff_04",
  "tenantId": "tenant-A",
  "workspaceId": "workspace-A",
  "scope": "reports.view",
  "userId": "user-123",
  "verticalId": "imob",
  "intentId": "audit.show_receipt",
  "handoffMessage": "Encontrei uma execucao auditavel. Vou abrir a trilha em Runs.",
  "reasonCode": "CHAT_VERTICAL_HANDOFF_TO_RUNS",
  "riskLevel": "read_only",
  "hitlRequired": false,
  "renderHints": {
    "verticalBadge": "IMOB",
    "suggestedSurface": "runs",
    "ctaLabel": "Ver evidencia"
  },
  "runId": "run_abc",
  "receiptId": "tx_123",
  "bundleId": "bundle_hash_456"
}
```

## 14. Compatibilidade e versionamento

### Politica proposta

- `chat.vertical_handoff.v1` deve ter schema JSON versionado antes de implementacao.
- Deve haver baseline e exemplo validavel.
- Campos opcionais podem ser adicionados de forma backward-compatible.
- Remover/renomear campo ou alterar semantica obrigatoria exige nova major.
- O producer deve tolerar consumidores v1 enquanto houver rollout parcial.
- O frontend deve ignorar campos desconhecidos e renderizar fallback seguro quando hints ausentes.

### Relação com contratos existentes

- **Agent Protocol:** cobre discovery/negotiate/execute de acoes e tiers; o handoff contract cobre decisao de transicao Chat -> Vertical.
- **Presentation Snapshot:** cobre apresentacao de mensagens; o handoff contract fornece contexto vertical e render hints.
- **Receipt Canon:** cobre prova/auditoria; o handoff contract referencia run/receipt/bundle quando aplicavel.
- **IMOB schemas:** cobrem dominio IMOB; o handoff contract cria envelope transversal para qualquer vertical.

### Arquivos futuros provaveis

Fora do escopo desta tarefa:

- `contracts/chat-vertical-handoff.v1.schema.json`
- `contracts/chat-vertical-handoff.v1.baseline.json`
- `contracts/examples/chat-vertical-handoff.v1.example.json`
- teste de compatibilidade do contrato
- producer no runtime/engine
- consumer render-only no frontend

## 15. Plano de implementacao futura

### ARCH-CHAT-3 — Render Hints / Vertical Context Badge

- Consumir `renderHints` no frontend.
- Renderizar badge vertical e CTA sem inferencia local.
- Provar por teste que `ChatAgentLauncher` nao decide vertical/risk/HITL.

### ARCH-CHAT-4 — IMOB Cockpit Deep Link Contract

- Padronizar deep links cockpit <-> chat.
- Migrar comportamento IMOB especifico para contrato reutilizavel.
- Preservar links atuais e rotas legadas.

### ARCH-CHAT-5 — HITL/Gate Rendering Standard

- Padronizar exibicao de approval required, rejected, expired e scope mismatch.
- UI renderiza decisao; backend/runtime decide.

### ARCH-CHAT-6 — Receipt/Bundle Rendering Standard

- Padronizar estados `not_required`, `pending`, `ready`, `failed`.
- Renderizar run/receipt/bundle/verifyUrl de forma transversal.

### ARCH-CHAT-7+ — Contract implementation

- Criar schema/baseline/exemplo.
- Adicionar contract tests.
- Implementar producer no engine/runtime.
- Implementar consumer no frontend.
- Medir regressao por checks.

## 16. Riscos e mitigacao

| Risco | Impacto | Mitigacao |
| --- | --- | --- |
| Contrato virar implementacao implicita | Declaracao falsa de prontidao | Marcar como proposta; nao alterar runtime/engine/frontend nesta tarefa. |
| Frontend inferir campos ausentes | Drift e violacao agent-driven | Contrato exige producer decidido; UI usa fallback seguro. |
| Vertical virar chat paralelo | Confusao UX e arquitetura | `suggestedSurface=cockpit` para cockpit; chat vertical apenas contextual/transicional. |
| PII em deep links/hints | Vazamento de dados | Deep links carregam ids tecnicos/contexto minimo; sem PII sensivel. |
| ReasonCodes divergentes | Suporte e auditoria fracos | Criar catalogo/versionamento futuro antes de implementacao. |
| Critical sem HITL | Execucao sensivel indevida | Invariante `riskLevel=critical -> hitlRequired=true`. |
| Prova inexistente apresentada como sucesso | Auditoria enganosa | Ausencia de run/receipt/bundle gera estado pendente/degradado, nao sucesso. |
| Breaking change sem baseline | Drift de contrato | Schema + baseline + compat test futuros. |

## 17. DoD

DoD desta tarefa documental:

- `CODEX.md` lido antes de qualquer alteracao.
- Documentos obrigatorios lidos.
- Estado atual relevante mapeado com `arquivo:linha`.
- Contrato conceitual v1 proposto.
- Campos obrigatorios, validacoes, reasonCodes e invariantes definidos.
- Render hints e superficies definidos.
- HITL/risk/governanca definidos.
- Entitlement/RBAC/fail-closed definidos.
- Auditoria/receipts/bundles referenciados.
- Exemplos incluidos.
- Plano futuro e riscos documentados.
- Nenhum codigo, runtime, engine, `ChatAgentLauncher`, rota, schema ou workflow alterado.

DoD futuro para implementacao, fora do escopo:

- Schema JSON versionado.
- Baseline versionado.
- Exemplo validavel.
- Contract tests de compatibilidade.
- Producer no engine/runtime.
- Consumer render-only no frontend.
- Testes de entitlement/RBAC/fail-closed.
- Testes de render hints sem inferencia local.
- Checks documentais, contrato e isolamento verdes.

Status final: proposta/parcial evidenciada documentalmente.
