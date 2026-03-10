# Realestate Command Center Smoke — 2026-03-09

## Endpoints validados

- `GET /api/imob/command-center/funnel-health`
- `GET /api/imob/command-center/blocked-runs`

## Resultado

- `200 OK` para ambos endpoints em escopo tenant/workspace.
- Resumo de funil com métricas determinísticas.
- Lista de bloqueios com filtros por status/risk reason code.
- Tabela no Runs (domínio IMOB) com:
  - fila de casos,
  - status,
  - filtro de risco/estado,
  - download de `bundle` e `receipt` por run.

## Evidência de teste

- `apps/api/src/tests/imob.command-center.smoke.test.ts`
