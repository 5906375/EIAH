# ADR-001 — Stack Oficial de Domain Runtime para Go-Live Controlado

## Status

Aceita

## Data

2026-05-31

## Contexto

O repositório possui documentação e evidências operacionais suficientes para uma borda `Cloudflare + Vercel + Render`, com serviços gerenciados de dados e fila. Ao mesmo tempo, parte do material de análise e parecer externo ainda cita uma stack alternativa `AWS ALB/ACM/ECS/Fargate`, gerando drift documental e ambiguidade de operação.

Hoje, os artefatos reais do repositório apontam para:

- Cloudflare para DNS, TLS edge, regras de origem e WAF/rate limit.
- Vercel para `apps/web`.
- Render para `apps/api`.
- Neon Postgres para banco.
- Upstash Redis para fila/cache.
- Resend para e-mail transacional.

Há menções a Fly.io como alternativa de hospedagem para a API, mas não como stack oficial primária desta revisão.

## Decisão

A stack oficial de produção inicial para go-live controlado da EIAH passa a ser:

- `Cloudflare` para DNS, TLS edge, WAF e proteção de origem.
- `Vercel` para a aplicação web pública.
- `Render` para a API pública.
- `Neon Postgres` para persistência relacional.
- `Upstash Redis` para cache, filas e coordenação leve.
- `Resend` para e-mail transacional.

`Fly.io` permanece como alternativa operacional documentada para a API, mas não é a plataforma oficial primária desta ADR.

`AWS ALB/ACM/ECS/Fargate` não é a stack oficial desta revisão e não deve ser tratada como pré-requisito de aderência enquanto não houver nova ADR substituindo esta decisão.

## Motivações

- A decisão precisa refletir o que já possui documentação e evidência real no repositório.
- O go-live controlado exige clareza operacional e paths canônicos, não ambiguidade entre stacks concorrentes.
- A topologia atual reduz esforço de operação inicial sem abrir mão de DNS, TLS, WAF, health checks e rollback controlado.

## Alternativas consideradas

### AWS ALB/ACM/ECS/Fargate

Vantagens:

- Mais controle de rede, runtime e topologia.
- Caminho natural para requisitos futuros de isolamento e governança de maior porte.

Desvantagens nesta revisão:

- Não há evidência operacional equivalente já consolidada no repositório.
- Exigiria IaC, smoke tests e documentação adicionais antes de servir como stack canônica.

### Fly.io para API

Vantagens:

- Boa aderência a deploy simples de API com domínio customizado.
- Alternativa viável para contingência ou revisão futura.

Desvantagens nesta revisão:

- O plano de produção atual revisado aponta Render como API primária.
- Não há decisão formal anterior promovendo Fly como padrão oficial.

## Consequências

- O parecer final, o evidence index e os runbooks devem referenciar `Cloudflare + Vercel + Render` como stack primária.
- Evidências de domain/go-live devem provar esta topologia real.
- Qualquer plano futuro de migração para AWS deve nascer em nova ADR com impacto explícito em P0–P4.

## Evidências obrigatórias desta decisão

- `docs/Domínio e DNS/PLANO_PRODUCAO_IMOB_EIAH.md`
- `docs/Domínio e DNS/Domínio e DNS.md`
- `ops/evidence/latest/domain-go-live/tls-full-strict-check.md`
- `ops/evidence/latest/domain-go-live/dns-cloudflare-snapshot.md`
- `ops/evidence/latest/domain-go-live/production-dns-tls-smoke.md`
- `ops/evidence/latest/domain-go-live/api-health-response.json`
- `ops/evidence/latest/domain-go-live/rollback-plan.md`
- `docs/EVIDENCE_INDEX.md`

## Riscos

- Drift documental se materiais externos continuarem exigindo AWS como stack presumida.
- Dependência excessiva de documentação narrativa sem snapshots adicionais de staging/prod.
- Necessidade de formalizar evidências recorrentes de `health`, smoke DNS/TLS e rollback.

## Impacto em P0–P4

- `P0`: remove ambiguidade de nomes e stack oficial.
- `P1`: preserva governança fail-closed já implementada na API.
- `P2`: clarifica o contrato operacional esperado para `/health`, smoke e monitoramento externo.
- `P3`: mantém a superfície de proteção operacional documentada em Cloudflare.
- `P4`: permite rollout controlado por vertical sem trocar a base de runtime.

## Gatilhos para revisão

- Adoção efetiva de `AWS ALB/ACM/ECS/Fargate` em produção.
- Substituição de Render por Fly.io ou outra plataforma como primária.
- Exigência regulatória ou contratual de isolamento de rede que a stack atual não atenda.
