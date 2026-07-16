# F4.2 — Provider Candidate Evidence Mapping / Intake Validation Matrix — 2026-07-15

## Resumo executivo

Foi criado o Provider Candidate Evidence Mapping / Intake Validation Matrix da F4.2 para mapear campos e categorias do intake F4.1 a evidencias, metodos de validacao, owners, reviewers, criterios de aceite, status, gaps bloqueantes e reasonCodes.

F4.2 nao autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes ou side effects. Provider integration permanece `blocked`, provider final selection permanece `not authorized`, o F4.0 Selection-Only Charter permanece ativo e o F4.1 Candidate Intake permanece a fonte de intake.

## Pré-condição F4.1

Pre-condicao comprovada antes das alteracoes:

- F4.1 mergeada em `main` no commit `96e291f7663e6a71606b6d75da0e0a24a34b4fed`.
- `origin/main` aponta para `96e291f7663e6a71606b6d75da0e0a24a34b4fed`.
- `CI Monorepo`: `completed success`, run `29531716889`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29531716914`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/a23d1a31-2dd7-444f-b1e5-20d96b6fe909/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-candidate-intake-template-preliminary-eligibility-checklist.md`
- `docs/ops/whatsapp-provider-selection-formal-phase-opening-selection-only-charter.md`
- `docs/ops/whatsapp-provider-integration-design-only-closure-pre-selection-boundary.md`
- `docs/ops/whatsapp-provider-integration-review-outcome-template-no-go-decision-record.md`
- `ops/evidence/latest/f4-01-provider-candidate-intake-template-preliminary-eligibility-checklist-2026-07-15.md`

## Problema resolvido

F4.1 definiu o intake template e o preliminary eligibility checklist, mas ainda faltava uma matriz explicita que conectasse cada campo e categoria do intake a evidencias, metodos de validacao, owners, reviewers, criterios de aceite, status, gaps e reasonCodes.

F4.2 resolve essa lacuna sem selecionar provider e sem relaxar provider integration blocked.

## Provider Candidate Evidence Mapping

O mapping foi criado em `docs/ops/whatsapp-provider-candidate-evidence-mapping-intake-validation-matrix.md`.

Ele mapeia os campos F4.1 `candidateId`, `providerName`, `providerType`, `officialWebsite`, `jurisdiction`, contatos, capacidades, security, replay, idempotencia, secret management, privacy/PII, compliance, SLO, rollback, observability, tenant/workspace/scope, limitations, evidence refs, owner e status para evidencias e criterios de validacao.

## Intake Validation Matrix

A matriz transforma as categorias F4.1 em criterios de validacao selection-only:

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

## Campos obrigatórios da matriz

- `mappingId`
- `candidateField`
- `category`
- `requiredEvidence`
- `validationMethod`
- `owner`
- `reviewer`
- `acceptanceCriteria`
- `status`
- `blockingGap`
- `evidenceRefs`
- `decisionRefs`
- `reasonCode`

Linha sem qualquer campo obrigatorio deve permanecer `blocked` ou `missing-evidence`.

## Validation methods

- `document review`
- `security review`
- `privacy/compliance review`
- `contract review`
- `rollback review`
- `observability review`
- `tenant/workspace/scope review`
- `evidence index validation`
- `docs link integrity validation`
- `isolation diff validation`

## Status de validação

- `not-mapped`
- `missing-evidence`
- `in-review`
- `blocked`
- `accepted-for-selection-review-only`
- `rejected`

Nenhum status autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacao ou side effect.

## Blocking gaps

- Mapping inexistente ou incompleto.
- Evidencia requerida ausente, inexistente, nao fisica ou nao indexavel.
- Owner ou reviewer ausente.
- Acceptance criteria ausentes, ambiguos ou fora de selection-only.
- `evidenceRefs` ou `decisionRefs` ausentes quando requeridos.
- `reasonCode` ausente ou inconsistente.
- Status ausente, invalido ou tratado como selecao final.
- Security, privacy/compliance, contract, rollback, observability, tenant/workspace/scope ou PII safety nao comprovados.
- Evidence Index, docs link integrity, diff whitespace ou isolation diff falhando.
- Qualquer provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, `lead.create`, `lead.discard`, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## ReasonCodes

- `CANDIDATE_EVIDENCE_MAPPING_ONLY`
- `INTAKE_VALIDATION_MATRIX_ONLY`
- `CANDIDATE_EVIDENCE_MAPPING_INCOMPLETE`
- `INTAKE_VALIDATION_EVIDENCE_MISSING`
- `INTAKE_VALIDATION_OWNER_MISSING`
- `INTAKE_VALIDATION_CRITERIA_INCOMPLETE`
- `INTAKE_VALIDATION_BLOCKED`
- `INTAKE_VALIDATION_NOT_PROVIDER_SELECTION`
- `PROVIDER_FINAL_SELECTION_NOT_AUTHORIZED`
- `PROVIDER_INTEGRATION_STILL_BLOCKED`

## Provider selection boundary

Provider final selection permanece `not authorized`. F4.2 nao seleciona provider, nao recomenda provider como final, nao aprova procurement, nao cria contrato, nao cria configuracao e nao permite interpretar mapping, matriz, status ou evidencias como selecao implicita.

## Provider integration boundary

Provider integration permanece `blocked`. F4.2 nao cria provider, nao integra provider real, nao solicita ou usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Selection-only continuity

F4.0 Selection-Only Charter permanece ativo. F4.1 Candidate Intake permanece a fonte para campos e categorias da matriz. F4.2 preserva F3.6 pre-selection boundary, F3.5 No-Go Decision Record e F2.26 governance closure.

## Não-autorização de seleção final de provider

F4.2 nao autoriza selecao final de provider. O status maximo `accepted-for-selection-review-only` permite somente continuidade de revisao documental selection-only.

## Não-autorização de implementação

F4.2 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Não-autorização de execução

F4.2 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Não-autorização produtiva

F4.2 nao e autorizacao de producao. Evidence mapping, intake validation matrix, F4.1 intake, F4.0 charter, F3.6 boundary ou F3.5 No-Go Decision Record nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Checks executados

- `pnpm check:evidence-index`: passou (`ok: true`, `refsChecked: 585`).
- `pnpm check:docs-link-integrity`: passou (`ok: true`, `filesChecked: 15`).
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Alteracoes planejadas apenas em documentacao operacional e evidencia:

- `docs/ops/whatsapp-provider-candidate-evidence-mapping-intake-validation-matrix.md`
- `ops/evidence/latest/f4-02-provider-candidate-evidence-mapping-intake-validation-matrix-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

Nenhuma alteracao foi planejada em workflows, `release.yml`, apps, packages, scripts, runtime, engine ou `ChatAgentLauncher`.

`git diff -- .github/workflows release.yml apps packages scripts` nao retornou saida. Nenhuma alteracao foi feita em workflows, `release.yml`, apps, packages, scripts, runtime, engine ou `ChatAgentLauncher`.

## Riscos residuais

- F4.2 nao seleciona provider e nao valida claims de um provider real.
- A matriz depende de evidencias futuras por candidato.
- O estado maximo permanece selection-only e documental.
- Provider integration permanece bloqueada.

## Próximos passos

- Manter provider final selection `not authorized`.
- Manter provider integration `blocked`.
- Usar F4.2 somente para mapear evidencias e validar intake selection-only.
- Exigir evidencias fisicas/indexaveis, owners, reviewers e criteria antes de qualquer status `accepted-for-selection-review-only`.
- Bloquear provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes, acao critica e side effects.

## Status final

Status: proposta/parcial evidenciada documentalmente.
