# WhatsApp Provider Selection — Provider Candidate Preliminary Review Packet / Reviewer Assignment

## Objetivo

Este documento cria o Provider Candidate Preliminary Review Packet e o Reviewer Assignment da F4.3 para uma avaliacao futura hipotetica de candidatos a provider WhatsApp em modo selection-only.

F4.3 e um artefato documental. Ele nao autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, endpoint publico novo, mutacoes ou side effects. Provider integration permanece `blocked`, provider final selection permanece `not authorized`, o F4.0 Selection-Only Charter permanece ativo, o F4.1 Candidate Intake permanece a fonte do intake e a F4.2 Intake Validation Matrix permanece a fonte de validacao.

## Provider Candidate Preliminary Review Packet

O preliminary review packet organiza o material minimo que reviewers devem receber antes de revisar um candidato hipotetico. O pacote existe apenas para preparar revisao selection-only e nao pode ser usado como decisao de selecao, procurement, contrato, configuracao tecnica, implementacao ou operacao.

Todo packet deve conter:

- `candidateId` do intake F4.1.
- Intake completo ou status `incomplete`/`blocked` quando houver lacunas.
- Evidence mapping F4.2 aplicavel ao candidato.
- Intake Validation Matrix F4.2 aplicavel as categorias revisadas.
- Reviewer Assignment completo.
- Required evidence refs fisicas/indexaveis.
- Review checklist refs por categoria.
- Blocking gaps atuais.
- Decision refs, quando existirem.
- Declaracao de nao-autorizacao de selecao final, implementacao, execucao e producao.

## Reviewer Assignment

O reviewer assignment define quem deve revisar cada escopo e quais inputs/evidencias sao obrigatorios. Ausencia de reviewer, owner, escopo, inputs ou evidencia mantem o review em `not-assigned`, `blocked` ou `deferred`.

```yaml
assignmentId: F4-REV-YYYY-NNN
candidateId: F4-CAND-YYYY-NNN
reviewerRole: Security|Privacy/Compliance|Backend/API|Platform governance|Product/Platform|DocOps|Executive sponsor
reviewerOwner: TBD
reviewScope: selection-only
requiredInputs: []
requiredEvidenceRefs: []
reviewChecklistRefs: []
reviewStatus: not-assigned|assigned|in-review|blocked|deferred|accepted-for-selection-review-only|rejected
blockingGaps: []
decisionRefs: []
reasonCode: REVIEWER_ASSIGNMENT_MISSING
```

## Required reviewers

| Reviewer | Required scope | Required inputs | Default status | Blocking reason |
| --- | --- | --- | --- | --- |
| Security | Signature verification, replay/idempotency, secret boundary, fail-closed posture and security contact. | F4.1 security fields; F4.2 security/replay/secret rows; security evidence refs. | `not-assigned` | Security reviewer, inputs or evidence missing. |
| Privacy/Compliance, se aplicavel | Jurisdiction, data residency, PII handling, compliance claims and sensitive data boundary. | F4.1 privacy fields; F4.2 privacy/PII rows; privacy/compliance evidence refs. | `not-assigned` | Privacy/compliance review required but missing. |
| Backend/API | Supported APIs, webhook/event model, contract compatibility, tenant/workspace/scope and sideEffects=0 boundary. | F4.1 API/webhook/scope fields; F4.2 contract/webhook/scope rows. | `not-assigned` | Backend/API reviewer, contract inputs or scope evidence missing. |
| Platform governance | Selection-only continuity, provider integration boundary, decision refs and governance gates. | F4.0 charter; F4.2 matrix; evidence refs; decision refs. | `not-assigned` | Governance reviewer or boundary confirmation missing. |
| Product/Platform | Candidate identity, provider type, commercial/cost context, limitations and intake ownership. | F4.1 candidate identity/commercial fields; known limitations; intake owner. | `not-assigned` | Product owner, intake owner or commercial context missing. |
| DocOps | Evidence Index, physical evidence refs, docs link integrity and isolation proof. | `docs/EVIDENCE_INDEX.md`; required evidence refs; docs/check outputs. | `not-assigned` | Evidence refs, index validation or docs link integrity missing. |
| Executive sponsor, se aplicavel | Decision framing for future review only and escalation constraints. | Summary packet; risk posture; governance boundary statement. | `not-assigned` | Sponsor required by scope but missing. |

## Campos obrigatorios do reviewer assignment

Todo reviewer assignment deve conter:

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

Assignment sem qualquer campo obrigatorio deve permanecer `blocked` ou `not-assigned`.

## Review states

- `not-assigned`: reviewer obrigatorio ainda nao nomeado.
- `assigned`: reviewer nomeado, mas revisao ainda nao iniciada.
- `in-review`: reviewer iniciou revisao documental selection-only.
- `blocked`: faltam inputs, evidencias, escopo, owner, checklist ou boundary preservado.
- `deferred`: revisao postergada sem liberar selecao final, implementacao, execucao ou producao.
- `accepted-for-selection-review-only`: material aceito apenas para continuidade de revisao selection-only.
- `rejected`: material rejeitado documentalmente, sem selecao ou execucao.

Nenhum review state autoriza selecao final de provider, implementacao, execucao, producao, provider real, secret produtivo, webhook produtivo, mutacao ou side effect.

## Pre-read materials

Todo preliminary review packet deve incluir, no minimo:

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

Pre-read ausente, inexistente, nao indexavel ou com referencia a provider real, secret produtivo, webhook produtivo, mutacao ou side effect mantem a revisao `blocked`.

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
- Security, privacy/compliance, Backend/API, Platform governance, Product/Platform ou DocOps sem reviewer quando requeridos.
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

F4.0 Selection-Only Charter permanece ativo. F4.1 Candidate Intake permanece a fonte do intake. F4.2 Intake Validation Matrix permanece a fonte de validacao. F4.3 apenas adiciona o packet de pre-read e o assignment de reviewers para revisao selection-only, preservando F3.6 pre-selection boundary, F3.5 No-Go Decision Record e F2.26 governance closure.

## Nao-autorizacao de selecao final de provider

F4.3 nao autoriza selecao final de provider. O estado `accepted-for-selection-review-only` permite somente continuidade de revisao documental selection-only.

## Nao-autorizacao de implementacao

F4.3 nao autoriza implementacao de provider, webhook, secret, endpoint, dashboard, storage, ledger, mutacao, lead action, acao critica, runtime, engine, launcher, workflow, app, package ou script.

## Nao-autorizacao de execucao

F4.3 nao autoriza execucao, configuracao, teste com provider real, provider external call, mutation external side effect, uso de secret produtivo, webhook produtivo, mutacao, lead action, acao critica ou `sideEffects != 0`.

## Nao-autorizacao produtiva

F4.3 nao e autorizacao de producao. Preliminary review packet, reviewer assignment, F4.2 matrix, F4.1 intake, F4.0 charter, F3.6 boundary ou F3.5 No-Go Decision Record nao podem ser tratados como permissao para operar WhatsApp, selecionar provider final, integrar provider, provisionar secret produtivo, habilitar webhook produtivo ou executar mutacoes.

## Status final

Status: proposta/parcial evidenciada documentalmente.
