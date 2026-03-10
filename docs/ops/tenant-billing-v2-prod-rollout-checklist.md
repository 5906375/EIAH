# Tenant Billing V2 - Checklist Final de Rollout (Producao)

## Objetivo
Ativar tenant billing v2 como fonte principal, com cutover controlado por flag, sem regressao de runs, agentes, self-service e billing UI.

## Escopo de flags

### DEV
- `TENANT_BILLING_V2_SHADOW=true`
- `TENANT_BILLING_V2_GUARD_MODE=shadow`
- `TENANT_BILLING_V2_RECONCILE_ENABLED=true`
- `TENANT_BILLING_V2_RECONCILE_INTERVAL_MS=300000`
- `TENANT_BILLING_V2_RECONCILE_LIMIT_PER_TICK=200`
- `TENANT_BILLING_V2_ENFORCE=false`

### HOMOLOG
- `TENANT_BILLING_V2_SHADOW=true`
- `TENANT_BILLING_V2_GUARD_MODE=soft`
- `TENANT_BILLING_V2_RECONCILE_ENABLED=true`
- `TENANT_BILLING_V2_RECONCILE_INTERVAL_MS=300000`
- `TENANT_BILLING_V2_RECONCILE_LIMIT_PER_TICK=200`
- `TENANT_BILLING_V2_ENFORCE=false`

### PRE-PROD
- `TENANT_BILLING_V2_SHADOW=true`
- `TENANT_BILLING_V2_GUARD_MODE=hard`
- `TENANT_BILLING_V2_RECONCILE_ENABLED=true`
- `TENANT_BILLING_V2_RECONCILE_INTERVAL_MS=300000`
- `TENANT_BILLING_V2_RECONCILE_LIMIT_PER_TICK=500`
- `TENANT_BILLING_V2_ENFORCE=true`

### PROD (cutover)
- `TENANT_BILLING_V2_SHADOW=true`
- `TENANT_BILLING_V2_GUARD_MODE=hard` (ou vazio para default hard quando enforce=true)
- `TENANT_BILLING_V2_RECONCILE_ENABLED=true`
- `TENANT_BILLING_V2_RECONCILE_INTERVAL_MS=300000`
- `TENANT_BILLING_V2_RECONCILE_LIMIT_PER_TICK=500`
- `TENANT_BILLING_V2_ENFORCE=true`

## Pre-deploy (obrigatorio)
- [ ] Backup do banco validado.
- [ ] Migrations aplicadas (`tenant_billing_*`, `workspace_quota_grant`, `billing_ledger`).
- [ ] `ADMIN_API_TOKEN` configurado (necessario para `/api/ops/billing/reconcile`).
- [ ] Confirmar que API sobe sem crash com as flags de destino.

## Deploy e smoke imediato
- [ ] `GET /api/health` retorna 200.
- [ ] `GET /api/billing/tenant/summary` retorna 200 e payload com `tenantId`, `cycleStart`, `cycleEnd`.
- [ ] `GET /api/billing/tenant/workspaces` retorna grants e uso por workspace.
- [ ] `GET /api/billing/tenant/ledger` retorna itens sem erro 500.
- [ ] Fluxo de run normal continua enfileirando/executando.

## Validacoes funcionais pos-deploy

### 1) Ledger e uso
- [ ] Executar 1 run de teste e verificar evento `billing.usage.updated`.
- [ ] Verificar no ledger novo debito para o run.
- [ ] Conferir se `tenant_quota_usage` do ciclo refletiu o custo.

### 2) Guard rails de billing
- [ ] Com limite alto: run passa (sem bloqueio indevido).
- [ ] Com limite baixo: run bloqueia com `BILLING_GUARD_BLOCKED` e mensagem clara.
- [ ] Em soft limit: run passa com warning.

### 3) Reconciliacao
- [ ] Dry-run admin:
  - `POST /api/ops/billing/reconcile` com `{ "dryRun": true }`.
- [ ] Apply admin:
  - `POST /api/ops/billing/reconcile` com `{ "dryRun": false }`.
- [ ] Se havia divergencia, confirmar evento `billing.reconcile.divergence` em `guardrail_audit_ledger`.

## Comandos uteis (exemplo)

```bash
curl -sS "$API_URL/api/health"
```

```bash
curl -sS "$API_URL/api/billing/tenant/summary" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-eiah-tenant: $TENANT_ID" \
  -H "x-eiah-workspace: $WORKSPACE_ID"
```

```bash
curl -sS -X POST "$API_URL/api/ops/billing/reconcile" \
  -H "x-eiah-admin-token: $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dryRun":true,"limitTenants":100}'
```

## SQL de auditoria (referencia)

```sql
-- usage do ciclo deve bater com soma do ledger no tenant
SELECT
  u.tenant_id,
  u.cycle_start,
  u.cycle_end,
  u.runs AS usage_runs,
  u.cost_cents AS usage_cost,
  COALESCE(l.runs, 0) AS ledger_runs,
  COALESCE(l.cost_cents, 0) AS ledger_cost
FROM tenant_quota_usage u
LEFT JOIN (
  SELECT
    tenant_id,
    COUNT(*) FILTER (WHERE type = 'debit' AND amount_cents > 0) AS runs,
    COALESCE(SUM(amount_cents), 0) AS cost_cents
  FROM billing_ledger
  GROUP BY tenant_id
) l ON l.tenant_id = u.tenant_id
ORDER BY u.updated_at DESC
LIMIT 20;
```

## Rollback rapido
- [ ] Setar `TENANT_BILLING_V2_ENFORCE=false`.
- [ ] Manter `TENANT_BILLING_V2_SHADOW=true` para nao perder observabilidade.
- [ ] Reiniciar API.
- [ ] Revalidar `/api/health`, runs e billing summary.

## Criterio de Go/No-Go
- GO:
  - Nenhum erro 500 em `/billing/tenant/*`.
  - Runs executam e custo e gravado.
  - Bloqueio hard funciona quando esperado.
  - Reconcile sem falha critica.
- NO-GO:
  - Inconsistencia persistente usage vs ledger sem correcao.
  - Bloqueios indevidos em fluxo normal.
  - Erro recorrente na API de billing tenant.

