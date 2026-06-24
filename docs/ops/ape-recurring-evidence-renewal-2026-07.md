# APE Recurring Evidence Renewal — Julho 2026

## Objetivo

Renovar a evidência recorrente APE antes de **2026-07-08** para manter os gates P1/P3/P4 verdes.

Os ciclos APE válidos atuais (runs 38/39/40, gerados em 2026-06-24) expiram da janela de 14 dias em **2026-07-08**. Sem renovação, `check:p1-reconciliation-recurring`, `check:p3-stability-recurring` e `check:p4-trackp-rollout` voltam a falhar.

## Janela recomendada

**2026-07-04 a 2026-07-07** (margem de 1 dia antes do prazo)

## Pré-condições

Antes de rodar, verificar que os checks de evidência base estão passando:

```bash
pnpm check:e2e-recency
pnpm check:backup-restore
pnpm check:runbook-drill-recency
```

Se algum falhar, consultar o histórico da tarefa anterior (commit `c7a4fcb`) e renovar as evidências base conforme necessário.

## Comandos — execução

Rodar os 3 ciclos APE em sequência:

```bash
pnpm ape:cycle:weekly
pnpm ape:cycle:weekly
pnpm ape:cycle:weekly
```

O script gera automaticamente 3 novos arquivos `ape-weekly-cycle-run<N>-YYYY-MM-DD.md` em `ops/evidence/latest/` e atualiza `docs/EVIDENCE_INDEX.md`.

## Checks obrigatórios após execução

```bash
pnpm check:p1-reconciliation-recurring
pnpm check:p3-stability-recurring
pnpm check:p4-trackp-rollout
pnpm check:evidence-index
```

Todos devem retornar `"ok": true`.

## Critérios de aceite

- `hardMetricsGo: true` nos 3 ciclos novos
- `auditGap: 0` em todos os ciclos
- `duplicateSideEffects: 0` em todos os ciclos
- `check:p1-reconciliation-recurring` → PASS
- `check:p3-stability-recurring` → PASS
- `check:p4-trackp-rollout` → PASS
- `check:evidence-index` → PASS
- Nenhum ciclo `NO_GO` commitado
- Working tree limpo após commit

## Commit sugerido

Incluir apenas:
- `ops/evidence/latest/ape-weekly-cycle-run<N>-YYYY-MM-DD.md` (apenas os GO)
- `docs/EVIDENCE_INDEX.md` se atualizado

```bash
git commit -m "evidence(ape): refresh recurring weekly cycle evidence"
```

## Risco remanescente

O `ops/evidence/latest/high-e2e-manifest.json` atual usa `environment: "local-docker"`.
O follow-up ideal é regenerar via staging com credenciais reais:

```bash
STAGING_API_BASE_URL=<url> STAGING_API_TOKEN=<token> \
E2E_TENANT_ID=<tid> E2E_WORKSPACE_ID=<wid> \
pnpm generate:e2e-high-manifest
```

Isso não bloqueia os gates atuais mas é necessário antes de promover o ambiente de staging para produção certificada.
