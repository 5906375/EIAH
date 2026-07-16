# F3.3 — Provider Integration Evidence Requirements / Validation Plan — 2026-07-15

## Resumo executivo

Foi criado o Evidence Requirements / Validation Plan da F3.3 para definir evidencias minimas, metodos de validacao, campos obrigatorios, estados e gaps bloqueantes de uma futura avaliacao hipotetica de provider WhatsApp.

F3.3 nao autoriza selecao de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacoes ou side effects. Provider integration permanece `blocked` e o Design-Only Charter F3.0 permanece ativo.

## Pré-condição F3.2

Pre-condicao comprovada antes das alteracoes:

- F3.2 mergeada em `main` no commit `968e4f6581baba14d7a997b0e7f46774babede6e`.
- `origin/main` aponta para `968e4f6581baba14d7a997b0e7f46774babede6e`.
- `CI Monorepo`: `completed success`, run `29519326695`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29519326673`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/01793ed4-a6e8-41c8-b470-8105eb111861/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-decision-matrix-options-evaluation-criteria.md`
- `docs/ops/whatsapp-provider-integration-design-questions-register-decision-log.md`
- `docs/ops/whatsapp-provider-integration-formal-phase-opening-design-only-charter.md`
- `docs/ops/whatsapp-provider-integration-governance-closure-end-of-track-summary.md`
- `ops/evidence/latest/f3-02-provider-integration-decision-matrix-options-evaluation-criteria-2026-07-15.md`

## Problema resolvido

F3.2 definiu uma matriz de decisao e criterios de avaliacao de opcoes, mas ainda faltava padronizar quais evidencias seriam exigidas e como seriam validadas.

F3.3 resolve essa lacuna com requisitos de evidencia, metodos de validacao, campos obrigatorios, estados, blocking validation gaps e reasonCodes, mantendo tudo em design-only.

## Evidence Requirements

Os requisitos foram criados em `docs/ops/whatsapp-provider-integration-evidence-requirements-validation-plan.md`.

Eles cobrem security, privacy/compliance, contract compatibility, signature/event verification, replay/idempotency, secret management, observability/SLO, rollback/disable, tenant/workspace/scope, PII/sensitive data handling, operational support e cost/commercial.

Toda evidencia exige owner minimo, metodo de validacao, acceptance criteria, evidenceRefs, status, blockers e decisionRefs.

## Validation Plan

O plano de validacao define revisoes documentais e checks de integridade sem executar provider real.

O resultado maximo permitido e `accepted-for-design-review-only`, que nao autoriza selecao de provider, implementacao, execucao ou producao.

## Tipos mínimos de evidência

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

## Métodos de validação

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

## Campos obrigatórios por evidência

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

## Estados de evidência

- `missing`
- `draft`
- `in-review`
- `accepted-for-design-review-only`
- `blocked`
- `rejected`

Nenhum estado autoriza selecao de provider, implementacao, execucao, producao, secret produtivo, webhook produtivo, mutacao ou side effect.

## Blocking validation gaps

- Evidencia ausente ou sem arquivo fisico quando aplicavel.
- Owner minimo ausente.
- Acceptance criteria incompletos.
- Validation method ausente.
- EvidenceRefs ausentes.
- DecisionRefs ausentes.
- Security review ausente.
- Privacy/compliance review ausente.
- Contract compatibility nao provada.
- Signature/event verification incompleta.
- Replay/idempotency incompleto.
- Secret management sem rotation, revocation, redaction ou environment boundary.
- Observability/SLO sem baseline, thresholds ou incident mapping.
- Rollback/disable ausente.
- Tenant/workspace/scope safety nao provada.
- PII/sensitive data handling nao provado.
- Docs link integrity ou evidence index validation falhando.
- Isolation diff indicando alteracoes em `.github/workflows`, `release.yml`, apps, packages ou scripts.
- Dependencia de provider real, secret produtivo, webhook produtivo, mutacao, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

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

F2.22 No-Go Ledger, F2.23 Final Readiness Freeze, F2.25 Non-Implementation Boundary e F2.26 governance baseline permanecem ativos.

## Não-autorização de seleção de provider

F3.3 nao seleciona provider real. Requisitos de evidencia e metodos de validacao nao podem ser usados como decisao de selecao, procurement, contrato, configuracao ou integracao.

## Não-autorização de implementação

F3.3 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Não-autorização de execução

F3.3 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Não-autorização produtiva

F3.3 nao e autorizacao de producao. Evidence requirements e validation plan nao autorizam WhatsApp operacional, provider integrado, provider selecionado, secret produtivo, webhook produtivo, mutacoes ou side effects.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 573`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-evidence-requirements-validation-plan.md`
- `ops/evidence/latest/f3-03-provider-integration-evidence-requirements-validation-plan-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

F3.3 nao altera `.github/workflows`, `release.yml`, `apps`, `packages`, `scripts`, runtime, engine ou `ChatAgentLauncher`.

## Riscos residuais

- F3.3 nao prova operacao de provider real.
- F3.3 nao seleciona provider futuro.
- F3.3 nao substitui security review, privacy review, board approval ou decision record futuro.
- F3.3 nao cria metricas, dashboard, storage ou observability real de provider.
- Provider integration permanece `blocked`.

## Próximos passos

- Manter evidencias futuras rastreaveis por `evidenceId`.
- Usar `accepted-for-design-review-only` apenas como estado documental.
- Exigir fase futura explicita para qualquer tentativa de selecao de provider.
- Preservar F2.22, F2.23, F2.25, F2.26, F3.0, F3.1 e F3.2 como controles ativos.

## Status final

Status: proposta/parcial evidenciada documentalmente.
