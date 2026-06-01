# Production DNS/TLS Smoke — 2026-05-31

## Status

Consolidado a partir das evidências existentes de TLS, origem protegida e WAF. Sem novo smoke de rede executado neste workspace.

## Fontes verificadas

- `ops/evidence/2026-W09/domain-dns/tls-compliance-evidence.md`
- `ops/evidence/2026-W09/domain-dns/origin-security-evidence.md`
- `ops/evidence/2026-W09/base/waf-rate-limit-evidence.md`
- `docs/adr/ADR-001-domain-runtime-stack.md`

## Resultado consolidado

- TLS edge documentado em `Full (strict)`.
- Origem pública protegida por proxy.
- Acesso direto à origem bloqueado.
- Regras de WAF e rate limit marcadas como habilitadas.
- `rules` de borda permanecem ativas para proteção da API pública.
- Teste de burst anterior observou `429`.
- O fluxo de `webhook` permaneceu aceito no pós-check anterior sem challenge indevido.

## Limite desta evidência

Este arquivo consolida a prontidão operacional já registrada, mas não substitui um smoke de rede executado contra o host produtivo atual com data nova.

## Próxima coleta recomendada

- `curl -I https://app.eiah.<tld>`
- `curl -sS https://api.eiah.<tld>/health`
- registro do certificado e do `Server` observado na borda
