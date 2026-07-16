# F4.3 — Provider Candidate Preliminary Review Packet / Reviewer Assignment — 2026-07-15

## Resumo executivo

Foi criado o Provider Candidate Preliminary Review Packet / Reviewer Assignment da F4.3 para organizar pre-read materials, reviewers obrigatorios, escopos de revisao, inputs, evidencias, checklists, review states, blocking gaps e reasonCodes para candidatos hipoteticos a provider WhatsApp em modo selection-only.

F4.3 nao autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes ou side effects. Provider integration permanece `blocked`, provider final selection permanece `not authorized`, o F4.0 Selection-Only Charter permanece ativo, o F4.1 Candidate Intake permanece a fonte do intake e a F4.2 Intake Validation Matrix permanece a fonte de validacao.

## Pré-condição F4.2

Pre-condicao comprovada antes das alteracoes:

- F4.2 mergeada em `main` no commit `49fad354999084d03e9ec91c37545b422b6e397a`.
- `origin/main` aponta para `49fad354999084d03e9ec91c37545b422b6e397a`.
- `CI Monorepo`: `completed success`, run `29532661718`.
- `IMOB Worker Mutation E2E`: `completed success`, run `29532661735`.

## Arquivos lidos

- `CODEX.md`
- `/home/jusall/.codex/attachments/51b5438c-de95-465d-a4dd-1d4f8140f2fe/pasted-text.txt`
- `IA_EIAH.md`
- `ROADMAP_UNIFICADO_v8_ATUALIZADO_2026-06-15.md`
- `AGENTS.md`
- `docs/architecture/agent-chat-runtime.md`
- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-candidate-evidence-mapping-intake-validation-matrix.md`
- `docs/ops/whatsapp-provider-candidate-intake-template-preliminary-eligibility-checklist.md`
- `docs/ops/whatsapp-provider-selection-formal-phase-opening-selection-only-charter.md`
- `docs/ops/whatsapp-provider-integration-design-only-closure-pre-selection-boundary.md`
- `ops/evidence/latest/f4-02-provider-candidate-evidence-mapping-intake-validation-matrix-2026-07-15.md`

## Problema resolvido

F4.2 definiu mapping e intake validation, mas ainda faltava um pacote padronizado para revisao preliminar e uma atribuicao explicita de reviewers por escopo. F4.3 resolve essa lacuna sem selecionar provider e sem relaxar provider integration blocked.

## Provider Candidate Preliminary Review Packet

O packet foi criado em `docs/ops/whatsapp-provider-candidate-preliminary-review-packet-reviewer-assignment.md`.

Ele organiza pre-read materials, candidate intake F4.1, validation matrix F4.2, evidence refs, reviewer assignments, blocking gaps, decision refs e declaracoes de nao-autorizacao. O packet existe apenas para revisao selection-only.

## Reviewer Assignment

O reviewer assignment define assignments por `assignmentId`, `candidateId`, `reviewerRole`, `reviewerOwner`, `reviewScope`, inputs, evidencias, checklist refs, review status, blocking gaps, decision refs e reasonCode.

Ausencia de reviewer, owner, escopo, inputs, evidencias ou checklist refs mantem o assignment `not-assigned`, `blocked` ou `deferred`.

## Required reviewers

- Security
- Privacy/Compliance, se aplicavel
- Backend/API
- Platform governance
- Product/Platform
- DocOps
- Executive sponsor, se aplicavel

## Campos obrigatórios do reviewer assignment

- `assignmentId`
- `candidateId`
- `reviewerRole`
- `reviewerOwner`
- `reviewScope`
- `requiredInputs`
- `requiredEvidenceRefs`
- `reviewChecklistRefs`
- `reviewStatus`
- `blockingGaps`
- `decisionRefs`
- `reasonCode`

## Review states

- `not-assigned`
- `assigned`
- `in-review`
- `blocked`
- `deferred`
- `accepted-for-selection-review-only`
- `rejected`

Nenhum review state autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacao ou side effect.

## Pre-read materials

- `docs/EVIDENCE_INDEX.md`
- `docs/ops/whatsapp-provider-selection-formal-phase-opening-selection-only-charter.md`
- `docs/ops/whatsapp-provider-candidate-intake-template-preliminary-eligibility-checklist.md`
- `docs/ops/whatsapp-provider-candidate-evidence-mapping-intake-validation-matrix.md`
- `docs/ops/whatsapp-provider-integration-design-only-closure-pre-selection-boundary.md`
- `ops/evidence/latest/f4-00-provider-selection-formal-phase-opening-selection-only-charter-2026-07-15.md`
- `ops/evidence/latest/f4-01-provider-candidate-intake-template-preliminary-eligibility-checklist-2026-07-15.md`
- `ops/evidence/latest/f4-02-provider-candidate-evidence-mapping-intake-validation-matrix-2026-07-15.md`
- Candidate intake record futuro, se existir.
- Required evidence refs futuras por candidato, se existirem.
- Decision refs futuras por candidato, se existirem.

## Blocking gaps

- Reviewer obrigatorio nao atribuido.
- `reviewerOwner` ausente.
- `reviewScope` ausente, ambiguo ou fora de selection-only.
- `requiredInputs` ausentes ou incompletos.
- `requiredEvidenceRefs` ausentes, inexistentes, nao fisicos ou nao indexaveis.
- `reviewChecklistRefs` ausentes ou desconectados de F4.1/F4.2.
- `reviewStatus` ausente, invalido ou tratado como selecao final.
- `blockingGaps` omitidos apesar de evidencia ausente.
- `decisionRefs` ausentes quando decisao/revisao anterior for citada.
- `reasonCode` ausente ou inconsistente.
- Security, Privacy/Compliance, Backend/API, Platform governance, Product/Platform ou DocOps sem reviewer quando requeridos.
- Executive sponsor ausente quando aplicavel.
- F4.0 Selection-Only Charter nao preservado.
- F4.1 Candidate Intake nao usado como fonte do intake.
- F4.2 Intake Validation Matrix nao usada como fonte de validacao.
- Provider final selection diferente de `not authorized`.
- Provider integration diferente de `blocked`.
- Evidence Index, docs link integrity, diff whitespace ou isolation diff falhando.
- Qualquer provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacao, `lead.create`, `lead.discard`, acao critica, provider external call, mutation external side effect ou `sideEffects != 0`.

## ReasonCodes

- `PRELIMINARY_REVIEW_PACKET_ONLY`
- `REVIEWER_ASSIGNMENT_ONLY`
- `REVIEWER_ASSIGNMENT_MISSING`
- `REVIEWER_SCOPE_INCOMPLETE`
- `REVIEW_INPUTS_MISSING`
- `REVIEW_EVIDENCE_MISSING`
- `PRELIMINARY_REVIEW_BLOCKED`
- `PRELIMINARY_REVIEW_NOT_PROVIDER_SELECTION`
- `PROVIDER_FINAL_SELECTION_NOT_AUTHORIZED`
- `PROVIDER_INTEGRATION_STILL_BLOCKED`

## Provider selection boundary

Provider final selection permanece `not authorized`. F4.3 nao seleciona provider, nao recomenda provider como final, nao aprova procurement, nao cria contrato, nao cria configuracao e nao permite interpretar preliminary review packet, reviewer assignment, review state, reviewer sign-off ou evidence refs como selecao implicita.

## Provider integration boundary

Provider integration permanece `blocked`. F4.3 nao cria provider, nao integra provider real, nao solicita ou usa secret produtivo, nao habilita webhook produtivo, nao cria endpoint publico novo, nao cria dashboard obrigatorio, nao cria storage externo obrigatorio, nao cria ledger produtivo obrigatorio, nao cria mutacoes e nao executa acao critica.

## Selection-only continuity

F4.0 Selection-Only Charter permanece ativo. F4.1 Candidate Intake permanece a fonte do intake. F4.2 Intake Validation Matrix permanece a fonte de validacao. F4.3 preserva F3.6 pre-selection boundary, F3.5 No-Go Decision Record e F2.26 governance closure.

## Não-autorização de seleção final de provider

F4.3 nao autoriza selecao final de provider. O estado `accepted-for-selection-review-only` permite somente continuidade de revisao documental selection-only.

## Não-autorização de implementação

F4.3 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Não-autorização de execução

F4.3 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Não-autorização produtiva

F4.3 nao e autorizacao de producao. Preliminary review packet, reviewer assignment, F4.2 matrix, F4.1 intake, F4.0 charter, F3.6 boundary ou F3.5 No-Go Decision Record nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Checks executados

- `pnpm check:evidence-index`: passou (`ok: true`, `refsChecked: 587`).
- `pnpm check:docs-link-integrity`: passou (`ok: true`, `filesChecked: 15`).
- `git diff --check`: passou sem saida.
- `git diff -- .github/workflows release.yml apps packages scripts`: passou sem saida.

## Prova de isolamento

Alteracoes planejadas apenas em documentacao operacional e evidencia:

- `docs/ops/whatsapp-provider-candidate-preliminary-review-packet-reviewer-assignment.md`
- `ops/evidence/latest/f4-03-provider-candidate-preliminary-review-packet-reviewer-assignment-2026-07-15.md`
- `docs/EVIDENCE_INDEX.md`

Nenhuma alteracao foi planejada em workflows, `release.yml`, apps, packages, scripts, runtime, engine ou `ChatAgentLauncher`.

`git diff -- .github/workflows release.yml apps packages scripts` nao retornou saida. Nenhuma alteracao foi feita em workflows, `release.yml`, apps, packages, scripts, runtime, engine ou `ChatAgentLauncher`.

## Riscos residuais

- F4.3 nao seleciona provider e nao valida claims de um provider real.
- Reviewer assignment depende de candidatos e evidencias futuras.
- O estado maximo permanece selection-only e documental.
- Provider integration permanece bloqueada.

## Próximos passos

- Manter provider final selection `not authorized`.
- Manter provider integration `blocked`.
- Usar F4.3 somente para organizar pre-read e reviewer assignment selection-only.
- Exigir reviewers, owners, inputs, evidence refs e checklist refs antes de qualquer estado `accepted-for-selection-review-only`.
- Bloquear provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes, acao critica e side effects.

## Status final

Status: proposta/parcial evidenciada documentalmente.
