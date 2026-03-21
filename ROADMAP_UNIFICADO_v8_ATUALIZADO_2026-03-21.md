# ROADMAP ATUALIZADO v8

Data de referência: **2026-03-10**
Escopo: plataforma agentic governada (core + governança + interop + economy + Track P)

## 1) Resumo executivo

O core da plataforma está operacional e auditável (F0-F3 concluídas), com F4/F5 já em produção parcial e foco de v8 em **hardening verificável**, **fechamento de lacunas de governança/economy** e **redução de drift documental**.

## 2) Estado consolidado por fase

| Fase | Status | Situação v8 |
| --- | --- | --- |
| 0 — Infraestrutura comum | ✅ Concluída | Manter estabilidade e SLOs |
| 1 — Fundação operacional | ✅ Concluída | Manter |
| 2 — Cognição inicial | ✅ Concluída | Manter |
| 3 — Governança cognitiva | ✅ Concluída | Evolução incremental |
| 4 — Execução crítica imutável | ⚙️ Parcial avançada | Hardening operacional e validação externa contínua |
| 5.0 — Marketplace/governança avançada | ✅ Concluída (core) | Fechar UX/auditoria avançada de delegação |
| 5.1 — PoU + Trust Gate | ✅ Concluída (operacional) | Receipt Canon v1 obrigatório nos fluxos críticos com gate ativo em CI |
| 5.2 — Policies autoaplicáveis + human approvals | ✅ Concluída (operacional) | Aprovação humana consistente (API/schema/evidência) validada por cadeia crítica fail-closed |
| 5.3 — Auditoria pública DLT | ⚙️ Parcial avançada | Cobertura E2E HIGH global fortalecida (core + interop); manter reconciliação contínua recorrente (`auditGap=0`) |
| 5.4 — Interoperabilidade | ⚙️ Parcial avançada | Matriz de compatibilidade CI e freeze de contrato |
| 5.5 — Outcome/experimentos | ⚙️ Parcial avançada | Recomendação AXO e automações de promoção |
| 5.6 — Economy | ⚙️ Parcial avançada | Settlement completo (reduzir stubs) + reputação verificável |
| Track P — Produto operacional | ⚙️ Parcial avançada | Escala de verticais, operações e qualidade de rollout |

## 3) Objetivos do v8

1. Transformar “parcial avançado” em “operacionalmente fechado” com critérios de evidência.
2. Eliminar drift entre docs, contratos e runtime.
3. Fechar cadeia econômica fim a fim com settlement confiável por provider.
4. Sustentar rollout de verticais com gates de não-regressão.

## 4) Backlog priorizado v8 (execução)

## P0 — Integridade documental e fonte da verdade
- Definir e publicar arquivo único de roadmap canônico (`ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-21.md`).
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
- Adicionar `IMOB Knowledge Search` como capacidade documental in-chat da vertical, com `EIAH` atuando como front door e `IMOB` como dono do fluxo de busca.
- Garantir gate fail-closed por `tenantId`/`workspaceId` e assinatura ativa da vertical antes de expor busca, chat ou ações do `IMOB`.
- Evoluir a busca por fases: handshake no chat -> busca por metadados -> sync de Drive -> expansão para uploads/web, preservando `sourceType` e isolamento multi-tenant/workspace.

**DoD P4**
- KPI mínimo por vertical atingido.
- Sem regressão de isolamento multi-tenant/workspace.
- Evidências semanais de operação e rollout.
- `IMOB Knowledge Search` roteado pelo `engine`, sem lógica nova no `ChatAgentLauncher`.
- Busca documental da vertical operando com gating por assinatura e retorno auditável por fonte (`drive`, `upload`, `web`, `internal_doc`).

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
- Implementar `IMOB Knowledge Search` em fases, começando por handshake agent-driven no `EIAH`/`IMOB`, busca por metadados e sync pragmático do Drive antes de webhook/watch.
- Exigir gating fail-closed por `tenantId` cadastrado e assinatura ativa da vertical para qualquer busca/chat/ação do `IMOB`.

**DoD Track P**
- KPI mínimo por vertical atingido.
- Sem regressão de isolamento multi-tenant/workspace.
- Evidência semanal de operação e rollout.
- Busca documental `IMOB` disponível in-chat sem reabrir lógica no launcher e com fonte do resultado explicitada no payload/renderização.

### 9.6) P0 transversal (obrigatório durante todas as frentes)
- Manter `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-03-21.md` e `docs/EVIDENCE_INDEX.md` sincronizados.
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
