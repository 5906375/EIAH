# DNS Cloudflare Snapshot — 2026-05-31

## Status

Curadoria atualizada a partir dos documentos e evidências canônicas já existentes no repositório.

## Fontes verificadas

- `docs/adr/ADR-001-domain-runtime-stack.md`
- `docs/Domínio e DNS/PLANO_PRODUCAO_IMOB_EIAH.md`
- `docs/Domínio e DNS/Domínio e DNS.md`
- `ops/evidence/2026-W09/domain-dns/origin-security-evidence.md`

## O que este snapshot consolida

- `Cloudflare` é a camada oficial de DNS e borda para o go-live controlado desta revisão.
- Os domínios operacionais esperados seguem a convenção `app.eiah.<tld>` e `api.eiah.<tld>`.
- A borda pública deve permanecer proxied, com origem protegida e sem exposição direta do backend.

## Evidência-base reaproveitada

- `cloudflare proxy enabled`
- `bypass test to origin: negado`
- `mitigation: SG/ACL restricted to edge path`
- `direct origin access blocked`

Fonte literal: `ops/evidence/2026-W09/domain-dns/origin-security-evidence.md`

## Lacunas ainda abertas

- Snapshot operacional separado de `staging` e `production` ainda depende de captura manual dos registros reais ativos em cada ambiente.
- Este arquivo consolida a decisão e o hardening de borda já evidenciados, mas não substitui um dump operacional do painel DNS.
