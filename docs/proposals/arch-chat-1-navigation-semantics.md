# ARCH-CHAT-1 — Chat/Vertical Navigation Semantics

> Status: proposta/parcial evidenciada documentalmente.
>
> Escopo desta rodada: investigacao read-only e criacao deste documento. Nenhum codigo, schema, seed, migracao, config, workflow, package, lockfile, componente, rota, provider, WhatsApp, secret, mutacao, runtime, engine ou `ChatAgentLauncher` foi alterado.

## 1. Sumario executivo

Este documento define a semantica alvo de navegacao entre o Chat universal e as verticais operacionais. A regra proposta e: `Chat` e o front door conversacional universal; abas verticais como `IMOB` sao cockpits/command centers operacionais; rotas de chat vertical, quando existirem por compatibilidade ou piloto, nao devem virar um segundo front door publico permanente.

O estado atual ja possui pecas importantes: `/app/chat` existe como rota geral, `/app/agents` redireciona para `/app/chat`, IMOB possui dashboard, command center, chat proprio, access gate, deep links, proof surface, receipts e bundles. O gap principal e semantico: o item publico `IMOB` na navegacao aponta para `/app/imob/chat`, apesar de haver `/app/imob/dashboard` como cockpit operacional. Isso pode fazer IMOB parecer "chat paralelo" em vez de vertical acionada pelo Chat e acompanhada no cockpit.

ARCH-CHAT-1 nao implementa a mudanca de rota ou label. Ele registra o modelo alvo, os gaps atuais, os boundaries de frontend e o DoD para uma futura implementacao governada.

## 2. Fontes e classificacao de evidencia

Fontes lidas:

- `CODEX.md`
- `IA_EIAH.md`
- `AGENTS.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/proposals/universal-chat-front-door-vertical-operating-model.md`
- `docs/proposals/imob-chat-agentic-ops-library-integration.md`
- `docs/proposals/imob-data-sources.md`
- `apps/web/src/App.tsx`
- `apps/web/src/components/agents/ChatAgentLauncher.tsx`
- `apps/web/src/components/agents/chatLauncherEngine.ts`
- `apps/web/src/pages/app/imob/chat.tsx`
- `apps/web/src/pages/app/imob/dashboard.tsx`
- `apps/web/src/pages/app/imob/chatProof.ts`
- `apps/web/src/features/imob/ImobCommandCenter.tsx`
- `apps/web/src/components/imob/ImobAccessGateCard.tsx`

Classificacao usada:

- **Fato do codebase:** afirmacao verificavel por arquivo e linha.
- **Fato documental:** regra ou decisao registrada em documento do repositorio.
- **Proposta ARCH-CHAT-1:** semantica alvo ainda nao implementada.
- **Gap:** diferenca entre o estado atual e a semantica alvo.
- **Fora de escopo:** qualquer alteracao de runtime, engine, `ChatAgentLauncher`, rotas, componentes, provider, secrets, workflows, schema ou mutacoes.

Normativos relevantes:

- `AGENTS.md` define que o chat deve ser `agent-driven`: agente define, engine executa e `ChatAgentLauncher` apenas renderiza.
- `docs/architecture/agent-chat-runtime.md` registra que o `ChatAgentLauncher` deve permanecer render-first e nao deve receber novas regras de comportamento.
- `docs/proposals/universal-chat-front-door-vertical-operating-model.md` propoe `Chat` como front door universal e verticais como cockpits.
- `docs/proposals/imob-chat-agentic-ops-library-integration.md` posiciona IMOB como operador agentic comercial-operacional, sem implementar provider externo, coleta externa ou mutacao critica.

## 3. Estado atual da navegacao

### Shell e itens publicos

O shell web declara os itens `Runs`, `Chat`, `Billing`, `Marketplace`, `IMOB`, `Self-service` e `Perfil` em `apps/web/src/App.tsx:56-64`. O item `Chat` aponta para `/app/chat`; o item `IMOB` aponta para `/app/imob/chat` e exige IMOB instalado em `apps/web/src/App.tsx:58-62`.

O layout reconhece superficies IMOB por rotas iniciadas em `/app/imob` ou `/app/marketplace/imob`, troca o subtitulo para `Imobiliaria Digital Command Center` e trata `/app/imob/chat` como rota visual especial em `apps/web/src/App.tsx:82-108`.

O header de navegacao usa lista horizontal com overflow responsivo em `apps/web/src/App.tsx:124-139`, o que ja evita quebra basica de nav, mas ainda nao prova a semantica alvo em mobile.

### Autenticacao, entitlement e fail-closed

`RequireAuth` solicita contexto de sessao com `targetDomain=imob` quando a rota contem `/app/imob` ou `domain=imob`, atualizando tenant, workspace, roles, entitlements, verticals, experience, branding e access gate em `apps/web/src/App.tsx:147-204`.

Quando IMOB nao esta instalado, `RequireImobInstall` redireciona para `/app/marketplace/imob` em `apps/web/src/App.tsx:213-220`. O card de gate IMOB renderiza `GateCard 403`, CTA, workspace e trace em `apps/web/src/components/imob/ImobAccessGateCard.tsx:6-45`.

### Rotas de Chat

`/app/chat` renderiza `AgentsPage` dentro de `Layout` e `RequireAuth` em `apps/web/src/App.tsx:299-307`. A rota legada `/app/agents` redireciona para `/app/chat` preservando query/hash em `apps/web/src/App.tsx:262-265` e `apps/web/src/App.tsx:309`.

O `ChatAgentLauncher` importa helpers de engine como `detectLauncherRouteIntent`, `resolveLauncherTurnDecision`, snapshots e preparacao de run em `apps/web/src/components/agents/ChatAgentLauncher.tsx:26-45`. Isso sustenta a direcao agent-driven, desde que novas regras nao sejam adicionadas diretamente ao launcher.

O engine tipa `LauncherRouteIntent` como `proposal | imob | playbook | help | orchestrator` e modela decisoes, render variants e presentation route intent em `apps/web/src/components/agents/chatLauncherEngine.ts:140-218`.

### Rotas IMOB

`/app/imob/dashboard` renderiza `ImobDashboardPage` com auth e instalacao IMOB em `apps/web/src/App.tsx:344-354`. `/app/imob/chat` renderiza `ImobChatPage` com os mesmos gates em `apps/web/src/App.tsx:356-366`.

Rotas legadas `/app/imob/properties`, `/app/imob/processes` e `/app/imob/partners` redirecionam para `/app/imob/dashboard` com `section`, `cc=open` e `#command-center` em `apps/web/src/App.tsx:368-384`.

No proprio Chat IMOB, CTAs legados para `properties`, `processes` e `partners` sao normalizados para `/app/imob/dashboard?...#command-center` em `apps/web/src/pages/app/imob/chat.tsx:808-827`. Isso indica que o dashboard/command center ja atua como destino operacional preferencial para secoes IMOB.

### Cockpit IMOB

O dashboard IMOB constroi links de volta para `/app/imob/chat` preservando `conversationId`, `caseId`, `threadId` e `autoprompt` em `apps/web/src/pages/app/imob/dashboard.tsx:196-220`.

O estado do dashboard inclui conversas, threads, owners, properties, cases, runs, custos, priority queue, waiting-on board, heatmap, specialist load, rescue index, approval context, follow-ups, health, casos e KPIs em `apps/web/src/pages/app/imob/dashboard.tsx:281-336`.

O Command Center renderiza `IMOB Command Center`, `Central Operacional`, KPIs, filtros, priority queue, waiting-on board, heatmap, tabela operacional, evidencias, sincronizacao e comprovantes em `apps/web/src/features/imob/ImobCommandCenter.tsx:67-331`.

O Command Center tambem oferece deep link `abrir no chat` com `conversationId`, `caseId`, `threadId`, `actionId`, `reasonCode` e `autoprompt` em `apps/web/src/features/imob/ImobCommandCenter.tsx:236-259`.

### Proof, receipts e bundles

O Chat IMOB resolve proof surface com `runId`, `txId`, `receiptPath`, `bundlePath`, `verifyUrl`, `required`, `ready` e `state` em `apps/web/src/pages/app/imob/chatProof.ts:16-71`.

O Command Center renderiza acoes de dossie e comprovante PDF/HTML quando capabilities permitem em `apps/web/src/features/imob/ImobCommandCenter.tsx:265-321`.

### Gaps atuais

- O item publico `IMOB` aponta para `/app/imob/chat`, nao para o cockpit `/app/imob/dashboard`.
- Ha risco de o usuario interpretar IMOB como chat paralelo ao `Chat` universal.
- Deep links entre cockpit e chat existem, mas sao especificos do IMOB e ainda nao estao documentados como padrao de navegacao para todas as verticais.
- A semantica de futuro `/app/legal`, `/app/mkt`, `/app/fin` e `/app/log` ainda nao esta formalizada como cockpit, contexto ou ausente.
- Ainda nao ha teste/snapshot dedicado que prove "Chat e front door; vertical e cockpit" como contrato de navegacao.

## 4. Modelo semantico alvo

### Principio

O modelo alvo e:

```text
Core governa
Chat orquestra
Vertical executa
Frontend renderiza
```

Aplicado a navegacao:

- `Chat` e o front door universal para conversa, triagem, intencao, handoff e continuidade.
- `Vertical` e cockpit operacional do dominio, nao outro front door conversacional independente.
- `Runs` e auditoria transversal.
- `Marketplace` e ativacao/instalacao de capacidades.
- `Billing` e plano, consumo, custo e economia.
- `Perfil` e identidade, roles, workspace, preferencias e governanca de acesso.

### Semantica das rotas

| Rota | Papel alvo | Observacao |
| --- | --- | --- |
| `/app/chat` | Front door conversacional universal | Entrada primaria para conversas e handoffs. |
| `/app/imob/dashboard` | Cockpit IMOB | Visao operacional da vertical, funil, casos, bloqueios, KPIs, receipts e bundles. |
| `/app/imob/chat` | Superficie contextual/transicional IMOB | Permitida para compatibilidade, piloto, deep links e continuidade de caso, mas nao deve ser o item publico primario da vertical. |
| `/app/runs` | Auditoria transversal | Runs, eventos, streams, bundles e historico. |
| `/app/marketplace` | Ativacao | Instala capacidades, nao substitui entitlement/runtime. |
| `/app/billing` | Plano e consumo | Consumo, custo e quota. |
| `/profile` | Identidade e governanca pessoal | Perfil, workspace e preferencias. |

### Semantica dos labels

- Label `Chat`: conversa universal.
- Label `IMOB`: cockpit operacional IMOB.
- Labels futuros `LEGAL`, `MKT`, `FIN`, `LOG`: cockpits ou contextos verticais conforme maturidade, nunca chats paralelos por padrao.

### Regra de compatibilidade

Rotas de chat vertical podem existir quando forem necessarias para:

- preservar deep links atuais;
- continuar conversa com contexto especifico;
- abrir um caso/thread ja resolvido;
- suportar piloto controlado;
- manter compatibilidade com evidencias e links existentes.

Mas a navegacao principal deve apontar a vertical para cockpit quando o cockpit existir.

## 5. Regra Chat <-> Vertical

### Entrada

O usuario entra pelo `Chat` quando quer iniciar, perguntar, pedir execucao, pedir explicacao, acionar especialistas ou nao sabe qual vertical usar.

### Resolucao

O agente/engine/runtime deve resolver:

- intencao;
- vertical candidata;
- tenant;
- workspace;
- entitlement;
- roles/RBAC;
- risk level;
- HITL;
- next action;
- render hints.

O frontend nao deve inferir esses elementos por conta propria.

### Handoff

Quando a intencao pertencer a uma vertical:

1. o Chat anuncia o handoff;
2. a UI renderiza badge/contexto da vertical a partir de contrato;
3. a vertical executa ou apresenta o cockpit conforme permissao;
4. o cockpit oferece retorno contextual ao Chat quando houver caso, thread, action ou reasonCode;
5. qualquer falha de entitlement, scope ou policy permanece fail-closed.

### Volta ao Chat

O cockpit pode voltar ao Chat com parametros como:

- `conversationId`;
- `caseId`;
- `threadId`;
- `actionId`;
- `reasonCode`;
- `autoprompt`.

IMOB ja faz parte disso hoje no dashboard e Command Center em `apps/web/src/pages/app/imob/dashboard.tsx:196-220` e `apps/web/src/features/imob/ImobCommandCenter.tsx:236-259`. O padrao deve ser formalizado para futuras verticais em contrato proprio, sem regra ad hoc por componente.

## 6. Aplicacao ao IMOB

### Estado alvo IMOB

IMOB deve aparecer para o usuario como vertical operacional imobiliaria. O destino publico natural da aba `IMOB`, quando a vertical esta instalada, deve ser o cockpit/command center.

Semantica proposta:

- `Chat` inicia conversas e handoffs IMOB.
- `IMOB` abre o cockpit da operacao imobiliaria.
- `IMOB Command Center` mostra bloqueios, funil, filas, KPIs, riscos, owners, evidencias e comprovantes.
- `abrir no chat` continua uma conversa IMOB contextualizada quando o usuario esta em um caso especifico.
- `/app/imob/chat` permanece como rota contextual/transicional ate haver decisao de produto e migracao segura.

### Gaps IMOB especificos

- Alterar a semantica publica do item `IMOB` exigira atualizar rota/label/testes em tarefa futura, nao neste documento.
- O subtitulo `Imobiliaria Digital Command Center` ja existe para superficies IMOB, mas a rota primaria do item IMOB ainda aponta para chat.
- O Chat IMOB tem estados de front door e erro fail-closed em `apps/web/src/pages/app/imob/chat.tsx:891-975`; esses estados devem continuar seguros, mas nao precisam ser o destino primario da nav.
- O cockpit ja tem informacao operacional suficiente para ser destino primario: prioridade, waiting-on, heatmap, evidencias, comprovantes e deep links.

### Resultado esperado apos futura implementacao

Uma futura tarefa de implementacao deve fazer o usuario perceber:

- "Chat" = falar com a EIAH e acionar capacidades.
- "IMOB" = gerir a operacao imobiliaria.
- "Abrir no chat" dentro do IMOB = continuar uma conversa daquele caso.

## 7. Padrao para futuras verticais

### Estados de vertical

| Estado | Nav publica | Chat handoff | Cockpit | Observacao |
| --- | --- | --- | --- | --- |
| `absent` | nao aparece | Chat pode explicar indisponibilidade | nao existe | Ex.: vertical ainda nao criada. |
| `context_only` | opcional/oculta | Chat pode orientar e coletar contexto | nao operacional | Ex.: Legal sem baseline operacional. |
| `installed_cockpit` | aparece como aba vertical | Chat pode handoff com entitlement | existe | Padrao alvo para IMOB. |
| `pilot_contextual_chat` | nao deve ser destino publico primario | Chat/deep link pode abrir chat contextual | cockpit decide | Estado transicional. |
| `blocked` | nao aparece ou gateia | fail-closed | gate/CTA | Sem entitlement, role, scope ou instalacao. |

### Legal

Enquanto Legal for `context_only`, o Chat pode orientar, coletar contexto e indicar limites. A aba Legal nao deve prometer cockpit operacional sem baseline, gates, owners, evidence e runtime. Quando evoluir, deve seguir o mesmo padrao: `Legal` como cockpit juridico, nao chat paralelo.

### MKT

MKT deve seguir cockpit de campanhas, copy, assets, publish gates e aprovacoes. Qualquer publish/outbound permanece HITL. O Chat pode criar handoff e rascunho; o cockpit governa backlog, status, aprovacao e provas.

### FIN

FIN deve seguir cockpit de cobrancas, settlements, invoices, conciliacao, aging e riscos. Mutacoes financeiras exigem gate especifico, run, receipt e bundle quando aplicavel.

### LOG

LOG permanece ausente ou `context_only` ate haver baseline. Nao deve aparecer como operacional sem contrato, gates e evidencias.

## 8. Boundaries de frontend

### Permitido em frontend

- Renderizar nav, labels, tabs, breadcrumbs, badges e CTAs.
- Renderizar estados loading, empty, error, entitlement e fail-closed recebidos de runtime/API.
- Preservar e transportar parametros de deep link.
- Renderizar cards, widgets, proof, receipt, bundle e verify links.
- Redirecionar rotas legadas para destinos canonicos quando definido por contrato/produto.
- Adaptar layout responsivo sem alterar regra de negocio.

### Nao permitido em frontend

- Criar regra nova de comportamento diretamente no `ChatAgentLauncher`.
- Inferir entitlement, role, risk level, HITL, provider boundary, side effect ou autorizacao critica no componente.
- Integrar provider real, segredo produtivo, webhook produtivo, storage externo obrigatorio ou mutacao.
- Alterar runtime, engine, ChatAgentLauncher, workflows, packages/scripts ou schema nesta fase.
- Transformar rota de chat vertical em front door paralelo sem decisao e contrato.

### `ChatAgentLauncher`

O launcher deve continuar renderizando resultado resolvido. Qualquer futura mudanca de handoff, badge, quick reply, fallback ou regra de resposta deve primeiro existir em contrato/agente/engine/runtime. O launcher pode consumir render hints e presentation snapshots, mas nao deve criar semantica propria para decidir que uma vertical esta ativa.

### Rotas e deep links

Futuras mudancas de rota devem preservar:

- compatibilidade com links existentes;
- query params de contexto;
- hash `#command-center` quando aplicavel;
- access gates;
- 403 fail-closed;
- mobile/responsivo;
- auditabilidade de runs/proofs.

## 9. UX minima esperada

### Navegacao desktop

- `Chat` visivel como entrada universal.
- `IMOB` visivel somente quando instalado/permitido.
- `IMOB` deve abrir cockpit quando a mudanca for implementada.
- `Runs`, `Marketplace`, `Billing` e `Perfil` mantem seus papeis transversais.

### Navegacao mobile

- Nav deve continuar rolavel ou adaptar para padrao equivalente sem esconder destinos essenciais.
- Labels nao devem quebrar layout.
- Cockpit deve preservar acesso a filtros, filas, comprovantes e retorno ao chat sem sobreposicao.

### Dentro do Chat

- Handoff anunciado quando vertical for acionada.
- Badge/contexto vertical derivado de contrato.
- Quick replies poucas e validas como input.
- Fallback claro quando vertical nao estiver instalada ou entitlement faltar.
- Sem declaracao de execucao quando houver apenas proposta, pre-check ou contexto.

### Dentro da vertical

- Cockpit mostra situacao operacional antes de pedir conversa.
- Cards de caso oferecem `abrir no chat` com contexto.
- Comprovantes, dossies, run e receipt aparecem conforme capability.
- Erros e bloqueios mostram reasonCode quando disponivel.

## 10. Roadmap apos ARCH-CHAT-1

1. **ARCH-CHAT-2 — Handoff Contract v1**
   - Versionar contrato `Chat -> Vertical`.
   - Incluir `verticalId`, `intentId`, `reasonCode`, `renderHints`, entitlement, risk e HITL.
   - Criar contract tests.

2. **ARCH-CHAT-3 — Render Hints / Vertical Context Badge**
   - Renderizar badge e handoff anunciado a partir do contrato.
   - Provar que o launcher nao infere comportamento.

3. **ARCH-CHAT-4 — Vertical Cockpit Route Canon**
   - Definir destinos canonicos por vertical.
   - Avaliar migracao do item `IMOB` para `/app/imob/dashboard`.
   - Preservar redirects e deep links.

4. **ARCH-CHAT-5 — IMOB Deep Link Contract**
   - Padronizar ida cockpit -> chat e chat -> cockpit.
   - Cobrir `conversationId`, `caseId`, `threadId`, `actionId`, `reasonCode` e `autoprompt`.

5. **ARCH-CHAT-6 — HITL/Gate Rendering Standard**
   - Padronizar gates visuais sem mover decisao para frontend.

6. **ARCH-CHAT-7 — Receipt/Bundle Rendering Standard**
   - Padronizar proof, receipt, bundle e verifyUrl em Chat e cockpits.

7. **ARCH-CHAT-8 — IMOB Pilot Navigation Change**
   - Implementar mudanca de nav somente apos contrato, testes e plano de rollback.

## 11. Riscos e mitigacao

| Risco | Impacto | Mitigacao |
| --- | --- | --- |
| IMOB parecer chat paralelo | Confusao de produto e drift arquitetural | Fazer `Chat` ser front door e `IMOB` cockpit em implementacao futura. |
| Mudanca quebrar deep links existentes | Perda de contexto de casos e evidencias | Preservar `/app/imob/chat` como rota contextual/transicional e manter redirects. |
| Frontend inferir regra de handoff | Violacao de arquitetura agent-driven | Criar contrato/engine antes de render hints; launcher apenas renderiza. |
| Vertical sem baseline aparecer operacional | Promessa indevida | Usar estados `absent`, `context_only`, `installed_cockpit`, `blocked`. |
| Mobile esconder operacao critica | UX degradada | Testes/snapshots responsivos antes de mudar nav. |
| Gate 403 virar experiencia ambigua | Suporte e seguranca prejudicados | Preservar reasonCode, CTA, workspace e trace. |
| Proof/receipt sumir no cockpit | Perda de auditabilidade | Padronizar receipt/bundle rendering antes de piloto. |
| Mudanca ser confundida com autorizacao produtiva | Governanca incorreta | Este documento e proposta documental e nao autoriza implementacao, provider, secrets, webhook ou mutacoes. |

## 12. DoD

DoD documental desta tarefa:

- `CODEX.md` lido antes de qualquer acao.
- Fontes obrigatorias lidas.
- Estado atual da navegacao documentado com evidencias de arquivo/linha.
- Modelo semantico alvo documentado.
- Regra `Chat <-> Vertical` documentada.
- Aplicacao ao IMOB documentada.
- Padrao para futuras verticais documentado.
- Boundaries de frontend documentados.
- UX minima esperada documentada.
- Roadmap posterior documentado.
- Riscos e mitigacoes documentados.
- Nenhum arquivo alem deste documento alterado nesta tarefa.

DoD para futura implementacao, fora do escopo desta tarefa:

- Contrato `Chat -> Vertical` versionado.
- Testes de rota/nav provando `Chat` como front door e vertical como cockpit.
- Testes de deep link preservando contexto.
- Testes de entitlement/access gate fail-closed.
- Snapshots responsivos desktop/mobile.
- Prova de que `ChatAgentLauncher` nao ganhou regra cognitiva.
- Plano de rollback para qualquer alteracao de rota publica.
- Checks documentais e de isolamento verdes.

Status final deste documento: proposta/parcial evidenciada documentalmente.
