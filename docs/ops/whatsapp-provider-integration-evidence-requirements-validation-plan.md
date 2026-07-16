# WhatsApp Provider Integration — Evidence Requirements / Validation Plan

## Objetivo

Este documento cria os Evidence Requirements e o Validation Plan da F3.3 para uma avaliacao futura hipotetica de provider WhatsApp em modo estritamente design-only.

F3.3 e um artefato documental. Ele nao autoriza selecao de provider, nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo, nao cria mutacoes e nao altera o estado `provider integration blocked`.

## Evidence Requirements

Os requisitos de evidencia definem quais provas documentais seriam necessarias para sustentar uma futura revisao de design, sem selecionar provider e sem autorizar qualquer execucao.

Toda evidencia deve ser fisica, indexavel quando aplicavel, rastreavel por owner e validada por metodo explicito. Evidencia ausente, incompleta, sem owner ou sem acceptance criteria mantem a avaliacao em `blocked`.

| EvidenceId | EvidenceType | RequiredFor | Owner minimo | ValidationMethod | Status inicial | AcceptanceCriteria |
| --- | --- | --- | --- | --- | --- | --- |
| `F3-EV-SEC-001` | `security evidence` | Security posture e abuse case coverage | Security; Backend/API | `security checklist review`; `threat model review` | `missing` | Security checklist completo, threat model delta revisado e fail-closed preservado. |
| `F3-EV-PRI-001` | `privacy/compliance evidence` | Privacy posture e compliance boundary | Privacy/Compliance; Security; DocOps | `privacy review`; `document review` | `missing` | Data map, retention, masking, redaction e proibicao de PII/sensiveis brutos documentados. |
| `F3-EV-CON-001` | `contract compatibility evidence` | Compatibilidade com contratos read-only | Backend/API; Platform governance | `contract review` | `missing` | Schema mapping, versioning e compatibility gate sem quebra de contrato congelado. |
| `F3-EV-SIG-001` | `signature/event verification evidence` | Assinatura e verificacao de evento | Security; Backend/API | `security checklist review`; `contract review` | `missing` | Algoritmo, canonical string, headers, payload coverage e fail-closed matrix documentados. |
| `F3-EV-RPL-001` | `replay/idempotency evidence` | Replay guard, duplicidade e idempotencia | Backend/API; Security | `contract review`; `synthetic dry-run plan review` | `missing` | Timestamp window, eventId uniqueness, duplicate/replay response e idempotencia definidos. |
| `F3-EV-SEC-002` | `secret management evidence` | Secret boundary futuro | Security; Platform governance | `security checklist review`; `document review` | `missing` | Storage, rotation, revocation, redaction e segregacao por ambiente documentados sem secret produtivo. |
| `F3-EV-OBS-001` | `observability/SLO evidence` | Observability e SLO readiness | Platform governance; Backend/API | `observability/SLO review` | `missing` | Metricas, thresholds, incident mapping e zero-SLOs definidos sem observability real obrigatoria. |
| `F3-EV-RBK-001` | `rollback/disable evidence` | Rollback e disable readiness | Platform governance; Backend/API; Security | `rollback plan review` | `missing` | Disable plan, rollback steps, stop criteria, owners e escalation documentados. |
| `F3-EV-TEN-001` | `tenant/workspace/scope evidence` | Tenant, workspace, scope e entitlement safety | Backend/API; Platform governance | `contract review`; `document review` | `missing` | Mapping, entitlement proof e fail-closed matrix documentados. |
| `F3-EV-PII-001` | `PII/sensitive data handling evidence` | Evidencia segura e masking | Privacy/Compliance; Security; DocOps | `privacy review`; `evidence index validation` | `missing` | Ausencia de telefone bruto, texto bruto, payload bruto, assinatura, token, cookie, Authorization ou secret. |
| `F3-EV-OPS-001` | `operational support evidence` | Suporte operacional e escalacao | Product/Platform; Platform governance | `document review` | `missing` | Owners, escalation, incident handoff e runbook delta definidos. |
| `F3-EV-COM-001` | `cost/commercial evidence` | Risco comercial e custo | Product/Platform; Executive sponsor | `document review` | `missing` | Pricing, quotas, rate limits, risco comercial e owner documentados. |

## Validation Plan

O plano de validacao define como as evidencias seriam avaliadas antes de qualquer revisao futura de design. Ele nao executa provider, nao cria teste com provider real, nao cria endpoint e nao altera runtime.

Validacao em F3.3 permite somente concluir se uma evidencia esta pronta para revisao documental. O resultado maximo permitido e `accepted-for-design-review-only`.

## Tipos minimos de evidencia

- `security evidence`
- `privacy/compliance evidence`
- `contract compatibility evidence`
- `signature/event verification evidence`
- `replay/idempotency evidence`
- `secret management evidence`
- `observability/SLO evidence`
- `rollback/disable evidence`
- `tenant/workspace/scope evidence`
- `PII/sensitive data handling evidence`
- `operational support evidence`
- `cost/commercial evidence`

## Metodos de validacao

- `document review`
- `contract review`
- `threat model review`
- `privacy review`
- `security checklist review`
- `synthetic dry-run plan review`
- `rollback plan review`
- `observability/SLO review`
- `evidence index validation`
- `docs link integrity validation`
- `isolation diff validation`

## Campos obrigatorios por evidencia

- `evidenceId`
- `evidenceType`
- `description`
- `owner`
- `requiredFor`
- `validationMethod`
- `acceptanceCriteria`
- `evidenceRefs`
- `status`
- `blockers`
- `decisionRefs`

## Estados de evidencia

- `missing`: evidencia ausente.
- `draft`: evidencia em elaboracao documental.
- `in-review`: evidencia em revisao documental.
- `accepted-for-design-review-only`: evidencia aceita apenas para revisao de design.
- `blocked`: evidencia bloqueada por gap, owner ausente, criterio incompleto ou boundary.
- `rejected`: evidencia rejeitada documentalmente.

Nenhum estado autoriza selecao de provider, implementacao, execucao, producao, secret produtivo, webhook produtivo, mutacao ou side effect.

## Blocking validation gaps

Uma evidencia ou opcao futura permanece `blocked` se houver qualquer gap abaixo:

- evidencia ausente ou sem arquivo fisico quando aplicavel;
- owner minimo ausente;
- acceptance criteria incompletos;
- validation method ausente;
- evidenceRefs ausentes;
- decisionRefs ausentes;
- security review ausente;
- privacy/compliance review ausente;
- contract compatibility nao provada;
- signature/event verification incompleta;
- replay/idempotency incompleto;
- secret management sem rotation, revocation, redaction ou environment boundary;
- observability/SLO sem baseline, thresholds ou incident mapping;
- rollback/disable ausente;
- tenant/workspace/scope safety nao provada;
- PII/sensitive data handling nao provado;
- docs link integrity ou evidence index validation falhando;
- isolation diff indicando alteracoes em `.github/workflows`, `release.yml`, apps, packages ou scripts;
- qualquer dependencia de provider real, secret produtivo, webhook produtivo, mutacao, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## ReasonCodes

- `EVIDENCE_REQUIREMENTS_ONLY`
- `VALIDATION_PLAN_ONLY`
- `EVIDENCE_REQUIREMENTS_NOT_MET`
- `VALIDATION_EVIDENCE_MISSING`
- `VALIDATION_OWNER_MISSING`
- `VALIDATION_CRITERIA_INCOMPLETE`
- `VALIDATION_PLAN_NOT_PROVIDER_SELECTION`
- `VALIDATION_PLAN_NOT_IMPLEMENTATION_AUTHORIZATION`
- `VALIDATION_PLAN_NOT_PRODUCTION_AUTHORIZATION`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`

## Provider integration boundary

Provider integration permanece `blocked`. F3.3 nao cria provider real, nao seleciona provider, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Design-only continuity

F3.3 preserva o Design-Only Charter F3.0 e continua as cadeias F3.1 e F3.2.

F2.22 No-Go Ledger, F2.23 Final Readiness Freeze, F2.25 Non-Implementation Boundary e F2.26 governance baseline permanecem ativos. O validation plan F3.3 nao levanta hold, freeze ou boundary.

## Nao-autorizacao de selecao de provider

F3.3 nao seleciona provider real. Requisitos de evidencia e metodos de validacao nao podem ser usados como decisao de selecao, procurement, contrato, configuracao ou integracao.

## Nao-autorizacao de implementacao

F3.3 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F3.3 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F3.3 nao e autorizacao de producao. Evidence requirements e validation plan nao autorizam WhatsApp operacional, provider integrado, provider selecionado, secret produtivo, webhook produtivo, mutacoes ou side effects.

## Status final

Status: proposta/parcial evidenciada documentalmente.
