# Chat to Vertical contract v2

Status: contrato/preflight parcial. Este documento nao habilita runtime, provider, writes, redirect ou paridade de vertical.

## Contratos

- `vertical.registry.v1` declara, por tenant/workspace, as verticais ativas, capabilities, modes, entitlement, RBAC, policy gates e rollout stage.
- `chat.vertical_handoff.v2` transporta a decisao agent-driven ja resolvida entre engine e surface.
- `chat.vertical_handoff.v1` permanece disponivel para compatibilidade; esta fase nao migra produtores ou consumidores operacionais.

`vertical.id` e a identidade canonica. IDs conhecidos sao `core`, `imob`, `legal`, `mkt`, `bpo_financeiro`, `log` e `health`. IDs `custom:<slug>` sao aceitos somente quando registrados no registry ativo do tenant/workspace. `label` e apenas apresentacao.

## Fail-closed

Todo `vertical.id`, inclusive `core`, precisa existir no registry ativo e no mesmo escopo do handoff. Registry, RBAC, entitlement ou policy nao avaliados bloqueiam. Capability e mode precisam estar declarados juntos. Fixture exige `read_only` com `preview_only`; `critical_action` exige HITL aprovado.

Os schemas usam `additionalProperties: false` e nao admitem prompt, resposta ou documento bruto. A projecao para presentation/surface remove governance e, portanto, nao expoe `tenantId` ou `workspaceId`.

## Limites desta fase

Nao ha alteracao no `ChatAgentLauncher`, resolver operacional, API, frontend, Knowledge Search, provider, run ou persistencia. Redirect e PRs funcionais posteriores permanecem bloqueados ate aprovacao explicita, testes E2E e rollout governado.

**Atualização 2026-09-30:** a implementação em PRs sequenciais, para todas as verticais e produtos, foi autorizada pela [ADR-010](../adr/ADR-010-unificacao-chat-front-door-verticais.md); o redirect das rotas dedicadas continua bloqueado até decisão própria após paridade comprovada por E2E.

**Atualização 2026-10-02 — ADR-010, etapas B e C:** primeiro produtor e consumidor operacionais.

- `GET /api/chat/vertical-registry` monta o `vertical.registry.v1` do workspace a partir do estado real (instalação do produto, direito de uso, atribuições de agente provisionadas e permissão `imob.chat.use` do usuário) e devolve à superfície uma projeção sem `tenantId`/`workspaceId`.
- `POST /api/chat/vertical-handoff` preenche a governança no servidor (registry, RBAC, entitlement; policy `not_required`; HITL exigido para `critical_action`) e avalia com `evaluateChatVerticalHandoffV2` (fail-closed). A superfície recebe só `projectChatVerticalHandoffV2ForSurface` ou o `reasonCode` do bloqueio.
- No `/app/chat`, o engine (`verticalHandoffEngine`) decide o handoff para pedidos operacionais do IMOB (`crm.forms`, `requires_write`) e o launcher apenas renderiza o resultado.
- `check:arch-chat-contracts` mantém a proibição para qualquer outro consumidor; os autorizados estão listados por arquivo em `ADR010_AUTHORIZED_V2_OPERATIONAL_CONSUMERS`.
- Continua bloqueado: redirect de `/app/imob/chat`.

**Atualização 2026-10-02 — ADR-010, etapa F (ativação pela conversa):**

- `POST /api/chat/vertical-activation/preview` (só leitura) devolve se a vertical já está ativa ou a proposta: efeitos da ativação e a `registryVersion` atual.
- `POST /api/chat/vertical-activation/confirm` exige `confirmed: true` e a mesma `registryVersion` da proposta; se o estado mudou, responde `409 ACTIVATION_PROPOSAL_STALE` e nada é ativado. A ativação usa o mesmo serviço do Marketplace (`services/products/productActivation.ts`: instalação + agentes + políticas padrão, atômico).
- No `/app/chat`, o engine (`verticalActivationEngine`) só envia a confirmação quando a resposta do usuário é uma confirmação explícita ("Confirmar ativação do IMOB") logo depois da proposta; "sim" solto, outra mensagem ou "Cancelar ativação" descartam a proposta.
- Quem pode ativar (decisão do responsável, 2026-10-02): o Founder ou quem tem a permissão `products.activate` (concedida a quem cria o tenant no onboarding, a quem cria um workspace já podendo ativar, ou por convite/função com a permissão). Vale para o Marketplace e para o chat; sem permissão, a prévia responde `not_permitted` e a confirmação `403 PRODUCT_ACTIVATION_FORBIDDEN`.

**Atualização 2026-10-02 — ADR-010, etapa D (IMOB dentro do `/app/chat`):**

- Com o IMOB ativo na conversa (último handoff permitido ou ativação confirmada, decidido pelo engine em `isImobActiveInConversation`), o `/app/chat` mostra a barra Proprietários, Imóveis, Locações e Negócios e os mesmos formulários do `/app/imob/chat`, pelo módulo `features/imob/structured` (host `useImobFrontDoorForms`).
- Depois de um handoff permitido, o pedido original segue para o mesmo resolvedor de turno do IMOB (`/imob/chat/resolve-turn`), que devolve o formulário (ex.: "quero cadastrar um imóvel" abre "Cadastrar imóvel"). Os envios vão direto para a API do IMOB, sem run.
- Continua bloqueado: redirect de `/app/imob/chat` (decisão própria após paridade por E2E — etapa E).

**Atualização 2026-10-19 — ADR-010, Logística & Comex no mesmo handoff (EIAH-FD-ADR010-M1–M3):** a vertical `log` passa a usar o handoff e a ativação existentes, sem novo launcher, agente ou mecanismo.

- Registry: a entrada `log` declara a capacidade `oraculo.context` (`read_only`) **somente quando o contexto está autorizado** (instalação ativa, liberação EIAH, vínculo ativo e política exata `log.context.read`, calculados em `resolveLogisticaContextAccess`); negada, a entrada permanece idêntica e o `registryVersion` não muda. `rolloutStage` continua `context_only`; preparação, evidência e conferência **não** são anunciadas como capacidade da conversa (continuam no cockpit). A governança da `log` (`rbac: not_required`, `entitlement` e `policy` derivados do acesso) é preenchida no servidor; o handoff do IMOB não muda.
- `registryVersion`: continua sendo o hash do registry inteiro do workspace, calculado a cada requisição e guardado só no snapshot da proposta de ativação; a confirmação rejeita versão divergente com `409 ACTIVATION_PROPOSAL_STALE`. Propostas pendentes de workspaces sem Logística autorizada mantêm a versão; com a Logística autorizada, a versão muda (rejeição fail-closed, nova proposta).
- Front Door: os engines de ativação, billing e avisos derivam texto, botões e snapshot da vertical efetiva (sem fallback silencioso para IMOB); `?domain=logistica` e pedidos claros ("quero trabalhar com logística", "preciso acessar Logística & Comex", "quero consultar a devolução de um contêiner") pedem o handoff `log`/`read_only` — reconhecer não instala, não libera e não concede política; frases ambíguas seguem o fluxo habitual. Handoff permitido sincroniza o domínio `logistica` e grava `verticalContext: "LOGISTICA"`.
- Continua fora desta etapa: formulários, upload e conferência dentro da conversa (M4) e referência opaca do caso nas mensagens (M5).

**Atualização 2026-10-20 — EIAH-FD-ADR010-R1 (consulta não cria autoridade):** `readVerticalRegistryFacts` só lê a permissão do IMOB (`readWorkspaceResponsibleProfile`, que cria o vínculo legado de quem não tem um) no handoff **para o IMOB**; consultar o registry, avaliar handoff de outra vertical e propor ativação não criam vínculo. O bootstrap legado continua existindo nas demais rotas (IMOB, ativação, perfil, uploads) e a tabela `eiah_workspace_memberships` não guarda procedência: um vínculo criado por ele **não é distinguível** de um vínculo aprovado. Por isso o acesso à Logística exige a capacidade expressa no próprio vínculo (`log.context.read`); o cenário S03 está em `apps/api/src/tests/logistica-authorization-r1.integration.test.ts`.

**Atualização 2026-10-20 — EIAH-FD-E2E-003 (continuidade do caso: `refs.caseRef` no pedido):** extensão **aditiva** do pedido `POST /chat/vertical-handoff`; o contrato `chat.vertical_handoff.v2` (schema, baselines, reason codes) **não muda** e nenhuma versão nova do protocolo foi criada.

- Pedido: `refs.caseRef` opcional (`^[A-Za-z0-9_-]{8,64}$`, estrito como o restante de `refs`); campo ausente = comportamento anterior. É uma referência **opaca**: sem documentos, credenciais ou identificadores sensíveis, e **a posse da referência não autoriza nada**. Só é considerada para `verticalId: "log"`; nas demais verticais é descartada (IMOB inalterado).
- Servidor: o `caseRef` é removido do pedido antes da avaliação do contrato (o `refs` do v2 não o conhece) e só é resolvido **depois** de o handoff `log` ter sido permitido pela governança (instalação, liberação EIAH, vínculo ativo e política exata `log.context.read` — o mesmo portão da rota de preparações), no tenant/workspace/usuário autenticados e pelo `OraculoPreparationRepository.get` existente. Não faz bootstrap de vínculo, não concede política, não cria caso.
- Resposta (aditiva, só quando o pedido trouxe `caseRef` e o handoff foi permitido): `data.caseContext = { status: "resolved", caseRef } | { status: "unavailable" }`. Não traz dados do caso, tenant ou workspace; inexistente, de outro workspace/tenant, registro com integridade violada e identidade ausente são **indistinguíveis** (`unavailable`, sem eco da referência). Handoff bloqueado não traz `caseContext`.
- Cliente: a engine do handoff envia a referência vigente (URL `?case=` ou memória da sessão por tenant/workspace/usuário) só para `log` e só se válida; o veredito vira `logisticaCase` no snapshot de apresentação e o cartão da jornada abre o mesmo caso ou, se recusada, esquece a referência e abre preparação nova.
- Fora do escopo: J17 (fila/aviso de decisão), qualquer persistência no servidor da referência, concessão de políticas.

## Definition of Done do preflight

- schemas, baselines, exemplos e reason codes versionados e estritos;
- compatibilidade preservada pela manutencao e verificacao do `chat.vertical_handoff.v1`;
- testes de vertical conhecida, custom registrada, registry/scope/governance e invariantes de fixture/HITL;
- adapter de presentation sem IDs de governanca;
- gates de arquitetura, launcher render-only e regressao do chat verdes;
- nenhum produtor ou consumidor operacional conectado ao `v2` nesta fase.

## Artefatos

- [Vertical Registry v1 schema](../../contracts/chat/vertical.registry.v1.schema.json)
- [Chat Vertical Handoff v2 schema](../../contracts/chat/chat.vertical_handoff.v2.schema.json)
- [Reason codes v1](../../contracts/chat/vertical.reason_codes.v1.json)
- [Agent Chat Runtime](./agent-chat-runtime.md)
