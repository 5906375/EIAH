# ROADMAP ATUALIZADO v8.2

Data de referência desta revisão: **2026-11-21**
Escopo: plataforma agentic governada (core + governança + interop + economy + Track P)

> Arquivo canônico vigente desta revisão: `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`.
>
> **Status da revisão v8.2: RASCUNHO, pendente de registro pelo administrador (ADR-008).** As seções 1.3, 10.10, 11.2 (acréscimo), 11.4 (acréscimo), 14.1, 15.1 e 16 foram adicionadas a partir da leitura de `git log` (títulos de commit e PRs) até o commit `d5ad280` de 2026-11-21. O código de cada PR não foi revisado; as colunas "a indicar" exigem confirmação humana. Nenhum item novo é declarado `DONE`.
>
> Revisão v8.1 (preservada): atualização documental para alinhar o roadmap v8 à realidade do repositório após os merges IMOB #141–#146, sem rebaixar os gates normativos de P0–P4.

## Cláusula anti-drift interna

Se o próprio arquivo canônico contiver, em qualquer seção, referência interna a roadmap, overview, relatório, prompt ou outra documentação anterior à Data de referência desta revisão como fonte de sincronização ativa, fonte canônica, baseline atual ou instrução normativa, sem revalidação explícita pelo roadmap canônico vigente, essa referência deve ser tratada como drift documental P0. Isso inclui, mas não se limita a, referências de `2026-05-23` ou `2026-03-10`.

Nesses casos:
- não seguir a instrução interna desatualizada;
- manter `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` como única fonte válida de roadmap;
- registrar a seção e a linha afetadas;
- propor correção documental em PR separado, quando aplicável;
- usar referências históricas somente como contexto explicitamente marcado como histórico, changelog ou legado.

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

## 1.2) Atualização executiva F0 release path e Conversação — 2026-07-13

Consolidação documental pós-F0.45:
- F0.34 registrou o primeiro run verde real do `ReleaseNode22Readiness` em `main`.
- F0.35 auditou `release.yml` produtivo e confirmou que readiness verde não autorizava migração direta.
- F0.36 formalizou a separação entre Camada A (validação/build) e Camada B (publish/secrets/GHCR/tags).
- F0.37 criou a ponte manual `ReleaseNode22ValidationBuildDryRun`.
- F0.38 registrou o primeiro run verde real dessa ponte manual.
- F0.39 documentou o risk model da Camada B.
- F0.40 criou o `ReleasePublishPreflight` sem side effects.
- F0.41 registrou o primeiro run verde real do preflight da Camada B.
- F0.42 definiu que o próximo gate mínimo deveria exigir ativação/rollback controlados, ainda sem publish real.
- F0.43 criou o `ReleaseActivationRollbackGate` sem side effects.
- F0.44 registrou o primeiro run verde real do gate reforçado de ativação/rollback.
- F0.45 materializou no repositório o plano consolidado `plano_unificacao_EIAH_interativo_atualizado_pos_F0_44_conversacao.html`, preservando a seção `conversacao` como `especificada/parcial` e mantendo a disciplina `agent-driven`.

Leitura normativa correta após F0.45:
- `release.yml` produtivo permanece intocado;
- publish real, `secrets` produtivos, login em registry, push para GHCR/Docker e tags/releases continuam bloqueados;
- a cadeia F0.34–F0.44 comprova readiness, dry-run, preflight e gate reforçado, mas não fecha a Camada B produtiva;
- a camada Conversação está consolidada documentalmente no plano interativo, porém continua `especificada/parcial`, não `DONE`;
- F0/P0 transversal permanecem parciais e não devem ser declarados fechados sem decisão/evidência adicionais.

## 1.3) Atualização executiva v8.2 — 2026-11-21 (rascunho)

Esta revisão não reabre o roadmap v8; ela sincroniza o documento com o que o repositório contém em 2026-11-21 (`main`, commit `d5ad280`).

Leitura consolidada:
- Desde 2026-07-01 foram mergeados **296 PRs** (entre os commits sem merge: 121 `feat`, 101 `fix`, 195 `docs`, 38 `test`, 31 `ci`, 6 `evidence`).
- O **Front Door único** (`/app/chat`) passou a ser a superfície operacional da plataforma, sob a ADR-010.
- A **liberação de verticais** por tenant, workspace e vertical (ADR-011) foi implementada em PRs sequenciais (#481 a #486), com pedido e decisão pela conversa, acesso por link de uso único e billing antes da liberação. O status real da implementação deve ser confirmado (a ADR estava "implementação pendente" em 2026-10-02).
- A **autorização** ganhou vínculo ativo e autoridade efetiva; o **billing** passou a exigir designação de autoridade financeira nas escritas de cota e ajuste.
- A vertical **Logística** avançou com o Oráculo (preparação, decisão humana J17, contratos governados de consulta a fontes), sem alterar o status `PRE_DUIMP`/shadow do §15 nem a ordem oficial de rollout.
- O **IMOB** continua acima do programado: destinação de ativo, intake agêntico de unidades, arquivamento governado em lote, rascunho guiado e cartões de especialistas, além das demos no site.
- **MKT** segue como futura frente vertical (ordem `LEGAL -> MKT -> Financeiro -> URBAN -> Logística` inalterada); existe a ponte de leitura **P11 IMOB-MKT** (Front Door lê o caso e as necessidades transversais, sem escrita).
- As edições posteriores a julho já presentes neste arquivo (gate PRE_DUIMP, rebaixamento do P1 de fechado para parcial, plano multicanal, checklist IMOB) foram **preservadas**.

Reavaliações de estado **a confirmar com evidência** (a tabela do §2 não foi alterada):
- **5.2 (policies e human approvals):** há avanço de autorização e de designação de autoridade; avaliar se muda de "Parcial avançada".
- **Track P:** novas superfícies do Front Door e do site IMOB; avaliar se muda de "Parcial avançada+".

Regra de decisão v8.2:
- Não reabrir frentes fechadas sem decisão explícita; manter fora de escopo o que as ADR-010 e ADR-011 já declararam fora (billing/custo, IMOB Cost, ruleset, Evidence Index).
- O Evidence Index só aponta para arquivos existentes e evidências geradas por execução real.

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
- Preservar como arquivo único de roadmap canônico vigente o arquivo `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`, garantindo que referências a roadmaps anteriores sejam tratadas como históricas ou como drift documental P0 quando usadas como fonte ativa.
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
- ⚙️ Parcial avançado — gates estruturais evidenciados (`check:p1-critical-chain` lendo
  `contracts/risk-tier-policy.v1.json` desde #418; `check:reason-code-canon` bloqueante em
  CI desde #418). Fechamento operacional BLOQUEADO por APE telemetry integrity: ciclos
  #45/#46/#48 com `auditGap`/`duplicateSideEffects` hardcoded
  (`docs/ops/evidence/ape-cycles-45-48-audit-2026-07-27.md`), não utilizáveis como prova
  de recorrência. Consistente com §13 e §14 desta mesma revisão.

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

**Princípio transversal de entrada semântica — todas as verticais atuais e futuras**

O usuário se expressa naturalmente; a EIAH interpreta semanticamente. Toda superfície destinada a receber significado humano deve aceitar linguagem natural, independentemente da vertical, agente, campo ou formato de interface. É proibido exigir sintaxe interna, palavras-chave obrigatórias, ordem de tokens, gramática de parser, nomes de actions, contratos técnicos ou nomes internos de campos para compreender uma entrada semântica.

A interpretação de significado pertence ao intake contextual/runtime agêntico do agente ou vertical, utilizando provider/model conforme policy, disponibilidade, contexto, entitlement, escopo e governança vigente. O engine coordena esse fluxo e executa o resultado estruturado; o launcher/formulário coleta e renderiza. Parsers, regex, schemas e validadores determinísticos atuam posteriormente para normalização, validação e enforcement de invariantes, sem substituir a interpretação semântica.

As entradas devem ser classificadas como **semânticas**, **canônicas** ou **híbridas**. Dados cuja exatidão material dependa de um valor canônico não podem ser inventados pela IA: podem ser extraídos de informação fornecida, formatados, normalizados, validados ou submetidos a confirmação, preservando sua verificabilidade. Entradas híbridas passam por estruturação agêntica e posterior validação determinística.

Ambiguidade material ou confiança insuficiente antes de mutação exige clarificação ou confirmação humana no próprio Front Door. É proibido fallback silencioso que converta interpretação incerta em persistência ou operação diferente. Indisponibilidade do provider/model não autoriza contornar essas exigências nem os gates de execução.

**IA interpreta significado e contexto. Código determinístico garante exatidão e invariantes. Humano confirma quando houver incerteza material antes de efeito.**

Especificação canônica: [Entrada agêntica, linguagem natural e validação determinística](docs/architecture/agent-chat-runtime.md#entrada-agêntica-linguagem-natural-e-validação-determinística). Este registro é normativo; não declara conformidade dos runtimes existentes, capacidade evidenciada, ativação de vertical nem mudança de status de fase.

**DoD P4**
- KPI mínimo por vertical atingido.
- Sem regressão de isolamento multi-tenant/workspace.
- Evidências semanais de operação e rollout.
- `IMOB Knowledge Search` roteado pelo `engine`, sem lógica nova no `ChatAgentLauncher`.
- Busca documental da vertical operando com gating por assinatura e retorno auditável por fonte (`drive`, `upload`, `web`, `internal_doc`).
- Taxonomia pública oficial documentada e aplicada sem ambiguidade entre `EIAH`, especialistas, verticais e áreas operacionais.
- Ordem das próximas frentes verticais registrada explicitamente no roadmap e nas superfícies de produto: `LEGAL` -> `MKT` -> `Financeiro` -> `URBAN` -> `Logística`.
- Componentes internos de vertical permanecem fora da nomenclatura pública principal.
- Cada vertical nova demonstra `linguagem natural -> estrutura de domínio -> validação determinística -> clarificação/HITL quando necessário`, antes da execução governada, conforme a especificação transversal de entrada.
- Testes demonstram que variações semanticamente equivalentes produzem estrutura de domínio equivalente quando não houver ambiguidade material; valores canônicos preservam exatidão e normalização; ambiguidade material antes de mutação produz clarificação/confirmação e zero side effects da operação solicitada.

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
- Aplicar os requisitos transversais de entrada semântica e seus testes definidos no **DoD P4** (§4), inclusive para novas verticais, sem exigir gramática interna do usuário.

### 9.6) P0 transversal (obrigatório durante todas as frentes)
- Manter `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md` e `docs/EVIDENCE_INDEX.md` sincronizados.
- Bloquear em CI referências inválidas e drift documental.
- Tratar qualquer divergência doc/contrato/runtime como incidente P0.
- Manter a cadeia documental F0.34–F0.45 sincronizada entre roadmap, plano consolidado e Evidence Index, sem promover `release.yml` produtivo, Camada B real ou Conversação para status acima do que estiver evidenciado.

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

### 10.10) Implementado extra desde o v8.1 (v8.2, rascunho)

Classificação: **Além do programado**. Convenção da coluna Evidência: "existe" = arquivo confirmado no repositório; "a indicar" = caminho não confirmado nesta leitura. Os números de PR agrupam intervalos e devem ser confirmados um a um.

| # | Tema | Referência (PR/commit) | Evidência | Estado proposto |
| --- | --- | --- | --- | --- |
| 1 | **Front Door único** (ADR-010): superfície operacional única EIAH-FD-001 no Chat Agent Launcher; base de especialistas; descoberta de capacidades | `c052960e` (2026-10-24) e anteriores de 2026-10-22; PRs #504, #505 | `apps/api/src/services/chat/verticalRegistryComposition.ts` (existe); demais a indicar | Implementado (código); evidência a indexar |
| 2 | **Front Door — UX e ciclo de vida**: intake contextual, ciclo de vida do run, avaliação IMOB, histórico e sequência da conversa, layout responsivo | PRs #516 a #535 | a indicar | Implementado (código); evidência a indexar |
| 3 | **Liberação de verticais** (ADR-011): pedido e decisão pela conversa, link de uso único, billing antes da liberação, fila de liberações | PRs #481 a #486 (2026-10-02 e 2026-10-03) | a indicar | Implementado (código); **confirmar status real** |
| 4 | **Autorização**: vínculo ativo e histórico por titularidade, autoridade efetiva, sombra G2 de bootstrap e troca de workspace, capacidade da Logística por membro | `ca91c060`, `a0088070`, `53e90436`, `359714ab`, `1d5f7b45` (2026-10-22 a 2026-10-26) | a indicar | Implementado (código); evidência a indexar |
| 5 | **Billing**: designação de autoridade financeira nas escritas de cota e ajuste | `3377afc5` (2026-10-24) | a indicar | Implementado (código); não altera preços nem o IMOB Cost |
| 6 | **GuardrailLedger** referenciado no fluxo (`enforceTenant`, `runs`, `billing`, `governance`, `delegations`, `onboarding`, `help`, `checkDelegationPolicy`) | referências no código | `packages/core/src/audit/guardrailLedger.ts` (existe) | Parcial: ligação confirmada por referência; semântica e cobertura não verificadas |
| 7 | **IMOB — destinação de ativo**, lotes e negócios | PR #514 (2026-11-07) | `packages/contracts/src/imobAssetDestination.ts` (existe) | Implementado (código); evidência a indexar |
| 8 | **IMOB — intake agêntico de unidades**, guarda de unidade e CEP opcional, rascunho guiado | PRs #515, #536, #537 (2026-11-09 a 2026-11-16) | a indicar | Implementado (código); evidência a indexar |
| 9 | **IMOB — arquivamento governado em lote** e leitura de arquivados | PRs #531, #532 (2026-11-11) | a indicar | Implementado (código); evidência a indexar |
| 10 | **Site IMOB**: catálogo de demos, onboarding do site, cartões dos especialistas, Radar Social, gravação do rodapé | PRs #542 a #545 (2026-11-20 e 2026-11-21) | `docs/ops/evidence/latest/imob-demo-footer-save-2026-11-21.md` e `docs/ops/evidence/latest/imob-specialists-cards-demo-2026-11-21.md` (existem) | Implementado, com evidência indexada |
| 11 | **P11 IMOB-MKT**: leitura transversal pelo Front Door, sem escrita | `c052960e` (2026-10-24); PR #512 (evidência sanitizada) | a indicar | Parcial: só leitura; MKT continua sem vertical |
| 12 | **MCP — governança endurecida** (negar execução quando contrato ou guarda de DB falha; saída simulada tipada) | 11 commits no escopo `mcp` (2026-07-22 a 2026-07-28) | a indicar | Implementado (código); evidência a indexar |
| 13 | **Provider**: propagação de falha do LLM | PR #538 | a indicar | Implementado (código) |
| 14 | **P0 de operação**: observabilidade de staging, decisão Redis/IMOB, vista pública de agentes, encerramento gracioso da API | PRs #501, #502, #503, #509 | a indicar | Parcial: evidenciar |

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
| Checklists operacionais por frente IMOB | Parcial | `docs/ops/imob-data-pr-execution-checklist.md`; `docs/ops/imob-run-archive-pr-execution-checklist.md`; `docs/ops/imob-funnel-team-pr-execution-checklist.md`; `docs/ops/imob-data-trilha-b-runtime-minimo-execution-checklist.md`. Lacuna: o checklist IMOB Cost está ausente e essa frente permanece bloqueada até sua criação e ratificação. | Além do programado |
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

Acréscimo v8.2 (rascunho): os avanços posteriores a #146 estão na tabela do §10.10 (PRs #481 a #486, #501 a #505, #509, #510, #512, #514 a #545 e commits de autorização, billing, Oráculo e MCP), com a mesma leitura de governança: implementados além do backlog normativo, sem substituir DoD P0–P4.

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

Acréscimo v8.2 (rascunho) — pendências adicionais a tratar:
- Confirmar o status de implementação da **ADR-011** e registrar a evidência.
- Indexar no Evidence Index as evidências dos itens 1 a 5, 7 a 9 e 12 a 14 do §10.10.
- Revisar a data de referência do cabeçalho a cada ciclo documental (a de 2026-07-01 contradizia as edições posteriores).
- Reconfirmar se a pendência de SLO acima e a ausência do checklist **IMOB Cost** (frente bloqueada até sua criação e ratificação) continuam verdadeiras; não foram reconfirmadas nesta revisão.
- Reconciliar materiais de comunicação (por exemplo, o Kit Evento de 2026-06-28) com o estado atual: os números nele citados são anteriores a esta revisão.

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

Não adotar novamente nome canônico anterior. O conteúdo normativo vigente deve permanecer em `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`; roadmaps anteriores podem ser preservados somente como histórico explicitamente identificado.

## 13) Checklist de conformidade desta revisão

| Prioridade | Estado v8.1 | Observação |
| --- | --- | --- |
| P0 — Integridade documental | Parcial/evidenciado quanto à sincronização roadmap ↔ Evidence Index | O roadmap e o índice apontam para o arquivo canônico vigente; permanece sujeito a regressão documental contínua e a gates de CI. |
| P1 — Governança/execução crítica | Avançado | Responsible actor IMOB e runtime mínimo Trilha B implementados; manter fail-closed. |
| P2 — Auditoria pública/interop | Avançado | Interop spec v1 e contratos avançados; manter baseline e CI. |
| P3 — Economy hardening | Parcial avançado | Settlement/EconomyReceipt avançaram; SLO ratification e provider mode seguem gates. |
| P4 — Track P | Avançado | IMOB acima do programado; novas verticais continuam exigindo template, gates e rollout `shadow -> pilot -> small`. |

## 14) Status final v8.1

- Roadmap v8: **majoritariamente implementado nas frentes centrais**.
- IMOB: **acima do programado originalmente**.
- Multi-vertical: **primeira ponte runtime real implementada**.
- Pendência crítica: **ratificação operacional de SLO targets**.
- Risco residual: **regressão documental futura se novos roadmaps, evidências ou referências forem adicionados sem passar pelos gates de integridade documental**.

**Status normativo desta revisão:** parcial avançado, não operacionalmente fechado.

### 14.1) Status v8.2 (rascunho)

- Front Door: **superfície única implementada** (código), evidência a indexar.
- Liberação de verticais (ADR-011): **implementada em código**, status a confirmar.
- Logística: **Oráculo e decisão humana J17 implementados** (código); `PRE_DUIMP` segue em shadow e a ordem oficial de rollout não muda.
- MKT: **continua sem vertical**; a ponte P11 é somente leitura.
- Risco residual: regressão documental se as evidências não forem indexadas.

**Status normativo da revisão v8.2:** rascunho pendente de registro; parcial avançado, não operacionalmente fechado.

## 15) PRE_DUIMP — Gate de preparação técnica (vertical Logística)

**Status inicial: `PROPOSTA`.**

Este registro formaliza `PRE_DUIMP` como gate de preparação técnica interno à vertical pública `Logística`. `Logística` permanece a vertical pública, na posição já definida na sequência de expansão vertical (`LEGAL -> MKT -> Financeiro -> URBAN -> Logística`, §4 P4 e §9.5). `Comex/DUIMP` é um recorte operacional interno da vertical `Logística`, não uma vertical pública adicional, e não altera essa ordem oficial de rollout.

`PRE_DUIMP` não significa ativação, pilot, small rollout ou produção.

### Objetivo

Preparar os contratos e guardrails necessários para uma futura capacidade DUIMP, sem transmissão real ao Portal Único/Siscomex.

### Dentro do escopo

- modelo mínimo de contexto aduaneiro;
- isolamento `tenantId + workspaceId`;
- entitlement específico da vertical;
- catálogo canônico de Actions;
- RBAC e policy;
- HITL obrigatório para ações com efeito externo;
- idempotência e replay;
- reason codes;
- auditoria e evidência;
- fixtures exclusivamente sintéticas;
- contratos negativos fail-closed;
- operação inicial em modo observacional/shadow.

### Fora do escopo

- credenciais reais;
- dados aduaneiros pessoais ou produtivos;
- transmissão, retificação, registro ou cancelamento real de DUIMP;
- integração produtiva com Siscomex/Portal Único;
- ativação de tenant real;
- promessa pública de disponibilidade;
- mudança na ordem oficial de rollout das verticais.

### Critérios para sair de PRE_DUIMP

Critérios verificáveis, ainda não satisfeitos nesta revisão:

1. contrato de domínio e autoridade persistida;
2. catálogo de Actions e reason codes;
3. matriz RBAC/entitlement;
4. política HITL — `PARCIAL` — política fail-closed implementada;
   aprovação positiva, vínculo ao recurso, produtor e persistência
   pendentes:

   A. Política HITL negativa/fail-closed:
      - implementada no cut 3;
      - `log.duimp_context.review` exige aprovação;
      - ausência ou aprovação inválida resulta em `PRE_DUIMP_HITL_REQUIRED`;
      - binding atual cobre approvalId, tenant, workspace e action;
      - referência: commit `8fcae0e07eee7f0d2d8b2bcee14aed57a6e38b21`.

   B. Caminho positivo/persistido:
      - ainda não implementado;
      - ausência de produtor, rota e ator de aprovação;
      - contrato atual ainda não vincula aprovação a resourceId/recordId/Run;
      - persistência adiada ao corte de integração;
      - nenhuma tabela nova enquanto o destino do `ApprovalRecord` genérico não for decidido;
      - referência ao adapter fail-closed: commit `c219542985fb6b419958635c873a162af2731354`.

   Esta pendência não bloqueia o desenvolvimento independente do
   critério 5 (replay/idempotência).
5. replay/idempotência;
6. isolamento multi-tenant;
7. testes negativos;
8. plano de evidência;
9. definição explícita do que permanece shadow;
10. aprovação humana antes de qualquer integração externa.

### Relação com CORE-01A0b / CORE-01A0

Nenhum DoD versionado explícito foi localizado para `CORE-01A0b` ou `CORE-01A0` nas fontes normativas vigentes na data desta revisão. `CORE-01A0b-R` está evidenciado (`ops/evidence/latest/core-01a0b-r-run-governance-validation-2026-08-26.md`), mas essa evidência não promove `CORE-01A0b` nem `CORE-01A0` a fechados — ambos permanecem `parcial` por ausência de DoD adicional localizado. A abertura documental de `PRE_DUIMP` nesta seção não depende do fechamento de `CORE-01A0b`/`CORE-01A0` e não os declara fechados.

## 15.1) Logística — Oráculo e decisão humana J17 (v8.2, rascunho)

Complementa o §15 (`PRE_DUIMP`), sem alterar a ordem oficial de rollout (`LEGAL -> MKT -> Financeiro -> URBAN -> Logística`) nem os critérios do §15, que continuam não satisfeitos. `Comex/DUIMP` segue como recorte interno da Logística, não como vertical pública adicional.

| Frente | Referência | Estado proposto |
| --- | --- | --- |
| Reconhecimento do produto LOGISTICA, provisionamento fail-closed e contratos de preparação do Oráculo | `958f11a0` (2026-10-19) | Implementado (código); evidência a indexar |
| API de acesso governado, canais de ativação, preparação do Oráculo e proteção de upload | `3e0c6274` (2026-10-19) | Implementado (código); evidência a indexar |
| Front Door conectado ao cockpit do Oráculo, com continuidade explícita de caso | `4739b24b` (2026-10-19) | Implementado (código); evidência a indexar |
| Decisão humana J17 no caso da Logística: contratos, serviço, repositório e API | `49634d3f` (2026-10-22) | Implementado (código); evidência a indexar |
| Contratos governados de consulta a fontes | `a40f951e` (2026-11-04); PR #510 | Implementado (código); evidência a indexar |
| Suítes de contrato, mock e integração registradas em CI | `f200ee96`, `57b226dd`, `e08c54d2` | Evidência de CI a indexar |

Estado público: a promoção de `PRE_DUIMP` além de shadow continua dependendo dos critérios do §15 e de decisão própria. Nenhum item acima autoriza transmissão externa.

## 16) Índice das ADRs vigentes (v8.2, rascunho)

Até a v8.1 este roadmap não citava ADRs. O índice abaixo usa o nome dos arquivos em `docs/adr/`; **datas de decisão só onde o próprio arquivo as declara**.

| ADR | Assunto (pelo nome do arquivo) | Data de decisão |
| --- | --- | --- |
| 001 | Stack de domínio e runtime | ver arquivo |
| 002 | Banco de dados Postgres autogerenciado | ver arquivo |
| 003 | Hierarquia do work registry | ver arquivo |
| 004 | Semântica de bloqueio de required checks | ver arquivo |
| 005 | Tratamento declarativo de evidência P2 (interop) | ver arquivo |
| 006 | Detecção de circularidade estrutural | ver arquivo |
| 007 | Realocação temporária de gate P1/P2 | ver arquivo |
| 008 | Modelo de revisão por administrador único | ver arquivo |
| 009 | Reconciliação de pendências das ADR-001 a 008 | ver arquivo |
| 010 | Unificação do chat Front Door e das verticais | 2026-09-30 (declarada no arquivo) |
| 011 | Liberação de verticais e acesso por convite | 2026-10-02 (declarada no arquivo) |
