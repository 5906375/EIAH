# Self-service Dedup — Ciclo final de validação (2026-04-15)

## Comandos executados
1. `pnpm check:self-service-runtime-graph`
2. `pnpm check:frontend-duplication`
3. `pnpm --filter @eiah/web build`
4. `pnpm baseline:self-service-runtime-graph`

## Resultado consolidado
- `check:self-service-runtime-graph`: **OK**
  - runtime files: `14`
  - runtime `.js` files: `0`
  - duplicate pairs (`.js` + `.ts/.tsx`): `0`
- `check:frontend-duplication`: **OK**
- `@eiah/web build`: **OK**
  - warning remanescente fora desta frente: `Unrecognized target environment "ES2024"`
- `baseline:self-service-runtime-graph`: **OK**
  - baseline gravada em `artifacts/self-service-runtime-baseline.json`

## Conclusão
Frente de deduplicação do self-service permanece convergida e validada no fechamento:
- `runtime .js = 0`
- `duplicate pairs = 0`
