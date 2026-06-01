# TLS Full Strict Check — 2026-05-31

## Status

Curadoria atualizada com base na evidência de conformidade TLS já existente no repositório.
O conteúdo abaixo atua como `snapshot` documental canônico desta revisão.

## Fonte verificada

- `ops/evidence/2026-W09/domain-dns/tls-compliance-evidence.md`

## Resultado consolidado

- `cloudflare ssl mode: Full (strict)`
- `minimum tls: 1.2`
- `curl test: success with TLSv1.3`

## Leitura operacional

- A borda TLS está documentada em modo `Full (strict)`.
- O handshake mínimo suportado é `TLS 1.2`.
- A validação anterior já registrou sucesso com `TLS 1.3`.

## Próxima coleta recomendada

- Capturar smoke separado para `app.staging.eiah.<tld>` e `api.staging.eiah.<tld>` quando esses hosts estiverem formalizados.
- Versionar o resultado bruto do comando de verificação usado pela operação.
