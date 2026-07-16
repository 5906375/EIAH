# WhatsApp Read-Only Adapter — Promotion Decision Record Template

## Objetivo

Definir um template governado de Promotion Decision Record para uma avaliacao futura do WhatsApp Adapter read-only.

Este template nao autoriza producao, nao autoriza provider real, nao autoriza secret produtivo, nao autoriza webhook produtivo e nao autoriza mutacoes. Readiness documentada em F2.13 e qualquer decisao registrada neste template so podem produzir uma decisao administrativa de revisao futura, nunca ativacao produtiva direta.

## Escopo

- Superficie controlada: `POST /api/webhooks/whatsapp/inbound`.
- Modo permitido: `read_only`.
- Contrato auditavel: `whatsapp.read_only.bundle_export.v1`.
- Papel operacional: `channel-adapter/render-only`.
- Evidencias obrigatorias: F2.8, F2.9, F2.10, F2.11, F2.12 e F2.13.

## Nao-autorizacao produtiva

O preenchimento deste template nao significa:

- WhatsApp operacional;
- provider WhatsApp real integrado;
- secret produtivo aprovado;
- webhook produtivo habilitado;
- endpoint publico novo aprovado;
- dashboard, storage externo ou ledger produtivo obrigatorio criado;
- mutacao aprovada;
- `lead.create` ou `lead.discard` aprovado;
- acao critica aprovada;
- autorizacao de producao.

O unico estado positivo permitido e `approved-for-next-review-only`, que autoriza apenas uma proxima revisao governada em etapa separada.

## Campos obrigatorios

Todo Promotion Decision Record deve preencher todos os campos abaixo. Campo ausente torna a decisao `invalid` com `reasonCode=PROMOTION_DECISION_INCOMPLETE`.

| Campo | Obrigatorio | Descricao | Regra fail-closed |
| --- | --- | --- | --- |
| `decisionId` | Sim | Identificador unico do registro, formato recomendado `wa-ro-pdr-YYYYMMDD-NNN`. | Ausente ou duplicado invalida o registro. |
| `date` | Sim | Data UTC da decisao. | Ausente invalida o registro. |
| `requester` | Sim | Pessoa/time solicitante. | Ausente invalida o registro. |
| `owners` | Sim | Owners exigidos por F2.9/F2.13. | Owner ausente rejeita ou invalida. |
| `tenantId` | Sim | Tenant avaliado, quando aplicavel. | Ausente ou generico invalida. |
| `workspaceId` | Sim | Workspace avaliado, quando aplicavel. | Ausente ou generico invalida. |
| `scope` | Sim | Escopo permitido, esperado `whatsapp:inbound:read_only`. | Escopo divergente rejeita. |
| `readinessState` | Sim | Estado vindo da matriz F2.13: `blocked`, `candidate` ou `ready-for-review`. | `blocked` rejeita. |
| `evidenceRefs` | Sim | Referencias F2.8-F2.13 e checks recentes. | Referencia ausente rejeita. |
| `riskAssessment` | Sim | Avaliacao de risco, bloqueios e mitigacoes. | Ausente rejeita. |
| `rollbackReference` | Sim | Link para runbook/rollback F2.9. | Ausente rejeita. |
| `disablePlan` | Sim | Plano de disable imediato. | Ausente rejeita. |
| `observabilityReference` | Sim | Link para baseline F2.10. | Ausente rejeita. |
| `sloStatus` | Sim | Status dos SLOs F2.10. | Qualquer violacao rejeita. |
| `syntheticHealthcheckStatus` | Sim | Status F2.11/F2.12. | Ausente ou falho rejeita. |
| `contractGateStatus` | Sim | Status do gate F2.8/F2.12. | Ausente ou falho rejeita. |
| `piiSensitiveSafetyStatus` | Sim | Prova de ausencia de PII/sensiveis. | Nao provado rejeita. |
| `sideEffectsStatus` | Sim | Prova de `sideEffects=0`. | Nao provado rejeita. |
| `providerBoundaryStatus` | Sim | Prova de provider real, secret produtivo, webhook produtivo e mutacoes ausentes. | Nao provado rejeita. |
| `humanApproval` | Sim | Aprovacoes humanas dos owners exigidos. | Ausente rejeita. |
| `finalDecision` | Sim | Estado final de decisao. | Fora da lista permitida invalida. |

## Estados de decisao

| Estado | Significado | Quando usar | Efeito permitido |
| --- | --- | --- | --- |
| `invalid` | Registro incompleto, malformado ou inconsistente. | Campos obrigatorios ausentes, estado final invalido ou referencias incoerentes. | Nenhum. Reabrir registro com dados completos. |
| `rejected` | Avaliacao concluida com bloqueio. | Bloqueio absoluto, SLO falho, PII, side effect, provider boundary nao provado ou owner rejeitou. | Nenhum. Corrigir bloqueios antes de nova solicitacao. |
| `deferred` | Avaliacao adiada. | Evidencia incompleta, decisao de owner pendente ou risco ainda nao mitigado. | Nenhum. Registrar pendencias e prazo de nova revisao. |
| `approved-for-next-review-only` | Registro aprovado apenas para proxima revisao governada. | Todos os campos completos, owners aprovaram, SLO/healthcheck/contract/PII/side effects/provider boundary provados. | Permite somente uma etapa futura separada de revisao. Nao autoriza producao. |

## ReasonCodes

ReasonCodes permitidos para decisoes nao aprovadas:

- `PROMOTION_DECISION_INCOMPLETE`
- `READINESS_NOT_READY`
- `EVIDENCE_MISSING`
- `OWNER_APPROVAL_MISSING`
- `ROLLBACK_REFERENCE_MISSING`
- `OBSERVABILITY_BASELINE_MISSING`
- `CONTRACT_GATE_MISSING`
- `SYNTHETIC_HEALTHCHECK_MISSING`
- `PII_SAFETY_NOT_PROVEN`
- `SIDE_EFFECT_ZERO_NOT_PROVEN`
- `PROVIDER_BOUNDARY_NOT_PROVEN`

Um registro pode listar mais de um reasonCode. Na duvida, usar o reasonCode mais restritivo e manter `finalDecision` como `rejected` ou `deferred`.

## Evidencias F2.8-F2.13 requeridas

Todo registro deve referenciar:

| Frente | Referencia obrigatoria | Prova exigida |
| --- | --- | --- |
| F2.8 | `ops/evidence/latest/f2-08-read-only-adapter-contract-freeze-compatibility-gate-2026-07-15.md` | Contract freeze, keyset, `sideEffects=0`, `piiMasked=true`, reasonCodes protegidos. |
| F2.9 | `ops/evidence/latest/f2-09-read-only-adapter-operational-runbook-rollback-policy-2026-07-15.md` | Runbook, owners, escalation, rollback/disable e incident classes. |
| F2.10 | `ops/evidence/latest/f2-10-read-only-adapter-observability-metrics-slo-baseline-2026-07-15.md` | Observability/SLO baseline, thresholds e incident mapping. |
| F2.11 | `ops/evidence/latest/f2-11-read-only-adapter-synthetic-healthcheck-non-provider-dry-run-2026-07-15.md` | Synthetic healthcheck sem provider e fixtures sanitizadas. |
| F2.12 | `ops/evidence/latest/f2-12-read-only-adapter-synthetic-healthcheck-contract-gate-2026-07-15.md` | Contract gate local, `providerExternalCall=0`, `mutationExternalSideEffect=0`, `criticalActionExecution=0`. |
| F2.13 | `ops/evidence/latest/f2-13-read-only-adapter-promotion-readiness-matrix-2026-07-15.md` | Readiness matrix, estados, gates, bloqueios absolutos e evidencias minimas. |

## Owners e human approval

Owners herdados de F2.9/F2.13:

| Area | Owner primario | Escalation |
| --- | --- | --- |
| Adapter/API | Backend/API owner | Tech lead |
| Channel binding e replay guard | Platform governance owner | Tech lead |
| Evidencia e runbook | DocOps owner | Platform governance owner |
| Incidente de seguranca/PII | Security owner | Founder/Executive owner |
| Decisao de ativacao produtiva futura | Product/Platform owner | Founder/Executive owner |

`humanApproval` deve registrar:

- owner;
- papel;
- decisao;
- data UTC;
- escopo aprovado;
- restricoes;
- confirmacao de que a decisao nao autoriza producao.

Sem aprovacao humana exigida, `finalDecision` deve ser `rejected` ou `deferred` com `reasonCode=OWNER_APPROVAL_MISSING`.

## Rollback/disable requirements

Todo registro deve apontar para `docs/ops/whatsapp-read-only-adapter-operational-runbook.md` e declarar:

- plano de disable imediato para WA-RO-P0/WA-RO-P1;
- rollback documental/contratual para WA-RO-P2;
- correcao DocOps para WA-RO-P3;
- evidencia minima por incidente;
- confirmacao de que nenhum provider real, secret produtivo, mutacao ou side effect foi ativado.

## Observability/SLO requirements

`sloStatus` deve cobrir:

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

Qualquer SLO nao provado rejeita o registro.

## Synthetic healthcheck requirements

`syntheticHealthcheckStatus` deve confirmar:

- execucao ou referencia recente do dry run F2.11/F2.12;
- fixtures deterministicas e sanitizadas;
- path `accepted_read_only`;
- paths fail-closed;
- reasonCodes/status;
- ausencia de PII/sensiveis;
- `sideEffects=0`;
- `providerExternalCall=0`;
- `mutationExternalSideEffect=0`;
- `criticalActionExecution=0`.

## Contract gate requirements

`contractGateStatus` deve confirmar:

- contrato `whatsapp.read_only.bundle_export.v1`;
- keyset congelado;
- `version` fixa;
- `sideEffects=0`;
- `piiMasked=true`;
- timestamps seguros;
- reasonCodes criticos preservados;
- ausencia de campos proibidos.

## PII/sensitive data requirements

`piiSensitiveSafetyStatus` deve provar ausencia de:

- telefone bruto;
- `fromPhoneHash`;
- texto bruto da mensagem;
- `rawPayloadRef`;
- header de assinatura;
- segredo de assinatura;
- secret produtivo;
- token, cookie ou Authorization;
- payload bruto de provider;
- campos fora do keyset congelado.

## Side-effect zero requirements

`sideEffectsStatus` deve provar:

- `sideEffects=0`;
- `providerExternalCall=0`;
- `mutationExternalSideEffect=0`;
- `criticalActionExecution=0`;
- `lead.create` bloqueado;
- `lead.discard` bloqueado;
- qualquer acao critica bloqueada.

## Provider/mutation boundary

`providerBoundaryStatus` deve declarar explicitamente:

- provider WhatsApp real ausente;
- secret produtivo ausente;
- webhook produtivo ausente;
- endpoint publico novo ausente;
- dashboard obrigatorio ausente;
- storage externo obrigatorio ausente;
- ledger produtivo obrigatorio ausente;
- mutacoes ausentes;
- `lead.create` nao executado;
- `lead.discard` nao executado;
- acao critica nao executada.

## Template canonico

```yaml
decisionId:
date:
requester:
owners:
  - area:
    owner:
    escalation:
    approval:
    approvedAt:
tenantId:
workspaceId:
scope: whatsapp:inbound:read_only
readinessState:
evidenceRefs:
  f2_8:
  f2_9:
  f2_10:
  f2_11:
  f2_12:
  f2_13:
riskAssessment:
  summary:
  blockers:
  residualRisks:
rollbackReference:
disablePlan:
observabilityReference:
sloStatus:
  sideEffectsViolation:
  piiLeakage:
  criticalActionExecution:
  providerExternalCall:
  mutationExternalSideEffect:
  bundleExportCompatibilityFailures:
  failClosedCoverage:
  replayAcceptedAfterDetection:
  duplicateEventAcceptedAfterDetection:
  bindingBypass:
  entitlementBypass:
syntheticHealthcheckStatus:
contractGateStatus:
piiSensitiveSafetyStatus:
sideEffectsStatus:
providerBoundaryStatus:
humanApproval:
  required: true
  approvals: []
finalDecision:
reasonCodes: []
nonProductionAuthorization:
  productionAuthorized: false
  providerRealAuthorized: false
  productiveSecretAuthorized: false
  productiveWebhookAuthorized: false
  mutationAuthorized: false
```

## Validacao minima do registro

Um registro so pode usar `approved-for-next-review-only` quando:

1. todos os campos obrigatorios estiverem preenchidos;
2. `readinessState=ready-for-review`;
3. todas as evidencias F2.8-F2.13 estiverem referenciadas;
4. owners e human approval estiverem completos;
5. rollback/disable estiverem referenciados;
6. observability/SLO estiverem verdes;
7. synthetic healthcheck e contract gate estiverem verdes;
8. PII/sensitive safety estiver provada;
9. side-effect zero estiver provado;
10. provider/mutation boundary estiver provado;
11. `nonProductionAuthorization.*` permanecer `false`.

## Status

Status: proposta/parcial evidenciada documentalmente.
