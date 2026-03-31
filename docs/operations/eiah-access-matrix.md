# Matriz de Acesso da Plataforma EIAH

## Objetivo

Este documento formaliza a separação de acesso entre:

- `Founder Global`
- `Tenant Admin`
- `Workspace Admin`
- `Usuário final`

O objetivo é diferenciar com clareza:

- uso da plataforma como um todo
- administração financeira e operacional
- uso contextual de chat e verticais
- escopo por `tenant` e por `workspace`

## Identidade operacional do Founder Global

No ambiente atual, o administrador principal identificado é:

- `email`: `mmerlon.adv@gmail.com`
- `nome`: `Carlos Alberto Merlo`
- `tenantId`: `eiah-admin`
- `tenant principal`: `Jusall`
- `workspace principal`: `DEFAULT`
- `papel operacional`: `Founder Global`

Esse perfil representa o proprietário/desenvolvedor da EIAH, com acesso esperado para governança e atualizações globais da plataforma.

## Princípios de acesso

1. `Founder Global` governa a plataforma inteira.
2. `Tenant Admin` governa apenas o próprio tenant.
3. `Workspace Admin` governa apenas o próprio workspace.
4. `Usuário final` usa a plataforma no contexto autorizado, sem acesso administrativo amplo.
5. `Billing`, `Ledger`, `Reconciliação`, `Quotas` e `Grants` são superfícies administrativas.
6. `Chat`, `Launcher` e verticais são superfícies primárias de uso.
7. `Runs`, `Dashboard IMOB` e `Processes IMOB` são superfícies operacionais, com acesso condicionado a papel e escopo.

## Matriz prática por tela

| Tela | Founder | Tenant Admin | Workspace Admin | Usuário final | Observação de acesso |
| --- | --- | --- | --- | --- | --- |
| `Billing` | Sim | Sim, apenas do próprio tenant | Parcial, apenas do próprio workspace quando fizer parte do papel | Não | Tela administrativa financeira; não é a superfície primária de uso. |
| `Reconciliação` | Sim | Sim, apenas do próprio tenant | Parcial, apenas do workspace autorizado | Não | Tela de auditoria e investigação. |
| `Ledger` | Sim | Sim, apenas do próprio tenant | Normalmente não | Não | Razão financeira oficial; acesso restrito a perfis administrativos/financeiros. |
| `Grants por workspace` | Sim | Sim | Sim, apenas do próprio workspace | Não | Tela de governança de capacidade e habilitação. |
| `Agentes` | Sim | Sim | Parcial | Parcial ou não, conforme política do tenant | Para admin, suporta governança e custo; para usuário, idealmente apenas catálogo permitido. |
| `Runs` | Sim | Sim, apenas do próprio tenant | Sim, apenas do próprio workspace | Parcial, apenas runs do próprio escopo | Tela operacional e investigativa; não deve expor dados fora do escopo do usuário. |
| `Marketplace` | Sim | Sim | Parcial | Parcial | Para admin, serve para ativação e impacto financeiro; para usuário, descoberta e uso permitido. |
| `Chat Agent Launcher` | Sim | Sim | Sim | Sim | Superfície de uso da plataforma; mostra custo contextual, não governança global. |
| `Chat IMOB` | Sim, quando autorizado a operar/testar | Sim, se o tenant tiver IMOB | Sim, se o workspace tiver IMOB | Sim, se tiver permissão IMOB | Superfície de uso da vertical IMOB. |
| `IMOB Dashboard` | Sim | Sim, no próprio tenant | Sim, no próprio workspace | Parcial, se fizer parte da operação | Tela operacional da vertical, com indicadores e contexto do fluxo. |
| `IMOB Processes` | Sim | Sim, no próprio tenant | Sim, no próprio workspace | Parcial, se operar processos | Tela operacional por processo/caso. |
| `Quotas do tenant` | Sim | Sim | Normalmente não | Não | Política administrativa de limite do tenant. |
| `Adjustments` | Sim | Sim, se for perfil financeiro do tenant | Não | Não | Ajuste manual financeiro; acesso altamente restrito. |
| `Gate 403 IMOB` | Sim | Sim | Sim | Sim | Não é privilégio; é bloqueio padronizado quando faltar entitlement ou permissão. |

## Jornada por perfil

### Founder Global

Ao logar, deve ver as superfícies de administração geral da plataforma:

- `Billing`
- `Reconciliação`
- `Ledger`
- `Agentes`
- `Runs`
- `Marketplace`
- `IMOB Dashboard`
- `IMOB Processes`

Objetivo:

- governar custo total
- revisar tenants, workspaces, agentes e verticais
- acompanhar reconciliação, gaps e ledger
- decidir rollout, pricing, capacidade e atualizações globais

### Tenant Admin

Ao logar, deve ver a administração do próprio tenant:

- `Billing` do tenant
- `Runs` do tenant
- `Agentes`
- `Marketplace`
- workspaces do tenant
- verticais habilitadas no tenant

Se IMOB estiver ativo:

- `Chat IMOB`
- `IMOB Dashboard`
- `IMOB Processes`

Objetivo:

- administrar custo e operação da conta cliente
- controlar workspaces e agentes
- acompanhar consumo do tenant
- operar verticais contratadas

### Workspace Admin

Ao logar, deve ver a operação do próprio workspace:

- `Chat Agent Launcher`
- `Runs` do workspace
- `Chat IMOB`, quando habilitado
- `IMOB Dashboard`, quando habilitado
- `IMOB Processes`, quando habilitado

Pode ter acesso parcial a:

- `Billing` resumido do workspace
- `Agentes` do workspace

Objetivo:

- administrar o uso local
- acompanhar custo do workspace
- investigar runs e processos do próprio contexto

### Usuário final

Ao logar, deve ver principalmente superfícies de uso:

- `Chat Agent Launcher`
- `Chat IMOB`, se houver IMOB e permissão
- `Runs` em escopo limitado, quando autorizado
- `IMOB Dashboard` e `IMOB Processes`, apenas se fizer parte da operação dele

Não deve ver por padrão:

- `Billing` administrativo completo
- `Ledger`
- `Reconciliação` completa
- `Quotas do tenant`
- `Grants por workspace`
- dados de outros workspaces
- dados de outros tenants

Objetivo:

- executar tarefas
- entender o custo da própria execução
- acompanhar consumo do próprio contexto
- operar a vertical autorizada

## Regra de separação

Em termos práticos:

- `chat` e `verticais` = uso da plataforma
- `billing`, `ledger`, `reconciliação`, `quotas`, `grants` = administração da plataforma ou do tenant
- `runs`, `dashboard` e `processes` = zona operacional intermediária, com acesso por papel e escopo

## Observação de enforcement

Esta matriz documenta o acesso esperado.

O enforcement real deve continuar no backend, via:

- `roles`
- `permissions`
- `tenantId`
- `workspaceId`
- gates de entitlement/permissão

A UI não deve ser tratada como fonte única de autorização.
