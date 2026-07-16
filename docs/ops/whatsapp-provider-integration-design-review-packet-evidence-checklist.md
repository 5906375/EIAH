# WhatsApp Provider Integration — Design Review Packet / Evidence Checklist

## Objetivo

Este documento cria o Design Review Packet e o Evidence Checklist da F3.4 para uma revisao futura hipotetica de design de provider WhatsApp.

F3.4 e um artefato documental. Ele nao autoriza selecao de provider, nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo, nao cria mutacoes e nao altera o estado `provider integration blocked`.

## Design Review Packet

O Design Review Packet organiza materiais de pre-read, reviewers requeridos, checklist por categoria, acceptance states, blocking gaps e outcomes permitidos para uma avaliacao futura de design.

O packet nao e approval de board, nao e decision record produtivo, nao e autorizacao tecnica e nao pode ser usado como selecao de provider. O resultado maximo permitido em F3.4 e `accepted-for-design-review-only`.

## Evidence Checklist

O Evidence Checklist conecta cada categoria de revisao aos requisitos de evidencia definidos em F3.3 e aos criterios de opcoes definidos em F3.2.

Todos os itens iniciam como `not-started` ou `blocked` ate haver evidencia fisica, owner, reviewer, evidenceRefs e decisionRefs suficientes. Qualquer evidencia ausente, reviewer ausente ou blocker aberto mantem o item como `blocked`.

## Required reviewers

- Security
- Privacy/Compliance, se aplicavel
- Backend/API
- Platform governance
- Product/Platform
- DocOps
- Executive sponsor, se aplicavel

Nenhuma revisao e valida se o reviewer obrigatorio da categoria estiver ausente.

## Pre-read materials

- `docs/ops/whatsapp-provider-integration-formal-phase-opening-design-only-charter.md`
- `docs/ops/whatsapp-provider-integration-design-questions-register-decision-log.md`
- `docs/ops/whatsapp-provider-integration-decision-matrix-options-evaluation-criteria.md`
- `docs/ops/whatsapp-provider-integration-evidence-requirements-validation-plan.md`
- `ops/evidence/latest/f3-03-provider-integration-evidence-requirements-validation-plan-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`
- Baseline F2.22/F2.23/F2.25/F2.26 quando a revisao tocar hold, freeze, non-implementation boundary ou governance baseline.

## Checklist por categoria

| ChecklistItemId | Category | Requirement | RequiredEvidence | Reviewer | Status | Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| `F3-DRC-SEC-001` | `security` | Confirmar threat/security posture e fail-closed. | `security evidence`; security checklist; threat model delta | Security | `not-started` | Security reviewer ou evidencia ausente. |
| `F3-DRC-PRI-001` | `privacy/compliance` | Confirmar privacy boundary, retention, masking e compliance. | `privacy/compliance evidence`; data map; privacy review | Privacy/Compliance; Security; DocOps | `not-started` | Privacy reviewer ou PII policy ausente. |
| `F3-DRC-CON-001` | `contract compatibility` | Confirmar compatibilidade com contratos read-only e bundle export. | `contract compatibility evidence`; schema mapping; compatibility gate | Backend/API; Platform governance | `not-started` | Contract review ausente ou quebra de contrato congelado. |
| `F3-DRC-SIG-001` | `signature/event verification` | Confirmar assinatura, canonical string, headers e payload coverage. | `signature/event verification evidence` | Security; Backend/API | `not-started` | Event verification incompleta ou permissiva. |
| `F3-DRC-RPL-001` | `replay/idempotency` | Confirmar timestamp window, eventId uniqueness e resposta a replay/duplicidade. | `replay/idempotency evidence` | Backend/API; Security | `not-started` | Replay/idempotency nao provado. |
| `F3-DRC-SEC-002` | `secret management` | Confirmar storage, rotation, revocation, redaction e environment boundary. | `secret management evidence` | Security; Platform governance | `not-started` | Secret produtivo solicitado, exposto ou sem boundary. |
| `F3-DRC-OBS-001` | `observability/SLO` | Confirmar metricas, thresholds, incident mapping e zero-SLOs. | `observability/SLO evidence` | Platform governance; Backend/API | `not-started` | Observability/SLO ausente ou incompleto. |
| `F3-DRC-RBK-001` | `rollback/disable` | Confirmar disable plan, rollback steps, stop criteria e owners. | `rollback/disable evidence` | Platform governance; Backend/API; Security | `not-started` | Rollback/disable ausente. |
| `F3-DRC-TEN-001` | `tenant/workspace/scope safety` | Confirmar tenant/workspace/scope, entitlement e fail-closed. | `tenant/workspace/scope evidence` | Backend/API; Platform governance | `not-started` | Tenant/workspace/scope safety nao provada. |
| `F3-DRC-PII-001` | `PII/sensitive data handling` | Confirmar ausencia de dados brutos e serializacao sensivel. | `PII/sensitive data handling evidence` | Privacy/Compliance; Security; DocOps | `not-started` | PII/sensiveis em logs, metricas, bundles ou evidencias. |
| `F3-DRC-OPS-001` | `operational support` | Confirmar owners, escalation, incident handoff e runbook delta. | `operational support evidence` | Product/Platform; Platform governance | `not-started` | Suporte operacional ou escalacao ausente. |
| `F3-DRC-COM-001` | `cost/commercial` | Confirmar pricing, quotas, rate limits e risco comercial. | `cost/commercial evidence` | Product/Platform; Executive sponsor, se aplicavel | `not-started` | Owner comercial ou limite governado ausente. |

## Campos obrigatorios do checklist

- `checklistItemId`
- `category`
- `requirement`
- `requiredEvidence`
- `reviewer`
- `status`
- `blocker`
- `evidenceRefs`
- `decisionRefs`

## Acceptance states

- `not-started`: item ainda nao revisado.
- `in-review`: item em revisao documental.
- `accepted-for-design-review-only`: item aceito apenas para revisao de design.
- `blocked`: item bloqueado por reviewer, evidencia, blocker ou boundary.
- `rejected`: item rejeitado documentalmente.

Nenhum acceptance state autoriza selecao de provider, implementacao, execucao, producao, secret produtivo, webhook produtivo, mutacao ou side effect.

## Blocking gaps

Um review item ou packet permanece `blocked` se houver qualquer gap abaixo:

- required reviewer ausente;
- required evidence ausente;
- evidenceRefs ausentes;
- decisionRefs ausentes;
- checklist item sem status;
- blocker aberto;
- security review ausente;
- privacy/compliance review ausente quando aplicavel;
- contract compatibility nao provada;
- signature/event verification incompleta;
- replay/idempotency nao provado;
- secret management sem rotation, revocation, redaction ou environment boundary;
- observability/SLO sem baseline, thresholds ou incident mapping;
- rollback/disable ausente;
- tenant/workspace/scope safety nao provada;
- PII/sensitive data handling nao provado;
- operational support ou owner ausente;
- cost/commercial risk sem owner quando aplicavel;
- Evidence Index ou docs link integrity falhando;
- isolation diff indicando alteracoes em `.github/workflows`, `release.yml`, apps, packages ou scripts;
- qualquer dependencia de provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Review outcomes

- `no-go`: revisao nao pode avancar; blockers permanecem.
- `defer`: revisao adiada para fase futura, sem autorizacao.
- `accepted-for-design-review-only`: pacote aceito apenas para revisao documental futura.

Nenhum outcome autoriza selecao de provider, implementacao, execucao ou producao.

## ReasonCodes

- `DESIGN_REVIEW_PACKET_ONLY`
- `EVIDENCE_CHECKLIST_ONLY`
- `DESIGN_REVIEW_INCOMPLETE`
- `REQUIRED_REVIEWER_MISSING`
- `REQUIRED_EVIDENCE_MISSING`
- `DESIGN_REVIEW_NOT_PROVIDER_SELECTION`
- `DESIGN_REVIEW_NOT_IMPLEMENTATION_AUTHORIZATION`
- `DESIGN_REVIEW_NOT_PRODUCTION_AUTHORIZATION`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`

## Provider integration boundary

Provider integration permanece `blocked`. F3.4 nao cria provider real, nao seleciona provider, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Design-only continuity

F3.4 preserva o Design-Only Charter F3.0 e continua as cadeias F3.1, F3.2 e F3.3.

F2.22 No-Go Ledger, F2.23 Final Readiness Freeze, F2.25 Non-Implementation Boundary e F2.26 governance baseline permanecem ativos. O Design Review Packet F3.4 nao levanta hold, freeze ou boundary.

## Nao-autorizacao de selecao de provider

F3.4 nao seleciona provider real. O packet e o checklist nao podem ser usados como decisao de selecao, procurement, contrato, configuracao ou integracao.

## Nao-autorizacao de implementacao

F3.4 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F3.4 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F3.4 nao e autorizacao de producao. Design Review Packet e Evidence Checklist nao autorizam WhatsApp operacional, provider integrado, provider selecionado, secret produtivo, webhook produtivo, mutacoes ou side effects.

## Status final

Status: proposta/parcial evidenciada documentalmente.
