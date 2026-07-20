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
