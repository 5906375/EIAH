# WhatsApp Provider Integration — Decision Matrix / Options Evaluation Criteria

## Objetivo

Este documento cria a Decision Matrix e os Options Evaluation Criteria da F3.2 para uma avaliacao futura hipotetica de opcoes de provider WhatsApp.

F3.2 e um artefato documental de design-only. Ele nao autoriza selecao de provider, nao autoriza implementacao, nao autoriza execucao, nao autoriza producao, nao integra provider real, nao provisiona secret produtivo, nao habilita webhook produtivo, nao cria mutacoes e nao altera o estado `provider integration blocked`.

## Decision Matrix

A matriz define criterios para avaliar opcoes futuras sem selecionar ou aprovar qualquer provider.

Cada opcao avaliada deve ser tratada como hipotetica ate existir fase posterior separada, com pre-condicao propria, approvals explicitos, evidencia nova e autorizacao formal. Estados como `eligible-for-design-review-only` significam apenas que a opcao pode ser revisada documentalmente; nao significam selecao, implementacao ou execucao.

| OptionId | OptionName | Categoria | EvaluationStatus | DecisionState | Owner minimo | RequiredEvidence | BlockingCriteria |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `F3-OPT-SEC-001` | Provider event security posture | `security` | `not-evaluated` | `blocked` | Security; Backend/API | Security review, threat model delta, abuse case coverage | Falta de assinatura verificavel, bypass de fail-closed ou security approval ausente. |
| `F3-OPT-PRI-001` | Privacy and compliance posture | `privacy/compliance` | `not-evaluated` | `blocked` | Privacy/Compliance; Security; DocOps | Data map, retention policy, masking proof, compliance review | PII/sensiveis em logs, metricas, bundles ou evidencias. |
| `F3-OPT-CON-001` | Contract compatibility | `contract compatibility` | `not-evaluated` | `blocked` | Backend/API; Platform governance | Schema mapping, versioning policy, compatibility gate | Quebra do contrato read-only congelado ou bundle export. |
| `F3-OPT-EVT-001` | Event verification model | `event verification` | `not-evaluated` | `blocked` | Security; Backend/API | Signature algorithm, canonical string, header/payload coverage | Verificacao real ausente, assinatura fraca ou fallback permissivo. |
| `F3-OPT-RPL-001` | Replay and idempotency controls | `replay/idempotency` | `not-evaluated` | `blocked` | Backend/API; Security | Timestamp window, eventId uniqueness, duplicate/replay response matrix | Replay aceito, duplicidade nao bloqueada ou idempotencia nao provada. |
| `F3-OPT-SEC-002` | Secret management model | `secret management` | `not-evaluated` | `blocked` | Security; Platform governance | Secret storage, rotation, revocation, redaction, environment isolation | Secret produtivo solicitado, exposto, sem rotacao ou sem boundary por ambiente. |
| `F3-OPT-OBS-001` | Observability and SLO readiness | `observability/SLO` | `not-evaluated` | `blocked` | Platform governance; Backend/API | Metrics baseline, alert thresholds, incident mapping, zero-SLOs | Observability ausente, SLO incompleto ou blind spot critico. |
| `F3-OPT-RBK-001` | Rollback and disable readiness | `rollback/disable` | `not-evaluated` | `blocked` | Platform governance; Backend/API; Security | Disable plan, rollback procedure, owner coverage, stop criteria | Rollback ausente, disable nao provado ou owner ausente. |
| `F3-OPT-OPS-001` | Operational support model | `operational support` | `not-evaluated` | `deferred` | Product/Platform; Platform governance | Support ownership, escalation, incident handoff, runbook delta | Escalation ausente ou suporte operacional nao definido. |
| `F3-OPT-COM-001` | Cost and commercial risk | `cost/commercial risk` | `not-evaluated` | `deferred` | Product/Platform; Executive sponsor | Pricing model, quota/rate limits, commercial constraints | Risco comercial sem owner ou custo sem limite governado. |
| `F3-OPT-TEN-001` | Tenant/workspace/scope safety | `tenant/workspace/scope safety` | `not-evaluated` | `blocked` | Backend/API; Platform governance | Tenant/workspace mapping, entitlement proof, scope fail-closed matrix | Confusao de tenant/workspace, bypass de entitlement ou scope ambiguo. |
| `F3-OPT-PII-001` | PII and sensitive data handling | `PII/sensitive data handling` | `not-evaluated` | `blocked` | Privacy/Compliance; Security; DocOps | Masking proof, redaction policy, evidence safety review | Telefone bruto, texto bruto, payload bruto, assinatura, token, cookie, Authorization ou secret serializado. |
| `F3-OPT-IMP-001` | Implementation complexity | `implementation complexity` | `not-evaluated` | `deferred` | Backend/API; Platform governance | Complexity estimate, blast radius, dependency map | Exige alteracao em runtime, engine, launcher, workflows, apps, packages ou scripts sem fase autorizada. |

## Options Evaluation Criteria

Uma opcao futura so pode avancar para `eligible-for-design-review-only` quando todos os criterios abaixo estiverem documentados:

- evidencia requerida preenchida e indexavel;
- owners minimos nomeados;
- riscos e mitigacoes documentados;
- blockers ausentes ou explicitamente tratados como bloqueantes;
- security criteria satisfeitos documentalmente;
- privacy/compliance criteria satisfeitos documentalmente;
- rollback/disable criteria definidos;
- observability/SLO criteria definidos;
- contract compatibility preservada;
- provider integration boundary preservado;
- ausencia de selecao de provider real;
- ausencia de implementacao, execucao e autorizacao produtiva.

Mesmo quando todos esses criterios forem atendidos, o resultado maximo permitido em F3.2 e `eligible-for-design-review-only`.

## Categorias minimas

- `security`
- `privacy/compliance`
- `contract compatibility`
- `event verification`
- `replay/idempotency`
- `secret management`
- `observability/SLO`
- `rollback/disable`
- `operational support`
- `cost/commercial risk`
- `tenant/workspace/scope safety`
- `PII/sensitive data handling`
- `implementation complexity`

## Campos obrigatorios por opcao

- `optionId`
- `optionName`
- `category`
- `description`
- `evaluationStatus`
- `owner`
- `requiredEvidence`
- `blockingCriteria`
- `risks`
- `mitigations`
- `decisionState`
- `decisionRefs`

## Decision states

- `not-evaluated`: opcao ainda nao avaliada.
- `in-review`: opcao em revisao documental, sem selecao.
- `blocked`: opcao bloqueada por criterio, evidencia, approval ou boundary.
- `deferred`: opcao adiada para fase futura, sem autorizacao.
- `eligible-for-design-review-only`: opcao apta somente a revisao documental futura.
- `rejected`: opcao rejeitada documentalmente, sem selecao ou execucao.

Nenhum decision state autoriza selecao de provider, implementacao, execucao, producao, secret produtivo, webhook produtivo, mutacao ou side effect.

## Gates bloqueantes

Uma opcao permanece `blocked` se qualquer gate abaixo falhar:

- security criteria nao atendidos;
- privacy/compliance criteria nao atendidos;
- contract compatibility nao provada;
- event verification real nao especificada em modo fail-closed;
- replay/idempotency nao provado;
- secret management sem rotation/revocation/redaction/boundary;
- observability/SLO sem baseline, thresholds ou incident mapping;
- rollback/disable ausente;
- tenant/workspace/scope safety nao provada;
- PII/sensitive data handling nao provado;
- owner ou approval minimo ausente;
- decisionRefs ausentes;
- qualquer necessidade de provider real, secret produtivo, webhook produtivo, mutacao, acao critica ou side effect;
- qualquer necessidade de alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts fora de uma fase explicitamente autorizada.

## ReasonCodes

- `DECISION_MATRIX_ONLY`
- `OPTIONS_EVALUATION_ONLY`
- `OPTIONS_EVALUATION_INCOMPLETE`
- `OPTIONS_EVALUATION_NOT_PROVIDER_SELECTION`
- `PROVIDER_SELECTION_NOT_AUTHORIZED`
- `SECURITY_CRITERIA_NOT_MET`
- `PRIVACY_CRITERIA_NOT_MET`
- `ROLLBACK_CRITERIA_NOT_MET`
- `OBSERVABILITY_CRITERIA_NOT_MET`
- `PROVIDER_IMPLEMENTATION_STILL_BLOCKED`

## Provider integration boundary

Provider integration permanece `blocked`. F3.2 nao cria provider real, nao seleciona provider, nao usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes, nao cria `lead.create`, nao cria `lead.discard` e nao executa acao critica.

## Design-only continuity

F3.2 preserva o Design-Only Charter F3.0 e continua a cadeia F3.1 de perguntas e decisoes documentais.

F2.22 No-Go Ledger, F2.23 Final Readiness Freeze, F2.25 Non-Implementation Boundary e F2.26 governance baseline permanecem ativos. A matriz F3.2 nao levanta hold, freeze ou boundary.

## Nao-autorizacao de selecao de provider

F3.2 nao seleciona provider real. Qualquer opcao listada e apenas hipotetica e nao pode ser usada como decisao de selecao, procurement, contrato, configuracao ou integracao.

## Nao-autorizacao de implementacao

F3.2 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F3.2 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F3.2 nao e autorizacao de producao. A matriz e os criterios de avaliacao nao autorizam WhatsApp operacional, provider integrado, provider selecionado, secret produtivo, webhook produtivo, mutacoes ou side effects.

## Status final

Status: proposta/parcial evidenciada documentalmente.
