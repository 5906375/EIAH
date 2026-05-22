# IMOB Market Scan P1 — Source Data Quality Gate

Data: 2026-05-22

## Escopo

- Adicionado Source Data Quality Gate mínimo ao `IMOB_MarketScanAgent`.
- Avalia fill-rate de `price`, `areaM2` e `priceAreaM2`.
- Classifica qualidade como `pass`, `degraded` ou `blocked`.
- Bloqueia scoring quando não há sinal mínimo de preço/área.
- Aplica penalidade de confiança quando a qualidade está degradada.
- Inclui status de qualidade no snapshot e no hash de evidência Guardian.
- Mantém saída compacta no chat e sem IDs internos visíveis.

## Arquitetura preservada

- `IMOB_Orchestrator` permanece classificado como parcial avançado.
- Regra adicionada no pipeline/agente, não no `ChatAgentLauncher`.
- Frontend não foi alterado.
- Public web assisted continua controlado, sem internet aberta autônoma.

## Validação

```text
git diff --check
PASS
```

```text
pnpm -w exec tsc -p apps/api/tsconfig.typecheck.json --noEmit 2>&1 | rg "apps/api/src/services/imob/" | rg -v "\\.test\\.ts" || true
PASS: sem erros filtrados em apps/api/src/services/imob/
```

```text
node --import tsx --test \
  apps/api/src/tests/imob-turn-resolver.test.ts \
  apps/api/src/tests/imob-crm-turn-engine.test.ts \
  apps/api/src/tests/imob-market-scan-pipeline.test.ts \
  apps/api/src/tests/imob-public-web-scan-policy.test.ts \
  apps/api/src/tests/imob-market-scan-no-internal-id-leak.test.ts \
  apps/api/src/tests/imob-market-scan-policy-judge-final-response.test.ts \
  apps/api/src/tests/imob-market-scan-source-quality-gate.test.ts
PASS: 7 arquivos, 7 pass, 0 fail
```

## DoD

- `sourceQualityFillRateComputed=true`
- `sourceQualityStatusComputed=true`
- `blockedBeforeScoring=true`
- `confidencePenaltyApplied=true`
- `guardianEvidenceIncludesQuality=true`
- `compactChatQualityMessage=true`
- `chatAgentLauncherChanged=false`
- `frontendChanged=false`

