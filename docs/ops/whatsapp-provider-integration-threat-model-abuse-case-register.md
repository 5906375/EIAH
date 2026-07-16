# WhatsApp Provider Integration — Threat Model / Abuse Case Register

## Objetivo

Este documento registra o threat model e o abuse case register para uma integracao futura hipotetica de provider WhatsApp.

F2.18 e threat-model-only. Nao autoriza execucao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo e nao altera o estado `provider blocked` declarado em F2.15-F2.17.

## Assets protegidos

- Tenant, workspace, scope e entitlement.
- Contrato `whatsapp.read_only.bundle_export.v1`.
- `eventId`, timestamps e trilha de replay/idempotencia.
- `evidenceBundle` e `bundleExport` sanitizados.
- Secret de assinatura futuro e seu ciclo de vida.
- Boundary de webhook produtivo futuro.
- Logs, metricas, evidencias e incident records.
- PII/sensiveis: telefone bruto, texto bruto, payload bruto, assinatura, token, cookie e Authorization.
- Garantia `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0` e `criticalActionExecution=0` enquanto nao houver etapa produtiva separada.

## Trust boundaries

| Boundary | Estado F2.18 | Regra |
| --- | --- | --- |
| Provider externo -> webhook | Nao ativo | Nenhum evento real deve ser aceito por F2.18. |
| Webhook -> verificacao de evento | Nao ativo | Assinatura, timestamp, replay, duplicidade e schema sao prerequisitos futuros. |
| Verificacao -> adapter read-only | Conceitual | Apenas eventos verificados e sanitizados poderiam atravessar em etapa futura. |
| Adapter -> tenant/workspace/entitlement | Existente/read-only | Qualquer confusao deve falhar fechada. |
| Adapter -> observability/evidence | Existente/read-only | Apenas campos sanitizados podem ser registrados. |
| Runtime -> mutacoes/acoes criticas | Bloqueado | Mutacoes, `lead.create`, `lead.discard` e acoes criticas permanecem proibidas. |
| Secrets -> runtime | Nao provisionado | Secret produtivo nao pode aparecer em repo, log, bundle ou evidencia. |

## Threat actors

- Atacante externo enviando eventos falsos.
- Cliente ou integracao tentando replay/duplicidade.
- Integracao mal configurada do provider.
- Operador interno com configuracao incorreta de secret/webhook.
- Tenant tentando acessar workspace ou scope de outro tenant.
- Usuario tentando executar acao critica via payload de mensagem.
- Observability consumer expondo PII por metricas/logs.
- Processo de deploy/promocao sem decision record.

## Attack surfaces

- Webhook produtivo futuro.
- Header de assinatura e timestamp.
- `eventId` e idempotencia.
- Payload provider bruto.
- Parsing e validacao de schema.
- Channel binding e resolucao tenant/workspace.
- Entitlement/scope checks.
- Evidence bundle, bundle export, logs e metricas.
- Secret management e variaveis de ambiente.
- Rollback/disable e roteamento externo.
- Promotion decision record e gates documentais.

## Abuse case register

| Abuse case | Boundary | Controles requeridos | Detection signals | Fail-closed response | ReasonCode |
| --- | --- | --- | --- | --- | --- |
| spoofed provider event | Provider -> webhook | assinatura obrigatoria, allowlist, schema | provider desconhecido, assinatura ausente/invalida | rejeitar evento | `PROVIDER_SIGNATURE_INVALID` |
| invalid signature | Webhook -> verificacao | HMAC/assinatura versionada | mismatch de assinatura | `401` e bloquear | `PROVIDER_SIGNATURE_INVALID` |
| replay attack | Verificacao de evento | timestamp window, replay guard | eventId/timestamp reutilizado | `409` e bloquear | `PROVIDER_REPLAY_DETECTED` |
| duplicate event | Verificacao de evento | idempotencia por `eventId` | duplicidade detectada | `409` e bloquear | `PROVIDER_REPLAY_DETECTED` |
| payload tampering | Payload -> schema | assinatura cobrindo payload, schema strict | hash/schema divergente | `400` e bloquear | `PROVIDER_PAYLOAD_TAMPERED` |
| oversized payload | Payload -> parser | limite de tamanho antes do parse | payload acima do limite | `413` e bloquear | `PROVIDER_PAYLOAD_TOO_LARGE` |
| malformed payload | Payload -> schema | schema validation | envelope/campos invalidos | `400` e bloquear | `PROVIDER_PAYLOAD_TAMPERED` |
| timestamp manipulation | Webhook -> verificacao | janela de skew e timestamp assinado | timestamp ausente/futuro/antigo | `401` e bloquear | `PROVIDER_REPLAY_DETECTED` |
| eventId collision | Idempotencia | unicidade por provider/eventId | colisao de eventId | `409` e bloquear | `PROVIDER_REPLAY_DETECTED` |
| secret exposure | Secret boundary | secret store, rotacao, redaction | secret em log/repo/evidencia | disable e rotacao | `PROVIDER_SECRET_EXPOSURE_RISK` |
| PII leakage | Observability/evidence | masking, allowlist de campos | telefone/texto/payload bruto em output | bloquear promocao e abrir incidente | `PROVIDER_PII_LEAKAGE_RISK` |
| tenant/workspace confusion | Binding | resolucao governada e fail-closed | tenant/workspace ausente/divergente | `403` e bloquear | `PROVIDER_TENANT_SCOPE_CONFUSION` |
| entitlement bypass attempt | Entitlement | scope/entitlement obrigatorios | entitlement ausente/divergente | `403` e bloquear | `PROVIDER_ENTITLEMENT_BYPASS_ATTEMPT` |
| critical action attempt | Mutation boundary | policy/HITL/critical gate | payload pedindo acao critica | `403` e bloquear | `PROVIDER_CRITICAL_ACTION_BLOCKED` |
| mutation attempt | Mutation boundary | read-only gate, action allowlist vazia | `lead.create`, `lead.discard` ou mutacao | `403` e bloquear | `PROVIDER_MUTATION_BLOCKED` |
| observability blind spot | Observability | metricas minimas e alertas | ausencia de metricas/SLO | manter provider blocked | `PROVIDER_SECURITY_REVIEW_REQUIRED` |
| rollback unavailable | Rollback | disable/rollback testado antes de execucao | runbook/owner ausente | manter provider blocked | `PROVIDER_ROLLBACK_REQUIRED` |
| decision record missing | Governance | PDR obrigatorio | decisao ausente/incompleta | manter provider blocked | `PROVIDER_SECURITY_REVIEW_REQUIRED` |

## Controles requeridos

- Assinatura obrigatoria e verificacao antes de parse confiavel.
- Janela de timestamp, replay guard e idempotencia por `eventId`.
- Limite de payload antes de parsing.
- Schema validation estrita.
- Provider allowlist por ambiente autorizado.
- Binding tenant/workspace/scope em modo fail-closed.
- Entitlement obrigatorio.
- Masking e allowlist de campos em logs, metricas, bundles e evidencias.
- Secret management com segregacao por ambiente, rotacao, revogacao e redaction.
- Rollback/disable validado antes de qualquer execucao futura.
- Promotion Decision Record aprovado antes de qualquer tentativa de execucao.
- Mutacoes e acoes criticas bloqueadas por default.

## Detection signals

- Contagem de assinatura invalida/ausente.
- Contagem de replay/duplicidade.
- Contagem de payload tampered, malformed ou too large.
- Timestamp fora da janela.
- Colisao de `eventId`.
- Tentativas de tenant/workspace/scope divergente.
- Tentativas de entitlement bypass.
- Tentativas de critical action ou mutation.
- Violacao de PII/masking.
- Presenca de secret em log/evidencia.
- Ausencia de metricas obrigatorias.
- Rollback/disable ausente.
- Decision record ausente.

## Fail-closed responses

- Rejeitar eventos sem assinatura valida.
- Bloquear replay, duplicidade e eventId collision.
- Bloquear payload invalido, adulterado ou oversized antes de side effects.
- Bloquear tenant/workspace/scope/entitlement ausentes ou divergentes.
- Bloquear qualquer mutacao, `lead.create`, `lead.discard` ou acao critica.
- Bloquear promocao quando houver blind spot de observabilidade, rollback indisponivel ou decision record ausente.
- Acionar disable/rollback quando houver PII leakage, secret exposure, side effect ou fail-open.

## Residual risks

- Este threat model nao prova seguranca operacional de provider real.
- Controles permanecem requisitos documentais ate existir implementacao futura separada.
- Gaps F2.16 permanecem bloqueadores.
- F2.17 permanece design-only e F2.18 permanece threat-model-only.
- Qualquer execucao futura sem security review e decision record deve permanecer bloqueada.

## ReasonCodes

- `PROVIDER_THREAT_MODEL_ONLY`
- `PROVIDER_SECURITY_REVIEW_REQUIRED`
- `PROVIDER_SIGNATURE_INVALID`
- `PROVIDER_REPLAY_DETECTED`
- `PROVIDER_PAYLOAD_TAMPERED`
- `PROVIDER_PAYLOAD_TOO_LARGE`
- `PROVIDER_SECRET_EXPOSURE_RISK`
- `PROVIDER_PII_LEAKAGE_RISK`
- `PROVIDER_TENANT_SCOPE_CONFUSION`
- `PROVIDER_ENTITLEMENT_BYPASS_ATTEMPT`
- `PROVIDER_CRITICAL_ACTION_BLOCKED`
- `PROVIDER_MUTATION_BLOCKED`
- `PROVIDER_ROLLBACK_REQUIRED`

## Provider integration boundary

Provider integration permanece `blocked`. Este documento nao cria provider, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Nao-autorizacao de execucao

F2.18 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica ou side effect.

## Status final

Status: proposta/parcial evidenciada documentalmente.
