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
- Continua bloqueado: redirect de `/app/imob/chat` e formulários do IMOB dentro do `/app/chat` (etapa D).

**Atualização 2026-10-02 — ADR-010, etapa F (ativação pela conversa):**

- `POST /api/chat/vertical-activation/preview` (só leitura) devolve se a vertical já está ativa ou a proposta: efeitos da ativação e a `registryVersion` atual.
- `POST /api/chat/vertical-activation/confirm` exige `confirmed: true` e a mesma `registryVersion` da proposta; se o estado mudou, responde `409 ACTIVATION_PROPOSAL_STALE` e nada é ativado. A ativação usa o mesmo serviço do Marketplace (`services/products/productActivation.ts`: instalação + agentes + políticas padrão, atômico).
- No `/app/chat`, o engine (`verticalActivationEngine`) só envia a confirmação quando a resposta do usuário é uma confirmação explícita ("Confirmar ativação do IMOB") logo depois da proposta; "sim" solto, outra mensagem ou "Cancelar ativação" descartam a proposta.

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
