# ARCH-CHAT-3 — Vertical Context Badge

> Status: proposta/parcial evidenciada documentalmente.
>
> Escopo desta rodada: proposta documental para o `Vertical Context Badge` do Chat universal. Nenhum codigo, schema Prisma, seed, migracao, config, workflow, package, lockfile, runtime, engine, `ChatAgentLauncher`, componente, rota, provider, WhatsApp produtivo, secret produtivo ou mutacao critica foi alterado.
>
> Este documento nao declara badge implementado, nao declara contrato `chat.vertical_handoff.v1` implementado, nao declara IMOB fechado, nao declara rollout final e nao declara WhatsApp operacional.

## 1. Sumario executivo

ARCH-CHAT-3 define a proposta v1 do `Vertical Context Badge`: um indicador visual compacto que informa ao usuario quando uma resposta do Chat universal esta dentro de um contexto vertical, como IMOB, sem transformar a vertical em chat paralelo e sem mover regra de decisao para o frontend.

O badge deve existir apenas como renderizacao de estado ja resolvido por contrato/agente/engine/runtime. Ele nao decide vertical, nao valida entitlement, nao abre cockpit por inferencia propria, nao calcula risco, nao cria HITL, nao executa acao critica e nao substitui proof/receipt/bundle.

A conclusao conservadora desta rodada e documental: apesar de o frontend ja ter `verticalContext` em `MessagePresentationSnapshot`, `routeIntent=imob`, badges especificos no chat IMOB e componentes de contexto vertical, nao ha evidencia de um produtor fisico do contrato universal `chat.vertical_handoff.v1` ou de `renderHints.verticalBadge` canonicamente validado. Implementar badge agora no `ChatAgentLauncher` poderia introduzir inferencia visual baseada em sinais parciais, contrariando a regra agent-driven.

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
- `docs/proposals/imob-chat-agentic-ops-library-integration.md`
- `apps/web/src/App.tsx`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/web/src/components/agents/chatLauncherEngine.ts`
- `apps/web/src/components/agents/chatPresentationSnapshot.ts`
- `apps/web/src/components/agents/chatDecisionTelemetry.ts`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/chatProof.ts`
- `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx`
- `apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.tsx`
- `apps/web/src/features/imob/ImobChatWidgets.tsx`
- `apps/api/src/routes/imob.ts`
- `apps/api/src/services/imob/imobAgentContract.ts`

### Classificacao

- **Fato do codebase:** afirmacao verificavel por arquivo e linha.
- **Fato documental:** regra registrada em documento do repositorio.
- **Proposta ARCH-CHAT-3:** comportamento alvo ainda nao implementado.
- **Gap:** diferenca entre estado atual e o badge governado por contrato.
- **Fora de escopo:** qualquer implementacao visual, regra de policy, deep link de cockpit, HITL, receipt/bundle ou mudanca de runtime/engine/launcher.

## 3. Pre-condicao ARCH-CHAT-2

Pre-condicao confirmada antes da alteracao documental:

- ARCH-CHAT-2 mergeada em `main` no commit `b9f23350e39bbadfda64bf0ecb73148e605a8f65`.
- `CI Monorepo`: completed success, run `29582652725`.
- `IMOB Worker Mutation E2E`: completed success, run `29582652680`.

O repositorio local foi atualizado em `main` com `git pull --ff-only origin main` e `git fetch --prune`; `git status --short` estava limpo antes da criacao deste arquivo.

## 4. Estado atual do frontend com evidencias

| Item | Status | Evidencia |
| --- | --- | --- |
| Chat universal | evidenciado | `/app/chat` renderiza `AgentsPage` com auth em `apps/web/src/App.tsx:299-307`; `/app/agents` redireciona para `/app/chat` em `apps/web/src/App.tsx:262-265` e `apps/web/src/App.tsx:309`. |
| Navegacao IMOB | evidenciado/parcial | O shell declara `Chat` em `/app/chat` e `IMOB` em `/app/imob/chat`, exigindo IMOB instalado, em `apps/web/src/App.tsx:56-64`. ARCH-CHAT-1 classifica a vertical como cockpit alvo, nao chat paralelo. |
| Snapshot de apresentacao | evidenciado/parcial | `MessagePresentationSnapshot` possui `verticalContext?: "IMOB" | "LEGAL" | null`, `routeIntent`, `renderVariant`, quick replies e `governedRuntime` em `apps/web/src/components/agents/chatPresentationSnapshot.ts:6-58`. |
| Guardas de snapshot IMOB | evidenciado/parcial | `isBackendGovernedImobSnapshot` e `hasGovernedImobSnapshotContract` exigem `compatibilityMode=snapshot`, `routeIntent=imob`, `governedRuntime.domain=IMOB`, contrato `imob.crm.governed.v1` e fontes backend em `apps/web/src/components/agents/chatPresentationSnapshot.ts:87-117`. |
| Renderizacao no launcher | evidenciado | `ChatAgentLauncher` renderiza mensagens de assistente e passa `presentationSnapshot` para `buildRenderableAssistantMarkdown` em `apps/web/src/components/agents/ChatAgentLauncher.tsx:1822-1888`. |
| Regra render-only | evidenciado documentalmente | `docs/architecture/agent-chat-runtime.md` e `AGENTS.md` determinam que o `ChatAgentLauncher` renderiza resultado ja resolvido e nao decide especialista, handoff ou quick replies por conta propria. |
| Engine de chat | evidenciado/parcial | `chatLauncherEngine.ts` tipa `LauncherRouteIntent` como `proposal | imob | playbook | help | orchestrator` e modela decisoes/render variants em `apps/web/src/components/agents/chatLauncherEngine.ts:140-218`. |
| Chat IMOB dedicado | evidenciado | `/app/imob/chat` possui seletor vertical, label `Contexto IMOB`, access gate, thread pills e badges de mensagem em `apps/web/src/pages/app/imob/chat.tsx:5090-5333`. |
| Badge/contexto IMOB especifico | evidenciado | O chat IMOB renderiza `Contexto IMOB`, `Operacao filtrada`, `consultBadge` e `dispatchBadge` em `apps/web/src/pages/app/imob/chat.tsx:5094-5106` e `apps/web/src/pages/app/imob/chat.tsx:5323-5333`. |
| Componentes de vertical | evidenciado/parcial | `VerticalSelectorBar` renderiza tabs/pills de vertical em `apps/web/src/features/workbench/vertical-chat/VerticalSelectorBar.tsx:44-90`; `ReactiveContextPanel` alterna IMOB/Legal por `activeVerticalId` em `apps/web/src/features/workbench/vertical-chat/ReactiveContextPanel.tsx:27-36`. |
| Proof IMOB | evidenciado | `chatProof.ts` resolve `required`, `ready`, `state`, `runId`, `txId`, `receiptPath`, `bundlePath` e `verifyUrl` em `apps/web/src/pages/app/imob/chatProof.ts:16-71`. |
| Widgets IMOB | evidenciado | `ImobChatWidgets` renderiza quick actions, priorities, case summary, contract intake, print bundle e especialistas contextuais em `apps/web/src/features/imob/ImobChatWidgets.tsx:84-225`. |
| Backend IMOB | evidenciado | `POST /chat/resolve-turn` valida auth context, mensagem, permissao `imob.chat.use`, escopo tenant/workspace e recipe em `apps/api/src/routes/imob.ts:1693-1775`. |
| Agent contract IMOB | evidenciado | `buildImobAgentContractV1` declara `imob.case_concierge.v1`, surfaces `chat`, `dashboard`, `marketplace` e ownership model em `apps/api/src/services/imob/imobAgentContract.ts:46-77`. |
| Handoff universal v1 | ausente | Busca por `chat.vertical_handoff`, `vertical_handoff`, `VerticalHandoff` e `renderHints` nao encontrou implementacao fisica no repositorio. ARCH-CHAT-2 e conceitual. |

## 5. Baseline ARCH-CHAT-1/2

ARCH-CHAT-1 define o modelo semantico:

- `Chat` e o front door conversacional universal.
- Verticais como IMOB sao cockpits/command centers operacionais.
- Rotas de chat vertical podem existir por compatibilidade, piloto ou continuidade contextual, mas nao devem virar front doors paralelos.
- O frontend nao deve inferir intencao, vertical, entitlement, roles, risk level, HITL ou render hints por conta propria.

ARCH-CHAT-2 define o contrato conceitual `chat.vertical_handoff.v1`:

- `Core` governa.
- `Chat` orquestra.
- `Vertical` executa.
- `Frontend` renderiza.
- `ChatAgentLauncher` permanece render-only.
- `renderHints` sao dicas de apresentacao, nao autorizacao de negocio.
- Ausencia de tenant/workspace/scope/entitlement/contrato minimo deve falhar fechado.

ARCH-CHAT-3 depende desse baseline: o badge somente pode renderizar o que veio resolvido no contrato de handoff ou em snapshot validado equivalente. Ele nao pode ser produzido por heuristica de path, string da mensagem, label de nav ou `routeIntent` isolado.

## 6. Vertical Context Badge v1

### Objetivo

O `Vertical Context Badge v1` deve responder visualmente a pergunta: "esta resposta do Chat esta atuando sob qual contexto vertical e com que nivel de seguranca operacional?"

### Campos propostos

Shape conceitual dentro de `renderHints` ou de um snapshot validado equivalente:

```ts
type VerticalContextBadgeV1 = {
  version: "vertical_context_badge.v1";
  verticalId: "imob" | "legal" | "mkt" | "fin" | "log" | string;
  label: string;
  state:
    | "active"
    | "assisted"
    | "critical_pending_hitl"
    | "blocked"
    | "degraded"
    | "context_only";
  reasonCode: string;
  source:
    | "chat.vertical_handoff.v1"
    | "presentation_snapshot.v1"
    | "vertical_runtime_contract";
  proofState?: "not_required" | "pending" | "ready" | "failed";
  specialistLabel?: string;
  ariaLabel: string;
};
```

### Semantica dos campos

| Campo | Obrigatorio | Semantica |
| --- | --- | --- |
| `version` | sim | Versao do badge, separada do contrato de handoff. |
| `verticalId` | sim | Vertical resolvida por contrato, nunca inferida pelo componente. |
| `label` | sim | Texto curto visivel, por exemplo `IMOB`, `IMOB + J_360` ou `LEGAL`. |
| `state` | sim | Estado visual resolvido pelo runtime/agente. |
| `reasonCode` | sim | Motivo auditavel do estado do badge. |
| `source` | sim | Fonte canonica que autorizou a renderizacao. |
| `proofState` | condicional | Estado de prova quando a interacao exige run/receipt/bundle. |
| `specialistLabel` | nao | Apoio contextual quando um especialista esta envolvido sem tomar ownership visual do caso. |
| `ariaLabel` | sim | Descricao acessivel completa do contexto e estado. |

### Estados visuais propostos

| Estado | Uso | Regra |
| --- | --- | --- |
| `active` | Vertical ativa em fluxo read-only ou operacional nao critico ja autorizado. | Renderizar badge neutro/positivo somente se o contrato validou tenant/workspace/scope/entitlement. |
| `assisted` | Vertical ativa com apoio de especialista ou automacao assistida. | Renderizar sublabel opcional, sem sugerir execucao autonoma. |
| `critical_pending_hitl` | Acao critica detectada, aguardando aprovacao humana. | Badge deve enfatizar bloqueio de execucao ate HITL futuro; nao executar. |
| `blocked` | Falha de entitlement, scope, tenant/workspace, contrato ou policy. | Badge nao deve aparecer como ativo; a UI deve renderizar o bloqueio fail-closed recebido. |
| `degraded` | Contexto vertical parcial, prova pendente ou dependencia indisponivel. | Mostrar contexto com cautela e reasonCode; nao declarar sucesso. |
| `context_only` | Vertical disponivel apenas como contexto, sem operacao. | Mostrar como contexto, nao como agente operacional. |

## 7. Regras de renderizacao

### Regras obrigatorias

- Renderizar badge somente quando `VerticalContextBadgeV1` vier de contrato/snapshot validado.
- Tratar `renderHints` como apresentacao, nao como policy.
- Preservar `ChatAgentLauncher` como render-only.
- Preservar fail-closed quando tenant/workspace/scope/entitlement/contract estiver ausente ou invalido.
- Nao renderizar badge ativo quando `state=blocked`.
- Nao transformar `defaultNextStep` em chip ou badge.
- Nao expor PII, secret, telefone, documento, email sensivel, endereco completo ou payload bruto no badge.
- Nao exibir sucesso de proof se `proofState` nao for `ready`.
- Usar `ariaLabel` derivado do contrato para acessibilidade.
- Manter texto curto em desktop e mobile.

### Regras proibidas

- Inferir vertical pelo path atual.
- Inferir vertical por substring da mensagem.
- Inferir entitlement, RBAC, HITL, proof ou risco no frontend.
- Criar regra nova diretamente no `ChatAgentLauncher`.
- Criar deep link de cockpit nesta fase.
- Acionar provider, webhook, mutacao ou acao critica.
- Promover `LEGAL` ou outra vertical `context_only` a operacional por efeito visual.
- Declarar WhatsApp, provider ou producao operacionais.

### Posicionamento visual proposto

- Dentro do card de resposta do assistente, acima do corpo da resposta, quando o badge estiver associado a uma mensagem especifica.
- No header contextual da conversa, somente se o estado ativo da conversa tambem vier de contrato/snapshot validado.
- Em mobile, usar label curto e esconder detalhes secundarios atras de tooltip/acessibilidade.
- Em desktop, permitir sublabel discreto para especialista/proof state quando fornecido.

## 8. Aplicacao inicial ao IMOB

### IMOB ativo read-only

Exemplo conceitual:

```json
{
  "version": "vertical_context_badge.v1",
  "verticalId": "imob",
  "label": "IMOB",
  "state": "active",
  "reasonCode": "IMOB_CONTEXT_RESOLVED",
  "source": "chat.vertical_handoff.v1",
  "proofState": "not_required",
  "ariaLabel": "Contexto vertical IMOB ativo em modo permitido"
}
```

Render esperado: badge `IMOB` discreto, sem CTA de cockpit obrigatoria e sem declarar execucao.

### IMOB com apoio especialista

Exemplo conceitual:

```json
{
  "version": "vertical_context_badge.v1",
  "verticalId": "imob",
  "label": "IMOB + J_360",
  "state": "assisted",
  "reasonCode": "IMOB_BACKING_SPECIALIST_CONTEXT",
  "source": "vertical_runtime_contract",
  "specialistLabel": "J_360",
  "proofState": "not_required",
  "ariaLabel": "Contexto IMOB com apoio especialista J_360"
}
```

Render esperado: badge curto, mantendo IMOB como dono visual do caso e especialista como apoio contextual.

### IMOB aguardando aprovacao humana

Exemplo conceitual:

```json
{
  "version": "vertical_context_badge.v1",
  "verticalId": "imob",
  "label": "IMOB",
  "state": "critical_pending_hitl",
  "reasonCode": "CRITICAL_ACTION_REQUIRES_HITL",
  "source": "chat.vertical_handoff.v1",
  "proofState": "pending",
  "ariaLabel": "Contexto IMOB com acao critica bloqueada ate aprovacao humana"
}
```

Render esperado: badge de cautela, sem botao de execucao automatica. O padrao HITL permanece fora de escopo desta fase.

### IMOB bloqueado por entitlement/scope

Exemplo conceitual:

```json
{
  "version": "vertical_context_badge.v1",
  "verticalId": "imob",
  "label": "IMOB",
  "state": "blocked",
  "reasonCode": "IMOB_ENTITLEMENT_MISSING",
  "source": "chat.vertical_handoff.v1",
  "ariaLabel": "Contexto IMOB bloqueado por entitlement ausente"
}
```

Render esperado: nao mostrar badge ativo. A UI deve renderizar o card/gate fail-closed recebido do backend ou do contrato validado.

## 9. UX e acessibilidade

### Principios

- O badge deve reduzir ambiguidade, nao virar navegacao primaria.
- O label deve ser curto: `IMOB`, `LEGAL`, `MKT`, `FIN`, `LOG`.
- A cor deve indicar estado, mas nunca ser a unica forma de comunicacao.
- O `ariaLabel` deve explicar vertical e estado.
- O badge deve ser legivel em mobile sem quebrar a bolha de mensagem.
- Estados bloqueados ou criticos devem usar texto claro e nao apenas cor.

### Texto recomendado

| Estado | Texto curto | Descricao acessivel |
| --- | --- | --- |
| `active` | `IMOB` | `Contexto vertical IMOB ativo` |
| `assisted` | `IMOB + J_360` | `Contexto IMOB com apoio especialista J_360` |
| `critical_pending_hitl` | `IMOB - aprovar` | `Contexto IMOB com acao critica aguardando aprovacao humana` |
| `blocked` | nao renderizar como ativo | `Contexto IMOB bloqueado por politica ou acesso` |
| `degraded` | `IMOB - parcial` | `Contexto IMOB parcial ou degradado` |
| `context_only` | `LEGAL - contexto` | `Contexto LEGAL informativo, sem operacao habilitada` |

### Mobile

- Preferir uma linha.
- Evitar tooltip como unica fonte de informacao.
- Se o label exceder o espaco, truncar sublabel e preservar `ariaLabel`.
- Nao deslocar quick replies ou botoes principais.

## 10. Fora de escopo

ARCH-CHAT-3 nao implementa:

- schema fisico do `chat.vertical_handoff.v1`;
- produtor de `renderHints`;
- mudanca no `ChatAgentLauncher`;
- mudanca no runtime;
- mudanca no engine;
- mudanca em rotas;
- mudanca em workflow;
- mudanca em package/lockfile;
- mudanca em schema, seed ou migracao;
- deep link padronizado para cockpit;
- HITL standard;
- receipt/bundle standard;
- provider WhatsApp real;
- secret produtivo;
- webhook produtivo;
- mutacao;
- `lead.create`;
- `lead.discard`;
- acao critica.

## 11. Riscos e mitigacao

| Risco | Impacto | Mitigacao |
| --- | --- | --- |
| Badge inferido pelo frontend | Drift contra agent-driven e possivel exposicao de estado incorreto. | Renderizar somente a partir de contrato/snapshot validado. |
| `verticalContext` atual ser usado como autorizacao | Badge poderia parecer operacional sem contrato completo. | Tratar `verticalContext` como sinal parcial ate haver fonte canonica. |
| IMOB parecer chat paralelo | Confusao com modelo de front door universal. | Alinhar badge ao baseline ARCH-CHAT-1: Chat front door, vertical cockpit. |
| Badge virar CTA de cockpit | Anteciparia ARCH-CHAT-4. | Manter deep link fora de escopo. |
| Badge esconder bloqueio de entitlement | Usuario poderia interpretar acesso negado como contexto ativo. | `state=blocked` nao renderiza badge ativo; usar card fail-closed. |
| PII no label | Vazamento visual em mensagem/export/screenshot. | Labels curtos e sem dados pessoais/sensiveis. |
| HITL parecer aprovado | Acao critica poderia parecer pronta para execucao. | `critical_pending_hitl` deve comunicar bloqueio, nao autorizacao. |

## 12. DoD

ARCH-CHAT-3 fica completo nesta rodada quando:

- este documento estiver versionado em `docs/proposals/arch-chat-3-vertical-context-badge.md`;
- a pre-condicao ARCH-CHAT-2 estiver documentada;
- o estado atual do frontend estiver evidenciado;
- a proposta do `Vertical Context Badge v1` estiver definida;
- as regras de renderizacao preservarem `ChatAgentLauncher` render-only;
- a aplicacao inicial ao IMOB estiver descrita sem implementar provider, webhook, secret, mutacao ou acao critica;
- ficar explicito que `renderHints` sao apresentacao, nao policy;
- ficar explicito que ausencia de contrato/snapshot validado impede implementacao visual segura;
- `pnpm check:evidence-index` passar;
- `pnpm check:docs-link-integrity` passar;
- `git diff --check` passar;
- `git diff -- .github/workflows release.yml apps packages scripts` nao mostrar alteracoes;
- o arquivo for staged com `git add -f docs/proposals/arch-chat-3-vertical-context-badge.md`, caso continue ignorado por `.gitignore`.

Status final esperado: proposta/parcial evidenciada documentalmente.
