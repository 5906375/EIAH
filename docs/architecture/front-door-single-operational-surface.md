# EIAH-FD-001 — Front Door como superfície operacional única

Status: **regra vinculante registrada** (decisão do proprietário, Carlos Alberto Merlo, instrução EIAH-FD-001 de 21/10/2026; registro
textual, sem assinatura digital — mesma convenção do ADR-010). Emenda ao [ADR-010](../adr/ADR-010-unificacao-chat-front-door-verticais.md).
Esta decisão **não** migra nenhuma vertical, não remove serviço, componente ou dado e não altera billing, ruleset ou Evidence Index.

## 1. A regra

> O Front Door é a interface operacional única dos produtos EIAH. A administração técnica mantém a plataforma funcionando. Nenhuma
> vertical poderá exigir ou oferecer um cockpit operacional paralelo.

Vale para IMOB, Logística & Comex, Legal/J360, Radar e qualquer vertical futura. **Toda operação de negócio acontece dentro da superfície
conversacional do Chat Agent Launcher existente.** Estar na rota `/app/chat` não basta: os componentes operacionais pertencem à **árvore de
apresentação conversacional do launcher** (mensagens e cartões renderizados a partir de `MessagePresentationSnapshot`; o engine decide, o
launcher só renderiza — `AGENTS.md`). "Uma entrada. Uma conversa. Toda a jornada."

## 2. Separação de responsabilidades

| Camada | Responsabilidades |
| --- | --- |
| **Front Door** | entrada e triagem; contexto das verticais; operações e formulários; documentos e evidências; solicitações de autorização; revisão e decisão humana; continuidade e resultados |
| **Core** | identidade e autorização; políticas e limites; coordenação e execução; integridade e evidências; persistência e auditoria |
| **Administração técnica** | infraestrutura; deploy; monitoramento; diagnósticos técnicos; manutenção de serviços |

Aprovação operacional, gestão de casos e acompanhamento de processos **não** são administração técnica e pertencem ao Front Door.

## 3. Proibição de interfaces operacionais paralelas (regra reforçada — 21/10/2026)

É **expressamente proibido** criar, manter ou disponibilizar páginas, cockpits, dashboards, formulários ou interfaces operacionais
independentes para verticais, produtos ou funcionalidades de produtos EIAH **fora da superfície conversacional do Chat Agent Launcher do Front
Door**. Abrange IMOB e todos os seus produtos; Logística & Comex (Oráculo e Pré-DUIMP); Legal/J360; Radar e suas especializações; e todas as
verticais, produtos e agentes futuros. Também fica proibido: launchers especializados, chats independentes por vertical, páginas de vertical
com chat secundário e navegações obrigatórias fora do Front Door.

**Obrigações**
1. Toda jornada operacional acontece integralmente na conversa do Front Door.
2. Formulários, documentos, consultas, acompanhamento, aprovações humanas, evidências e resultados são apresentados na superfície conversacional.
3. Menus de verticais e produtos direcionam **exclusivamente** ao Front Door, selecionando o contexto correspondente.
4. URLs operacionais legadas **redirecionam** ao Front Door, preservando só referências de continuidade válidas (o servidor valida) — nunca
   permissões, nunca parâmetros arbitrários.
5. É proibido manter páginas operacionais alternativas, **mesmo denominadas opcionais, administrativas ou legadas**, e mesmo condicionadas a
   chave de ambiente: nenhuma URL pode acessar interface operacional independente.
6. Serviços, APIs, contratos, políticas e mecanismos internos especializados podem continuar separados; suas interfaces operacionais, não.
7. Telas de administração estritamente técnica da infraestrutura não são páginas de produtos e seguem a separação formal do §2.

**Critério de conformidade.** Conforme somente quando: todas as entradas operacionais conduzem ao launcher; todos os componentes operacionais
são renderizados dentro da superfície conversacional; nenhuma URL permite acessar interface operacional independente; e os testes arquiteturais
e E2E confirmam isso. **A existência de uma página operacional paralela impede a classificação de conformidade, ainda que todas as funcionalidades
também estejam disponíveis no Front Door.** A única exceção à remoção imediata é a regra de compatibilidade abaixo.

**Compatibilidade.** Não se excluem serviços, componentes ou dados antes de comprovar equivalência funcional; uma página só é removida/
redirecionada quando a função equivalente existe na conversa (E2E). A existência transitória de uma página legada **não é conformidade**: é
dívida registrada que bloqueia a declaração de conformidade (o gate imprime `conformant:false` e a lista de bloqueios).

## 4. Critérios de conformidade (verificados por `check:front-door-single-surface`)

| # | Critério | Verificação |
| --- | --- | --- |
| C1 | Um único launcher: nenhum arquivo/componente `*Chat…Launcher*` além de `ChatAgentLauncher` | `alternative_launcher_file`, `alternative_launcher_declared` |
| C2 | Só os consumidores registrados importam o launcher; nenhuma página de vertical embute chat secundário | `secondary_launcher_consumer` |
| C3 | Componentes operacionais de vertical (`features/<vertical>/**.tsx`) pertencem à árvore de importação do launcher | `operational_component_outside_launcher` |
| C4 | A página do Front Door não compõe painel de vertical fora do launcher | `front_door_page_composes_vertical_panel` |
| C5 | Nenhuma rota nova fora do registro; novas só `front_door`/`identity`/`technical_admin`; rota legada redirecionada é **só** o elemento de redirecionamento (sem casca, guarda, página ou filhos) | `route_not_registered`, `new_operational_route_forbidden`, `legacy_redirect_not_wired`, `legacy_route_renders_page` |
| C6 | Dentro da conversa não há link/literal para rota operacional legada | `conversation_links_to_legacy_route` |
| C7 | O legado só sai do registro com equivalência comprovada (entrada obsoleta é reportada) | `staleEntries` |
| C8 | Contratos IMOB preservados | `check:imob-frontdoor-regression`, `check:arch-chat-contracts`, `check:chat-launcher-render-only` |
| C9 | Critério **não** baseado só em URL: grafo de importação + consumidores + componentes + rotas | desenho do gate |
| C10 | Declaração objetiva: `conformant:true` só sem rota operacional paralela, sem rota sem classificação, sem componente fora da conversa e sem link da conversa ao legado | saída do gate (`conformanceBlockers`) |

Mecanismo: `scripts/checkFrontDoorSingleSurface.ts` (encadeado em `pnpm check:arch-chat-contracts`), registro versionado
[`scripts/front-door-surface-register.json`](../../scripts/front-door-surface-register.json) e testes `scripts/tests/checkFrontDoorSingleSurface.test.ts`.
Observação de versionamento: `docs/architecture/*` é ignorado pelo `.gitignore` (adicionar com `git add -f`); por isso o registro fica em `scripts/`.
O registro é uma **catraca**: o legado conhecido fica registrado; qualquer violação nova falha; a conformidade só é declarável com `conformant:true`.

## 5. Superfícies legadas ainda NÃO conformes (planos de integração)

Nenhuma é conformidade por existir. Cada uma só é redirecionada/removida depois da equivalência funcional comprovada por E2E (nada se perde),
mas **enquanto existir, impede declarar a conformidade** do EIAH-FD-001.

| Superfície | Natureza | Situação | Plano |
| --- | --- | --- | --- |
| `/app/imob/chat` | **chat independente de vertical** | **NÃO CONFORME — impede a classificação de conformidade** (as funções ainda não estão todas na conversa) | IMOB-FD-INTEG: migrar as capacidades, comprovar paridade por E2E e redirecionar; sem prazo definido nesta decisão |
| `/app/imob/dashboard`, `/properties`, `/processes`, `/partners` | cockpit/cadastros operacionais IMOB | **NÃO CONFORME — impede a classificação de conformidade** | IMOB-FD-INTEG (D1–D4 do ADR-010) |
| `features/imob/**` (22 componentes) e `features/workbench/**` (6) fora da árvore do launcher | componentes operacionais | legado registrado | sobem para a árvore do launcher junto de cada capacidade |
| Literais `/app/imob/chat` e `/dashboard` em resolvers/ajuda dentro da conversa (7 pares arquivo/rota) | navegação para legado | dívida registrada | removidos quando a paridade IMOB for comprovada |
| `/app/logistica`, `/app/logistica/*` | cockpit de Logística | **CONCLUÍDO**: redirecionamento incondicional ao Front Door (sem página, sem chave); a página foi removida (FD-LEGACY-CLOSURE-001) | — |
| `/app/logistica/pre-duimp` | Pré-DUIMP | **CONCLUÍDO**: redirecionamento incondicional à entrada Pré-DUIMP da conversa; página removida; capacidades inexistentes (documentos, conferência, persistência, HITL, replay) = frente própria | — |

Rotas **a classificar pelo proprietário** (não presumo "administração técnica"): `/app/runs`, `/app/billing`, `/app/economy`,
`/app/admin/aprovacoes` (decisão humana de liberação), `/app/marketplace` (+`/imob`), `/self-service` (+`/app/self-service`, `/:slug`) e
`/profile` (gestão de workspace). Hoje **não existe nenhuma rota de administração técnica** registrada. Identidade/cadastro (`/signup`, `/access`)
é Core. Legal/J360 e Radar: sem rota própria neste worktree (J360 opera como especialista no chat; Radar é tratado em outra frente) — a regra e
o gate valem para eles quando surgirem; verificar na integração.

## 6. Fora de escopo desta decisão

Migração de verticais; remoção/redirecionamento de rotas; alteração de contratos (`vertical.registry.v1`, `chat.vertical_handoff.v2`);
billing/custo; Evidence Index; AUTHZ-ROOT-001, D1–D4, R1-B e operações reais.

## FD-SINGLE-ENTRY-001 — IMOB como especialidade do Front Door (2026-10-21)

O menu **IMOB** abre `/app/chat?domain=imob` (mesmo launcher; o servidor decide o acesso no handoff) e a intenção na conversa ("Quero cadastrar um imóvel.") seleciona a mesma especialidade. A gestão operacional do IMOB (aprovações com ações, Central Operacional, fila priorizada, aguardando, gargalos, funil/KPIs/equipe) abre **na conversa** como cartão "Gestão IMOB" (`ImobManagementConversationCard`), pelo menu *Gestão ▾ → Painel de gestão* ou por pedido claro ("ver painel de gestão do IMOB"); o launcher só renderiza (flag `imobManagementCard` do engine). Os painéis são os mesmos do antigo dashboard e usam os mesmos endpoints e a mesma validação do servidor; os atalhos "abrir caso" por linha foram removidos do cartão (`buildCaseRoute`), pois levariam ao chat independente.

Ainda **não** conforme (registrado, não escondido): `/app/imob/chat`, `/app/imob/dashboard` e as três rotas que redirecionam para o dashboard continuam renderizando páginas operacionais independentes. Bloqueios B1–B7 em `scripts/front-door-surface-register.json` (campo `plan`) e no relatório do gate. `conformant:false` persiste.
