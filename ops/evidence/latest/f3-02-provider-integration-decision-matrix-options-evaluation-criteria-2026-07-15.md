# F3.2 — Provider Integration Decision Matrix / Options Evaluation Criteria — 2026-07-15

## Resumo executivo

Foi criada a Decision Matrix / Options Evaluation Criteria da F3.2 para avaliar opcoes futuras hipoteticas de provider WhatsApp em modo estritamente design-only.

F3.2 nao autoriza selecao de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacoes ou side effects. Provider integration permanece `blocked` e o Design-Only Charter F3.0 permanece ativo.

## Pré-condição F3.1

Pre-condicao comprovada antes das alteracoes:

- F3.1 mergeada em `main` no commit `003461a04ede2eff33d78ec38bba1b764ff70060`.
- `origin/main` aponta para `003461a04ede2eff33d78ec38bba1b764ff70060`.
- `CI Monorepo`: `completed success`, run `29517576413`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29517576410`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/9dbf9054-99a9-418e-815f-545984303a05/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-integration-design-questions-register-decision-log.md`
- `docs/ops/whatsapp-provider-integration-formal-phase-opening-design-only-charter.md`
- `docs/ops/whatsapp-provider-integration-governance-closure-end-of-track-summary.md`
- `docs/ops/whatsapp-provider-integration-stop-line-final-readiness-freeze.md`
- `ops/evidence/latest/f3-01-provider-integration-design-questions-register-decision-log-2026-07-15.md`

## Problema resolvido

F3.1 organizou perguntas e decisoes documentais, mas ainda faltava uma matriz para avaliar opcoes futuras de forma comparavel sem selecionar provider.

F3.2 resolve essa lacuna criando categorias, campos obrigatorios, decision states, gates bloqueantes e reasonCodes para avaliacao documental de opcoes.

## Decision Matrix

A matriz foi criada em `docs/ops/whatsapp-provider-integration-decision-matrix-options-evaluation-criteria.md`.

Ela registra opcoes hipoteticas por categoria e define evaluation status, decision state, owner minimo, evidencia requerida e criterios bloqueantes. Todas as opcoes iniciais permanecem `not-evaluated` e `blocked` ou `deferred`, sem selecao de provider.

## Options Evaluation Criteria

Os criterios exigem evidencia indexavel, owners, riscos, mitigacoes, blockers, security/privacy/rollback/observability/contract compatibility e preservacao do provider integration boundary.

O resultado maximo permitido em F3.2 e `eligible-for-design-review-only`, que nao autoriza selecao, implementacao, execucao ou producao.

## Categorias mínimas

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

## Campos obrigatórios por opção

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

- `not-evaluated`
- `in-review`
- `blocked`
- `deferred`
- `eligible-for-design-review-only`
- `rejected`

Nenhum estado autoriza selecao de provider, implementacao, execucao, producao, secret produtivo, webhook produtivo, mutacao ou side effect.

## Gates bloqueantes

- Security criteria nao atendidos.
- Privacy/compliance criteria nao atendidos.
- Contract compatibility nao provada.
- Event verification real nao especificada em modo fail-closed.
- Replay/idempotency nao provado.
- Secret management sem rotation, revocation, redaction ou boundary.
- Observability/SLO sem baseline, thresholds ou incident mapping.
- Rollback/disable ausente.
- Tenant/workspace/scope safety nao provada.
- PII/sensitive data handling nao provado.
- Owner ou approval minimo ausente.
- DecisionRefs ausentes.
- Necessidade de provider real, secret produtivo, webhook produtivo, mutacao, acao critica ou side effect.
- Necessidade de alterar `ChatAgentLauncher`, runtime, engine, workflows, `release.yml`, apps, packages ou scripts sem fase autorizada.

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

F2.22 No-Go Ledger, F2.23 Final Readiness Freeze, F2.25 Non-Implementation Boundary e F2.26 governance baseline permanecem ativos.

## Não-autorização de seleção de provider

F3.2 nao seleciona provider real. Opcoes listadas sao criterios hipoteticos de avaliacao, nao decisao de selecao, procurement, contrato, configuracao ou integracao.

## Não-autorização de implementação

F3.2 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Não-autorização de execução

F3.2 nao autoriza execucao, integracao, configuracao, teste com provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, lead action, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## Não-autorização produtiva

F3.2 nao e autorizacao de producao. A matriz e os criterios de avaliacao nao autorizam WhatsApp operacional, provider integrado, provider selecionado, secret produtivo, webhook produtivo, mutacoes ou side effects.

## Checks executados

- `pnpm check:evidence-index`: passou.
  - `ok: true`
  - `refsChecked: 571`
- `pnpm check:docs-link-integrity`: passou.
  - `ok: true`
  - `filesChecked: 15`
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Escopo documental restrito aos arquivos esperados:

- `docs/ops/whatsapp-provider-integration-decision-matrix-options-evaluation-criteria.md`
- `ops/evidence/latest/f3-02-provider-integration-decision-matrix-options-evaluation-criteria-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

F3.2 nao altera `.github/workflows`, `release.yml`, `apps`, `packages`, `scripts`, runtime, engine ou `ChatAgentLauncher`.

## Riscos residuais

- F3.2 nao prova operacao de provider real.
- F3.2 nao seleciona provider futuro.
- F3.2 nao substitui security review, privacy review, board approval ou decision record futuro.
- F3.2 nao cria metricas ou observability real de provider.
- Provider integration permanece `blocked`.

## Próximos passos

- Manter opcoes futuras rastreaveis por `optionId`.
- Usar `eligible-for-design-review-only` apenas como estado documental.
- Exigir fase futura explicita para qualquer tentativa de selecao de provider.
- Preservar F2.22, F2.23, F2.25, F2.26, F3.0 e F3.1 como controles ativos.

## Status final

Status: proposta/parcial evidenciada documentalmente.
