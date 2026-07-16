# WhatsApp Read-Only Adapter — Synthetic Healthcheck / Non-Provider Dry Run

## Objetivo

Definir o healthcheck sintetico do WhatsApp Adapter read-only sem provider real, usando fixtures deterministicas e sanitizadas para validar os caminhos `accepted_read_only` e `fail-closed`.

Este healthcheck nao habilita operacao produtiva, nao cria endpoint publico novo e nao substitui monitoramento real futuro. Ele formaliza como executar uma verificacao local/controlada da superficie ja coberta pela suite canonica `apps/api/src/tests/whatsapp.webhook-read-only.test.ts`.

## Escopo

- Superficie validada: handler `handleWhatsappInboundWebhook`.
- Endpoint conceitual: `POST /api/webhooks/whatsapp/inbound`.
- Modo: `read_only`.
- Provider: fixture local `whatsapp`, sem chamada externa.
- Secret: stub local de teste, sem secret produtivo.
- Binding: fixture JSON governada e deterministica.
- Evidencia: `evidenceBundle` e `bundleExport` sanitizados.

## Fixtures

As fixtures canonicas do dry run vivem no teste existente:

- `stubSecret`: `whatsapp-read-only-stub-secret-test`.
- `phoneHash`: hash deterministico usado somente para resolver binding no teste; nao deve aparecer no resultado serializado.
- `baseTimestamp`: `2026-07-15T12:00:00.000Z`.
- `readOnlyScope`: `whatsapp:inbound:read_only`.
- `readOnlyEntitlement`: `channel.whatsapp.inbound.read_only`.
- `buildBindings()`: binding local com `tenantId`, `workspaceId`, `scope`, `allowedScopes`, `entitlements` e `sessionExpiresAt`.
- `buildBody()`: envelope `whatsapp.adapter.event.v1` com campos controlados.
- `buildHeaders()`: headers locais assinados com HMAC stub.
- `invokeHandler()`: chamada direta ao handler, sem socket, sem provider externo e sem webhook produtivo.

## Accepted read-only path

O caminho aceito deve validar:

- status HTTP `202`;
- `reasonCode=ACCEPTED_READ_ONLY`;
- `evidenceBundle.decisionClass=accepted_read_only`;
- `bundleExport.decision=accepted_read_only`;
- `bundleExport.version=whatsapp.read_only.bundle_export.v1`;
- `bundleExport.piiMasked=true`;
- `evidenceBundle.sideEffects=0`;
- `bundleExport.sideEffects=0`;
- `data.readOnly=true`;
- `data.fallbackUsed=false`;
- telefone mascarado no retorno;
- ausencia de telefone bruto, `fromPhoneHash`, texto bruto, `rawPayloadRef`, header de assinatura, secret e Authorization no resultado serializado.

## Fail-closed path

O caminho fail-closed deve validar pelo menos estes cenarios:

- assinatura ausente: `401 WHATSAPP_SIGNATURE_MISSING`;
- assinatura invalida: `401 WHATSAPP_SIGNATURE_INVALID`;
- versao de assinatura invalida: `401 WHATSAPP_SIGNATURE_VERSION_UNSUPPORTED`;
- timestamp ausente: `401 WHATSAPP_TIMESTAMP_MISSING`;
- timestamp fora da janela: `401 WHATSAPP_TIMESTAMP_OUT_OF_WINDOW`;
- eventId ausente: `400 WHATSAPP_EVENT_ID_MISSING`;
- provider nao suportado: `400 WHATSAPP_PROVIDER_UNSUPPORTED`;
- messageType nao suportado: `400 WHATSAPP_MESSAGE_TYPE_UNSUPPORTED`;
- payload invalido: `400 WHATSAPP_PAYLOAD_INVALID`;
- telefone sem binding: `403 WHATSAPP_PHONE_NOT_BOUND`;
- tenant ausente: `403 TENANT_NOT_RESOLVED`;
- workspace ausente: `403 WORKSPACE_NOT_RESOLVED`;
- entitlement ausente: `403 ENTITLEMENT_REQUIRED`;
- sessao expirada: `403 SESSION_EXPIRED`;
- acao critica: `403 CRITICAL_ACTION_BLOCKED`;
- mutacao implicita: `403 CRITICAL_ACTION_BLOCKED`;
- `readOnly=false`: `403 READ_ONLY_MODE`;
- replay: `409 WHATSAPP_REPLAY_DETECTED`;
- duplicidade: `409 WHATSAPP_EVENT_DUPLICATE`;
- payload acima do limite: `413 WHATSAPP_PAYLOAD_TOO_LARGE`.

## Boundary de provider e mutacao

O healthcheck sintetico deve permanecer sem:

- provider WhatsApp real;
- secret produtivo;
- webhook produtivo;
- endpoint publico novo;
- dashboard obrigatorio;
- storage externo obrigatorio;
- ledger produtivo obrigatorio;
- mutacoes;
- `lead.create`;
- `lead.discard`;
- acao critica;
- chamada externa de provider;
- side effect externo.

Metricas esperadas do dry run:

- `providerExternalCall=0`;
- `mutationExternalSideEffect=0`;
- `sideEffects=0`;
- `criticalActionExecution=0`.

## PII/sensitive data policy

O resultado serializado do dry run nao pode conter:

- telefone bruto;
- `fromPhoneHash`;
- texto bruto da mensagem;
- `rawPayloadRef`;
- header de assinatura;
- segredo stub;
- secret produtivo;
- token, cookie ou Authorization;
- payload bruto de provider.

Qualquer violacao deve ser tratada como incidente conforme F2.9/F2.10.

## Observability/SLO linkage

O healthcheck sintetico alimenta a leitura operacional definida em F2.10:

- `accepted read-only` valida `whatsapp_read_only_accepted_total`;
- bloqueios por `reasonCode` validam `whatsapp_read_only_blocked_total`;
- replay/duplicidade validam `whatsapp_read_only_replay_detected_total` e `whatsapp_read_only_duplicate_event_total`;
- binding/entitlement validam `whatsapp_read_only_phone_not_bound_total`, `tenant/workspace unresolved` e `entitlement_required`;
- masking valida `whatsapp_read_only_pii_masking_violation_total=0`;
- `sideEffects=0` valida `whatsapp_read_only_side_effects_violation_total=0`;
- keyset/version do export validam `whatsapp_read_only_bundle_export_compat_failure_total=0`;
- invalid events bloqueados preservam `fail_closed_coverage_rate=100%`.

## Execucao recomendada

Executar a suite canonica existente:

```bash
node --import tsx --test apps/api/src/tests/whatsapp.webhook-read-only.test.ts
```

Checks auxiliares recomendados:

```bash
node --import tsx --test apps/api/src/tests/channel-binding.test.ts
node --import tsx --test apps/api/src/tests/replay-guard.test.ts
pnpm check:orphan-tests
pnpm check:evidence-index
pnpm check:docs-link-integrity
```

## Status

Status: proposta/parcial evidenciada documentalmente.
