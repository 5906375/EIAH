# WhatsApp Read-Only Adapter — Promotion Readiness Matrix

## Objetivo

Definir uma matriz governada de readiness para avaliacao futura do WhatsApp Adapter read-only, sem autorizar producao, sem integrar provider real e sem alterar a fronteira read-only ja evidenciada em F2.8-F2.12.

Esta matriz organiza os estados `blocked`, `candidate` e `ready-for-review` para discussoes futuras. Nenhum estado deste documento equivale a aprovacao de producao, ativacao de provider, secret produtivo, webhook produtivo ou mutacao.

## Escopo

- Superficie controlada: `POST /api/webhooks/whatsapp/inbound`.
- Modo permitido: `read_only`.
- Contrato auditavel: `whatsapp.read_only.bundle_export.v1`.
- Papel operacional: `channel-adapter/render-only`.
- Evidencias base: F2.8, F2.9, F2.10, F2.11 e F2.12.

## Referencias canonicas

| Frente | Evidencia | Uso na matriz |
| --- | --- | --- |
| F2.8 | `ops/evidence/latest/f2-08-read-only-adapter-contract-freeze-compatibility-gate-2026-07-15.md` | Congelamento do contrato `whatsapp.read_only.bundle_export.v1`, keyset, `sideEffects=0`, `piiMasked=true` e reasonCodes protegidos. |
| F2.9 | `ops/evidence/latest/f2-09-read-only-adapter-operational-runbook-rollback-policy-2026-07-15.md` | Runbook, owners, escalation, incident classes, fail-closed e rollback/disable. |
| F2.10 | `ops/evidence/latest/f2-10-read-only-adapter-observability-metrics-slo-baseline-2026-07-15.md` | Metricas sanitizadas, SLO baseline, thresholds e incident mapping. |
| F2.11 | `ops/evidence/latest/f2-11-read-only-adapter-synthetic-healthcheck-non-provider-dry-run-2026-07-15.md` | Dry run sintetico sem provider, fixtures deterministicas e linkage com F2.10. |
| F2.12 | `ops/evidence/latest/f2-12-read-only-adapter-synthetic-healthcheck-contract-gate-2026-07-15.md` | Contract gate local do healthcheck sintetico, `providerExternalCall=0`, `mutationExternalSideEffect=0` e `criticalActionExecution=0`. |

## Estados de readiness

| Estado | Significado | Condicao de entrada | Condicao de saida |
| --- | --- | --- | --- |
| `blocked` | Nao pode ser avaliado para promocao. | Qualquer gate obrigatorio ausente, falho, stale ou sem evidencia fisica; qualquer drift de contrato; qualquer PII/sensivel; qualquer `sideEffects != 0`; qualquer provider real/secret/webhook/mutacao detectado fora de etapa aprovada. | Todos os bloqueios removidos, evidencia atualizada e checks obrigatorios verdes. |
| `candidate` | Pode ser discutido como candidato documental/read-only, sem autorizacao de producao. | F2.8-F2.12 existem, Evidence Index aponta para evidencias fisicas, runbook/observability/healthcheck/gate estao presentes e checks documentais locais passam. | Revisao formal de owners, pacote minimo de evidencias completo e nenhum bloqueio absoluto. |
| `ready-for-review` | Pode ir para revisao governada de owners para decidir uma etapa futura separada. | Todos os gates de `candidate` passam, owners/escalation/rollback estao confirmados, SLO/healthcheck/contract gate estao verdes e nao ha violacao de PII/side effects/provider/mutacao. | Decisao explicita de owners. Mesmo aprovado para revisao, nao autoriza producao nem integra provider. |

Estado atual desta matriz: `candidate` documental/read-only, limitado a proposta/parcial evidenciada documentalmente.

## Gates obrigatorios

Antes de qualquer avaliacao futura, todos os gates abaixo devem estar verdes ou bloqueiam a promocao:

1. Evidence Index aponta para evidencias fisicas F2.8-F2.12.
2. Runbook F2.9 existe, tem owners/escalation e rollback/disable.
3. Observability/SLO F2.10 existe, usa apenas campos sanitizados e preserva SLOs zero.
4. Synthetic healthcheck F2.11 existe e permanece sem provider.
5. Contract gate F2.12 passa localmente e preserva reasonCodes/status.
6. Contrato `whatsapp.read_only.bundle_export.v1` preserva keyset, version, `piiMasked=true` e `sideEffects=0`.
7. `pnpm check:evidence-index` passa.
8. `pnpm check:docs-link-integrity` passa.
9. `git diff --check` nao aponta whitespace/format drift.
10. `git diff -- .github/workflows release.yml apps packages scripts` nao mostra alteracao fora de escopo.

Quando houver qualquer alteracao futura de codigo do adapter, tambem devem passar os testes focados do webhook, `ChannelBinding`, `Replay Guard`, orphan tests e gates de compatibilidade do export.

## Bloqueios absolutos

Qualquer item abaixo mantem ou retorna a matriz para `blocked`:

- provider WhatsApp real integrado sem etapa separada;
- secret produtivo usado ou referenciado;
- webhook produtivo habilitado;
- endpoint publico novo criado sem decisao explicita;
- dashboard obrigatorio, storage externo ou ledger produtivo obrigatorio introduzido como dependencia;
- mutacao executada;
- `lead.create` ou `lead.discard` executado;
- acao critica executada;
- `providerExternalCall > 0`;
- `mutationExternalSideEffect > 0`;
- `criticalActionExecution > 0`;
- `sideEffects != 0`;
- PII/sensivel em export, log, metrica, evidencia ou resultado serializado;
- `piiMasked != true`;
- drift do contrato `whatsapp.read_only.bundle_export.v1`;
- fail-open em assinatura, replay, duplicidade, binding, tenant, workspace, entitlement, sessao ou read-only mode;
- owner/escalation/rollback ausente.

## Evidencias minimas

Pacote minimo para `candidate`:

- evidencia F2.8 de contract freeze/compatibility gate;
- evidencia F2.9 de runbook/rollback policy;
- evidencia F2.10 de observability/SLO baseline;
- evidencia F2.11 de synthetic healthcheck/non-provider dry run;
- evidencia F2.12 de synthetic healthcheck contract gate;
- Evidence Index atualizado com caminhos fisicos;
- checks documentais verdes.

Pacote minimo para `ready-for-review`:

- todos os itens de `candidate`;
- confirmacao atual de owners/escalation/rollback;
- resultado recente do synthetic healthcheck/contract gate;
- confirmacao recente de `sideEffects=0`, `providerExternalCall=0`, `mutationExternalSideEffect=0`, `criticalActionExecution=0`;
- confirmacao recente de ausencia de PII/sensiveis;
- registro explicito de que provider real, secret produtivo, webhook produtivo e mutacoes continuam ausentes.

## Owners/escalation

Os owners e escalations seguem o runbook F2.9:

| Area | Owner primario | Escalation |
| --- | --- | --- |
| Adapter/API | Backend/API owner | Tech lead |
| Channel binding e replay guard | Platform governance owner | Tech lead |
| Evidencia e runbook | DocOps owner | Platform governance owner |
| Incidente de seguranca/PII | Security owner | Founder/Executive owner |
| Decisao de ativacao produtiva futura | Product/Platform owner | Founder/Executive owner |

Sem owner designado para a janela de avaliacao, o estado deve ser `blocked`.

## Rollback/disable requirements

Qualquer avaliacao futura deve preservar:

- WA-RO-P0 e WA-RO-P1 exigem disable imediato;
- WA-RO-P2 exige rollback documental/contratual e reexecucao dos gates;
- WA-RO-P3 exige correcao DocOps antes de nova avaliacao;
- evidencias de incidente devem registrar ambiente, owner, `eventId` sanitizado, `reasonCode`, `decisionClass`, status, `sideEffects`, PII masking, provider/mutacao boundary, decisao e checks pos-mitigacao.

## Observability/SLO requirements

SLOs que precisam permanecer verdes:

- `sideEffects violation = 0`;
- `PII leakage = 0`;
- `critical action execution = 0`;
- `provider external call = 0`;
- `mutation external side effect = 0`;
- `bundle export compatibility failures = 0`;
- `fail-closed coverage for invalid events = 100%`;
- `replay accepted after detection = 0`;
- `duplicate event accepted after detection = 0`;
- `binding bypass = 0`;
- `entitlement bypass = 0`.

Metricas, logs e evidencias so podem usar campos sanitizados de `evidenceBundle` e `bundleExport`.

## Synthetic healthcheck requirements

O healthcheck sintetico deve permanecer:

- sem provider real;
- sem secret produtivo;
- sem webhook produtivo;
- sem endpoint publico novo;
- com fixtures deterministicas e sanitizadas;
- cobrindo path `accepted_read_only`;
- cobrindo paths fail-closed;
- validando reasonCodes/status;
- validando ausencia de PII/sensiveis;
- validando `sideEffects=0`;
- validando `providerExternalCall=0`;
- validando `mutationExternalSideEffect=0`;
- validando `criticalActionExecution=0`.

## Contract compatibility requirements

O contrato `whatsapp.read_only.bundle_export.v1` deve preservar:

- keyset exato congelado em F2.8;
- `version=whatsapp.read_only.bundle_export.v1`;
- `decision`;
- `reasonCode`;
- `status`;
- `eventId`;
- `provider`;
- `messageType`;
- `tenantId`;
- `workspaceId`;
- `scope`;
- `sideEffects=0`;
- `piiMasked=true`;
- timestamps seguros;
- reasonCodes criticos exportaveis sem renomeacao.

Qualquer campo novo, remocao, renomeacao ou alteracao sem politica versionada bloqueia readiness.

## PII/sensitive data requirements

Campos proibidos em readiness, evidencia, metrica, log ou export:

- telefone bruto;
- `fromPhoneHash`;
- texto bruto da mensagem;
- `rawPayloadRef`;
- header de assinatura;
- segredo de assinatura ou secret produtivo;
- token, cookie ou Authorization;
- payload bruto de provider;
- qualquer campo fora do keyset congelado.

Qualquer violacao retorna o estado para `blocked`.

## Side-effect zero requirements

Enquanto o adapter estiver em read-only controlado:

- `sideEffects` deve ser sempre `0`;
- `providerExternalCall` deve ser sempre `0`;
- `mutationExternalSideEffect` deve ser sempre `0`;
- `criticalActionExecution` deve ser sempre `0`;
- `lead.create` e `lead.discard` devem permanecer bloqueados;
- qualquer tentativa de acao critica deve retornar fail-closed auditavel.

## Provider/mutation boundary

Esta matriz nao integra provider WhatsApp real, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

Qualquer mudanca nessa fronteira exige etapa separada, contrato versionado, evidencia real, decisao explicita de owners e nova matriz de risco.

## Status

Status: proposta/parcial evidenciada documentalmente.
