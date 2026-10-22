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
- `POST /api/commercial-authority/designations`
- `POST /api/commercial-authority/designations/:id/revoke`
- `POST /api/commercial-authority/enablements/:id/revoke`
- `POST /api/actions/override (policy of an agent)`

Concessão padrão: **nenhuma**. O escopo não é concedido a administradores da plataforma, usuários existentes, papéis
(inclusive Founder e papéis personalizados) nem a quem tem `actions.admin`, `tools.admin` ou `products.activate`.
A autoridade NÃO mora em permissões de membership: mora numa **designação** própria
(`eiah_commercial_authority_designations`), então papéis, convites e permissões de membro não a produzem.

#### Contratar (autoridade `holder`)

Antes de qualquer efeito, todas estas condições (fail-closed; falha ou dúvida = negar):

1. identidade humana autenticada (`userId`; token de serviço/agente nunca contrata) no tenant e workspace do token;
2. membership ATIVA da pessoa naquele workspace;
3. designação `holder` ATIVA (não revogada, não expirada) da pessoa naquele workspace exato; lida a cada chamada, sem
   cache, então a revogação vale na chamada seguinte;
4. a contratação concreta cabe nos limites da designação (escopos de delegação permitidos e prazo máximo; padrão:
   `read`/`execute` e 90 dias, sem `admin`);
5. agente identificado de forma inequívoca (item do Marketplace existente, visível, de tipo `agent`, nome não
   reservado e sem homônimo de outro publicador);
6. registro prévio da decisão em `GuardrailAuditLedger` (identidade decisora, designação, tenant, workspace, agente,
   condições aceitas, horário e resultado); se o registro falhar, a contratação é negada. Negações também são
   registradas.

`marketplace.subscribe` não autoriza executar, ativar fluxos nem publicar campanhas com o agente contratado.

#### Conceder e revogar (autoridade `grantor`, distinta)

Procedimento mínimo de designação comercial, pelas rotas `/api/commercial-authority/*`:

- **Contrato da designação:** tenant, workspace, pessoa beneficiária, pessoa que concede, designação do concedente que
  legitima o ato, escopo (`marketplace.subscribe`), papel (`holder` ou `grantor`), limites, validade (até 365 dias),
  decisão explícita (`decision: "grant"`/`"revoke"`), referência de evidência (`evidenceRef`) e motivo da revogação.
- **Ninguém concede o que não possui:** o concedente precisa de designação `grantor` ativa e de membership ativa; a
  validade e os limites concedidos não excedem os do concedente; o beneficiário é membro ativo do mesmo workspace.
- **Sem autoconcessão e com separação de funções:** o concedente não pode ser o beneficiário, e a mesma pessoa não
  acumula `holder` e `grantor` no mesmo workspace.
- **Revogação:** por quem tem autoridade `grantor` ativa, ou pela própria pessoa (renúncia); `cascade: true` também
  revoga o que foi concedido por aquela designação. Vale imediatamente.
- **Atomicidade e auditoria:** a designação e o evento de `GuardrailAuditLedger` são gravados na mesma transação; falha
  em qualquer parte desfaz tudo. O ledger NÃO tem encadeamento criptográfico e nada aqui afirma isso. Só ids são
  gravados: nunca token, JWT, senha ou credencial.
- **Corpo estrito:** tenant e workspace vêm só do token; campos extras são recusados.

#### Bootstrap da primeira autoridade: BLOQUEADO

O repositório não tem fonte autoritativa ratificada para a primeira designação `grantor` de um workspace. Por isso:
quem cria o tenant não recebe autoridade; não existe concessão inicial implícita; sem nenhum `grantor` ativo toda
concessão responde `403 GRANTOR_AUTHORITY_REQUIRED` com `bootstrap.reasonCode = FIRST_AUTHORITY_SOURCE_NOT_RATIFIED`.
Estabelecer essa fonte e ratificá-la é uma decisão humana pendente.

#### Habilitação comercial verificável (agentes governados)

Agente **governado** = agente que declara capacidades transversais (hoje `MKT`; outros entram ao declarar). Para eles,
política + delegação, sozinhas, **não habilitam**. O ponto canônico é a disponibilidade do agente no workspace
(`listAgents` e `isAgentAvailableInWorkspace`, de onde derivam o Front Door, a descoberta e a disponibilidade IMOB):
o agente só está habilitado com um registro de habilitação VIGENTE
(`eiah_agent_commercial_enablements`) que o liga a:

- a decisão humana: evento do `GuardrailAuditLedger` + designação `holder` que a fundamentou + pessoa que decidiu;
- tenant, workspace e item do Marketplace contratados;
- a delegação ESPECÍFICA que o sustenta, ainda ativa e com as MESMAS condições aceitas (escopo e `trustMin`).

Consequências (todas testadas): delegação nova do publicador, política antiga reaberta, onboarding, delegação alterada
por fora, habilitação revogada/expirada ou delegação expirada **não** reativam o agente; só uma nova decisão da pessoa
com autoridade vigente cria nova habilitação. O registro nasce SOMENTE em `POST /api/marketplace/:id/subscribe`, depois
da autoridade e do registro prévio da decisão; falha em registrar a habilitação deixa o agente não habilitado. A leitura
é fail-closed (tabela ausente ou erro de consulta = nenhum agente governado habilitado). Uma delegação reaproveitada
cujos termos excedem os limites da designação não serve de base (cria-se delegação nos termos decididos). Revogar a
habilitação (`POST /api/commercial-authority/enablements/:id/revoke`, por quem tem designação `holder` ou `grantor`
vigente) nega a política do agente (`allowed=false`) na mesma transação do registro. Delegações que não são contratação
seguem funcionando: apenas deixam de bastar para habilitar um agente governado.

#### `actions.admin` não é autoridade comercial

`actions.admin` é uma política de **workspace**: qualquer token do workspace a exerce. Quando o efeito de `POST /api/actions/override` com `allowed=true`
equivale a habilitar um agente (nome canônico ou item `agent` do Marketplace), a rota exige a PESSOA com membership ativa e designação `holder`
vigente (revalidada na hora) e registra a decisão antes de alterar; token de serviço, Founder, administrador técnico ou
permissão genérica de workspace não bastam (403). Para agentes governados isso ajusta só a metade "política", que por si
só não habilita. O escopo `marketplace.subscribe` nunca é concedido como política (409). Negar (`allowed=false`) e as demais
operações administrativas não comerciais não mudam.

#### Caminhos alternativos fechados

- Papéis personalizados (`workspaceRoleOptions`) e convites (`permissions`) que nomeiem `marketplace.subscribe` são
  recusados (`422 COMMERCIAL_AUTHORITY_NOT_GRANTABLE_HERE`); e, mesmo se a string existir numa membership, ela não é
  lida como autoridade.
- Delegações: auto-delegação de item do Marketplace e alteração de termos pela delegatária exigem a mesma autoridade;
  delegação emitida por publicador a outro tenant segue possível, mas não habilita agente governado.
- Nomes de scopes canônicos (`actions.admin`, `tools.admin`, `marketplace.subscribe`) são reservados: itens do
  Marketplace com esses nomes não podem ser publicados, renomeados nem contratados, porque o nome do item vira
  `TenantActionPolicy.actionName` na assinatura.

### Bloqueadores de publicação de `marketplace.subscribe`

O código pode ser versionado de forma parcial, mas a funcionalidade NÃO deve ser publicada enquanto estes pontos
estiverem abertos:

1. Ratificação formal assinada de `AUTHZ-SCOPE-1` e da fonte da primeira autoridade concedente (bootstrap).
2. Validação em ambiente integrado equivalente ao de produção (os testes HTTP + PostgreSQL desta etapa rodaram em
   banco descartável local; não substituem staging).
3. Confirmação humana da contratação vinculada às condições aceitas (agente, tenant, workspace, escopo e termos
   comerciais): hoje a decisão de AUTORIDADE é registrada, mas não existe passo de confirmação de termos.
4. Agentes que não declaram capacidades transversais (não governados) continuam habilitáveis por política +
   delegação, como antes; estender o vínculo verificável a eles exige decidir a migração de habilitações legadas
   (hoje inexistentes no registro novo). O mesmo vale para a delegação de onboarding e a de publicador: seguem possíveis
   e inertes para agentes governados.
5. Fluxo "solicitar apreciação" para quem não tem autoridade (hoje aparece desabilitado).

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

## Nota — Histórico IMOB × autoridade para operar o IMOB (EIAH-GIT-INTEGRATION-004, 2026-10-22)

O IMOB tem duas portas de autorização distintas. Ter acesso ao **histórico** de conversas não é ter autoridade para **operar** o IMOB.

| | Histórico (`/chat/conversations*`, `/chat/telemetry*`) | Operação (CRM, `resolve-turn`, casos, owners, leads, imóveis, command center…) |
|---|---|---|
| Identidade | `userId` humano no token (sem ele: `403 IMOB_HISTORY_IDENTITY_REQUIRED`) | `userId` humano no token (sem ele: `403 IMOB_SERVICE_AUTHORITY_REQUIRED`) |
| Vínculo | vínculo **ativo** no workspace (ausente: `403 IMOB_HISTORY_MEMBERSHIP_REQUIRED`) | vínculo **ativo** (ausente: `403 IMOB_WORKSPACE_MEMBERSHIP_REQUIRED`) |
| Permissão `imob.chat.use` | **não exigida** | exigida (vínculo ativo sem ela: `403 IMOB_WORKSPACE_PERMISSION_FORBIDDEN`) |
| Escopo do dado | só a conversa de que o usuário é **titular** (outra conversa: `404 CONVERSATION_NOT_FOUND`) | permissões por rota e por etapa (`imob.stage.*`) |
| O que permite | criar conversas e registrar/ler mensagens, threads e entrevista da própria conversa | ler e alterar casos, owners, leads e imóveis; executar turnos do IMOB |

Valem para as **duas** portas, antes de qualquer decisão acima e nesta ordem: revogação EIAH da vertical; instalação do IMOB habilitada no workspace
(`403 ENTITLEMENT_MISSING`); e a guarda de vínculo revogado/inativo (`403 IMOB_WORKSPACE_MEMBERSHIP_INACTIVE`, sem criar, reativar nem promover vínculo).

Estado verificado em banco descartável (sonda ad hoc, dados sintéticos): vínculo ativo **sem** `imob.chat.use` recebe `200` ao listar e `201` ao criar a própria
conversa no histórico e `403 IMOB_WORKSPACE_PERMISSION_FORBIDDEN` nas rotas operacionais; vínculo revogado recebe `IMOB_WORKSPACE_MEMBERSHIP_INACTIVE` nas duas portas;
as consultas não criam nem alteram vínculos.

**Decisão pendente do owner (não alterada):** se o histórico também deve exigir `imob.chat.use`. Enquanto não houver nova autorização, o contrato acima é mantido
e a tabela de códigos não é modificada. Isto não concede nem amplia permissão.
