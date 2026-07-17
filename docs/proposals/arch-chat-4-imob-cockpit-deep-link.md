# ARCH-CHAT-4 — IMOB Cockpit Deep Link

> Status: proposta/parcial evidenciada documentalmente.
>
> Escopo desta rodada: proposta documental e contrato conceitual de navegacao para deep link governado `Chat -> cockpit IMOB`. Nenhum codigo, schema Prisma, seed, migracao, config, workflow, package, lockfile, runtime, engine, `ChatAgentLauncher`, componente, rota, provider, WhatsApp produtivo, secret produtivo ou mutacao critica foi alterado.
>
> Este documento nao declara deep link implementado no contrato universal, nao declara rollout final, nao declara provider integrado, nao declara WhatsApp operacional e nao autoriza execucao critica.

## 1. Sumario executivo

ARCH-CHAT-4 define o padrao de deep link governado do Chat universal para o cockpit IMOB. O objetivo e permitir que uma resposta do Chat apresente navegacao para `/app/imob/dashboard` com contexto validado, preservando tenant, workspace, scope, reasonCode e referencias opcionais como `handoffId` e `runId`, sem executar acao critica e sem mover policy para o frontend.

A decisao desta rodada e conservadora: criar apenas este documento. O codebase ja tem rotas seguras de IMOB, dashboard, Command Center, CTAs, gate de entitlement, RBAC e deep links do cockpit para o chat, mas nao ha evidencia de um `cockpitDeepLink` produzido por contrato universal `chat.vertical_handoff.v1` ou equivalente validado. Implementar CTA no `ChatAgentLauncher` agora exigiria inferencia de path/contexto no frontend, violando a regra agent-driven.

O padrao proposto trata o link como navegacao, nao execucao. O cockpit deve revalidar entitlement/RBAC/scope ao carregar seus dados; ausencia de link valido, tenant/workspace/scope ou capability deve falhar fechado.

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
- `docs/proposals/arch-chat-2-handoff-contract-v1.md`
- `docs/proposals/arch-chat-3-vertical-context-badge.md`
- `docs/proposals/imob-chat-agentic-ops-library-integration.md`
- `apps/web/src/App.tsx`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/web/src/components/agents/chatLauncherEngine.test.ts`
- `apps/web/src/components/agents/imobContextResolver.ts`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/dashboard.tsx`
- `apps/web/src/features/imob/ImobCommandCenter.tsx`
- `apps/web/src/features/imob/ImobCommandCenter.test.tsx`
- `apps/web/src/components/imob/ImobAccessGateCard.tsx`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/middlewares/enforceTenant.ts`
- `apps/api/src/middlewares/requireScope.ts`
- `apps/api/src/services/imob/imobAccessGate.ts`
- `apps/api/src/services/imob/imobArtifactCapabilities.ts`
- `contracts/`

### Classificacao

- **Fato do codebase:** afirmacao verificavel por `arquivo:linha`.
- **Fato documental:** regra registrada em documento do repositorio.
- **Proposta tecnica:** shape e regras futuras de `ImobCockpitDeepLinkV1`.
- **Decisao de implementacao pendente:** quando materializar contrato, producer de `cockpitDeepLink`, teste de renderizacao e consumo pelo frontend.

## 3. Pre-condicao ARCH-CHAT-3

Pre-condicao confirmada antes da alteracao documental:

- ARCH-CHAT-3 mergeada em `main` no commit `f75ecc07db71036247d149412d7bb7e094d68b97`.
- `CI Monorepo`: completed success, run `29596431329`.
- `IMOB Worker Mutation E2E`: completed success, run `29596431517`.
- `git status --short` estava limpo apos `git switch main`, `git pull --ff-only origin main` e `git fetch --prune`.

Ultimos commits observados:

- `f75ecc0 Merge pull request #320 from 5906375/docs/arch-chat-3-vertical-context-badge`
- `329bc02 docs(arch-chat): define vertical context badge`
- `b9f2335 Merge pull request #319 from 5906375/docs/arch-chat-2-handoff-contract-v1`

## 4. Estado atual das rotas e superficies

| Item | Status | Evidencia |
| --- | --- | --- |
| Navegacao principal | evidenciado/parcial | O shell declara `Chat` em `/app/chat` e `IMOB` em `/app/imob/chat`, filtrando IMOB por instalacao, em `apps/web/src/App.tsx:56-64` e `apps/web/src/App.tsx:88-92`. |
| Superficie IMOB | evidenciado | O layout reconhece `/app/imob` e `/app/marketplace/imob` como superficie IMOB, troca o subtitulo para `Imobiliaria Digital Command Center` e trata `/app/imob/chat` como rota visual especial em `apps/web/src/App.tsx:82-108`. |
| Auth/contexto | evidenciado | `RequireAuth` solicita `targetDomain=imob` para rotas IMOB ou query `domain=imob`, atualiza tenant/workspace/entitlements/roles/verticals e registra access gate em `apps/web/src/App.tsx:147-204`. |
| Gate de instalacao | evidenciado | `RequireImobInstall` redireciona usuario sem IMOB instalado para `/app/marketplace/imob` em `apps/web/src/App.tsx:213-220`. |
| `/app/chat` | evidenciado | `/app/chat` renderiza `AgentsPage` com `RequireAuth` em `apps/web/src/App.tsx:299-307`; `/app/agents` redireciona para `/app/chat` em `apps/web/src/App.tsx:262-265` e `apps/web/src/App.tsx:309`. |
| `/app/imob/dashboard` | evidenciado | A rota do dashboard IMOB existe com auth e `RequireImobInstall` em `apps/web/src/App.tsx:344-354`. |
| `/app/imob/chat` | evidenciado | A rota do chat IMOB existe com auth e `RequireImobInstall` em `apps/web/src/App.tsx:356-366`. |
| Rotas legadas para cockpit | evidenciado | `/app/imob/properties`, `/app/imob/processes` e `/app/imob/partners` redirecionam para `/app/imob/dashboard?...#command-center` em `apps/web/src/App.tsx:368-384`. |
| Runs legado para cockpit | evidenciado | `RunsRoute` redireciona `domain=imob` sem `runId` para `/app/imob/dashboard` com `section`, `cc=open`, `conversationId`, `threadId`, `caseId` e `#command-center` em `apps/web/src/App.tsx:267-283`. |
| Dashboard para chat | evidenciado | O dashboard constroi `/app/imob/chat` com `conversationId`, `caseId`, `threadId` e `autoprompt` em `apps/web/src/pages/app/imob/dashboard.tsx:196-220`. |
| Dashboard state | evidenciado | O dashboard le `conversationId`, `threadId`, `caseId`, `cc_status`, `cc_reason`, `tab`, `section`, `cc=open` e mantem owners, properties, cases, runs, priority queue, waiting-on, heatmap e KPIs em `apps/web/src/pages/app/imob/dashboard.tsx:281-336`. |
| Command Center | evidenciado | `ImobCommandCenter` renderiza Central Operacional, KPIs, filtros, priority queue, waiting-on, heatmap e tabela operacional em `apps/web/src/features/imob/ImobCommandCenter.tsx:67-164`. |
| Cockpit para chat | evidenciado | O Command Center renderiza `abrir no chat` somente quando `artifactCapabilities.canOpenChat.allowed === true`, montando link com `conversationId`, `caseId`, `threadId`, `actionId`, `reasonCode` e `autoprompt` em `apps/web/src/features/imob/ImobCommandCenter.tsx:236-259`. |
| Proof/dossie no cockpit | evidenciado | O Command Center mostra PDF/HTML de dossie e comprovante somente quando capabilities permitem em `apps/web/src/features/imob/ImobCommandCenter.tsx:266-321`. |
| Chat IMOB para dashboard | evidenciado/parcial | CTAs legados `/app/imob/properties`, `/app/imob/processes` e `/app/imob/partners` sao normalizados para `/app/imob/dashboard?section=...&cc=open#command-center` em `apps/web/src/pages/app/imob/chat.tsx:808-827`. |
| Erros fail-closed IMOB | evidenciado | O chat IMOB extrai erro estruturado, reasonCode e CTA backend e renderiza card de acesso pausado/fail-closed em `apps/web/src/pages/app/imob/chat.tsx:839-889`. |
| Frontdoor states IMOB | evidenciado | Loading, empty, error e estado desconhecido indicam que nenhuma acao operacional sera disparada ate contexto estar pronto ou que o atendimento foi pausado em fail-closed em `apps/web/src/pages/app/imob/chat.tsx:891-975`. |
| GateCard 403 | evidenciado | `ImobAccessGateCard` renderiza CTA recebido, workspace e trace em `apps/web/src/components/imob/ImobAccessGateCard.tsx:6-45`. |
| Markdown links no launcher | evidenciado/parcial | `ChatAgentLauncher` renderiza links markdown internos com `<Link to={resolvedHref}>` quando `href` comeca por `/` em `apps/web/src/components/agents/ChatAgentLauncher.tsx:1693-1715`. Isso e renderizacao generica, nao contrato governado de `cockpitDeepLink`. |
| Respostas IMOB com links | evidenciado/parcial | `imobContextResolver` reconhece atalho de dashboard e produz markdown `[Dashboard IMOB](/app/imob/dashboard)` em `apps/web/src/components/agents/imobContextResolver.ts:411-424`, `apps/web/src/components/agents/imobContextResolver.ts:590-608` e `apps/web/src/components/agents/imobContextResolver.ts:632-642`. |
| Testes de links IMOB | evidenciado/parcial | `chatLauncherEngine.test.ts` verifica respostas deterministicas com `/app/imob/dashboard`, `/app/imob/chat` e `/app/marketplace/imob` em `apps/web/src/components/agents/chatLauncherEngine.test.ts:968-1059`. |
| Testes de capability no Command Center | evidenciado/parcial | `ImobCommandCenter.test.tsx` cobre `canOpenChat.allowed=true` e `canOpenChat.allowed=false` com reasonCode em `apps/web/src/features/imob/ImobCommandCenter.test.tsx:45-75` e `apps/web/src/features/imob/ImobCommandCenter.test.tsx:245-265`. |
| Backend resolve-turn | evidenciado | `POST /chat/resolve-turn` exige auth context, mensagem, permissao `imob.chat.use`, escopo tenant/workspace para case/thread e recipe liberada em `apps/api/src/routes/imob.ts:1693-1778`. |
| Backend Command Center | evidenciado | `/command-center/funnel-health` usa auth context, tenantId/workspaceId e retorna summary, reasonCodes e actions em `apps/api/src/routes/imob.ts:2357-2464`. |
| Backend blocked-runs | evidenciado | `/command-center/blocked-runs` usa auth context, workspaceAccess, permissao `imob.chat.use`, tenant/workspace em runs/events, proof e capabilities de bundle em `apps/api/src/routes/imob.ts:2466-2557`. |
| Tenant enforcement | evidenciado | `enforceTenant` exige bearer token, resolve `tenantId`, `workspaceId`, `userId`, injeta Prisma tenant-scoped e valida delegacao em `apps/api/src/middlewares/enforceTenant.ts:58-155`. |
| RBAC scope | evidenciado | `requireScope` chama `checkScopePermission` com tenant/workspace/user/token/scope e retorna 403 com reasonCode quando negado em `apps/api/src/middlewares/requireScope.ts:20-64`. |
| IMOB access gate | evidenciado | `imobAccessGate` define reasonCodes, CTA, scope tenant/workspace, audit event e retorna 403 em `apps/api/src/services/imob/imobAccessGate.ts:7-45` e `apps/api/src/services/imob/imobAccessGate.ts:146-186`. |
| Artifact capabilities | evidenciado | `resolveImobArtifactCapabilities` decide `canOpenChat`, dossie, receipt e bundle por permissao/stage/contexto; sem `caseId`/`threadId`, retorna `IMOB_CHAT_CONTEXT_MISSING` em `apps/api/src/services/imob/imobArtifactCapabilities.ts:65-96`. |
| Contrato de deep link Chat -> cockpit | ausente | `contracts/` contem agent protocol, presentation snapshot e contratos IMOB, mas nao contem schema de `chat.vertical_handoff.v1`, deep link, navigation target ou CTA governada. |

## 5. Baseline ARCH-CHAT-1/2/3

ARCH-CHAT-1 estabelece que:

- `Chat` e o front door conversacional universal.
- `IMOB` deve ser cockpit/Command Center operacional, nao chat paralelo.
- Rotas de chat vertical podem permanecer como compatibilidade ou continuidade contextual.
- O frontend nao deve inferir intencao, vertical, entitlement, RBAC, HITL ou render hints.

ARCH-CHAT-2 estabelece o contrato conceitual `chat.vertical_handoff.v1`:

- `renderHints` sao apresentacao, nao autorizacao.
- `cockpitDeepLink` deve ser path interno controlado, nunca URL externa arbitraria.
- `suggestedSurface=cockpit` indica superficie preferencial de continuidade, mas nao executa acao.
- `tenantId`, `workspaceId`, `scope`, `verticalId`, `intentId`, `reasonCode`, `riskLevel` e `hitlRequired` nao podem ser inferidos pelo frontend.

ARCH-CHAT-3 estabelece o `Vertical Context Badge v1`:

- badge renderiza somente estado recebido de contrato/snapshot validado;
- badge nao valida entitlement;
- badge nao abre cockpit por inferencia propria;
- badge nao cria HITL;
- badge nao substitui proof/receipt/bundle;
- deep link de cockpit ficou explicitamente fora de escopo e e tratado nesta fase documental.

## 6. IMOB Cockpit Deep Link v1

### Contrato conceitual

```ts
type ImobCockpitDeepLinkV1 = {
  version: "imob.cockpit_deep_link.v1";
  targetSurface: "imob.cockpit";
  cockpitDeepLink: string;
  verticalId: "imob";

  tenantId: string;
  workspaceId: string;
  scope: string;

  source: "chat";
  reasonCode: string;
  label: string;
  accessibilityLabel: string;

  handoffId?: string;
  runId?: string;
  conversationId?: string;
  caseId?: string;
  threadId?: string;
  actionId?: string;
  statusFilter?: string;
  reasonFilter?: string;
};
```

### Campos

| Campo | Obrigatorio | Semantica |
| --- | --- | --- |
| `version` | sim | Versao do contrato de navegacao. |
| `targetSurface` | sim | Deve ser `imob.cockpit`, indicando destino de dashboard/Command Center. |
| `cockpitDeepLink` | sim | Path interno validado para `/app/imob/dashboard`, com query/hash permitidos. |
| `verticalId` | sim | Literal `imob`; nao inferido pelo frontend. |
| `tenantId` | sim | Escopo tenant resolvido antes do render. |
| `workspaceId` | sim | Escopo workspace resolvido antes do render. |
| `scope` | sim | Scope/RBAC que justificou a navegacao. |
| `source` | sim | Fonte logica `chat`; nao indica execucao. |
| `reasonCode` | sim | Motivo auditavel da navegacao sugerida. |
| `label` | sim | Texto curto do CTA, por exemplo `Abrir cockpit IMOB`. |
| `accessibilityLabel` | sim | Descricao completa para leitores de tela. |
| `handoffId` | nao | Referencia ao handoff quando houver contrato universal. |
| `runId` | nao | Referencia a run quando a navegacao acompanha execucao/auditoria existente. |
| `conversationId` | nao | Conversa de origem, sem PII. |
| `caseId` | nao | Caso IMOB de contexto, se validado. |
| `threadId` | nao | Thread de contexto, se validada. |
| `actionId` | nao | Acao recomendada como contexto visual, nao execucao. |
| `statusFilter` | nao | Filtro seguro de cockpit, por exemplo `blocked` ou `ready_for_review`. |
| `reasonFilter` | nao | Filtro de reasonCode ja recebido/validado. |

### Validacao minima proposta

- `cockpitDeepLink` deve comecar por `/app/imob/dashboard`.
- Hash permitido: `#command-center`.
- Query permitida: `tab`, `section`, `cc`, `conversationId`, `caseId`, `threadId`, `cc_status`, `cc_reason`, `handoffId`, `runId`.
- URL externa absoluta deve ser rejeitada.
- Ausencia de `tenantId`, `workspaceId`, `scope`, `reasonCode`, `label` ou `accessibilityLabel` deve bloquear renderizacao.
- `source` deve ser `chat`.
- O contrato nao deve conter PII nem payload bruto.

## 7. Regras de renderizacao e navegacao

Regras obrigatorias:

- CTA so renderiza `cockpitDeepLink` recebido e validado.
- CTA nao decide entitlement, RBAC, scope, tenant ou workspace.
- CTA nao construi link por texto do usuario, rota atual, markdown livre ou label de navegacao.
- Cockpit revalida entitlement/RBAC/scope ao carregar dados.
- Link nao executa acao, nao cria run, nao dispara provider e nao muta estado por si so.
- Link nao substitui HITL; qualquer acao critica permanece bloqueada ate padrao futuro ARCH-CHAT-5.
- Link nao substitui receipt/bundle; proof rendering fica para ARCH-CHAT-6.
- Ausencia de scope ou link valido resulta em fail-closed: nao renderizar CTA ativo.
- `reasonCode` deve ser preservado para auditoria e troubleshooting.
- O `ChatAgentLauncher` deve continuar render-only, consumindo somente resultado resolvido quando houver implementacao futura.

Regras proibidas:

- Criar `cockpitDeepLink` no `ChatAgentLauncher`.
- Inferir vertical por path, texto, quick reply ou markdown.
- Usar CTA como autorizacao de acesso ou producao.
- Abrir provider externo, webhook ou segredo produtivo.
- Criar deep link externo arbitrario.
- Executar `lead.create`, `lead.discard` ou qualquer mutacao critica.

## 8. Aplicacao inicial ao IMOB

### Abrir cockpit IMOB com contexto de carteira

Exemplo conceitual:

```json
{
  "version": "imob.cockpit_deep_link.v1",
  "targetSurface": "imob.cockpit",
  "cockpitDeepLink": "/app/imob/dashboard?tab=funil&cc=open#command-center",
  "verticalId": "imob",
  "tenantId": "tenant_...",
  "workspaceId": "workspace_...",
  "scope": "imob.chat.use",
  "source": "chat",
  "reasonCode": "IMOB_COCKPIT_PORTFOLIO_CONTEXT",
  "label": "Abrir cockpit IMOB",
  "accessibilityLabel": "Abrir cockpit IMOB para acompanhar funil e carteira"
}
```

### Abrir cockpit IMOB com filtro de pendencias

```json
{
  "version": "imob.cockpit_deep_link.v1",
  "targetSurface": "imob.cockpit",
  "cockpitDeepLink": "/app/imob/dashboard?cc=open&cc_status=blocked#command-center",
  "verticalId": "imob",
  "tenantId": "tenant_...",
  "workspaceId": "workspace_...",
  "scope": "imob.chat.use",
  "source": "chat",
  "reasonCode": "IMOB_COCKPIT_BLOCKED_CASES",
  "label": "Ver pendencias no cockpit",
  "accessibilityLabel": "Abrir cockpit IMOB filtrado por casos bloqueados"
}
```

### Abrir cockpit IMOB a partir de conversa de lead

```json
{
  "version": "imob.cockpit_deep_link.v1",
  "targetSurface": "imob.cockpit",
  "cockpitDeepLink": "/app/imob/dashboard?conversationId=conv_123&caseId=case_123&threadId=thread_123&cc=open#command-center",
  "verticalId": "imob",
  "tenantId": "tenant_...",
  "workspaceId": "workspace_...",
  "scope": "imob.chat.use",
  "source": "chat",
  "reasonCode": "IMOB_COCKPIT_LEAD_CONTEXT",
  "label": "Abrir caso no cockpit",
  "accessibilityLabel": "Abrir cockpit IMOB no contexto do caso desta conversa"
}
```

### Bloquear CTA quando sem entitlement

Se o contrato retornar `IMOB_ENTITLEMENT_MISSING`, `IMOB_INSTALLATION_INACTIVE`, `IMOB_PERMISSION_DENIED`, `CHAT_VERTICAL_HANDOFF_SCOPE_MISSING` ou `CHAT_VERTICAL_HANDOFF_RBAC_DENIED`, a UI nao deve renderizar CTA ativo para cockpit. O comportamento esperado e card/gate fail-closed com reasonCode e CTA de instalacao/regularizacao quando recebido do backend.

### Ocultar/neutralizar CTA quando scope ausente

Se `scope` estiver ausente, vazio ou invalido, o CTA deve ser omitido. O Chat pode explicar que o cockpit esta indisponivel para o contexto atual, mas nao deve oferecer link montado localmente.

## 9. UX e acessibilidade

### Desktop

- CTA curto: `Abrir cockpit IMOB`, `Ver pendencias`, `Abrir caso no cockpit`.
- Mostrar proximo ao badge/contexto vertical quando ambos vierem do mesmo contrato validado.
- Nao repetir CTA em toda mensagem; preferir a ultima resposta relevante ou area de acao contextual.
- Nao misturar CTA de cockpit com botao de execucao.

### Mobile responsivo

- O CTA deve caber em uma linha ou quebrar sem overflow horizontal.
- Usar label curto e `accessibilityLabel` completo.
- Evitar tabela ou payload de contexto no corpo do CTA.
- Nao depender de hover/tooltip como unica explicacao.

### Acessibilidade

- `accessibilityLabel` deve indicar que e navegacao para cockpit.
- Cor nao pode ser unico sinal de estado.
- Estados bloqueados devem ter texto explicito.
- O link deve ser interno e previsivel; nao deve abrir navegacao surpresa para destino externo.

### Copy recomendada

- `Abrir cockpit IMOB`
- `Ver pendencias no cockpit`
- `Abrir caso no cockpit`
- `Acompanhar funil IMOB`

Copy proibida nesta fase:

- `Executar`
- `Aprovar`
- `Enviar`
- `Publicar`
- `Criar lead`
- `Descartar lead`
- `Fechar contrato`

## 10. Fora de escopo

ARCH-CHAT-4 nao implementa:

- producer fisico de `cockpitDeepLink`;
- schema fisico do contrato;
- mudanca no `ChatAgentLauncher`;
- mudanca no runtime;
- mudanca no engine;
- mudanca em rotas;
- mudanca em schema, seed ou migracao;
- HITL rendering standard, reservado para ARCH-CHAT-5;
- receipt/bundle rendering standard, reservado para ARCH-CHAT-6;
- piloto IMOB, reservado para ARCH-CHAT-7;
- provider WhatsApp real;
- webhook produtivo;
- secret produtivo;
- dashboard obrigatorio novo;
- storage externo obrigatorio;
- mutacao critica;
- `lead.create`;
- `lead.discard`;
- qualquer acao critica.

## 11. Riscos e mitigacao

| Risco | Impacto | Mitigacao |
| --- | --- | --- |
| Deep link virar autorizacao | Usuario pode interpretar CTA como permissao operacional. | Declarar e testar que CTA e navegacao; cockpit revalida acesso. |
| Frontend construir link indevido | Drift contra agent-driven e possivel vazamento de contexto. | Renderizar apenas link recebido/validado pelo contrato. |
| Perda de tenant/workspace/scope | Abertura de cockpit em contexto incorreto. | Campos obrigatorios e fail-closed quando ausentes. |
| Cockpit nao revalidar | Risco de acesso indevido por link compartilhado. | Manter `RequireAuth`, `RequireImobInstall`, backend tenant-scoped e RBAC/scope. |
| UX confusa | Usuario confunde cockpit com execucao. | Copy explicita de navegacao, nao de acao. |
| Mobile overflow | CTA quebra bolha ou painel. | Label curto, aria completo e layout responsivo. |
| Drift com ARCH-CHAT-2/3 | CTA nasce sem contrato ou badge vira policy. | Dependencia explicita de `chat.vertical_handoff.v1`/snapshot validado e renderHints como apresentacao. |
| PII em query | Link pode vazar dado sensivel em logs/screenshot. | Permitir apenas IDs opacos e filtros; proibir payload bruto/PII. |

## 12. DoD

ARCH-CHAT-4 fica completo nesta rodada quando:

- este documento estiver versionado em `docs/proposals/arch-chat-4-imob-cockpit-deep-link.md`;
- a pre-condicao ARCH-CHAT-3 estiver documentada;
- rotas `/app/chat`, `/app/imob/chat` e `/app/imob/dashboard` estiverem mapeadas com `arquivo:linha`;
- Command Center, CTAs, gates e capabilities estiverem evidenciados com `arquivo:linha`;
- o contrato conceitual `ImobCockpitDeepLinkV1` estiver definido;
- as regras deixarem claro que link e navegacao, nao execucao;
- `ChatAgentLauncher` permanecer render-only;
- a decisao de nao implementar codigo estiver justificada pela ausencia de `cockpitDeepLink` validado;
- `pnpm check:evidence-index` passar;
- `pnpm check:docs-link-integrity` passar;
- `git diff --check` passar;
- `git diff -- .github/workflows release.yml apps packages scripts` nao mostrar alteracoes;
- o arquivo for staged com `git add -f docs/proposals/arch-chat-4-imob-cockpit-deep-link.md`, caso continue ignorado por `.gitignore`.

Status final esperado: proposta/parcial evidenciada documentalmente.
