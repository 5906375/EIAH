# Authorization Scope Canon v1

## Fonte canônica

A fonte única versionada para scopes administrativos de Actions e Tools é
`packages/core/src/security/adminScopes.ts`.

O catálogo registra nomes e finalidade. A presença de um scope no catálogo
não o concede a token, usuário, tenant ou workspace. O enforcement deve
continuar fail-closed e depender de política explícita resolvida para o
`tenantId` e o `workspaceId` autenticados.

## Decisão AUTHZ-SCOPE-0

| Campo | Valor |
| --- | --- |
| Aprovador | Carlos Alberto Merlo |
| Data | 2026-07-28 |
| Decision ref | `AUTHZ-SCOPE-0/2026-07-28` |
| Status | Ratificado para o hotfix P0-AUTHZ |

Declaração ratificada:

> Eu, Carlos Alberto Merlo, ratifico os scopes administrativos
> `actions.admin` e `tools.admin` como scopes canônicos para proteção das
> rotas de governança de Actions e Tools no EIAH.

## Catálogo administrativo

### `actions.admin`

Autoriza a administração do catálogo de Actions e da política
`tenant_action_policy` nas rotas explicitamente protegidas:

- `POST /api/actions/version`
- `DELETE /api/actions/version/:version`
- `POST /api/actions/override`
- `GET /api/actions (administrative/global listing)`

Listagens administrativas que exponham catálogo global ou dados sensíveis
também exigem esse scope.

### `tools.admin`

Autoriza a administração de ToolContracts e listagens administrativas de
Tools nas rotas explicitamente protegidas:

- `POST /api/tools`
- `GET /api/tools (administrative/global/cross-tenant listing)`

## Scopes funcionais preexistentes

Os scopes abaixo continuam com sua semântica anterior e não substituem os
scopes administrativos ratificados:

- `runs:write`
- `reports.view`
- `ledger.view`
- `governance:calibrate`

## Uso proibido

`actions.admin` e `tools.admin` não autorizam:

- execução direta de Actions críticas;
- bypass do MCP;
- alteração de secrets;
- alteração de schema ou migrations;
- aprovação humana HITL;
- acesso cross-tenant fora dos endpoints explicitamente protegidos;
- deploy ou mutação de staging/produção.

## Requisitos para o hotfix P0-AUTHZ

- token sem o scope adequado recebe `403` fail-closed;
- tenant e workspace de mutações tenant-scoped derivam do `authContext`;
- `tenantId` ou `workspaceId` divergentes no body são rejeitados ou ignorados
  explicitamente, com teste;
- `allowed` em policy override é obrigatório e explícito;
- toda mutação sensível possui teste de regressão;
- automação não pode interpretar a ratificação como grant automático.

Este registro desbloqueia a implementação do hotfix, mas não fecha o
P0-AUTHZ. Os handlers de Actions e Tools não são alterados por esta decisão.
