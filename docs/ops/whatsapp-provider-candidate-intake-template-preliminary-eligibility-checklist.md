# WhatsApp Provider Selection — Provider Candidate Intake Template / Preliminary Eligibility Checklist

## Objetivo

Este documento cria o Provider Candidate Intake Template e o Preliminary Eligibility Checklist da F4.1 para uma avaliacao futura hipotetica de candidatos a provider WhatsApp em modo selection-only.

F4.1 e um artefato documental. Ele nao autoriza selecao final de provider, nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, nao seleciona provider real, nao integra provider WhatsApp real, nao provisiona secret produtivo, nao habilita webhook produtivo, nao cria mutacoes e nao altera o estado `provider integration blocked`.

## Provider Candidate Intake Template

O intake template define os campos minimos para registrar um candidato hipotetico a provider em uma fase selection-only.

O template nao e decisao de selecao, nao e procurement, nao e contrato, nao e configuracao tecnica e nao pode ser usado como autorizacao para implementar ou operar provider.

```yaml
candidateId: F4-CAND-YYYY-NNN
providerName: TBD
providerType: official|aggregator|partner|other
officialWebsite: TBD
jurisdiction: TBD
commercialContact: TBD
technicalContact: TBD
securityContact: TBD
supportedAPIs: []
webhookCapabilities: TBD
signatureVerification: TBD
replayProtection: TBD
idempotencySupport: TBD
secretManagementModel: TBD
dataResidency: TBD
PIIHandling: TBD
complianceClaims: []
SLOClaims: []
rollbackDisableSupport: TBD
observabilitySupport: TBD
tenantWorkspaceScopeSupport: TBD
knownLimitations: []
requiredEvidenceRefs: []
intakeOwner: TBD
reviewStatus: not-submitted|incomplete|in-review|blocked|eligible-for-selection-review-only|rejected
```

## Campos obrigatorios do candidato

Todo candidato deve conter:

- `candidateId`
- `providerName`
- `providerType`
- `officialWebsite`
- `jurisdiction`
- `commercialContact`
- `technicalContact`
- `securityContact`
- `supportedAPIs`
- `webhookCapabilities`
- `signatureVerification`
- `replayProtection`
- `idempotencySupport`
- `secretManagementModel`
- `dataResidency`
- `PIIHandling`
- `complianceClaims`
- `SLOClaims`
- `rollbackDisableSupport`
- `observabilitySupport`
- `tenantWorkspaceScopeSupport`
- `knownLimitations`
- `requiredEvidenceRefs`
- `intakeOwner`
- `reviewStatus`

Campo ausente, vazio quando obrigatorio, sem owner ou sem evidencia requerida mantem o intake em `incomplete` ou `blocked`.

## Preliminary Eligibility Checklist

O Preliminary Eligibility Checklist organiza a avaliacao documental minima por categoria. O resultado maximo permitido e `eligible-for-selection-review-only`.

| Category | Required check | Required evidence | Default status | Blocker |
| --- | --- | --- | --- | --- |
| `security` | Assinatura, threat posture, security contact e fail-closed. | Security docs; signature model; security owner | `blocked` | `CANDIDATE_SECURITY_GAP` |
| `privacy/compliance` | Data map, retention, masking, compliance claims e jurisdiction. | Privacy docs; compliance claims; data residency | `blocked` | `CANDIDATE_PRIVACY_GAP` |
| `contract compatibility` | Compatibilidade com envelope, bundle export e contratos read-only. | API docs; schema mapping; versioning notes | `blocked` | `CANDIDATE_EVIDENCE_MISSING` |
| `webhook/event model` | Webhook capabilities, event types, signature headers e payload coverage. | Webhook docs; event model; delivery semantics | `blocked` | `CANDIDATE_EVIDENCE_MISSING` |
| `replay/idempotency` | Replay protection, timestamp, eventId uniqueness e idempotency support. | Replay/idempotency docs | `blocked` | `CANDIDATE_EVIDENCE_MISSING` |
| `secret management` | Secret storage, rotation, revocation, redaction e environment boundary. | Secret management docs | `blocked` | `CANDIDATE_SECURITY_GAP` |
| `observability/SLO` | Metrics, logs, delivery status, rate limits, SLO claims e alertability. | SLO docs; observability docs | `blocked` | `CANDIDATE_EVIDENCE_MISSING` |
| `rollback/disable` | Disable path, webhook pause, credential revocation e rollback support. | Rollback/disable docs | `blocked` | `CANDIDATE_ROLLBACK_GAP` |
| `tenant/workspace/scope safety` | Tenant/workspace mapping, account boundaries e entitlement support. | Scope docs; account model | `blocked` | `CANDIDATE_EVIDENCE_MISSING` |
| `PII/sensitive data handling` | PII masking, retention, redaction, data export e no raw sensitive evidence. | PII policy; data handling docs | `blocked` | `CANDIDATE_PRIVACY_GAP` |
| `operational support` | Support model, incident path, support contacts and escalation. | Support docs; operational contacts | `blocked` | `CANDIDATE_OWNER_MISSING` |
| `commercial/cost` | Pricing, quotas, rate limits, contract constraints and cost owner. | Commercial docs; rate limit docs | `blocked` | `CANDIDATE_OWNER_MISSING` |

## Checklist por categoria

- `security`
- `privacy/compliance`
- `contract compatibility`
- `webhook/event model`
- `replay/idempotency`
- `secret management`
- `observability/SLO`
- `rollback/disable`
- `tenant/workspace/scope safety`
- `PII/sensitive data handling`
- `operational support`
- `commercial/cost`

## Status de intake

- `not-submitted`: candidato ainda nao submetido.
- `incomplete`: campos obrigatorios, owner ou evidencia ausentes.
- `in-review`: intake em revisao documental.
- `blocked`: algum gate preliminar falhou ou boundary foi violado.
- `eligible-for-selection-review-only`: candidato pode seguir apenas para revisao selection-only, sem selecao final.
- `rejected`: candidato rejeitado documentalmente, sem selecao ou execucao.

Nenhum status de intake autoriza selecao final, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacao ou side effect.

## Gates preliminares

Um candidato permanece `blocked` ou `incomplete` se qualquer gate abaixo falhar:

- campos obrigatorios ausentes;
- `intakeOwner` ausente;
- `requiredEvidenceRefs` ausentes;
- security contact ausente;
- commercial, technical ou security contact ausente;
- official website ou jurisdiction ausente;
- signature verification nao documentada;
- replay protection ou idempotency support nao documentado;
- secret management model ausente;
- PII handling ou privacy/compliance claims ausentes;
- rollback/disable support ausente;
- observability/SLO support ausente;
- tenant/workspace/scope support ausente;
- evidencia de contract compatibility ausente;
- Evidence Index ou docs link integrity falhando;
- isolation diff indicando alteracoes em `.github/workflows`, `release.yml`, apps, packages ou scripts;
- qualquer dependencia de provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## ReasonCodes

- `CANDIDATE_INTAKE_TEMPLATE_ONLY`
- `PRELIMINARY_ELIGIBILITY_CHECKLIST_ONLY`
- `CANDIDATE_INTAKE_INCOMPLETE`
- `CANDIDATE_EVIDENCE_MISSING`
- `CANDIDATE_OWNER_MISSING`
- `CANDIDATE_SECURITY_GAP`
- `CANDIDATE_PRIVACY_GAP`
- `CANDIDATE_ROLLBACK_GAP`
- `CANDIDATE_ELIGIBILITY_NOT_PROVIDER_SELECTION`
- `PROVIDER_FINAL_SELECTION_NOT_AUTHORIZED`

## Provider selection boundary

Provider final selection permanece `not authorized`. F4.1 nao seleciona provider, nao recomenda provider como final, nao aprova procurement, nao cria contrato, nao cria configuracao e nao permite interpretar intake ou preliminary eligibility como selecao implicita.

## Provider integration boundary

Provider integration permanece `blocked`. F4.1 nao cria provider, nao integra provider real, nao cria webhook, nao provisiona secret, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Selection-only continuity

F4.0 Selection-Only Charter permanece ativo. F4.1 apenas adiciona o template de intake e checklist preliminar para candidatos, preservando F3.6 pre-selection boundary, F3.5 No-Go Decision Record e F2.26 governance closure.

## Nao-autorizacao de selecao final de provider

F4.1 nao autoriza selecao final de provider. O intake e o checklist apenas permitem organizar informacoes e elegibilidade preliminar documental.

## Nao-autorizacao de implementacao

F4.1 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F4.1 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F4.1 nao e autorizacao de producao. Candidate intake, preliminary eligibility checklist, F4.0 charter, F3.6 boundary ou F3.5 No-Go Decision Record nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Status final

Status: proposta/parcial evidenciada documentalmente.
