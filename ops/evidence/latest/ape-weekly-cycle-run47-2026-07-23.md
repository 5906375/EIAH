# APE Weekly Cycle #47 — 2026-07-23

- decision: NO_GO
- hardMetricsGo: false
- nonRegressionGo: false
- auditGap: 0
- duplicateSideEffects: 0
- breakGlass: 0
- rolloutMode: shadow
- canaryStage: pilot
- hardReasons: required_check_failed=check:e2e-recency, required_check_failed=check:backup-restore

## Checks
- check:e2e-recency: FAIL
- check:manifest-integrity: PASS
- check:billing-webhook-evidence: PASS
- check:interop-matrix: PASS
- check:interop-spec-governance: PASS
- check:economy-invariants: PASS
- check:secrets-vault: PASS
- check:backup-restore: FAIL
- check:waf-rate-limit: PASS
- check:origin-security: PASS
- check:tls-compliance: PASS
- check:runbook-drill-recency: PASS
- check:imob-chat-telemetry: PASS
- check:imob-chat-persistence: PASS
- check:imob-chat-export: PASS

## W4 focus
- D5: revisar governanca multi-vertical antes do proximo ciclo.
- D6: corrigir checks falhos e renovar a janela recorrente com evidencias atuais.
- MCP: manter MCP-1H como coverage/characterization only; nao promover LEG-001, LEG-015 ou LEG-017 para fechado.

## Resultado
- Ciclo semanal executado com bloqueios em: required_check_failed=check:e2e-recency, required_check_failed=check:backup-restore.
- Evidencia recorrente P1 renovada para manter auditGap=0 e duplicateSideEffects=0 dentro da janela exigida.
