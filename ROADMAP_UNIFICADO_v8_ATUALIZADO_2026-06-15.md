# ROADMAP ATUALIZADO v8.1

Data de referência desta revisão: **2026-06-25**
Escopo: plataforma agentic governada (core + governança + interop + economy + Track P)

> Arquivo canônico vigente desta revisão: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`.
>
> Revisão v8.1: atualização documental para alinhar o roadmap v8 à realidade do repositório após os merges IMOB #141–#146, sem rebaixar os gates normativos de P0–P4.

## 1) Resumo executivo

O core da plataforma está operacional e auditável (F0-F3 concluídas), com F4/F5 já em produção parcial e foco de v8 em **hardening verificável**, **fechamento de lacunas de governança/economy** e **redução de drift documental**.

## 1.1) Atualização executiva v8.1 — 2026-06-25

Esta revisão não reabre o roadmap v8; ela sincroniza o documento canônico com o estado atual verificado no código e nos checklists operacionais.

Leitura consolidada:
- O roadmap v8 está majoritariamente implementado nas frentes centrais.
- O único pendente explícito do plano de hardening v8.1 é a ratificação operacional dos SLO targets por ciclos recorrentes.
- O repositório avançou além do planejado em três direções: produto IMOB, governança multi-vertical e operação/documentação executável.
- O IMOB passou a operar acima do escopo normativo original do v8, especialmente em Trilha B, RunArchive, Command Center, Dashboard operacional e consolidação Funil + Equipe.
- Esta revisão não transforma itens sem evidência em DONE. Tudo que não tiver evidência indexável permanece como parcial/proposta.

Regra de decisão v8.1:
- Não reabrir frentes já fechadas de IMOB Data sem decisão explícita.
- Só voltar à Trilha B runtime mínimo se a decisão for adicionar gate real de entitlement/billing no runtime ou expandir o contrato canônico para outra vertical, como LEGAL.
- Evidence Index só pode apontar para arquivos existentes e evidências geradas por execução real.

## 2) Estado consolidado por fase

| Fase | Status v8.1 | Situação atual |
| --- | --- | --- |
| 0 — Infraestrutura comum | ✅ Concluída | Manter estabilidade e SLOs. |
| 1 — Fundação operacional | ✅ Concluída | Manter. |
| 2 — Cognição inicial | ✅ Concluída | Manter. |
| 3 — Governança cognitiva | ✅ Concluída | Evolução incremental. |
| 4 — Execução crítica imutável | ⚙️ Parcial avançada / sustentada | Hardening operacional recorrente continua obrigatório; não declarar fechado sem ciclos e evidência. |
| 5.0 — Marketplace/governança avançada | ✅ Concluída (core) | Core fechado; UX/auditoria avançada seguem em evolução. |
| 5.1 — PoU + Trust Gate | ✅ Concluída (operacional) | Receipt Canon v1 obrigatório nos fluxos críticos com gate ativo em CI; manter hardening recorrente. |
| 5.2 — Policies autoaplicáveis + human approvals | ⚙️ Parcial avançada | IMOB avançou com responsible actor, reason codes e runtime mínimo Trilha B; entitlement/billing real ainda fora do runtime. |
| 5.3 — Auditoria pública DLT | ⚙️ Parcial avançada | E2E HIGH recorrente e manifest/recency gates avançados; ratificação operacional de SLO targets segue como pendente explícito. |
| 5.4 — Interoperabilidade | ⚙️ Parcial avançada+ | Interop spec v1 e contrato mínimo multi-vertical avançaram; manter baseline versionado e CI para breaking changes. |
| 5.5 — Outcome/experimentos | ⚙️ Parcial avançada | Mantém recomendação AXO e automações de promoção como evolução contínua. |
| 5.6 — Economy | ⚙️ Parcial avançada+ | Settlement A2A + EconomyReceipt v1 avançaram; ratificação operacional/SLO e settlement por ambiente continuam gates. |
| Track P — Produto operacional | ⚙️ Parcial avançada+ | IMOB está acima do programado: Command Center, Dashboard operacional, RunArchive, Funil + Equipe, checklists executáveis. |

## 3) Objetivos do v8

1. Transformar “parcial avançado” em “operacionalmente fechado” com critérios de evidência.
2. Eliminar drift entre docs, contratos e runtime.
3. Fechar cadeia econômica fim a fim com settlement confiável por provider.
4. Sustentar rollout de verticais com gates de não-regressão.

## 4) Backlog priorizado v8 (execução)

## P0 — Integridade documental e fonte da verdade
- Definir e publicar arquivo único de roadmap canônico (`ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-05-23.md`).
- Atualizar `docs/EVIDENCE_INDEX.md` para apontar apenas fontes existentes.
- Adicionar check de CI para falhar quando “source of truth” não existir.

**DoD P0**
- Referência de roadmap válida no índice.
- CI bloqueando novas quebras de referência.

## P1 — Governança/execução crítica
- Completar hardening de F4 (alertas, reconciliação contínua, rotina operacional).
- Consolidar F5.1: Receipt Canon v1 obrigatório para fluxos críticos.
- Fechar F5.2: padronizar aprovação humana no modelo e contrato (sem lacunas de schema).

**Status atual**
- ✅ Fechado por evidência/gates (`check:p1-critical-chain` + `check:p1-reconciliation-recurring`).

**DoD P1**
- Evidência recorrente de reconciliação sem gaps críticos.
- Testes de fail-closed cobrindo cadeias inconsistentes.
- Contrato de aprovação humana consistente entre API, schema e evidência.

## P2 — Auditoria pública e interop
- Cobrir E2E HIGH por ação crítica definida em policy.
- Fechar matriz de compatibilidade interop em CI.
- Congelar versão de contrato interop com política explícita de evolução.
- Tratar o **Agent Protocol** como contrato público canônico de interop A2A/B2B.
- Garantir cobertura operacional das rotas canônicas `discovery -> negotiate -> execute`.
- Formalizar política de evolução contratual entre agentes (compatibilidade, depreciação e sunset).

**DoD P2**
- E2E HIGH completo para ações críticas.
- CI aprovado para matriz de compatibilidade.
- Baseline interop atualizado sem breaking não-versionado.
- Contrato público do Agent Protocol versionado e sincronizado com runtime.
- Fluxo `discovery/negotiate/execute` validado por smoke + e2e.
- Evolução contratual bloqueando breaking change sem major bump.

## P3 — Economy hardening
- Evoluir settlement provider: reduzir/adaptar stubs (`crypto`/`bank`) para modo operacional.
- Consolidar geração de **invoice mensal** como trilha padrão de cobrança verificável.
- Consolidar webhook billing (assinatura, replay, idempotência) com evidência periódica.
- Expandir reputação/disputas para trilha verificável de produção.
- Garantir vínculo econômico auditável `receipt -> ledger -> provider settlement` em fluxos críticos.
- Sustentar recorrência contínua via gate dedicado (`check:p3-stability-recurring`) com janela mínima de ciclos APE.

**DoD P3**
- Settlement multi-provider com modos explicitamente suportados por ambiente.
- Métricas de replay/duplicidade estáveis.
- Evidência de ciclo econômico completo em produção controlada.
- Invoice, settlement, disputa e reputação reconciliados por tenant/workspace sem gaps críticos.

## P4 — Track P (produto e rollout)
- Escalar verticais com checklist padrão e gates de não-regressão.
- Fortalecer command centers por vertical (funil, bloqueios, export de prova).
- Operar piloto comercial com critérios de avanço `shadow -> pilot -> small`.
- Consolidar `IMOB Knowledge Search` como capacidade documental in-chat da vertical, com `EIAH` atuando como front door e `IMOB` como dono do fluxo de busca.
- Garantir gate fail-closed por `tenantId`/`workspaceId` e assinatura ativa da vertical antes de expor busca, chat ou ações do `IMOB`.
- Evoluir a busca por fases: handshake no chat já implementado -> busca por metadados -> sync de Drive -> expansão para uploads/web, preservando `sourceType` e isolamento multi-tenant/workspace.
- Formalizar taxonomia pública de produto para reduzir drift entre catálogo, verticais, runtime interno e superfícies operacionais.
- Adotar as classes públicas oficiais: `Assistente principal`, `Especialistas`, `Verticais` e `Áreas operacionais`.
- Tratar `EIAH` como assistente principal; agentes canônicos do registry como especialistas; `IMOB`, `LEGAL` e próximas frentes como verticais; `Runs`, `RunViewer`, `Billing`, `Economy`, `Marketplace` e `Self-service` como áreas operacionais.
- Proibir nomenclatura pública que exponha runtimes internos como se fossem produtos do catálogo, como `IMOB_CRM` ou subagentes `IMOB_*`.
- Manter ordem explícita das próximas frentes verticais após `LEGAL`: `MKT` -> `Financeiro` -> `URBAN` -> `Logística`.

**Fluxo operacional das verticais no EIAH SaaS**

`EIAH SaaS`
→ `Cadastro`
→ `Tenant`
→ `Assinatura / Plano`
→ `Pagamento / Billing`
→ `Ativação / Entitlements`
→ `Permissões / Roles / Scope`
→ `Workspace`
→ `Chat Agent Launcher EIAH`
→ `Verticais (IMOB, LEGAL e próximas frentes MKT, Financeiro, URBAN, Logística)`

**Regra operacional**
- as verticais não existem fora do SaaS;
- o acesso à vertical depende de `tenantId`, `workspaceId` e `entitlements` válidos;
- o `Chat Agent Launcher EIAH` funciona como front door;
- o `engine` decide o handoff para a vertical;
- sem entitlement ativo, o fluxo deve falhar em modo `fail-closed`.
- a linguagem pública deve distinguir `Assistente principal`, `Especialistas`, `Verticais` e `Áreas operacionais`;
- nenhuma vertical deve ser rebaixada a "mais um agente" no catálogo público;
- nenhuma área operacional deve ser promovida a agente;
- nenhum runtime interno deve ser exposto como nome principal de produto sem decisão explícita;
- componentes internos como `IMOB_CRM` e subagentes `IMOB_*` permanecem fora da nomenclatura pública principal.

**DoD P4**
- KPI mínimo por vertical atingido.
- Sem regressão de isolamento multi-tenant/workspace.
- Evidências semanais de operação e rollout.
- `IMOB Knowledge Search` roteado pelo `engine`, sem lógica nova no `ChatAgentLauncher`.
- Busca documental da vertical operando com gating por assinatura e retorno auditável por fonte (`drive`, `upload`, `web`, `internal_doc`).
- Taxonomia pública oficial documentada e aplicada sem ambiguidade entre `EIAH`, especialistas, verticais e áreas operacionais.
- Ordem das próximas frentes verticais registrada explicitamente no roadmap e nas superfícies de produto: `LEGAL` -> `MKT` -> `Financeiro` -> `URBAN` -> `Logística`.
- Componentes internos de vertical permanecem fora da nomenclatura pública principal.

## 5) Riscos principais e mitigação

| Risco | Impacto | Mitigação v8 |
| --- | --- | --- |
| Drift docs vs runtime | Decisão errada e auditoria fraca | CI de consistência + fonte de verdade única |
| Lacunas de approvals/schema | Governança incompleta | fechamento contratual e testes de contrato |
| Settlement parcial por provider | Economia limitada | roadmap de provider por ambiente com SLO |
| Coexistência de run-workers | divergência operacional | definir modo único de operação por ambiente |

## 6) Métricas de saída v8

- `hardMetricsGo=true` em ciclos APE semanais consecutivos.
- `auditGap=0` e `duplicateSideEffects=0` em evidências recorrentes.
- Cobertura E2E HIGH de ações críticas definida em policy.
- Regressão de interop/economy bloqueada por CI.

## 7) Plano de entrega (ondas)

1. **Onda 1 (P0 + P1 base)**: integridade documental + fechamento governança crítica.
2. **Onda 2 (P2 + P3 base)**: interop compatível + economy multi-provider operacional.
3. **Onda 3 (P4 + estabilização)**: expansão de verticais com gates e rollout controlado.

## 8) Declaração de estado atual (v8)

A plataforma já opera como base agentic governada e auditável; o v8 foca em fechar lacunas de hardening, interoperabilidade e economia para atingir operação plenamente verificável em escala.

## 9) Plano de conclusão do remanescente v7 dentro do v8

Objetivo: concluir ponta a ponta os itens ainda parciais (governança/economy/auditoria/rollout), mantendo o v8 como trilha canônica de fechamento.

### 9.1) Governança (fechamento F5.1/F5.2)
- Unificar aprovação humana em **schema + API + evidência**.
- Remover placeholders `UNAVAILABLE` no Receipt Canon para approval/trust/delegation.
- Ampliar testes fail-closed para cadeias inconsistentes em fluxos críticos.

**DoD Governança**
- Aprovação auditável ponta a ponta (modelo, contrato e trilha de evidência).
- Receipt Canon v1 completo para fluxos críticos.
- Suite fail-closed sem gaps críticos.

### 9.2) Auditoria pública (fechamento F5.3)
- Completar cobertura E2E HIGH para todas as ações críticas definidas em policy.
- Garantir reconciliação contínua verificável (`run -> bundle -> receipt -> ledger/txId`).
- Tornar gate de cobertura HIGH bloqueante no CI de PR.

**DoD Auditoria**
- Cobertura HIGH completa por ação crítica.
- `auditGap=0` em evidências recorrentes.
- Regressão de auditoria bloqueada por CI.

### 9.3) Interoperabilidade (fechamento F5.4)
- Adotar Agent Protocol como contrato público canônico (A2A/B2B).
- Congelar baseline de contratos interop versionados.
- Bloquear breaking change sem major bump.
- Manter política explícita de evolução contratual (depreciação/sunset e compatibilidade).
- Garantir operação padrão do fluxo `discovery -> negotiate -> execute` entre agentes.

**DoD Interop**
- Matriz de compatibilidade 100% aprovada no CI.
- Sem breaking não-versionado.
- Baseline e política sincronizados com runtime.
- Contrato canônico e rotas públicas de interop validados por evidência recorrente.

### 9.4) Economy (fechamento F5.6)
- Evoluir providers `crypto`/`bank` de stub para modo operacional por ambiente (ou declarar suporte explícito por ambiente).
- Consolidar webhook billing com assinatura, replay protection e idempotência com evidência periódica.
- Fechar ciclo econômico completo: invoice mensal + settlement + disputa + reputação verificável.
- Tornar obrigatório o vínculo canônico `receipt -> ledger -> provider` para reconciliação externa em trilhas HIGH.

**DoD Economy**
- Settlement multi-provider em modo suportado por ambiente.
- `duplicateSideEffects=0` e métricas de replay estáveis.
- Evidência de ciclo econômico completo em produção controlada.
- Vínculo de cobrança e execução auditável (`run -> receipt -> ledger -> settlement`) consistente em evidência.

### 9.5) Rollout de produto (Track P)
- Aplicar checklist padrão por vertical com gates de não-regressão.
- Operar rollout controlado `shadow -> pilot -> small` com critérios explícitos de avanço.
- Fortalecer command centers por vertical com export de provas por run.
- Evoluir `IMOB Knowledge Search` em fases, partindo do handshake agent-driven já implementado no `EIAH`/`IMOB`, seguido de busca por metadados e sync pragmático do Drive antes de webhook/watch.
- Exigir gating fail-closed por `tenantId` cadastrado e assinatura ativa da vertical para qualquer busca/chat/ação do `IMOB`.
- Operar as verticais dentro do fluxo SaaS padrão: `Cadastro -> Tenant -> Assinatura/Plano -> Billing -> Entitlements -> Roles/Scope -> Workspace -> Chat Agent Launcher EIAH -> Vertical`.
- Formalizar nomenclatura pública de rollout para impedir drift entre agente, vertical, surface e runtime interno.
- Posicionamento oficial:
  - `EIAH` = assistente principal;
  - agentes canônicos do registry = especialistas;
  - `IMOB`, `LEGAL`, `MKT`, `Financeiro`, `URBAN` e `Logística` = frentes verticais;
  - `Runs`, `RunViewer`, `Billing`, `Economy`, `Marketplace` e `Self-service` = áreas operacionais.
- Manter explícita a sequência de expansão vertical após `LEGAL`: `MKT` -> `Financeiro` -> `URBAN` -> `Logística`.

**Fase 1 — Handshake e roteamento**
- Objetivo: fazer o `EIAH`, como front door do SaaS, reconhecer busca documental IMOB e encaminhar corretamente para a vertical, respeitando `tenant`, `workspace` e `entitlements`.
- Entradas sugeridas no launcher:
  - `Buscar no acervo IMOB`
  - `Buscar contratos e propostas`
  - `Buscar materiais de captação`
  - `Buscar por cidade ou região`
- Implementação:
  - `chatLauncherEngine.ts`: detectar a intenção documental e decidir o handoff
  - `imobContextResolver.ts`: qualificar recorte e preparar a entrada da vertical
  - `platformHelpResolver.ts`: só educar/induzir UX, sem virar dono da lógica
  - `chatOrchestrator.ts`: preparar `mode: "search_knowledge"`
- Também entra aqui:
  - validação de `tenantId`
  - validação de `workspaceId`
  - validação de assinatura/entitlement da vertical
  - bloqueio `fail-closed` quando a vertical não estiver habilitada
- DoD:
  - intenção não cai em help genérico
  - o `EIAH` encaminha corretamente para o contexto IMOB documental
  - tenant sem assinatura recebe bloqueio `fail-closed`
  - launcher continua sem regra nova relevante
  - o handoff respeita o fluxo SaaS `tenant -> entitlement -> workspace -> vertical`

**DoD Track P**
- KPI mínimo por vertical atingido.
- Sem regressão de isolamento multi-tenant/workspace.
- Evidência semanal de operação e rollout.
- Busca documental `IMOB` disponível in-chat sem reabrir lógica no launcher e com fonte do resultado explicitada no payload/renderização.

### 9.6) P0 transversal (obrigatório durante todas as frentes)
- Manter `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-05-23.md` e `docs/EVIDENCE_INDEX.md` sincronizados.
- Bloquear em CI referências inválidas e drift documental.
- Tratar qualquer divergência doc/contrato/runtime como incidente P0.

**DoD P0 transversal**
- Fonte única estável e auditável durante todo o ciclo de execução.

## 10) Implementado extra (além do escopo normativo v8)

Itens já implementados que não eram requisito explícito do backlog P0-P4, mas agregam produto, operação e experiência:

### 10.1) UX global compacta
- Modo compacto aplicado para reduzir escala visual (tipografia, paddings e densidade dos cards).
- Preservação de responsividade e fluxos existentes.

### 10.2) EIAH Access (produto)
- Consolidação dos modos `Entrar / Cadastrar / Wallet` no mesmo bloco de acesso.
- Ajustes de navegação de entrada para reduzir fricção de onboarding.

### 10.3) Chat Agent Launcher (UX operacional)
- Header e descrição dinâmicos por agente selecionado.
- Histórico preservado com ação explícita de `Nova conversa`.
- Remoção de metadados internos sensíveis do UI (tenant/workspace/user/ID técnico), mantendo rastreabilidade no backend.
- Estado de processamento no chat (`Pensando...`).

### 10.4) Fallback determinístico para intenção unknown
- Regra contextual para solicitações fora de escopo EIAH sem acionar provider em cenário `unknown`.
- Resposta curta e orientada a retorno para domínios válidos (Runs, Agentes, Billing, IMOB, proposta).

### 10.5) Proposal assistant no chat
- Coleta guiada de dados comerciais (usuários, runs/mês, vertical, prazo).
- Resposta estruturada com opções de plano (econômica, equilíbrio, escala).
- Reuso da fórmula real de billing com fallback local controlado.

### 10.6) Playbook expandido (guia de uso por página)
- Estruturação do playbook como guia operacional de páginas e comandos.
- Conteúdo em linguagem humana com contexto acionável dentro da própria experiência.

### 10.7) Central de Ajuda EIAH (base interna)
- Rotas de consulta e reindex de base (`/help/eiah/query`, `/help/eiah/reindex`).
- Persistência analítica de atendimento (`helpdesk_sessions`) para melhoria contínua.

### 10.8) IMOB ampliado (chat e operação)
- Entrevista de contrato no chat IMOB e persistência de contexto.
- Export e trilha auditável de conversa/operação.
- Telemetria operacional de chat para acompanhamento de adoção.

### 10.9) Implemented Extra (pronto para PR/changelog)
- **UX compacta global**: redução de escala visual (tipografia, paddings e densidade) sem quebrar responsividade.
- **EIAH Access unificado**: modos `Entrar/Cadastrar/Wallet` no mesmo bloco com fluxo de onboarding simplificado.
- **Chat Agent Launcher**: descrição dinâmica por agente, histórico preservado, ação `Nova conversa` e estado `Pensando...`.
- **Privacidade no UI**: remoção de metadados internos sensíveis da interface, mantendo rastreabilidade no backend.
- **Fallback determinístico (`unknown`)**: resposta contextual sem acionar provider fora de escopo.
- **Proposal assistant**: coleta guiada comercial e recomendação estruturada com fórmula de billing alinhada ao backend.
- **Playbook expandido**: guia por página/comando com linguagem humana e contexto acionável.
- **Central de Ajuda EIAH**: query/reindex da base interna e persistência analítica de sessões (`helpdesk_sessions`).
- **IMOB ampliado**: entrevista de contrato no chat, telemetria operacional e export auditável.
- **Gate P2 global HIGH**: cobertura E2E para ações HIGH do core (`billing/finance/notifications`) com gate bloqueante.
- **Hardening estrutural do chat agent-driven**: modularização do `chatLauncherEngine` por proposal, verticais, especialistas, help transversal e apresentação de agentes, mantendo o `ChatAgentLauncher` em modo `render-first`.
- **Gate de regressão do chat no CI**: suíte `test:chat-engine` promovida a check obrigatório no `CI Monorepo`.

**Observação de governança**
- Itens “implementado extra” não substituem DoD de P0-P4.
- Promoção para “operacionalmente fechado” continua condicionada às métricas e evidências normativas do v8.
## 11) Atualização operacional v8.1 — comparação roadmap vs código atual

Esta seção registra o alinhamento entre o roadmap v8, o estado do código e os checklists operacionais mais recentes. Ela existe para reduzir drift entre documentação macro, runtime e evidências.

### 11.1) Matriz curta — roadmap v8, status no código e evidência

| Item do roadmap v8 / frente relacionada | Status no código | Arquivo(s) que comprovam | Classificação |
| --- | --- | --- | --- |
| Canon de receipt / envelope operacional | Implementado | `apps/api/src/services/receiptCanonService.ts` | Planejado |
| Runtime de agentes e rotas centrais | Implementado | `apps/api/src/routes/agents.ts`; `apps/api/src/routes/runs.ts`; `apps/api/src/routes/shadow-executions.ts` | Planejado |
| IMOB knowledge/search e ação canônica | Implementado | `apps/api/src/services/imob/imobTurnResolver.ts` | Planejado |
| Catálogo canônico de actions IMOB | Implementado | `apps/api/src/services/imob/control/imobRunActionCatalog.ts` | Além do programado |
| KPI/semântica de owner e responsible actor em IMOB | Implementado | `apps/api/src/services/imob/crm/imobCrmKpiService.ts`; `apps/api/src/services/imob/crm/imobCrmMutationService.ts`; `apps/api/src/services/imob/crm/imobBrokerAssignmentResolver.ts` | Além do programado |
| Contrato mínimo multi-vertical | Implementado | `apps/api/src/types/verticalResponsibleActorContract.ts`; `apps/api/src/types/verticalEntitlementGateContract.ts` | Além do programado |
| Validação runtime de contrato do responsável | Implementado | `apps/api/src/services/imob/crm/imobCrmMutationService.ts`; `apps/api/src/routes/imobCrmRouter.ts`; `apps/api/src/services/imob/control/imobReasonCodeCatalog.ts` | Além do programado |
| RunArchive com persistência | Implementado | `apps/api/src/services/runArchiveService.ts`; `apps/api/src/workers/runArchiveWorker.ts`; `packages/db/prisma/schema.prisma` | Além do programado |
| Command Center e dashboard operacional IMOB | Implementado | `apps/web/src/features/imob/ImobCommandCenter.tsx`; `apps/web/src/features/imob/ImobDashboardHero.tsx`; `apps/web/src/pages/app/imob/dashboard.tsx` | Além do programado |
| Consolidação Funil + Equipe | Implementado | `apps/web/src/features/imob/funnel/ImobFunnelTeamSection.tsx`; `apps/web/src/pages/app/imob/dashboard.tsx` | Além do programado |
| Checklists operacionais por frente IMOB | Implementado | `docs/ops/imob-data-pr-execution-checklist.md`; `docs/ops/imob-run-archive-pr-execution-checklist.md`; `docs/ops/imob-funnel-pr-execution-checklist.md`; `docs/ops/imob-cost-pr-execution-checklist.md`; `docs/ops/imob-data-trilha-b-runtime-minimo-execution-checklist.md` | Além do programado |
| Hardening transversal de fila/eventos/db runtime | Implementado | `packages/core/src/events/redisPublisher.ts`; `packages/core/src/queue/runAtivoUniversalQueue.ts`; `packages/core/src/queue/runAtivoUniversalDLQ.ts`; `packages/db/src/client.ts` | Além do programado |

### 11.2) Merges/PRs que materializam avanço além do v8

| PR / frente | Status | Leitura de governança |
| --- | --- | --- |
| #141 — IMOB Trilha B Fase 4: contrato mínimo multi-vertical | Implementado | Primeira estrutura contratual multi-vertical acima do escopo original. |
| #142 — IMOB Data Backend: normalização, contracts e responsible owner | Implementado | Endurece semântica operacional de dados IMOB. |
| #143 — IMOB Run Archive: serviço, worker e persistência | Implementado | Cria base de persistência/arquivo além do backlog normativo mínimo. |
| #144 — IMOB Web: Command Center, dashboard e superfícies operacionais | Implementado | Expande Track P em produto operacional. |
| #145 — IMOB Funnel/Team consolidation | Implementado | Consolida equipe dentro do funil e reduz duplicação de UX. |
| #146 — IMOB Trilha B runtime mínimo | Implementado | `assignResponsibleActor()` passa a validar contrato canônico antes da persistência compat IMOB. |

### 11.3) Trilha B runtime mínimo — estado normativo

O PR `PR-IMOB-DATA-TRILHA-B-RUNTIME-01` está registrado como concluído no checklist operacional com:

- validação real do contrato em `assignResponsibleActor()`;
- uso de `scope.tenantId`/`scope.workspaceId` como fonte de verdade;
- reason code `RESPONSIBLE_ACTOR_CONTRACT_INVALID`;
- tratamento HTTP do erro;
- testes mínimos e evidência operacional;
- ausência de migration e ausência de alteração de schema.

Status normativo:
- **Implementado como ponte mínima runtime ↔ contrato multi-vertical.**
- **Não reabrir esta frente agora.**
- Só voltar se a decisão for:
  - adicionar gate real de entitlement/billing no runtime; ou
  - expandir o runtime canônico para outra vertical, como `LEGAL`.

### 11.4) O que permanece pendente

O único pendente explícito do plano de hardening v8.1 é a ratificação operacional dos SLO targets.

Ações remanescentes:
1. Rodar `generate:e2e-high-manifest`.
2. Rodar `generate:slo-baseline`.
3. Repetir por 3 ciclos.
4. Calcular target.
5. Marcar `ratified: true`.
6. Deixar o gate bloquear de fato.

Enquanto isso não ocorrer, não declarar o v8 como “operacionalmente fechado” em termos de SLO.

## 12) Diretriz de atualização documental após v8.1

### 12.1) Fonte de verdade

A partir desta revisão, o roadmap canônico deve ser:

`ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`

O `docs/EVIDENCE_INDEX.md` deve ser atualizado para referenciar este arquivo, preservando o arquivo de 2026-05-23 como histórico.

### 12.2) Política de status

- `Implementado`: apenas quando há arquivo/código/checklist/evidência existente.
- `Parcial`: quando o código avançou, mas falta gate recorrente, evidência operacional ou ratificação.
- `Proposta`: quando há plano, mas não há código ou evidência.
- `Além do programado`: implementado fora do backlog normativo original v8, sem substituir DoD P0–P4.

### 12.3) Próximo commit documental sugerido

```bash
git add ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md docs/EVIDENCE_INDEX.md
git commit -m "docs(roadmap): sync v8.1 with implemented IMOB and multivertical runtime"
```

Se a decisão for manter o mesmo nome canônico de 2026-05-23, o conteúdo desta revisão deve substituir o arquivo atual e o cabeçalho deve manter uma nota de revisão v8.1 em vez de criar novo arquivo.

## 13) Checklist de conformidade desta revisão

| Prioridade | Estado v8.1 | Observação |
| --- | --- | --- |
| P0 — Integridade documental | Parcial até atualizar `docs/EVIDENCE_INDEX.md` | O roadmap foi atualizado; o índice precisa apontar para o arquivo canônico vigente. |
| P1 — Governança/execução crítica | Avançado | Responsible actor IMOB e runtime mínimo Trilha B implementados; manter fail-closed. |
| P2 — Auditoria pública/interop | Avançado | Interop spec v1 e contratos avançados; manter baseline e CI. |
| P3 — Economy hardening | Parcial avançado | Settlement/EconomyReceipt avançaram; SLO ratification e provider mode seguem gates. |
| P4 — Track P | Avançado | IMOB acima do programado; novas verticais continuam exigindo template, gates e rollout `shadow -> pilot -> small`. |

## 14) Status final v8.1

- Roadmap v8: **majoritariamente implementado nas frentes centrais**.
- IMOB: **acima do programado originalmente**.
- Multi-vertical: **primeira ponte runtime real implementada**.
- Pendência crítica: **ratificação operacional de SLO targets**.
- Risco principal atual: **drift documental se `docs/EVIDENCE_INDEX.md` não for atualizado junto com este roadmap**.

**Status normativo desta revisão:** parcial avançado, não operacionalmente fechado.
