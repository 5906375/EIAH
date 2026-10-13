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

## Decisão AUTHZ-SCOPE-1 — autoridade comercial

| Campo | Valor |
| --- | --- |
| Decisão de produto | Carlos Alberto Merlo (comunicada em sessão de trabalho) |
| Data | 2026-10-12 |
| Decision ref | `AUTHZ-SCOPE-1/2026-10-12` (referência provisória) |
| Status | Adotado; ratificação formal assinada **PENDENTE** |

Esta decisão NÃO é uma ratificação formal assinada nos moldes da `AUTHZ-SCOPE-0`: não há declaração assinada nem
data de ratificação. A referência acima é provisória e deve ser confirmada ou substituída pelo aprovador. Enquanto a
ratificação formal não existir, o escopo não deve ser tratado como ratificado em nenhum registro ou evidência.

Decisão: adotar `marketplace.subscribe` como escopo específico de contratação de agentes, distinto de qualquer
permissão de execução operacional. A vertical e seus agentes podem identificar necessidades e recomendar; não
contratam. A contratação pertence a uma identidade humana permissionada do tenant e workspace.

### `marketplace.subscribe`

Autoriza uma identidade humana a contratar (assinar) um agente do Marketplace para o tenant/workspace autenticado,
nas rotas explicitamente protegidas:

- `POST /api/marketplace/:id/subscribe`
- `POST /api/delegations (self-delegation of a Marketplace item)`
- `PATCH /api/delegations/:id (retargeting by the delegatee)`

Concessão padrão: **nenhuma**. O escopo não é concedido a administradores da plataforma, usuários existentes, papéis
genéricos (inclusive Founder) nem a quem tem `actions.admin`, `tools.admin` ou `products.activate`.

A contratação exige, antes de qualquer efeito, todas estas condições (fail-closed; falha ou dúvida = negar):

1. identidade humana autenticada (`userId`) no tenant e workspace do token;
2. política explícita `marketplace.subscribe` para o workspace exato do token (`TenantActionPolicy`, avaliada por
   `TenantPolicyStore.resolveExactWorkspaceScopeDecision`; política tenant-wide NÃO é herdada);
3. permissão `marketplace.subscribe` na membership ATIVA da pessoa naquele workspace;
4. agente identificado de forma inequívoca (item do Marketplace existente, visível, de tipo `agent`, nome não
   reservado e sem homônimo de outro publicador);
5. registro prévio da decisão em `GuardrailAuditLedger` (identidade decisora, tenant, workspace, agente, condições
   aceitas, horário e resultado); se o registro falhar, a contratação é negada. Negações também são registradas.

`marketplace.subscribe` não autoriza executar, ativar fluxos nem publicar campanhas com o agente contratado.

Nomes de scopes canônicos (`actions.admin`, `tools.admin`, `marketplace.subscribe`) são reservados: itens do
Marketplace com esses nomes não podem ser publicados nem contratados, porque o nome do item vira
`TenantActionPolicy.actionName` na assinatura.

### Bloqueadores de publicação de `marketplace.subscribe` (registrados, não implementados)

O código desta decisão pode ser versionado de forma parcial, mas a funcionalidade NÃO deve ser publicada enquanto
estes pontos estiverem abertos:

1. Proteção de `POST /api/actions/override` contra concessões indevidas: hoje `actions.admin` grava
   `TenantActionPolicy` com qualquer `actionName`, inclusive nomes de agentes e do próprio escopo.
2. Cerimonial governado para atribuir `marketplace.subscribe` a uma pessoa do tenant ("ninguém dá o que não tem");
   hoje não há fluxo, então a contratação permanece bloqueada por padrão.
3. Restrições de papéis personalizados e dos demais caminhos capazes de produzir concessão equivalente (papéis
   personalizados aceitam permissões arbitrárias; delegação cross-tenant feita pelo publicador; onboarding).
4. Testes integrados de autorização em PostgreSQL e por HTTP (os testes atuais usam fixtures em memória).
5. Confirmação e evidência da decisão humana de contratação (condições aceitas vinculadas a agente, tenant,
   workspace e escopo); hoje só existe o registro da decisão de autoridade em `GuardrailAuditLedger`, sem hash
   encadeado.

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
