# Staging DNS/TLS Smoke — 2026-05-31

## Status

Preparado para coleta operacional. Ainda sem execução live registrada neste workspace.

## Escopo esperado

- `app.staging.eiah.<tld>`
- `api.staging.eiah.<tld>`

## Evidência indireta já disponível

- `ops/evidence/2026-W09/domain-dns/tls-compliance-evidence.md`
- `ops/evidence/2026-W09/domain-dns/origin-security-evidence.md`
- `docs/adr/ADR-001-domain-runtime-stack.md`

## O que falta capturar no rollout

- resolução DNS do host de staging
- handshake TLS do host de staging
- confirmação de proxy/borda
- resposta do endpoint público `/health`

## Resultado atual

- `NÃO EXECUTADO`: sem subdomínios de staging formalizados e sem captura live versionada no repositório até esta data.

## Comando operacional sugerido

- `curl -I https://app.staging.eiah.<tld>`
- `curl -sS https://api.staging.eiah.<tld>/health`
