# Vertical Entitlement Billing Policy

## Objetivo

Definir a fonte de verdade operacional para habilitação de verticais por `tenant/workspace`, sua relação com billing e o comportamento esperado quando houver divergência entre estado de produto, cobrança e permissão de uso.

Escopo desta versão:

- política canônica
- decisões de fonte de verdade
- comportamento operacional por status
- sem migration
- sem mudança de runtime nesta rodada

## Princípios

- a política de entitlement não nasce na UI
- a política de entitlement não sobrescreve histórico de execução já consolidado
- entitlement e billing precisam convergir, mas não são o mesmo conceito
- divergência entre banco e provider deve falhar de forma explícita e auditável
- mudança de policy deve preservar compatibilidade com o IMOB atual

## Fonte de verdade atual

Estado atual identificado na auditoria:

- existe `TenantProductInstallation` no Prisma
- não existe `VerticalEntitlement` como model canônico
- existe base de billing no Prisma:
  - `TenantBillingAccount`
  - `TenantQuotaPolicy`
  - `TenantQuotaUsage`
  - `WorkspaceQuotaUsage`
  - `WorkspaceQuotaGrant`
  - `TenantInvoice`
  - `BillingLedger`

Decisão desta versão:

- a fonte de verdade atual para ativação de vertical por `tenant/workspace` é `TenantProductInstallation`
- `VerticalEntitlement` permanece conceito futuro, não objeto obrigatório nesta fase
- qualquer model novo de entitlement deve nascer como evolução explícita, não como duplicação silenciosa de `TenantProductInstallation`

## Modelo conceitual

Enquanto não existir model próprio:

- `product` representa a vertical ou produto habilitado
- `status` representa o estado operacional mínimo da instalação
- billing continua separado, mas pode restringir efeitos do entitlement conforme esta policy

Leitura operacional:

- `TenantProductInstallation` responde "esta vertical está habilitada neste workspace?"
- billing responde "esta habilitação pode continuar operando sem restrição?"

## Matriz de status

Status canônicos para leitura de policy nesta fase:

- `active`
- `suspended`
- `past_due`
- `inactive`

Mapeamento nesta fase:

- se `TenantProductInstallation.status = active`, entitlement operacional é `active`
- se houver suspensão explícita de produto/workspace, entitlement operacional é `suspended`
- se billing indicar inadimplência com janela de tolerância expirada, entitlement operacional é `past_due`
- se o produto não estiver instalado ou tiver sido desativado, entitlement operacional é `inactive`

## Regras por status

### `active`

- novas execuções podem ocorrer
- atribuições de responsável podem ocorrer
- uso de features da vertical é permitido
- quotas e grants continuam valendo normalmente

### `suspended`

- novas execuções sensíveis da vertical devem ser bloqueadas
- leitura de histórico e evidência deve continuar disponível
- casos em andamento não devem perder rastreabilidade
- mutations sensíveis dependem de decisão explícita de governança

### `past_due`

- aplicar grace period antes de bloquear operações
- durante grace period:
  - leitura continua liberada
  - mutations sensíveis podem ser limitadas por policy
  - novas ativações/expansões devem ser bloqueadas
- após grace period:
  - bloquear novas execuções operacionais da vertical
  - manter acesso a histórico, faturamento e evidências

### `inactive`

- novas execuções não podem ocorrer
- instalação é tratada como não habilitada
- histórico continua acessível apenas conforme regra global de retenção e auditoria

## Grace period

Esta policy não define ainda a duração fixa do grace period no schema.

Decisão desta versão:

- grace period é regra documental/operacional primeiro
- implementação futura deve definir:
  - duração
  - clock de início
  - eventos de renovação
  - efeito sobre assignment e runs

Critério mínimo esperado na futura implementação:

- `past_due` não deve bloquear retroativamente histórico
- o fim do grace period deve ser determinístico e auditável

## Relação com quotas e grants

- `WorkspaceQuotaGrant` e `TenantQuotaPolicy` não substituem entitlement
- quotas controlam volume/custo
- entitlement controla permissão de uso do produto/vertical

Regra:

- workspace com quota disponível, mas sem entitlement ativo, não opera a vertical
- workspace com entitlement ativo, mas quota esgotada, continua sujeito aos gates de quota

## Relação com usage events e billing ledger

- usage events continuam sendo emitidos por execução real
- billing ledger continua sendo o razão financeira oficial
- entitlement não reescreve ledger histórico

Regra:

- mudança de entitlement afeta permissão futura
- não invalida eventos históricos já emitidos
- qualquer ajuste financeiro posterior deve ser tratado no fluxo de billing, não no entitlement

## Divergência entre billing provider e banco

Fonte de verdade operacional nesta fase:

1. estado persistido e reconciliado no banco
2. evidências de billing/reconciliação
3. provider externo como origem de sinal, não como verdade isolada de runtime

Se houver divergência:

- não confiar em leitura ad-hoc de UI
- registrar estado reconciliado no backend
- preferir bloqueio explícito e auditável em vez de decisão implícita

## Webhook, replay e idempotência

Requisitos mínimos da política:

- evento de billing não pode mutar entitlement de forma não idempotente
- replay de webhook deve produzir o mesmo estado final
- transições de status devem ser auditáveis

Decisão desta fase:

- manter a regra no plano documental
- não introduzir schema novo antes da auditoria completa de integração

## Compatibilidade com IMOB atual

- `ownerResponsible` continua como alias operacional do IMOB
- nenhuma regra desta policy pode quebrar os fluxos já fechados de `DATA-01`, `DATA-02`, `DATA-03` e `Trilha A`
- qualquer enforcement futuro deve nascer com compat layer explícita

## Delta mínimo recomendado para fase posterior

Antes de criar `VerticalEntitlement`, validar:

1. se `TenantProductInstallation` já cobre a maior parte do caso
2. se basta adicionar convenções de status/policy sobre o model atual
3. se um model novo só se justifica para separar:
   - entitlement operacional
   - estado financeiro
   - lifecycle por vertical

Regra prática:

- preferir evolução incremental sobre `TenantProductInstallation`
- evitar duplicar estado de ativação em dois modelos concorrentes

## Decisões desta versão

- `TenantProductInstallation` é a base atual de entitlement
- billing e entitlement permanecem separados
- `VerticalEntitlement` continua como proposta, não implementação
- nenhuma migration deve ser aberta antes da fase de modelagem
