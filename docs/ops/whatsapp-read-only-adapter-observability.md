# WhatsApp Read-Only Adapter — Observability Metrics / SLO Baseline

## Objetivo

Definir a baseline inicial de observabilidade do WhatsApp Adapter read-only, usando apenas campos sanitizados ja presentes em `evidenceBundle` e `bundleExport`.

Este documento nao habilita operacao produtiva do canal. Ele define metricas e SLOs para a superficie controlada `POST /api/webhooks/whatsapp/inbound`, preservando provider real ausente, secret produtivo ausente, mutacoes bloqueadas e `sideEffects=0`.

## Fonte de dados permitida

As metricas so podem ser derivadas de campos sanitizados:

- `evidenceBundle.reasonCode`
- `evidenceBundle.httpStatus`
- `evidenceBundle.eventId`
- `evidenceBundle.provider`
- `evidenceBundle.messageType`
- `evidenceBundle.tenantId`
- `evidenceBundle.workspaceId`
- `evidenceBundle.scope`
- `evidenceBundle.decisionClass`
- `evidenceBundle.sideEffects`
- `bundleExport.version`
- `bundleExport.decision`
- `bundleExport.reasonCode`
- `bundleExport.status`
- `bundleExport.eventId`
- `bundleExport.provider`
- `bundleExport.messageType`
- `bundleExport.tenantId`
- `bundleExport.workspaceId`
- `bundleExport.scope`
- `bundleExport.sideEffects`
- `bundleExport.piiMasked`
- `bundleExport.receivedAt`
- `bundleExport.providerTimestamp`
- `bundleExport.exportedAt`

Campos proibidos em metrica, log, dashboard ou evidencia:

- telefone bruto;
- `fromPhoneHash`;
- texto bruto da mensagem;
- `rawPayloadRef`;
- header de assinatura;
- segredo de assinatura;
- payload bruto do provider;
- token, cookie ou Authorization;
- qualquer campo fora do keyset congelado de `whatsapp.read_only.bundle_export.v1`.

## Metricas read-only

| Metrica | Definicao | Fonte | Dimensoes permitidas |
| --- | --- | --- | --- |
| `whatsapp_read_only_inbound_events_total` | Total de eventos inbound observados pelo adapter read-only | `bundleExport` emitido | `provider`, `messageType` |
| `whatsapp_read_only_accepted_total` | Eventos aceitos em modo read-only | `reasonCode=ACCEPTED_READ_ONLY` | `provider`, `messageType`, `tenantId`, `workspaceId`, `scope` |
| `whatsapp_read_only_accepted_rate` | `accepted_total / inbound_events_total` | agregacao sanitizada | `provider`, `messageType` |
| `whatsapp_read_only_blocked_total` | Eventos bloqueados pelo adapter | `decision=blocked` | `reasonCode`, `status`, `provider`, `messageType` |
| `whatsapp_read_only_blocked_rate` | `blocked_total / inbound_events_total` | agregacao sanitizada | `reasonCode`, `status` |
| `whatsapp_read_only_signature_missing_total` | Assinatura ausente | `reasonCode=WHATSAPP_SIGNATURE_MISSING` | `status` |
| `whatsapp_read_only_signature_invalid_total` | Assinatura invalida | `reasonCode=WHATSAPP_SIGNATURE_INVALID` | `status` |
| `whatsapp_read_only_timestamp_out_of_window_total` | Timestamp fora da janela de replay/skew | `reasonCode=WHATSAPP_TIMESTAMP_OUT_OF_WINDOW` | `status` |
| `whatsapp_read_only_replay_detected_total` | Replay detectado | `reasonCode=WHATSAPP_REPLAY_DETECTED` | `status` |
| `whatsapp_read_only_duplicate_event_total` | Evento duplicado por `eventId` | `reasonCode=WHATSAPP_EVENT_DUPLICATE` | `status` |
| `whatsapp_read_only_phone_not_bound_total` | Telefone sem binding governado | `reasonCode=WHATSAPP_PHONE_NOT_BOUND` | `status` |
| `whatsapp_read_only_tenant_unresolved_total` | Tenant nao resolvido | `reasonCode=TENANT_NOT_RESOLVED` | `status` |
| `whatsapp_read_only_workspace_unresolved_total` | Workspace nao resolvido | `reasonCode=WORKSPACE_NOT_RESOLVED` | `status` |
| `whatsapp_read_only_entitlement_required_total` | Entitlement/scope ausente ou invalido | `reasonCode=ENTITLEMENT_REQUIRED` | `status`, `scope` |
| `whatsapp_read_only_critical_action_blocked_total` | Tentativa de acao critica bloqueada | `reasonCode=CRITICAL_ACTION_BLOCKED` | `status`, `tenantId`, `workspaceId`, `scope` |
| `whatsapp_read_only_mode_violation_total` | Violacao de modo read-only | `reasonCode=READ_ONLY_MODE` | `status` |
| `whatsapp_read_only_payload_invalid_total` | Payload invalido | `reasonCode=WHATSAPP_PAYLOAD_INVALID` | `status`, `messageType` |
| `whatsapp_read_only_payload_too_large_total` | Payload acima do limite | `reasonCode=WHATSAPP_PAYLOAD_TOO_LARGE` | `status` |
| `whatsapp_read_only_pii_masking_violation_total` | Violacao de masking ou `piiMasked != true` | verificacao do export serializado | nenhuma dimensao com PII |
| `whatsapp_read_only_side_effects_violation_total` | `sideEffects != 0` | `evidenceBundle.sideEffects`, `bundleExport.sideEffects` | `reasonCode`, `status` |
| `whatsapp_read_only_bundle_export_compat_failure_total` | Drift do contrato `whatsapp.read_only.bundle_export.v1` | gate/validador de compatibilidade | `version`, `reasonCode` |
| `whatsapp_read_only_provider_external_call_total` | Chamada externa de provider observada | deve permanecer zero nesta etapa | `provider` |
| `whatsapp_read_only_mutation_external_side_effect_total` | Mutacao ou side effect externo observado | deve permanecer zero nesta etapa | `reasonCode` |
| `whatsapp_read_only_fail_closed_coverage_rate` | Eventos invalidos bloqueados / eventos invalidos totais | matriz de negative paths | `reasonCode` |

## SLO baseline inicial

| SLO | Baseline inicial | Severidade se violado |
| --- | --- | --- |
| `sideEffects violation` | `0` | WA-RO-P0 |
| `PII leakage` | `0` | WA-RO-P0 |
| `critical action execution` | `0` | WA-RO-P0 |
| `provider external call` | `0` | WA-RO-P0 |
| `mutation external side effect` | `0` | WA-RO-P0 |
| `bundle export compatibility failures` | `0` | WA-RO-P2 |
| `fail-closed coverage for invalid events` | `100%` | WA-RO-P1 |
| `replay accepted after detection` | `0` | WA-RO-P1 |
| `duplicate event accepted after detection` | `0` | WA-RO-P1 |
| `binding bypass` | `0` | WA-RO-P1 |
| `entitlement bypass` | `0` | WA-RO-P1 |

## Thresholds

| Condicao | Threshold | Incidente |
| --- | --- | --- |
| Qualquer `sideEffects != 0` | `> 0` em qualquer janela | WA-RO-P0 |
| Qualquer PII/sensivel no export, log ou metrica | `> 0` em qualquer janela | WA-RO-P0 |
| Qualquer acao critica executada | `> 0` em qualquer janela | WA-RO-P0 |
| Qualquer chamada externa a provider real | `> 0` antes de autorizacao futura | WA-RO-P0 |
| Qualquer mutacao externa | `> 0` em qualquer janela | WA-RO-P0 |
| Evento invalido aceito | `> 0` em qualquer janela | WA-RO-P1 |
| Replay aceito depois de detectado | `> 0` em qualquer janela | WA-RO-P1 |
| Evento duplicado aceito depois de detectado | `> 0` em qualquer janela | WA-RO-P1 |
| Binding ausente aceito | `> 0` em qualquer janela | WA-RO-P1 |
| Entitlement ausente aceito | `> 0` em qualquer janela | WA-RO-P1 |
| Drift do keyset do `bundleExport` | `> 0` por gate | WA-RO-P2 |
| `piiMasked != true` | `> 0` em qualquer export | WA-RO-P2 |
| Runbook/evidencia sem owner ou sem status | `> 0` por auditoria | WA-RO-P3 |

## Incident mapping

| Grupo de metricas | ReasonCodes principais | Classe F2.9 |
| --- | --- | --- |
| Side effects, PII, provider externo, mutacao externa | `sideEffects != 0`, PII detectada, chamada externa, mutacao executada | WA-RO-P0 |
| Fail-closed quebrado | evento invalido aceito, `WHATSAPP_SIGNATURE_INVALID`, `WHATSAPP_TIMESTAMP_OUT_OF_WINDOW`, `WHATSAPP_REPLAY_DETECTED`, `WHATSAPP_EVENT_DUPLICATE`, `WHATSAPP_PHONE_NOT_BOUND`, `ENTITLEMENT_REQUIRED` aceitos indevidamente | WA-RO-P1 |
| Contrato/export | `bundle_export_compat_failure`, `piiMasked != true`, keyset extra ou `version` divergente | WA-RO-P2 |
| DocOps | evidencia ausente, runbook sem owner, thresholds nao conectados | WA-RO-P3 |

## Runbook linkage

Este baseline operacional se conecta ao runbook F2.9:

- WA-RO-P0 e WA-RO-P1 seguem a politica de disable imediato.
- WA-RO-P2 segue rollback documental/contratual e reexecucao dos gates de compatibilidade.
- WA-RO-P3 exige correcao DocOps antes de qualquer promocao.
- Toda investigacao deve preservar logs sanitizados, `eventId`, `reasonCode`, `decisionClass`, `status`, `sideEffects` e timestamps.

Arquivo relacionado:

- `docs/ops/whatsapp-read-only-adapter-operational-runbook.md`

## PII/sensitive data policy

Metricas, logs, evidencias e dashboards futuros devem conter apenas identificadores e campos sanitizados. A politica minima e:

1. nunca emitir telefone bruto;
2. nunca emitir `fromPhoneHash`;
3. nunca emitir texto bruto da mensagem;
4. nunca emitir `rawPayloadRef`;
5. nunca emitir assinatura, secret, token, cookie ou Authorization;
6. exigir `piiMasked=true` em todo `bundleExport`;
7. classificar qualquer violacao como WA-RO-P0 ou WA-RO-P2 conforme impacto.

## Side-effect zero policy

Enquanto o adapter estiver em read-only controlado:

- `sideEffects` deve ser sempre `0`;
- `provider_external_call_total` deve ser sempre `0`;
- `mutation_external_side_effect_total` deve ser sempre `0`;
- `critical_action_execution` deve ser sempre `0`;
- `lead.create` e `lead.discard` devem continuar bloqueados;
- qualquer divergencia exige disable imediato quando houver risco operacional.

## Provider/mutation boundary

Este baseline nao instala provider real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio e nao executa mutacoes.

Qualquer futura mudanca dessa fronteira exige etapa separada, decisao explicita, contrato versionado, evidencia real e revisao dos SLOs.

## Status

Status: proposta/parcial evidenciada documentalmente.
