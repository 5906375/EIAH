# Rollback Plan — Domain Go-Live

## Objetivo

Definir o rollback operacional mínimo para go-live controlado de domínio, DNS e borda pública da EIAH.

## Base documental

- `docs/adr/ADR-001-domain-runtime-stack.md`
- `docs/Domínio e DNS/PLANO_PRODUCAO_IMOB_EIAH.md`
- `ops/evidence/latest/domain-go-live/production-dns-tls-smoke.md`
- `ops/evidence/latest/domain-go-live/api-health-response.json`

## Gatilhos de rollback

- `/health` público retorna `degraded` ou `unhealthy`
- DNS aponta para destino incorreto
- certificado/TLS falha na borda
- origem passa a responder sem proxy esperado
- taxa anormal de `429`, `5xx` ou bloqueios indevidos após promoção

## Procedimento mínimo

1. Congelar promoções de DNS, app e API.
2. Reverter o target público para o último deployment saudável em `Vercel` e `Render`.
3. Restaurar registros e proxy da borda `Cloudflare` conforme última configuração válida.
4. Executar smoke de `/health`, TLS e origem protegida.
5. Registrar incidente e evidência complementar em `ops/evidence/latest/`.

## Critério de saída

- `/health` volta a `healthy`
- origem permanece protegida
- TLS edge volta a responder em configuração esperada
- smoke básico de navegação/app e API volta ao estado estável
