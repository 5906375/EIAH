# Tenant Billing & Quotas Roadmap (PR-based)

## Objetivo
Implantar controle financeiro por `tenantId` com permissões por workspace, mantendo funcionalidades existentes e preservando layout visual/responsivo.

## Arquitetura-alvo
- `tenant` = unidade financeira
- `workspace` = unidade operacional
- Ledger append-only para auditoria e compliance
- Usage recalculável a partir do ledger

## PR 1: Data Model (sem impacto funcional)
### Escopo
- Criar tabelas:
  - `tenant_billing_account`
  - `tenant_quota_policy`
  - `tenant_quota_usage`
  - `workspace_quota_grant`
  - `billing_ledger`
- Índices por `tenantId`, `workspaceId`, `cycle_start/cycle_end`, `created_at`.
- Trigger de imutabilidade no ledger (`UPDATE/DELETE` bloqueados).
- Backfill default para tenants/workspaces existentes.

### Critérios de aceite
- Migração executa em banco limpo e existente.
- Backfill cria conta/política/grant padrão para dados atuais.
- Aplicação continua operando sem uso obrigatório das novas tabelas.

## PR 2: Domain Services (shadow mode)
### Escopo
- `BillingLedgerService` (`insertDebit`, `insertCredit`, `insertAdjustment`)
- `QuotaUsageService` (`refreshFromLedger`, `incrementFromEvent`)
- `QuotaPolicyService` (`resolveTenantPolicy`, `resolveWorkspaceGrant`)
- Feature flag: `TENANT_BILLING_V2_SHADOW=true`

### Critérios de aceite
- Cada run gera lançamento no ledger (shadow).
- Usage do ciclo reconciliável por `SUM(billing_ledger)`.
- Nenhuma execução bloqueada.

## PR 3: Guard de Execução (soft/hard)
### Escopo
- Middleware pré-run:
  1. Validar `workspace_quota_grant.enabled`
  2. Validar quota tenant (soft/hard)
- Modos:
  - `shadow`: log apenas
  - `soft`: alerta sem bloqueio
  - `hard`: bloqueio

### Critérios de aceite
- Workspace desabilitado não executa.
- Hard limit bloqueia com erro explícito.
- Soft limit gera evento/aviso sem bloquear.

## PR 4: API Billing Tenant
### Escopo
- `GET /billing/tenant/summary`
- `GET /billing/tenant/usage?from&to`
- `GET /billing/tenant/workspaces`
- `PATCH /billing/tenant/workspaces/:id/grant`
- `PATCH /billing/tenant/quotas`
- `GET /billing/tenant/ledger`
- `POST /billing/tenant/adjustment`

### Critérios de aceite
- Respostas com `tenantId`, ciclo, totais e detalhamento por workspace.
- Ledger retorna trilha auditável completa.
- Adjustment gera crédito/débito sem alterar histórico.

## PR 5: UI Billing (layout preservado)
### Escopo
- Manter página atual e adicionar:
  - resumo do tenant
  - uso do ciclo (soft/hard)
  - tabela de grants por workspace
  - ledger com filtros
  - ação de adjustment (admin)

### Critérios de aceite
- Design system preservado (visual/responsivo).
- Sem regressão em rotas atuais.
- Dados consistentes com API tenant billing.

## PR 6: Integração com Runs/Agentes
### Escopo
- Badge/alerta de quota no fluxo de execução.
- Mensagem clara de bloqueio por hard limit.
- Incluir `ledgerId` e `requestId` nas evidências de run.

### Critérios de aceite
- Usuário entende bloqueios e motivos.
- Auditoria ponta a ponta: run + billing.

## PR 7: Reconciliador e Operação
### Escopo
- Job periódico: `tenant_quota_usage = SUM(billing_ledger)`.
- Comando/admin endpoint para rebuild manual por ciclo.
- Alertas operacionais de divergência.

### Critérios de aceite
- Divergência detectável e corrigível.
- Rebuild sem interrupção de execução.

## PR 8: Cutover e Cleanup
### Escopo
- Ativar `TENANT_BILLING_V2_ENFORCE=true`.
- Migrar consumidores antigos (workspace-billing -> tenant-billing).
- Remover caminhos legados obsoletos.

### Critérios de aceite
- Produção usa tenant billing como fonte primária.
- Zero regressão em runs/agentes/self-service/billing.

## Critérios globais
1. Ledger append-only.
2. Usage sempre recalculável do ledger.
3. Quotas por tenant com grants por workspace.
4. UI/UX preservada e responsiva.
5. Evidência completa: `tenantId`, `workspaceId`, `runId`, `ledgerId`, `requestId`.
